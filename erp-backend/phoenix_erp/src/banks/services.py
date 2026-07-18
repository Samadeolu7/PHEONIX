# banks/services.py
"""
Business logic for bank-transfer approval authorization and reconciliation-
exception resolution — extracted out of banks/views.py so it can be tested
and reasoned about independently of the HTTP layer.

Functions that check permissions return an error message string (always a
403 case) if the action is not allowed, or None if it is. The view is
responsible for turning that into a DRF Response — these functions never
construct or return HTTP objects themselves.
"""
from __future__ import annotations

from django.utils import timezone

from common.approval_permissions import can_user_approve, can_user_edit


# ---------------------------------------------------------------------------
# Bank transfer approval
# ---------------------------------------------------------------------------

def _has_bank_transfer_approve_grant(user) -> bool:
    """True if RolePermissionPolicy(module='banks', page='bank-transfers')
    grants this user can_approve — i.e. they hold director-level approval
    authority regardless of which specific bank account is involved."""
    from permissions.services import PermissionResolver
    eff = PermissionResolver.resolve(user, module='banks', page='bank-transfers', action='approve')
    return bool(eff.can_approve)


def check_transfer_approval_permission(transfer, user, *, allow_bank_to_cashier=True) -> str | None:
    """Return an error message if `user` may not act (approve/reject) on
    `transfer`, or None if they may.

    RolePermissionPolicy.can_approve on banks:bank-transfers (the Permission
    Setup page — director-level authority) governs the bank-to-bank branch,
    and ALSO acts as a fallback for cashier-to-bank AND cashier-to-cashier,
    so a director can always step in regardless of which specific account
    or cashier is involved. This was deliberately NOT the case originally
    (cashier-to-cashier was a hard, no-override invariant) — changed per a
    business decision that senior staff can themselves hold a cashier
    float, and requiring a junior staff member (as the literal destination
    cashier) to be the only one who can confirm receipt into a senior's
    float was unworkable. A director now serves as the escalation path.
    The remaining branch is gated purely by object identity, not by
    anything grantable on that page:
      - bank-to-cashier: the branch-manager-tier role check
        (BankTransfer.can_user_manage_bank_to_cashier), which already
        includes directors/admins — not a RolePermissionPolicy grant.
    Both cashier-to-bank and cashier-to-cashier allow EITHER the relevant
    object-identity check (destination BankAccount's account_manager, or
    destination CashierAccount's cashier) OR a director, so a cashier who
    happens to also be that account's manager still can't rubber-stamp
    their own transfer (see the maker-checker guard below, which blocks
    that regardless).

    allow_bank_to_cashier=False is used by second_approve(), which
    structurally never reaches a bank-to-cashier transfer (those are
    single-approval) and omits that branch entirely, matching the
    original inline logic.

    Maker-checker: whoever initiated the transfer may never approve or
    reject it themselves, no matter which branch below would otherwise
    allow them through (director authority included) — segregation of
    duties between the person who moves the money and the person who
    signs off on it.
    """
    from .models import BankTransfer

    if transfer.initiated_by_id == user.id:
        return 'You cannot approve or reject a transfer you initiated.'

    if allow_bank_to_cashier and transfer.source_type == 'bank' and transfer.destination_type == 'cashier':
        # Bank-to-cashier: same role gate as initiating one (branch manager /
        # supervisor / director / admin) — see BankTransfer.can_user_manage_bank_to_cashier
        # for why this is a separate, looser gate than plain bank-to-bank.
        if not BankTransfer.can_user_manage_bank_to_cashier(user):
            return ('Only branch managers, supervisors, and directors can approve '
                    'bank-to-cashier transfers')
    elif transfer.source_type == 'bank':
        # Bank-to-bank transfers require director/admin approval — driven by
        # RolePermissionPolicy(module='banks', page='bank-transfers').can_approve.
        # See migrate_bank_transfer_policies.py for the equivalent-grant migration
        # from the old staff_profile.role_level check this replaces.
        if not _has_bank_transfer_approve_grant(user):
            return 'Only directors can approve bank-to-bank transfers'
    elif transfer.destination_type == 'cashier':
        # Cashier-to-cashier transfers require the destination cashier —
        # OR a director (see docstring above for why this is no longer a
        # hard, no-override invariant).
        is_destination_cashier = bool(
            transfer.destination_cashier_account
            and transfer.destination_cashier_account.cashier == user
        )
        if not is_destination_cashier and not _has_bank_transfer_approve_grant(user):
            return 'Only the destination cashier or a director can approve this transfer'
    else:
        # Cashier-to-bank transfers require the destination account manager
        # — OR a director (same RolePermissionPolicy grant as bank-to-bank),
        # so a director can always step in regardless of transfer type,
        # while an ordinary cashier still can't approve their own transfer
        # to an account they don't manage (and the maker-checker guard
        # above blocks them even if they DO happen to manage it themselves).
        is_account_manager = transfer.destination_bank_account.account_manager == user
        if not is_account_manager and not _has_bank_transfer_approve_grant(user):
            return ('Only the destination account manager or a director can approve '
                    'this transfer')
    return None


