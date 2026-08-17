"""
Management command: audit_penalty_on_non_monthly_loans

Read-only. Business rule (confirmed by ops 2026-08-17): only monthly-
repayment loans are meant to carry late-payment penalty. Nothing in the code
currently enforces this — LoanProduct.calculate_late_penalty() computes a
penalty for ANY repayment_frequency (daily/weekly/biweekly/monthly/quarterly,
via the _PERIOD_DAYS lookup, models.py ~323), and update_loan_status.py's
daily cron never checks repayment_frequency before assessing one. So any
loan on a non-monthly product with a nonzero late_payment_penalty configured
could have accrued real, currently-standing (but per this rule, illegitimate)
penalty — independent of, and in addition to, every legacy-import-specific
penalty bug already fixed today (see [[project_legacy_penalty_not_capped]]).

Checks EVERY active/disbursed/defaulted loan (not scoped to legacy_import —
this rule applies system-wide), across two sources:
  - loan.outstanding_penalties  (the aggregate, currently-owed figure)
  - sum of schedule.penalty_due - schedule.penalty_paid across non-
    restructured rows (what the schedule itself is currently carrying)
flagging any loan with repayment_frequency != 'monthly' where either is
nonzero.

Makes no changes — report only. Correction (should this confirm real,
material amounts) needs a decision on mechanism before writing anything:
whether to zero these out via a clean reversal (mirroring
correct_penalty_not_capped_at_payoff's approach) is a separate step.

Usage:
    python manage.py audit_penalty_on_non_monthly_loans
    python manage.py audit_penalty_on_non_monthly_loans --loan LN-858
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only: finds non-monthly loans currently carrying nonzero penalty '
        '(outstanding_penalties and/or schedule penalty_due) — only monthly loans should.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
            status__in=['active', 'disbursed', 'defaulted'],
        ).exclude(repayment_frequency='monthly').select_related('product').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        flagged = []
        for loan in loans.iterator():
            sched_penalty = loan.repayment_schedule.exclude(status='restructured').aggregate(
                due=Sum('penalty_due'), paid=Sum('penalty_paid'),
            )
            sched_remaining = (sched_penalty['due'] or Decimal('0.00')) - (sched_penalty['paid'] or Decimal('0.00'))

            if loan.outstanding_penalties > Decimal('0.01') or abs(sched_remaining) > Decimal('0.01'):
                flagged.append((loan, sched_remaining))

        if not flagged:
            self.stdout.write(self.style.SUCCESS(
                'No non-monthly loans found carrying nonzero penalty. Rule already holds.'
            ))
            return

        total_outstanding_penalties = sum(l.outstanding_penalties for l, _ in flagged)
        total_sched_remaining = sum(s for _, s in flagged)

        self.stdout.write(self.style.ERROR(
            f'{len(flagged)} non-monthly loan(s) carrying nonzero penalty '
            f'(outstanding_penalties total={total_outstanding_penalties:,.2f}, '
            f'schedule remaining total={total_sched_remaining:,.2f}):\n'
        ))
        for loan, sched_remaining in flagged:
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                f'repayment_frequency={loan.repayment_frequency}  origin={loan.origin}\n'
                f'      outstanding_penalties={loan.outstanding_penalties:>12,.2f}  '
                f'schedule penalty remaining={sched_remaining:>12,.2f}  '
                f'product_penalty_config={loan.product.late_payment_penalty_type}/'
                f'{loan.product.late_payment_penalty}  '
                f'penalty_income_account={"set" if loan.product.penalty_income_account_id else "NULL"}'
            )

        self.stdout.write(self.style.WARNING(
            '\nNo changes made. If this business rule is confirmed correct, these loans need '
            'their penalty zeroed (mechanism TBD) and, separately, update_loan_status.py needs '
            'a repayment_frequency==\'monthly\' guard so this cannot recur.'
        ))
