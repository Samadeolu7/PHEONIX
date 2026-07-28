"""
Management command: apply_penalty_due_correction

Corrects the gap found by `audit_penalty_due_inflation` (2026-07-24):
`update_loan_status.py` applies penalty_due as a one-way ratchet (only ever
raises it when the corrected, periods-late formula gives a higher number
than what's stored) — so any installment whose penalty_due was inflated by
the old days-late-not-periods-late formula bug stays inflated forever,
regardless of how many times the daily task runs. This is a DIFFERENT gap
than `apply_penalty_overcollection_credit` covers: that command only looks
at rows with penalty_paid > 0 (already paid); this command looks at rows
still owed (pending/partial/overdue) where the client hasn't paid the
penalty portion yet — i.e. the amount they're currently being asked to pay
going forward.

For every flagged row (recorded penalty_due > what calculate_late_penalty()
says it should be today):

    LoanRepaymentSchedule.penalty_due  -> corrected estimate
    LoanAccount.outstanding_penalties  -= stuck_excess (summed per loan, floored at 0)

total_due is intentionally NEVER touched here. total_due is defined as
principal_due + interest_due + fees_due (see update_loan_status.py and
LoanAccount.apply_payment) — penalty is tracked entirely separately via
penalty_due/penalty_paid on the row and outstanding_penalties on the loan.
An earlier version of this command subtracted stuck_excess from total_due
(floored at total_paid), which corrupted the row whenever stuck_excess
exceeded total_due itself — e.g. on legacy-imported loans where penalty_due
started out inflated relative to a total_due that never included it, this
collapsed total_due to 0 and wiped out principal/interest that was never
inflated and had nothing to do with the penalty correction. See
audit_total_due_integrity for finding rows already damaged this way.

status is intentionally left untouched (matches apply_penalty_overcollection_credit's
convention) — the normal repayment flow already recalculates status from
total_paid vs total_due on the next payment.

SAFETY:
  - Dry-run by default — prints the full per-row breakdown, per-loan totals,
    and grand total. Nothing is written until --apply.
  - Batch mode: with --apply, ALL flagged rows across ALL loans are corrected
    in one atomic transaction (all-or-nothing) — reviewed as a whole via the
    dry-run output first, not one loan at a time (see audit_penalty_due_inflation
    for the same numbers without any write capability).
  - Every corrected row is logged via FinancialAuditLog (LOAN_BALANCE_CORRECTION)
    with before/after penalty_due and the loan's outstanding_penalties.

Usage:
    python manage.py apply_penalty_due_correction                # dry-run, whole book
    python manage.py apply_penalty_due_correction --loan LN-659  # dry-run, one loan
    python manage.py apply_penalty_due_correction --apply        # posts the correction
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        'Correct stuck-inflated penalty_due on unpaid installments (the one-way-ratchet '
        'gap update_loan_status never self-corrects) and reduce LoanAccount.outstanding_penalties '
        'to match. Dry-run by default; --apply corrects everything shown in one batch.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--min-inflated', dest='min_inflated', type=str, default='0.01',
                             help='Only correct rows where inflation exceeds this amount (default: 0.01).')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule, LoanAccount
        from common.models import FinancialAuditLog, log_financial_event
        from django.utils import timezone

        loan_number = options['loan_number']
        min_inflated = Decimal(options['min_inflated'])
        apply_changes = options['apply']
        today = timezone.localdate()

        schedules = LoanRepaymentSchedule.all_objects.filter(
            status__in=['pending', 'partial', 'overdue'],
        ).select_related('loan', 'loan__product').order_by('loan__loan_number', 'due_date')

        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        flags = []  # (sched, days_late, corrected, stuck_excess)
        per_loan_total = {}  # loan.pk -> Decimal

        for sched in schedules.iterator():
            loan = sched.loan
            days_late = (today - sched.due_date).days
            if days_late <= 0:
                corrected = Decimal('0.00')
            else:
                base_amount = sched.principal_due + sched.interest_due + sched.fees_due
                corrected = loan.product.calculate_late_penalty(
                    base_amount, days_late, loan.repayment_frequency,
                )

            stuck_excess = (sched.penalty_due - corrected).quantize(Decimal('0.01'))
            if stuck_excess > min_inflated:
                flags.append((sched, days_late, corrected, stuck_excess))
                per_loan_total[loan.pk] = per_loan_total.get(loan.pk, Decimal('0.00')) + stuck_excess

        if not flags:
            self.stdout.write(self.style.SUCCESS('Nothing to correct.'))
            return

        grand_total = Decimal('0.00')
        for sched, days_late, corrected, stuck_excess in flags:
            loan = sched.loan
            self.stdout.write(
                f"  {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                f"days_late={days_late:<4d} penalty_due {sched.penalty_due:>12,.2f} -> {corrected:>12,.2f}  "
                f"(-{stuck_excess:,.2f})"
            )
            grand_total += stuck_excess

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            f'{len(flags)} row(s) across {len(per_loan_total)} loan(s), grand total to correct: {grand_total:,.2f}'
        ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to correct all rows shown above '
                'in one batch.'
            ))
            return

        corrected_count = 0
        with db_transaction.atomic():
            loans_touched = {}
            for sched, days_late, corrected, stuck_excess in flags:
                loan = sched.loan
                penalty_due_before = sched.penalty_due

                sched.penalty_due = corrected
                sched.save(update_fields=['penalty_due', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanRepaymentSchedule',
                    record_id=str(sched.pk),
                    amount=stuck_excess,
                    description=(
                        f'Penalty due ratchet correction — {loan.loan_number} installment '
                        f'#{sched.installment_number} (stuck above corrected periods-late formula)'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'installment_number': sched.installment_number,
                        'days_late_at_correction': days_late,
                        'corrected_penalty_due': str(corrected),
                        'schedule_penalty_due_before': str(penalty_due_before),
                        'schedule_penalty_due_after': str(corrected),
                        'source_command': 'apply_penalty_due_correction',
                    },
                )
                loans_touched[loan.pk] = loan
                corrected_count += 1

            for loan_pk, loan_total in per_loan_total.items():
                loan = loans_touched[loan_pk]
                outstanding_before = loan.outstanding_penalties
                loan.outstanding_penalties = max(Decimal('0.00'), loan.outstanding_penalties - loan_total)
                loan.save(update_fields=['outstanding_penalties', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanAccount',
                    record_id=str(loan.pk),
                    amount=loan_total,
                    description=(
                        f'Penalty due ratchet correction — {loan.loan_number}: reduced '
                        f'outstanding_penalties by {loan_total:,.2f}'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'outstanding_penalties_before': str(outstanding_before),
                        'outstanding_penalties_after': str(loan.outstanding_penalties),
                        'source_command': 'apply_penalty_due_correction',
                    },
                )

        self.stdout.write(self.style.SUCCESS(
            f'\nApplied. Corrected {corrected_count} row(s) across {len(per_loan_total)} loan(s), '
            f'total {grand_total:,.2f}.'
        ))
