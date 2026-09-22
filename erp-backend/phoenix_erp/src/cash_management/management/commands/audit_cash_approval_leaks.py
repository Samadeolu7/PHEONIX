"""
cash_management/management/commands/audit_cash_approval_leaks.py
===================================================================
Surfaces historical records affected by two approval-scoping bugs fixed on
2026-09-15 in cash_management/views.py and models.py:

1. Branch leak — CashTransferViewSet.get_queryset() and
   CashReconciliationViewSet.get_queryset() never filtered by branch (every
   sibling viewset in the file does). Any authenticated user, in any branch,
   could list, and — via execute_action()/finance_officer_signoff(), both
   built on get_object() -> get_queryset() -- approve, reject, or sign off
   cash transfers and reconciliations belonging to a DIFFERENT branch, with
   no role check either.

2. Maker-checker gap — PettyCashVoucher.approve() only rejected self-approval
   (requested_by == approver) for disbursement_mode='bank_transfer'; the
   till/cash-mode branch had no such check. The approve/reject actions on
   PettyCashVoucherViewSet also had no IsApprover gate, so any authenticated
   user in the same branch (not just approvers) could approve or reject a
   voucher, including their own.

This command does NOT mutate anything — cash transfers auto-post to the GL
on second approval, and reconciliation signoffs/voucher approvals feed
downstream fund balances, so unwinding a bad approval needs a human decision
(reverse the GL entry, or accept it as a one-off exception), not a script.

Caveats
-------
- "Cross-branch" and "unauthorized approver" checks use branch/role
  assignments as they stand TODAY. A user's branch or role may have changed
  since the approval was recorded, so a flagged row is a lead to verify
  against your audit trail (who actually clicked approve, and were they
  entitled to act on that branch at the time), not a certain violation ---
  and conversely a since-changed assignment could hide a past violation.
- Directors/owners/global-scope users are excluded from the cross-branch
  checks because they are legitimately allowed to act on any branch (see
  common.managers.OwnerBranchManager.for_user). The self-approval check has
  no such exception, mirroring approve()'s own logic, which never exempted
  elevated users either.

Usage
-----
    python manage.py audit_cash_approval_leaks
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import F


def _is_unrestricted(user) -> bool:
    """Mirrors OwnerBranchManager.for_user()'s bypass conditions."""
    if not user:
        return False
    if getattr(user, 'is_system_admin', False) or getattr(user, 'is_superuser', False):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        if user.roles.filter(is_active=True, default_scope='global').exists():
            return True
    except Exception:
        pass
    return False


class Command(BaseCommand):
    help = (
        "Lists CashTransfer/CashReconciliation rows approved or signed off "
        "by a user outside the record's branch, and PettyCashVoucher rows "
        "approved by their own requester -- the historical footprint of the "
        "2026-09-15 approval-scoping fixes."
    )

    def handle(self, *args, **options):
        from cash_management.models import CashTransfer, CashReconciliation, PettyCashVoucher

        cross_branch_hits = []

        transfers = (
            CashTransfer.objects
            .filter(branch__isnull=False)
            .exclude(approved_by__isnull=True, second_approved_by__isnull=True, rejected_by__isnull=True)
            .select_related('branch', 'approved_by__branch', 'second_approved_by__branch', 'rejected_by__branch')
        )
        for t in transfers:
            for role, actor in (
                ('first approval', t.approved_by),
                ('second approval', t.second_approved_by),
                ('rejection', t.rejected_by),
            ):
                if actor and not _is_unrestricted(actor) and getattr(actor, 'branch_id', None) != t.branch_id:
                    cross_branch_hits.append((
                        'CashTransfer', t.pk, t.branch, role, actor,
                        getattr(actor, 'branch', None),
                    ))

        reconciliations = (
            CashReconciliation.objects
            .filter(branch__isnull=False, finance_officer_signoff__isnull=False)
            .select_related('branch', 'finance_officer_signoff__branch')
        )
        for r in reconciliations:
            actor = r.finance_officer_signoff
            if actor and not _is_unrestricted(actor) and getattr(actor, 'branch_id', None) != r.branch_id:
                cross_branch_hits.append((
                    'CashReconciliation', r.pk, r.branch, 'finance officer signoff', actor,
                    getattr(actor, 'branch', None),
                ))

        self_approval_hits = list(
            PettyCashVoucher.objects
            .filter(approved_by__isnull=False, requested_by__isnull=False, approved_by_id=F('requested_by_id'))
            .select_related('requested_by', 'fund')
        )

        if not cross_branch_hits and not self_approval_hits:
            self.stdout.write(self.style.SUCCESS(
                'No cross-branch cash approvals and no self-approved petty cash vouchers found.'
            ))
            return

        if cross_branch_hits:
            self.stdout.write(self.style.WARNING(
                f'\n{len(cross_branch_hits)} cross-branch cash approval(s)/signoff(s) '
                f'(actor branch != record branch, actor not elevated):\n'
            ))
            for model_name, pk, record_branch, role, actor, actor_branch in cross_branch_hits:
                self.stdout.write(
                    f'  {model_name} #{pk}  branch={record_branch}  {role} by '
                    f'{actor} (branch={actor_branch})\n'
                )

        if self_approval_hits:
            self.stdout.write(self.style.WARNING(
                f'\n{len(self_approval_hits)} self-approved petty cash voucher(s) '
                f'(maker-checker violation):\n'
            ))
            for v in self_approval_hits:
                self.stdout.write(
                    f'  {v.voucher_number}  fund={v.fund.fund_code}  amount=N{v.amount}  '
                    f'requested_by=approved_by={v.requested_by}\n'
                )

        self.stdout.write(self.style.NOTICE(
            '\nNo changes were made. Each hit needs a human decision: verify the '
            'actor was entitled to act on that record at the time, and if not, '
            'decide whether to reverse the downstream GL entry/fund balance '
            'impact or accept it as a documented one-off exception.'
        ))
