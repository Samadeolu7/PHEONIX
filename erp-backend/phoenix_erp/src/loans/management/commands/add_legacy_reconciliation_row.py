"""
Management command: add_legacy_reconciliation_row

A legacy loan's GL-verified outstanding_principal exceeds
what the schedule's own rows (principal_due minus principal_paid, summed
across every non-restructured row regardless of status) show remaining,
with no LoanRepaymentAllocation evidence to say which historical row is
fictional — confirmed on LN-629 by hand-tracing its GL ledger against its
real payment history.

Rather than bumping the due amount on existing open rows (which distorts
what those specific, real, dated installments contractually represent —
someone looking at "Feb installment: ₦75,420" would reasonably ask why a
₦58,400 obligation grew), this adds a single NEW schedule row holding
exactly the shortfall, dated the day after the loan's last existing row.
Every real row — paid or still open — is left completely untouched. The
new row is unambiguously a reconciliation entry (installment_number one
past the real schedule, principal_due = the shortfall, everything else
zero), and the FinancialAuditLog entry records exactly why it exists.

No GL entry — this is a schedule-field-only correction, like everything
else in this line of work. loan.outstanding_principal is not touched
either (it's already correct, GL-verified via sync_outstanding_to_gl).

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Only proceeds when outstanding_principal > schedule's own remaining
    principal (the OVERSTATED direction). Self-guarding against double-
    application: once a reconciliation row exists, the shortfall
    calculation naturally comes out ~0 on a re-run, so nothing further
    gets added.
  - Re-verifies the schedule's remaining principal matches
    outstanding_principal exactly, including the new row, before
    committing.

Usage:
    python manage.py add_legacy_reconciliation_row --loan LN-629            # dry-run
    python manage.py add_legacy_reconciliation_row --loan LN-629 --apply
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'For a legacy loan where GL-verified outstanding_principal exceeds the schedule\'s own '
        'remaining principal (with no allocation evidence for which historical row is fictional), '
        'adds a single new schedule row holding exactly the shortfall — leaves every real row, '
        'paid or open, untouched.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', required=True,
                             help='Loan to correct.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentSchedule
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
            if not rows:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(f'[{loan_number}] no schedule rows found.'))
                return

            # Match retire_stale_legacy_schedule_rows's own definition of "schedule
            # remaining" exactly (status__in=['pending','partial','overdue'] only) —
            # that's the number retire will actually verify the new row against. A
            # 'paid' row can still carry a real per-component shortfall (LN-629 row
            # #4: principal_paid=25,648 vs principal_due=58,400, masked because its
            # TOTAL happens to equal total_due) that retire's own filter never sees;
            # using a broader "every non-restructured row" definition here would size
            # the new row against a number retire doesn't agree with, and leave its
            # own verification still failing.
            open_rows = [r for r in rows if r.status in ('pending', 'partial', 'overdue')]
            schedule_remaining = sum(
                (r.principal_due - r.principal_paid) for r in open_rows
            ) or Decimal('0.00')
            shortfall = loan.outstanding_principal - schedule_remaining

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_principal={loan.outstanding_principal:,.2f}  '
                f'schedule_remaining_principal={schedule_remaining:,.2f}  shortfall={shortfall:,.2f}'
            )

            if shortfall <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.SUCCESS(
                    f'[{loan_number}] Not overstated (shortfall={shortfall:,.2f} <= 0) — nothing to '
                    f'do. Either already reconciled, or the schedule needs retire_stale_legacy_'
                    f'schedule_rows instead (opposite direction).'
                ))
                return

            last_row = max(rows, key=lambda r: r.due_date)
            next_installment_number = max(r.installment_number for r in rows) + 1
            new_due_date = last_row.due_date + timedelta(days=1)

            self.stdout.write(
                f'    new row: installment_number={next_installment_number}  due_date={new_due_date}  '
                f'principal_due={shortfall:,.2f}  status=overdue'
            )

            new_schedule_remaining = schedule_remaining + shortfall
            if abs(new_schedule_remaining - loan.outstanding_principal) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'[{loan_number}] SAFETY CHECK FAILED — post-adjustment schedule remaining '
                    f'({new_schedule_remaining:,.2f}) does not match outstanding_principal '
                    f'({loan.outstanding_principal:,.2f}). Refusing to apply.'
                ))
                return

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('DRY-RUN — nothing written. Re-run with --apply.'))
                return

            LoanRepaymentSchedule.objects.create(
                loan=loan,
                branch=loan.branch,
                installment_number=next_installment_number,
                due_date=new_due_date,
                principal_due=shortfall,
                interest_due=Decimal('0.00'),
                fees_due=Decimal('0.00'),
                penalty_due=Decimal('0.00'),
                total_due=shortfall,
                status='overdue',
            )

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=shortfall,
                description=(
                    f'Added legacy reconciliation schedule row — {loan_number}: schedule\'s own '
                    f'remaining principal ({schedule_remaining:,.2f}) was {shortfall:,.2f} short of '
                    f'GL-verified outstanding_principal ({loan.outstanding_principal:,.2f}), with no '
                    f'LoanRepaymentAllocation evidence for which historical row is fictional. Added '
                    f'installment #{next_installment_number} (due {new_due_date}) holding exactly the '
                    f'shortfall, rather than altering any real row\'s due amount. No GL entry — '
                    f'schedule-field-only.'
                ),
                extra={
                    'loan_number': loan_number,
                    'shortfall': str(shortfall),
                    'new_installment_number': next_installment_number,
                    'new_due_date': str(new_due_date),
                    'source_command': 'add_legacy_reconciliation_row',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
