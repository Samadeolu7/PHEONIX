"""
Grants RolePermissionPolicy(module='loans', page='loan-disbursement-corrections')
Director/Principal-named roles can_approve=True (may first- or second-approve a
correction — LoanDisbursementCorrection reverses a real disbursement and moves
real money again, so unlike bank reconciliation there is no lower "perfect
match" tier a branch manager can act on alone).

Everyone else gets can_view=True (read-only) so any officer can see the status
of a correction they requested, but only directors can approve one — see
LoanDisbursementCorrectionViewSet.first_approve/second_approve/reject
(loans/views.py), which gate on can_user_approve() for this exact
module/page.

Deliberately NOT done via seed_permissions.py --create-policies, for the same
reason as set_bank_recon_resolve_policy.py: that bulk heuristic classifies any
role whose name contains "manager"/"supervisor" into its is_admin bucket and
grants can_approve=True by default, which would let a branch manager approve a
correction alone — defeating the two-director control this page exists to
enforce.

Usage:
    python manage.py set_loan_correction_policy --dry-run
    python manage.py set_loan_correction_policy
    python manage.py set_loan_correction_policy --tenant-id=3
"""
from django.core.management.base import BaseCommand

# Matches common.approval_permissions.APPROVER_ROLES — kept as a separate
# literal (not imported) so this command has no import-time dependency on
# that module; if the two ever need to diverge, they diverge visibly.
DIRECTOR_ROLE_FRAGMENTS = ('director', 'principal')


class Command(BaseCommand):
    help = (
        'Grant loans:loan-disbursement-corrections can_approve to Director/Principal roles '
        'and can_view (read-only) to everyone else.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
        parser.add_argument('--tenant-id', type=int, default=None)

    def handle(self, *args, **options):
        from permissions.models import RolePermissionPolicy, SCOPE_GLOBAL, SCOPE_OWN_BRANCH
        from pages.models import ModulePage
        from users.models import Role

        dry_run = options['dry_run']
        tenant_id = options['tenant_id']

        page = (
            ModulePage.objects.all_tenants()
            .filter(module__code='loans', code='loan-disbursement-corrections')
            .select_related('module')
            .first()
        )
        if not page:
            self.stderr.write(
                'loans:loan-disbursement-corrections Module/ModulePage not found — run '
                '`python manage.py seed_permissions` (catalog only, no --create-policies) first.'
            )
            return

        roles_qs = Role.objects.filter(is_active=True)
        if tenant_id:
            roles_qs = roles_qs.filter(tenant_id=tenant_id)

        changed = 0
        for role in roles_qs:
            name_lower = role.name.lower()
            is_director = any(f in name_lower for f in DIRECTOR_ROLE_FRAGMENTS)

            if is_director:
                flags = dict(can_view=True, can_create=True, can_edit=False,
                             can_delete=False, can_approve=True, can_export=True)
                scope = SCOPE_GLOBAL
            else:
                # Read-only for everyone else — an officer can request a
                # correction (create is gated only by authentication, see
                # LoanDisbursementCorrectionViewSet.perform_create) and see
                # its status, but cannot approve one.
                flags = dict(can_view=True, can_create=True, can_edit=False,
                             can_delete=False, can_approve=False, can_export=False)
                scope = role.default_scope or SCOPE_OWN_BRANCH

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}{role.name} '
                f'(tenant={role.tenant.name}): can_approve={flags["can_approve"]}, scope={scope}'
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
