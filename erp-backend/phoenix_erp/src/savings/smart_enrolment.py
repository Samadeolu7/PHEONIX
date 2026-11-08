"""
Smart Savings enrolment with a chosen amount.

Smart Savings money lives in its OWN savings account (product SAV-SMART), not
inside the client's Regular / Daily Contribution account. Enrolling moves a
chosen amount out of a source savings account into the Smart account and
starts a 3-month cycle on it. Interest, the early-withdrawal penalty and the
payout notice then only ever touch the Smart account.

The amount that may leave the source account follows the same rules as a
withdrawal from it:
  - source must be active (not frozen/closed/dormant)
  - compulsory savings: the source's minimum_balance must stay behind
  - loan cover: at least 10% of the client's outstanding loan debt must stay
    behind in the source (SavingsAccount.LOAN_COVER_RATIO)
  - active holds and open withdrawal requests on the source are already
    spoken for
  - the source product's min/max transaction amount
  - the source must not itself be in an old-style active Smart cycle (moving
    money out would break that cycle)

Backdating (one-off fixes, via the enrol_smart_savings_backdated command):
the transfer is dated on the real start date, so the source must also have
held enough money on every day from then until today. Missed cycles are then
posted by tasks.process_smart_savings_account, each on its own maturity date.
"""
from datetime import date
from decimal import Decimal, ROUND_DOWN

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import (
    SMART_SAVINGS_CYCLE_MONTHS,
    SMART_SAVINGS_INTEREST_RATE,
    SavingsAccount,
    SavingsProduct,
    SavingsWithdrawalRequest,
    SmartSavingsAccount,
)

SMART_PRODUCT_CODE = 'SAV-SMART'
_SAVINGS_PARENT_CODE = '2140'
_LIVE_LOAN_STATUSES = ('disbursed', 'active', 'defaulted')
_CENT = Decimal('0.01')
# Share of the client's loan debt that must stay in the source savings.
LOAN_COVER_RATIO = getattr(SavingsAccount, 'LOAN_COVER_RATIO', Decimal('0.10'))


def _d(v) -> Decimal:
    return Decimal(str(v or 0))


# ---------------------------------------------------------------------------
# Product setup
# ---------------------------------------------------------------------------

def get_or_create_smart_product(branch, tenant, user):
    """
    Return this branch's Smart Savings product, creating it (and its savings
    config) the first time. Interest-expense / penalty-income GL accounts and
    the penalty rate are copied from an existing cycle product in the branch
    (the legacy SAV-DC config) when there is one.
    """
    from accounts.models import Account
    from products.models import Product

    product, _ = Product.objects.get_or_create(
        code=SMART_PRODUCT_CODE,
        tenant=tenant,
        branch=branch,
        defaults=dict(
            name='Smart Savings',
            product_type='SAVINGS',
            product_class='FINANCIAL',
            description=(
                f'{SMART_SAVINGS_CYCLE_MONTHS}-month cycle, '
                f'{SMART_SAVINGS_INTEREST_RATE * 100:.0f}% interest on the opening balance at maturity.'
            ),
            owner=user,
            created_by=user,
        ),
    )

    if SavingsProduct.objects.filter(product=product).exists():
        return product

    template = (
        SavingsProduct.objects
        .filter(branch=branch, has_savings_cycle=True,
                interest_expense_account__isnull=False, penalty_income_account__isnull=False)
        .exclude(product=product)
        .first()
    )
    if template:
        expense_acct = template.interest_expense_account
        penalty_acct = template.penalty_income_account
        penalty_rate = template.cycle_break_penalty_rate or Decimal('0.00')
    else:
        from .tasks import _get_or_create_smart_savings_interest_expense_account
        expense_acct = _get_or_create_smart_savings_interest_expense_account(owner=user, branch=branch)
        income_parent = (
            Account.objects
            .filter(tenant=tenant, branch=branch, account_type=Account.INCOME,
                    account_level=Account.LEVEL_PARENT)
            .first()
        )
        penalty_acct, _ = Account.objects.get_or_create(
            code='4200-SSPNL',
            tenant=tenant,
            branch=branch,
            defaults=dict(
                name='Smart Savings Penalty Income',
                account_type=Account.INCOME,
                account_level=Account.LEVEL_CHILD if income_parent else Account.LEVEL_PARENT,
                parent=income_parent,
                owner=user,
                created_by=user,
                is_system_account=True,
            ),
        )
        penalty_rate = Decimal('0.00')  # admin sets it on the Savings Products page

    SavingsProduct.objects.create(
        product=product,
        is_daily_contribution=False,
        first_deposit_is_income=False,
        has_savings_cycle=True,
        cycle_length_months=SMART_SAVINGS_CYCLE_MONTHS,
        cycle_interest_rate=SMART_SAVINGS_INTEREST_RATE * 100,
        cycle_break_penalty_rate=penalty_rate,
        cycle_auto_renew=True,
        interest_expense_account=expense_acct,
        penalty_income_account=penalty_acct,
        withdrawal_needs_approval=True,
        only_account_manager_can_withdraw=False,
        owner=user,
        tenant=tenant,
        branch=branch,
        created_by=user,
    )
    return product


