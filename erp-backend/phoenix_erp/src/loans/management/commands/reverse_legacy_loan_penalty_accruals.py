"""
Management command: reverse_legacy_loan_penalty_accruals

Corrects (not just zeroes out) accrual-basis penalty GL entries for every
loan with origin=LEGACY_IMPORT, now that LoanProduct.PENALTY_CUTOVER_DATE
(2026-06-30) and LoanProduct.effective_days_late() exist to say exactly how
much of a legacy loan's penalty is legitimately post-go-live.

Root cause (see LoanProduct.effective_days_late() and its call sites for the
fix): import_legacy_data.py seeds LoanRepaymentSchedule.penalty_due directly
from the old system's own penalty_amount field at import
(clients/management/commands/import_legacy_data.py:1310). From the next time
update_loan_status's daily cron touched an overdue installment, it overwrote
that with a figure computed from the installment's ORIGINAL (pre-migration)
due_date — treating years of pre-go-live lateness as freshly chargeable under
this system's formula, every day. Every LNPEN entry ever posted against a
legacy loan (daily accrual, the 2026-08-12 backlog catch-up, and the
2026-08-13 over-accrual reversal) is built on that contaminated figure.

Per loan, this now:
  1. Reverses EVERY existing LNPEN transaction via Transaction.reverse() — the
     proper audited path (linked opposite transaction, original marked
     is_reversed, period-closure checked), not a hand-built entry. This
     brings the loan's LNPEN-driven GL contribution to exactly zero,
     regardless of how many entries or their signs.
  2. Recomputes penalty_due on every currently-overdue schedule row using
     calculate_late_penalty() with the now-cutover-aware days_late — i.e.
     exactly what tomorrow's daily cron would compute anyway, done now rather
     than waited on.
  3. Sums penalty_due across ALL the loan's schedule rows (recomputed
     overdue ones + whatever pending/partial/paid rows already had — those
     aren't touched by the daily cron either, so neither are they here),
     nets off LoanAccount.penalties_paid, and — if positive — posts ONE
     fresh, correct LNPEN accrual entry for exactly that amount, setting
     penalty_accrual_active back to True. If zero, penalty_accrual_active
     stays False (nothing currently owed via accrual on this loan).
  4. Updates LoanAccount.outstanding_penalties to match the same corrected
     total, so it isn't left holding the old, pre-cutover-fix running total.

Net effect: only the double-charged (pre-cutover) excess actually leaves the
books. Any legitimately post-go-live penalty is reversed and immediately
reposted at its correct amount, not discarded.

SAFETY:
  - Dry-run by default. Nothing is written until --apply.
  - Each loan's reverse + recompute + repost happens in one atomic
    transaction — a loan that fails partway (e.g. current month closed)
    is left completely untouched, not half-corrected.

Usage:
    python manage.py reverse_legacy_loan_penalty_accruals                # dry-run
    python manage.py reverse_legacy_loan_penalty_accruals --loan LN-342  # one loan
    python manage.py reverse_legacy_loan_penalty_accruals --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Reverse every LNPEN entry for legacy-imported loans and repost the correct amount '
        'using the cutover-aware formula. Dry-run by default; --apply executes it.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only process a single loan by loan_number.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually post the corrections. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        apply_changes = options['apply']
        today = timezone.localdate()

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
            origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
        ).select_related('product').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        series = None
        if apply_changes:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNPEN',
                defaults={'description': 'Loan Penalty Accrual'},
            )

        total_loans_touched = 0
        total_reversed = Decimal('0.00')
        total_reposted = Decimal('0.00')
        failures = []

        for loan in loans.iterator():
            journal_ids = list(
                FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                    extra__loan_number=loan.loan_number,
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

            # Recompute what penalty_due SHOULD be, using the fixed formula,
            # for every overdue row — same scope update_loan_status uses.
            overdue_rows = list(loan.repayment_schedule.filter(status='overdue'))
            corrected_by_row = {}
            for sched in overdue_rows:
                days_late = loan.product.effective_days_late(sched.due_date, today)
                base_amount = sched.total_due - sched.total_paid
                corrected_by_row[sched.pk] = loan.product.calculate_late_penalty(
                    base_amount, days_late, loan.repayment_frequency,
                )

            other_rows_penalty_due = loan.repayment_schedule.exclude(
                status='overdue'
            ).aggregate(total=Sum('penalty_due'))['total'] or Decimal('0.00')

            corrected_total_due = other_rows_penalty_due + sum(
                corrected_by_row.values(), Decimal('0.00')
            )
            correct_target = max(Decimal('0.00'), corrected_total_due - (loan.penalties_paid or Decimal('0.00')))

            reverse_total = Decimal('0.00')
            for txn in existing_txns:
                debit_total = sum(
                    (e.amount for e in txn.entries.filter(side=TransactionEntry.DEBIT)), Decimal('0.00')
                )
                reverse_total += debit_total

            if not existing_txns and correct_target <= 0:
                continue  # nothing posted, nothing owed — not this loan's problem

            total_loans_touched += 1
            total_reversed += reverse_total
            total_reposted += correct_target

            self.stdout.write(
                f"  {loan.loan_number:20s} reverse={reverse_total:>12,.2f} "
                f"({len(existing_txns)} txn(s))  repost_correct={correct_target:>12,.2f}  "
                f"net_change={(correct_target - reverse_total):>+12,.2f}"
            )

            if not apply_changes:
                continue

            try:
                with db_transaction.atomic():
                    for txn in existing_txns:
                        txn.reverse(
                            user=None,
                            reason=(
                                'Legacy-imported loan — penalty_due was computed from days_late '
                                'since the original (pre-migration) due_date. Reversing and reposting '
                                'at the cutover-aware (2026-06-30) corrected amount.'
                            ),
                        )

                    for sched in overdue_rows:
                        new_due = corrected_by_row[sched.pk]
                        if new_due != sched.penalty_due:
                            sched.penalty_due = new_due
                            sched.save(update_fields=['penalty_due', 'updated_at'])

                    loan.outstanding_penalties = correct_target

                    if correct_target > 0 and loan.product.penalty_income_account:
                        journal = Transaction.objects.create(
                            series=series,
                            date=today,
                            description=(
                                f'Loan penalty accrual (cutover-corrected) — {loan.loan_number}'
                            ),
                            owner=loan.owner,
                            branch=loan.branch,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal, account=loan.account,
                            side=TransactionEntry.DEBIT, amount=correct_target,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal, account=loan.product.penalty_income_account,
                            side=TransactionEntry.CREDIT, amount=correct_target,
                        )
                        journal.post()

                        log_financial_event(
                            FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                            acted_by=None,
                            record_type='LoanAccount',
                            record_id=str(loan.pk),
                            amount=correct_target,
                            description=(
                                f'Cutover-corrected penalty accrual on {loan.loan_number} '
                                f'(reversed {len(existing_txns)} pre-fix entr{"y" if len(existing_txns)==1 else "ies"} '
                                f'totalling {reverse_total})'
                            ),
                            extra={
                                'loan_number': loan.loan_number,
                                'client_id': str(loan.client_id),
                                'reversed_total': str(reverse_total),
                                'reposted_total': str(correct_target),
                                'journal_entry_id': str(journal.pk),
                                'source_command': 'reverse_legacy_loan_penalty_accruals',
                            },
                        )
                        loan.penalty_accrual_active = True
                    else:
                        loan.penalty_accrual_active = False
                        if reverse_total > 0:
                            log_financial_event(
                                FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                                acted_by=None,
                                record_type='LoanAccount',
                                record_id=str(loan.pk),
                                amount=-reverse_total,
                                description=(
                                    f'Reversed penalty accrual on legacy-imported loan '
                                    f'{loan.loan_number} — nothing currently owed after cutover fix'
                                ),
                                extra={
                                    'loan_number': loan.loan_number,
                                    'reversed_total': str(reverse_total),
                                    'source_command': 'reverse_legacy_loan_penalty_accruals',
                                },
                            )

                    loan.save(update_fields=[
                        'outstanding_penalties', 'penalty_accrual_active', 'updated_at',
                    ])
            except ValidationError as exc:
                failures.append((loan.loan_number, str(exc)))

        self.stdout.write(self.style.WARNING(
            f'\n{total_loans_touched} loan(s) — reverse total ₦{total_reversed:,.2f}, '
            f'repost total ₦{total_reposted:,.2f}, net change ₦{(total_reposted - total_reversed):,.2f}'
        ))

        if failures:
            self.stdout.write(self.style.ERROR(f'\n{len(failures)} loan(s) FAILED and were not touched:'))
            for ln, err in failures:
                self.stdout.write(f'  {ln}: {err}')

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to post every correction shown above.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nApplied. {total_loans_touched - len(failures)} loan(s) corrected.'
            ))
