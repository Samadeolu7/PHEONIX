"""
Management command: restore_flat_schedule_count_backward

Fixes the 6 "clean" Group-A loans (LN-1048, LN-1014, LN-917, LN-918,
LN-915, LN-914) where retire_stale_legacy_schedule_rows wrongly retired a
genuinely-owed final installment. Each of these loans has a single, flat,
consistently-repeated installment amount across its intact rows (e.g.
LN-918: ₦58,400 × 6 = ₦350,400, exactly ₦50,400 over its ₦300,000
disbursed — a clean implied-interest figure), confirming what every row
SHOULD be worth, including the ones retire zeroed out or capped down to a
near-zero remainder.

Restoring the retired row to that flat amount WITHOUT also redistributing
is wrong: retire's forward pool-drain already correctly summed to
outstanding_principal (GL-verified) — it just front-loaded that entire
true balance onto the earliest open rows and zeroed everything after,
instead of spreading it across the true 6-row structure. Simply undoing
the zero would nearly double the loan's apparent balance, inventing debt
that was never real.

So this does both steps together, per the correct sequencing: (1) restore
every row to the loan's own flat installment amount, (2) redistribute the
SAME unchanged, GL-verified outstanding_principal across all rows by
counting backward from the newest row — the natural assumption for a
schedule carried over from an old system where the oldest obligations are
the ones most likely already settled, and the current balance (trusted,
independent of any of this schedule bookkeeping) is what's actually still
owed. Rows fully covered by counting backward become 'paid'; the row
where the pool runs out becomes 'partial'/'overdue' (only if already past
due) or stays 'pending' (if the due date hasn't arrived yet); rows before
that are untouched if already correctly 'paid', or become 'paid' by this
same redistribution if they weren't already.

No GL entry — outstanding_principal itself is never changed, only how it's
attributed across schedule rows.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Hardcoded to exactly the 6 confirmed-clean loans — this is not a
    generic batch tool, since it depends on a flat per-installment
    pattern confirmed by hand for these specific loans. LN-872/722/693
    are NOT included — they use a different (non-flat) amortization and
    need individual handling.
  - Verifies the sum of all rows' remaining exactly matches
    outstanding_principal before writing.

Usage:
    python manage.py restore_flat_schedule_count_backward            # dry-run
    python manage.py restore_flat_schedule_count_backward --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')

# (loan_number, flat installment amount) — confirmed by hand from each loan's
# own intact rows.
TARGET_LOANS = [
    ('LN-1048', Decimal('58400.00')),
    ('LN-1014', Decimal('39000.00')),
    ('LN-917', Decimal('58400.00')),
    ('LN-918', Decimal('58400.00')),
    ('LN-915', Decimal('29200.00')),
    ('LN-914', Decimal('58400.00')),
]


class Command(BaseCommand):
    help = (
        'Restores the true flat installment amount on all 6 rows for the 6 confirmed-clean '
        'Group-A loans, then redistributes the unchanged GL-verified outstanding_principal '
        'backward from the newest row. No GL entry, outstanding_principal itself never changes.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        apply_changes = options['apply']
        today = timezone.localdate()

        for loan_number, flat_amount in TARGET_LOANS:
            self._process_loan(loan_number, flat_amount, apply_changes, today)

    def _process_loan(self, loan_number, flat_amount, apply_changes, today):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            loan = LoanAccount.all_objects.select_for_update().get(loan_number=loan_number)
            rows = list(
                loan.repayment_schedule.select_for_update().order_by('due_date')
            )

            # Step 1: every row's due amount becomes the confirmed flat figure.
            for r in rows:
                r._new_due = flat_amount

            # Step 2: count backward from the newest row, allocating the unchanged
            # GL-verified outstanding_principal to how much of each row is still owed.
            pool = loan.outstanding_principal
            for r in reversed(rows):
                owed = min(r._new_due, pool)
                r._new_paid = r._new_due - owed
                pool -= owed

            total_still_owed = sum(r._new_due - r._new_paid for r in rows)
            if abs(total_still_owed - loan.outstanding_principal) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(
                    f'[{loan_number}] SAFETY CHECK FAILED — redistributed total '
                    f'({total_still_owed:,.2f}) does not match outstanding_principal '
                    f'({loan.outstanding_principal:,.2f}). Refusing to apply.'
                ))
                return

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan_number}] pk={loan.pk}  outstanding_principal={loan.outstanding_principal:,.2f}  '
                f'flat_installment={flat_amount:,.2f}'
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
                    f'    #{r.installment_number} due={r.due_date}  '
                    f'due {r.total_due:,.2f} -> {r._new_due:,.2f}  '
                    f'paid {r.total_paid:,.2f} -> {r._new_paid:,.2f}  '
                    f'status {r.status} -> {new_status}'
                )
                r._new_status = new_status

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('  DRY-RUN — nothing written.\n'))
                return

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
                    f'Restored flat schedule and redistributed backward — {loan_number}: all rows '
                    f'set to the confirmed flat installment ({flat_amount:,.2f}), then the unchanged '
                    f'GL-verified outstanding_principal ({loan.outstanding_principal:,.2f}) '
                    f'redistributed by counting backward from the newest row — reversing '
                    f'retire_stale_legacy_schedule_rows\'s forward-loaded, wrongly-retired-row '
                    f'result. No GL entry, outstanding_principal unchanged.'
                ),
                extra={
                    'loan_number': loan_number,
                    'flat_installment': str(flat_amount),
                    'source_command': 'restore_flat_schedule_count_backward',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.\n'))
