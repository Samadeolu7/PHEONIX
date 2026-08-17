"""
Management command: inspect_loan_repayment_allocations

Read-only. Dumps LoanRepaymentAllocation — the per-(payment, installment)
ground truth recorded at the moment each real payment was applied — for one
loan, alongside its current outstanding_* fields, so a specific payment's
actual principal/interest/fees/penalty split can be checked directly instead
of inferred from aggregates that this investigation has repeatedly found to
disagree with each other (outstanding_principal vs schedule, outstanding_
penalties vs schedule, FinancialAuditLog(LOAN_REPAY).extra vs schedule).

Usage:
    python manage.py inspect_loan_repayment_allocations --loan LN-571
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only: dump LoanRepaymentAllocation rows for one loan, plus its current outstanding_* fields.'

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', required=True)

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        try:
            loan = LoanAccount.all_objects.get(loan_number=loan_number, is_deleted=False)
        except LoanAccount.DoesNotExist:
            raise CommandError(f'Loan {loan_number} not found.')

        self.stdout.write(self.style.MIGRATE_HEADING(f'[{loan_number}] pk={loan.pk}  status={loan.status}'))
        self.stdout.write(
            f'  disbursed_amount={loan.disbursed_amount:,.2f}  '
            f'outstanding_principal={loan.outstanding_principal:,.2f}  '
            f'outstanding_interest={loan.outstanding_interest:,.2f}  '
            f'outstanding_fees={loan.outstanding_fees:,.2f}  '
            f'outstanding_penalties={loan.outstanding_penalties:,.2f}\n'
            f'  principal_paid={loan.principal_paid:,.2f}  interest_paid={loan.interest_paid:,.2f}  '
            f'fees_paid={loan.fees_paid:,.2f}  penalties_paid={loan.penalties_paid:,.2f}  '
            f'total_paid={loan.total_paid:,.2f}\n'
        )

        self.stdout.write('Schedule rows:')
        for sched in loan.repayment_schedule.order_by('due_date'):
            self.stdout.write(
                f'  #{sched.installment_number:<3d} due={sched.due_date}  status={sched.status:12s}  '
                f'payment_date={sched.payment_date}\n'
                f'      due:  principal={sched.principal_due:>10,.2f}  interest={sched.interest_due:>10,.2f}  '
                f'fees={sched.fees_due:>10,.2f}  penalty={sched.penalty_due:>10,.2f}  total_due={sched.total_due:>10,.2f}\n'
                f'      paid: principal={sched.principal_paid:>10,.2f}  interest={sched.interest_paid:>10,.2f}  '
                f'fees={sched.fees_paid:>10,.2f}  penalty={sched.penalty_paid:>10,.2f}  total_paid={sched.total_paid:>10,.2f}'
            )
        self.stdout.write('')

        allocations = loan.repayment_allocations.select_related(
            'journal_entry', 'schedule'
        ).order_by('journal_entry__date', 'id')

        if not allocations.exists():
            self.stdout.write(self.style.WARNING('No LoanRepaymentAllocation rows for this loan.'))
            return

        self.stdout.write('Allocations:')
        totals = {'principal': 0, 'interest': 0, 'fees': 0, 'penalty': 0}
        for alloc in allocations:
            txn = alloc.journal_entry
            sched_desc = f'installment due {alloc.schedule.due_date}' if alloc.schedule else '(no schedule row — leftover)'
            self.stdout.write(
                f'  {txn.reference_number:24s} {txn.date}  {sched_desc}\n'
                f'      principal={alloc.principal_applied:>12,.2f}  interest={alloc.interest_applied:>12,.2f}  '
                f'fees={alloc.fees_applied:>12,.2f}  penalty={alloc.penalty_applied:>12,.2f}  '
                f'total={alloc.principal_applied + alloc.interest_applied + alloc.fees_applied + alloc.penalty_applied:>12,.2f}'
            )
            totals['principal'] += alloc.principal_applied
            totals['interest'] += alloc.interest_applied
            totals['fees'] += alloc.fees_applied
            totals['penalty'] += alloc.penalty_applied

        self.stdout.write(self.style.SUCCESS(
            f"\nLifetime totals from allocations: principal={totals['principal']:,.2f}  "
            f"interest={totals['interest']:,.2f}  fees={totals['fees']:,.2f}  penalty={totals['penalty']:,.2f}"
        ))
        self.stdout.write(
            f"Compare to loan.principal_paid={loan.principal_paid:,.2f} — "
            f"{'MATCHES' if abs(totals['principal'] - loan.principal_paid) < 1 else 'DOES NOT MATCH'}"
        )
        self.stdout.write(
            f"Compare disbursed_amount - allocations.principal = "
            f"{loan.disbursed_amount - totals['principal']:,.2f} to current "
            f"outstanding_principal={loan.outstanding_principal:,.2f} — "
            f"{'MATCHES' if abs((loan.disbursed_amount - totals['principal']) - loan.outstanding_principal) < 1 else 'DOES NOT MATCH'}"
        )
