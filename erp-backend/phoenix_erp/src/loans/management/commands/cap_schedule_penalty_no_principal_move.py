"""
Management command: cap_schedule_penalty_no_principal_move

One-off follow-up to sync_outstanding_to_gl. That tool made outstanding_
principal GL-verified-correct for LN-800/LN-907/LN-526/LN-659 — but
retire_stale_legacy_schedule_rows still fails on LN-800 because schedule
row (due=2026-05-16) has penalty_paid=973.33 against penalty_due=47.00,
driving the retire tool's penalty pool to -926.33.

Normally correct_stranded_penalty_overpayment would fix this by moving the
926.33 excess to principal_paid/outstanding_principal — but that would
double-count against the GL-anchor fix already applied (the exact mistake
caught and reverted on LN-1030/LN-526/LN-553/LN-855 earlier today): GL
already reflects the correct total, so reducing outstanding_principal
again for the same money would understate it a second time.

Instead: cap the schedule row's penalty_paid down to penalty_due (same as
every other correction today), and reduce loan.penalties_paid by the same
amount so the loan-level cumulative-paid aggregate doesn't drift from the
schedule — but do NOT touch principal_paid or outstanding_principal at
all. GL and outstanding_principal are left exactly as sync_outstanding_to_
gl set them.

No GL entry. Business-field-only, same as every correction today.

Usage:
    python manage.py cap_schedule_penalty_no_principal_move --loan LN-800            # dry-run
    python manage.py cap_schedule_penalty_no_principal_move --loan LN-800 --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'One-off: caps schedule row penalty_paid down to penalty_due and reduces loan.penalties_paid '
        'by the same amount — WITHOUT moving anything to principal_paid/outstanding_principal, for '
        'loans where outstanding_principal is already GL-verified correct (sync_outstanding_to_gl).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', required=True,
                             help='Loan to correct.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        apply_changes = options['apply']

        try:
            loan = LoanAccount.all_objects.get(loan_number=loan_number, is_deleted=False)
        except LoanAccount.DoesNotExist:
            raise CommandError(f'Loan {loan_number} not found.')

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)

            rows = list(
                loan.repayment_schedule.select_for_update().exclude(status='restructured')
            )
            row_updates = []
            total_overpaid = Decimal('0.00')
            for sched in rows:
                overpaid = sched.penalty_paid - sched.penalty_due
                if overpaid <= TOLERANCE:
                    continue
                row_updates.append((sched, sched.penalty_due, overpaid))
                total_overpaid += overpaid

            if not row_updates:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.SUCCESS(f'[{loan_number}] No overpaid penalty rows found.'))
                return

            new_penalties_paid = loan.penalties_paid - total_overpaid
            if new_penalties_paid < -TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'[{loan_number}] would push penalties_paid negative '
                    f'({loan.penalties_paid:,.2f} -> {new_penalties_paid:,.2f}). Refusing — needs review.'
                ))
                return

            self.stdout.write(f'[{loan_number}] pk={loan.pk}')
            for sched, new_penalty_paid, overpaid in row_updates:
                self.stdout.write(
                    f'    row due={sched.due_date}  penalty_paid {sched.penalty_paid:,.2f} -> '
                    f'{new_penalty_paid:,.2f}'
                )
            self.stdout.write(
                f'    penalties_paid {loan.penalties_paid:,.2f} -> {new_penalties_paid:,.2f}  '
                f'(outstanding_principal UNCHANGED — already GL-verified)'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('DRY-RUN — nothing written. Re-run with --apply.'))
                return

            for sched, new_penalty_paid, overpaid in row_updates:
                sched.penalty_paid = new_penalty_paid
                sched.save(update_fields=['penalty_paid', 'updated_at'])

            loan.penalties_paid = new_penalties_paid
            loan.save(update_fields=['penalties_paid', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=total_overpaid,
                description=(
                    f'Capped schedule penalty_paid to penalty_due, no principal move — {loan_number}: '
                    f'{len(row_updates)} row(s) capped, {total_overpaid:,.2f} removed from penalties_paid. '
                    f'outstanding_principal left untouched — already GL-verified correct via '
                    f'sync_outstanding_to_gl, so moving this excess to principal would have double-counted.'
                ),
                extra={
                    'loan_number': loan_number,
                    'total_overpaid_capped': str(total_overpaid),
                    'source_command': 'cap_schedule_penalty_no_principal_move',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
