"""
permissions/management/commands/fix_module_catalog_duplicates.py

Repairs duplicate Module / ModulePage catalog rows left over by the tenant-
scoping bug fixed in pages.models.Module.save() / ModulePage.save() and the
tenant=None lookups in permissions/setup_views.py + permissions/services.py.

Module and ModulePage are meant to be a single global catalog (tenant=None).
Before the fix, every tenant admin who opened the Permission Setup page (which
runs a sync automatically on load) would silently create their OWN separate
Module/ModulePage row stamped with their own tenant instead of finding/
reusing the shared global one — leaving one duplicate row per code per tenant
that ever ran a sync. Any RolePermissionPolicy / UserPermissionOverride /
Thread saved against one tenant's duplicate is now stuck pointing at a row
resolve_bulk_matrix() can never see (it only reads tenant=None rows), which
is why a page can still be missing for a role even after being granted.

This command finds those duplicate groups (same `code`, more than one row)
and merges every duplicate into one canonical row per group:

  1. Canonical = the non-deleted row with tenant IS NULL if one exists,
     else the oldest (lowest id) non-deleted row, else the oldest row
     overall.
  2. Every RolePermissionPolicy / UserPermissionOverride / Thread pointing
     at a non-canonical row is repointed to the canonical row first — no
     permission grants or discussion threads are lost.
  3. Non-canonical rows are then hard-deleted. Soft-delete is NOT enough:
     the (module, code) / (owner, branch, code) unique index is a real DB
     constraint that a soft-deleted row still occupies, which is exactly
     what silently blocks Permission Setup's sync step from creating (or
     finding) a clean replacement row.
  4. The canonical row is re-saved to guarantee tenant=None and
     is_deleted=False.

Read-only by default. Pass --fix to apply.

Usage:
    python manage.py fix_module_catalog_duplicates                # report only, all modules
    python manage.py fix_module_catalog_duplicates --code loans   # scope to one module code
    python manage.py fix_module_catalog_duplicates --fix          # apply the merge
"""

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


def _pick_canonical(rows):
    """Prefer a non-deleted, tenant=None row; fall back to oldest id."""
    alive = [r for r in rows if not r.is_deleted]
    pool = alive if alive else rows
    null_tenant = [r for r in pool if r.tenant_id is None]
    candidates = null_tenant if null_tenant else pool
    return min(candidates, key=lambda r: r.id)


