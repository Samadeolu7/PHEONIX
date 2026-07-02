"""
One-time fix: Credit Officer roles were set up (via the Permission Setup page's
"Apply Template" flow) before the Credit Officer template included the
cash-management:cash-transfers page, so credit officers can't see the nav
item or post cash transfers.

Two independent gates exist for this page and both need to be granted:
  1. RolePermissionPolicy(module=cash-management, page=cash-transfers) — used
     by the CashTransferViewSet backend permission check.
  2. Role.permission_codes containing 'treasury-list' / 'treasury-create' —
     the flat action codes the frontend route (/treasury/cash-transfers) and
     nav actually check via ProtectedRoute's requiredPermission prop. This is
     a legacy code vocabulary from seed_permissions.py, unrelated to the
     module:page policy above, so granting #1 alone does not unlock the route.

Applies to any role whose name contains "credit officer". Safe to re-run —
only adds what's missing.
"""
from django.core.management.base import BaseCommand

MODULE_CODE = 'cash-management'
PAGE_CODE = 'cash-transfers'
ACTION_CODES = ['treasury-list', 'treasury-create']


class Command(BaseCommand):
    help = 'Grant cash-transfers access (policy + route action codes) to existing Credit Officer roles that are missing it'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would change without saving'
        )

    def handle(self, *args, **options):
        from users.models import Role
        from pages.models import Module, ModulePage
        from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH

        dry_run = options['dry_run']

        module = Module.objects.filter(code=MODULE_CODE, tenant=None).first()
        if not module:
            self.stderr.write(f'Module "{MODULE_CODE}" not found — run the Permission Setup sync first.')
            return
        page = ModulePage.objects.filter(module=module, code=PAGE_CODE).first()
        if not page:
            self.stderr.write(f'Page "{PAGE_CODE}" not found under module "{MODULE_CODE}" — run the Permission Setup sync first.')
            return

        changed = 0
        for role in Role.objects.filter(name__icontains='credit officer'):
            policy_exists = RolePermissionPolicy.objects.filter(
                role=role, module=module, page=page, action=None,
            ).exists()
            existing_codes = set(role.permission_codes or [])
            missing_codes = [c for c in ACTION_CODES if c not in existing_codes]

            if policy_exists and not missing_codes:
                continue

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}Fixing "{role.name}" '
                f'(tenant={role.tenant.name}): policy={"ok" if policy_exists else "missing"}, '
                f'action_codes missing={missing_codes or "none"}'
            )
            if not dry_run:
                if not policy_exists:
                    RolePermissionPolicy.objects.create(
                        role=role, module=module, page=page, action=None,
                        can_view=True, can_create=True, can_edit=True,
                        can_delete=False, can_approve=False, can_export=False,
                        scope=SCOPE_OWN_BRANCH,
                    )
                if missing_codes:
                    role.permission_codes = sorted(existing_codes | set(ACTION_CODES))
                    role.save(update_fields=['permission_codes'])
            changed += 1

        if changed == 0:
            self.stdout.write('No Credit Officer roles needed updating.')
        else:
            action = 'Would update' if dry_run else 'Updated'
            self.stdout.write(f'\n{action} {changed} role(s).')
