# savings/services.py
"""
Business logic for product-driven savings behaviour:
  - First-deposit-as-income (daily contribution accounts)
  - Savings cycle interest & break penalties
  - Tiered withdrawal approval workflow
"""
from __future__ import annotations

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from .models import (
    SavingsAccount, SavingsProduct,
    WithdrawalApprovalTier, SavingsWithdrawalRequest, WithdrawalApprovalStep,
    SmartSavingsAccount, SmartSavingsEvent,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Daily contribution — first deposit income
# ---------------------------------------------------------------------------

@db_transaction.atomic
def handle_first_deposit_income(
    savings_account: SavingsAccount,
    amount: Decimal,
    deposit_date,
    cashier_account,
    transacted_by,
) -> tuple[object | None, bool]:
    """
    Called before every deposit on a daily-contribution account.

    Checks whether this is the FIRST deposit of the current calendar month.
    If yes AND the linked SavingsProduct has first_deposit_is_income=True,
    posts the FULL amount as income (does NOT credit the savings balance) and
    returns (journal_entry, True).

    If not the first deposit of the month, returns (None, False) and the
    caller should proceed with a normal deposit.

    Returns:
        (journal_entry_or_None, was_income_posted: bool)
    """
    try:
        config: SavingsProduct = savings_account.product.savings_product_config
    except SavingsProduct.DoesNotExist:
        return None, False

    if not (config.is_daily_contribution and config.first_deposit_is_income):
        return None, False

    today = deposit_date if deposit_date else timezone.now().date()

    # Check if any deposit already exists this month for this account
    from transactions.models import TransactionEntry as JournalEntryLine
    already_deposited = JournalEntryLine.objects.filter(
        account=savings_account.account,
        side=JournalEntryLine.CREDIT,
        transaction__date__year=today.year,
        transaction__date__month=today.month,
    ).exists()

    if already_deposited:
        # Not the first deposit — normal flow
        return None, False

    # First deposit of the month → post as income
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry,
        TransactionSeries,
    )

    series, _ = TransactionSeries.objects.get_or_create(
        code='SV1ST',
        defaults={'description': 'First Deposit Income (Daily Contribution)'},
    )

    journal = JournalEntry.objects.create(
        series=series,
        date=today,
        description=(
            f"First deposit income – {savings_account.account_number} "
            f"({savings_account.client.full_name})"
        ),
        owner=savings_account.owner,
        branch=savings_account.branch,
        created_by=transacted_by,
    )

    # Debit: Cash / Cashier account (ASSET)
    TransactionEntry.objects.create(
        transaction=journal,
        account=cashier_account,
        side=TransactionEntry.DEBIT,
        amount=amount,
        description=f"Cash received – first deposit income from {savings_account.client.full_name}",
    )

    # Credit: Income account (does NOT touch savings balance)
    TransactionEntry.objects.create(
        transaction=journal,
        account=config.first_deposit_income_account,
        side=TransactionEntry.CREDIT,
        amount=amount,
        description=f"First deposit income – {savings_account.account_number}",
    )

    journal.post()

    savings_account.last_transaction_date = today
    savings_account.save(update_fields=['last_transaction_date'])

    return journal, True


# ---------------------------------------------------------------------------
# Savings cycle — interest at maturity & penalty on early break
# ---------------------------------------------------------------------------

