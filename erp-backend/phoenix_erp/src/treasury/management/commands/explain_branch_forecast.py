"""
Read-only: print exactly where a branch's cash forecast numbers come from, so they can be checked
against the bank statement, the tills and the loan book. Changes nothing.

Usage:
    python manage.py explain_branch_forecast --branch ORI                 # branch code (or numeric id)
    python manage.py explain_branch_forecast --branch ORI --top 30
    python manage.py explain_branch_forecast --branch ORI --csv /tmp/ori_loans.csv   # full loan book
    python manage.py explain_branch_forecast --loan LN-858               # one loan, every instalment

The loan-book sections compare, for every live loan:
    schedule = what its instalment rows say is unpaid
    record   = what the loan record says it owes (principal + interest + fees + penalties)
    ledger   = its GL account balance (the accounting truth)
and give a suspected cause for each loan whose schedule shows more than the record.
"""
import csv
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import F, Value
from django.db.models.functions import Greatest

ZERO = Decimal('0.00')

CSV_FIELDS = [
    'loan_number', 'client', 'phone', 'status', 'origin', 'product', 'frequency', 'disbursed_amount',
    'disbursement_date', 'maturity_date', 'principal', 'interest', 'fees', 'penalties', 'owed', 'ledger',
    'ledger_gap', 'schedule_unpaid', 'retired_unpaid', 'schedule_overdue', 'schedule_due_in_window',
    'excess', 'short', 'forecast_overdue', 'forecast_due_in_window', 'days_in_arrears', 'oldest_overdue',
    'last_payment', 'cause', 'cause_label', 'suggested_fix',
]


def _n(v, width=16):
    return f"{Decimal(v or 0):>{width},.2f}"


def _s(v):
    return _n(v).strip()


