"""
Grants RolePermissionPolicy(module='banks', page='bank-reconciliation-exceptions')
tiered by role:
  - Director/Principal-named roles: can_approve=True (may resolve ANY
    exception, including amount mismatches).
  - Branch-manager-named roles: can_edit=True, can_approve=False (may resolve
    only "perfect match" exceptions — see ReconciliationException.is_perfect_match
    and ResolveExceptionView.patch in banks/views.py, which is the
    authoritative gate this grant feeds into).
  - Everyone else: can_view=True (read-only).

Deliberately NOT done via seed_permissions.py --create-policies: that bulk
heuristic classifies any role whose name contains "manager"/"supervisor" (in
addition to "admin") into its is_admin bucket, which grants can_approve=True
by default — that would wrongly let a Branch Manager resolve exceptions with
a genuine amount mismatch, defeating the whole point of this control (only a
director is trusted to close out a discrepancy between what a branch
recorded and what the bank actually shows). This command only matches the
same narrow APPROVER_ROLES fragments common.approval_permissions.
can_user_approve() already falls back to, so the grant and the gate agree.
The branch-manager fragment match mirrors migrate_bank_transfer_policies.py.

Usage:
    python manage.py set_bank_recon_resolve_policy --dry-run
    python manage.py set_bank_recon_resolve_policy
    python manage.py set_bank_recon_resolve_policy --tenant-id=3
"""
from django.core.management.base import BaseCommand

# Matches common.approval_permissions.APPROVER_ROLES — kept as a separate
# literal (not imported) so this command has no import-time dependency on
# that module; if the two ever need to diverge, they diverge visibly.
DIRECTOR_ROLE_FRAGMENTS = ('director', 'principal')


class Command(BaseCommand):
    help = (
        'Grant banks:bank-reconciliation-exceptions can_approve to Director/Principal roles '
        'and can_edit (perfect-match-only resolve) to Branch Manager roles.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
        parser.add_argument('--tenant-id', type=int, default=None)

    def handle(self, *args, **options):
        from pages.models import Module, ModulePage
        from permissions.models import RolePermissionPolicy, SCOPE_GLOBAL, SCOPE_OWN_BRANCH
        from users.models import Role

        dry_run = options['dry_run']
        tenant_id = options['tenant_id']

        # Use all_tenants() to bypass OwnerBranchManager's auto-filter;
        # don't restrict by tenant=None — migration 0005 stamped all rows.
        module = Module.objects.all_tenants().filter(code='banks').first()
        page = (
            ModulePage.objects.all_tenants()
            .filter(module__code='banks', code='bank-reconciliation-exceptions')
            .select_related('module')
            .first()
        )
        if not page:
            self.stderr.write(
                'banks:bank-reconciliation-exceptions Module/ModulePage not found — run '
                '`python manage.py seed_permissions` (catalog only, no --create-policies) first.'
            )
            return
        # Ensure module_obj is consistent with what the page references
        module = page.module

        roles_qs = Role.objects.filter(is_active=True)
        if tenant_id:
            roles_qs = roles_qs.filter(tenant_id=tenant_id)

        changed = 0
        for role in roles_qs:
            name_lower = role.name.lower()
            is_director = any(f in name_lower for f in DIRECTOR_ROLE_FRAGMENTS)
            is_branch_manager = 'branch manager' in name_lower or 'branch_manager' in name_lower

            if is_director:
                flags = dict(can_view=True, can_create=False, can_edit=False,
                             can_delete=False, can_approve=True, can_export=True)
                scope = SCOPE_GLOBAL
            elif is_branch_manager:
                # Perfect-match-only resolve — see ResolveExceptionView.patch,
                # which requires can_approve for any exception with an amount
                # mismatch and accepts can_edit only for is_perfect_match=True.
                flags = dict(can_view=True, can_create=False, can_edit=True,
                             can_delete=False, can_approve=False, can_export=False)
                scope = role.default_scope or SCOPE_OWN_BRANCH
            else:
                # Read-only for everyone else — credit officers etc. still see
                # their own branch's results, they just can't close exceptions
                # out. Scope stays whatever the role already uses (own-branch
                # by default) rather than forcing it.
                flags = dict(can_view=True, can_create=False, can_edit=False,
                             can_delete=False, can_approve=False, can_export=False)
                scope = role.default_scope or SCOPE_OWN_BRANCH

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}{role.name} '
                f'(tenant={role.tenant.name}): can_approve={flags["can_approve"]}, '
                f'can_edit={flags["can_edit"]}, scope={scope}'
            )
            if not dry_run:
                RolePermissionPolicy.objects.update_or_create(
                    role=role, module=page.module, page=page, action=None,
                    defaults={**flags, 'scope': scope, 'approval_limit': None},
                )
            changed += 1

        if changed == 0:
            self.stdout.write('No roles found to update.')
        else:
            action = 'Would update' if dry_run else 'Updated'
            self.stdout.write(f'\n{action} {changed} role(s).')
