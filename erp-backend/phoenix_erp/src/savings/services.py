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
    SavingsAccount, SavingsProduct, ContributionSchedule,
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
    committed_amount: Decimal | None = None,
) -> tuple[object | None, bool]:
    """
    Called before every deposit on a daily-contribution account.

    Checks whether this is the FIRST deposit of the current calendar month.
    If yes AND the linked SavingsProduct has first_deposit_is_income=True,
    sweeps this client's committed contribution amount to income (does NOT
    credit the savings balance for that portion) and returns
    (journal_entry, True). The committed amount is capped at `amount` itself
    when the client under-pays.

    `amount` collected may exceed what this specific client was expected to
    contribute that day — e.g. several days' worth paid on one instrument.
    Only the committed amount is swept to income; any excess is deposited to
    the savings balance normally as part of this same call, so callers must
    still treat a True return as "the full amount has been handled".

    `committed_amount` lets a caller that already knows the exact expected
    amount for this deposit (e.g. ContributionScheduleViewSet.mark_paid,
    which is paying a specific, possibly backdated, schedule row) pass it in
    directly. When omitted, it is looked up from ContributionSchedule for
    (savings_account, expected_date=deposit_date), falling back to the
    product's default contribution_amount.

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

    # Smart savers are exempt from the first-deposit income charge for the
    # duration of their cycle — they accumulate instead of contributing income.
    try:
        if savings_account.smart_account.is_active:
            return None, False
    except SmartSavingsAccount.DoesNotExist:
        pass

    today = deposit_date if deposit_date else timezone.now().date()

    # Check if any deposit already exists this month for this account.
    # Two cases count as "already deposited this month":
    #  1. A normal deposit already credited the savings account itself.
    #  2. The first-deposit-income charge was already posted this month — that
    #     credits first_deposit_income_account, NOT savings_account.account, so
    #     it must be tracked separately (last_first_deposit_income_date) rather
    #     than inferred from credits on the savings account. Relying solely on
    #     (1) previously meant every deposit in the month kept being classified
    #     as "first" since the income-diverted deposit never left a credit on
    #     the savings account — the entire month's contributions were swept to
    #     income instead of only the first one.
    from transactions.models import TransactionEntry as JournalEntryLine
    already_deposited = JournalEntryLine.objects.filter(
        account=savings_account.account,
        side=JournalEntryLine.CREDIT,
        transaction__date__year=today.year,
        transaction__date__month=today.month,
    ).exists()

    already_income_posted = (
        savings_account.last_first_deposit_income_date is not None
        and savings_account.last_first_deposit_income_date.year == today.year
        and savings_account.last_first_deposit_income_date.month == today.month
    )

    if already_deposited or already_income_posted:
        # Not the first deposit — normal flow
        return None, False

    # Cap the sweep at what THIS client was actually expected to contribute
    # today — not the raw amount collected. An officer may post several
    # days' worth on a single instrument; only the committed portion is
    # income, the rest is a genuine deposit and must still reach the
    # client's savings balance.
    if committed_amount is None:
        schedule_row = ContributionSchedule.objects.filter(
            savings_account=savings_account, expected_date=today,
        ).first()
        committed_amount = (
            schedule_row.expected_amount if schedule_row
            else savings_account.effective_contribution_amount
        )

    if committed_amount and committed_amount > Decimal('0.00') and amount > committed_amount:
        income_amount = committed_amount
        excess_amount = amount - committed_amount
    else:
        income_amount = amount
        excess_amount = Decimal('0.00')

    # First deposit of the month → post the committed portion as income
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
        tenant=savings_account.tenant,
    )

    # Debit: Cash / Cashier account (ASSET)
    TransactionEntry.objects.create(
        transaction=journal,
        account=cashier_account,
        side=TransactionEntry.DEBIT,
        amount=income_amount,
    )

    # Credit: Income account (does NOT touch savings balance)
    TransactionEntry.objects.create(
        transaction=journal,
        account=config.first_deposit_income_account,
        side=TransactionEntry.CREDIT,
        amount=income_amount,
    )

    journal.post()

    savings_account.last_transaction_date = today
    savings_account.last_first_deposit_income_date = today
    savings_account.save(update_fields=['last_transaction_date', 'last_first_deposit_income_date'])

    if excess_amount > Decimal('0.00'):
        savings_account.deposit(
            amount=excess_amount,
            description=(
                f"Deposit above expected first-day amount – "
                f"{savings_account.account_number}"
            ),
            cashier_account=cashier_account,
            transacted_by=transacted_by,
            date=today,
        )

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
        tenant=savings_account.tenant,
    )

    TransactionEntry.objects.create(
        transaction=journal,
        account=config.interest_expense_account,
        side=TransactionEntry.DEBIT,
        amount=interest_amount,
    )
    TransactionEntry.objects.create(
        transaction=journal,
        account=savings_account.account,
        side=TransactionEntry.CREDIT,
        amount=interest_amount,
    )

    journal.post()

    # Audit event
    SmartSavingsEvent.objects.create(
        account=smart,
        event_type=SmartSavingsEvent.INTEREST,
        amount=interest_amount,
        details=f"Rate: {config.cycle_interest_rate}%, Base: ₦{opening_balance:,.2f}",
    )

    maturity_date = smart.maturity_date

    if config.cycle_auto_renew:
        # Next cycle begins from the exact maturity date (not today) to prevent
        # drift when the task or this service runs after the due date.
        smart.last_interest_date = maturity_date
        smart.start_date = maturity_date
        smart.opening_balance = savings_account.current_balance  # post-interest
        smart.is_active = True
        smart.save(update_fields=['last_interest_date', 'start_date', 'opening_balance', 'is_active'])
    else:
        smart.last_interest_date = maturity_date
        smart.is_active = False
        smart.save(update_fields=['last_interest_date', 'is_active'])

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
        tenant=savings_account.tenant,
    )

    TransactionEntry.objects.create(
        transaction=journal,
        account=savings_account.account,
        side=TransactionEntry.DEBIT,
        amount=penalty_amount,
    )
    TransactionEntry.objects.create(
        transaction=journal,
        account=config.penalty_income_account,
        side=TransactionEntry.CREDIT,
        amount=penalty_amount,
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

    # Reset cycle — the client stays enrolled in Smart Savings.
    # opening_balance is set to the post-penalty balance here; _execute_withdrawal
    # updates it again after the actual withdrawal so the new cycle starts from
    # the final post-withdrawal balance.
    smart.start_date = today
    smart.opening_balance = savings_account.current_balance  # post-penalty, pre-withdrawal
    smart.save(update_fields=['start_date', 'opening_balance'])

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

    # ── Account status check ──────────────────────────────────────────────────
    if savings_account.status in ('frozen', 'closed'):
        raise ValidationError(
            f"Cannot initiate a withdrawal on a {savings_account.status} account."
        )

    # ── Permission check ─────────────────────────────────────────────────────
    if config and config.only_account_manager_can_withdraw:
        client_manager = savings_account.client.account_manager
        if not client_manager or client_manager.pk != requested_by.pk:
            raise ValidationError(
                "Only the client's account manager may initiate a withdrawal on this product."
            )

    # ── Balance check (holds-aware) ───────────────────────────────────────────
    if amount <= Decimal('0.00'):
        raise ValidationError("Withdrawal amount must be positive.")

    withdrawable = savings_account.calculate_available_balance() - savings_account.minimum_balance
    if amount > withdrawable:
        if savings_account.minimum_balance > Decimal('0.00'):
            raise ValidationError(
                f"Insufficient funds: ₦{savings_account.minimum_balance:,.2f} is held as "
                f"compulsory savings and cannot be withdrawn. "
                f"Available for withdrawal: ₦{max(withdrawable, Decimal('0.00')):,.2f}, "
                f"requested: ₦{amount:,.2f}."
            )
        raise ValidationError(
            f"Insufficient funds: available ₦{savings_account.available_balance:,.2f}, "
            f"requested ₦{amount:,.2f}."
        )

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
        # tenant must be set so OwnerBranchManager's tenant filter can find the record
        tenant=getattr(savings_account.branch, 'tenant', None) or getattr(requested_by, 'tenant', None),
    )

    # Create one pending step per required approver
    _tenant = wr.tenant
    _owner = wr.owner
    for step_num in range(1, required_approvals + 1):
        WithdrawalApprovalStep.objects.create(
            withdrawal_request=wr,
            step_number=step_num,
            tenant=_tenant,
            owner=_owner,
        )

    return wr


@db_transaction.atomic
def process_withdrawal_approval(
    step: WithdrawalApprovalStep,
    approver: User,
    approved: bool,
    comment: str = '',
    payment_method: str | None = None,
    cashier_account_id: int | None = None,
) -> SavingsWithdrawalRequest:
    """
    Record an approver's decision on one approval step.

    On the FIRST approval step (when payment_method is not yet set on the request),
    the approver must also select the payment routing:
      payment_method = 'cash'  → cashier_account_id required; amount must be < ₦50,000
      payment_method = 'bank'  → director selects the bank account at disbursal time

    When approved=True and all required steps are approved, the withdrawal moves
    to STATUS_APPROVED so a separate disburser (3rd person) can release the funds.
    """
    CASH_LIMIT = Decimal('50000.00')
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

    # Creator may not also be an approver
    if approver.pk == wr.requested_by_id:
        raise ValidationError(
            "The person who created the withdrawal request cannot also approve it "
            "(maker-checker violation)."
        )

    # Same user may not approve more than one step on the same request
    already_approved_by_user = wr.approval_steps.filter(
        status=WithdrawalApprovalStep.STATUS_APPROVED,
        approver=approver,
    ).exists()
    if already_approved_by_user:
        raise ValidationError(
            "You have already approved a step on this withdrawal request."
        )

    # Eligibility: approver must belong to one of the tier's approver_roles
    if wr.applied_tier:
        allowed_groups = set(wr.applied_tier.approver_roles or [])
        user_groups = set(approver.groups.values_list('name', flat=True))
        if allowed_groups and not (allowed_groups & user_groups):
            raise ValidationError(
                f"You are not authorised to approve withdrawals at this tier. "
                f"Required role(s): {', '.join(allowed_groups)}."
            )

    # ── Payment method selection (first step only) ────────────────────────────
    if approved and wr.payment_method is None:
        # Branch Manager must select payment routing on the first approval
        if payment_method not in ('cash', 'bank'):
            raise ValidationError(
                "Payment method must be selected: 'cash' or 'bank'."
            )
        if payment_method == 'cash':
            if wr.amount >= CASH_LIMIT:
                raise ValidationError(
                    f"Withdrawals of ₦{CASH_LIMIT:,.0f} or above must be disbursed "
                    "via bank transfer, not cash."
                )
            if not cashier_account_id:
                raise ValidationError(
                    "A cashier account must be selected for cash withdrawals."
                )
            from accounts.models import Account
            try:
                cashier = Account.objects.get(pk=cashier_account_id)
            except Account.DoesNotExist:
                raise ValidationError("Cashier account not found.")
            wr.cashier_account = cashier
        wr.payment_method = payment_method
        wr.save(update_fields=['payment_method', 'cashier_account_id', 'updated_at'])
    # ── End payment method selection ──────────────────────────────────────────

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
        # All approvals collected — move to fully_approved so a separate disburser
        # (3rd person, different from creator and all approvers) can release the funds.
        wr.status = SavingsWithdrawalRequest.STATUS_APPROVED
        wr.save(update_fields=['approvals_received', 'status', 'updated_at'])
    else:
        wr.status = SavingsWithdrawalRequest.STATUS_PARTIAL
        wr.save(update_fields=['approvals_received', 'status', 'updated_at'])

    return wr


def disburse_withdrawal(
    wr: SavingsWithdrawalRequest,
    disbursed_by: User,
    destination_bank_account=None,
) -> SavingsWithdrawalRequest:
    """
    Third-role disbursement: a user different from the creator AND all approvers
    physically releases the funds.

    Cash withdrawals: cashier_account was set by the Branch Manager during approval.
      Director just confirms — no bank account selection needed.

    Bank withdrawals: Director must supply destination_bank_account at disbursal time.
    """
    if wr.status != SavingsWithdrawalRequest.STATUS_APPROVED:
        raise ValidationError(
            "Withdrawal must be fully approved before it can be disbursed."
        )

    if not wr.payment_method:
        raise ValidationError(
            "Payment method has not been set on this withdrawal request. "
            "Please ensure the Branch Manager's approval step has been completed."
        )

    if wr.payment_method == SavingsWithdrawalRequest.PAYMENT_BANK:
        if not destination_bank_account:
            raise ValidationError(
                "A destination bank account must be selected for bank disbursements."
            )
    elif wr.payment_method == SavingsWithdrawalRequest.PAYMENT_CASH:
        if not wr.cashier_account:
            raise ValidationError(
                "No cashier account is configured for this cash withdrawal. "
                "Please contact the Branch Manager."
            )

    # Creator ≠ disburser
    if disbursed_by.pk == wr.requested_by_id:
        raise ValidationError(
            "The person who created the withdrawal request cannot also disburse it "
            "(maker-checker violation)."
        )

    # No approver may disburse
    approver_ids = set(
        wr.approval_steps
        .filter(status=WithdrawalApprovalStep.STATUS_APPROVED)
        .values_list('approver_id', flat=True)
    )
    if disbursed_by.pk in approver_ids:
        raise ValidationError(
            "An approver of this withdrawal request cannot also disburse it "
            "(maker-checker violation)."
        )

    _execute_withdrawal(wr, disbursed_by, destination_bank_account=destination_bank_account)
    return wr


def _execute_withdrawal(
    wr: SavingsWithdrawalRequest,
    executed_by: User,
    destination_bank_account=None,
) -> None:
    """
    Physically move money: create GL journal entry, then mark request completed.
    Also applies cycle-break penalty BEFORE the withdrawal if applicable.

    Args:
        destination_bank_account: BankAccount chosen by the disburser at payout time.
            Takes precedence over the one stored on the request (which may be None).
    """
    savings_account = wr.savings_account

    # Apply cycle-break penalty if applicable
    penalty_amount, _ = apply_cycle_break_penalty(
        savings_account, wr.amount, executed_by
    )

    # Actual GL withdrawal via SavingsAccount.withdraw()
    bank_acc = destination_bank_account or wr.destination_bank_account
    cashier = wr.cashier_account
    if cashier is None and bank_acc:
        cashier = bank_acc.gl_account

    journal = savings_account.withdraw(
        amount=wr.amount,
        description=wr.description or f"Withdrawal request #{wr.pk}",
        cashier_account=cashier,
        transacted_by=executed_by,
    )

    # If a penalty reset the cycle, the opening_balance was set to the
    # post-penalty balance. Now that the withdrawal is done, pin it to the
    # final post-withdrawal balance so the next interest cycle is correct.
    try:
        smart = savings_account.smart_account
        if smart.is_active:
            smart.opening_balance = savings_account.current_balance
            smart.save(update_fields=['opening_balance'])
    except SmartSavingsAccount.DoesNotExist:
        pass

    from django.utils import timezone as tz
    wr.status = SavingsWithdrawalRequest.STATUS_COMPLETED
    wr.journal_entry = journal
    wr.disbursed_by = executed_by
    wr.disbursed_at = tz.now()
    wr.save(update_fields=['status', 'journal_entry', 'disbursed_by', 'disbursed_at', 'approvals_received', 'updated_at'])


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
