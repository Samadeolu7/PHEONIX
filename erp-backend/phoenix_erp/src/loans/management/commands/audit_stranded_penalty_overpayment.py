"""
Management command: audit_stranded_penalty_overpayment

Read-only. Found on LN-722, blocking retire_stale_legacy_schedule_rows: row
#2 (due 10 Feb 2026) has penalty_paid=2,086.67 but penalty_due=141.00 — a
real LoanRepaymentAllocation record confirms the 13 Aug payment genuinely
applied that amount, correctly, against whatever penalty_due WAS at that
moment. Since then, correct_penalty_not_capped_at_payoff (or the daily
cron's self-correction) recomputed penalty_due down to the true cutover-
aware figure — leaving real, already-collected money (1,945.67) stranded
above the now-lower obligation. Different loans could show the identical
symptom (penalty_paid > penalty_due on a row) for a DIFFERENT, older reason:
the pre-2026-08-05 "broken proportional split" bug (see reverse_penalty_
income_reclass_batch.py's docstring) wrote garbage penalty_paid values with
no real payment behind them at all (e.g. LN-571's row #9: penalty_paid=
90,283.10 against penalty_due=0, never reversed by any of today's fixes
since correct_principal_penalty_misallocation only touches loan-aggregate
fields, never schedule-level penalty_paid).

This command finds every non-restructured schedule row where penalty_paid
exceeds penalty_due (beyond tolerance) on a legacy_import loan, and splits
the findings into two buckets using LoanRepaymentAllocation as the
discriminator:
  - REAL (has a LoanRepaymentAllocation row with penalty_applied > 0 tied to
    this schedule row): genuine, already-collected money sitting in the
    wrong bucket — needs reallocating to principal, same fix shape as
    correct_principal_penalty_misallocation.
  - STALE (no such allocation record): the older corruption — the stored
    penalty_paid figure itself has no real payment behind it and is likely
    just wrong data, not money to move anywhere.

Makes no changes — report only. Correction mechanism for each bucket is a
separate decision once the scope is known.

Usage:
    python manage.py audit_stranded_penalty_overpayment
    python manage.py audit_stranded_penalty_overpayment --loan LN-722
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only: finds schedule rows where penalty_paid exceeds penalty_due, split into '
        'REAL (backed by a LoanRepaymentAllocation record — genuine stranded money) vs STALE '
        '(no such record — the older broken-proportional-split corruption).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentAllocation

        loan_number = options['loan_number']
        tolerance = Decimal('0.01')

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        real_findings = []   # (loan, sched, overpaid, allocation_total)
        stale_findings = []  # (loan, sched, overpaid)

        for loan in loans.iterator():
            for sched in loan.repayment_schedule.exclude(status='restructured'):
                overpaid = sched.penalty_paid - sched.penalty_due
                if overpaid <= tolerance:
                    continue

                real_alloc_total = LoanRepaymentAllocation.objects.filter(
                    schedule=sched, penalty_applied__gt=0,
                ).aggregate(total=Sum('penalty_applied'))['total'] or Decimal('0.00')

                if real_alloc_total > 0:
                    real_findings.append((loan, sched, overpaid, real_alloc_total))
                else:
                    stale_findings.append((loan, sched, overpaid))

        total_real = sum(f[2] for f in real_findings)
        total_stale = sum(f[2] for f in stale_findings)

        if not real_findings and not stale_findings:
            self.stdout.write(self.style.SUCCESS('No rows found where penalty_paid exceeds penalty_due.'))
            return

        self.stdout.write(self.style.ERROR(
            f'REAL — {len(real_findings)} row(s) across '
            f'{len({l.loan_number for l, *_ in real_findings})} loan(s), '
            f'total stranded {total_real:,.2f} (genuine payments, backed by LoanRepaymentAllocation):\n'
        ))
        for loan, sched, overpaid, alloc_total in real_findings:
            self.stdout.write(
                f'  [{loan.loan_number}] due={sched.due_date}  status={sched.status:10s}  '
                f'penalty_due={sched.penalty_due:>10,.2f}  penalty_paid={sched.penalty_paid:>10,.2f}  '
                f'overpaid={overpaid:>10,.2f}  (allocation confirms {alloc_total:,.2f} real penalty applied here)'
            )

        self.stdout.write(self.style.WARNING(
            f'\nSTALE — {len(stale_findings)} row(s) across '
            f'{len({l.loan_number for l, *_ in stale_findings})} loan(s), '
            f'total {total_stale:,.2f} (no real payment record — likely the older broken-'
            f'proportional-split corruption, not real money):\n'
        ))
        for loan, sched, overpaid in stale_findings:
            self.stdout.write(
                f'  [{loan.loan_number}] due={sched.due_date}  status={sched.status:10s}  '
                f'penalty_due={sched.penalty_due:>10,.2f}  penalty_paid={sched.penalty_paid:>10,.2f}  '
                f'overpaid={overpaid:>10,.2f}'
            )

        self.stdout.write(self.style.WARNING(
            '\nNo changes made. REAL rows need reallocation to principal (same shape as '
            'correct_principal_penalty_misallocation). STALE rows likely just need penalty_paid '
            'capped down to penalty_due — no money to move, the figure itself is wrong.'
        ))
