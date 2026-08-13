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

This command re-estimates what each installment's penalty should have been
under the corrected (periods-late) formula, and flags where penalty_paid
exceeds that estimate, in two ways depending on the row's status:

  - Fully settled ('paid') rows: uses the days_late recorded at settlement
    (final and won't change).
  - Still-open ('partial'/'overdue') rows with penalty_paid > 0: computes
    days-late LIVE as (today - due_date) — reliable even though the row
    isn't settled, since the due date is fixed and "today" is well-defined.
    Because days-late (and therefore the corrected penalty) can only grow
    the longer a row stays unpaid, any amount already paid in excess of
    TODAY's corrected estimate is a safe lower-bound signal of
    overcollection — it will not shrink on its own.

Approximation, by necessity either way: the historical formula was
evaluated against "outstanding_amount" at whatever the arrears balance
happened to be on each daily batch run — we don't have a day-by-day
snapshot of that. This command substitutes the installment's own
(principal_due + interest_due + fees_due) as the base, a reasonable
stand-in but still an estimate, not a reconciled ledger figure. Flagged
loans should be manually verified against the actual payment/journal
history before any refund or credit is issued.

Usage:
    python manage.py audit_penalty_overcollection
    python manage.py audit_penalty_overcollection --loan LN-659
    python manage.py audit_penalty_overcollection --min-overcollected 100
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone


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
        from loans.models import LoanRepaymentSchedule

        loan_number = options['loan_number']
        min_overcollected = Decimal(options['min_overcollected'])
        today = timezone.localdate()

        schedules = LoanRepaymentSchedule.all_objects.filter(
            penalty_paid__gt=0,
        ).select_related('loan', 'loan__product').order_by('loan__loan_number', 'due_date')

        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        settled_flags = []
        open_flags = []
        needs_review = []
        total_estimated_overcollection = Decimal('0.00')

        for sched in schedules.iterator():
            loan = sched.loan
            base_amount = sched.principal_due + sched.interest_due + sched.fees_due

            if sched.status == 'paid':
                if not sched.days_late:
                    needs_review.append(sched)
                    continue
                # sched.days_late was recorded at payment time from the raw
                # (payment_date - due_date) gap — recompute through the
                # cutover-aware helper instead of trusting the stored value,
                # which predates the fix for legacy-imported rows.
                days_late = loan.product.effective_days_late(
                    sched.due_date, sched.payment_date or today,
                )
                if not days_late:
                    needs_review.append(sched)
                    continue
                bucket = settled_flags
                still_open = False
            elif sched.status in ('partial', 'overdue'):
                days_late = loan.product.effective_days_late(sched.due_date, today)
                if days_late <= 0:
                    needs_review.append(sched)
                    continue
                bucket = open_flags
                still_open = True
            else:
                needs_review.append(sched)
                continue

            corrected_penalty = loan.product.calculate_late_penalty(
                base_amount, days_late, loan.repayment_frequency,
            )
            overcollected = (sched.penalty_paid - corrected_penalty).quantize(Decimal('0.01'))

            if overcollected > min_overcollected:
                bucket.append((loan, sched, days_late, corrected_penalty, overcollected, still_open))
                total_estimated_overcollection += overcollected

        self.stdout.write(f"Rows with penalty_paid > 0 checked: {schedules.count()}")
        self.stdout.write(f"Flagged, fully settled: {len(settled_flags)}")
        self.stdout.write(f"Flagged, still open (estimate as of today, may still change): {len(open_flags)}")
        self.stdout.write(f"Needs manual review (no reliable days-late basis): {len(needs_review)}")

        def _print_flags(title, flags):
            self.stdout.write(f"\n--- {title} ---")
            for loan, sched, days_late, corrected_penalty, overcollected, still_open in flags:
                tag = ' (as of today — may grow if it stays unpaid)' if still_open else ''
                self.stdout.write(
                    f"  {loan.loan_number:24s} installment #{sched.installment_number:<3d} "
                    f"due={sched.due_date} days_late={days_late:<4d} "
                    f"penalty_paid={sched.penalty_paid:>10,.2f}  "
                    f"corrected_est={corrected_penalty:>10,.2f}  "
                    f"overcollected_est={overcollected:>10,.2f}{tag}"
                )

        if settled_flags:
            _print_flags('Estimated overcollection — fully settled installments', settled_flags)
        if open_flags:
            _print_flags('Estimated overcollection — still-open installments (lower-bound estimate)', open_flags)
        if settled_flags or open_flags:
            self.stdout.write(
                self.style.WARNING(
                    f"\nTotal estimated overcollection: {total_estimated_overcollection:,.2f} "
                    "— verify against actual payment/journal history before crediting or refunding."
                )
            )

        if needs_review:
            self.stdout.write("\n--- Needs manual review (no reliable days-late basis) ---")
            for sched in needs_review:
                self.stdout.write(
                    f"  {sched.loan.loan_number:24s} installment #{sched.installment_number:<3d} "
                    f"status={sched.status:<10s} due={sched.due_date} "
                    f"penalty_paid={sched.penalty_paid:>10,.2f} days_late_recorded={sched.days_late}"
                )

        if not settled_flags and not open_flags and not needs_review:
            self.stdout.write(self.style.SUCCESS("No penalty payments found to review."))
