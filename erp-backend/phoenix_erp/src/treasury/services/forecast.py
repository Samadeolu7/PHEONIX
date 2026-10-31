"""
Per-branch, day-by-day cash forecast used by the loan liquidity gate.

    closing(d) = cash today + expected repayments up to d - committed outflows up to d

A branch may lend down to zero, but not into money committed to upcoming obligations:
    available_today = max(0, min over the look-ahead window of closing(d))

All money values are Decimal. The functions here only read data.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models import F, Value
from django.db.models.functions import Greatest, Least

ZERO = Decimal('0.00')

# Loan statuses whose repayment schedule rows are expected to bring cash in.
COLLECTING_STATUSES = ('active', 'disbursed', 'defaulted')
# Statuses counted when measuring history (paid-off loans were collected too).
HISTORY_STATUSES = ('active', 'disbursed', 'defaulted', 'paid_off')

OUT_SAVINGS = 'savings_withdrawal'
OUT_LOAN = 'approved_loan'
OUT_BORROWING_SHARE = 'bank_loan_share'
OUT_BORROWING_INSTALMENT = 'bank_loan_instalment'


def cash_breakdown(branch):
    """
    Cash + bank the branch can actually lend, from its GL balances, plus a list of what was counted and
    what was deliberately left out (so a person can check the figure against the bank and the tills).

    Counted:  each bank account's GL account and each active cashier till's GL account in the branch.
    Excluded: petty cash funds (not lending money), and any other Cash & Cash Equivalents (1100) account
              in the branch that is not linked to a bank account or till (listed so it can be reviewed).
    """
    from accounts.models import Account
    from banks.models import BankAccount
    from cash_management.models import CashierAccount, PettyCashFund

    petty_ids = set(PettyCashFund.objects.filter(petty_cash_account__isnull=False)
                    .values_list('petty_cash_account_id', flat=True))
    counted, excluded, seen = [], [], set()

    def _add(acct, kind):
        if acct.pk in seen:
            return
        seen.add(acct.pk)
        row = {'account_id': acct.pk, 'code': acct.code, 'name': acct.name, 'kind': kind,
               'balance': acct.balance or ZERO}
        if acct.pk in petty_ids:
            excluded.append({**row, 'reason': 'Petty cash fund'})
        else:
            counted.append(row)

    for bank in BankAccount.objects.filter(branch=branch, gl_account__isnull=False).select_related('gl_account'):
        _add(bank.gl_account, 'bank')
    for till in CashierAccount.objects.filter(
            branch=branch, is_active=True, account__isnull=False).select_related('account'):
        _add(till.account, 'till')
    # Other cash-type accounts in the branch that nothing links to: shown, not counted.
    for acct in Account.objects.filter(branch=branch, parent__code='1100').exclude(pk__in=seen):
        if (acct.balance or ZERO) != 0:
            excluded.append({'account_id': acct.pk, 'code': acct.code, 'name': acct.name, 'kind': 'other',
                             'balance': acct.balance or ZERO,
                             'reason': 'Petty cash fund' if acct.pk in petty_ids
                             else 'Not linked to a bank account or till'})
    total = sum((r['balance'] for r in counted), ZERO)
    return total, counted, excluded


def branch_cash(branch):
    """Cash + bank balance the branch can lend (see cash_breakdown)."""
    return cash_breakdown(branch)[0]


# Instalments that fell due in the last few days are mostly "not paid yet" simply because clients
# pay a few days late; leaving them out stops that from dragging the measured rate down.
COLLECTION_GRACE_DAYS = 7


def collection_rate(branch, today, window_days):
    """
    Share of instalments that fell due in the window which have actually been paid.

    Like-for-like: only instalments due in (today - grace - window, today - grace] are looked at, and for each
    one the amount paid (capped at what was due) is compared with what was due. Catch-up payments on older
    arrears and prepayments therefore cannot inflate the rate (the old cash-in / due-in ratio could).
    Returns (rate 0..1, paid, due). With no history the rate is 0 (conservative).
    """
    from loans.models import LoanRepaymentSchedule

    end = today - timedelta(days=COLLECTION_GRACE_DAYS)
    start = end - timedelta(days=window_days)
    agg = LoanRepaymentSchedule.objects.filter(
        loan__branch=branch, due_date__gt=start, due_date__lte=end, loan__status__in=HISTORY_STATUSES,
    ).aggregate(due=Sum('total_due'), paid=Sum(Least('total_paid', 'total_due')))
    due = agg['due'] or ZERO
    paid = agg['paid'] or ZERO
    if due <= 0:
        return ZERO, paid, due
    return min(Decimal('1'), paid / due), paid, due


def _overdue_remaining(qs):
    """Sum of what is still unpaid on schedule rows (never negative per row)."""
    return qs.aggregate(
        t=Sum(Greatest(F('total_due') - F('total_paid'), Value(ZERO)))
    )['t'] or ZERO


def loan_receivables(branch, today, end):
    """
    What the branch's live loans still owe: arrears (instalments already overdue) and instalments falling
    due each day up to `end`.

    The loan's own balance (outstanding principal + interest + fees + penalties, kept in line with the
    ledger) is the ceiling: where a loan's schedule shows more unpaid than the loan actually owes (old
    imports, stale rows), every unpaid row of that loan is scaled down to match. Schedules are never scaled
    up. Rows are assigned by the LOAN's branch, and an overpaid row never offsets another client's row.

    Returns (arrears, future_by_day {date: amount}, schedule_excess, loans_scaled).
    """
    from loans.models import LoanAccount, LoanRepaymentSchedule

    owed_by_loan = {}
    for row in LoanAccount.objects.filter(branch=branch, status__in=COLLECTING_STATUSES).values(
            'pk', 'outstanding_principal', 'outstanding_interest', 'outstanding_fees', 'outstanding_penalties'):
        owed_by_loan[row['pk']] = sum(
            (row[k] or ZERO for k in ('outstanding_principal', 'outstanding_interest',
                                      'outstanding_fees', 'outstanding_penalties')), ZERO)

    rows = (LoanRepaymentSchedule.objects
            .filter(loan_id__in=list(owed_by_loan))
            .annotate(unpaid=Greatest(F('total_due') - F('total_paid'), Value(ZERO)))
            .filter(unpaid__gt=0)
            .values_list('loan_id', 'due_date', 'unpaid'))
    per_loan = defaultdict(list)
    for loan_id, due_date, unpaid in rows:
        per_loan[loan_id].append((due_date, unpaid))

    arrears = ZERO
    future = defaultdict(lambda: ZERO)
    excess = ZERO
    scaled = 0
    for loan_id, items in per_loan.items():
        schedule_unpaid = sum((u for _, u in items), ZERO)
        owed = max(owed_by_loan.get(loan_id, ZERO), ZERO)
        factor = Decimal('1')
        if schedule_unpaid > owed:
            factor = owed / schedule_unpaid
            excess += schedule_unpaid - owed
            scaled += 1
        for due_date, unpaid in items:
            amount = unpaid * factor
            if due_date < today:
                arrears += amount
            elif due_date <= end:
                future[due_date] += amount
    return arrears.quantize(Decimal('0.01')), future, excess.quantize(Decimal('0.01')), scaled


def arrears_outstanding(branch, today):
    """Overdue amount still owed on the branch's live loans (capped by each loan's real balance)."""
    return loan_receivables(branch, today, today)[0]


def recovery_rate(branch, today, window_days):
    """
    How much of the branch's old debt it actually recovers: of the arrears outstanding at the start of the
    window, the share paid during the window. Returns (rate 0..1, recovered, arrears_at_start).

    Arrears at the start are rebuilt backwards from today's paid amounts:
        arrears_then = unpaid now + paid since the window started
    so payments made before allocation tracking existed (legacy) can't make old, settled instalments look
    like unpaid debt. Only non-reversed payments count.
    """
    from loans.models import LoanRepaymentAllocation, LoanRepaymentSchedule

    start = today - timedelta(days=window_days)
    rows = LoanRepaymentSchedule.objects.filter(
        loan__branch=branch, due_date__lte=start, loan__status__in=HISTORY_STATUSES)
    unpaid_now = _overdue_remaining(rows)
    agg = LoanRepaymentAllocation.objects.filter(
        schedule__in=rows,
        journal_entry__date__gt=start, journal_entry__date__lte=today,
        journal_entry__is_reversed=False, journal_entry__is_reversal=False,
    ).aggregate(p=Sum('principal_applied'), i=Sum('interest_applied'),
                f=Sum('fees_applied'), n=Sum('penalty_applied'))
    recovered = sum((agg[k] or ZERO for k in ('p', 'i', 'f', 'n')), ZERO)
    arrears_then = unpaid_now + recovered
    if arrears_then <= 0:
        return ZERO, recovered, arrears_then
    return min(Decimal('1'), recovered / arrears_then), recovered, arrears_then


def _clamp_day(d, today):
    return today if d < today else d


def _outflow_events(branch, today, end, exclude_loan_pk=None):
    """Committed outflows as a list of dicts {day, type, description, amount, overdue}."""
    from loans.models import LoanAccount
    from savings.models import SavingsWithdrawalRequest
    from treasury.models import BorrowingContribution, BorrowingInstalment, BankBorrowing

    events = []

    # 1. Savings withdrawals not yet paid out (reserve from payout_due_date, or today if already late).
    open_statuses = (
        SavingsWithdrawalRequest.STATUS_PENDING,
        SavingsWithdrawalRequest.STATUS_PARTIAL,
        SavingsWithdrawalRequest.STATUS_APPROVED,
    )
    for wr in SavingsWithdrawalRequest.objects.filter(branch=branch, status__in=open_statuses).select_related(
            'savings_account__client'):
        due = wr.payout_due_date or wr.created_at.date()
        if due > end:
            continue
        client = getattr(wr.savings_account, 'client', None)
        who = getattr(client, 'full_name', None) or wr.savings_account.account_number
        events.append({
            'day': _clamp_day(due, today), 'type': OUT_SAVINGS, 'amount': wr.amount,
            'overdue': due < today,
            'description': f"Savings payout to {who} (due {due:%d %b})",
        })

    # 2. Loans approved but not yet paid out compete for the same cash right now.
    pending_loans = LoanAccount.objects.filter(branch=branch, status='approved').exclude(
        disbursement_request__status__in=('rejected', 'cancelled'))
    if exclude_loan_pk:
        pending_loans = pending_loans.exclude(pk=exclude_loan_pk)
    for loan in pending_loans.select_related('client'):
        age = (today - loan.approval_date).days if loan.approval_date else None
        age_text = ''
        if age is not None:
            age_text = f", approved {age} day{'' if age == 1 else 's'} ago"
        events.append({
            'day': today, 'type': OUT_LOAN, 'amount': loan.approved_amount or loan.requested_amount,
            'overdue': False, 'loan_id': loan.pk, 'age_days': age,
            'description': f"Approved loan {loan.loan_number} awaiting disbursement{age_text}",
        })

    # 3. Bank borrowings.
    active = BankBorrowing.objects.filter(status=BankBorrowing.STATUS_ACTIVE)
    # 3a. Branch is the debit branch: the instalment leaves its account.
    for inst in BorrowingInstalment.objects.filter(
            borrowing__in=active.filter(debit_branch=branch), status=BorrowingInstalment.STATUS_PENDING,
            due_date__lte=end).select_related('borrowing'):
        events.append({
            'day': _clamp_day(inst.due_date, today), 'type': OUT_BORROWING_INSTALMENT, 'amount': inst.total_due,
            'overdue': inst.due_date < today,
            'description': f"{inst.borrowing.lender_name} instalment {inst.number} (due {inst.due_date:%d %b})",
        })
    # 3b. Branch owes a share to the debit branch.
    for c in BorrowingContribution.objects.filter(
            branch=branch, status=BorrowingContribution.STATUS_PENDING, instalment__borrowing__in=active,
            due_date__lte=end).select_related('instalment__borrowing'):
        events.append({
            'day': _clamp_day(c.due_date, today), 'type': OUT_BORROWING_SHARE, 'amount': c.amount,
            'overdue': c.due_date < today,
            'description': f"Share of {c.instalment.borrowing.lender_name} instalment "
                           f"{c.instalment.number} to send by {c.due_date:%d %b}",
        })
    return events


def _debit_branch_share_inflows(branch, today, end):
    """The debit branch counts other branches' unsent shares as inflows on their due dates (never overdue ones)."""
    from treasury.models import BorrowingContribution, BankBorrowing

    out = []
    for c in BorrowingContribution.objects.filter(
            instalment__borrowing__debit_branch=branch,
            instalment__borrowing__status=BankBorrowing.STATUS_ACTIVE,
            status=BorrowingContribution.STATUS_PENDING,
            due_date__gte=today, due_date__lte=end).select_related('branch'):
        out.append((c.due_date, c.amount))
    return out


