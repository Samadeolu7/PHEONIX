"""
Management command: correct_penalty_not_capped_at_payoff

Corrects the bug found via audit_penalty_not_capped_at_payoff and traced in
full on LN-571: a loan paid off in full on 16 Jul 2026 (verified real
repayment, LNPMT-20260716-1046) had penalty piled back onto it afterward —
first via a "penalty income reclass" misfire (separate bug, see
audit_penalty_income_reclass_legitimacy / reverse_penalty_income_reclass_batch),
then a "backlog catch-up", then finally a "cutover-corrected" accrual
(13 Aug 2026) that posted 69,416.43 more on an already-closed debt. Total
confirmed: 124 legacy-import loans, 1,828,451.01 in phantom penalty across
the book (audit run 2026-08-16).

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

For each affected loan, this ACTUALLY REVERSES every currently-standing
LNPEN-series (Loan Penalty Accrual) transaction — found via
FinancialAuditLog(LOAN_PENALTY_ACCRUAL), the same lookup reverse_legacy_
loan_penalty_accruals already uses — via Transaction.reverse(), the proper
audited mechanism (linked opposite entry, original marked is_reversed, not a
raw delete or a separate offsetting "adjustment" line). It does not matter
which of the several posting paths produced any given entry; every one still
standing against this loan gets reversed. Only after every prior entry is
reversed does it repost ONE fresh entry for the correctly recomputed total
(if anything is genuinely still owed) — so the ledger reads as "here's
everything that was wrong, undone; here's what's actually true," the same
pattern already used successfully by reverse_legacy_loan_penalty_accruals
and reverse_penalty_income_reclass_batch elsewhere in this codebase.

For each affected loan:
  1. Recomputes every non-restructured schedule row's correct penalty_due,
     using each row's own real resolution date (payment_date if status=
     'paid', today otherwise) — this is the actual fix; everything else is
     just correctly reflecting it in the schedule and GL.
  2. Sums to `correct_total`; diff against loan.outstanding_penalties
     (`overcharge = current - correct_total`). Only loans overcharged
     (overcharge > tolerance) are touched — a loan where recompute finds
     MORE owed than currently recorded is flagged for manual review instead
     (unexpected direction; not what this bug produces).
  3. Reverses every currently-standing LNPEN transaction for the loan.
  4. Writes each schedule row's corrected penalty_due (only rows that
     actually change).
  5. Sets loan.outstanding_penalties = correct_total.
  6. If correct_total > 0 and product.penalty_income_account is configured,
     posts ONE fresh LNPEN entry (Dr Loan Receivable / Cr Penalty Income)
     for correct_total — the true, cutover-and-payoff-aware amount. If
     correct_total is 0, nothing is reposted — the loan simply owes no
     penalty.
  7. Logs one FinancialAuditLog(LOAN_BALANCE_CORRECTION) per loan recording
     what was reversed and what (if anything) was reposted.

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
REVERSAL_REASON = (
    'Penalty not capped at its real resolution date — recomputed using the row\'s own '
    'payment_date (if settled) or today (if still open) instead of blindly using today for '
    'every row. See audit_penalty_not_capped_at_payoff for the full trace.'
)


class Command(BaseCommand):
    help = (
        'Correct legacy-import loans carrying penalty_due that was never capped at its real '
        'resolution date (paid rows keep accruing as if still open). Reverses every standing '
        'LNPEN transaction for the loan and reposts one fresh, correctly-computed entry.'
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

            # Every LNPEN transaction currently standing against this loan — regardless of
            # which script posted it (daily cron, backlog catch-up, cutover-aware recompute)
            # — gets reversed. Same lookup reverse_legacy_loan_penalty_accruals already uses.
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
            reversed_total = sum(
                (t.get_total_amount() for t in existing_txns), Decimal('0.00')
            )

            self.stdout.write(
                f'[{loan_number}] pk={loan.pk}  outstanding_penalties '
                f'{loan.outstanding_penalties:,.2f} -> {correct_total:,.2f}  '
                f'(reverse {len(existing_txns)} txn(s) totalling {reversed_total:,.2f}; '
                f'repost {correct_total:,.2f})  {len(row_updates)} row(s) updated'
            )

            if not apply_changes:
                db_transaction.savepoint_rollback(sid)
                return 'dry_run_ok'

            for txn in existing_txns:
                txn.reverse(user=None, reason=REVERSAL_REASON)

            for sched, correct_penalty in row_updates:
                sched.penalty_due = correct_penalty
                sched.save(update_fields=['penalty_due', 'updated_at'])

            loan.outstanding_penalties = correct_total
            loan.save(update_fields=['outstanding_penalties', 'updated_at'])

            penalty_account = loan.product.penalty_income_account
            journal_ref = None
            if correct_total > 0 and penalty_account:
                series, _ = TransactionSeries.objects.get_or_create(
                    code='LNPEN',
                    defaults={'description': 'Loan Penalty Accrual'},
                )
                journal = Transaction.objects.create(
                    series=series,
                    date=today,
                    description=(
                        f'Loan penalty accrual (payoff-capped, corrected) — {loan_number}'
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    tenant=loan.tenant,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=loan.account,
                    side=TransactionEntry.DEBIT, amount=correct_total,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=penalty_account,
                    side=TransactionEntry.CREDIT, amount=correct_total,
                )
                journal.post()
                journal_ref = journal.reference_number
                loan.penalty_accrual_active = True
                loan.save(update_fields=['penalty_accrual_active', 'updated_at'])

            log_financial_event(
                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                acted_by=None,
                record_type='LoanAccount',
                record_id=str(loan.pk),
                amount=-overcharge,
                description=(
                    f'Corrected penalty not capped at payoff — {loan_number}: reversed '
                    f'{len(existing_txns)} transaction(s) totalling {reversed_total:,.2f}, '
                    f'reposted {correct_total:,.2f} ({len(row_updates)} schedule row(s) recomputed '
                    'at their real resolution date)'
                ),
                extra={
                    'loan_number': loan_number,
                    'reversed_count': len(existing_txns),
                    'reversed_total': str(reversed_total),
                    'reposted_total': str(correct_total),
                    'rows_updated': len(row_updates),
                    'journal_entry_ref': journal_ref,
                    'source_command': 'correct_penalty_not_capped_at_payoff',
                },
            )

            db_transaction.savepoint_commit(sid)
            self.stdout.write(self.style.SUCCESS(f'  [{loan_number}] Applied.'))
            return 'applied'
