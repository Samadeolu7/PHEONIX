"""
Management command: audit_loan_penalty_gl_vs_truth

Read-only. Follows the same philosophy as audit_loan_outstanding_vs_gl_truth.py:
compute what a GL balance SHOULD be from ground truth and compare to what's
actually posted, rather than deriving a correction algebraically from a
single aggregate (which audit_schedule_penalty_paid_drift.py's per-loan
"understated_by" figure turned out not to be reliable enough for — LN-735
showed an understated_by of 89,670.00 while its backlog catch-up entries only
ever posted 70,156.94 in total, meaning more than one thing is wrong on that
loan and a flat subtraction would either under- or over-correct it).

For every loan with penalty_accrual_active=True:

    correct_gl_accrued_penalty = Sum(schedule.penalty_due, current) - loan.penalties_paid

  i.e. total penalty ever assessed minus total penalty ever paid — what should
  currently be sitting in GL as "assessed but not yet collected" penalty. This
  assumes penalties_paid predates accrual for that loan; since
  penalty_accrual_active is a one-way flag set permanently the first time an
  LNPEN entry posts, any payment recorded after that point already reduces
  Loan Receivable directly (see LoanAccount.record_payment(), the
  penalty_accrual_active branch) rather than adding to penalties_paid against
  an unaccrued balance, so this holds regardless of how much time has passed
  since the flip.

    actual_gl_accrued_penalty = net Dr to loan.account across every LNPEN
    journal entry referencing this loan (Dr - Cr; a self-correcting downward
    revision posts the reverse pair, so this nets out correctly on its own).

The difference is the one-shot correction this loan's GL actually needs:
positive means under-accrued (fine, low-risk — the loan is entitled to more
income recognition than it's gotten); negative means over-accrued (the
concerning case — Penalty Income and Loan Receivable both need to come down).

Makes no changes — report only, on purpose, same as
audit_loan_outstanding_vs_gl_truth.py: a correction here touches real GL
income and receivable balances and should be reviewed per loan, not applied
blind.

Usage:
    python manage.py audit_loan_penalty_gl_vs_truth
    python manage.py audit_loan_penalty_gl_vs_truth --loan LN-735
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Read-only: for loans with penalty_accrual_active, compare what LNPEN entries '
        'actually posted against what the current schedule + trusted penalties_paid '
        'aggregate say should have been posted.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check this loan number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import Transaction, TransactionEntry

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, penalty_accrual_active=True,
        ).select_related('account').order_by('loan_number')

        if options['loan_number']:
            loans = loans.filter(loan_number=options['loan_number'])

        checked = 0
        over_accrued = []
        under_accrued = []

        for loan in loans.iterator():
            checked += 1

            total_penalty_due = loan.repayment_schedule.aggregate(
                total=Sum('penalty_due')
            )['total'] or Decimal('0.00')
            correct_accrued = total_penalty_due - (loan.penalties_paid or Decimal('0.00'))

            lnpen_lines = TransactionEntry.objects.filter(
                transaction__series__code='LNPEN',
                transaction__description__icontains=loan.loan_number,
                account=loan.account,
            ).values('side').annotate(total=Sum('amount'))
            debit = next((r['total'] for r in lnpen_lines if r['side'] == TransactionEntry.DEBIT), Decimal('0.00'))
            credit = next((r['total'] for r in lnpen_lines if r['side'] == TransactionEntry.CREDIT), Decimal('0.00'))
            actual_accrued = debit - credit

            delta = correct_accrued - actual_accrued
            if delta < -TOLERANCE:
                over_accrued.append((loan, correct_accrued, actual_accrued, delta))
            elif delta > TOLERANCE:
                under_accrued.append((loan, correct_accrued, actual_accrued, delta))

        self.stdout.write(f'Loans checked (penalty_accrual_active=True): {checked}')
        self.stdout.write(f'Over-accrued (GL shows more than it should): {len(over_accrued)}')
        self.stdout.write(f'Under-accrued (GL shows less than it should): {len(under_accrued)}')

        if over_accrued:
            self.stdout.write(self.style.ERROR(
                '\n--- OVER-accrued — Penalty Income + Loan Receivable both overstated ---'
            ))
            total_over = Decimal('0.00')
            for loan, correct, actual, delta in over_accrued:
                total_over += -delta
                self.stdout.write(
                    f'  {loan.loan_number:24s} should_be_accrued={correct:>12,.2f}  '
                    f'actually_posted={actual:>12,.2f}  needs_reversal={-delta:>12,.2f}'
                )
            self.stdout.write(self.style.ERROR(
                f'\nTotal over-accrual to reverse: ₦{total_over:,.2f} '
                f'(Dr Penalty Income / Cr Loan Receivable, per loan, for the needs_reversal amount)'
            ))

        if under_accrued:
            self.stdout.write(self.style.WARNING(
                '\n--- UNDER-accrued — GL is behind what schedule + payments justify ---'
            ))
            for loan, correct, actual, delta in under_accrued:
                self.stdout.write(
                    f'  {loan.loan_number:24s} should_be_accrued={correct:>12,.2f}  '
                    f'actually_posted={actual:>12,.2f}  needs_additional_accrual={delta:>12,.2f}'
                )

        if not over_accrued and not under_accrued:
            self.stdout.write(self.style.SUCCESS('\nEvery accrual-active loan\'s GL matches ground truth.'))

        self.stdout.write(self.style.WARNING('\nRead-only — no changes made.'))
