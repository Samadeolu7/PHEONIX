"""
Read-only loan-book check behind the cash forecast.

For every live loan in a branch it puts three figures side by side:
  schedule - what the loan's instalment rows say is still unpaid
  record   - what the loan record says it owes (outstanding principal + interest + fees + penalties)
  ledger   - the balance of the loan's own GL account (the accounting truth)

The forecast uses the record as a ceiling on the schedule (forecast.loan_receivables). Where the schedule
shows more than the record, the extra ("schedule excess") is ignored. This module works out, loan by loan,
why the two disagree and what would fix it, so the cause can be confirmed before anything is changed.
Nothing here writes to the database.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Case, DecimalField, F, Max, Sum, Value, When
from django.db.models.functions import Greatest, Least, TruncMonth

from treasury.services.forecast import COLLECTING_STATUSES, COLLECTION_GRACE_DAYS, HISTORY_STATUSES

ZERO = Decimal('0.00')
TOLERANCE = Decimal('1.00')
RETIRED = 'restructured'   # schedule rows cancelled by a restructure or a schedule repair

CAUSE_RETIRED_ROWS = 'retired_rows'
CAUSE_NO_BALANCE = 'no_balance'
CAUSE_RECORD_BELOW_LEDGER = 'record_below_ledger'
CAUSE_RECORD_ABOVE_LEDGER = 'record_above_ledger'
CAUSE_STALE_LEGACY = 'stale_legacy_rows'
CAUSE_PAYMENTS_OFF_SCHEDULE = 'payments_not_on_schedule'
CAUSE_LEDGER_NOT_COMPARABLE = 'ledger_not_comparable'

# cause -> (short label, explanation + suggested fix)
CAUSES = {
    CAUSE_RETIRED_ROWS: (
        "Cancelled instalments still counted",
        "Instalments cancelled by a restructure are still read by the forecast (the restructure moved the "
        "balance onto new instalments, so it is counted twice). Fix: forecast code change to skip cancelled "
        "rows. No loan data changes.",
    ),
    CAUSE_NO_BALANCE: (
        "Loan owes nothing but is still open",
        "The record balance is zero or negative but the status is still active. Fix: confirm it is fully paid "
        "and close it. A negative balance goes through audit_negative_outstanding_balances.",
    ),
    CAUSE_RECORD_BELOW_LEDGER: (
        "Loan record owes less than the ledger",
        "The schedule may be right and the record wrong. Fix: sync_outstanding_to_gl --loan <LN> (dry run "
        "first), then check the schedule again.",
    ),
    CAUSE_RECORD_ABOVE_LEDGER: (
        "Loan record owes more than the ledger",
        "The record and the schedule are both above the ledger. Fix: sync_outstanding_to_gl --loan <LN> (dry "
        "run first), then repair the schedule.",
    ),
    CAUSE_STALE_LEGACY: (
        "Old-system instalments never closed",
        "Imported loan: the old system reduced the balance (part payments, rollover, top-up) but left its "
        "instalments unpaid. Fix: 'Repair Schedule' on the loan page (preview first) retires the stale rows. "
        "No money moves.",
    ),
    CAUSE_PAYMENTS_OFF_SCHEDULE: (
        "Payments not applied to instalments",
        "Phoenix loan: payments reduced the balance but not the instalment rows. Fix: 'Repair Schedule' "
        "(preview first). If it refuses, trace the loan with inspect_loan_gl_trace.",
    ),
    CAUSE_LEDGER_NOT_COMPARABLE: (
        "Ledger not comparable (deferred interest)",
        "This loan defers interest, so its GL account leaves out unearned interest. Review by hand.",
    ),
}


def _q(v):
    return Decimal(v).quantize(Decimal('0.01'))


def _classify(r):
    """Suspected cause for a loan whose schedule shows more unpaid than its record says it owes."""
    if r['retired_unpaid'] > 0 and r['excess_without_retired'] <= TOLERANCE:
        return CAUSE_RETIRED_ROWS
    if r['owed'] <= TOLERANCE:
        return CAUSE_NO_BALANCE
    if r['interest_deferral_active']:
        return CAUSE_LEDGER_NOT_COMPARABLE
    if r['ledger_gap'] > TOLERANCE:
        return CAUSE_RECORD_BELOW_LEDGER
    if r['ledger_gap'] < -TOLERANCE:
        return CAUSE_RECORD_ABOVE_LEDGER
    if r['origin'] == 'legacy_import':
        return CAUSE_STALE_LEGACY
    return CAUSE_PAYMENTS_OFF_SCHEDULE


def loan_book(branch, today, end):
    """
    One dict per live loan (statuses the forecast collects from), with the record, ledger and schedule
    figures, what the forecast currently counts for it, and a suspected cause for any schedule excess.

    'forecast_overdue' / 'forecast_due_in_window' reproduce forecast.loan_receivables exactly (including
    cancelled rows, which it currently reads), so the totals tie back to the forecast page.
    """
    from loans.models import LoanAccount, LoanRepaymentSchedule

    loans = list(LoanAccount.objects.filter(branch=branch, status__in=COLLECTING_STATUSES)
                 .select_related('client', 'account', 'product__product').order_by('loan_number'))
    ids = [loan.pk for loan in loans]

    sched = defaultdict(list)
    for loan_id, due, unpaid, status in (
            LoanRepaymentSchedule.objects.filter(loan_id__in=ids)
            .annotate(unpaid=Greatest(F('total_due') - F('total_paid'), Value(ZERO)))
            .filter(unpaid__gt=0)
            .values_list('loan_id', 'due_date', 'unpaid', 'status')):
        sched[loan_id].append((due, unpaid, status))

    last_paid = dict(LoanRepaymentSchedule.objects.filter(loan_id__in=ids, total_paid__gt=0)
                     .values('loan_id').annotate(d=Max('payment_date')).values_list('loan_id', 'd'))

    book = []
    for loan in loans:
        owed = loan.total_outstanding
        ledger = (loan.account.balance or ZERO) if loan.account_id else ZERO
        items = sched.get(loan.pk, [])
        live = [(d, u) for d, u, s in items if s != RETIRED]
        retired_unpaid = sum((u for d, u, s in items if s == RETIRED), ZERO)
        live_unpaid = sum((u for _, u in live), ZERO)
        all_unpaid = live_unpaid + retired_unpaid

        # Same arithmetic as forecast.loan_receivables.
        cap = max(owed, ZERO)
        factor = cap / all_unpaid if all_unpaid > cap else Decimal('1')
        f_overdue = sum((u * factor for d, u, _ in items if d < today), ZERO)
        f_window = sum((u * factor for d, u, _ in items if today <= d <= end), ZERO)
        raw_overdue = sum((u for d, u, _ in items if d < today), ZERO)
        overdue_dates = [d for d, _ in live if d < today]

        r = {
            'loan_id': loan.pk,
            'loan_number': loan.loan_number,
            'client': getattr(loan.client, 'full_name', '') if loan.client_id else '',
            'phone': getattr(loan.client, 'phone_primary', '') if loan.client_id else '',
            'status': loan.status,
            'origin': loan.origin,
            'product': getattr(getattr(loan.product, 'product', None), 'name', '') if loan.product_id else '',
            'frequency': loan.repayment_frequency,
            'disbursed_amount': loan.disbursed_amount or ZERO,
            'disbursement_date': loan.disbursement_date,
            'maturity_date': loan.maturity_date,
            'principal': loan.outstanding_principal,
            'interest': loan.outstanding_interest,
            'fees': loan.outstanding_fees,
            'penalties': loan.outstanding_penalties,
            'owed': owed,
            'ledger': ledger,
            'ledger_gap': ledger - owed,
            'interest_deferral_active': bool(loan.interest_deferral_active),
            'schedule_unpaid': live_unpaid,
            'retired_unpaid': retired_unpaid,
            'schedule_overdue': sum((u for d, u in live if d < today), ZERO),
            'schedule_due_in_window': sum((u for d, u in live if today <= d <= end), ZERO),
            'excess': max(all_unpaid - cap, ZERO),
            'excess_without_retired': max(live_unpaid - cap, ZERO),
            'excess_in_overdue': raw_overdue - f_overdue,
            'short': max(owed - live_unpaid, ZERO),
            'forecast_overdue': f_overdue,
            'forecast_due_in_window': f_window,
            'days_in_arrears': loan.days_in_arrears,
            'oldest_overdue': min(overdue_dates) if overdue_dates else None,
            'last_payment': last_paid.get(loan.pk),
            'cause': '',
        }
        if r['excess'] > TOLERANCE:
            r['cause'] = _classify(r)
        book.append(r)
    return book


def summarize(book):
    """Branch totals plus the schedule excess grouped by suspected cause."""
    keys = ('principal', 'interest', 'fees', 'penalties', 'owed', 'ledger', 'schedule_unpaid', 'retired_unpaid',
            'schedule_overdue', 'schedule_due_in_window', 'forecast_overdue', 'forecast_due_in_window',
            'excess', 'excess_in_overdue', 'short')
    totals = {k: sum((r[k] for r in book), ZERO) for k in keys}
    totals = {k: _q(v) for k, v in totals.items()}
    totals['loans'] = len(book)
    gap = [r for r in book if abs(r['ledger_gap']) > TOLERANCE]
    totals['ledger_gap_loans'] = len(gap)
    totals['ledger_gap_net'] = _q(sum((r['ledger_gap'] for r in gap), ZERO))
    totals['excess_loans'] = sum(1 for r in book if r['cause'])
    totals['short_loans'] = sum(1 for r in book if r['short'] > TOLERANCE)
    totals['retired_loans'] = sum(1 for r in book if r['retired_unpaid'] > 0)

    by_cause = {}
    for r in book:
        if not r['cause']:
            continue
        c = by_cause.setdefault(r['cause'], {'loans': 0, 'excess': ZERO, 'excess_in_overdue': ZERO})
        c['loans'] += 1
        c['excess'] += r['excess']
        c['excess_in_overdue'] += r['excess_in_overdue']
    for c in by_cause.values():
        c['excess'] = _q(c['excess'])
        c['excess_in_overdue'] = _q(c['excess_in_overdue'])
    return totals, by_cause


def uncounted_balances(branch):
    """
    Loan balances in the branch that the forecast does not look at: loans in other statuses (paid off,
    written off, deleted...) that still show a balance, and loan GL accounts with no loan attached.
    """
    from accounts.models import Account
    from loans.models import LoanAccount

    out, linked = [], set()
    for loan in LoanAccount.all_objects.filter(branch=branch).select_related('account', 'client'):
        linked.add(loan.account_id)
        if loan.status in COLLECTING_STATUSES and not loan.is_deleted:
            continue
        ledger = (loan.account.balance or ZERO) if loan.account_id else ZERO
        owed = loan.total_outstanding
        if abs(ledger) > TOLERANCE or abs(owed) > TOLERANCE:
            out.append({'loan_number': loan.loan_number,
                        'client': getattr(loan.client, 'full_name', '') if loan.client_id else '',
                        'status': 'deleted' if loan.is_deleted else loan.status,
                        'owed': owed, 'ledger': ledger,
                        'reason': 'Deleted loan' if loan.is_deleted else f"Status '{loan.status}' is not counted"})
    for acct in Account.objects.filter(branch=branch, account_type=Account.LOAN,
                                       account_level=Account.LEVEL_CHILD).exclude(pk__in=linked):
        if abs(acct.balance or ZERO) > TOLERANCE:
            out.append({'loan_number': acct.code, 'client': acct.name, 'status': '-', 'owed': ZERO,
                        'ledger': acct.balance, 'reason': 'Loan GL account with no loan attached'})
    return out


def collection_history(branch, today, window_days):
    """
    Month-by-month view of the collection-rate window: due, paid (capped at due) and how much of 'due'
    sits on cancelled rows or on loans now closed, both of which can never be 'paid' and pull the rate down.
    """
    from loans.models import LoanRepaymentSchedule

    end = today - timedelta(days=COLLECTION_GRACE_DAYS)
    start = end - timedelta(days=window_days)
    money = DecimalField(max_digits=18, decimal_places=2)
    rows = (LoanRepaymentSchedule.objects
            .filter(loan__branch=branch, due_date__gt=start, due_date__lte=end, loan__status__in=HISTORY_STATUSES)
            .annotate(month=TruncMonth('due_date'))
            .values('month')
            .annotate(due=Sum('total_due'), paid=Sum(Least('total_paid', 'total_due')),
                      retired_due=Sum(Case(When(status=RETIRED, then=F('total_due')), default=Value(ZERO),
                                           output_field=money)),
                      closed_unpaid=Sum(Case(When(loan__status='paid_off',
                                                  then=Greatest(F('total_due') - F('total_paid'), Value(ZERO))),
                                             default=Value(ZERO), output_field=money)))
            .order_by('month'))
    return [{'month': r['month'], 'due': r['due'] or ZERO, 'paid': r['paid'] or ZERO,
             'retired_due': r['retired_due'] or ZERO, 'closed_unpaid': r['closed_unpaid'] or ZERO,
             'rate': (r['paid'] / r['due']) if r['due'] else ZERO} for r in rows], start, end