# ---------------------------------------------------------------------------
# How much may leave the source account
# ---------------------------------------------------------------------------

def client_loan_outstanding(client) -> Decimal:
    from loans.models import LoanAccount
    total = Decimal('0.00')
    for loan in LoanAccount.objects.filter(client=client, status__in=_LIVE_LOAN_STATUSES):
        total += _d(loan.total_outstanding)
    return max(total, Decimal('0.00'))


def balance_at_end_of(sav: SavingsAccount, day: date) -> Decimal:
    """End-of-day balance on `day`: today's balance minus everything posted after it."""
    from transactions.models import TransactionEntry
    later = TransactionEntry.objects.filter(
        account=sav.account, transaction__date__gt=day, transaction__is_reversed=False)
    cr = _d(later.filter(side=TransactionEntry.CREDIT).aggregate(t=Sum('amount'))['t'])
    dr = _d(later.filter(side=TransactionEntry.DEBIT).aggregate(t=Sum('amount'))['t'])
    return _d(sav.current_balance) - cr + dr


def lowest_balance_since(source: SavingsAccount, start: date) -> Decimal:
    """
    Lowest end-of-day balance the source account has had from `start` up to
    now, rebuilt backwards from today's balance through every later GL line.
    """
    from transactions.models import TransactionEntry

    balance = _d(source.current_balance)
    lowest = balance
    lines = (
        TransactionEntry.objects
        .filter(account=source.account, transaction__date__gt=start, transaction__is_reversed=False)
        .values_list('transaction__date', 'side', 'amount')
        .order_by('-transaction__date')
    )
    current_day = None
    for day, side, amount in lines:
        if current_day is not None and day != current_day:
            lowest = min(lowest, balance)  # end of the earlier day
        current_day = day
        # Savings is a liability: credits raised the balance, so undo them.
        balance -= _d(amount) if side == TransactionEntry.CREDIT else -_d(amount)
    return min(lowest, balance)  # balance now = end of `start`


def max_movable_to_smart(source: SavingsAccount, start: date | None = None) -> dict:
    """
    Largest amount that can move from `source` into Smart Savings, with the
    reason for each limit so the UI can explain it.
    """
    today = timezone.localdate()
    start = start or today
    source.account.refresh_from_db(fields=['balance'])
    balance = _d(source.current_balance)

    holds = _d(source.transaction_holds.filter(status='active').aggregate(
        t=Sum('amount'))['t'])
    open_wr = _d(SavingsWithdrawalRequest.objects.filter(
        savings_account=source,
        status__in=(SavingsWithdrawalRequest.STATUS_PENDING, SavingsWithdrawalRequest.STATUS_PARTIAL,
                    SavingsWithdrawalRequest.STATUS_APPROVED),
    ).aggregate(t=Sum('amount'))['t'])
    minimum = _d(source.minimum_balance)
    loan_debt = client_loan_outstanding(source.client)
    loan_cover = (loan_debt * LOAN_COVER_RATIO).quantize(_CENT)
    must_stay = max(minimum, loan_cover)

    cap = balance - holds - open_wr - must_stay
    lowest_since = None
    if start < today:
        lowest_since = lowest_balance_since(source, start)
        cap = min(cap, lowest_since - must_stay)

    max_txn = source.product.max_transaction_amount
    if max_txn:
        cap = min(cap, _d(max_txn))

    return {
        'balance': balance,
        'holds': holds,
        'open_withdrawals': open_wr,
        'minimum_balance': minimum,
        'loan_outstanding': loan_debt,
        'loan_cover_required': loan_cover,
        'must_stay': must_stay,
        'lowest_balance_since_start': lowest_since,
        'min_transaction_amount': _d(source.product.min_transaction_amount) or None,
        'max_transaction_amount': _d(max_txn) if max_txn else None,
        'max_movable': max(cap, Decimal('0.00')).quantize(_CENT, rounding=ROUND_DOWN),
    }


def check_source(source: SavingsAccount):
    if source.status != 'active':
        raise ValidationError(f'Source account {source.account_number} is {source.status}; it must be active.')
    if source.product.code == SMART_PRODUCT_CODE:
        raise ValidationError('Pick the account the money is coming FROM, not the Smart Savings account.')
    smart = getattr(source, 'smart_account', None)
    if smart is not None and smart.is_active:
        raise ValidationError(
            f'{source.account_number} is itself in an active Smart Savings cycle (older setup); '
            'moving money out of it would break that cycle.'
        )


# ---------------------------------------------------------------------------
# Enrol
# ---------------------------------------------------------------------------

