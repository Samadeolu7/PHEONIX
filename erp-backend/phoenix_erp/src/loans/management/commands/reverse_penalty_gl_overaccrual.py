"""
Management command: reverse_penalty_gl_overaccrual

Corrects the over-accrual found by audit_loan_penalty_gl_vs_truth: some loans
touched by accrue_outstanding_penalty_backlog (2026-08-12) had that command
compute "still unpaid penalty" as `schedule.penalty_due - schedule.penalty_paid`
per installment, but schedule.penalty_paid was understated on some rows — a
data-quality gap left over from a schedule-allocation bug fixed on
2026-08-05, well after some of these loans' payments were originally
recorded. That understatement made some rows look like they had more unpaid
penalty than they really did, so the backlog command over-posted:
Dr Loan Receivable / Cr Penalty Income for more than the loan actually still
owes.

This does NOT reverse a flat per-loan drift figure — audit_schedule_penalty_
paid_drift's per-loan "understated_by" number turned out unsafe to use
directly (LN-735 showed understated_by=89,670.00 while its backlog entries
only ever posted 70,156.94 in total — more than one thing was wrong on that
loan, so a flat subtraction would have either under- or over-corrected it).
Instead, exactly like audit_loan_penalty_gl_vs_truth, this recomputes both
sides from ground truth for every affected loan:

    correct_gl_accrued_penalty = Sum(schedule.penalty_due) - loan.penalties_paid
    actual_gl_accrued_penalty  = net Dr to loan.account across every LNPEN
                                  entry referencing this loan

target = max(0, correct_gl_accrued_penalty) — GL accrual can't be negative;
a loan where the raw figure comes out negative has paid MORE penalty,
historically, than is even currently due (see below) — that's a separate,
already-tooled overcollection question (audit_penalty_overcollection /
apply_penalty_overcollection_credit), not something this command decides.
This command only ever brings the accrual down to zero for such a loan, it
does not attempt to credit the client for the excess.

reversal = actual_gl_accrued_penalty - target, only acted on where positive
(i.e. only loans that are genuinely over-accrued; under-accrued loans are
left alone — those need MORE accrual, a materially different and separate
decision that deserves its own review, not folded into a reversal command).

For each affected loan, posts ONE journal entry:
    Dr. Penalty Income  (product.penalty_income_account)
    Cr. Loan Receivable (loan.account)
for `reversal`. Series LNPEN — reused deliberately: this is the same
self-correcting mechanism update_loan_status.py already uses for a downward
penalty_due revision, just applied once as a catch-up rather than daily.

SAFETY:
  - Dry-run by default — shows every affected loan and the grand total.
    Nothing is written until --apply.
  - Batch mode: with --apply, every loan shown is corrected in one atomic
    transaction (matches apply_penalty_due_correction's convention — this is
    a mechanical, ground-truth-derived correction, not a subjective credit
    decision, so it doesn't need apply_penalty_overcollection_credit's
    one-loan-at-a-time gate).
  - Loans where the raw (unclamped) figure was negative are printed with a
    note to also review them under audit_penalty_overcollection — this
    command's reversal is still correct and needed for those, it just isn't
    the whole story for that loan.
  - Every reversal is logged via FinancialAuditLog(LOAN_PENALTY_ACCRUAL).

Usage:
    python manage.py reverse_penalty_gl_overaccrual                # dry-run, whole book
    python manage.py reverse_penalty_gl_overaccrual --loan LN-735  # dry-run, one loan
    python manage.py reverse_penalty_gl_overaccrual --apply        # posts every correction shown
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Sum


TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'Reverse GL over-accrual of penalty income found by audit_loan_penalty_gl_vs_truth. '
        'Dry-run by default; --apply corrects every loan shown in one batch.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only correct a single loan by loan_number.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually post the reversal entries. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from common.models import FinancialAuditLog, log_financial_event
        from django.utils import timezone

        loan_number = options['loan_number']
        apply_changes = options['apply']
        today = timezone.localdate()

        loans = LoanAccount.all_objects.filter(
            is_deleted=False, penalty_accrual_active=True,
        ).select_related('account', 'product').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        corrections = []  # (loan, raw_correct, target, actual, reversal)

        for loan in loans.iterator():
            if not loan.product.penalty_income_account:
                continue

            total_penalty_due = loan.repayment_schedule.aggregate(
                total=Sum('penalty_due')
            )['total'] or Decimal('0.00')
            raw_correct = total_penalty_due - (loan.penalties_paid or Decimal('0.00'))
            target = max(Decimal('0.00'), raw_correct)

            lnpen_lines = JournalEntryLine.objects.filter(
                transaction__series__code='LNPEN',
                transaction__description__icontains=loan.loan_number,
                account=loan.account,
            ).values('side').annotate(total=Sum('amount'))
            debit = next((r['total'] for r in lnpen_lines if r['side'] == JournalEntryLine.DEBIT), Decimal('0.00'))
            credit = next((r['total'] for r in lnpen_lines if r['side'] == JournalEntryLine.CREDIT), Decimal('0.00'))
            actual = debit - credit

            reversal = (actual - target).quantize(Decimal('0.01'))
            if reversal > TOLERANCE:
                corrections.append((loan, raw_correct, target, actual, reversal))

        if not corrections:
            self.stdout.write(self.style.SUCCESS('Nothing to reverse.'))
            return

        grand_total = Decimal('0.00')
        overcollection_candidates = []
        for loan, raw_correct, target, actual, reversal in corrections:
            note = ''
            if raw_correct < 0:
                note = '  *** raw figure negative — also review under audit_penalty_overcollection ***'
                overcollection_candidates.append(loan.loan_number)
            self.stdout.write(
                f"  {loan.loan_number:20s} actually_posted={actual:>12,.2f}  "
                f"should_be={target:>12,.2f}  reversal={reversal:>12,.2f}{note}"
            )
            grand_total += reversal

        self.stdout.write('')
        self.stdout.write(self.style.WARNING(
            f'{len(corrections)} loan(s), grand total to reverse: {grand_total:,.2f}'
        ))
        if overcollection_candidates:
            self.stdout.write(self.style.WARNING(
                f'Loans also worth reviewing under audit_penalty_overcollection: '
                f'{", ".join(overcollection_candidates)}'
            ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to post every reversal shown above.'
            ))
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code='LNPEN',
            defaults={'description': 'Loan Penalty Accrual'},
        )

        posted = 0
        with db_transaction.atomic():
            for loan, raw_correct, target, actual, reversal in corrections:
                journal = JournalEntry.objects.create(
                    series=series,
                    date=today,
                    description=(
                        f'Penalty accrual over-collection reversal — {loan.loan_number} '
                        f'(backlog catch-up used understated schedule.penalty_paid)'
                    ),
                    owner=loan.owner,
                    branch=loan.branch,
                )
                JournalEntryLine.objects.create(
                    transaction=journal, account=loan.product.penalty_income_account,
                    side=JournalEntryLine.DEBIT, amount=reversal,
                )
                JournalEntryLine.objects.create(
                    transaction=journal, account=loan.account,
                    side=JournalEntryLine.CREDIT, amount=reversal,
                )
                journal.post()

                log_financial_event(
                    FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                    acted_by=None,
                    record_type='LoanAccount',
                    record_id=str(loan.pk),
                    amount=-reversal,
                    description=(
                        f'Penalty accrual over-collection reversal on {loan.loan_number}'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'client_id': str(loan.client_id),
                        'raw_correct_accrued': str(raw_correct),
                        'clamped_target_accrued': str(target),
                        'actual_accrued_before_reversal': str(actual),
                        'reversal_amount': str(reversal),
                        'journal_entry_id': str(journal.pk),
                        'source_command': 'reverse_penalty_gl_overaccrual',
                    },
                )
                posted += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nApplied. Posted {posted} reversal(s), total {grand_total:,.2f}.'
        ))
