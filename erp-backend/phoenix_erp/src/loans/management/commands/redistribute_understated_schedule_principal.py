"""
Management command: redistribute_understated_schedule_principal

Mirror-image fix to retire_stale_legacy_schedule_rows: that tool handles
loans where the schedule shows MORE remaining principal than outstanding_
principal (the UNDERSTATED-aggregate direction). This handles the
opposite — loans where GL-verified outstanding_principal EXCEEDS what the
schedule's own rows show remaining (OVERSTATED aggregate).

Confirmed on LN-629 by hand-tracing its GL ledger: schedule rows #1-4 are
marked 'paid' totalling far more cash (₦251,120.00) than this loan's
entire payment history can account for. OBMIG (the migration opening
balance) implies at most ₦89,760.00 was collected pre-migration; real,
non-reversed payments since migration total exactly ₦73,000.00 (matches
loan.principal_paid + interest_paid + penalties_paid to the naira). Even
crediting both generously, total real cash ever received tops out around
₦162,760 — at least ₦88,360 of the schedule's "paid" rows is fictional.
No LoanRepaymentAllocation records exist for these loans (legacy import,
zero allocations), so there is no evidence to identify WHICH specific
historical row is fictional — only that the schedule's row-level history
predating the loan's migration cutover can't be trusted at the row level.

Given that, this deliberately does NOT rewrite rows already marked 'paid'
— there's no evidence to base a specific historical claim on, and
inventing one would be worse than not trying. Instead it adds the
shortfall (outstanding_principal minus the schedule's own remaining
principal) onto the currently-open rows (status in pending/partial/
overdue), split evenly across them. Same mechanical-reconciliation
philosophy retire_stale_legacy_schedule_rows uses for the opposite
direction: make the aggregate correct without pretending to know exactly
which dollar belongs on which historical row.

principal_due and total_due are both plain stored fields (not derived),
so both get bumped by the same per-row amount to stay consistent.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Only proceeds when outstanding_principal > schedule's remaining
    principal (the OVERSTATED direction) — does nothing for loans needing
    the opposite fix (that's retire_stale_legacy_schedule_rows's job).
  - Refuses if there are no open (non-paid, non-restructured) rows to
    absorb the shortfall into — nowhere safe to put it.
  - Re-verifies the schedule's remaining principal now matches
    outstanding_principal exactly before committing.

Usage:
    python manage.py redistribute_understated_schedule_principal --loan LN-629            # dry-run
    python manage.py redistribute_understated_schedule_principal --loan LN-629 --apply
"""
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')
OPEN_STATUSES = ['pending', 'partial', 'overdue']


class Command(BaseCommand):
    help = (
        'Mirror image of retire_stale_legacy_schedule_rows: for loans where GL-verified '
        'outstanding_principal exceeds the schedule\'s own remaining principal (and no '
        'LoanRepaymentAllocation evidence exists to say which historical row is fictional), adds '
        'the shortfall onto the currently-open rows, split evenly. Never rewrites rows already '
        'marked paid.'
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
            schedule_remaining = sum(
                (r.principal_due - r.principal_paid) for r in rows
            ) or Decimal('0.00')

            shortfall = loan.outstanding_principal - schedule_remaining
            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_principal={loan.outstanding_principal:,.2f}  '
                f'schedule_remaining_principal={schedule_remaining:,.2f}  shortfall={shortfall:,.2f}'
            )

            if shortfall <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.SUCCESS(
                    f'[{loan_number}] Not overstated (shortfall={shortfall:,.2f} <= 0) — '
                    f'nothing to do here. If schedule shows MORE than outstanding, use '
                    f'retire_stale_legacy_schedule_rows instead.'
                ))
                return

            open_rows = [r for r in rows if r.status in OPEN_STATUSES]
            if not open_rows:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'[{loan_number}] needs manual review — shortfall of {shortfall:,.2f} but no '
                    f'open (pending/partial/overdue) rows to absorb it into.'
                ))
                return

            n = len(open_rows)
            per_row = (shortfall / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            drift = shortfall - (per_row * n)  # rounding remainder, absorbed by the last row

            for i, row in enumerate(open_rows):
                bump = per_row + drift if i == n - 1 else per_row
                self.stdout.write(
                    f'    row due={row.due_date}  principal_due {row.principal_due:,.2f} -> '
                    f'{row.principal_due + bump:,.2f}  total_due {row.total_due:,.2f} -> '
                    f'{row.total_due + bump:,.2f}'
                )
                row._bump = bump  # stash for the apply pass below

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

            for row in open_rows:
                row.principal_due += row._bump
                row.total_due += row._bump
                row.save(update_fields=['principal_due', 'total_due', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=shortfall,
                description=(
                    f'Redistributed understated schedule principal — {loan_number}: schedule\'s '
                    f'remaining principal ({schedule_remaining:,.2f}) was {shortfall:,.2f} short of '
                    f'GL-verified outstanding_principal ({loan.outstanding_principal:,.2f}), with no '
                    f'LoanRepaymentAllocation evidence for which historical schedule row is '
                    f'fictional. Added the shortfall across {n} open row(s), split evenly, rather '
                    f'than rewriting rows already marked paid. No GL entry — schedule-field-only.'
                ),
                extra={
                    'loan_number': loan_number,
                    'shortfall': str(shortfall),
                    'open_rows_adjusted': n,
                    'source_command': 'redistribute_understated_schedule_principal',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
