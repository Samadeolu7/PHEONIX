"""
Read-only diagnostic: explain exactly why PermissionResolver.resolve() grants
or denies a given user a given flag on a module:page, by walking the same
two layers HasActionPermission checks — role baseline (RolePermissionPolicy)
then per-user override (UserPermissionOverride) — and printing which one
decided the outcome.

Usage:
    python manage.py diagnose_user_permission <username_or_email> loans loan-repayment-reversals --flag=can_create
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Explain why a user does/does not have a given permission flag on module:page'

    def add_arguments(self, parser):
        parser.add_argument('user', help='Username or email of the user to check')
        parser.add_argument('module_code', help='Module code, e.g. loans')
        parser.add_argument('page_code', help='Page code, e.g. loan-repayment-reversals')
        parser.add_argument('--flag', default='can_create',
                             help='can_view/can_create/can_edit/can_delete/can_approve/can_export')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from permissions.services import PermissionResolver

        User = get_user_model()
        ident = options['user']
        flag = options['flag']
        module_code = options['module_code']
        page_code = options['page_code']

        user = (
            User.objects.filter(username=ident).first()
            or User.objects.filter(email=ident).first()
        )
        if not user:
            self.stderr.write(f'No user found for {ident!r}')
            return

        self.stdout.write(f'\n=== User: {user} (pk={user.pk}) ===')

        if PermissionResolver._is_wildcard(user):
            self.stdout.write('  [!] User resolves as WILDCARD (system admin / owner / a role with '
                               'permission_codes=["*"]) — always allowed, bypasses everything below.')
            return

        roles = list(user.roles.filter(is_active=True))
        if not roles:
            self.stdout.write('  [!] User has NO active roles — will fall back to deny-by-default '
                               'or legacy baseline depending on target.')
        for role in roles:
            self.stdout.write(f'  role: {role.name} (pk={role.pk}, level={getattr(role, "level", None)})')

        baseline = PermissionResolver._resolve_role_baseline(
            user, module=module_code, page=page_code, action=None,
        )
        self.stdout.write(f'\n  Role baseline for {module_code}:{page_code} ->')
        self.stdout.write(f'    {flag} = {getattr(baseline, flag)}')
        self.stdout.write(f'    scope = {baseline.scope}, approval_limit = {baseline.approval_limit}')

        overrides = PermissionResolver._active_overrides(user)
        if not overrides:
            self.stdout.write('\n  No active UserPermissionOverride rows for this user at all.')
        else:
            self.stdout.write(f'\n  Active UserPermissionOverride rows for this user ({len(overrides)}):')
            for o in overrides:
                target = 'GLOBAL'
                if o.module_id:
                    target = o.module.code
                if o.page_id:
                    target = f'{o.module.code}:{o.page.code}'
                if o.action_id:
                    target += f':{o.action.code}'
                flag_val = getattr(o, flag)
                marker = ' <== SETS THIS FLAG' if flag_val is not None else ''
                self.stdout.write(
                    f'    [{target}] {flag}={flag_val} scope_override={o.scope} '
                    f'expiry_type={o.expiry_type} is_suspended={o.is_suspended}{marker}'
                )

        effective = PermissionResolver.resolve(user, module=module_code, page=page_code)
        self.stdout.write(f'\n  FINAL effective.{flag} = {getattr(effective, flag)}')
        if getattr(effective, flag) != getattr(baseline, flag):
            self.stdout.write(
                '  [!] An override CHANGED the outcome vs. the role baseline above — '
                'that is why editing the role in Permission Setup did not take effect. '
                'Check Admin -> User Permission Overrides for this user.'
            )
        elif not getattr(effective, flag) and not roles:
            self.stdout.write('  [!] Denied because the user has no active role at all.')
        elif not getattr(effective, flag):
            self.stdout.write(
                '  [!] Denied at the role level. Confirm the Permission Setup page was saved '
                '(a Save click, not just a toggle) for the role(s) listed above, and that this '
                'is the exact role the user is assigned.'
            )
