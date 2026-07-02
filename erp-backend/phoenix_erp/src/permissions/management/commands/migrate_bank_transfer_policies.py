"""
Migrates BankTransferViewSet's ad hoc `staff_profile.role_level` checks
(_is_transfer_manager / approve / second_approve) to RolePermissionPolicy
grants, so the view can be converted to the standard PermissionResolver
pattern used elsewhere in the codebase.

IMPORTANT — read before running for real:
Today's bank-transfer authorization is PER-USER, driven by
hr.Staff.role_level (a fixed enum: credit_officer/supervisor/branch_manager/
director/operations/admin). RolePermissionPolicy is PER-ROLE, driven by the
tenant Role a user is assigned to (a free-text name like "Director"). These
are two independent systems that can drift out of sync for a given user —
see users/management/commands/diagnose_user_roles.py, which has already
surfaced one real example this way (a user with tenant Role "Director" but
staff_profile.role_level='operations'). This command grants
RolePermissionPolicy by Role NAME fragment, matching the convention already
used by fix_role_scopes.py and seed_permissions.py's _seed_role_policies. It
does NOT byte-for-byte replicate the old per-user role_level check for any
user whose assigned Role name and HR role_level disagree.

Usage:
    # Step 1 — REQUIRED before anything else. Lists every user where the old
    # role_level check and the new Role-name-fragment grant would DISAGREE.
    # Fix those users' data (Staff.role_level or Role assignment) first.
    python manage.py migrate_bank_transfer_policies --check-drift

    # Step 2 — preview the RolePermissionPolicy rows that would be created.
    python manage.py migrate_bank_transfer_policies --dry-run

    # Step 3 — apply.
    python manage.py migrate_bank_transfer_policies
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Grant banks:bank-transfers RolePermissionPolicy rows equivalent to the current role_level checks'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
        parser.add_argument(
            '--check-drift', action='store_true',
            help='Only report users whose tenant-Role-derived grant would differ from their '
                 'current staff_profile.role_level. No writes. Run this first.',
        )
        parser.add_argument('--tenant-id', type=int, default=None)

    def handle(self, *args, **options):
        from users.models import Role

        dry_run = options['dry_run']
        check_drift = options['check_drift']
        tenant_id = options['tenant_id']

        roles_qs = Role.objects.filter(is_active=True)
        if tenant_id:
            roles_qs = roles_qs.filter(tenant_id=tenant_id)

        if check_drift:
            self._check_drift(roles_qs)
            return

        from pages.models import Module, ModulePage
        from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH

        module = Module.objects.filter(code='banks', tenant=None).first()
        page = ModulePage.objects.filter(module=module, code='bank-transfers').first() if module else None
        if not page:
            self.stderr.write(
                'banks:bank-transfers Module/ModulePage not found — run the Permission '
                'Setup sync first (POST /api/permissions/setup/sync/).'
            )
            return

        changed = 0
        for role in roles_qs:
            name_lower = role.name.lower()
            is_director_admin = any(f in name_lower for f in ('director', 'admin'))
            is_branch_manager = 'branch manager' in name_lower or 'branch_manager' in name_lower
            has_legacy_bank_code = any(
                isinstance(c, str) and c.startswith('bank-') for c in (role.permission_codes or [])
            )

            if is_director_admin:
                # Full control including final approval — matches the old
                # `role_level in ('director', 'admin')` approve()/second_approve() gate.
                flags = dict(can_view=True, can_create=True, can_edit=True,
                             can_delete=False, can_approve=True, can_export=True)
            elif is_branch_manager:
                # Matches _is_transfer_manager()'s branch_manager inclusion (can see/manage
                # all transfers) while staying excluded from final approval, matching
                # approve()'s narrower director/admin-only gate.
                flags = dict(can_view=True, can_create=True, can_edit=True,
                              can_delete=False, can_approve=False, can_export=False)
            elif has_legacy_bank_code:
                # Roles that already hold a legacy 'bank-*' permission_codes entry
                # (e.g. Credit Officer, granted this session) — initiate only.
                flags = dict(can_view=True, can_create=True, can_edit=False,
                              can_delete=False, can_approve=False, can_export=False)
            else:
                continue

            scope = role.default_scope or SCOPE_OWN_BRANCH
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}{role.name} '
                f'(tenant={role.tenant.name}): {flags}, scope={scope}'
            )
            if not dry_run:
                RolePermissionPolicy.objects.update_or_create(
                    role=role, module=page.module, page=page, action=None,
                    defaults={**flags, 'scope': scope, 'approval_limit': None},
                )
            changed += 1

        if changed == 0:
            self.stdout.write('No roles needed updating.')
        else:
            action = 'Would update' if dry_run else 'Updated'
            self.stdout.write(f'\n{action} {changed} role(s).')

    def _check_drift(self, roles_qs):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        mismatches = 0
        checked = 0
        for role in roles_qs:
            name_lower = role.name.lower()
            role_says_approve = any(f in name_lower for f in ('director', 'admin'))
            role_says_manage = role_says_approve or 'branch manager' in name_lower or 'branch_manager' in name_lower

            users = User.objects.filter(roles=role, is_active=True).select_related('staff_profile')
            for user in users:
                checked += 1
                try:
                    staff = user.staff_profile
                    role_level = staff.role_level
                except Exception:
                    role_level = None

                level_says_approve = role_level in ('director', 'admin')
                level_says_manage = role_level in ('director', 'admin', 'branch_manager')

                if role_says_approve != level_says_approve or role_says_manage != level_says_manage:
                    mismatches += 1
                    self.stdout.write(
                        f'  MISMATCH: {user.email} — tenant Role="{role.name}" '
                        f'(would grant approve={role_says_approve}, manage={role_says_manage}) '
                        f'vs staff_profile.role_level={role_level!r} '
                        f'(currently grants approve={level_says_approve}, manage={level_says_manage})'
                    )

        self.stdout.write(f'\nChecked {checked} user(s) across {roles_qs.count()} role(s). {mismatches} mismatch(es) found.')
        if mismatches:
            self.stdout.write(
                'Resolve each mismatch (fix staff_profile.role_level via HR → Staff, or the '
                'user\'s tenant Role assignment) before running the real migration, so nobody\'s '
                'bank-transfer approval access silently changes.'
            )
