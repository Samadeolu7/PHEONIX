"""
Management command: report_penalty_paid_per_payment

REPORT-ONLY — no calculation, no correction, just extraction of the real
figures already recorded at the moment each payment happened.

Context: LoanRepaymentSchedule.penalty_paid (and principal_paid/interest_paid/
fees_paid) is unreliable — populated by a broken proportional allocation in
_update_schedule_with_payment() that ignores the actual computed split (see
reverse_penalty_income_reclass_batch.py for how that was discovered). But the
TRUE per-payment split was never lost: LoanAccount.record_payment() logs a
FinancialAuditLog(event_type=LOAN_REPAY) entry for every single repayment,
with the exact principal/interest/fees/penalty amounts computed that moment
(loans/models.py ~line 1294-1312) — untouched by the schedule bug, because
it's built directly from the same in-memory variables actually applied to
outstanding_penalties/penalties_paid.

This command just reads that log back out — per payment and summed per loan
— so "what was actually paid as penalty" can be established from ground
truth instead of the broken schedule field. Makes no changes.

Usage:
    python manage.py report_penalty_paid_per_payment                  # every loan
    python manage.py report_penalty_paid_per_payment --loan LN-659    # one loan
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Report-only: the real per-payment principal/interest/fees/penalty split, '
        'read from FinancialAuditLog(LOAN_REPAY) — not the unreliable schedule field.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only show payments for this loan.')

    def handle(self, *args, **options):
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']

        logs = FinancialAuditLog.objects.filter(
            event_type=FinancialAuditLog.LOAN_REPAY,
        ).order_by('extra__loan_number', 'timestamp')

        if loan_number:
            logs = logs.filter(extra__loan_number=loan_number)

        grand_penalty = Decimal('0.00')
        grand_amount = Decimal('0.00')
        per_loan_penalty = {}
        current_loan = None
        payment_count = 0

        for log in logs.iterator():
            extra = log.extra or {}
            ln = extra.get('loan_number', '?')
            penalty = Decimal(extra.get('penalty', '0') or '0')
            principal = Decimal(extra.get('principal', '0') or '0')
            interest = Decimal(extra.get('interest', '0') or '0')
            fees = Decimal(extra.get('fees', '0') or '0')

            if ln != current_loan:
                if current_loan is not None:
                    self.stdout.write('')
                self.stdout.write(self.style.MIGRATE_HEADING(f'{ln}'))
                current_loan = ln

            self.stdout.write(
                f"  {log.timestamp.date()}  amount={log.amount:>12,.2f}  "
                f"principal={principal:>10,.2f}  interest={interest:>10,.2f}  "
                f"fees={fees:>8,.2f}  penalty={penalty:>12,.2f}  "
                f"(journal_entry_id={extra.get('journal_entry_id', '?')})"
            )

            grand_penalty += penalty
            grand_amount += log.amount or Decimal('0.00')
            per_loan_penalty[ln] = per_loan_penalty.get(ln, Decimal('0.00')) + penalty
            payment_count += 1

        self.stdout.write('')
        if not per_loan_penalty:
            self.stdout.write(self.style.WARNING('No LOAN_REPAY audit log entries found.'))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('--- Per-loan penalty actually paid ---'))
        for ln, total in sorted(per_loan_penalty.items(), key=lambda x: -x[1]):
            self.stdout.write(f"  {ln:24s} {total:>14,.2f}")

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'{payment_count} payment(s) across {len(per_loan_penalty)} loan(s). '
            f'Total amount received: {grand_amount:,.2f}. Total actually applied to penalty: {grand_penalty:,.2f}.'
        ))
