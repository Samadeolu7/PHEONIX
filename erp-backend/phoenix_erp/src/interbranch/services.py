"""
Inter-branch transfer orchestration.

An inter-branch transfer is deliberately never a single cross-branch JV —
Transaction.branch is singular and TransactionEntry.clean() requires every
leg's account to belong to that same branch (transactions/models.py). So a
transfer is two ordinary, single-branch Transactions, each internally
balanced, linked by an InterBranchTransfer header and posted through a pair
of reciprocal "Due from / Due to" clearing accounts:

    from_branch:  Dr Due-from-{to_branch}   / Cr from_account
    to_branch:    Dr to_account             / Cr Due-to-{from_branch}

Each side never touches the other branch's books, so both branches' existing
trial balances stay correct with no changes to transactions/reports code.
"""
import time
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction as db_transaction

from accounts.models import Account, AccountCategory
from interbranch.models import InterBranchClearingAccount, InterBranchTransfer
from transactions.models import Transaction, TransactionEntry, TransactionSeries

IBT_SERIES_CODE = 'IBT'

_CLEARING_CATEGORY_NAMES = {
    InterBranchClearingAccount.DUE_FROM: 'Inter-Branch Receivables',
    InterBranchClearingAccount.DUE_TO: 'Inter-Branch Payables',
}
_CLEARING_ACCOUNT_TYPE = {
    InterBranchClearingAccount.DUE_FROM: Account.ASSET,
    InterBranchClearingAccount.DUE_TO: Account.LIABILITY,
}
_CLEARING_SECTION = {
    InterBranchClearingAccount.DUE_FROM: 1,  # Assets: 1000-1999
    InterBranchClearingAccount.DUE_TO: 2,    # Liabilities: 2000-2999
}


def _get_or_create_clearing_category(branch, direction):
    name = _CLEARING_CATEGORY_NAMES[direction]
    category, _ = AccountCategory.objects.get_or_create(
        owner=branch.owner,
        branch=branch,
        section=_CLEARING_SECTION[direction],
        name=name,
        defaults={'created_by': branch.owner, 'is_system_category': True},
    )
    return category


def _allocate_clearing_account(branch, category, direction, name):
    """
    Allocate a new parent-level GL account for a clearing category, scanning
    for the next free 4-digit code in the category's section range under a
    row lock. Adapted from Account.create_for_category (accounts/models.py),
    which never sets account_level and so always violates the
    parent_child_consistency CheckConstraint — this sets it explicitly.
    """
    account_type = _CLEARING_ACCOUNT_TYPE[direction]
    lower = _CLEARING_SECTION[direction] * 1000
    upper = lower + 999

    last_exc = None
    for attempt in range(5):
        try:
            with db_transaction.atomic():
                AccountCategory.objects.select_for_update().get(pk=category.pk)

                existing_ints = set()
                existing_codes = Account.objects.select_for_update().filter(
                    branch=branch, code__gte=str(lower), code__lte=str(upper)
                ).values_list('code', flat=True)
                for code in existing_codes:
                    try:
                        existing_ints.add(int(code))
                    except ValueError:
                        continue

                candidate = None
                for num in range(lower + 1, upper + 1):
                    if num not in existing_ints:
                        candidate = num
                        break
                if candidate is None:
                    raise RuntimeError(f"No available account codes in range {lower}-{upper}")

                try:
                    return Account.objects.create(
                        branch=branch,
                        tenant=branch.tenant,
                        owner=branch.owner,
                        created_by=branch.owner,
                        category=category,
                        code=str(candidate),
                        name=name,
                        account_level=Account.LEVEL_PARENT,
                        parent=None,
                        account_type=account_type,
                        allow_manual_entries=False,
                        is_system_account=True,
                    )
                except IntegrityError as ie:
                    last_exc = ie
                    continue
        except IntegrityError as ie2:
            last_exc = ie2
            time.sleep(0.02 * (attempt + 1))
            continue

    raise RuntimeError(f"Could not allocate clearing account code for {branch}/{name}: {last_exc}")


