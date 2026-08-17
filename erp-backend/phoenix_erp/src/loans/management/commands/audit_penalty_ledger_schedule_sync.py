"""
Management command: audit_penalty_ledger_schedule_sync

Read-only. Standing check requested after today's cleanup (see
[[project_legacy_penalty_not_capped]]): penalty income is recognized on
assessment now, not on payment (2026-08-12, see LoanAccount.record_payment()'s
docstring and update_loan_status.py) — the GL/loan-aggregate side
(outstanding_penalties) and the schedule side (penalty_due/penalty_paid per
row) are two independent fields that only stay in agreement because every
writer is expected to update both together. Today alone found four different
ways that expectation quietly broke: a penalty accrual script recomputing
only 'overdue' rows and blindly trusting stale penalty_due on 'paid' rows
(audit_penalty_not_capped_at_payoff), a reclass script trusting a corrupted
aggregate figure with no schedule cross-check (audit_penalty_income_reclass_
legitimacy), a pre-2026-08-05 payment-allocation bug that never touched the
schedule (correct_principal_penalty_misallocation), and a payment_date
placeholder that fooled a same-day fix. Nothing currently re-validates that
the two sides agree except by re-running one of today's one-off tools — this
is the ongoing version of that check, meant to be run periodically (or
whenever penalty-adjacent code changes) rather than as a one-time cleanup.

Ground truth comparison, for every active/disbursed/defaulted loan (not
scoped to legacy_import — this must hold for every loan going forward):
    loan.outstanding_penalties
        vs.
    sum(penalty_due - penalty_paid) across non-restructured schedule rows

Flags any loan where these disagree beyond tolerance, with direction
(ledger > schedule, or schedule > ledger) so it's immediately clear which
side needs investigating — same as every other audit built today.

written_off / paid_off / closed loans are excluded — those paths zero
outstanding_penalties without touching schedule row status, by design (see
audit_outstanding_principal_vs_schedule for the same exclusion rationale).

Makes no changes — report only.

Usage:
    python manage.py audit_penalty_ledger_schedule_sync
    python manage.py audit_penalty_ledger_schedule_sync --loan LN-571
    python manage.py audit_penalty_ledger_schedule_sync --tolerance 5.00
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only standing check: does loan.outstanding_penalties agree with the schedule\'s '
        'own penalty remaining (sum of penalty_due - penalty_paid)? Run periodically to catch '
        'the next thing that desyncs them, not just a one-time historical cleanup.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--tolerance', type=str, default='1.00',
                             help='Naira drift below which a loan is not flagged (default 1.00).')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        tolerance = Decimal(options['tolerance'])

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
            status__in=['active', 'disbursed', 'defaulted'],
        ).order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        flagged = []
        for loan in loans.iterator():
            sched = loan.repayment_schedule.exclude(status='restructured').aggregate(
                due=Sum('penalty_due'), paid=Sum('penalty_paid'),
            )
            sched_remaining = (sched['due'] or Decimal('0.00')) - (sched['paid'] or Decimal('0.00'))
            drift = loan.outstanding_penalties - sched_remaining

            if abs(drift) > tolerance:
                flagged.append((loan, sched_remaining, drift))

        if not flagged:
            self.stdout.write(self.style.SUCCESS(
                'In sync — every loan\'s outstanding_penalties matches its schedule\'s own '
                'penalty remaining.'
            ))
            return

        ledger_ahead = sum(1 for _, _, d in flagged if d > 0)
        schedule_ahead = len(flagged) - ledger_ahead

        self.stdout.write(self.style.ERROR(
            f'{len(flagged)} loan(s) out of sync ({ledger_ahead} ledger > schedule, '
            f'{schedule_ahead} schedule > ledger):\n'
        ))
        for loan, sched_remaining, drift in flagged:
            direction = 'LEDGER > SCHEDULE' if drift > 0 else 'SCHEDULE > LEDGER'
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                f'origin={loan.origin}  days_in_arrears={loan.days_in_arrears}\n'
                f'      outstanding_penalties (loan) = {loan.outstanding_penalties:>12,.2f}  '
                f'schedule remaining = {sched_remaining:>12,.2f}  '
                f'drift = {drift:>12,.2f}  ({direction})'
            )

        self.stdout.write(self.style.WARNING(
            '\nNo changes made. LEDGER > SCHEDULE means the loan aggregate claims more penalty '
            'than the schedule rows show — check for a script that touched outstanding_penalties '
            'without updating the corresponding schedule row(s) (or vice versa for SCHEDULE > '
            'LEDGER). Re-run this after any change to penalty-adjacent code as a regression check.'
        ))
