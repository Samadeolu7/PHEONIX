"""
Automatic monthly release of prepaid expenses (e.g. rent paid in advance).

For a PrepaidExpense with auto_amortize=True, total_amount is spread evenly
over amortization_months. The month containing amortization_start_date is
month 1, and each month is posted on its last day:

    Dr  category.expense_account   (e.g. Office Rent)
    Cr  category.prepaid_account   (e.g. Rent Prepayment)

Posting goes through PrepaidExpenseAccountingService.amortize_period, the same
path as the manual "Record Amortization" screen.

How much each month posts:
    We work from a cumulative target, not a fixed monthly amount. By the end
    of month k, round(total * k / months) should have been released (month
    `months` releases everything). Each due month posts
    target(k) - consumed_amount. This means:
      - rounding pennies land in the final month, so the full amount clears;
      - a manual amortization already recorded is not released twice;
      - missed months (job down, record entered late) are caught up, each
        on its own month-end date.

Safe to run repeatedly: a month whose journal (workflow_reference
"<ref>-AMORT-YYYYMM") already exists is skipped.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.db import transaction as db_transaction

_log = logging.getLogger(__name__)

CENT = Decimal('0.01')


def _month_end(d: date) -> date:
    return d.replace(day=1) + relativedelta(months=1) - timedelta(days=1)


def scheduled_cumulative(total: Decimal, months: int, k: int) -> Decimal:
    """Amount that should have been released by the end of month k."""
    if k >= months:
        return total
    return (total * k / months).quantize(CENT, rounding=ROUND_HALF_UP)


def due_period_ends(start: date, months: int, as_of: date):
    """Yield (k, month_end) for every scheduled month whose end is <= as_of."""
    first = start.replace(day=1)
    for k in range(1, months + 1):
        end = _month_end(first + relativedelta(months=k - 1))
        if end > as_of:
            break
        yield k, end


def amortization_reference(prepaid, period_end: date) -> str:
    # Must match the workflow_reference amortize_period() writes.
    return f"{prepaid.reference_number}-AMORT-{period_end:%Y%m}"


def plan_due_amortizations(prepaid, as_of: date):
    """
    Return [(period_end, amount)] that would be posted for `prepaid` up to
    `as_of`, without posting anything.
    """
    from transactions.models import Transaction as JournalEntry

    if not (prepaid.auto_amortize and prepaid.amortization_start_date
            and prepaid.amortization_months):
        return []

    total = prepaid.total_amount
    consumed = prepaid.consumed_amount or Decimal('0')
    plan = []
    for k, period_end in due_period_ends(
        prepaid.amortization_start_date, prepaid.amortization_months, as_of
    ):
        if JournalEntry.objects.filter(
            workflow_reference=amortization_reference(prepaid, period_end)
        ).exists():
            continue
        amount = min(
            scheduled_cumulative(total, prepaid.amortization_months, k) - consumed,
            total - consumed,
        )
        if amount <= 0:
            continue
        plan.append((period_end, amount))
        consumed += amount
    return plan


def post_due_amortizations(prepaid_id: int, as_of: date):
    """
    Post every due month for one prepaid expense. Locks the row so two
    concurrent runs can't both post the same month.

    Returns [(period_end, amount, journal_entry)].
    """
    from expenses.models import PrepaidExpense
    from expenses.services.expense_accounting import PrepaidExpenseAccountingService

    posted = []
    with db_transaction.atomic():
        prepaid = (
            PrepaidExpense.objects
            .select_for_update()
            .get(pk=prepaid_id)
        )
        plan = plan_due_amortizations(prepaid, as_of)
        if not plan:
            return posted

        service = PrepaidExpenseAccountingService(prepaid)
        for period_end, amount in plan:
            journal = service.amortize_period(
                amount=amount,
                period_end_date=period_end,
                posted_by=None,
            )
            posted.append((period_end, amount, journal))
            _log.info(
                'prepaid auto-amortization: %s %s posted %s (journal %s)',
                prepaid.reference_number, f'{period_end:%Y-%m}', amount, journal.pk,
            )
    return posted


def due_candidates(as_of: date):
    """Prepaid expenses that may have a month to post on or before as_of."""
    from expenses.models import PrepaidExpense

    return (
        PrepaidExpense.objects
        .filter(
            auto_amortize=True,
            amortization_start_date__isnull=False,
            amortization_months__gt=0,
            status__in=('active', 'partially_consumed'),
            amortization_start_date__lte=as_of,
        )
        .order_by('id')
    )