@db_transaction.atomic
def apply_cycle_interest(savings_account: SavingsAccount, transacted_by) -> object:
    """
    Post cycle-maturity interest to the client's savings balance.

    Called when a cycle savings account reaches its maturity date.

    GL Entry (SAV-CYCINT):
        Dr. Interest Expense account   (config.interest_expense_account)
        Cr. Member Savings account     (savings_account.account)

    Returns the created journal entry.
    Raises ValidationError if the account is not a cycle savings account,
    or if the cycle has not yet matured.
    """
    config = _get_savings_config(savings_account)
    if not config.has_savings_cycle:
        raise ValidationError("This savings product does not have a savings cycle.")

    smart = getattr(savings_account, 'smart_account', None)
    if not smart or not smart.is_active:
        raise ValidationError("No active savings cycle found for this account.")

    if not smart.matured:
        raise ValidationError(
            f"Cycle has not yet matured (matures on {smart.maturity_date})."
        )

    opening_balance = smart.opening_balance or Decimal('0.00')
    interest_amount = (opening_balance * config.cycle_interest_rate / Decimal('100')).quantize(
        Decimal('0.01')
    )

    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry,
        TransactionSeries,
    )

    series, _ = TransactionSeries.objects.get_or_create(
        code='SVCYI',
        defaults={'description': 'Savings Cycle Interest'},
    )

    today = timezone.now().date()
    journal = JournalEntry.objects.create(
        series=series,
        date=today,
        description=(
            f"Cycle interest ({config.cycle_interest_rate}%) for "
            f"{savings_account.account_number} ({savings_account.client.full_name})"
        ),
        owner=savings_account.owner,
        branch=savings_account.branch,
        created_by=transacted_by,
    )

    TransactionEntry.objects.create(
        transaction=journal,
        account=config.interest_expense_account,
        side=TransactionEntry.DEBIT,
        amount=interest_amount,
        description="Cycle interest expense",
    )
    TransactionEntry.objects.create(
        transaction=journal,
        account=savings_account.account,
        side=TransactionEntry.CREDIT,
        amount=interest_amount,
        description=f"Cycle interest credited – {savings_account.account_number}",
    )

    journal.post()

    # Audit event
    SmartSavingsEvent.objects.create(
        account=smart,
        event_type=SmartSavingsEvent.INTEREST,
        amount=interest_amount,
        details=f"Rate: {config.cycle_interest_rate}%, Base: ₦{opening_balance:,.2f}",
    )

    smart.last_interest_date = today
    smart.is_active = not config.cycle_auto_renew
    smart.save(update_fields=['last_interest_date', 'is_active'])

    if config.cycle_auto_renew:
        smart.start_date = today
        smart.opening_balance = savings_account.current_balance
        smart.is_active = True
        smart.save(update_fields=['start_date', 'opening_balance', 'is_active'])

    return journal


@db_transaction.atomic
def apply_cycle_break_penalty(
    savings_account: SavingsAccount,
    withdrawal_amount: Decimal,
    transacted_by,
) -> tuple[Decimal, object]:
    """
    Charge an early-withdrawal penalty when a cycle savings account is broken.

    GL Entry (SAV-CYCPEN):
        Dr. Member Savings account         (savings_account.account)
        Cr. Penalty Income account         (config.penalty_income_account)

    Returns:
        (penalty_amount, journal_entry)

    Raises ValidationError if no active cycle found.
    """
    config = _get_savings_config(savings_account)
    if not config.has_savings_cycle:
        return Decimal('0.00'), None

    smart = getattr(savings_account, 'smart_account', None)
    if not smart or not smart.is_active or smart.matured:
        # No active unmatured cycle → no penalty
        return Decimal('0.00'), None

    balance = savings_account.current_balance
    penalty_amount = (balance * config.cycle_break_penalty_rate / Decimal('100')).quantize(
        Decimal('0.01')
    )

    if penalty_amount <= Decimal('0.00'):
        return Decimal('0.00'), None

    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry,
        TransactionSeries,
    )

    series, _ = TransactionSeries.objects.get_or_create(
        code='SVCYP',
        defaults={'description': 'Savings Cycle Break Penalty'},
    )

    today = timezone.now().date()
    journal = JournalEntry.objects.create(
        series=series,
        date=today,
        description=(
            f"Cycle break penalty ({config.cycle_break_penalty_rate}%) for "
            f"{savings_account.account_number} ({savings_account.client.full_name})"
        ),
        owner=savings_account.owner,
        branch=savings_account.branch,
        created_by=transacted_by,
    )

    TransactionEntry.objects.create(
        transaction=journal,
        account=savings_account.account,
        side=TransactionEntry.DEBIT,
        amount=penalty_amount,
        description=f"Cycle break penalty deducted – {savings_account.account_number}",
    )
    TransactionEntry.objects.create(
        transaction=journal,
        account=config.penalty_income_account,
        side=TransactionEntry.CREDIT,
        amount=penalty_amount,
        description="Cycle break penalty income",
    )

    journal.post()

    SmartSavingsEvent.objects.create(
        account=smart,
        event_type=SmartSavingsEvent.PENALTY,
        amount=penalty_amount,
        details=(
            f"Rate: {config.cycle_break_penalty_rate}%, Balance: ₦{balance:,.2f}, "
            f"Withdrawal: ₦{withdrawal_amount:,.2f}"
        ),
    )

    # Deactivate the cycle
    smart.is_active = False
    smart.save(update_fields=['is_active'])

    return penalty_amount, journal


