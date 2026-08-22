"""
Management command: correct_penalty_after_payoff_unclosed_schedule

Corrects a distinct bug found among the paid_off-but-nonzero-GL cohort: 7
loans (LN-1072, LN-768, LN-765, LN-758, LN-747, LN-738, LN-645) were
genuinely paid off in full — real loan_repay events, outstanding_principal
already 0.00 — but their individual LoanRepaymentSchedule rows were never
marked closed when the loan settled (still sitting at 'overdue'/'partial'
instead of 'paid'/'restructured'). Since update_loan_status.py's daily
penalty job operates on schedule-ROW status (status='overdue'), not the
loan's own paid_off flag, it kept assessing fresh penalty against
installments that were actually already satisfied — and, being unaware the
loan was closed, correct_penalty_not_capped_at_payoff's own payoff-capping
(which caps at sched.payment_date only when status=='paid') never
triggered either, since these rows were never marked 'paid' in the first
place. Real LNPEN journal entries got posted against loans that owed
nothing more.

For each affected loan:
  1. Reverses EVERY currently-standing LNPEN transaction for the loan via
     Transaction.reverse() (the proper audited path), found via
     FinancialAuditLog(LOAN_PENALTY_ACCRUAL) lookup — same mechanism as
     correct_penalty_compounding_bug and correct_penalty_not_capped_at_payoff.
  2. Marks every non-'paid'/'restructured' schedule row 'restructured' and
     zeros its due/paid fields — same closure pattern already validated on
     52 other paid_off loans earlier in this cleanup (leftover schedule
     rows never marked accordingly after the loan actually closed).
  3. Sets loan.outstanding_penalties = 0.00 — nothing is legitimately owed
     on a loan that's genuinely paid off.
  4. Logs one FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan.

Scope: --loan or --loans only (not --batch) — this is a narrow, named
cohort of 7 specific loans, not a generic sweep; running it against an
arbitrary loan would incorrectly close schedule rows that are still
legitimately open. The command still requires status='paid_off' and
outstanding_principal==0 as a safety gate regardless of which loan is
named, refusing (needs_review) if either doesn't hold.

No change to outstanding_principal/interest/fees — already correct on
every one of these loans (0.00, independently GL-verified).

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Refuses (needs_review) any named loan that isn't status='paid_off'
    with outstanding_principal==0 — this command only closes out
    already-genuinely-settled loans, never an open one.
  - Each loan processed in its own atomic block with a savepoint.

Usage:
    python manage.py correct_penalty_after_payoff_unclosed_schedule --loans "LN-1072,LN-768"   # dry-run
    python manage.py correct_penalty_after_payoff_unclosed_schedule --loans "LN-1072,LN-768" --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

TOLERANCE = Decimal('0.01')
REVERSAL_REASON = (
    'Penalty accrued after the loan was already genuinely paid off — the individual schedule '
    'row was never marked closed when the loan settled, so the daily penalty job kept assessing '
    'against it. See correct_penalty_after_payoff_unclosed_schedule.'
)


class Command(BaseCommand):
    help = (
        'Corrects paid_off loans whose schedule rows were never closed out, causing the daily '
        'penalty job to keep assessing against already-settled installments. Reverses standing '
        'LNPEN transactions, closes the leftover rows, zeros outstanding_penalties.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
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
        from transactions.models import Transaction

        with db_transaction.atomic():
            sid = db_transaction.savepoint()
            try:
                loan = LoanAccount.all_objects.select_for_update().get(loan_number=loan_number)
            except LoanAccount.DoesNotExist:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.ERROR(f'[{loan_number}] not found.'))
                return 'needs_review'

            if loan.status != 'paid_off' or abs(loan.outstanding_principal) > TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING(
                    f'[{loan_number}] needs manual review — not a genuinely-settled paid_off loan '
                    f'(status={loan.status}, outstanding_principal={loan.outstanding_principal:,.2f}). Refusing.'
                ))
                return 'needs_review'

            rows = list(
                loan.repayment_schedule.select_for_update()
                .exclude(status__in=['paid', 'restructured'])
                .order_by('due_date')
            )

            journal_ids = list(
                FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                    extra__loan_number=loan_number,
                ).values_list('extra__journal_entry_id', flat=True)
            )
            existing_txns = list(
                Transaction.all_objects.filter(
                    pk__in=[j for j in journal_ids if j],
                    series__code='LNPEN',
                    is_reversed=False,
                    is_reversal=False,
                ).order_by('date', 'id')
            ) if journal_ids else []
            reversed_total = sum((t.get_total_amount() for t in existing_txns), Decimal('0.00'))

            if not rows and not existing_txns and abs(loan.outstanding_penalties) <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  closing {len(rows)} leftover schedule row(s)  '
                f'reversing {len(existing_txns)} LNPEN txn(s) totalling {reversed_total:,.2f}  '
                f'outstanding_penalties {loan.outstanding_penalties:,.2f} -> 0.00'
            )
            for r in rows:
                self.stdout.write(f'    #{r.installment_number} due={r.due_date} status={r.status} -> restructured')

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for txn in existing_txns:
                txn.reverse(user=None, reason=REVERSAL_REASON)

            for r in rows:
                r.status = 'restructured'
                r.principal_due = Decimal('0.00')
                r.interest_due = Decimal('0.00')
                r.fees_due = Decimal('0.00')
                r.penalty_due = Decimal('0.00')
                r.total_due = Decimal('0.00')
                r.save(update_fields=[
                    'status', 'principal_due', 'interest_due', 'fees_due',
                    'penalty_due', 'total_due', 'updated_at',
                ])

            old_penalties = loan.outstanding_penalties
            loan.outstanding_penalties = Decimal('0.00')
            loan.save(update_fields=['outstanding_penalties', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=-old_penalties,
                description=(
                    f'Closed leftover schedule rows and reversed post-payoff penalty — {loan_number}: '
                    f'{len(rows)} row(s) marked restructured, reversed {len(existing_txns)} LNPEN '
                    f'transaction(s) totalling {reversed_total:,.2f}, outstanding_penalties '
                    f'{old_penalties:,.2f} -> 0.00. Loan was already genuinely paid off '
                    f'(outstanding_principal=0.00) but schedule rows were never closed, so the daily '
                    f'penalty job kept assessing against already-settled installments.'
                ),
                extra={
                    'loan_number': loan_number,
                    'rows_closed': len(rows),
                    'reversed_count': len(existing_txns),
                    'reversed_total': str(reversed_total),
                    'old_outstanding_penalties': str(old_penalties),
                    'source_command': 'correct_penalty_after_payoff_unclosed_schedule',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
