"""
Management command: audit_outstanding_penalties_reconciliation

READ-ONLY. Built 2026-08-29 to answer a direct question after
repair_schedule_total_due --all --apply: did rebuilding outstanding_penalties
from scratch (sum of penalty_due across open rows, minus penalties_paid)
silently erase genuinely-owed penalty on any of the 37 repaired loans, or
does the arithmetic actually check out (i.e. penalties_paid already covers
what's currently formula-owed, because real cash was collected)?

For one loan, prints EVERY schedule row (any status) with its penalty_due/
penalty_paid, the loan's penalties_paid, and the exact reconciliation sum
stored.outstanding_penalties is supposed to equal — so the arithmetic is
fully visible rather than estimated from a GL trace.

Usage:
    python manage.py audit_outstanding_penalties_reconciliation LN-491
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only: show the exact outstanding_penalties reconciliation arithmetic for one loan.'

    def add_arguments(self, parser):
        parser.add_argument('loan_number', type=str)

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        try:
            loan = LoanAccount.all_objects.select_related('client').get(loan_number=loan_number)
        except LoanAccount.DoesNotExist:
            raise CommandError(f"No LoanAccount found with loan_number='{loan_number}'")

        self.stdout.write(self.style.MIGRATE_HEADING(f'{loan.loan_number} — {loan.client.full_name}'))
        self.stdout.write(f'  loan.penalties_paid (lifetime real cash collected against penalty) = {loan.penalties_paid:,.2f}')
        self.stdout.write(f'  loan.outstanding_penalties (currently stored)                       = {loan.outstanding_penalties:,.2f}')
        self.stdout.write('')

        self.stdout.write(self.style.MIGRATE_HEADING('Every schedule row (any status)'))
        open_penalty_sum = Decimal('0.00')
        for sched in loan.repayment_schedule.all().order_by('due_date'):
            in_open_sum = sched.status in ('pending', 'partial', 'overdue')
            if in_open_sum:
                open_penalty_sum += sched.penalty_due
            marker = '  <== counted in open-row sum' if in_open_sum else ''
            self.stdout.write(
                f'  installment #{sched.installment_number:<3d} due={sched.due_date}  status={sched.status:<12s}  '
                f'penalty_due={sched.penalty_due:>10,.2f}  penalty_paid={sched.penalty_paid:>10,.2f}{marker}'
            )

        self.stdout.write('')
        computed = max(Decimal('0.00'), open_penalty_sum - loan.penalties_paid)
        self.stdout.write(
            f'  sum(penalty_due across open rows) = {open_penalty_sum:,.2f}  '
            f'minus penalties_paid = {loan.penalties_paid:,.2f}  '
            f'=> outstanding_penalties should be max(0, {open_penalty_sum:,.2f} - {loan.penalties_paid:,.2f}) '
            f'= {computed:,.2f}'
        )
        if computed == loan.outstanding_penalties:
            self.stdout.write(self.style.SUCCESS(
                f'  MATCHES stored outstanding_penalties ({loan.outstanding_penalties:,.2f}) — arithmetic is consistent.'
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f'  MISMATCH — stored outstanding_penalties ({loan.outstanding_penalties:,.2f}) does not match '
                f'this recomputation ({computed:,.2f}). Needs investigation.'
            ))
