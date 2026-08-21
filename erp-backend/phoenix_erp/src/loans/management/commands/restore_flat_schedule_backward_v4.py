"""
Management command: restore_flat_schedule_backward_v4

Same formula-derived flat-restore + backward-count redistribution as v3
(disbursed_amount * (1 + interest_rate/100) / number_of_installments,
cross-checked against surviving intact rows), for the remaining large-
structural monthly legacy loans (Step 3 of the book-wide cleanup).

v3 left a real gap: it only touches principal (due/paid), so once a row's
status flips to 'paid' its penalty_due silently drops out of retire_stale_
legacy_schedule_rows's own verification (which only sums penalty from
non-'paid' rows), even though loan.outstanding_penalties still correctly
holds the real amount. This was caught only via a separate re-verification
pass and fixed with manual follow-up scripts on the earlier batch. v4 does
both in the same transaction: after redistributing principal, it also
checks the loan's real outstanding_penalties against what the corrected
schedule's still-open rows would show, and if short, adds the shortfall to
the earliest still-open row's penalty_due/total_due — mirroring exactly
what the manual follow-up did for the earlier batch.

No GL entry — outstanding_principal and outstanding_penalties themselves
are never changed, only how they're attributed across schedule rows.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - --loan for a single loan, --loans for a comma-separated list.
  - Cross-checks the formula against every intact row before trusting it —
    any below-flat mismatch flags needs_review (same guard as v3).
  - Verifies the redistributed principal total exactly matches
    outstanding_principal, and the post-correction open-row penalty total
    exactly matches outstanding_penalties, before writing.

Usage:
    python manage.py restore_flat_schedule_backward_v4 --loan LN-959             # dry-run
    python manage.py restore_flat_schedule_backward_v4 --loan LN-959 --apply
    python manage.py restore_flat_schedule_backward_v4 --loans "LN-959,LN-856"   # dry-run, several
    python manage.py restore_flat_schedule_backward_v4 --loans "LN-959,LN-856" --apply
"""
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Computes each loan\'s flat installment amount from disbursed_amount * (1 + rate/100) / '
        'number_of_installments, cross-checks it against any surviving intact rows, restores the '
        'true schedule, redistributes GL-verified outstanding_principal backward from the newest '
        'row, AND corrects any resulting penalty-component shortfall in the same pass.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only process a single loan by loan_number.')
        parser.add_argument('--loans', dest='loan_list', default=None,
                             help='Comma-separated list of loan numbers.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')
        parser.add_argument('--force', action='store_true',
                             help='Bypass the below-flat mismatch guard for a single --loan, after manual '
                                  'confirmation the mismatch is the known retire_stale_legacy_schedule_rows '
                                  'capped-row artifact and not a genuine data problem. Only valid with --loan '
                                  '(a single loan) — refused with --loans.')

    def handle(self, *args, **options):
        loan_number = options['loan_number']
        loan_list = options['loan_list']
        apply_changes = options['apply']
        force = options['force']

        if bool(loan_number) == bool(loan_list):
            raise CommandError('Pass exactly one of --loan <number> or --loans "A,B,C".')
        if force and not loan_number:
            raise CommandError('--force is only valid with a single --loan, not --loans.')

        loan_numbers = [loan_number] if loan_number else [s.strip() for s in loan_list.split(',') if s.strip()]
        today = timezone.localdate()

        applied, dry_ran, needs_review = 0, 0, 0
        for ln in loan_numbers:
            result = self._process_loan(ln, apply_changes, today, force)
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

    def _process_loan(self, loan_number, apply_changes, today, force=False):
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

            if len(rows) != loan.number_of_installments or loan.number_of_installments == 0:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — schedule row count ({len(rows)}) does not '
                    f'match number_of_installments ({loan.number_of_installments}).'
                ))
                return 'needs_review'

            if loan.interest_rate is None:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(f'[{loan_number}] needs manual review — no interest_rate on loan.'))
                return 'needs_review'

            total_obligation = loan.disbursed_amount * (Decimal('1') + loan.interest_rate / Decimal('100'))
            flat_amount = (total_obligation / loan.number_of_installments).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            intact = [r for r in rows if r.status != 'restructured' and r.total_due > 1]
            mismatches = [r for r in intact if abs(r.total_due - flat_amount) > TOLERANCE]
            below_flat = [r for r in mismatches if r.total_due < flat_amount - TOLERANCE]
            if below_flat and not force:
                db_transaction.savepoint_rollback(sid)
                example = below_flat[0]
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — formula gives {flat_amount:,.2f} but row '
                    f'due={example.due_date} shows {example.total_due:,.2f} (below the formula, not '
                    f'explainable as an add-on). Formula doesn\'t match this loan\'s real data. '
                    f'Re-run with --force if this is confirmed to be a retire_stale_legacy_schedule_rows '
                    f'capped-row artifact.'
                ))
                return 'needs_review'
            if below_flat and force:
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] --force: overriding below-flat mismatch on {len(below_flat)} row(s) '
                    f'(e.g. due={below_flat[0].due_date} shows {below_flat[0].total_due:,.2f} vs formula '
                    f'{flat_amount:,.2f}) — proceeding on the assumption this is a known capped-row artifact.'
                ))

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
                f'[{loan_number}] pk={loan.pk}  disbursed={loan.disbursed_amount:,.2f}  '
                f'rate={loan.interest_rate}%  installments={loan.number_of_installments}  '
                f'outstanding_principal={loan.outstanding_principal:,.2f}  flat_installment={flat_amount:,.2f}  '
                f'(formula, cross-checked against {len(intact)} intact row(s))'
            ))
            open_rows_after = []
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
                if new_status != 'paid':
                    open_rows_after.append(r)

            # Same-pass penalty reconciliation — the gap that had to be fixed
            # separately on the earlier batch. A row flipping to 'paid' here
            # drops out of retire_stale_legacy_schedule_rows's own penalty
            # verification (only non-'paid' rows count), even though
            # loan.outstanding_penalties (untouched by this command) still
            # correctly holds the real amount. Top up the earliest still-open
            # row so the schedule-side sum matches it exactly.
            open_penalty_after = sum((r.penalty_due - r.penalty_paid) for r in open_rows_after) or Decimal('0.00')
            penalty_shortfall = loan.outstanding_penalties - open_penalty_after
            penalty_note = ''
            if abs(penalty_shortfall) > TOLERANCE:
                if not open_rows_after:
                    db_transaction.savepoint_rollback(sid)
                    self.stdout.write(self.style.ERROR(
                        f'[{loan_number}] SAFETY CHECK FAILED — penalty shortfall ({penalty_shortfall:,.2f}) '
                        f'but every row is fully paid; no open row to carry it. Refusing.'
                    ))
                    return 'needs_review'
                earliest = open_rows_after[0]
                self.stdout.write(
                    f'    penalty shortfall {penalty_shortfall:,.2f} -> added to row '
                    f'#{earliest.installment_number} penalty_due'
                )
                penalty_note = (
                    f' Penalty shortfall of {penalty_shortfall:,.2f} (outstanding_penalties vs what the '
                    f'corrected open rows would otherwise show) added to row #{earliest.installment_number}\'s '
                    f'penalty_due/total_due so schedule-side penalty reconciles too.'
                )

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
                update_fields = [
                    'principal_due', 'total_due', 'interest_due', 'fees_due',
                    'principal_paid', 'total_paid', 'interest_paid', 'fees_paid',
                    'status', 'payment_date', 'updated_at',
                ]
                if abs(penalty_shortfall) > TOLERANCE and open_rows_after and r.pk == open_rows_after[0].pk:
                    r.penalty_due += penalty_shortfall
                    r.total_due += penalty_shortfall
                    update_fields += ['penalty_due']
                r.save(update_fields=update_fields)

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=0,
                description=(
                    f'Restored flat schedule and redistributed backward (v4, formula-derived) — '
                    f'{loan_number}: all rows set to disbursed*(1+rate/100)/installments = '
                    f'{flat_amount:,.2f}, cross-checked against {len(intact)} surviving intact row(s), '
                    f'then the unchanged GL-verified outstanding_principal ({loan.outstanding_principal:,.2f}) '
                    f'redistributed by counting backward from the newest row.{penalty_note} No GL entry, '
                    f'outstanding_principal/outstanding_penalties unchanged.'
                    + (f' Applied with --force: {len(below_flat)} row(s) below the formula amount were '
                       f'manually confirmed as the known retire_stale_legacy_schedule_rows capped-row '
                       f'artifact rather than genuine data mismatches.' if below_flat else '')
                ),
                extra={
                    'loan_number': loan_number,
                    'flat_installment': str(flat_amount),
                    'intact_rows_checked': len(intact),
                    'penalty_shortfall': str(penalty_shortfall),
                    'forced': bool(below_flat),
                    'source_command': 'restore_flat_schedule_backward_v4',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.\n'))
            return 'applied'
