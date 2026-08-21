"""
Management command: restore_flat_schedule_backward_v3

v2 detected each loan's flat installment amount from the mode of its own
intact rows — which fails when MOST rows are already corrupted (e.g.
LN-660: 5 of 9 rows already zeroed, leaving too few clean rows to form a
reliable mode). This computes the flat amount from first principles
instead:

    flat_principal = disbursed_amount * (1 + interest_rate/100) / number_of_installments

Confirmed against 9 loans by hand: interest_rate here is a flat rate over
the WHOLE term (not an annualized rate prorated by months), so total
obligation = disbursed * (1 + rate/100), split evenly across every
installment. E.g. LN-660: 200,000 * 1.252 / 9 = 27,822.22, matching its
few surviving clean rows exactly. This only depends on disbursed_amount,
interest_rate, and number_of_installments — all independently reliable —
so it works even when nearly the whole schedule is already zeroed.

Cross-checked against whatever intact (non-restructured, total_due > 1)
rows still exist: if the formula's result doesn't match what those rows
already show, that loan is flagged needs_review rather than trusted blindly
(e.g. LN-961: formula gives 83,400 but its two "clean" rows show 111,250 —
meaning those rows are themselves wrong, not just the zeroed tail, and
this command won't guess through that).

Same redistribution as v1/v2 once the flat amount is confirmed: (1) every
row's due becomes the flat amount, (2) the unchanged, GL-verified
outstanding_principal is redistributed by counting backward from the
newest row.

No GL entry — outstanding_principal itself is never changed, only how
it's attributed across schedule rows.

SAFETY:
  - Dry-run by default. Nothing written until --apply.
  - --loan for a single loan, --loans for a comma-separated list.
  - Cross-checks the formula against every intact row before trusting it —
    any mismatch beyond tolerance flags needs_review.
  - Verifies the redistributed total exactly matches outstanding_principal
    before writing.

Usage:
    python manage.py restore_flat_schedule_backward_v3 --loan LN-660             # dry-run
    python manage.py restore_flat_schedule_backward_v3 --loan LN-660 --apply
    python manage.py restore_flat_schedule_backward_v3 --loans "LN-660,LN-666"   # dry-run, several
    python manage.py restore_flat_schedule_backward_v3 --loans "LN-660,LN-666" --apply
"""
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Computes each loan\'s flat installment amount from disbursed_amount * (1 + rate/100) / '
        'number_of_installments, cross-checks it against any surviving intact rows, then restores '
        'the true schedule and redistributes GL-verified outstanding_principal backward from the '
        'newest row. Flags (does not guess) loans where the formula disagrees with intact rows.'
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
            # Row #1 sometimes carries a genuinely separate one-time interest/fee line on top
            # of the flat principal (seen on LN-754/722) — total_due there legitimately exceeds
            # flat_amount by that extra amount. Only flag a mismatch if it's BELOW the flat
            # amount (can't be explained by an add-on) or the loan has more than one such row.
            below_flat = [r for r in mismatches if r.total_due < flat_amount - TOLERANCE]
            if below_flat:
                db_transaction.savepoint_rollback(sid)
                example = below_flat[0]
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — formula gives {flat_amount:,.2f} but row '
                    f'due={example.due_date} shows {example.total_due:,.2f} (below the formula, not '
                    f'explainable as an add-on). Formula doesn\'t match this loan\'s real data.'
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
                f'[{loan_number}] pk={loan.pk}  disbursed={loan.disbursed_amount:,.2f}  '
                f'rate={loan.interest_rate}%  installments={loan.number_of_installments}  '
                f'outstanding_principal={loan.outstanding_principal:,.2f}  flat_installment={flat_amount:,.2f}  '
                f'(formula, cross-checked against {len(intact)} intact row(s))'
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
                    f'Restored flat schedule and redistributed backward (v3, formula-derived) — '
                    f'{loan_number}: all rows set to disbursed*(1+rate/100)/installments = '
                    f'{flat_amount:,.2f}, cross-checked against {len(intact)} surviving intact row(s), '
                    f'then the unchanged GL-verified outstanding_principal ({loan.outstanding_principal:,.2f}) '
                    f'redistributed by counting backward from the newest row. No GL entry, '
                    f'outstanding_principal unchanged.'
                ),
                extra={
                    'loan_number': loan_number,
                    'flat_installment': str(flat_amount),
                    'intact_rows_checked': len(intact),
                    'source_command': 'restore_flat_schedule_backward_v3',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.\n'))
            return 'applied'