def branch_forecast(branch, today=None, days=None, exclude_loan_pk=None):
    """
    Build the day-by-day forecast for `branch`.

    Returns a dict:
      cash_now, collection_rate, collected, scheduled, expected_inflows_total, lookahead_days,
      days: [{date, opening, inflow, outflow, closing, outflows:[...]}],
      available_today, _closing (list used by helpers)
    """
    from django.utils import timezone
    from treasury.models import TreasurySettings

    today = today or timezone.localdate()
    cfg = TreasurySettings.get_for(getattr(branch, 'tenant', None))
    horizon = int(days if days is not None else cfg.lookahead_days)
    end = today + timedelta(days=horizon)

    cash, cash_counted, cash_excluded = cash_breakdown(branch)
    arrears_all, future_due, schedule_excess, loans_scaled = loan_receivables(branch, today, end)
    measured_rate, collected, scheduled = collection_rate(branch, today, cfg.collection_rate_window_days)
    # Safety haircut: never assume more than the configured share of expected repayments arrives.
    rate = min(measured_rate, Decimal(cfg.max_collection_rate_pct) / Decimal('100'))

    inflow_by_day = defaultdict(lambda: ZERO)
    for due_date, remaining in future_due.items():
        if remaining > 0:
            inflow_by_day[due_date] += (remaining * rate).quantize(Decimal('0.01'))
    expected_scheduled = sum(inflow_by_day.values(), ZERO)

    # Recovery of old debt: today's arrears x the branch's recent recovery rate, spread evenly over the
    # window (a rate measured over `window` days, so per day = arrears x rate / window). Same safety cap.
    arrears = recovery = measured_recovery = ZERO
    recovered_hist = arrears_hist = ZERO
    if cfg.include_arrears_recovery:
        arrears = arrears_all
        measured_recovery, recovered_hist, arrears_hist = recovery_rate(
            branch, today, cfg.collection_rate_window_days)
        rec_rate = min(measured_recovery, Decimal(cfg.max_collection_rate_pct) / Decimal('100'))
        if arrears > 0 and rec_rate > 0:
            per_day = (arrears * rec_rate / Decimal(cfg.collection_rate_window_days)).quantize(Decimal('0.01'))
            budget = arrears  # never expect back more than is actually owed
            for i in range(1, horizon + 1):   # from tomorrow: today's cash already reflects today's receipts
                amount = min(per_day, budget)
                if amount <= 0:
                    break
                inflow_by_day[today + timedelta(days=i)] += amount
                recovery += amount
                budget -= amount

    for day, amount in _debit_branch_share_inflows(branch, today, end):
        inflow_by_day[day] += amount

    events = _outflow_events(branch, today, end, exclude_loan_pk=exclude_loan_pk)
    # Safety margin: each obligation must be fully covered `reserve_buffer_days` before it is due, so it is
    # placed that many days earlier on the timeline (never before today). Repayments expected in those last
    # few days are then not relied on for it. Money is still only held back from the point that expected
    # repayments can no longer cover the obligation in time ("save up as late as possible").
    buffer = timedelta(days=int(cfg.reserve_buffer_days or 0))
    for ev in events:
        ev['due_day'] = ev['day']
        ev['day'] = max(today, ev['day'] - buffer)
        if ev['day'] != ev['due_day']:
            ev['description'] += f" - must be ready by {ev['day']:%d %b}"
    out_by_day = defaultdict(list)
    for ev in events:
        out_by_day[ev['day']].append(ev)

    rows = []
    balance = cash
    closing_list = []
    for i in range(horizon + 1):
        d = today + timedelta(days=i)
        inflow = inflow_by_day.get(d, ZERO)
        day_events = out_by_day.get(d, [])
        outflow = sum((e['amount'] for e in day_events), ZERO)
        opening = balance
        balance = opening + inflow - outflow
        closing_list.append(balance)
        rows.append({
            'date': d, 'opening': opening, 'inflow': inflow, 'outflow': outflow, 'closing': balance,
            'outflows': day_events,
        })

    lowest = min(closing_list) if closing_list else cash
    return {
        'branch_id': branch.pk, 'branch_name': branch.name,
        'today': today, 'lookahead_days': horizon, 'reserve_buffer_days': int(cfg.reserve_buffer_days or 0),
        'cash_now': cash,
        'cash_accounts': cash_counted,
        'cash_accounts_excluded': cash_excluded,
        'schedule_excess': schedule_excess,
        'loans_with_schedule_excess': loans_scaled,
        'collection_rate': rate, 'measured_collection_rate': measured_rate,
        'collected': collected, 'scheduled': scheduled,
        'expected_inflows_total': sum(inflow_by_day.values(), ZERO),
        'expected_scheduled_total': expected_scheduled,
        'expected_recovery_total': recovery,
        'arrears_outstanding': arrears,
        'recovery_rate': min(measured_recovery, Decimal(cfg.max_collection_rate_pct) / Decimal('100')),
        'measured_recovery_rate': measured_recovery,
        'recovered_in_window': recovered_hist,
        'arrears_at_window_start': arrears_hist,
        'committed_outflows_total': sum((e['amount'] for e in events), ZERO),
        'days': rows,
        'available_today': max(ZERO, lowest),
        '_closing': closing_list,
    }


def earliest_date_for(forecast, amount):
    """
    First date on which `amount` could be paid out without any later day dipping below zero
    (min of the closing balances from that day onward >= amount). None if never within the window.
    """
    closing = forecast['_closing']
    today = forecast['today']
    suffix_min = [None] * len(closing)
    running = None
    for i in range(len(closing) - 1, -1, -1):
        running = closing[i] if running is None else min(running, closing[i])
        suffix_min[i] = running
    for i, m in enumerate(suffix_min):
        if m >= amount:
            return today + timedelta(days=i)
    return None


def impact_of(forecast, amount, max_items=10):
    """
    Which obligations would be left short if `amount` leaves the branch today.
    Only days that carry an obligation are listed. Returns (breaches, worst_shortfall).
    """
    breaches = []
    worst = ZERO
    for row in forecast['days']:
        shortfall = amount - row['closing']
        if shortfall > worst:
            worst = shortfall
        if shortfall > 0 and row['outflows']:
            breaches.append({
                'date': row['date'],
                'shortfall': shortfall,
                'obligations': [
                    {'type': e['type'], 'description': e['description'], 'amount': e['amount'],
                     'overdue': e['overdue']} for e in row['outflows']
                ],
            })
    return breaches[:max_items], max(worst, ZERO)
