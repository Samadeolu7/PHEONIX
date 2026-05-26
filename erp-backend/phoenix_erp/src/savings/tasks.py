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
    """
    from accounts.models import Account

    acct = (
        Account.objects
        .filter(
            owner=owner,
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
        .filter(owner=owner, branch=branch, account_type=Account.EXPENSE,
                account_level=Account.LEVEL_PARENT)
        .first()
    )

    acct = Account.objects.create(
        owner=owner,
        branch=branch,
        name='Smart Savings Interest Expense',
        code='5900',          # Fallback; may collide — admin should rename/re-code
        account_type=Account.EXPENSE,
        account_level=Account.LEVEL_CHILD if parent else Account.LEVEL_PARENT,
        parent=parent,
        is_system_account=True,
        allow_manual_entries=False,
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
                # opening_balance for next cycle = current balance (now includes interest)
                acct.opening_balance = savings.current_balance + interest
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