@transaction.atomic
def enrol_with_amount(source: SavingsAccount, amount, user, start_date: date | None = None):
    """
    Move `amount` from `source` into the client's Smart Savings account (opened
    if needed) and start a cycle on `start_date` (default today). Returns the
    SmartSavingsAccount.
    """
    from accounts.models import Account
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )

    today = timezone.localdate()
    start_date = start_date or today
    if start_date > today:
        raise ValidationError('Start date cannot be in the future.')

    source = SavingsAccount.objects.select_for_update(of=('self',)).select_related(
        'client', 'product', 'account', 'branch').get(pk=source.pk)
    check_source(source)

    amount = _d(amount).quantize(_CENT)
    if amount <= 0:
        raise ValidationError('Amount must be more than zero.')
    limits = max_movable_to_smart(source, start_date)
    min_txn = limits['min_transaction_amount']
    if min_txn and amount < min_txn:
        raise ValidationError(f'Minimum transaction on {source.product.name} is ₦{min_txn:,.2f}.')
    if amount > limits['max_movable']:
        parts = [f"₦{limits['must_stay']:,.2f} must stay in {source.account_number} "
                 f"(compulsory ₦{limits['minimum_balance']:,.2f}, "
                 f"10% of loan debt ₦{limits['loan_cover_required']:,.2f})"]
        if limits['holds']:
            parts.append(f"₦{limits['holds']:,.2f} on hold")
        if limits['open_withdrawals']:
            parts.append(f"₦{limits['open_withdrawals']:,.2f} in open withdrawal requests")
        if limits['lowest_balance_since_start'] is not None:
            parts.append(f"lowest balance since {start_date} was ₦{limits['lowest_balance_since_start']:,.2f}")
        raise ValidationError(
            f"At most ₦{limits['max_movable']:,.2f} can move to Smart Savings: " + '; '.join(parts) + '.'
        )

    client = source.client
    product = get_or_create_smart_product(source.branch, source.tenant, user)

    smart_sav = (
        SavingsAccount.objects.select_for_update(of=('self',))
        .filter(client=client, product=product).exclude(status='closed').first()
    )
    if smart_sav is not None:
        existing = getattr(smart_sav, 'smart_account', None)
        if existing is not None and existing.is_active:
            raise ValidationError(
                f'{client.full_name} is already in Smart Savings ({smart_sav.account_number}, '
                f'cycle started {existing.start_date}).'
            )
        if start_date < today and smart_sav.opened_on > start_date:
            raise ValidationError(
                f'The Smart account {smart_sav.account_number} was opened on {smart_sav.opened_on}; '
                'cannot backdate a cycle before that.'
            )
    else:
        gl = Account.create_with_parent(
            parent_code=_SAVINGS_PARENT_CODE,
            child_data={
                'name': f'Smart Savings – {client.full_name}',
                'allow_manual_entries': True,
                'owner': source.owner,
                'branch': source.branch,
                'tenant': source.tenant,
                'created_by': user,
            },
        )
        smart_sav = SavingsAccount.objects.create(
            client=client,
            account=gl,
            product=product,
            account_number=gl.code,
            nickname=f"{client.first_name}'s Smart Savings",
            status='active',
            opened_on=start_date,
            interest_rate=Decimal('0.00'),
            interest_calculation_method='monthly',
            minimum_balance=Decimal('0.00'),
            owner=source.owner,
            branch=source.branch,
            tenant=source.tenant,
            created_by=user,
        )

    # Move the money: Dr source savings (balance down), Cr Smart savings (balance up).
    series, _ = TransactionSeries.objects.get_or_create(
        code='SVSMT', defaults={'description': 'Transfer to Smart Savings'})
    journal = JournalEntry.objects.create(
        series=series,
        date=start_date,
        description=(f'Transfer to Smart Savings – {client.full_name} '
                     f'({source.account_number} → {smart_sav.account_number})'),
        owner=source.owner,
        branch=source.branch,
        tenant=source.tenant,
        created_by=user,
    )
    JournalEntryLine.objects.create(transaction=journal, account=source.account,
                                    side=JournalEntryLine.DEBIT, amount=amount)
    JournalEntryLine.objects.create(transaction=journal, account=smart_sav.account,
                                    side=JournalEntryLine.CREDIT, amount=amount)
    journal.post()

    source.last_transaction_date = today
    source.save(update_fields=['last_transaction_date'])
    smart_sav.last_transaction_date = today
    smart_sav.save(update_fields=['last_transaction_date'])

    # Opening balance = what sat in the Smart account at the end of the start
    # day (this transfer plus anything left over from an earlier cycle).
    smart_sav.account.refresh_from_db()
    opening = balance_at_end_of(smart_sav, start_date)
    smart, created = SmartSavingsAccount.objects.get_or_create(
        savings=smart_sav,
        defaults={'is_active': True, 'start_date': start_date, 'opening_balance': opening},
    )
    if not created:
        smart.is_active = True
        smart.start_date = start_date
        smart.opening_balance = opening
        smart.last_interest_date = None
        smart.save(update_fields=['is_active', 'start_date', 'opening_balance', 'last_interest_date'])

    from common.models import FinancialAuditLog, log_financial_event
    log_financial_event(
        FinancialAuditLog.SAVINGS_WITHDRAW,
        acted_by=user,
        record_type='SavingsAccount',
        record_id=str(source.pk),
        amount=amount,
        description=f'Moved to Smart Savings {smart_sav.account_number} (cycle from {start_date})',
        extra={'source': source.account_number, 'smart_account': smart_sav.account_number,
               'journal_entry_id': str(journal.pk), 'start_date': str(start_date)},
    )
    return smart
