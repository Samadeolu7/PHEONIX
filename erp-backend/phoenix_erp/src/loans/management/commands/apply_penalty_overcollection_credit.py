"""
Management command: apply_penalty_overcollection_credit

Applies the credit decided on for confirmed penalty overcollection (see
audit_penalty_overcollection): reduces what a client is still asked to pay
going forward by exactly the confirmed overcharged amount. It does NOT touch
any historical record — penalty_paid, principal_paid, interest_paid,
total_paid, GL journal entries, and FinancialAuditLog are all left exactly
as they are. Only two still-outstanding (not yet paid) figures move:

    LoanAccount.outstanding_penalties         -= credit
    LoanRepaymentSchedule.penalty_due (row)    -= credit
    LoanRepaymentSchedule.total_due (row)      -= credit  (floored at total_paid)

Both floored at zero so this can never push a balance negative.

Safety by construction:
  - Dry-run by default. Nothing is written unless --apply is passed.
  - --apply requires --loan <loan_number> — one loan at a time, deliberately,
    so this never bulk-applies to loans that haven't been individually
    reviewed and confirmed.
  - Uses the exact same detection/estimate logic as audit_penalty_overcollection,
    so what you see here is what that report already showed you.
  - Writes a FinancialAuditLog(LOAN_BALANCE_CORRECTION) entry recording the
    before/after figures and the acting user, for every row corrected.

Usage:
    python manage.py apply_penalty_overcollection_credit --loan LN-770          # preview only
    python manage.py apply_penalty_overcollection_credit --loan LN-770 --apply  # applies it
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Apply the credit for confirmed penalty overcollection to a single loan's "
        "still-outstanding balance. Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan',
            dest='loan_number',
            required=True,
            help='Loan to correct (required — always scoped to one loan at a time).',
        )
        parser.add_argument(
            '--min-overcollected',
            dest='min_overcollected',
            type=str,
            default='0.01',
            help='Only correct rows where the estimated overcollection exceeds this amount (default: 0.01).',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually write the correction. Without this, only previews what would happen.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentSchedule
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        min_overcollected = Decimal(options['min_overcollected'])
        apply_changes = options['apply']
        today = timezone.localdate()

        try:
            loan = LoanAccount.all_objects.select_related('product').get(loan_number=loan_number)
        except LoanAccount.DoesNotExist:
            raise CommandError(f"No loan found with loan_number='{loan_number}'.")

        schedules = LoanRepaymentSchedule.all_objects.filter(
            loan=loan, penalty_paid__gt=0,
        ).order_by('due_date')

        corrections = []
        for sched in schedules:
            base_amount = sched.principal_due + sched.interest_due + sched.fees_due

            if sched.status == 'paid':
                if not sched.days_late:
                    continue
                days_late = sched.days_late
            elif sched.status in ('partial', 'overdue'):
                days_late = (today - sched.due_date).days
                if days_late <= 0:
                    continue
            else:
                continue

            corrected_penalty = loan.product.calculate_late_penalty(
                base_amount, days_late, loan.repayment_frequency,
            )
            overcollected = (sched.penalty_paid - corrected_penalty).quantize(Decimal('0.01'))
            if overcollected > min_overcollected:
                corrections.append((sched, days_late, corrected_penalty, overcollected))

        if not corrections:
            self.stdout.write(self.style.SUCCESS(
                f"No confirmed overcollection found for {loan_number} — nothing to do."
            ))
            return

        total_credit = sum((c[3] for c in corrections), Decimal('0.00'))

        self.stdout.write(f"{loan_number} — outstanding_penalties before: {loan.outstanding_penalties:,.2f}")
        for sched, days_late, corrected_penalty, overcollected in corrections:
            self.stdout.write(
                f"  installment #{sched.installment_number} due={sched.due_date} days_late={days_late} "
                f"penalty_paid={sched.penalty_paid:,.2f} corrected_est={corrected_penalty:,.2f} "
                f"credit={overcollected:,.2f} "
                f"(row penalty_due {sched.penalty_due:,.2f} -> {max(Decimal('0.00'), sched.penalty_due - overcollected):,.2f})"
            )
        self.stdout.write(self.style.WARNING(f"Total credit: {total_credit:,.2f}"))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — nothing written. Re-run with --apply to write this correction."
            ))
            return

        with db_transaction.atomic():
            outstanding_penalties_before = loan.outstanding_penalties
            loan.outstanding_penalties = max(Decimal('0.00'), loan.outstanding_penalties - total_credit)
            loan.save(update_fields=['outstanding_penalties', 'updated_at'])

            for sched, days_late, corrected_penalty, overcollected in corrections:
                penalty_due_before = sched.penalty_due
                total_due_before = sched.total_due
                new_penalty_due = max(Decimal('0.00'), sched.penalty_due - overcollected)
                new_total_due = max(sched.total_paid, sched.total_due - overcollected)
                sched.penalty_due = new_penalty_due
                sched.total_due = new_total_due
                sched.save(update_fields=['penalty_due', 'total_due', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanRepaymentSchedule',
                    record_id=str(sched.pk),
                    amount=overcollected,
                    description=(
                        f'Penalty overcollection credit — {loan_number} installment '
                        f'#{sched.installment_number} (old per-day penalty formula)'
                    ),
                    extra={
                        'loan_number': loan_number,
                        'installment_number': sched.installment_number,
                        'days_late_at_correction': days_late,
                        'corrected_penalty_estimate': str(corrected_penalty),
                        'penalty_paid_unchanged': str(sched.penalty_paid),
                        'schedule_penalty_due_before': str(penalty_due_before),
                        'schedule_penalty_due_after': str(new_penalty_due),
                        'schedule_total_due_before': str(total_due_before),
                        'schedule_total_due_after': str(new_total_due),
                        'loan_outstanding_penalties_before': str(outstanding_penalties_before),
                        'loan_outstanding_penalties_after': str(loan.outstanding_penalties),
                        'source_command': 'apply_penalty_overcollection_credit',
                    },
                )

        self.stdout.write(self.style.SUCCESS(
            f"\nApplied. {loan_number} outstanding_penalties: "
            f"{outstanding_penalties_before:,.2f} -> {loan.outstanding_penalties:,.2f}"
        ))