# ---------------------------------------------------------------------------
# Withdrawal approval workflow
# ---------------------------------------------------------------------------

def _resolve_tier(owner, amount: Decimal) -> WithdrawalApprovalTier | None:
    """Return the first active tier that matches the given amount."""
    tiers = WithdrawalApprovalTier.objects.filter(
        owner=owner,
        is_active=True,
    ).order_by('order')

    for tier in tiers:
        if tier.matches(amount):
            return tier
    return None


@db_transaction.atomic
def initiate_withdrawal(
    savings_account: SavingsAccount,
    amount: Decimal,
    requested_by: User,
    description: str = '',
    cashier_account=None,
    destination_bank_account=None,
) -> SavingsWithdrawalRequest:
    """
    Create a SavingsWithdrawalRequest and pre-populate the approval steps.

    Enforces:
    - only_account_manager_can_withdraw: requested_by must be the client's account_manager
    - Sufficient balance check (including any cycle break penalty)
    - At least one matching approval tier must exist

    Returns the created SavingsWithdrawalRequest.
    """
    try:
        config: SavingsProduct = savings_account.product.savings_product_config
    except SavingsProduct.DoesNotExist:
        config = None

    # ── Permission check ─────────────────────────────────────────────────────
    if config and config.only_account_manager_can_withdraw:
        client_manager = savings_account.client.account_manager
        if not client_manager or client_manager.pk != requested_by.pk:
            raise ValidationError(
                "Only the client's account manager may initiate a withdrawal on this product."
            )

    # ── Balance check ─────────────────────────────────────────────────────────
    if amount <= Decimal('0.00'):
        raise ValidationError("Withdrawal amount must be positive.")

    if amount > savings_account.available_balance:
        raise ValidationError(
            f"Insufficient funds: available ₦{savings_account.available_balance:,.2f}, "
            f"requested ₦{amount:,.2f}."
        )

    if not (cashier_account or destination_bank_account):
        raise ValidationError("Either a cashier account or a destination bank account is required.")

    # ── Resolve tier ─────────────────────────────────────────────────────────
    tier = _resolve_tier(savings_account.owner, amount)
    if tier is None:
        # Fall back to 1 approver if no tier is configured
        required_approvals = 1
    else:
        required_approvals = tier.required_approvers

    # ── Create the request ───────────────────────────────────────────────────
    wr = SavingsWithdrawalRequest.objects.create(
        savings_account=savings_account,
        requested_by=requested_by,
        amount=amount,
        description=description,
        status=SavingsWithdrawalRequest.STATUS_PENDING,
        required_approvals=required_approvals,
        approvals_received=0,
        applied_tier=tier,
        cashier_account=cashier_account,
        destination_bank_account=destination_bank_account,
        owner=savings_account.owner,
        branch=savings_account.branch,
    )

    # Create one pending step per required approver
    for step_num in range(1, required_approvals + 1):
        WithdrawalApprovalStep.objects.create(
            withdrawal_request=wr,
            step_number=step_num,
        )

    return wr


