"""
savings/tasks.py

Celery tasks for the Savings module.

Tasks:
    apply_smart_savings_interest  — Daily task: find matured Smart Savings accounts,
                                    credit 6% interest, reset the 3-month cycle.
"""
from decimal import Decimal, ROUND_HALF_UP

from celery import shared_task
from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.utils import timezone


def _get_or_create_smart_savings_interest_expense_account(owner, branch):
    """
    Return the branch-level GL account used as the DR leg of smart-savings
    interest journal entries.

    We look for an EXPENSE account whose name contains 'Smart Savings Interest'.
    If it does not exist we create one under the first EXPENSE parent account
    available on this branch (or create a standalone EXPENSE account).

    Looked up by (tenant, branch) only — NOT owner. `owner` is a per-user
    "who manages this record" field (see common/base.py's TimeStampedModel),
    while Account's real uniqueness constraint is scoped by (code, tenant,
    branch) with no owner involved (accounts/models.py). Filtering this
    lookup by owner meant every Smart Savings account whose owner differed
    from whichever one happened to be processed first in a branch would
    never find the account that first run already created, fall through to
    the fallback creation, and hit a real IntegrityError on the duplicate
    hardcoded code='5900' for that (tenant, branch) — silently caught and
    logged by the per-account try/except in apply_smart_savings_interest,
    forever, for every affected account, with nothing visible in the UI.
    Found 2026-08-26 tracing a client's Smart Savings interest that had
    been overdue 15+ days with no explanation anywhere. Now uses
    get_or_create on the actual unique key (code, tenant, branch) instead
    of a separate filter-then-create, so a concurrent run can't hit the
    same collision either.
    """
    from accounts.models import Account

    tenant = getattr(branch, 'tenant', None)

    acct = (
        Account.objects
        .filter(
            tenant=tenant,
            branch=branch,
            account_type=Account.EXPENSE,
            name__icontains='Smart Savings Interest',
        )
        .first()
    )
    if acct:
        return acct

    # Find a parent EXPENSE account to nest under
    parent = (
        Account.objects
        .filter(tenant=tenant, branch=branch, account_type=Account.EXPENSE,
                account_level=Account.LEVEL_PARENT)
        .first()
    )

    acct, _ = Account.objects.get_or_create(
        code='5900',          # Fallback; may collide — admin should rename/re-code
        tenant=tenant,
        branch=branch,
        defaults=dict(
            owner=owner,
            name='Smart Savings Interest Expense',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_CHILD if parent else Account.LEVEL_PARENT,
            parent=parent,
            is_system_account=True,
            allow_manual_entries=False,
        ),
    )
    return acct


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True)
def apply_smart_savings_interest(self):  # noqa: ARG002
    """
    Daily task: credit 6% interest to all matured Smart Savings accounts.

    Maturity condition: ``is_active=True`` and ``start_date <= today − 3 months``.

    GL entry (SSI series):
        Dr. Smart Savings Interest Expense  (EXPENSE)
        Cr. Member Savings GL account       (SAVINGS)

    After posting:
        - ``last_interest_date`` = maturity_date
        - ``start_date`` = maturity_date  (next cycle begins from maturity, not today)
        - ``opening_balance`` = post-interest savings balance
    """
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )
    from .models import SmartSavingsAccount, SmartSavingsEvent

    today = timezone.localdate()

    # Cheap pre-filter; exact checks happen under the row lock.
    candidate_ids = list(
        SmartSavingsAccount.objects
        .filter(is_active=True, start_date__lte=today - relativedelta(months=3))
        .values_list('id', flat=True)
    )

    processed = 0
    skipped = 0

    for acct_id in candidate_ids:
        try:
            with transaction.atomic():
                # Lock the row to prevent concurrent double-processing.
                acct = (
                    SmartSavingsAccount.objects
                    .select_for_update()
                    .select_related(
                        'savings_account',
                        'savings_account__account',
                        'savings_account__client',
                    )
                    .get(pk=acct_id)
                )

                maturity_date = acct.start_date + relativedelta(months=3)

                # Idempotency: already processed today
                if acct.last_interest_date == today:
                    skipped += 1
                    continue

                # Re-check maturity under the lock (pre-filter may be coarse)
                if today < maturity_date:
                    skipped += 1
                    continue

                savings = acct.savings_account
                base_balance = (
                    acct.opening_balance
                    if acct.opening_balance is not None
                    else savings.current_balance
                )

                if base_balance <= 0:
                    # No positive balance — reset cycle, skip interest posting
                    acct.last_interest_date = today
                    acct.start_date = today
                    acct.opening_balance = savings.current_balance
                    acct.save(update_fields=['last_interest_date', 'start_date', 'opening_balance'])
                    skipped += 1
                    continue

                interest = (base_balance * Decimal('0.06')).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )

                # ── GL Journal Entry ─────────────────────────────────────
                expense_account = _get_or_create_smart_savings_interest_expense_account(
                    owner=savings.owner,
                    branch=savings.branch,
                )

                series, _ = TransactionSeries.objects.get_or_create(
                    code='SSI',
                    defaults={'description': 'Smart Savings Interest'},
                )

                journal = JournalEntry.objects.create(
                    series=series,
                    date=maturity_date,
                    description=(
                        f'Smart Savings Interest – {savings.client.full_name} '
                        f'({acct.start_date:%Y-%m-%d} → {maturity_date:%Y-%m-%d})'
                    ),
                    owner=savings.owner,
                    branch=savings.branch,
                    tenant=savings.tenant,
                )

                # Dr. Interest Expense (EXPENSE account — balance increases on DEBIT)
                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=expense_account,
                    side=JournalEntryLine.DEBIT,
                    amount=interest,
                    description=f'6% Smart Savings interest – {savings.account_number}',
                )

                # Cr. Member Savings GL account (SAVINGS/LIABILITY — balance increases on CREDIT)
                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=savings.account,
                    side=JournalEntryLine.CREDIT,
                    amount=interest,
                    description=f'Interest credited to {savings.account_number}',
                )

                journal.post()

                # ── Audit event ──────────────────────────────────────────
                SmartSavingsEvent.objects.create(
                    account=acct,
                    event_type=SmartSavingsEvent.INTEREST,
                    amount=interest,
                    details=(
                        f'6% interest on ₦{base_balance} for cycle '
                        f'{acct.start_date:%Y-%m-%d}→{maturity_date:%Y-%m-%d}. '
                        f'Journal: {journal.reference_number}'
                    ),
                )

                # ── Reset cycle ──────────────────────────────────────────
                # next cycle starts from maturity date (not today), to avoid drift
                acct.last_interest_date = maturity_date
                acct.start_date = maturity_date
                # current_balance already includes the interest credited by
                # journal.post() above — don't add it again
                acct.opening_balance = savings.current_balance
                acct.save(update_fields=['last_interest_date', 'start_date', 'opening_balance'])

                processed += 1

        except Exception as exc:  # noqa: BLE001
            # Log and continue; individual failure must not abort the whole batch.
            import logging
            logging.getLogger(__name__).exception(
                'apply_smart_savings_interest: failed for SmartSavingsAccount pk=%s: %s',
                acct_id,
                exc,
            )

    return {'processed': processed, 'skipped': skipped, 'total': len(candidate_ids)}


