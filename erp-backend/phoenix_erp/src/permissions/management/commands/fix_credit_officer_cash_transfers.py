"""
One-time fix: Credit Officer roles were set up (via the Permission Setup page's
"Apply Template" flow) before the Credit Officer template included the
cash-management:cash-transfers page, so credit officers can't see the nav
item or post cash transfers. Grants the missing page policy to any role whose
name contains "credit officer". Safe to re-run — only adds what's missing.
"""
from django.core.management.base import BaseCommand

MODULE_CODE = 'cash-management'
PAGE_CODE = 'cash-transfers'


class Command(BaseCommand):
    help = 'Grant cash-management:cash-transfers to existing Credit Officer roles that are missing it'

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
            exists = RolePermissionPolicy.objects.filter(
                role=role, module=module, page=page, action=None,
            ).exists()
            if exists:
                continue

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}Granting cash-transfers to '
                f'"{role.name}" (tenant={role.tenant.name})'
            )
            if not dry_run:
                RolePermissionPolicy.objects.create(
                    role=role, module=module, page=page, action=None,
                    can_view=True, can_create=True, can_edit=True,
                    can_delete=False, can_approve=False, can_export=False,
                    scope=SCOPE_OWN_BRANCH,
                )
            changed += 1

        if changed == 0:
            self.stdout.write('No Credit Officer roles needed updating.')
        else:
            action = 'Would update' if dry_run else 'Updated'
            self.stdout.write(f'\n{action} {changed} role(s).')
