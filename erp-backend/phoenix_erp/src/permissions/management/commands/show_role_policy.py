"""
Read-only diagnostic: show the exact live RolePermissionPolicy row(s) a role
has for a given module:page, plus its permission_codes and scope.

Usage:
    python manage.py show_role_policy "Director" banks bank-transfers
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Show the live RolePermissionPolicy row(s) for a role on a module:page'

    def add_arguments(self, parser):
        parser.add_argument('role_name', help='Role name, e.g. "Director" (matches by icontains)')
        parser.add_argument('module_code', help='Module code, e.g. banks')
        parser.add_argument('page_code', nargs='?', default=None, help='Page code, e.g. bank-transfers (omit to show all pages for the module)')

    def handle(self, *args, **options):
        from users.models import Role
        from permissions.models import RolePermissionPolicy

        roles = Role.objects.filter(name__icontains=options['role_name'], is_active=True)
        if not roles.exists():
            self.stderr.write(f'No active role matching {options["role_name"]!r}')
            return

        for role in roles:
            self.stdout.write(f'\n=== Role: {role.name} (pk={role.pk}, tenant={role.tenant.name}) ===')
            self.stdout.write(f'  default_scope     : {role.default_scope}')
            self.stdout.write(f'  permission_codes  : {role.permission_codes}')
            self.stdout.write(f'  excluded_codes    : {role.excluded_permission_codes}')

            qs = RolePermissionPolicy.objects.filter(
                role=role, module__code=options['module_code']
            ).select_related('module', 'page', 'action')
            if options['page_code']:
                qs = qs.filter(page__code=options['page_code'])

            if not qs.exists():
                self.stdout.write(f'  [!] No RolePermissionPolicy rows at all for module={options["module_code"]!r}'
                                   f'{" page=" + options["page_code"] if options["page_code"] else ""}')
                continue

            for p in qs:
                target = f'{p.module.code}:{p.page.code if p.page else "(module-level)"}'
                if p.action:
                    target += f':{p.action.code}'
                self.stdout.write(
                    f'  {target} -> view={p.can_view} create={p.can_create} edit={p.can_edit} '
                    f'delete={p.can_delete} approve={p.can_approve} export={p.can_export} '
                    f'scope={p.scope} limit={p.approval_limit}'
                )
