"""
Management command: retire_stale_legacy_schedule_rows

Confirmed on LN-858 (loan pk 652, Catherine Adukwu, origin=legacy_import):
outstanding_principal=800.00 is the trustworthy figure (confirmed against the
real client balance) — the loan's repayment_schedule is the corrupted side,
carrying ~58 stale unpaid/overdue installments (~57,800.00) left over from
before whatever happened in the legacy system (most likely a rollover/top-up/
consolidation that zeroed the old system's own `balance` field without ever
marking the corresponding installment rows paid there). See
audit_outstanding_principal_vs_schedule for the full mechanism, the
schedule_matches_terms integrity check, and the --summary / --list-understated
options that identify the batch-apply cohort used here (--batch).

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

Only handles the UNDERSTATED direction (outstanding_principal < schedule
remaining) — the shape validated on LN-858. OVERSTATED loans (outstanding_
principal > schedule remaining) are a different, unvalidated problem: there's
nothing to retire, the schedule would need debt added back, not removed.
--batch mode filters those out entirely; a single --loan run refuses an
OVERSTATED loan outright.

SAFETY:
  - Two modes: --loan <number> for one loan, or --batch to process every
    legacy_import + UNDERSTATED + schedule_matches_terms=True loan in one
    run (same cohort definition as audit_outstanding_principal_vs_schedule
    --list-understated). Exactly one of the two is required.
  - Refuses to run on a loan unless origin=legacy_import, unless --force is
    passed (single-loan mode only — --force + --batch is rejected, since
    --batch's whole filter already assumes the confirmed legacy cause).
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint —
    verifies the schedule's new remaining (principal + interest + fees;
    penalty tracked and retired separately) reconciles to outstanding_
    principal + outstanding_interest + outstanding_fees within tolerance
    before committing; rolls back and reports failure otherwise. In --batch
    mode, one loan failing verification does not stop the rest.

Usage:
    python manage.py retire_stale_legacy_schedule_rows --loan LN-858            # dry-run
    python manage.py retire_stale_legacy_schedule_rows --loan LN-858 --apply
    python manage.py retire_stale_legacy_schedule_rows --batch                  # dry-run, all
    python manage.py retire_stale_legacy_schedule_rows --batch --apply
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
        'Retire stale phantom schedule installments on legacy-imported loan(s) down to '
        'exactly what outstanding_principal/interest/fees/penalties says is really owed. '
        'Single loan (--loan) or the full validated cohort (--batch), dry-run by default.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Loan number to correct.')
        parser.add_argument('--batch', action='store_true',
                             help='Process every legacy_import + UNDERSTATED + '
                                  'schedule_matches_terms=True loan in one run.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')
        parser.add_argument('--force', action='store_true',
                             help='Allow running on a loan that is not origin=legacy_import. '
                                  'Only valid with --loan.')
        parser.add_argument('--tolerance', type=str, default='1.00',
                             help='Naira drift below which a loan is not part of the --batch '
                                  'cohort (default 1.00, matches the audit command default).')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_number = options['loan_number']
        batch = options['batch']
        apply_changes = options['apply']
        force = options['force']

        if bool(loan_number) == bool(batch):
            raise CommandError('Pass exactly one of --loan <number> or --batch.')
        if batch and force:
            raise CommandError(
                '--force is not valid with --batch — --batch already restricts itself to '
                'origin=legacy_import loans matching the confirmed pattern.'
            )

        if loan_number:
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
            loans = [loan]
        else:
            loans = self._understated_cohort(LoanAccount, Decimal(options['tolerance']))
            self.stdout.write(f'{len(loans)} loan(s) in the batch cohort.\n')

        applied, dry_ran, failed = 0, 0, 0
        for loan in loans:
            result = self._process_loan(loan, apply_changes)
            if result == 'applied':
                applied += 1
            elif result == 'dry_run_ok':
                dry_ran += 1
            else:
                failed += 1

        if len(loans) > 1:
            self.stdout.write('')
            if apply_changes:
                self.stdout.write(self.style.SUCCESS(
                    f'Batch done. applied={applied} failed_verification={failed}'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'DRY-RUN done. would_apply={dry_ran} failed_verification={failed} '
                    '— re-run with --apply to write.'
                ))

    @staticmethod
    def _understated_cohort(LoanAccount, tolerance):
        """Same cohort definition as audit_outstanding_principal_vs_schedule --list-understated."""
        from django.db.models import Sum

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).exclude(
            status__in=['written_off', 'paid_off', 'closed'],
        ).select_related('client').order_by('loan_number')

        cohort = []
        for loan in loans.iterator():
            agg = loan.repayment_schedule.exclude(status='restructured').aggregate(
                principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
                interest_due=Sum('interest_due'), interest_paid=Sum('interest_paid'),
                fees_due=Sum('fees_due'), fees_paid=Sum('fees_paid'),
                penalty_due=Sum('penalty_due'), penalty_paid=Sum('penalty_paid'),
                total_due=Sum('total_due'),
            )
            # Full picture across all four components — not principal alone. A loan can
            # look principal-understated while actually being penalty-overstated (see
            # LN-342: principal/interest matched, but a real 22,994.99 penalty accrual
            # meant total_outstanding was correct at 93,561.65, not "overstated" the way
            # a principal-only comparison suggested). Comparing the full totals is what
            # audit_outstanding_principal_vs_schedule --list-understated now does too —
            # this must stay in sync with that definition.
            schedule_owed = (
                (agg['principal_due'] or Decimal('0.00')) - (agg['principal_paid'] or Decimal('0.00'))
                + (agg['interest_due'] or Decimal('0.00')) - (agg['interest_paid'] or Decimal('0.00'))
                + (agg['fees_due'] or Decimal('0.00')) - (agg['fees_paid'] or Decimal('0.00'))
                + (agg['penalty_due'] or Decimal('0.00')) - (agg['penalty_paid'] or Decimal('0.00'))
            )
            total_due = agg['total_due'] or Decimal('0.00')
            drift = loan.total_outstanding - schedule_owed
            disbursed = loan.disbursed_amount or Decimal('0.00')
            schedule_matches_terms = disbursed > 0 and total_due <= disbursed * Decimal('3')

            if drift < -tolerance and schedule_matches_terms:
                cohort.append(loan)
        return cohort

    def _process_loan(self, loan, apply_changes):
        """Returns 'applied', 'dry_run_ok', or 'failed'."""
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = loan.loan_number
        outcome = 'failed'

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)
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
                    f'[{loan_number}] FAILED verification after retiring — NOT written. '
                    'Schedule remaining does not reconcile to outstanding_* within tolerance.'
                ))
                return 'failed'

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] DRY-RUN — verified clean, nothing written.\n'
                ))
                return 'dry_run_ok'

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
            outcome = 'applied'

            self.stdout.write(self.style.SUCCESS(
                f'[{loan_number}] Applied. arrears_amount {before_arrears:,.2f} -> '
                f'{loan.arrears_amount:,.2f}  days_in_arrears {before_dpd} -> {loan.days_in_arrears}  '
                f'risk_classification {before_risk} -> {loan.risk_classification}  '
                f'provision_amount {before_provision:,.2f} -> {loan.provision_amount:,.2f}\n'
            ))

        return outcome
