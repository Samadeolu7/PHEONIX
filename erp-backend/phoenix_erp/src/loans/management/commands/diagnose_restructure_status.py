"""
Management command: diagnose_restructure_status

Read-only. A director reported approving a restructure on LN-20260904-B6514F
(2-day term -> 60-day term) but the loan's schedule/term still shows the
original 2-day terms after a hard browser reload (ruling out frontend
caching). This dumps everything relevant for one loan so the actual failure
point can be identified instead of guessed at:

  - The loan's current core fields (term, rate, dates, status)
  - Every LoanRestructureRequest ever filed against it (status, who
    requested/reviewed, when, rejection_reason if any)
  - Every LoanRestructure audit record actually applied to it
  - A summary of its repayment_schedule rows by status

Nothing is written. Reports only.

Usage:
    python manage.py diagnose_restructure_status --loan-number LN-20260904-B6514F
    python manage.py diagnose_restructure_status --loan-id 1092
"""
from django.core.management.base import BaseCommand, CommandError

from loans.models import LoanAccount, LoanRestructureRequest


class Command(BaseCommand):
    help = "Read-only dump of a loan's restructure history vs. its current schedule state."

    def add_arguments(self, parser):
        parser.add_argument('--loan-number', type=str, default=None)
        parser.add_argument('--loan-id', type=int, default=None)

    def handle(self, *args, **options):
        loan_number = options.get('loan_number')
        loan_id = options.get('loan_id')

        if not loan_number and not loan_id:
            raise CommandError('Pass --loan-number or --loan-id.')

        qs = LoanAccount.all_objects.all() if hasattr(LoanAccount, 'all_objects') else LoanAccount.objects.all()
        try:
            loan = qs.get(pk=loan_id) if loan_id else qs.get(loan_number=loan_number)
        except LoanAccount.DoesNotExist:
            raise CommandError(f"No loan found for loan_number={loan_number!r} loan_id={loan_id!r}")

        self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== LOAN {loan.loan_number} (id={loan.id}) ==="))
        self.stdout.write(f"  status:               {loan.status}")
        self.stdout.write(f"  term_months (raw):    {loan.term_months} {loan.term_unit}")
        self.stdout.write(f"  interest_rate:        {loan.interest_rate}%")
        self.stdout.write(f"  repayment_frequency:  {loan.repayment_frequency}")
        self.stdout.write(f"  disbursement_date:    {loan.disbursement_date}")
        self.stdout.write(f"  maturity_date:        {loan.maturity_date}")
        self.stdout.write(f"  outstanding_principal:{loan.outstanding_principal}")
        self.stdout.write(f"  outstanding_interest: {loan.outstanding_interest}")
        self.stdout.write(f"  days_in_arrears:      {loan.days_in_arrears}")
        self.stdout.write(f"  arrears_amount:       {loan.arrears_amount}")
        self.stdout.write(f"  branch_id:            {loan.branch_id}")
        self.stdout.write(f"  owner_id:             {loan.owner_id}")
        self.stdout.write(f"  tenant_id:            {loan.tenant_id}")
        self.stdout.write(f"  product:              {loan.product} (id={loan.product_id})")
        self.stdout.write(f"    interest_income_account:            {loan.product.interest_income_account_id}")
        self.stdout.write(f"    restructure_interest_income_account:{loan.product.restructure_interest_income_account_id}")

        self.stdout.write(self.style.MIGRATE_HEADING("\n--- LoanRestructureRequest rows (all statuses) ---"))
        requests = LoanRestructureRequest.objects.filter(loan=loan).order_by('created_at')
        if not requests:
            self.stdout.write("  (none found — no restructure was ever proposed for this loan)")
        for r in requests:
            self.stdout.write(
                f"  id={r.id} status={r.status!r} new_term={r.new_term} {loan.term_unit} "
                f"effective_date={r.effective_date} restructure_fk={r.restructure_id}"
            )
            self.stdout.write(f"    requested_by={r.requested_by_id} at={r.created_at}")
            self.stdout.write(f"    reviewed_by={r.reviewed_by_id} at={r.reviewed_at}")
            self.stdout.write(f"    branch_id={r.branch_id} owner_id={r.owner_id} tenant_id={r.tenant_id}")
            if r.rejection_reason:
                self.stdout.write(f"    rejection_reason: {r.rejection_reason}")

        self.stdout.write(self.style.MIGRATE_HEADING("\n--- LoanRestructure audit records actually applied ---"))
        restructures = loan.restructures.order_by('created_at') if hasattr(loan, 'restructures') else []
        if not restructures:
            self.stdout.write("  (none found — LoanAccount.restructure() never actually ran for this loan)")
        for rec in restructures:
            self.stdout.write(
                f"  id={rec.id} effective_date={rec.effective_date} "
                f"old_term={rec.old_term}{rec.old_term_unit} -> new_term={rec.new_term}{rec.new_term_unit} "
                f"old_rate={rec.old_interest_rate}% -> new_rate={rec.new_interest_rate}%"
            )
            self.stdout.write(f"    restructured_by={rec.restructured_by_id} at={rec.created_at}")
            self.stdout.write(f"    journal_entry_id={getattr(rec, 'journal_entry_id', None)}")

        self.stdout.write(self.style.MIGRATE_HEADING("\n--- repayment_schedule summary ---"))
        schedule = loan.repayment_schedule.order_by('installment_number')
        by_status = {}
        for row in schedule:
            by_status.setdefault(row.status, []).append(row.installment_number)
        if not schedule:
            self.stdout.write("  (no schedule rows at all)")
        for status_val, numbers in by_status.items():
            self.stdout.write(f"  status={status_val!r}: installment_number {min(numbers)}-{max(numbers)} (count={len(numbers)})")
        self.stdout.write(f"  total rows: {schedule.count()}")

        self.stdout.write("")
