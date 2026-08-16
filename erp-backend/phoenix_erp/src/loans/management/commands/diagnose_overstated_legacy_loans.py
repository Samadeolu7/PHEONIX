"""
Management command: diagnose_overstated_legacy_loans

Read-only. Follow-up to audit_outstanding_principal_vs_schedule's OVERSTATED
cohort (total_outstanding > full schedule remaining) — that command already
established these are legacy_import loans with schedule_matches_terms=True
(schedule structurally intact), but "OVERSTATED" is not one cause. Manually
reading the per-component breakdown for LN-342 turned out to be a real,
already-corrected penalty accrual the old principal-only audit couldn't see;
extrapolating that same read to the other 19 by eye risks misreading real
client balances, so this buckets them programmatically instead of by hand.

Buckets, checked in this order per loan:

  1. SCHEDULE_SHOWS_PAID_OFF — the schedule's principal component alone is
     ~0 remaining (all schedule rows paid down) while the loan's own
     outstanding_principal is still meaningfully positive. Because arrears/
     defaulter logic (LoanAccount._calculate_arrears(), the defaulters
     report) is driven entirely by the schedule, a loan in this bucket is
     invisible to collections regardless of how much it truly owes — this is
     the highest-priority bucket regardless of drift size. Flagged URGENT
     when days_in_arrears is also 0 (nothing about this loan looks abnormal
     anywhere in the system).

  2. PENALTY_ONLY_GAP — principal and interest reconcile (within tolerance)
     between the loan and schedule; the drift is concentrated in the penalty
     component alone. This is the LN-342 shape: a real penalty accrual
     posted at the loan/GL level (see reverse_legacy_loan_penalty_accruals)
     that never made it back into the schedule rows' penalty_due. Direction
     (loan penalty > schedule penalty, or the reverse) is reported so it's
     clear which side needs to move.

  3. PRINCIPAL_MISMATCH — the loan's principal doesn't reconcile with the
     schedule's principal even after allowing for the "principal bundles
     interest" migration convention seen on some loans (outstanding_interest
     always 0, but the schedule has real interest_due — some legacy loans'
     opening `balance` folds interest into what Phoenix calls principal).
     These need individual review; no assumed cause.

Nothing is written. Reports only.

Usage:
    python manage.py diagnose_overstated_legacy_loans
    python manage.py diagnose_overstated_legacy_loans --tolerance 100
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

SCHEDULE_PAID_OFF_THRESHOLD = Decimal('50.00')


class Command(BaseCommand):
    help = (
        'Read-only: buckets the OVERSTATED legacy-import cohort '
        '(from audit_outstanding_principal_vs_schedule) by likely cause.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tolerance', type=str, default='100.00',
                             help='Naira tolerance for "reconciles" comparisons (default 100.00).')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        tolerance = Decimal(options['tolerance'])

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).exclude(
            status__in=['written_off', 'paid_off', 'closed'],
        ).select_related('client').order_by('loan_number')

        buckets = {'SCHEDULE_SHOWS_PAID_OFF': [], 'PENALTY_ONLY_GAP': [], 'PRINCIPAL_MISMATCH': []}

        for loan in loans.iterator():
            agg = loan.repayment_schedule.exclude(status='restructured').aggregate(
                principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
                interest_due=Sum('interest_due'), interest_paid=Sum('interest_paid'),
                fees_due=Sum('fees_due'), fees_paid=Sum('fees_paid'),
                penalty_due=Sum('penalty_due'), penalty_paid=Sum('penalty_paid'),
            )
            sched_principal = (agg['principal_due'] or Decimal('0.00')) - (agg['principal_paid'] or Decimal('0.00'))
            sched_interest = (agg['interest_due'] or Decimal('0.00')) - (agg['interest_paid'] or Decimal('0.00'))
            sched_fees = (agg['fees_due'] or Decimal('0.00')) - (agg['fees_paid'] or Decimal('0.00'))
            sched_penalty = (agg['penalty_due'] or Decimal('0.00')) - (agg['penalty_paid'] or Decimal('0.00'))
            schedule_owed = sched_principal + sched_interest + sched_fees + sched_penalty

            loan_owed = loan.total_outstanding
            drift = loan_owed - schedule_owed
            if drift <= tolerance:
                continue  # not OVERSTATED (or immaterial) — out of scope here

            if sched_principal <= SCHEDULE_PAID_OFF_THRESHOLD and loan.outstanding_principal > tolerance:
                buckets['SCHEDULE_SHOWS_PAID_OFF'].append((loan, sched_principal, sched_interest, sched_penalty, drift))
                continue

            # Allow for the "principal bundles interest" convention: some legacy
            # loans' outstanding_principal = true principal + true interest, with
            # outstanding_interest always 0 even though the schedule breaks interest
            # out separately.
            principal_side_loan = loan.outstanding_principal + loan.outstanding_interest
            principal_side_schedule = sched_principal + sched_interest
            principal_reconciles = abs(principal_side_loan - principal_side_schedule) <= tolerance

            if principal_reconciles:
                buckets['PENALTY_ONLY_GAP'].append((loan, sched_penalty, drift))
            else:
                buckets['PRINCIPAL_MISMATCH'].append((loan, principal_side_loan, principal_side_schedule, drift))

        total = sum(len(v) for v in buckets.values())
        if not total:
            self.stdout.write(self.style.SUCCESS('No OVERSTATED legacy loans found.'))
            return

        self.stdout.write(self.style.ERROR(f'{total} OVERSTATED legacy loan(s), bucketed:\n'))

        urgent = [
            (loan, sp, si, spen, d) for loan, sp, si, spen, d in buckets['SCHEDULE_SHOWS_PAID_OFF']
            if loan.days_in_arrears == 0
        ]
        if buckets['SCHEDULE_SHOWS_PAID_OFF']:
            self.stdout.write(self.style.ERROR(
                f"SCHEDULE_SHOWS_PAID_OFF ({len(buckets['SCHEDULE_SHOWS_PAID_OFF'])}, "
                f'{len(urgent)} URGENT — days_in_arrears=0, invisible to collections):'
            ))
            for loan, sp, si, spen, drift in buckets['SCHEDULE_SHOWS_PAID_OFF']:
                flag = ' [URGENT]' if loan.days_in_arrears == 0 else ''
                self.stdout.write(
                    f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                    f'days_in_arrears={loan.days_in_arrears}{flag}\n'
                    f'      outstanding_principal={loan.outstanding_principal:>12,.2f}  '
                    f'outstanding_penalties={loan.outstanding_penalties:>12,.2f}  '
                    f'total_outstanding={loan.total_outstanding:>12,.2f}\n'
                    f'      schedule remaining: principal={sp:>12,.2f}  interest={si:>12,.2f}  '
                    f'penalty={spen:>12,.2f}  drift={drift:>12,.2f}'
                )
            self.stdout.write('')

        if buckets['PENALTY_ONLY_GAP']:
            self.stdout.write(self.style.WARNING(
                f"PENALTY_ONLY_GAP ({len(buckets['PENALTY_ONLY_GAP'])} — principal/interest reconcile, "
                'penalty component is where the disagreement is, LN-342 shape):'
            ))
            for loan, sched_penalty, drift in buckets['PENALTY_ONLY_GAP']:
                direction = 'loan > schedule' if loan.outstanding_penalties > sched_penalty else 'schedule > loan'
                self.stdout.write(
                    f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                    f'days_in_arrears={loan.days_in_arrears}\n'
                    f'      outstanding_penalties={loan.outstanding_penalties:>12,.2f}  '
                    f'schedule penalty remaining={sched_penalty:>12,.2f}  ({direction})  drift={drift:>12,.2f}'
                )
            self.stdout.write('')

        if buckets['PRINCIPAL_MISMATCH']:
            self.stdout.write(self.style.WARNING(
                f"PRINCIPAL_MISMATCH ({len(buckets['PRINCIPAL_MISMATCH'])} — no assumed cause, "
                'needs individual review):'
            ))
            for loan, principal_side_loan, principal_side_schedule, drift in buckets['PRINCIPAL_MISMATCH']:
                self.stdout.write(
                    f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                    f'days_in_arrears={loan.days_in_arrears}\n'
                    f'      loan (principal+interest)={principal_side_loan:>12,.2f}  '
                    f'schedule (principal+interest)={principal_side_schedule:>12,.2f}  drift={drift:>12,.2f}'
                )
            self.stdout.write('')

        if urgent:
            self.stdout.write(self.style.ERROR(
                f'{len(urgent)} loan(s) are showing zero days_in_arrears while genuinely owing money — '
                'they will not appear on the defaulters report or PAR aging until this is fixed. '
                'Priority: SCHEDULE_SHOWS_PAID_OFF > PENALTY_ONLY_GAP > PRINCIPAL_MISMATCH.'
            ))
