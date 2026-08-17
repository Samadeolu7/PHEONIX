"""
Management command: correct_stranded_penalty_overpayment

Fixes what audit_stranded_penalty_overpayment found: schedule rows where
penalty_paid exceeds penalty_due, blocking retire_stale_legacy_schedule_rows
(its verification does a raw before/after sum that a negative per-row
remaining silently corrupts — see LN-722's trace) and misrepresenting real
money. Two different causes, two different fixes, both driven by the same
LoanRepaymentAllocation check the audit uses:

  REAL (a LoanRepaymentAllocation record with penalty_applied > 0 confirms a
  genuine payment applied here): the payment correctly applied against
  penalty_due AS IT WAS AT THAT MOMENT; today's penalty corrections have
  since revised penalty_due down, stranding real, already-collected cash
  above the new lower obligation. Fix: cap the row's penalty_paid down to
  penalty_due, and move the excess to the LOAN AGGREGATE's principal_paid
  (increase) / outstanding_principal (decrease) / penalties_paid (decrease)
  — not back onto the same row's own principal_paid, which could push it
  past its own principal_due in a way the schedule wasn't built to represent
  cleanly. This mirrors correct_principal_penalty_misallocation's exact
  "move mis-bucketed real cash to principal, no GL entry" philosophy — the
  cash was already correctly posted to GL when collected; this only
  recategorizes which internal bucket it's attributed to.

  STALE (no LoanRepaymentAllocation record): the older pre-2026-08-05
  "broken proportional split" corruption — the stored penalty_paid figure
  has no real payment behind it at all (e.g. LN-571's row #9: penalty_paid=
  90,283.10 against penalty_due=0). Fix: cap penalty_paid down to
  penalty_due. Nothing to redistribute — the excess was never real money,
  just a wrong number sitting in a field. sched.total_paid is NOT derived
  from summing principal_paid+interest_paid+fees_paid+penalty_paid (it's
  tracked independently by _update_schedule_with_payment — confirmed on
  LN-571's row #9, where the four components sum to 120,887.54 but
  total_paid is 30,604.44), so capping penalty_paid here has no other
  consequence to reconcile.

No GL entry in either case — REAL moves an already-posted amount between
internal buckets; STALE corrects a number that was never real.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint.
  - --loan for a single loan, --batch for every affected legacy_import loan.
  - REAL rows are skipped (flagged, not applied) if moving the excess to
    principal would push loan.outstanding_principal negative — that would
    mean this loan's principal side has its own unresolved problem, not
    something this command should paper over.

Usage:
    python manage.py correct_stranded_penalty_overpayment --loan LN-722     # dry-run
    python manage.py correct_stranded_penalty_overpayment --loan LN-722 --apply
    python manage.py correct_stranded_penalty_overpayment --batch           # dry-run, all
    python manage.py correct_stranded_penalty_overpayment --batch --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Fix schedule rows where penalty_paid exceeds penalty_due: real stranded payments get '
        'reallocated to loan-level principal, stale/corrupted values just get capped down. '
        'No GL entry in either case.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--batch', action='store_true',
                             help='Correct every affected legacy_import loan in one run.')
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
        ).order_by('loan_number')
        if loan_number:
            loans_qs = loans_qs.filter(loan_number=loan_number)
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found (or not origin=legacy_import).')

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
        from loans.models import LoanRepaymentAllocation

        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)
            rows = list(
                loan.repayment_schedule.select_for_update().exclude(status='restructured')
            )

            real_total = Decimal('0.00')
            row_updates = []  # (sched, new_penalty_paid, is_real, overpaid)
            for sched in rows:
                overpaid = sched.penalty_paid - sched.penalty_due
                if overpaid <= TOLERANCE:
                    continue

                # Cap what's treated as "real" at the amount an allocation actually
                # confirms — a row can be part genuine payment, part stale corruption
                # stacked on top (LN-907: penalty_paid=831.44, allocation only backs
                # 200.29). Moving the unconfirmed remainder to principal would launder
                # unbacked figures as real money, so only the confirmed slice moves;
                # any excess above it gets the STALE row's treatment (discarded, not
                # redistributed).
                alloc_total = LoanRepaymentAllocation.objects.filter(
                    schedule=sched, penalty_applied__gt=0,
                ).aggregate(total=Sum('penalty_applied'))['total'] or Decimal('0.00')
                is_real = alloc_total > 0
                real_amount = min(overpaid, alloc_total)
                row_updates.append((sched, sched.penalty_due, is_real, overpaid))
                if is_real:
                    real_total += real_amount

            if not row_updates:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            new_outstanding_principal = loan.outstanding_principal - real_total
            if real_total > 0 and new_outstanding_principal < -TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — reallocating {real_total:,.2f} real '
                    f'stranded penalty to principal would push outstanding_principal negative '
                    f'({loan.outstanding_principal:,.2f} -> {new_outstanding_principal:,.2f}).'
                ))
                return 'needs_review'

            real_count = sum(1 for *_, is_real, _ in row_updates if is_real)
            stale_count = len(row_updates) - real_count
            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  {real_count} real row(s) '
                f'({real_total:,.2f} -> principal), {stale_count} stale row(s) capped'
            )
            if real_total > 0:
                self.stdout.write(
                    f'    principal_paid {loan.principal_paid:,.2f} -> {loan.principal_paid + real_total:,.2f}  '
                    f'outstanding_principal {loan.outstanding_principal:,.2f} -> {new_outstanding_principal:,.2f}  '
                    f'penalties_paid {loan.penalties_paid:,.2f} -> {loan.penalties_paid - real_total:,.2f}'
                )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for sched, new_penalty_paid, is_real, overpaid in row_updates:
                sched.penalty_paid = new_penalty_paid
                sched.save(update_fields=['penalty_paid', 'updated_at'])

            if real_total > 0:
                loan.principal_paid += real_total
                loan.outstanding_principal = new_outstanding_principal
                loan.penalties_paid -= real_total
                loan.save(update_fields=[
                    'principal_paid', 'outstanding_principal', 'penalties_paid', 'updated_at',
                ])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=real_total,
                description=(
                    f'Corrected stranded penalty overpayment — {loan_number}: {real_count} real '
                    f'row(s) reallocated {real_total:,.2f} to principal, {stale_count} stale row(s) '
                    'capped down (no real money — corrupted penalty_paid)'
                ),
                extra={
                    'loan_number': loan_number,
                    'real_rows': real_count,
                    'stale_rows': stale_count,
                    'real_total_reallocated': str(real_total),
                    'source_command': 'correct_stranded_penalty_overpayment',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
