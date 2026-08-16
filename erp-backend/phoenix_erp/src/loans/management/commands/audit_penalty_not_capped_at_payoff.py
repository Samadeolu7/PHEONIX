"""
Management command: audit_penalty_not_capped_at_payoff

Read-only. Traces the bug confirmed on LN-571: opening balance 30,604.46,
paid off in full via a real repayment (LNPMT-20260716-1046) on 16 Jul 2026 —
then a "cutover-corrected" penalty accrual posted 69,416.43 more on top of an
already-closed debt (13 Aug 2026, via reverse_legacy_loan_penalty_accruals).

Root cause (two parts):

  1. import_legacy_data.py:_import_loans seeds LoanRepaymentSchedule.
     penalty_due UNCONDITIONALLY from the old system's own penalty_amount
     field for every imported row — including rows already marked paid at
     import. That value can reflect years of pre-cutover lateness computed
     by the old system's own (different, uncontrolled) formula.

  2. reverse_legacy_loan_penalty_accruals — built specifically to correct
     pre-cutover-tainted penalty_due — only recomputes rows currently
     status='overdue' (line ~129). For every other row (paid/pending/
     partial) it sums whatever penalty_due is already stored and trusts it
     as-is (line ~138-140). A row that gets paid off (principal+interest+
     fees settled — the only thing that flips a row to 'paid', per
     LoanAccount._update_schedule_with_payment, models.py ~1516; penalty is
     tracked completely separately) keeps carrying whatever penalty_due an
     earlier cron run assessed against it while it WAS overdue — pre-cutover
     -tainted or not — forever uncorrected. LoanProduct.effective_days_late()
     was designed to support exactly this ("pass a specific date (e.g.
     payment_date) to recompute what days_late should have been at some
     point in the past") but no caller in the codebase ever passes
     payment_date instead of today — every call site, including this one,
     uses `today` unconditionally, even for installments settled months ago.

This command recomputes, for every schedule row on a legacy_import loan
where penalty_due > 0, what it SHOULD be using the cutover-aware formula
capped at the row's real resolution date:
  - status='paid'  → as_of = payment_date (penalty should have stopped
    accruing once the client actually paid)
  - otherwise      → as_of = today (still open, same as the existing logic)
and flags every row where the stored penalty_due exceeds that — i.e. every
row silently carrying uncapped, unrecomputed penalty debt regardless of
whether the loan is still open, already closed by payment, or has zero
principal remaining.

Grouped per loan with a total overcharge, so the scope (how many loans, how
much) is visible before anything is corrected. Makes no changes.

Usage:
    python manage.py audit_penalty_not_capped_at_payoff
    python manage.py audit_penalty_not_capped_at_payoff --loan LN-571
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Read-only: finds legacy-import schedule rows whose penalty_due was never '
        'recomputed with the cutover-aware formula capped at the row\'s real payment_date '
        '(paid rows) or today (still-open rows) — the LN-571 "debt piled onto a closed loan" bug.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        today = timezone.localdate()

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).select_related('product').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        flagged_loans = []
        grand_total_overcharge = Decimal('0.00')

        for loan in loans.iterator():
            rows = loan.repayment_schedule.exclude(status='restructured').filter(
                penalty_due__gt=0,
            ).order_by('due_date')

            row_findings = []
            for sched in rows:
                as_of = sched.payment_date if sched.status == 'paid' and sched.payment_date else today
                days_late = loan.product.effective_days_late(sched.due_date, as_of)
                base_amount = sched.total_due - sched.total_paid
                correct_penalty = loan.product.calculate_late_penalty(
                    base_amount, days_late, loan.repayment_frequency,
                )
                overcharge = sched.penalty_due - correct_penalty
                if overcharge > Decimal('0.01'):
                    row_findings.append((sched, as_of, correct_penalty, overcharge))

            if row_findings:
                loan_total = sum(f[3] for f in row_findings)
                grand_total_overcharge += loan_total
                flagged_loans.append((loan, row_findings, loan_total))

        if not flagged_loans:
            self.stdout.write(self.style.SUCCESS('No uncapped penalty found on any legacy-import loan.'))
            return

        self.stdout.write(self.style.ERROR(
            f'{len(flagged_loans)} legacy-import loan(s) carrying uncapped/unrecomputed penalty_due, '
            f'total overcharge {grand_total_overcharge:,.2f}:\n'
        ))

        for loan, row_findings, loan_total in sorted(flagged_loans, key=lambda x: -x[2]):
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                f'outstanding_penalties={loan.outstanding_penalties:,.2f}  '
                f'total loan overcharge={loan_total:,.2f}'
            )
            for sched, as_of, correct_penalty, overcharge in row_findings:
                self.stdout.write(
                    f'      due={sched.due_date}  status={sched.status:8s}  as_of={as_of}  '
                    f'stored penalty_due={sched.penalty_due:>10,.2f}  '
                    f'correct={correct_penalty:>10,.2f}  overcharge={overcharge:>10,.2f}'
                )

        self.stdout.write(self.style.WARNING(
            f'\nGrand total overcharge across {len(flagged_loans)} loan(s): {grand_total_overcharge:,.2f}. '
            'No correction applied — this is a report only. A fix needs to touch both '
            'reverse_legacy_loan_penalty_accruals (recompute ALL rows with penalty_due, not just '
            'status=overdue ones, using each row\'s own resolution date) and, going forward, '
            'accrue_outstanding_penalty_backlog (currently posts whatever penalty_due is stored '
            'without recomputing it either).'
        ))
