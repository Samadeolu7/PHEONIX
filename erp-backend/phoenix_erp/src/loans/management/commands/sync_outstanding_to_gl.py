"""
Management command: sync_outstanding_to_gl

Generalizes the fix validated on LN-1030/LN-526/LN-553/LN-855 (2026-08-19,
revert_stranded_penalty_gl_doublecount) into a standing tool: loan.account.balance
(the GL Loan Receivable account) is the trustworthy anchor for what a loan
truly owes, because interest is recognized upfront at disbursement (folded
into the Loan Receivable credit — see record_payment()'s docstring) and
penalty is recognized on an accrual basis (posted to the same account at
assessment, not at collection). Neither depends on the schedule/allocation
bookkeeping this whole investigation has repeatedly found drifting.

outstanding_principal + outstanding_interest + outstanding_fees +
outstanding_penalties is SUPPOSED to sum to that same GL balance. Where it
doesn't, this corrects outstanding_principal by the exact difference —
principal is the established "plug" bucket for this kind of correction
throughout today's work (matches correct_principal_penalty_misallocation,
correct_stranded_penalty_overpayment, and revert_stranded_penalty_gl_
doublecount, all of which route unexplained/misclassified amounts there
rather than inventing a new bucket).

This does NOT touch the schedule. A loan corrected here very likely still
needs retire_stale_legacy_schedule_rows (or individual review) run
afterward to bring LoanRepaymentSchedule back in line with the
now-GL-matched outstanding_principal — this command only fixes the
aggregate anchor point.

No GL entry — this never writes to Transaction/TransactionEntry, only to
LoanAccount.outstanding_principal. The GL is being read as ground truth,
not modified.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - --loan for a single loan (any tolerance), or --batch with a fixed
    tolerance to scan every non-deleted loan and report/fix all with a
    material gap.

Usage:
    python manage.py sync_outstanding_to_gl --loan LN-526             # dry-run
    python manage.py sync_outstanding_to_gl --loan LN-526 --apply
    python manage.py sync_outstanding_to_gl --loans LN-526,LN-553     # dry-run, a vetted list
    python manage.py sync_outstanding_to_gl --loans LN-526,LN-553 --apply
    python manage.py sync_outstanding_to_gl --batch                   # dry-run, all loans
    python manage.py sync_outstanding_to_gl --batch --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('1.00')


class Command(BaseCommand):
    help = (
        'Corrects outstanding_principal so outstanding_principal + outstanding_interest + '
        'outstanding_fees + outstanding_penalties matches loan.account.balance (the GL Loan '
        'Receivable balance) exactly. GL is the anchor — interest is recognized upfront, penalty '
        'on accrual basis, so it does not depend on schedule/allocation bookkeeping. Does not '
        'touch the schedule; run retire_stale_legacy_schedule_rows or review individually after.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--loans', dest='loan_numbers', default=None,
                             help='Comma-separated loan numbers — a vetted list, not a fresh scan.')
        parser.add_argument('--batch', action='store_true',
                             help='Scan every non-deleted loan for a material GL-vs-business gap.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        loan_numbers = options['loan_numbers']
        batch = options['batch']
        apply_changes = options['apply']

        modes_given = sum(bool(x) for x in (loan_number, loan_numbers, batch))
        if modes_given != 1:
            raise CommandError('Pass exactly one of --loan <number>, --loans <comma-list>, or --batch.')

        loans_qs = LoanAccount.all_objects.filter(is_deleted=False).order_by('loan_number')
        if loan_number:
            loans_qs = loans_qs.filter(loan_number=loan_number)
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found.')
        elif loan_numbers:
            wanted = [ln.strip() for ln in loan_numbers.split(',') if ln.strip()]
            loans_qs = loans_qs.filter(loan_number__in=wanted)
            found = set(loans_qs.values_list('loan_number', flat=True))
            missing = set(wanted) - found
            if missing:
                raise CommandError(f'Loan(s) not found: {", ".join(sorted(missing))}')

        applied, dry_ran, skipped = 0, 0, 0
        for loan in loans_qs.iterator():
            result = self._process_loan(loan, apply_changes)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            else:
                skipped += 1

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'Done. applied={applied} unaffected={skipped}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN done. would_apply={dry_ran} unaffected={skipped} — re-run with --apply to write.'
            ))

    def _process_loan(self, loan, apply_changes):
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)

            biz_total = (
                loan.outstanding_principal + loan.outstanding_interest
                + loan.outstanding_fees + loan.outstanding_penalties
            )
            gl_balance = loan.account.balance
            diff = gl_balance - biz_total

            if abs(diff) <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            new_outstanding_principal = loan.outstanding_principal + diff
            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  GL={gl_balance:,.2f}  business_sum={biz_total:,.2f}  '
                f'diff={diff:,.2f}  outstanding_principal {loan.outstanding_principal:,.2f} -> '
                f'{new_outstanding_principal:,.2f}'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            loan.outstanding_principal = new_outstanding_principal
            loan.save(update_fields=['outstanding_principal', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=diff,
                description=(
                    f'Synced outstanding_principal to GL — {loan_number}: business-field sum '
                    f'({biz_total:,.2f}) did not match loan.account.balance ({gl_balance:,.2f}); '
                    f'adjusted outstanding_principal by {diff:,.2f} to close the gap. GL is the '
                    f'trusted anchor (interest recognized upfront, penalty on accrual basis — '
                    f'independent of schedule/allocation drift). Schedule not touched by this '
                    f'correction; may still need reconciling separately.'
                ),
                extra={
                    'loan_number': loan_number,
                    'gl_balance': str(gl_balance),
                    'business_sum_before': str(biz_total),
                    'diff': str(diff),
                    'source_command': 'sync_outstanding_to_gl',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
