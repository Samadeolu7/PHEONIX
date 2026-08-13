"""
Management command: audit_penalty_due_inflation

REPORT-ONLY — never writes anything.

Context: `audit_penalty_overcollection` / `apply_penalty_overcollection_credit`
only examine LoanRepaymentSchedule rows where penalty_paid > 0 — installments
a client already paid something on. They have no visibility into unpaid
installments (penalty_paid == 0) sitting on an inflated penalty_due.

That blind spot matters because `update_loan_status` (loans/management/commands/
update_loan_status.py, ~line 93) applies penalty as a one-way ratchet:

    delta = new_penalty - sched.penalty_due
    if delta > 0:
        sched.penalty_due = new_penalty
        ...

It only ever RAISES penalty_due when the freshly recalculated (corrected,
periods-late) amount is higher than what's already stored. If penalty_due
was already inflated above the corrected formula's answer — from before
`calculate_late_penalty()` was fixed, or from legacy migration data — this
task runs daily forever and never brings it back down. LoanAccount.
outstanding_penalties inherits that same stuck-high figure (it's built from
these deltas).

This command recomputes, for every currently-unpaid-or-partial schedule row,
what calculate_late_penalty() says penalty_due SHOULD be today, and flags
rows where the recorded penalty_due exceeds that — i.e. amounts still being
asked of a client (or still inflating LoanAccount.outstanding_penalties)
that the daily task will never self-correct.

Only rows with status in ('pending', 'partial', 'overdue') are considered —
'paid' rows are already fully covered by `audit_penalty_overcollection`.

Usage:
    python manage.py audit_penalty_due_inflation
    python manage.py audit_penalty_due_inflation --loan LN-659
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Report-only: find still-unpaid installments whose penalty_due is stuck above "
        "what the corrected (periods-late) formula says it should be today — the daily "
        "update_loan_status task only ever raises penalty_due, never lowers it."
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--min-inflated', dest='min_inflated', type=str, default='0.01',
                             help='Only list rows where inflation exceeds this amount (default: 0.01).')

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule
        from django.utils import timezone

        loan_number = options['loan_number']
        min_inflated = Decimal(options['min_inflated'])
        today = timezone.localdate()

        schedules = LoanRepaymentSchedule.all_objects.filter(
            status__in=['pending', 'partial', 'overdue'],
        ).select_related('loan', 'loan__product').order_by('loan__loan_number', 'due_date')

        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        flags = []
        total_inflation = Decimal('0.00')
        per_loan_total = {}

        for sched in schedules.iterator():
            loan = sched.loan
            days_late = loan.product.effective_days_late(sched.due_date, today)
            if days_late <= 0:
                corrected = Decimal('0.00')
            else:
                base_amount = sched.principal_due + sched.interest_due + sched.fees_due
                corrected = loan.product.calculate_late_penalty(
                    base_amount, days_late, loan.repayment_frequency,
                )

            inflation = (sched.penalty_due - corrected).quantize(Decimal('0.01'))
            if inflation > min_inflated:
                flags.append((loan, sched, days_late, corrected, inflation))
                total_inflation += inflation
                per_loan_total[loan.loan_number] = per_loan_total.get(loan.loan_number, Decimal('0.00')) + inflation

        self.stdout.write(f"Unpaid/partial rows checked: {schedules.count()}")
        self.stdout.write(f"Flagged (penalty_due stuck above corrected estimate): {len(flags)}")

        for loan, sched, days_late, corrected, inflation in flags:
            self.stdout.write(
                f"  {loan.loan_number:24s} installment #{sched.installment_number:<3d} "
                f"status={sched.status:<8s} due={sched.due_date} days_late={days_late:<4d} "
                f"penalty_due={sched.penalty_due:>14,.2f}  corrected_est={corrected:>12,.2f}  "
                f"stuck_excess={inflation:>14,.2f}"
            )

        if per_loan_total:
            self.stdout.write("\n--- Per-loan stuck excess (still-owed, will never self-correct) ---")
            for loan_number, amt in sorted(per_loan_total.items(), key=lambda x: -x[1]):
                self.stdout.write(f"  {loan_number:24s} {amt:>14,.2f}")

        self.stdout.write('')
        if flags:
            self.stdout.write(self.style.ERROR(
                f"Total stuck excess still sitting in unpaid penalty_due: {total_inflation:,.2f} "
                f"— this is what clients are still being asked to pay that the daily task will "
                f"never correct on its own. Makes no changes; needs a deliberate one-time correction "
                f"per loan (reduce penalty_due to the corrected estimate, and reduce "
                f"LoanAccount.outstanding_penalties by the same per-loan total)."
            ))
        else:
            self.stdout.write(self.style.SUCCESS('No stuck excess found in unpaid installments.'))
