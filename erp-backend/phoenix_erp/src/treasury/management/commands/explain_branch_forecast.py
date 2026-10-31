"""
Read-only: print exactly where a branch's cash forecast numbers come from, so they can be checked
against the bank statement, the tills and the loan book.

Usage:
    python manage.py explain_branch_forecast --branch ORI          # branch code (or numeric id)
    python manage.py explain_branch_forecast --branch 3 --top 30
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import F, Value
from django.db.models.functions import Greatest

ZERO = Decimal('0.00')


def _n(v):
    return f"{Decimal(v or 0):>16,.2f}"


class Command(BaseCommand):
    help = "Explain a branch's liquidity forecast line by line (read-only)."

    def add_arguments(self, parser):
        parser.add_argument('--branch', required=True, help='Branch code or id')
        parser.add_argument('--top', type=int, default=15, help='How many loans to list per section')

    def handle(self, *args, **opts):
        from branches.models import Branch
        from loans.models import LoanAccount, LoanRepaymentSchedule
        from treasury.services.forecast import COLLECTING_STATUSES, branch_forecast

        key = opts['branch']
        qs = Branch.all_objects.filter(is_deleted=False)
        branch = qs.filter(code=key).first() or (qs.filter(pk=key).first() if key.isdigit() else None)
        if branch is None:
            raise CommandError(f"No branch with code or id '{key}'.")
        top = opts['top']
        f = branch_forecast(branch)
        w = self.stdout.write
        h = lambda t: w(self.style.MIGRATE_HEADING(f"\n== {t}"))  # noqa: E731

        w(self.style.SUCCESS(f"Forecast for {branch.name} ({branch.code}) as of {f['today']}, "
                             f"{f['lookahead_days']} days ahead"))
        w(f"Can lend today: {_n(f['available_today'])}")

        h("1. Cash and bank now (counted)")
        for r in f['cash_accounts']:
            w(f"  {r['kind']:<5} {r['code']:<12} {r['name'][:40]:<40} {_n(r['balance'])}")
        w(f"  {'TOTAL':<59} {_n(f['cash_now'])}")
        if f['cash_accounts_excluded']:
            h("   Not counted (check these are right)")
            for r in f['cash_accounts_excluded']:
                w(f"  {r['code']:<12} {r['name'][:40]:<40} {_n(r['balance'])}  <- {r['reason']}")

        h("2. Committed payments")
        for row in f['days']:
            for o in row['outflows']:
                w(f"  {row['date']}  {_n(o['amount'])}  {o['description']}")
        w(f"  TOTAL {_n(f['committed_outflows_total'])}")

        h("3. Expected money in")
        w(f"  Repayments falling due:  {_n(f['expected_scheduled_total'])}  "
          f"(counting {Decimal(f['collection_rate']) * 100:.1f}%; measured "
          f"{Decimal(f['measured_collection_rate']) * 100:.1f}% = paid {_n(f['collected']).strip()} "
          f"of {_n(f['scheduled']).strip()} due in the history window)")
        w(f"  Old-debt recovery:       {_n(f['expected_recovery_total'])}  "
          f"(arrears {_n(f['arrears_outstanding']).strip()} x recovery rate "
          f"{Decimal(f['recovery_rate']) * 100:.1f}%; measured "
          f"{Decimal(f['measured_recovery_rate']) * 100:.1f}% = recovered "
          f"{_n(f['recovered_in_window']).strip()} of {_n(f['arrears_at_window_start']).strip()})")
        w(f"  TOTAL (incl. other branches' bank-loan shares): {_n(f['expected_inflows_total'])}")

        # Loan-level detail
        today, end = f['today'], f['today'] + timedelta(days=f['lookahead_days'])
        loans = {l.pk: l for l in LoanAccount.objects.filter(branch=branch, status__in=COLLECTING_STATUSES)}
        unpaid = (LoanRepaymentSchedule.objects.filter(loan_id__in=list(loans))
                  .annotate(u=Greatest(F('total_due') - F('total_paid'), Value(ZERO))).filter(u__gt=0)
                  .values_list('loan_id', 'due_date', 'u'))
        sched = defaultdict(lambda: {'all': ZERO, 'arrears': ZERO, 'window': ZERO})
        for loan_id, due, u in unpaid:
            s = sched[loan_id]
            s['all'] += u
            if due < today:
                s['arrears'] += u
            elif due <= end:
                s['window'] += u

        h(f"4. Loans whose schedule shows MORE unpaid than the loan owes "
          f"({f['loans_with_schedule_excess']} loans, {_n(f['schedule_excess']).strip()} ignored)")
        rows = []
        for loan_id, s in sched.items():
            owed = loans[loan_id].total_outstanding
            if s['all'] > owed:
                rows.append((s['all'] - owed, loans[loan_id], s['all'], owed))
        for diff, loan, sch, owed in sorted(rows, key=lambda r: r[0], reverse=True)[:top]:
            w(f"  {loan.loan_number:<22} schedule unpaid {_n(sch)}  loan owes {_n(owed)}  excess {_n(diff)}")

        h(f"5. Biggest arrears (top {top})")
        for loan_id, s in sorted(sched.items(), key=lambda kv: kv[1]['arrears'], reverse=True)[:top]:
            if s['arrears'] > 0:
                w(f"  {loans[loan_id].loan_number:<22} {loans[loan_id].status:<10} overdue {_n(s['arrears'])}")

        h(f"6. Biggest repayments falling due in the window (top {top}, before collection rate)")
        for loan_id, s in sorted(sched.items(), key=lambda kv: kv[1]['window'], reverse=True)[:top]:
            if s['window'] > 0:
                w(f"  {loans[loan_id].loan_number:<22} {loans[loan_id].status:<10} due {_n(s['window'])}")
        w("")