# ─── Regular Savings Monthly Interest ────────────────────────────────────────

import logging as _logging
_log = _logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True)
def post_monthly_savings_interest(self):  # noqa: ARG002
    """
    1st of each month @ 02:00 WAT — credit monthly interest to all active
    regular SavingsAccount records that carry a positive interest_rate.

    Idempotency: an InterestAccrual row is created with status='posted'.
    Before posting we check whether a 'posted' row already exists for the
    same account + year + month, so replays are safe.

    GL entry (SSI-MONTHLY series):
        Dr. Interest Expense on Savings  (EXPENSE)
        Cr. Member Savings GL account    (SAVINGS / LIABILITY)

    The interest is calculated as:
        monthly_rate = annual_rate / 12
        interest     = average_daily_balance (approximated by current_balance) × monthly_rate

    Returns:
        {'processed': int, 'skipped': int, 'total': int}
    """
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )
    from accounts.models import Account
    from .models import SavingsAccount, InterestAccrual

    today = timezone.localdate()
    # We always post for the previous completed month
    period_end   = today.replace(day=1) - relativedelta(days=1)
    period_start = period_end.replace(day=1)
    period_year  = period_start.year
    period_month = period_start.month

    candidate_ids = list(
        SavingsAccount.objects
        .filter(status='active', interest_rate__gt=0)
        .values_list('id', flat=True)
    )

    processed = 0
    skipped   = 0

    for acct_id in candidate_ids:
        try:
            with transaction.atomic():
                savings = (
                    SavingsAccount.objects
                    .select_for_update()
                    .select_related('account', 'client')
                    .get(pk=acct_id)
                )

                # Idempotency check: already posted for this period?
                already_posted = InterestAccrual.objects.filter(
                    account=savings,
                    calculation_date__year=period_year,
                    calculation_date__month=period_month,
                    status='posted',
                ).exists()

                if already_posted:
                    skipped += 1
                    continue

                balance = savings.current_balance or Decimal('0.00')
                if balance <= 0:
                    skipped += 1
                    continue

                # Annual rate stored as percentage (e.g. 5.00 = 5%)
                monthly_rate = Decimal(str(savings.interest_rate)) / Decimal('100') / Decimal('12')
                interest = (balance * monthly_rate).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )

                if interest <= 0:
                    skipped += 1
                    continue

                # ── Resolve GL accounts ────────────────────────────────
                # Scoped by branch only, NOT owner — see the identical fix and
                # explanation in _get_or_create_smart_savings_interest_expense_
                # account above. owner is a per-user field; an EXPENSE account
                # is shared institutional infrastructure for the branch, so
                # filtering by owner could miss an account that already exists
                # under a colleague's owner value and wrongly report "no
                # EXPENSE account" (denying real interest) even when one does.
                expense_account = (
                    Account.objects
                    .filter(
                        branch=savings.branch,
                        account_type=Account.EXPENSE,
                        name__icontains='Interest Expense on Savings',
                    )
                    .first()
                )
                if expense_account is None:
                    # Fall back: first EXPENSE account on the branch
                    expense_account = (
                        Account.objects
                        .filter(
                            branch=savings.branch,
                            account_type=Account.EXPENSE,
                        )
                        .first()
                    )
                if expense_account is None:
                    _log.error(
                        'post_monthly_savings_interest: no EXPENSE account for '
                        'SavingsAccount pk=%s — skipping', acct_id,
                    )
                    skipped += 1
                    continue

                series, _ = TransactionSeries.objects.get_or_create(
                    code='SSIMN',
                    defaults={'description': 'Monthly Savings Interest'},
                )

                journal = JournalEntry.objects.create(
                    series=series,
                    date=period_end,
                    description=(
                        f'Monthly interest {period_start:%b %Y} — '
                        f'{savings.account_number}'
                    ),
                    owner=savings.owner,
                    branch=savings.branch,
                    tenant=savings.tenant,
                )

                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=expense_account,
                    side=JournalEntryLine.DEBIT,
                    amount=interest,
                    description=f'Interest expense — {savings.account_number} {period_start:%b %Y}',
                )

                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=savings.account,
                    side=JournalEntryLine.CREDIT,
                    amount=interest,
                    description=f'Monthly interest credited — {savings.account_number}',
                )

                journal.post()

                # ── Audit record ─────────────────────────────────────────
                InterestAccrual.objects.create(
                    account=savings,
                    calculation_date=period_end,
                    daily_balance=balance,
                    interest_rate=savings.interest_rate,
                    accrued_amount=interest,
                    status='posted',
                    posting_date=today,
                )

                processed += 1

        except Exception as exc:  # noqa: BLE001
            _log.exception(
                'post_monthly_savings_interest: failed for SavingsAccount pk=%s: %s',
                acct_id, exc,
            )

    return {'processed': processed, 'skipped': skipped, 'total': len(candidate_ids)}