class Command(BaseCommand):
    help = (
        "Find (and optionally merge) duplicate Module/ModulePage catalog rows "
        "created by the pre-fix tenant-scoping bug in Permission Setup sync."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--code', type=str, default=None,
            help='Limit to a single Module code (e.g. "loans"). Default: check all modules.',
        )
        parser.add_argument(
            '--fix', action='store_true',
            help='Actually merge duplicates (default is report-only).',
        )

    def handle(self, *args, **options):
        from pages.models import Module, ModulePage
        from permissions.models import RolePermissionPolicy, UserPermissionOverride
        from threads.models import Thread

        code_filter = options['code']
        do_fix = options['fix']

        self.stdout.write(
            "Module catalog duplicate check"
            + (" — applying fixes" if do_fix else " (read-only — no changes made)")
        )
        self.stdout.write("=" * 70)

        modules_qs = Module.all_objects.all_tenants()
        if code_filter:
            modules_qs = modules_qs.filter(code=code_filter)

        by_code = {}
        for m in modules_qs.order_by('id'):
            by_code.setdefault(m.code, []).append(m)

        dup_module_groups = {code: rows for code, rows in by_code.items() if len(rows) > 1}

        if not dup_module_groups:
            self.stdout.write(self.style.SUCCESS("No duplicate Module rows found."))
            return

        self.stdout.write(f"Module codes with duplicates: {len(dup_module_groups)}")

        totals = {'modules': 0, 'pages': 0, 'policies': 0, 'overrides': 0, 'threads': 0}

        for code, modules in dup_module_groups.items():
            canonical_module = _pick_canonical(modules)
            dup_modules = [m for m in modules if m.id != canonical_module.id]

            self.stdout.write(
                f"\n--- Module '{code}' — {len(modules)} rows "
                f"(canonical id={canonical_module.id}, tenant={canonical_module.tenant_id}, "
                f"deleted={canonical_module.is_deleted}) ---"
            )
            for m in modules:
                marker = "KEEP" if m.id == canonical_module.id else "MERGE→delete"
                self.stdout.write(
                    f"  id={m.id:<6} tenant={str(m.tenant_id):<6} deleted={m.is_deleted!s:<5} {marker}"
                )

            module_ids = [m.id for m in modules]
            pages_qs = (
                ModulePage.all_objects.all_tenants()
                .filter(module_id__in=module_ids)
                .order_by('id')
            )
            pages_by_code = {}
            for p in pages_qs:
                pages_by_code.setdefault(p.code, []).append(p)

            page_merge_plan = []  # (canonical_page, dup_pages)
            for page_code, pages in pages_by_code.items():
                canonical_page = _pick_canonical(pages)
                dup_pages = [p for p in pages if p.id != canonical_page.id]
                if not dup_pages:
                    continue
                page_merge_plan.append((page_code, canonical_page, dup_pages))

                dup_page_ids = [p.id for p in dup_pages]
                policy_count = RolePermissionPolicy.objects.filter(page_id__in=dup_page_ids).count()
                override_count = UserPermissionOverride.objects.filter(page_id__in=dup_page_ids).count()
                thread_count = Thread.all_objects.all_tenants().filter(page_id__in=dup_page_ids).count()
                self.stdout.write(
                    f"    page '{page_code}': {len(pages)} rows, canonical id={canonical_page.id} — "
                    f"repoint {policy_count} policy row(s), {override_count} override(s), "
                    f"{thread_count} thread(s), then delete {len(dup_pages)} duplicate page row(s)"
                )

            dup_module_ids = [m.id for m in dup_modules]
            mod_policy_count = RolePermissionPolicy.objects.filter(module_id__in=dup_module_ids).count()
            mod_override_count = UserPermissionOverride.objects.filter(module_id__in=dup_module_ids).count()
            if mod_policy_count or mod_override_count:
                self.stdout.write(
                    f"    module-level: repoint {mod_policy_count} policy row(s), "
                    f"{mod_override_count} override(s) still pointing at duplicate module rows"
                )

            if not do_fix:
                continue

            with db_transaction.atomic():
                for page_code, canonical_page, dup_pages in page_merge_plan:
                    dup_page_ids = [p.id for p in dup_pages]

                    n1 = RolePermissionPolicy.objects.filter(page_id__in=dup_page_ids).update(
                        page=canonical_page, module=canonical_module
                    )
                    n2 = UserPermissionOverride.objects.filter(page_id__in=dup_page_ids).update(
                        page=canonical_page, module=canonical_module
                    )
                    n3 = Thread.all_objects.all_tenants().filter(page_id__in=dup_page_ids).update(
                        page=canonical_page
                    )
                    ModulePage.all_objects.all_tenants().filter(parent_page_id__in=dup_page_ids).update(
                        parent_page=canonical_page
                    )

                    canonical_page.module = canonical_module
                    canonical_page.is_deleted = False
                    canonical_page.save()

                    ModulePage.all_objects.all_tenants().filter(id__in=dup_page_ids).hard_delete()

                    totals['policies'] += n1
                    totals['overrides'] += n2
                    totals['threads'] += n3
                    totals['pages'] += len(dup_pages)

                if dup_module_ids:
                    n4 = RolePermissionPolicy.objects.filter(module_id__in=dup_module_ids).update(
                        module=canonical_module
                    )
                    n5 = UserPermissionOverride.objects.filter(module_id__in=dup_module_ids).update(
                        module=canonical_module
                    )
                    canonical_module.tenant = None
                    canonical_module.is_deleted = False
                    canonical_module.save()

                    Module.all_objects.all_tenants().filter(id__in=dup_module_ids).hard_delete()

                    totals['policies'] += n4
                    totals['overrides'] += n5
                    totals['modules'] += len(dup_modules)

        self.stdout.write("\n" + "=" * 70)
        if do_fix:
            self.stdout.write(self.style.SUCCESS(
                f"Merge complete.\n"
                f"  Duplicate Module rows removed     : {totals['modules']}\n"
                f"  Duplicate ModulePage rows removed : {totals['pages']}\n"
                f"  RolePermissionPolicy repointed     : {totals['policies']}\n"
                f"  UserPermissionOverride repointed   : {totals['overrides']}\n"
                f"  Thread rows repointed              : {totals['threads']}\n"
            ))
        else:
            self.stdout.write(self.style.WARNING(
                "\nReport-only — re-run with --fix to apply the merge above."
            ))