class Command(BaseCommand):
    help = "Explain a branch's liquidity forecast and loan book line by line (read-only)."

    def add_arguments(self, parser):
        parser.add_argument('--branch', help='Branch code or id')
        parser.add_argument('--top', type=int, default=15, help='How many loans to list per section')
        parser.add_argument('--csv', dest='csv_path', help='Also write the full loan book to this CSV file')
        parser.add_argument('--loan', dest='loan_number', help='Explain one loan in full instead')

    def handle(self, *args, **opts):
        self.w = self.stdout.write
        if opts['loan_number']:
            return self._explain_loan(opts['loan_number'])
        if not opts['branch']:
            raise CommandError('Pass --branch <code or id> (or --loan <loan number>).')
        branch = self._branch(opts['branch'])
        self._explain_branch(branch, opts['top'], opts['csv_path'])

    # ------------------------------------------------------------------ helpers
    def _h(self, text):
        self.w(self.style.MIGRATE_HEADING(f"\n== {text}"))

    def _branch(self, key):
        from branches.models import Branch
        qs = Branch.all_objects.filter(is_deleted=False)
        branch = qs.filter(code=key).first() or (qs.filter(pk=key).first() if str(key).isdigit() else None)
        if branch is None:
            raise CommandError(f"No branch with code or id '{key}'.")
        return branch

    # ------------------------------------------------------------------ branch
    def _explain_branch(self, branch, top, csv_path):
        from treasury.models import TreasurySettings
        from treasury.services.forecast import branch_forecast
        from treasury.services.loan_book import (
            CAUSES, collection_history, loan_book, summarize, uncounted_balances)

        w, h = self.w, self._h
        f = branch_forecast(branch)
        today, end = f['today'], f['today'] + timedelta(days=f['lookahead_days'])
        cfg = TreasurySettings.get_for(getattr(branch, 'tenant', None))
        book = loan_book(branch, today, end)
        totals, by_cause = summarize(book)

        w(self.style.SUCCESS(f"Forecast for {branch.name} ({branch.code}) as of {today}, "
                             f"{f['lookahead_days']} days ahead"))
        w(f"Can lend today: {_n(f['available_today'])}")

        # 1. Cash
        h("1. Cash and bank now (counted)")
        for r in f['cash_accounts']:
            w(f"  {r['kind']:<5} {r['code']:<12} {r['name'][:40]:<40} {_n(r['balance'])}")
        w(f"  {'TOTAL':<59} {_n(f['cash_now'])}")
        w("  Check: each line against the bank statement / till count for today.")
        if f['cash_accounts_excluded']:
            h("   Not counted (check these are right)")
            for r in f['cash_accounts_excluded']:
                w(f"  {r['code']:<12} {r['name'][:40]:<40} {_n(r['balance'])}  <- {r['reason']}")

        # 2. Outflows
        h("2. Committed payments")
        for row in f['days']:
            for o in row['outflows']:
                w(f"  {row['date']}  {_n(o['amount'])}  {o['description']}")
        w(f"  TOTAL {_n(f['committed_outflows_total'])}")
        w("  Check: open withdrawal requests list and approved-loan list. Cancel or complete anything stale.")

        # 3. Inflows
        h("3. Expected money in")
        w(f"  Repayments falling due:  {_n(f['expected_scheduled_total'])}  "
          f"(due in window {_s(totals['forecast_due_in_window'])} x collection rate "
          f"{Decimal(f['collection_rate']) * 100:.1f}%; measured "
          f"{Decimal(f['measured_collection_rate']) * 100:.1f}% = paid {_s(f['collected'])} "
          f"of {_s(f['scheduled'])})")
        w(f"  Old-debt recovery:       {_n(f['expected_recovery_total'])}  "
          f"(arrears {_s(f['arrears_outstanding'])} x recovery rate "
          f"{Decimal(f['recovery_rate']) * 100:.1f}%; measured "
          f"{Decimal(f['measured_recovery_rate']) * 100:.1f}% = recovered "
          f"{_s(f['recovered_in_window'])} of {_s(f['arrears_at_window_start'])})")
        w(f"  TOTAL (incl. other branches' bank-loan shares): {_n(f['expected_inflows_total'])}")

        history, h_start, h_end = collection_history(branch, today, cfg.collection_rate_window_days)
        h(f"   Collection rate by month (instalments due {h_start + timedelta(days=1)} to {h_end})")
        w(f"  {'month':<9} {'due':>16} {'paid':>16} {'rate':>7} {'on cancelled rows':>18} {'unpaid, loan closed':>20}")
        for m in history:
            w(f"  {m['month']:%b %Y} {_n(m['due'])} {_n(m['paid'])} {m['rate'] * 100:>6.1f}% "
              f"{_n(m['retired_due'], 18)} {_n(m['closed_unpaid'], 20)}")
        w("  'On cancelled rows' and 'unpaid, loan closed' can never be paid, so they pull the rate down.")

        # 4. Loan book reconciliation
        h(f"4. Loan book ({totals['loans']} live loans: active, disbursed, defaulted)")
        w(f"  Loan records owe            {_n(totals['owed'])}   "
          f"(principal {_s(totals['principal'])}, interest {_s(totals['interest'])}, "
          f"fees {_s(totals['fees'])}, penalties {_s(totals['penalties'])})")
        w(f"  Ledger (loan GL accounts)   {_n(totals['ledger'])}   "
          f"difference {_s(totals['ledger'] - totals['owed'])}; "
          f"{totals['ledger_gap_loans']} loan(s) differ by more than 1.00")
        w(f"  Schedules show unpaid       {_n(totals['schedule_unpaid'])}   "
          f"(overdue {_s(totals['schedule_overdue'])}, due in window {_s(totals['schedule_due_in_window'])})")
        if totals['retired_unpaid'] > 0:
            w(self.style.WARNING(
                f"  + on cancelled rows         {_n(totals['retired_unpaid'])}   on {totals['retired_loans']} loan(s) "
                f"<- the forecast currently reads these too"))
        w(f"  Forecast counts             overdue {_s(totals['forecast_overdue'])}, "
          f"due in window {_s(totals['forecast_due_in_window'])} (before rates)")
        w("  Check: 'Loan records owe' against the portfolio / loan balance report for this branch, and")
        w("         'Ledger' against the trial balance loan receivable line for this branch.")

        # 5. Phantom amounts
        h(f"5. Schedule shows MORE than the loan owes: {totals['excess_loans']} loan(s), "
          f"{_s(totals['excess'])} ignored by the forecast "
          f"({_s(totals['excess_in_overdue'])} of it on overdue instalments)")
        for cause, c in sorted(by_cause.items(), key=lambda kv: kv[1]['excess'], reverse=True):
            label, text = CAUSES[cause]
            w(self.style.WARNING(f"  [{cause}] {label}: {c['loans']} loan(s), {_s(c['excess'])}"))
            w(f"      {text}")
        rows = sorted((r for r in book if r['cause']), key=lambda r: r['excess'], reverse=True)[:top]
        if rows:
            w(f"\n  {'loan':<22} {'status':<10} {'origin':<14} {'schedule':>14} {'record':>14} {'ledger':>14} "
              f"{'excess':>14}  cause")
        for r in rows:
            w(f"  {r['loan_number']:<22} {r['status']:<10} {r['origin']:<14} "
              f"{_n(r['schedule_unpaid'] + r['retired_unpaid'], 14)} {_n(r['owed'], 14)} {_n(r['ledger'], 14)} "
              f"{_n(r['excess'], 14)}  {r['cause']}")
        if rows:
            w("  Look at any of these in full with: --loan <loan number>")

        # 6. Schedule short
        short = sorted((r for r in book if r['short'] > Decimal('1.00')), key=lambda r: r['short'], reverse=True)
        h(f"6. Schedule shows LESS than the loan owes: {len(short)} loan(s), {_s(totals['short'])} "
          f"(the forecast only expects what the schedule shows)")
        for r in short[:top]:
            w(f"  {r['loan_number']:<22} {r['status']:<10} schedule {_n(r['schedule_unpaid'], 14)}  "
              f"record {_n(r['owed'], 14)}  ledger {_n(r['ledger'], 14)}")

        # 7. Balances outside the forecast
        others = uncounted_balances(branch)
        h(f"7. Loan balances the forecast does not count: {len(others)}")
        for r in others[:top * 2]:
            w(f"  {r['loan_number']:<22} {r['client'][:28]:<28} record {_n(r['owed'], 14)}  "
              f"ledger {_n(r['ledger'], 14)}  <- {r['reason']}")

        # 8. Arrears
        h(f"8. Biggest arrears (top {top}, as counted by the forecast)")
        for r in sorted(book, key=lambda r: r['forecast_overdue'], reverse=True)[:top]:
            if r['forecast_overdue'] <= 0:
                break
            w(f"  {r['loan_number']:<22} {r['client'][:24]:<24} {r['status']:<10} overdue "
              f"{_n(r['forecast_overdue'], 14)}  since {r['oldest_overdue'] or '-'}  "
              f"last paid {r['last_payment'] or '-'}")

        # 9. Due in window
        h(f"9. Biggest repayments falling due in the window (top {top}, before collection rate)")
        for r in sorted(book, key=lambda r: r['forecast_due_in_window'], reverse=True)[:top]:
            if r['forecast_due_in_window'] <= 0:
                break
            w(f"  {r['loan_number']:<22} {r['client'][:24]:<24} {r['status']:<10} due "
              f"{_n(r['forecast_due_in_window'], 14)}")

        if csv_path:
            self._write_csv(csv_path, book)
        w("")

    def _write_csv(self, path, book):
        from treasury.services.loan_book import CAUSES
        with open(path, 'w', newline='', encoding='utf-8-sig') as fh:
            out = csv.DictWriter(fh, fieldnames=CSV_FIELDS, extrasaction='ignore')
            out.writeheader()
            for r in book:
                label, text = CAUSES.get(r['cause'], ('', ''))
                row = {k: r.get(k, '') for k in CSV_FIELDS}
                row.update({'cause_label': label, 'suggested_fix': text.replace('<LN>', r['loan_number'])})
                for k in ('ledger_gap', 'excess', 'short', 'forecast_overdue', 'forecast_due_in_window'):
                    row[k] = Decimal(row[k]).quantize(Decimal('0.01'))
                out.writerow(row)
        self.w(self.style.SUCCESS(f"\nLoan book written to {path} ({len(book)} loans)"))

    # ------------------------------------------------------------------ one loan
    def _explain_loan(self, loan_number):
        from loans.models import LoanAccount, LoanRepaymentSchedule
        from treasury.models import TreasurySettings
        from treasury.services.loan_book import CAUSES, RETIRED, loan_book
        from django.utils import timezone

        loan = LoanAccount.all_objects.filter(loan_number=loan_number).select_related('branch').first()
        if loan is None:
            raise CommandError(f"Loan {loan_number} not found.")
        w, h = self.w, self._h
        today = timezone.localdate()
        cfg = TreasurySettings.get_for(getattr(loan.branch, 'tenant', None))
        end = today + timedelta(days=cfg.lookahead_days)
        r = next((x for x in loan_book(loan.branch, today, end) if x['loan_id'] == loan.pk), None)

        w(self.style.SUCCESS(f"{loan.loan_number}  {getattr(loan.client, 'full_name', '')}  "
                             f"branch {getattr(loan.branch, 'name', '-')}  status {loan.status}  origin {loan.origin}"))
        w(f"  Disbursed {_s(loan.disbursed_amount)} on {loan.disbursement_date}, matures {loan.maturity_date}, "
          f"{loan.repayment_frequency}, rate {loan.interest_rate}%")
        w(f"  Record owes  {_n(loan.total_outstanding)}  (principal {_s(loan.outstanding_principal)}, "
          f"interest {_s(loan.outstanding_interest)}, fees {_s(loan.outstanding_fees)}, "
          f"penalties {_s(loan.outstanding_penalties)})")
        w(f"  Ledger       {_n(loan.account.balance if loan.account_id else 0)}  (GL account "
          f"{getattr(loan.account, 'code', '-')})")
        if r is None:
            w(self.style.WARNING("  Not counted by the forecast (status is not active/disbursed/defaulted)."))
        else:
            w(f"  Schedule     {_n(r['schedule_unpaid'])}  unpaid on open rows"
              + (f", plus {_s(r['retired_unpaid'])} on cancelled rows" if r['retired_unpaid'] else ''))
            w(f"  Forecast counts overdue {_s(r['forecast_overdue'])}, due in the next {cfg.lookahead_days} days "
              f"{_s(r['forecast_due_in_window'])}")
            if r['cause']:
                label, text = CAUSES[r['cause']]
                w(self.style.WARNING(f"  Excess {_s(r['excess'])}: {label}"))
                w(f"  {text.replace('<LN>', loan.loan_number)}")

        h("Instalments")
        w(f"  {'#':>3} {'due':<10} {'status':<12} {'total due':>13} {'paid':>13} {'unpaid':>13} "
          f"{'penalty due':>12} {'paid on':<10}")
        for s in (LoanRepaymentSchedule.objects.filter(loan=loan)
                  .annotate(unpaid=Greatest(F('total_due') - F('total_paid'), Value(ZERO))).order_by('due_date')):
            mark = '  <- cancelled' if s.status == RETIRED and s.unpaid > 0 else ''
            w(f"  {s.installment_number:>3} {s.due_date} {s.status:<12} {_n(s.total_due, 13)} "
              f"{_n(s.total_paid, 13)} {_n(s.unpaid, 13)} {_n(s.penalty_due, 12)} "
              f"{s.payment_date or '-'}{mark}")
        w("  Compare with the old system's ledger card or the client's passbook, and with inspect_loan_gl_trace.")
        w("")
