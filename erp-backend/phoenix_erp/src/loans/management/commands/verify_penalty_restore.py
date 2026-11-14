"""
Read-only, independent cross-check of restore_penalty_reduced_by_repayment.

The audit/restore decide which reductions to undo by looking at the
reductions themselves. This command ignores the penalty ledger entirely and
instead recomputes, from scratch, what each affected installment's penalty
SHOULD be under the rule the daily job follows since 2026-11-13:

    every time a new repayment period of lateness begins (lateness only
    counted from PENALTY_CUTOVER_DATE, after the grace period), charge
    rate% x the installment's principal + interest + fees still unpaid at
    that moment; never reduce a charge afterwards.

"Unpaid at that moment" comes from the repayment records
(LoanRepaymentAllocation: what each repayment paid on each installment and
when), not from the penalty entries. It is then compared with what the
installment would hold AFTER the restore (penalty_due now + the amount the
restore would add back):

  MATCH        within ₦1 (or 1%): the restore lands on the correct figure.
  OVERCHARGE   the restore would leave MORE than the correct figure.
  UNDERCHARGE  still less than the correct figure after the restore.

Installments whose loan received repayments before per-installment
repayment records existed (before 2026-08-06) are flagged INCOMPLETE
HISTORY: payments in that window are invisible here, so the recomputed
figure may be too high for those.

By default checks only the installments the restore would touch (confirmed
reductions on open loans). --all checks every overdue installment on open
loans.

Usage:
    python manage.py verify_penalty_restore
    python manage.py verify_penalty_restore --loan LN-659
    python manage.py verify_penalty_restore --all
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

ALLOCATIONS_START = date(2026, 8, 6)
_CENT = Decimal('0.01')


def _q(value):
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def correct_penalty(loan, sched, today):
    """Penalty `sched` should carry as of `today` (see module docstring)."""
    from loans.models import LoanRepaymentAllocation

    product = loan.product
    if product.late_payment_penalty_type == 'fixed':
        days_late = product.effective_days_late(sched.due_date, today)
        return product.late_payment_penalty if days_late > product.grace_period_days else Decimal('0.00')

    remaining_now = max(Decimal('0.00'), (
        (sched.principal_due + sched.interest_due + sched.fees_due)
        - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
    ))
    allocs = [
        (a.created_at, a.principal_applied + a.interest_applied + a.fees_applied)
        for a in LoanRepaymentAllocation.objects.filter(schedule=sched)
        .select_related('journal_entry')
        if not a.journal_entry.is_reversed
    ]

    def unpaid_at(moment):
        return remaining_now + sum((amt for at, amt in allocs if at >= moment), Decimal('0.00'))

    rate = product.late_payment_penalty
    start = max(sched.due_date, product.PENALTY_CUTOVER_DATE) + timedelta(days=1)
    charged_periods = 0
    total = Decimal('0.00')
    d = start
    while d <= today:
        if product.effective_days_late(sched.due_date, d) > product.grace_period_days:
            periods = loan.periods_late_for_installment(sched, d)
            if periods > charged_periods:
                # The daily job runs at 01:00; payments recorded after that
                # count from the next day's run.
                run_at = timezone.make_aware(datetime.combine(d, time(1, 0)))
                total += _q(rate * unpaid_at(run_at) * (periods - charged_periods) / 100)
                charged_periods = periods
        d += timedelta(days=1)
    return total


class Command(BaseCommand):
    help = (
        'Read-only: independently recompute the correct penalty for each '
        'installment the restore would touch, and compare.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None)
        parser.add_argument('--all', action='store_true',
                            help='Check every overdue installment on open loans, not only '
                                 'the ones the restore would touch.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanProduct, LoanRepaymentSchedule
        from loans.penalty_reductions import OPEN_STATUSES, find_penalty_reductions
        from transactions.models import TransactionEntry

        today = timezone.localdate()

        restore_by_sched = defaultdict(lambda: Decimal('0.00'))
        for r in find_penalty_reductions(loan_number=options['loan_number']):
            if (r.repayment_driven and r.loan.status in OPEN_STATUSES
                    and r.sched is not None and r.sched.status != 'restructured'):
                restore_by_sched[r.sched.pk] += r.amount

        if options['all']:
            loans = LoanAccount.all_objects.filter(status__in=OPEN_STATUSES, is_deleted=False)
            if options['loan_number']:
                loans = loans.filter(loan_number=options['loan_number'])
            scheds = LoanRepaymentSchedule.objects.filter(
                loan__in=loans, is_deleted=False,
            ).filter(status='overdue') | LoanRepaymentSchedule.objects.filter(
                pk__in=list(restore_by_sched),
            )
        else:
            scheds = LoanRepaymentSchedule.objects.filter(pk__in=list(restore_by_sched))
        scheds = scheds.select_related('loan', 'loan__product').order_by(
            'loan__loan_number', 'due_date',
        ).distinct()

        incomplete_loans = set(
            TransactionEntry.objects.filter(
                transaction__series__code='LNPMT',
                transaction__approved=True,
                transaction__is_reversed=False,
                transaction__is_reversal=False,
                side=TransactionEntry.CREDIT,
                transaction__date__gte=LoanProduct.PENALTY_CUTOVER_DATE,
                transaction__date__lt=ALLOCATIONS_START,
            ).values_list('account_id', flat=True)
        )

        counts = defaultdict(int)
        totals = defaultdict(lambda: Decimal('0.00'))
        rows = []
        for sched in scheds:
            loan = sched.loan
            correct = correct_penalty(loan, sched, today)
            restore = restore_by_sched.get(sched.pk, Decimal('0.00'))
            after = sched.penalty_due + restore
            diff = after - correct
            tolerance = max(Decimal('1.00'), correct * Decimal('0.01'))
            if abs(diff) <= tolerance:
                verdict = 'MATCH'
            elif diff > 0:
                verdict = 'OVERCHARGE'
            else:
                verdict = 'UNDERCHARGE'
            incomplete = loan.account_id in incomplete_loans
            if incomplete:
                verdict += ' (INCOMPLETE HISTORY)'
            counts[verdict] += 1
            totals[verdict] += diff
            rows.append((loan.loan_number, sched.due_date, sched.penalty_due, restore,
                         after, correct, diff, verdict))

        self.stdout.write(
            f"\n  {'loan':18s} {'installment':11s} {'penalty now':>12s} {'+ restore':>11s} "
            f"{'= after':>12s} {'correct':>12s} {'difference':>11s}  verdict"
        )
        for loan_number, due, now, restore, after, correct, diff, verdict in rows:
            self.stdout.write(
                f'  {loan_number:18s} {due!s:11s} {now:>12,.2f} {restore:>11,.2f} '
                f'{after:>12,.2f} {correct:>12,.2f} {diff:>+11,.2f}  {verdict}'
            )

        self.stdout.write('\n--- Summary ---')
        for verdict in sorted(counts):
            self.stdout.write(
                f'  {verdict:32s} {counts[verdict]:>4d} installment(s)   '
                f'total difference ₦{totals[verdict]:+,.2f}'
            )
        self.stdout.write(
            '\nMATCH: the restore lands on the correct penalty. '
            'OVERCHARGE: the restore would leave the client owing more than the correct penalty. '
            'UNDERCHARGE: still owing less than the correct penalty after the restore. '
            'INCOMPLETE HISTORY: repayments before 2026-08-06 are not visible here, '
            'so "correct" may be too high.'
        )
        self.stdout.write(self.style.WARNING('\nRead-only — no changes made.'))