def get_or_create_clearing_account(branch, counterparty_branch, direction):
    """Find or lazily provision the reciprocal clearing Account for (branch, counterparty_branch, direction)."""
    existing = InterBranchClearingAccount.objects.filter(
        branch=branch, counterparty_branch=counterparty_branch, direction=direction
    ).select_related('account').first()
    if existing:
        return existing.account

    with db_transaction.atomic():
        # Re-check under the transaction in case of a race with another request.
        existing = InterBranchClearingAccount.objects.select_for_update().filter(
            branch=branch, counterparty_branch=counterparty_branch, direction=direction
        ).select_related('account').first()
        if existing:
            return existing.account

        category = _get_or_create_clearing_category(branch, direction)
        label = 'Due from' if direction == InterBranchClearingAccount.DUE_FROM else 'Due to'
        account = _allocate_clearing_account(
            branch=branch,
            category=category,
            direction=direction,
            name=f"{label} {counterparty_branch.name}",
        )
        InterBranchClearingAccount.objects.create(
            tenant=branch.tenant,
            owner=branch.owner,
            created_by=branch.owner,
            branch=branch,
            counterparty_branch=counterparty_branch,
            direction=direction,
            account=account,
        )
        return account


def _post_leg(branch, date, description, workflow_reference, owner, created_by, debit_account, credit_account, amount):
    series, _ = TransactionSeries.objects.get_or_create(
        code=IBT_SERIES_CODE, defaults={'description': 'Inter-Branch Transfer'}
    )
    journal = Transaction.objects.create(
        series=series,
        date=date,
        description=description,
        workflow_reference=workflow_reference,
        branch=branch,
        owner=owner,
        created_by=created_by,
        tenant=branch.tenant,
    )
    TransactionEntry.objects.create(transaction=journal, account=debit_account, side=TransactionEntry.DEBIT, amount=amount)
    TransactionEntry.objects.create(transaction=journal, account=credit_account, side=TransactionEntry.CREDIT, amount=amount)
    journal.post()
    return journal


@db_transaction.atomic
def create_interbranch_transfer(from_branch, to_branch, from_account, to_account, amount, description, date, user):
    if from_branch.pk == to_branch.pk:
        raise ValidationError("from_branch and to_branch must be different.")
    if from_account.branch_id != from_branch.pk:
        raise ValidationError("from_account must belong to from_branch.")
    if to_account.branch_id != to_branch.pk:
        raise ValidationError("to_account must belong to to_branch.")
    if from_branch.tenant_id != to_branch.tenant_id:
        raise ValidationError("from_branch and to_branch must belong to the same tenant.")
    if amount is None or amount <= Decimal('0.00'):
        raise ValidationError("amount must be greater than zero.")

    if date is None:
        from django.utils import timezone
        date = timezone.localdate()

    due_from_account = get_or_create_clearing_account(from_branch, to_branch, InterBranchClearingAccount.DUE_FROM)
    due_to_account = get_or_create_clearing_account(to_branch, from_branch, InterBranchClearingAccount.DUE_TO)

    transfer_description = description or f"Inter-branch transfer {from_branch.name} -> {to_branch.name}"

    source_txn = _post_leg(
        branch=from_branch, date=date, description=transfer_description, workflow_reference=None,
        owner=user, created_by=user,
        debit_account=due_from_account, credit_account=from_account, amount=amount,
    )
    destination_txn = _post_leg(
        branch=to_branch, date=date, description=transfer_description, workflow_reference=source_txn.reference_number,
        owner=user, created_by=user,
        debit_account=to_account, credit_account=due_to_account, amount=amount,
    )
    source_txn.workflow_reference = destination_txn.reference_number
    source_txn.save(update_fields=['workflow_reference'])

    return InterBranchTransfer.objects.create(
        tenant=from_branch.tenant,
        owner=user,
        created_by=user,
        from_branch=from_branch,
        to_branch=to_branch,
        from_account=from_account,
        to_account=to_account,
        amount=amount,
        description=transfer_description,
        date=date,
        status=InterBranchTransfer.STATUS_POSTED,
        source_transaction=source_txn,
        destination_transaction=destination_txn,
        initiated_by=user,
    )


@db_transaction.atomic
def reverse_interbranch_transfer(transfer, user, reason):
    if transfer.status == InterBranchTransfer.STATUS_REVERSED:
        raise ValidationError("Transfer already reversed.")

    transfer.source_transaction.reverse(user, reason)
    transfer.destination_transaction.reverse(user, reason)

    transfer.status = InterBranchTransfer.STATUS_REVERSED
    transfer.reversed_by = user
    from django.utils import timezone
    transfer.reversed_at = timezone.now()
    transfer.reversal_reason = reason
    transfer.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason'])
    return transfer
