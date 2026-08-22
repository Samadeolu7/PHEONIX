"""
Management command: sync_principal_interest_split

Fixes a book-wide residue of the bug documented in record_payment()
(loans/models.py ~1154-1161, "Found on LN-20260702-B91A43, 2026-07-15"):
before that date, a payment's interest/principal split was computed
against the loan's whole-term AGGREGATE outstanding_interest instead of
each unpaid installment's own interest_due, so a single payment could get
fully absorbed as "interest" for several installments running before any
of it was ever recognized as principal collected.

The code was fixed on 2026-07-15 and the schedule rows for the loans found
at the time were corrected to reflect the true per-installment split.  But
loan.outstanding_principal / loan.outstanding_interest — the loan-level
aggregates — were never re-synced to match, and the fix was only ever
applied to a handful of loans, not the whole book.  A full sweep on
2026-08-22 found 29 more loans (mostly native daily/weekly) carrying the
exact same signature: schedule's remaining principal is understated by
some amount X relative to outstanding_principal, and schedule's remaining
interest is overstated by that exact same X relative to outstanding_interest.

Because interest is recognized upfront at disbursement (see disburse()),
GL does not distinguish principal from interest post-disbursement — both
outstanding_principal and outstanding_interest are folded into the same
Loan Receivable balance. So outstanding_principal + outstanding_interest
combined is the only figure GL actually constrains; how that combined
total is split between the two fields is pure schedule/reporting
bookkeeping. Since the schedule rows already carry the correct
per-installment split (that's what the 2026-07-15 fix corrected the code
to produce going forward), this re-derives the loan's own aggregate split
from its own schedule — outstanding_principal := schedule's remaining
principal (open rows only), outstanding_interest := schedule's remaining
interest — while asserting the COMBINED total is unchanged to the cent.

No GL entry — outstanding_principal + outstanding_interest together are
unchanged, only how that same total is divided between the two fields.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Only proceeds when the combined total (schedule remaining principal +
    interest) matches the combined total (outstanding_principal +
    outstanding_interest) within tolerance — refuses (needs_review) if
    they don't, since that would mean this isn't a pure split issue.
  - --loan for a single loan, --loans for a comma-separated list.

Usage:
    python manage.py sync_principal_interest_split --loan LN-XXX            # dry-run
    python manage.py sync_principal_interest_split --loan LN-XXX --apply
    python manage.py sync_principal_interest_split --loans "LN-A,LN-B"      # dry-run, several
    python manage.py sync_principal_interest_split --loans "LN-A,LN-B" --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Re-derives outstanding_principal/outstanding_interest from the loan\'s own schedule '
        '(open rows only), preserving their combined total exactly — fixes the pre-2026-07-15 '
        'record_payment() bug\'s residue where a payment got misclassified between principal and '
        'interest without changing the total owed.'
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

        applied, dry_ran, needs_review = 0, 0, 0
        for ln in loan_numbers:
            result = self._process_loan(ln, apply_changes)
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

    def _process_loan(self, loan_number, apply_changes):
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

            rows = list(
                loan.repayment_schedule.select_for_update().filter(
                    status__in=['pending', 'partial', 'overdue']
                )
            )

            schedule_principal = sum((r.principal_due - r.principal_paid) for r in rows) or Decimal('0.00')
            schedule_interest = sum((r.interest_due - r.interest_paid) for r in rows) or Decimal('0.00')

            current_total = loan.outstanding_principal + loan.outstanding_interest
            schedule_total = schedule_principal + schedule_interest

            if abs(current_total - schedule_total) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — combined principal+interest total '
                    f'differs (current={current_total:,.2f} vs schedule={schedule_total:,.2f}, '
                    f'diff={current_total - schedule_total:,.2f}). Not a pure split issue — refusing.'
                ))
                return 'needs_review'

            principal_diff = loan.outstanding_principal - schedule_principal
            interest_diff = loan.outstanding_interest - schedule_interest
            if abs(principal_diff) <= TOLERANCE and abs(interest_diff) <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.SUCCESS(f'[{loan_number}] Already in sync — nothing to do.'))
                return 'unaffected'

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan_number}] pk={loan.pk}  '
                f'outstanding_principal {loan.outstanding_principal:,.2f} -> {schedule_principal:,.2f}  '
                f'outstanding_interest {loan.outstanding_interest:,.2f} -> {schedule_interest:,.2f}  '
                f'(combined total unchanged: {current_total:,.2f})'
            ))

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING('  DRY-RUN — nothing written.\n'))
                return 'dry_run_ok'

            old_principal = loan.outstanding_principal
            old_interest = loan.outstanding_interest
            loan.outstanding_principal = schedule_principal
            loan.outstanding_interest = schedule_interest
            loan.save(update_fields=['outstanding_principal', 'outstanding_interest', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=0,
                description=(
                    f'Synced principal/interest split to schedule — {loan_number}: '
                    f'outstanding_principal {old_principal:,.2f} -> {schedule_principal:,.2f}, '
                    f'outstanding_interest {old_interest:,.2f} -> {schedule_interest:,.2f}. '
                    f'Residue of the pre-2026-07-15 record_payment() bug (see models.py comment, '
                    f'found on LN-20260702-B91A43) where a payment\'s interest/principal split was '
                    f'computed against the aggregate outstanding_interest instead of each unpaid '
                    f'installment\'s own interest_due. Combined total (principal+interest) unchanged '
                    f'to the cent — GL is not affected since interest is recognized upfront and GL '
                    f'does not distinguish principal from interest post-disbursement.'
                ),
                extra={
                    'loan_number': loan_number,
                    'old_outstanding_principal': str(old_principal),
                    'new_outstanding_principal': str(schedule_principal),
                    'old_outstanding_interest': str(old_interest),
                    'new_outstanding_interest': str(schedule_interest),
                    'source_command': 'sync_principal_interest_split',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.\n'))
            return 'applied'
