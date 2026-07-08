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
module/page the role doesn't already have a specific grant for. can_approve
is deliberately left False by default; grant it back per-page via the
Permission Setup UI for whichever pages this role should legitimately be
able to approve on.

RESTRICTED_PAGES (users:roles, users:staff-users,
permissions:role-permission-policies, permissions:user-permission-overrides,
pages:pages, tenants:tenants) get view-only instead of the normal
view/create/edit/delete=True default — granting edit/delete there would let a
role modify its own permissions or reassign roles to itself, defeating the
whole point of removing the wildcard.

IMPORTANT — backfill and wildcard removal are atomic together
----------------------------------------------------------------
--remove-wildcard ALWAYS runs the backfill first, in the same database
transaction, regardless of whether --backfill-only was also passed or
whether a previous run already backfilled some pages. There is no way to
remove '*' from a role's permission_codes without the missing-page backfill
having just been (re-)verified complete in that same call. An earlier
version of this command required the two steps to be run separately, which
allowed '*' to be removed while pages were still missing their fallback
grant — silently denying that role access to those pages entirely. Never
recreate that gap: always compute+create missing rows immediately before
touching permission_codes, in the same transaction.

Usage
-----
    # Preview only — nothing is written.
    python manage.py strip_role_wildcard "Branch Manager" --dry-run

    # Create backfill rows only. Does not touch permission_codes. Useful to
    # review grants via Permission Setup before removing the wildcard.
    python manage.py strip_role_wildcard "Branch Manager" --backfill-only

    # Backfill (idempotent — only creates what's still missing) AND remove
    # the wildcard, atomically.
    python manage.py strip_role_wildcard "Branch Manager" --remove-wildcard
"""
from django.core.management.base import BaseCommand
from django.db import transaction

# Administrative/meta pages that control who-can-do-what itself. Granting the
# normal view/create/edit/delete=True default here would let a role edit its
# own (or any other role's) RolePermissionPolicy rows, reassign user roles, or
# re-add '*' to its own permission_codes — a privilege-escalation path that
# defeats the entire point of removing the wildcard. These get view-only
# instead: can_view=True, everything else False.
RESTRICTED_PAGES = {
    ('users', 'roles'),
    ('users', 'staff-users'),
    ('permissions', 'role-permission-policies'),
    ('permissions', 'user-permission-overrides'),
    ('pages', 'pages'),
    ('tenants', 'tenants'),
}


class Command(BaseCommand):
    help = "Backfill RolePermissionPolicy grants and remove the '*' wildcard from a role's permission_codes"

    def add_arguments(self, parser):
        parser.add_argument('role_name', help='Role name, e.g. "Branch Manager" (matches by icontains)')
        parser.add_argument('--dry-run', action='store_true', help='Preview without writing anything')
        parser.add_argument('--backfill-only', action='store_true',
                             help='Create missing RolePermissionPolicy rows. Does not touch permission_codes.')
        parser.add_argument('--remove-wildcard', action='store_true',
                             help="Backfill (if needed) and remove '*' from permission_codes, atomically.")
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

            with transaction.atomic():
                # Missing-page backfill always runs (unless pure --dry-run),
                # independent of whether '*' is still present — this is what
                # keeps --remove-wildcard safe even if a previous run already
                # backfilled some pages, or if backfilling was never run at all.
                existing_page_grants = set(
                    RolePermissionPolicy.objects.filter(role=role, page__isnull=False)
                    .values_list('module_id', 'page_id')
                )
                existing_module_grants = set(
                    RolePermissionPolicy.objects.filter(role=role, page__isnull=True, module__isnull=False)
                    .values_list('module_id', flat=True)
                )

                to_create = [
                    mp for mp in pages
                    if (mp.module_id, mp.id) not in existing_page_grants
                    and mp.module_id not in existing_module_grants
                ]

                prefix = '[DRY RUN] ' if dry_run else ''
                will_write = (backfill_only or remove_wildcard) and not dry_run
                for mp in to_create:
                    restricted = (mp.module.code, mp.code) in RESTRICTED_PAGES
                    if restricted:
                        flags = dict(can_view=True, can_create=False, can_edit=False,
                                     can_delete=False, can_approve=False, can_export=False)
                        label = 'view=True, everything else False (admin/meta page)'
                    else:
                        flags = dict(can_view=True, can_create=True, can_edit=True,
                                     can_delete=True, can_approve=False, can_export=False)
                        label = 'view/create/edit/delete=True, approve/export=False'
                    self.stdout.write(f'  {prefix}+ {mp.module.code}:{mp.code} -> {label}')
                    if will_write:
                        RolePermissionPolicy.objects.create(
                            role=role, module=mp.module, page=mp, action=None,
                            **flags,
                            scope=role.default_scope or SCOPE_OWN_BRANCH,
                            approval_limit=None,
                        )

                action_word = 'Would backfill' if (dry_run or not will_write) else 'Backfilled'
                self.stdout.write(f'  {action_word} {len(to_create)} page(s).')

                if remove_wildcard:
                    has_wildcard = '*' in (role.permission_codes or [])
                    if not has_wildcard:
                        self.stdout.write('  permission_codes has no "*" already — nothing to remove.')
                    elif dry_run:
                        self.stdout.write('  [DRY RUN] Would remove "*" from permission_codes.')
                    else:
                        role.permission_codes = [c for c in (role.permission_codes or []) if c != '*']
                        role.save(update_fields=['permission_codes'])
                        self.stdout.write(f'  Removed "*". permission_codes is now: {role.permission_codes}')

                if dry_run:
                    # Never commit anything from a dry run, even though nothing
                    # above should have queued a write in that branch anyway.
                    transaction.set_rollback(True)
