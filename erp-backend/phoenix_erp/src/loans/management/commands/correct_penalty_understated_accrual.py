"""
Management command: correct_penalty_understated_accrual

Mirror-image of correct_penalty_not_capped_at_payoff. Found on LN-722
(2026-08-17): loan.outstanding_penalties=8,821.90, but its schedule shows
6 genuinely unpaid installments (188 days in arrears, real default — Total
Paid is literally "—" on each of them) correctly totalling 12,833.01 in
currently-owed penalty, computed via the same cutover-aware, resolution-
date-capped formula used throughout today's investigation (verified row by
row against the real ledger before writing this: e.g. row due 10 Aug 2026,
7 days late, 5-day grace period, 41,733.33 x 5% x 1 period = 2,086.67,
exactly matching what the schedule showed). correct_penalty_not_capped_at_
payoff deliberately skips this direction (recompute finds MORE than
recorded) and flags it 'needs_review' — because everything else built today
was about REMOVING fabricated debt. This is the other half: when a loan
with real, unpaid, overdue installments has an aggregate that simply never
caught up to what the schedule correctly says is owed, that's not an
anomaly to route around, it's legitimate penalty that hasn't been
recognized yet — and should be.

IMPORTANT — unlike every other fix built today, this INCREASES what a real
client owes. Confirm the loan's schedule genuinely reflects real unpaid
overdue installments (not a data artifact) before trusting this at scale —
LN-722 was hand-verified against its real ledger/schedule first.

For each affected loan:
  1. Recomputes every non-restructured row's correct penalty_due — same
     formula as correct_penalty_not_capped_at_payoff (payment_date as
     `as_of` if the row is paid, else today; cutover-aware days_late).
  2. Sums to correct_total. Only acts when correct_total exceeds
     loan.outstanding_penalties beyond tolerance — the understated
     direction, the opposite of what correct_penalty_not_capped_at_payoff
     handles. A loan needing correction in the OTHER direction is left
     alone here (that tool's job, not this one's).
  3. Updates every row whose recomputed penalty_due changed.
  4. Sets loan.outstanding_penalties = correct_total, penalty_accrual_active
     = True.
  5. If product.penalty_income_account is configured, posts ONE fresh
     journal entry (series LNPEN, same series the ongoing daily cron uses)
     for the shortfall (correct_total - old outstanding_penalties):
         Dr. Loan Receivable (loan.account)
         Cr. Penalty Income  (product.penalty_income_account)
     No GL entry if penalty_income_account is unset — matches
     update_loan_status.py's own product-config-driven behavior (cash-basis
     loans recognize penalty only when actually paid).
  6. Logs one FinancialAuditLog(LOAN_PENALTY_ACCRUAL) per loan.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint.
  - --loan for a single loan, --batch for every affected legacy_import loan.

Usage:
    python manage.py correct_penalty_understated_accrual --loan LN-722     # dry-run
    python manage.py correct_penalty_understated_accrual --loan LN-722 --apply
    python manage.py correct_penalty_understated_accrual --batch           # dry-run, all
    python manage.py correct_penalty_understated_accrual --batch --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Recognize legitimate, currently-owed penalty that the loan aggregate never caught up '
        'to (the schedule\'s own fresh recompute finds MORE than loan.outstanding_penalties '
        'records). Posts a real accrual — this INCREASES what the client owes.'
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
        ).select_related('product', 'account').order_by('loan_number')
        if loan_number:
            loans_qs = loans_qs.filter(loan_number=loan_number)
            if not loans_qs.exists():
                raise CommandError(f'Loan {loan_number} not found (or not origin=legacy_import).')

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
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        today = timezone.localdate()
        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)
            rows = list(
                loan.repayment_schedule.select_for_update()
                .exclude(status='restructured')
                .order_by('due_date')
            )

            row_updates = []
            correct_total = Decimal('0.00')
            for sched in rows:
                as_of = sched.payment_date if sched.status == 'paid' and sched.payment_date else today
                days_late = loan.product.effective_days_late(sched.due_date, as_of)
                base_amount = sched.total_due - sched.total_paid
                correct_penalty = loan.product.calculate_late_penalty(
                    base_amount, days_late, loan.repayment_frequency,
                )
                correct_total += correct_penalty
                if abs(correct_penalty - sched.penalty_due) > TOLERANCE:
                    row_updates.append((sched, correct_penalty))

            shortfall = correct_total - loan.outstanding_penalties

            if shortfall <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'  # not understated — correct_penalty_not_capped_at_payoff's job, or already correct

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_penalties '
                f'{loan.outstanding_penalties:,.2f} -> {correct_total:,.2f}  '
                f'(shortfall recognized: {shortfall:,.2f})  {len(row_updates)} row(s) updated'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for sched, correct_penalty in row_updates:
                sched.penalty_due = correct_penalty
                sched.save(update_fields=['penalty_due', 'updated_at'])

            loan.outstanding_penalties = correct_total
            loan.penalty_accrual_active = True
            loan.save(update_fields=['outstanding_penalties', 'penalty_accrual_active', 'updated_at'])

            penalty_account = loan.product.penalty_income_account
            journal_ref = None
            if penalty_account:
                series, _ = TransactionSeries.objects.get_or_create(
                    code='LNPEN',
                    defaults={'description': 'Loan Penalty Accrual'},
                )
                journal = Transaction.objects.create(
                    series=series,
                    date=today,
                    description=(
                        f'Loan penalty accrual (understated catch-up) — {loan_number}'
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    tenant=loan.tenant,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=loan.account,
                    side=TransactionEntry.DEBIT, amount=shortfall,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=penalty_account,
                    side=TransactionEntry.CREDIT, amount=shortfall,
                )
                journal.post()
                journal_ref = journal.reference_number

            log_financial_event(
                FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=shortfall,
                description=(
                    f'Recognized understated penalty — {loan_number}: schedule\'s fresh recompute '
                    f'found {shortfall:,.2f} more legitimately owed than recorded '
                    f'({len(row_updates)} schedule row(s) updated)'
                ),
                extra={
                    'loan_number': loan_number,
                    'shortfall_recognized': str(shortfall),
                    'corrected_outstanding_penalties': str(correct_total),
                    'rows_updated': len(row_updates),
                    'journal_entry_ref': journal_ref,
                    'source_command': 'correct_penalty_understated_accrual',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
