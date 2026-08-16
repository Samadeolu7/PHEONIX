"""
Management command: retire_stale_legacy_schedule_rows

Confirmed on LN-858 (loan pk 652, Catherine Adukwu, origin=legacy_import):
outstanding_principal=800.00 is the trustworthy figure (confirmed against the
real client balance) — the loan's repayment_schedule is the corrupted side,
carrying ~58 stale unpaid/overdue installments (~57,800.00) left over from
before whatever happened in the legacy system (most likely a rollover/top-up/
consolidation that zeroed the old system's own `balance` field without ever
marking the corresponding installment rows paid there). See
audit_outstanding_principal_vs_schedule for the full mechanism and the list
of other loans showing the same kind of disagreement.

This command does NOT touch outstanding_principal/interest/fees/penalties —
those stay exactly as imported, already correct. It only retires the portion
of the schedule that exceeds what's genuinely still owed, per component
(principal / interest / fees / penalty), walking rows oldest-due-date-first:

  - Rows fully covered by the still-owed pool are left untouched.
  - The one row where the pool runs out has its *_due fields capped down to
    exactly *_paid + whatever remained in the pool at that point (so it still
    carries the real remaining balance).
  - Every row after that point is fully retired: *_due fields dropped to
    *_paid (i.e. zero remaining), status set to 'restructured'.

'restructured' is reused deliberately, not a new status — it's already the
status every arrears/penalty/defaulter/GL-relevant query in this codebase
treats as "retired, not currently owed" (LoanAccount._calculate_arrears(),
update_loan_status's penalty-accrual query, LoanAccount.restructure()'s own
cancellation of superseded rows, and this audit tool's own exclusion) even
though there's no LoanRestructure record behind it here. No row is marked
'paid' — these amounts were never actually collected, and marking them paid
would fabricate collections that never happened.

No GL entry is posted — no money moves, only which installments are still
considered owed changes. After retiring rows, this recalculates the loan's
arrears_amount / days_in_arrears (LoanAccount._calculate_arrears()) and
risk_classification / provision_pct / provision_amount (LoanAccount.
update_risk_classification()) from the now-correct schedule, and logs one
FinancialAuditLog(LOAN_BALANCE_CORRECTION) entry per loan for traceability.

SAFETY:
  - Requires --loan (no batch/auto-detect mode) — this is a per-loan,
    ops-confirmed correction, not something to run blind across the book.
  - Refuses to run on a loan unless origin=legacy_import, unless --force is
    passed — this mechanism assumes the specific legacy rollover/consolidation
    cause; a non-legacy loan with the same numeric symptom needs a different
    diagnosis first.
  - Dry-run by default. Nothing is written until --apply.
  - Verifies after retiring that the schedule's new remaining (principal +
    interest + fees only — penalty is tracked and retired separately) matches
    outstanding_principal + outstanding_interest + outstanding_fees within
    tolerance before committing; rolls back and reports failure otherwise.

Usage:
    python manage.py retire_stale_legacy_schedule_rows --loan LN-858            # dry-run
    python manage.py retire_stale_legacy_schedule_rows --loan LN-858 --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')

# (schedule field prefix, LoanAccount outstanding_* field name)
_COMPONENTS = [
    ('principal', 'outstanding_principal'),
    ('interest', 'outstanding_interest'),
    ('fees', 'outstanding_fees'),
    ('penalty', 'outstanding_penalties'),
]


class Command(BaseCommand):
    help = (
        'Retire stale phantom schedule installments on a legacy-imported loan down to '
        'exactly what outstanding_principal/interest/fees/penalties says is really owed. '
        'Per-loan only, dry-run by default.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', required=True,
                             help='Loan number to correct.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')
        parser.add_argument('--force', action='store_true',
                             help='Allow running on a loan that is not origin=legacy_import.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        apply_changes = options['apply']
        force = options['force']

        try:
            loan = LoanAccount.all_objects.select_related('client').get(
                loan_number=loan_number, is_deleted=False,
            )
        except LoanAccount.DoesNotExist:
            raise CommandError(f'Loan {loan_number} not found.')

        if loan.origin != LoanAccount.ORIGIN_LEGACY_IMPORT and not force:
            raise CommandError(
                f'{loan_number} has origin={loan.origin!r}, not legacy_import. This command '
                'assumes the legacy rollover/consolidation cause confirmed on LN-858 — pass '
                '--force if you have independently confirmed the same cause applies here.'
            )

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = LoanAccount.all_objects.select_for_update().get(pk=loan.pk)
            rows = list(
                loan.repayment_schedule.select_for_update()
                .filter(status__in=['pending', 'partial', 'overdue'])
                .order_by('due_date')
            )

            before_remaining = {
                comp: sum((getattr(r, f'{comp}_due') - getattr(r, f'{comp}_paid')) for r in rows)
                for comp, _ in _COMPONENTS
            }
            before_arrears = loan.arrears_amount
            before_dpd = loan.days_in_arrears
            before_risk = loan.risk_classification
            before_provision = loan.provision_amount

            pools = {comp: getattr(loan, field) for comp, field in _COMPONENTS}
            retired_count = 0
            capped_count = 0
            touched_rows = []

            for row in rows:
                changed = False
                for comp, _ in _COMPONENTS:
                    due_field = f'{comp}_due'
                    paid_field = f'{comp}_paid'
                    due = getattr(row, due_field)
                    paid = getattr(row, paid_field)
                    row_remaining = due - paid

                    if row_remaining <= 0:
                        continue  # nothing owed on this component for this row already

                    pool = pools[comp]
                    if pool <= 0:
                        new_due = paid  # fully retire this component on this row
                    elif row_remaining <= pool:
                        new_due = due  # fully covered by what's still genuinely owed
                        pools[comp] -= row_remaining
                    else:
                        new_due = paid + pool  # caps to exactly what's left owed
                        pools[comp] = Decimal('0.00')

                    if new_due != due:
                        setattr(row, due_field, new_due)
                        changed = True

                if changed:
                    row.total_due = row.principal_due + row.interest_due + row.fees_due
                    row_fully_retired = (
                        row.principal_due <= row.principal_paid
                        and row.interest_due <= row.interest_paid
                        and row.fees_due <= row.fees_paid
                        and row.penalty_due <= row.penalty_paid
                    )
                    if row_fully_retired:
                        row.status = 'restructured'
                        retired_count += 1
                    else:
                        capped_count += 1
                    touched_rows.append(row)

            # Recompute directly from `rows` (touched + untouched together) rather than
            # re-querying — the DB hasn't been written to yet in dry-run/pre-verify mode.
            after_remaining = {
                comp: sum((getattr(r, f'{comp}_due') - getattr(r, f'{comp}_paid')) for r in rows)
                for comp, _ in _COMPONENTS
            }

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan_number}] pk={loan.pk}  origin={loan.origin}  '
                f'{len(touched_rows)} row(s) touched ({retired_count} retired, {capped_count} capped)'
            ))
            for comp, field in _COMPONENTS:
                self.stdout.write(
                    f'    {comp:9s} outstanding={getattr(loan, field):>12,.2f}  '
                    f'schedule remaining before={before_remaining[comp]:>12,.2f}  '
                    f'after={after_remaining[comp]:>12,.2f}'
                )

            # Verify: schedule's new remaining (principal+interest+fees; penalty tracked
            # separately) must reconcile to the loan's trusted outstanding_* aggregates.
            ok = all(
                abs(after_remaining[comp] - getattr(loan, field)) <= TOLERANCE
                for comp, field in _COMPONENTS
            )

            if not ok:
                db_transaction.savepoint_rollback(sid)
                self.stderr.write(self.style.ERROR(
                    f'\n[{loan_number}] FAILED verification after retiring — NOT written. '
                    'Schedule remaining does not reconcile to outstanding_* within tolerance.'
                ))
                return

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    '\nDRY-RUN — verified clean, nothing written. Re-run with --apply.'
                ))
                return

            for row in touched_rows:
                row.save(update_fields=[
                    'principal_due', 'interest_due', 'fees_due', 'penalty_due',
                    'total_due', 'status', 'updated_at',
                ])

            loan._calculate_arrears()
            loan.refresh_from_db()
            loan.update_risk_classification()
            loan.save(update_fields=[
                'risk_classification', 'provision_pct', 'provision_amount', 'updated_at',
            ])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=Decimal('0.00'),
                description=(
                    f'Retired {retired_count} stale legacy schedule row(s) on {loan_number} '
                    f'({capped_count} row(s) capped) — outstanding_principal confirmed correct, '
                    'schedule was carrying pre-migration phantom installments'
                ),
                extra={
                    'loan_number': loan_number,
                    'rows_retired': retired_count,
                    'rows_capped': capped_count,
                    'source_command': 'retire_stale_legacy_schedule_rows',
                },
            )

            db_transaction.savepoint_commit(sid)

            self.stdout.write(self.style.SUCCESS(
                f'\nApplied. arrears_amount {before_arrears:,.2f} -> {loan.arrears_amount:,.2f}  '
                f'days_in_arrears {before_dpd} -> {loan.days_in_arrears}  '
                f'risk_classification {before_risk} -> {loan.risk_classification}  '
                f'provision_amount {before_provision:,.2f} -> {loan.provision_amount:,.2f}'
            ))