@db_transaction.atomic
def process_withdrawal_approval(
    step: WithdrawalApprovalStep,
    approver: User,
    approved: bool,
    comment: str = '',
) -> SavingsWithdrawalRequest:
    """
    Record an approver's decision on one approval step.

    When approved=True and all required steps are approved, the withdrawal
    is executed atomically (GL entries created, status set to completed).

    When approved=False, the entire request is rejected and no GL movement happens.

    Raises:
        ValidationError: if the approver is not eligible, or the step is already decided.
    """
    wr: SavingsWithdrawalRequest = step.withdrawal_request

    # Guard: request must still be pending or partially approved
    if wr.status not in (
        SavingsWithdrawalRequest.STATUS_PENDING,
        SavingsWithdrawalRequest.STATUS_PARTIAL,
    ):
        raise ValidationError(
            f"Cannot respond to a request with status '{wr.get_status_display()}'."
        )

    if step.status != WithdrawalApprovalStep.STATUS_PENDING:
        raise ValidationError("This approval step has already been decided.")

    # Eligibility: approver must belong to one of the tier's approver_roles
    if wr.applied_tier:
        allowed_groups = set(wr.applied_tier.approver_roles or [])
        user_groups = set(approver.groups.values_list('name', flat=True))
        if allowed_groups and not (allowed_groups & user_groups):
            raise ValidationError(
                f"You are not authorised to approve withdrawals at this tier. "
                f"Required role(s): {', '.join(allowed_groups)}."
            )

    # Record the decision
    step.approver = approver
    step.status = (
        WithdrawalApprovalStep.STATUS_APPROVED if approved
        else WithdrawalApprovalStep.STATUS_REJECTED
    )
    step.comment = comment
    step.responded_at = timezone.now()
    step.save()

    if not approved:
        wr.status = SavingsWithdrawalRequest.STATUS_REJECTED
        wr.save(update_fields=['status', 'updated_at'])
        return wr

    # Count approvals
    wr.approvals_received = wr.approval_steps.filter(
        status=WithdrawalApprovalStep.STATUS_APPROVED
    ).count()

    if wr.is_fully_approved:
        _execute_withdrawal(wr, approver)
    else:
        wr.status = SavingsWithdrawalRequest.STATUS_PARTIAL
        wr.save(update_fields=['approvals_received', 'status', 'updated_at'])

    return wr


def _execute_withdrawal(wr: SavingsWithdrawalRequest, executed_by: User) -> None:
    """
    Physically move money: create GL journal entry, then mark request completed.
    Also applies cycle-break penalty BEFORE the withdrawal if applicable.
    """
    savings_account = wr.savings_account

    # Apply cycle-break penalty if applicable
    penalty_amount, _ = apply_cycle_break_penalty(
        savings_account, wr.amount, executed_by
    )

    # Actual GL withdrawal via SavingsAccount.withdraw()
    cashier = wr.cashier_account
    if cashier is None and wr.destination_bank_account:
        cashier = wr.destination_bank_account.gl_account

    journal = savings_account.withdraw(
        amount=wr.amount,
        description=wr.description or f"Withdrawal request #{wr.pk}",
        cashier_account=cashier,
        transacted_by=executed_by,
    )

    wr.status = SavingsWithdrawalRequest.STATUS_COMPLETED
    wr.journal_entry = journal
    wr.save(update_fields=['status', 'journal_entry', 'approvals_received', 'updated_at'])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_savings_config(savings_account: SavingsAccount) -> SavingsProduct:
    try:
        return savings_account.product.savings_product_config
    except SavingsProduct.DoesNotExist:
        raise ValidationError(
            f"No SavingsProduct configuration found for product '{savings_account.product.name}'."
        )
