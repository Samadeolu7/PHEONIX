"""
Management command: audit_penalty_overcollection

REPORT-ONLY — never writes anything. It never adjusts penalty_paid,
outstanding_penalties, GL balances, or anything else; it only prints.

Context: LoanProduct.calculate_late_penalty() previously multiplied the
percentage rate by raw calendar days_late instead of by the number of
elapsed repayment periods (weeks/months, per the loan's repayment_frequency).
That has been fixed going forward (see calculate_late_penalty() in
loans/models.py), but any penalty that was already PAID by a client while
the old formula was live may have been overcharged — that's money actually
collected, not just a balance to correct, so it needs a human decision
(credit/refund/write-down) rather than an automated fix.

This command re-estimates what each *fully settled* installment's penalty
should have been under the corrected (periods-late) formula, using the
days_late and per-component amounts already recorded on that
LoanRepaymentSchedule row, and flags where penalty_paid exceeds that
estimate.

Approximation, by necessity: the historical formula was evaluated against
"outstanding_amount" at whatever the arrears balance happened to be on each
daily batch run — we don't have a day-by-day snapshot of that. This command
substitutes the installment's own (principal_due + interest_due + fees_due)
as the base, which is a reasonable stand-in for a single settled installment
but is still an estimate, not a reconciled ledger figure. Flagged loans
should be manually verified against the actual payment/journal history
before any refund or credit is issued.

Only fully-paid ('paid') schedule rows are auto-estimated, since days_late
and payment_date are only reliably recorded at full settlement. Rows with
penalty_paid > 0 that are still 'partial'/'overdue' are listed separately
under "needs manual review" rather than guessed at.

Usage:
    python manage.py audit_penalty_overcollection
    python manage.py audit_penalty_overcollection --loan LN-659
    python manage.py audit_penalty_overcollection --min-overcollected 100
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Report-only: estimate historical penalty overcollection caused by the "
        "old days-late penalty formula, so far-collected amounts can be reviewed "
        "for credit/refund. Makes no changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Only check a single loan by loan_number.',
        )
        parser.add_argument(
            '--min-overcollected',
            dest='min_overcollected',
            type=str,
            default='0.01',
            help='Only list rows where the estimated overcollection exceeds this amount (default: 0.01).',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentSchedule

        loan_number = options['loan_number']
        min_overcollected = Decimal(options['min_overcollected'])

        schedules = LoanRepaymentSchedule.all_objects.filter(
            penalty_paid__gt=0,
        ).select_related('loan', 'loan__product').order_by('loan__loan_number', 'due_date')

        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        settled_flags = []
        needs_review = []
        total_estimated_overcollection = Decimal('0.00')

        for sched in schedules.iterator():
            loan = sched.loan
            if sched.status != 'paid' or not sched.days_late:
                needs_review.append(sched)
                continue

            base_amount = sched.principal_due + sched.interest_due + sched.fees_due
            corrected_penalty = loan.product.calculate_late_penalty(
                base_amount, sched.days_late, loan.repayment_frequency,
            )
            overcollected = (sched.penalty_paid - corrected_penalty).quantize(Decimal('0.01'))

            if overcollected > min_overcollected:
                settled_flags.append((loan, sched, corrected_penalty, overcollected))
                total_estimated_overcollection += overcollected

        self.stdout.write(f"Fully-settled installments with penalty_paid > 0 checked: "
                           f"{schedules.filter(status='paid').count()}")
        self.stdout.write(f"Flagged as possibly overcollected: {len(settled_flags)}")
        self.stdout.write(f"Needs manual review (not fully settled / no days_late recorded): "
                           f"{len(needs_review)}")

        if settled_flags:
            self.stdout.write("\n--- Estimated overcollection (fully settled installments) ---")
            for loan, sched, corrected_penalty, overcollected in settled_flags:
                self.stdout.write(
                    f"  {loan.loan_number:24s} installment #{sched.installment_number:<3d} "
                    f"due={sched.due_date} days_late={sched.days_late:<4d} "
                    f"penalty_paid={sched.penalty_paid:>10,.2f}  "
                    f"corrected_est={corrected_penalty:>10,.2f}  "
                    f"overcollected_est={overcollected:>10,.2f}"
                )
            self.stdout.write(
                self.style.WARNING(
                    f"\nTotal estimated overcollection: {total_estimated_overcollection:,.2f} "
                    "— verify against actual payment/journal history before crediting or refunding."
                )
            )

        if needs_review:
            self.stdout.write("\n--- Needs manual review (penalty_paid > 0, not cleanly auto-estimable) ---")
            for sched in needs_review:
                self.stdout.write(
                    f"  {sched.loan.loan_number:24s} installment #{sched.installment_number:<3d} "
                    f"status={sched.status:<10s} due={sched.due_date} "
                    f"penalty_paid={sched.penalty_paid:>10,.2f} days_late_recorded={sched.days_late}"
                )

        if not settled_flags and not needs_review:
            self.stdout.write(self.style.SUCCESS("No penalty payments found to review."))
