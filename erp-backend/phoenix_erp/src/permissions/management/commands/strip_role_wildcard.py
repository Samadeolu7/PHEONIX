"""
Backfill explicit RolePermissionPolicy grants for a role, then optionally
strip the '*' wildcard from Role.permission_codes.

Why this exists
----------------
PermissionResolver._is_wildcard() treats any role whose permission_codes
contains '*' as a full bypass: it grants everything and never consults
RolePermissionPolicy at all. That means Permission Setup UI changes for a
wildcard role (e.g. denying a specific approval action) have zero effect —
the role was never actually reading that configuration.

Removing '*' directly is NOT safe on its own. _resolve_role_baseline()'s
fallback behaviour depends on whether the role has ANY RolePermissionPolicy
rows at all:
  - Zero rows  -> _legacy_mode_baseline(): view/create/edit/delete=True,
    approve/export=False, everywhere. Reasonably safe default.
  - One or more rows (e.g. from migrate_bank_transfer_policies.py) -> for
    every OTHER page with no explicit row, the "role has policies for other
    pages but none for this one" branch denies everything. Removing '*' on a
    role that already has a few scattered policy rows would silently lock it
    out of most of the app, not just the intended approval action.

This command neutralizes that trap by explicitly creating the safe
(view/create/edit/delete=True, approve/export=False) row for every
module/page the role doesn't already have a specific grant for, BEFORE the
wildcard is removed — so behaviour for everything not already configured
stays exactly as it was, and only the wildcard's "silently ignores
RolePermissionPolicy" behaviour goes away. can_approve is deliberately left
False by default; grant it back per-page via the Permission Setup UI for
whichever pages this role should legitimately be able to approve on.

Usage
-----
    # Step 1 — always run this first and read it carefully.
    python manage.py strip_role_wildcard "Branch Manager" --dry-run

    # Step 2 — create the backfill rows (permission_codes untouched so far).
    python manage.py strip_role_wildcard "Branch Manager" --backfill-only

    # Step 3 — after reviewing/adjusting grants via Permission Setup if
    # needed, remove the wildcard itself.
    python manage.py strip_role_wildcard "Branch Manager" --remove-wildcard

Steps 2 and 3 can be combined in one run (--backfill-only --remove-wildcard),
but running them separately with a review pass in between is safer for a
live system.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backfill RolePermissionPolicy grants and remove the '*' wildcard from a role's permission_codes"

    def add_arguments(self, parser):
        parser.add_argument('role_name', help='Role name, e.g. "Branch Manager" (matches by icontains)')
        parser.add_argument('--dry-run', action='store_true', help='Preview without writing anything')
        parser.add_argument('--backfill-only', action='store_true',
                             help='Create missing RolePermissionPolicy rows. Does not touch permission_codes.')
        parser.add_argument('--remove-wildcard', action='store_true',
                             help="Remove '*' from permission_codes. Run --backfill-only first and review.")
        parser.add_argument('--tenant-id', type=int, default=None)

    def handle(self, *args, **options):
        from users.models import Role
        from pages.models import ModulePage
        from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH

        dry_run = options['dry_run']
        backfill_only = options['backfill_only']
        remove_wildcard = options['remove_wildcard']

        if not dry_run and not backfill_only and not remove_wildcard:
            self.stderr.write('Specify at least one of --dry-run, --backfill-only, --remove-wildcard.')
            return

        roles_qs = Role.objects.filter(name__icontains=options['role_name'], is_active=True)
        if options['tenant_id']:
            roles_qs = roles_qs.filter(tenant_id=options['tenant_id'])

        if not roles_qs.exists():
            self.stderr.write(f'No active role matching {options["role_name"]!r}')
            return

        pages = list(ModulePage.objects.select_related('module').all())
        if not pages:
            self.stderr.write('No ModulePage records found at all — is Permission Setup seeded?')
            return

        for role in roles_qs:
            self.stdout.write(f'\n=== {role.name} (pk={role.pk}, tenant={role.tenant_id}) ===')
            if '*' not in (role.permission_codes or []):
                self.stdout.write('  permission_codes has no "*" — nothing to do for this role.')
                continue

            existing_page_grants = set(
                RolePermissionPolicy.objects.filter(role=role, page__isnull=False)
                .values_list('module_id', 'page_id')
            )
            existing_module_grants = set(
                RolePermissionPolicy.objects.filter(role=role, page__isnull=True, module__isnull=False)
                .values_list('module_id', flat=True)
            )

            to_create = []
            for mp in pages:
                if (mp.module_id, mp.id) in existing_page_grants:
                    continue
                if mp.module_id in existing_module_grants:
                    continue  # a module-level policy already covers this page
                to_create.append(mp)

            prefix = '[DRY RUN] ' if dry_run else ''
            for mp in to_create:
                self.stdout.write(
                    f'  {prefix}+ {mp.module.code}:{mp.code} -> '
                    f'view/create/edit/delete=True, approve/export=False'
                )
                if backfill_only and not dry_run:
                    RolePermissionPolicy.objects.create(
                        role=role, module=mp.module, page=mp, action=None,
                        can_view=True, can_create=True, can_edit=True, can_delete=True,
                        can_approve=False, can_export=False,
                        scope=role.default_scope or SCOPE_OWN_BRANCH,
                        approval_limit=None,
                    )

            action_word = 'Would backfill' if (dry_run or not backfill_only) else 'Backfilled'
            self.stdout.write(f'  {action_word} {len(to_create)} page(s).')

            if remove_wildcard:
                if dry_run:
                    self.stdout.write('  [DRY RUN] Would remove "*" from permission_codes.')
                else:
                    role.permission_codes = [c for c in (role.permission_codes or []) if c != '*']
                    role.save(update_fields=['permission_codes'])
                    self.stdout.write(f'  Removed "*". permission_codes is now: {role.permission_codes}')