# ---------------------------------------------------------------------------
# Reconciliation exception resolution
# ---------------------------------------------------------------------------

_EXCEPTION_MODULE = 'banks'
_EXCEPTION_PAGE = 'bank-reconciliation-exceptions'


def check_exception_resolution_authority(exc_obj, user) -> str | None:
    """Whether `user` may act as first resolver on `exc_obj`.

    Perfect match (bank_amount == erp_amount exactly): a branch manager
    (can_edit on this page) or a director (can_approve) may resolve it.
    Any amount mismatch — including bank_only/erp_only exceptions, which
    have no counterpart amount at all — requires director approval
    (can_approve).

    Returns an error message (always a 403 case) if not allowed, None if
    allowed.
    """
    is_director = can_user_approve(user, module=_EXCEPTION_MODULE, page=_EXCEPTION_PAGE)
    if exc_obj.is_perfect_match:
        allowed = is_director or can_user_edit(user, module=_EXCEPTION_MODULE, page=_EXCEPTION_PAGE)
    else:
        allowed = is_director

    if not allowed:
        return ('Only directors may resolve reconciliation exceptions with an amount '
                'mismatch. Perfect matches may be resolved by a branch manager.')
    return None


def resolve_exception_first(exc_obj, user, resolution_notes: str) -> bool:
    """Apply the first-resolution state transition. Caller (the view) has
    already validated authority and notes length.

    See ReconciliationException.requires_dual_approval_to_resolve: at/above
    RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD (excluding perfect
    matches), this only records the FIRST director's action and leaves
    `resolved` False — a second, different director must confirm via
    resolve_exception_second() before the exception actually closes.

    Returns True if the exception is now fully resolved, False if it's
    being held pending a second director's confirmation.
    """
    from .reconciliation_utils import recompute_reconciliation_counts

    exc_obj.resolved_by = user
    exc_obj.resolution_notes = resolution_notes

    if exc_obj.requires_dual_approval_to_resolve:
        # Hold: resolved stays False until a second, different director
        # confirms via resolve_exception_second(). resolved_at stays unset
        # too — it should reflect when the exception actually closed, not
        # when the first director acted.
        exc_obj.save(update_fields=['resolved_by', 'resolution_notes'])
        return False

    exc_obj.resolved = True
    exc_obj.resolved_at = timezone.now()
    exc_obj.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes'])

    recompute_reconciliation_counts(exc_obj.reconciliation)
    return True


def check_exception_second_resolution_authority(exc_obj, user) -> str | None:
    """Whether `user` may provide the second, confirming approval on
    `exc_obj`. Director-only, and must be a different director from the
    first (mirrors BankTransfer.second_approve's identical same-approver
    guard).

    Returns an error message (always a 403 case) if not allowed, None if
    allowed.
    """
    if not can_user_approve(user, module=_EXCEPTION_MODULE, page=_EXCEPTION_PAGE):
        return 'Only directors may provide the second approval.'
    if exc_obj.resolved_by_id == user.id:
        return 'The second approver must be a different director from the first.'
    return None


def resolve_exception_second(exc_obj, user, resolution_notes: str) -> None:
    """Apply the second-resolution state transition. Caller (the view) has
    already validated authority and notes length. Always fully resolves the
    exception — this is the confirming half of dual-approval resolution."""
    from .reconciliation_utils import recompute_reconciliation_counts

    now = timezone.now()
    exc_obj.second_resolved_by = user
    exc_obj.second_resolved_at = now
    exc_obj.second_resolution_notes = resolution_notes
    exc_obj.resolved = True
    exc_obj.resolved_at = now
    exc_obj.save(update_fields=[
        'second_resolved_by', 'second_resolved_at', 'second_resolution_notes',
        'resolved', 'resolved_at',
    ])

    recompute_reconciliation_counts(exc_obj.reconciliation)
