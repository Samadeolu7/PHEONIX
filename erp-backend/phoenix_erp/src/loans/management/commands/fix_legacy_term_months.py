"""
Management command: fix_legacy_term_months

Fixes a systemic off-by-one bug in import_legacy_data.py: for legacy-
imported loans, `term_months` and `maturity_date` were computed from the
legacy export's start_date/end_date fields via a calendar-month-difference
formula, entirely independent of the loan's actual imported schedule rows
(a separate export, `schedules_data`). For monthly-frequency loans, this
produced `term_months` one less than the real number of installments in
~164 loans book-wide (e.g. LN-918: term_months=5, but 6 real monthly
installments were imported) — confirmed via `number_of_installments`
(itself computed at import time directly from the schedule export, a
separate and reliable source) disagreeing with `term_months` by exactly 1
in the overwhelming majority of cases.

This matters beyond cosmetics: retire_stale_legacy_schedule_rows drains a
pool from outstanding_* across schedule rows and zeros/retires whatever's
left over — it has no notion of term_months at all. On loans where the
wrong term_months also (directly or indirectly) understated
outstanding_principal, this wrongly retired a genuinely-owed final
installment (confirmed on 9 loans: LN-1048, LN-1014, LN-917, LN-918,
LN-915, LN-914, LN-872, LN-722, LN-693 — handled separately, individually,
since real schedule data was destroyed there and needs the same careful
reconciliation-row treatment as LN-629/526/659).

This command handles ONLY the safe subset: loans where term_months is
wrong but NO schedule row has been retired yet (nothing destroyed, purely
a metadata correction). It:
  1. Recomputes the true installment count directly from the loan's own
     LoanRepaymentSchedule rows (not blindly trusted from the stored
     number_of_installments field — cross-checked against it as a sanity
     guard).
  2. Sets term_months to that true count.
  3. Sets maturity_date to the last schedule row's due_date — mirroring
     exactly what LoanAccount.disburse() does for normal (non-legacy)
     loans (models.py ~911-915): maturity_date is DERIVED FROM the
     schedule, never the other way around.

Does not touch any financial field (no GL entry, no outstanding_*,
no FinancialAuditLog amount — this is a pure metadata correction).

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - Scoped to origin=legacy_import, repayment_frequency='monthly',
    zero retired schedule rows (--batch only ever touches this safe
    subset — never a loan with any retired row, even if it looks like a
    term_months mismatch; those need individual review instead).
  - Refuses (flags, doesn't guess) if the schedule's own row count
    disagrees with the stored number_of_installments field — that's a
    third, unexplained discrepancy this command isn't designed to
    resolve.
  - --loan for a single loan, --batch for the whole safe cohort.

Usage:
    python manage.py fix_legacy_term_months --loan LN-XXX           # dry-run
    python manage.py fix_legacy_term_months --loan LN-XXX --apply
    python manage.py fix_legacy_term_months --batch                 # dry-run, all
    python manage.py fix_legacy_term_months --batch --apply
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        'Fixes term_months/maturity_date for legacy-imported monthly loans where the import '
        'script\'s date-diff calculation undercounted installments by one, but no schedule row '
        'has been retired yet (pure metadata correction, no financial fields touched). Loans with '
        'any retired row are skipped — those need individual reconciliation instead.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--batch', action='store_true',
                             help='Check every legacy_import monthly loan with zero retired rows.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        batch = options['batch']
        apply_changes = options['apply']

        if bool(loan_number) == bool(batch):
            raise CommandError('Pass exactly one of --loan <number> or --batch.')

        loans_qs = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
            repayment_frequency='monthly',
        ).order_by('loan_number')
        if loan_number:
            loans_qs = loans_qs.filter(loan_number=loan_number)
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found (or not legacy_import/monthly).')

        applied, dry_ran, skipped, needs_review = 0, 0, 0, 0
        for loan in loans_qs.iterator():
            result = self._process_loan(loan, apply_changes)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            elif result == 'needs_review':
                needs_review += 1
            else:
                skipped += 1

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(
                f'Done. applied={applied} needs_review={needs_review} unaffected={skipped}'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN done. would_apply={dry_ran} needs_review={needs_review} '
                f'unaffected={skipped} — re-run with --apply to write.'
            ))

    def _process_loan(self, loan, apply_changes):
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)

            rows = list(loan.repayment_schedule.select_for_update().order_by('due_date'))
            retired = [r for r in rows if r.status == 'restructured']
            if retired:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'  # has a retired row — needs individual review, not this command

            live_count = len(rows)
            if live_count == 0:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'  # no schedule at all — separate issue, not this command

            if live_count != loan.number_of_installments:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — actual schedule row count '
                    f'({live_count}) does not match stored number_of_installments '
                    f'({loan.number_of_installments}) either. Unexplained third discrepancy.'
                ))
                return 'needs_review'

            if loan.term_months == live_count:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'  # already correct

            new_maturity = rows[-1].due_date
            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  term_months {loan.term_months} -> {live_count}  '
                f'maturity_date {loan.maturity_date} -> {new_maturity}'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            old_term = loan.term_months
            old_maturity = loan.maturity_date
            loan.term_months = live_count
            loan.maturity_date = new_maturity
            loan.save(update_fields=['term_months', 'maturity_date', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=0,
                description=(
                    f'Fixed legacy import term_months/maturity_date — {loan_number}: '
                    f'term_months {old_term} -> {live_count}, maturity_date {old_maturity} -> '
                    f'{new_maturity}. import_legacy_data.py computed these from the legacy export\'s '
                    f'start_date/end_date independent of the actual imported schedule rows, '
                    f'undercounting by one. No schedule row was retired for this loan — pure '
                    f'metadata correction, no financial field touched.'
                ),
                extra={
                    'loan_number': loan_number,
                    'old_term_months': old_term,
                    'new_term_months': live_count,
                    'old_maturity_date': str(old_maturity),
                    'new_maturity_date': str(new_maturity),
                    'source_command': 'fix_legacy_term_months',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
