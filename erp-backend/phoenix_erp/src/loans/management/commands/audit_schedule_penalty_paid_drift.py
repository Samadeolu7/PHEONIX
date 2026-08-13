"""
Management command: audit_schedule_penalty_paid_drift

Read-only audit. LoanRepaymentSchedule.penalty_paid (the per-installment
figure) is written by LoanAccount._update_schedule_with_payment(), which was
fixed on 2026-08-05 to apply the real penalty/interest/fees/principal split
instead of a broken proportional-to-due estimate. That fix is correct for
every payment recorded since, but payments recorded BEFORE it could still
have left schedule rows understating how much penalty was actually paid on
them — even though the loan-level aggregate, LoanAccount.penalties_paid, is
tracked independently in record_payment() and is unaffected by that old bug
(see report_penalty_paid_per_payment.py, which reads the same ground truth
from FinancialAuditLog).

This compares, per loan:
    schedule_penalty_paid = Sum(LoanRepaymentSchedule.penalty_paid)
against:
    loan.penalties_paid

A schedule total BEHIND the aggregate means real penalty payments never
landed on the schedule rows they belong to — those rows will still look
unpaid/underpaid even though the client settled them, and (see the flag
below) may have caused accrue_outstanding_penalty_backlog to double-count:
that command computed "unpaid penalty" per row as `penalty_due - penalty_paid`,
so an understated penalty_paid there means it could have posted a GL accrual
for penalty the client had already paid.

For every affected loan, also reports whether it received a penalty-accrual
backlog catch-up entry (FinancialAuditLog.LOAN_PENALTY_ACCRUAL, description
contains "backlog catch-up") — those are the ones where drift isn't just a
cosmetic schedule display problem, it may mean a GL entry needs reviewing.

Makes no changes.

Usage:
    python manage.py audit_schedule_penalty_paid_drift
    python manage.py audit_schedule_penalty_paid_drift --loan LN-342
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Read-only audit: loans where Sum(LoanRepaymentSchedule.penalty_paid) '
        'disagrees with LoanAccount.penalties_paid.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan', dest='loan_number', default=None,
            help='Only check a single loan by loan_number.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']

        loans = LoanAccount.all_objects.filter(is_deleted=False).order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        backlog_loan_numbers = set(
            FinancialAuditLog.objects.filter(
                event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                description__icontains='backlog catch-up',
            ).values_list('extra__loan_number', flat=True)
        )

        checked = 0
        understated = []
        overstated = []

        for loan in loans.iterator():
            checked += 1
            schedule_penalty_paid = loan.repayment_schedule.aggregate(
                total=Sum('penalty_paid')
            )['total'] or Decimal('0.00')

            drift = (loan.penalties_paid or Decimal('0.00')) - schedule_penalty_paid
            if drift > TOLERANCE:
                understated.append((loan, schedule_penalty_paid, drift))
            elif drift < -TOLERANCE:
                overstated.append((loan, schedule_penalty_paid, drift))

        self.stdout.write(f'Loans checked: {checked}')
        self.stdout.write(
            f'Understated on schedule (client paid more than schedule shows): {len(understated)}'
        )
        self.stdout.write(
            f'Overstated on schedule (schedule shows more than was actually paid): {len(overstated)}'
        )

        if not understated and not overstated:
            self.stdout.write(self.style.SUCCESS('\nNo drift found.'))
            return

        if understated:
            self.stdout.write(self.style.ERROR('\n--- Understated (schedule behind actual penalty paid) ---'))
            flagged_total = Decimal('0.00')
            for loan, schedule_paid, drift in understated:
                touched_by_backlog = loan.loan_number in backlog_loan_numbers
                flag = ' *** RECEIVED BACKLOG ACCRUAL — REVIEW GL ***' if touched_by_backlog else ''
                if touched_by_backlog:
                    flagged_total += drift
                self.stdout.write(
                    f'  {loan.loan_number:24s} penalties_paid={loan.penalties_paid:>10,.2f}  '
                    f'schedule_penalty_paid={schedule_paid:>10,.2f}  understated_by={drift:>10,.2f}{flag}'
                )
            if flagged_total:
                self.stdout.write(self.style.ERROR(
                    f'\n₦{flagged_total:,.2f} of the understated amount is on loans that also '
                    f'received a penalty-accrual backlog catch-up entry — those GL postings may '
                    f'have accrued penalty income the client had already paid. Investigate before '
                    f'trusting them.'
                ))

        if overstated:
            self.stdout.write(self.style.WARNING('\n--- Overstated (schedule ahead of actual penalty paid) ---'))
            for loan, schedule_paid, drift in overstated:
                self.stdout.write(
                    f'  {loan.loan_number:24s} penalties_paid={loan.penalties_paid:>10,.2f}  '
                    f'schedule_penalty_paid={schedule_paid:>10,.2f}  overstated_by={-drift:>10,.2f}'
                )

        self.stdout.write(self.style.WARNING('\nRead-only — no changes made.'))
