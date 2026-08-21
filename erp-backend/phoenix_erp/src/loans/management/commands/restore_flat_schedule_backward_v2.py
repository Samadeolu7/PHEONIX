"""
Management command: restore_flat_schedule_backward_v2

Generalizes restore_flat_schedule_count_backward (which was hardcoded to 6
hand-confirmed loans) to auto-detect each loan's flat installment amount
instead of requiring it hardcoded — for the next cohort of monthly legacy
loans with multiple zeroed/retired schedule rows.

Flat-amount detection: the mode of total_due across the loan's own rows
that are NOT retired and NOT a near-zero remainder (total_due > 1) — i.e.
whatever amount repeats most often among the rows retire_stale_legacy_
schedule_rows didn't touch. Requires that amount to repeat on AT LEAST
HALF the loan's real installment count (number_of_installments) before
trusting it — loans that don't clear that bar (e.g. LN-722/693/872, which
use genuinely varying per-installment amounts, not a flat figure) are
flagged needs_review, not guessed at.

Same two-step correction as v1 once a flat amount is confirmed: (1) every
row's due becomes the flat amount, (2) the unchanged, GL-verified
outstanding_principal is redistributed by counting backward from the
newest row — the current balance is trusted independent of schedule
bookkeeping; counting backward assumes (as with a loan carried over from
an old system) the oldest obligations are the ones most likely already
settled.

No GL entry — outstanding_principal itself is never changed, only how
it's attributed across schedule rows.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - --loan for a single loan, --batch for a fixed list of candidates
    (pass via --loans "LN-A,LN-B,...").
  - Refuses (needs_review) if no flat amount clears the half-of-
    installments bar, or if the number_of_installments field doesn't
    match the loan's real (live+retired) row count (a separate,
    unresolved discrepancy this command won't guess through).
  - Verifies the redistributed total exactly matches outstanding_principal
    before writing.

Usage:
    python manage.py restore_flat_schedule_backward_v2 --loan LN-660             # dry-run
    python manage.py restore_flat_schedule_backward_v2 --loan LN-660 --apply
    python manage.py restore_flat_schedule_backward_v2 --loans "LN-660,LN-666"   # dry-run, several
    python manage.py restore_flat_schedule_backward_v2 --loans "LN-660,LN-666" --apply
"""
from collections import Counter
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Auto-detects each loan\'s flat installment amount from its own intact rows, then restores '
        'the true schedule and redistributes GL-verified outstanding_principal backward from the '
        'newest row. Flags (does not guess) loans with no clean flat pattern.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only process a single loan by loan_number.')
        parser.add_argument('--loans', dest='loan_list', default=None,
                             help='Comma-separated list of loan numbers.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        loan_number = options['loan_number']
        loan_list = options['loan_list']
        apply_changes = options['apply']

        if bool(loan_number) == bool(loan_list):
            raise CommandError('Pass exactly one of --loan <number> or --loans "A,B,C".')

        loan_numbers = [loan_number] if loan_number else [s.strip() for s in loan_list.split(',') if s.strip()]
        today = timezone.localdate()

        applied, dry_ran, needs_review = 0, 0, 0
        for ln in loan_numbers:
            result = self._process_loan(ln, apply_changes, today)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            else:
                needs_review += 1

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'Done. applied={applied} needs_review={needs_review}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN done. would_apply={dry_ran} needs_review={needs_review}'
            ))

    def _process_loan(self, loan_number, apply_changes, today):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            try:
                loan = LoanAccount.all_objects.select_for_update().get(loan_number=loan_number)
            except LoanAccount.DoesNotExist:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(f'[{loan_number}] not found.'))
                return 'needs_review'

            rows = list(loan.repayment_schedule.select_for_update().order_by('due_date'))
            if not rows:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(f'[{loan_number}] no schedule rows.'))
                return 'needs_review'

            if len(rows) != loan.number_of_installments:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — schedule row count ({len(rows)}) does not '
                    f'match number_of_installments ({loan.number_of_installments}). Separate, unresolved '
                    f'discrepancy — fix that first.'
                ))
                return 'needs_review'

            intact = [r for r in rows if r.status != 'restructured' and r.total_due > 1]
            amounts = Counter(r.total_due for r in intact)
            if not amounts:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(f'[{loan_number}] needs manual review — no intact rows to detect a flat amount from.'))
                return 'needs_review'

            flat_amount, mode_count = amounts.most_common(1)[0]
            if mode_count < len(rows) / 2:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — no clean flat pattern (best candidate '
                    f'{flat_amount:,.2f} appears only {mode_count}/{len(rows)} rows). Likely genuinely '
                    f'varying per-installment amortization — needs individual handling.'
                ))
                return 'needs_review'

            for r in rows:
                r._new_due = flat_amount

            pool = loan.outstanding_principal
            for r in reversed(rows):
                owed = min(r._new_due, pool)
                r._new_paid = r._new_due - owed
                pool -= owed

            total_still_owed = sum(r._new_due - r._new_paid for r in rows)
            if abs(total_still_owed - loan.outstanding_principal) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'[{loan_number}] SAFETY CHECK FAILED — redistributed total ({total_still_owed:,.2f}) '
                    f'does not match outstanding_principal ({loan.outstanding_principal:,.2f}). Refusing.'
                ))
                return 'needs_review'

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan_number}] pk={loan.pk}  outstanding_principal={loan.outstanding_principal:,.2f}  '
                f'flat_installment={flat_amount:,.2f}  (detected from {mode_count}/{len(rows)} rows)'
            ))
            for r in rows:
                remaining = r._new_due - r._new_paid
                if remaining <= TOLERANCE:
                    new_status = 'paid'
                elif r.due_date > today:
                    new_status = 'pending'
                elif r._new_paid > 0:
                    new_status = 'partial'
                else:
                    new_status = 'overdue'
                self.stdout.write(
                    f'    #{r.installment_number} due={r.due_date}  due {r.total_due:,.2f} -> {r._new_due:,.2f}  '
                    f'paid {r.total_paid:,.2f} -> {r._new_paid:,.2f}  status {r.status} -> {new_status}'
                )
                r._new_status = new_status

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('  DRY-RUN — nothing written.\n'))
                return 'dry_run_ok'

            for r in rows:
                r.principal_due = r._new_due
                r.total_due = r._new_due
                r.interest_due = Decimal('0.00')
                r.fees_due = Decimal('0.00')
                r.principal_paid = r._new_paid
                r.total_paid = r._new_paid
                r.interest_paid = Decimal('0.00')
                r.fees_paid = Decimal('0.00')
                r.status = r._new_status
                if r._new_status != 'paid':
                    r.payment_date = None
                r.save(update_fields=[
                    'principal_due', 'total_due', 'interest_due', 'fees_due',
                    'principal_paid', 'total_paid', 'interest_paid', 'fees_paid',
                    'status', 'payment_date', 'updated_at',
                ])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=0,
                description=(
                    f'Restored flat schedule and redistributed backward (v2, auto-detected) — '
                    f'{loan_number}: all rows set to the detected flat installment ({flat_amount:,.2f}, '
                    f'from {mode_count}/{len(rows)} intact rows), then the unchanged GL-verified '
                    f'outstanding_principal ({loan.outstanding_principal:,.2f}) redistributed by '
                    f'counting backward from the newest row. No GL entry, outstanding_principal '
                    f'unchanged.'
                ),
                extra={
                    'loan_number': loan_number,
                    'flat_installment': str(flat_amount),
                    'mode_count': mode_count,
                    'row_count': len(rows),
                    'source_command': 'restore_flat_schedule_backward_v2',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.\n'))
            return 'applied'
