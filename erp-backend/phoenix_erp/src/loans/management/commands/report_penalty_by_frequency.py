"""
Management command: report_penalty_by_frequency

Read-only. Answers two questions raised by branch staff (2026-08-13):
"is the penalty accrual work debiting everyone, or only monthly customers"
and "give me the names of affected customers."

Part 1: prints every LoanProduct's repayment_frequency and late_payment_penalty
configuration — settles whether non-monthly products even have a penalty rate
configured in this environment (the code itself (calculate_late_penalty) does
NOT restrict penalty to monthly loans; it computes a penalty for any
repayment_frequency using LoanProduct.late_payment_penalty. Whether daily/
weekly/biweekly/quarterly products are actually charged anything in practice
depends entirely on how each product's late_payment_penalty is configured).

Part 2: for every loan currently carrying penalty_due > 0, lists the client
name, loan number, repayment_frequency, and current penalty_due/penalties_paid
— with a summary count and total grouped by repayment_frequency at the top,
so it's immediately visible whether non-monthly loans are represented at all.

Makes no changes.

Usage:
    python manage.py report_penalty_by_frequency
    python manage.py report_penalty_by_frequency --frequency monthly
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum, Count


class Command(BaseCommand):
    help = (
        'Read-only: LoanProduct penalty configuration by repayment_frequency, plus every '
        'loan currently carrying penalty_due > 0, grouped by frequency.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--frequency', dest='frequency', default=None,
                             help='Only show loans with this repayment_frequency.')

    def handle(self, *args, **options):
        from loans.models import LoanProduct, LoanAccount

        frequency = options['frequency']

        self.stdout.write(self.style.MIGRATE_HEADING('--- LoanProduct penalty configuration ---'))
        for product in LoanProduct.objects.all().order_by('repayment_frequency', 'name'):
            self.stdout.write(
                f"  {product.name:30s} frequency={product.repayment_frequency:10s} "
                f"penalty_type={product.late_payment_penalty_type:10s} "
                f"penalty_rate={product.late_payment_penalty}  "
                f"penalty_income_account={'set' if product.penalty_income_account else 'NOT SET'}"
            )

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, status__in=['active', 'disbursed', 'defaulted', 'overdue'],
        ).select_related('client', 'product').order_by('repayment_frequency', 'loan_number')

        # penalty_due lives on the schedule, not the loan — pull the current
        # sum per loan the same way the accrual/audit commands do.
        rows = []
        for loan in loans.iterator():
            if frequency and loan.repayment_frequency != frequency:
                continue
            total_penalty_due = loan.repayment_schedule.aggregate(
                total=Sum('penalty_due')
            )['total'] or Decimal('0.00')
            if total_penalty_due <= 0:
                continue
            rows.append((loan, total_penalty_due))

        if not rows:
            self.stdout.write(self.style.SUCCESS('\nNo loans currently carrying penalty_due > 0.'))
            return

        by_freq = {}
        for loan, penalty_due in rows:
            bucket = by_freq.setdefault(loan.repayment_frequency, {'count': 0, 'total': Decimal('0.00')})
            bucket['count'] += 1
            bucket['total'] += penalty_due

        self.stdout.write(self.style.MIGRATE_HEADING('\n--- Summary by repayment_frequency ---'))
        for freq, agg in sorted(by_freq.items()):
            self.stdout.write(f"  {freq:12s} loans={agg['count']:<5d} total_penalty_due={agg['total']:>14,.2f}")

        self.stdout.write(self.style.MIGRATE_HEADING(f'\n--- Affected customers ({len(rows)}) ---'))
        for loan, penalty_due in rows:
            self.stdout.write(
                f"  {loan.client.full_name:30s} {loan.loan_number:24s} "
                f"freq={loan.repayment_frequency:10s} penalty_due={penalty_due:>12,.2f}  "
                f"penalties_paid={loan.penalties_paid:>12,.2f}  "
                f"accrual_active={loan.penalty_accrual_active}"
            )
