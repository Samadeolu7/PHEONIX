"""
Management command: correct_penalty_not_capped_at_payoff

Corrects the bug found via audit_penalty_not_capped_at_payoff and traced in
full on LN-571: a loan paid off in full on 16 Jul 2026 (verified real
repayment, LNPMT-20260716-1046) had penalty piled back onto it afterward —
first via a "penalty income reclass" misfire, then a "backlog catch-up", then
finally a "cutover-corrected" accrual (13 Aug 2026) that posted 69,416.43
more on an already-closed debt. Total confirmed: 124 legacy-import loans,
1,828,451.01 in phantom penalty across the book (audit run 2026-08-16).

Root cause (see audit_penalty_not_capped_at_payoff's docstring for the full
trace): LoanRepaymentSchedule.penalty_due gets set by several different
paths (import_legacy_data.py's raw legacy seed, update_loan_status's daily
cron, accrue_outstanding_penalty_backlog's one-time catch-up, reverse_
legacy_loan_penalty_accruals's cutover-aware recompute) but NONE of them cap
the calculation at a row's real resolution date once it stops being
'overdue' — every one uses `today` (or trusts a stale stored value) even for
installments settled months ago. LoanProduct.effective_days_late() was
built to support exactly this (`as_of` defaults to today; "pass a specific
date (e.g. payment_date) to recompute what days_late should have been at
some point in the past") — no caller ever does.

This command does NOT attempt to individually re-reverse every historical
LNPEN/PENRC entry per loan (LN-571 alone has three overlapping correction
attempts already layered on top of each other — re-litigating that history
entry-by-entry is fragile). Instead, matching the same philosophy already
proven safe in this codebase by correct_frontloaded_interest_allocation.py:
recompute what outstanding_penalties SHOULD be right now (sum of every
schedule row's penalty_due, each capped at its own real resolution date —
payment_date if status='paid', today otherwise), diff that against the
current outstanding_penalties, and post ONE clean net correction for the
difference. Whatever tangled history produced today's wrong number, this
corrects the end state directly and auditably.

For each affected loan:
  1. Recomputes every non-restructured schedule row's correct penalty_due.
  2. Sums to `correct_total`; diff against loan.outstanding_penalties
     (`overcharge = current - correct_total`). Only loans overcharged
     (overcharge > tolerance) are touched — a loan where recompute finds
     MORE owed than currently recorded is flagged for manual review instead
     (unexpected direction; not what this bug produces).
  3. Writes each row's corrected penalty_due (only rows that actually
     change).
  4. Sets loan.outstanding_penalties = correct_total.
  5. If product.penalty_income_account is configured, posts one correcting
     journal (series LNADJ, matching the existing "Loan Correcting
     Adjustments" series used for the same class of fix):
         Dr. Penalty Income (product.penalty_income_account)
         Cr. Loan Receivable (loan.account)
     for `overcharge` — reversing the fictitious income and receivable in
     one auditable entry. If no penalty_income_account is configured, no GL
     entry is posted (nothing was ever recognized on the books for this
     loan's penalty in the first place — cash-basis loans), only the
     schedule/aggregate fields are corrected.
  6. Logs one FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan is processed in its own atomic block with a savepoint.
  - --loan for a single loan, --batch for every affected loan in one run
    (one loan's failure doesn't block the rest).

Usage:
    python manage.py correct_penalty_not_capped_at_payoff --loan LN-571      # dry-run
    python manage.py correct_penalty_not_capped_at_payoff --loan LN-571 --apply
    python manage.py correct_penalty_not_capped_at_payoff --batch            # dry-run, all
    python manage.py correct_penalty_not_capped_at_payoff --batch --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone

TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Correct legacy-import loans carrying penalty_due that was never capped at its real '
        'resolution date (paid rows keep accruing as if still open). Resyncs schedule rows and '
        'outstanding_penalties to the correctly recomputed total; posts one net correcting '
        'journal per loan where a penalty_income_account is configured.'
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
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        today = timezone.localdate()
        loan_number = loan.loan_number

        with db_transaction.atomic():
            sid = db_transaction.savepoint()

            loan = type(loan).all_objects.select_for_update().get(pk=loan.pk)
            rows = list(
                loan.repayment_schedule.select_for_update()
                .exclude(status='restructured')
                .filter(penalty_due__gt=0)
                .order_by('due_date')
            )

            if not rows:
                db_transaction.savepoint_rollback(sid)
                return 'unaffected'

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

            overcharge = loan.outstanding_penalties - correct_total

            if overcharge <= TOLERANCE:
                db_transaction.savepoint_rollback(sid)
                if overcharge < -TOLERANCE:
                    self.stdout.write(self.style.WARNING(
                        f'[{loan_number}] needs manual review — recompute finds MORE penalty owed '
                        f'({correct_total:,.2f}) than currently recorded ({loan.outstanding_penalties:,.2f}), '
                        'the opposite of this bug\'s usual direction.'
                    ))
                    return 'needs_review'
                return 'unaffected'

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_penalties '
                f'{loan.outstanding_penalties:,.2f} -> {correct_total:,.2f}  '
                f'(overcharge removed: {overcharge:,.2f})  {len(row_updates)} row(s) updated'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for sched, correct_penalty in row_updates:
                sched.penalty_due = correct_penalty
                sched.save(update_fields=['penalty_due', 'updated_at'])

            loan.outstanding_penalties = correct_total
            loan.save(update_fields=['outstanding_penalties', 'updated_at'])

            penalty_account = loan.product.penalty_income_account
            journal_ref = None
            if penalty_account:
                series, _ = TransactionSeries.objects.get_or_create(
                    code='LNADJ',
                    defaults={'description': 'Loan Correcting Adjustments'},
                )
                journal = Transaction.objects.create(
                    series=series,
                    date=today,
                    description=(
                        f'Penalty not capped at payoff — correction – {loan_number}'
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    tenant=loan.tenant,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=penalty_account,
                    side=TransactionEntry.DEBIT, amount=overcharge,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=loan.account,
                    side=TransactionEntry.CREDIT, amount=overcharge,
                )
                journal.post()
                journal_ref = journal.reference_number

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=-overcharge,
                description=(
                    f'Corrected penalty not capped at payoff — {loan_number} '
                    f'(overcharge {overcharge:,.2f} removed, {len(row_updates)} schedule row(s) '
                    'recomputed at their real resolution date)'
                ),
                extra={
                    'loan_number': loan_number,
                    'overcharge_removed': str(overcharge),
                    'corrected_outstanding_penalties': str(correct_total),
                    'rows_updated': len(row_updates),
                    'journal_entry_ref': journal_ref,
                    'source_command': 'correct_penalty_not_capped_at_payoff',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
