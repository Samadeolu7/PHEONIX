"""
Re-charge the penalty the old daily update_loan_status job reversed after
repayments, on loans that are still open.

Before 2026-11-13 the daily job recomputed each overdue installment's
penalty from scratch (rate x current unpaid balance x ALL periods late), so
every repayment made the next run reverse part of the penalty already
charged for earlier periods:

    Dr Penalty Income / Cr Loan Receivable   "Loan penalty accrual — …"

That cost the institution penalty income and cut the client's debt. See
audit_penalty_reduced_by_repayment for the report; this command undoes the
same entries (selected by loans/penalty_reductions.py, so the two always
agree).

For every REPAYMENT-DRIVEN reduction on an open loan (active / disbursed /
defaulted), posts one LNPEN entry for the same amount, in the opposite
direction:

    Dr Loan Receivable (loan.account)
    Cr Penalty Income  (the account the reduction debited)
    "Loan penalty restored — <loan> (installment due …) [restores <ref>]"

and adds the amount back to the installment's penalty_due and the loan's
outstanding_penalties, so the schedule, the loan totals and GL stay in
step.

Skipped and listed for manual review, never posted:
  - loans no longer open (paid off, closed, written off): the money can no
    longer be collected by re-charging the loan;
  - reductions with no repayment within --window days before them (OTHER in
    the audit): these may be legitimate corrections of an inflated penalty;
  - reductions whose installment is now 'restructured' or cannot be found:
    the penalty may already have been rolled into the restructured terms.

Safe to re-run: a reduction that already has a restoring entry (found by
its [restores <ref>] marker) is skipped.

Usage:
    python manage.py restore_penalty_reduced_by_repayment               # dry-run
    python manage.py restore_penalty_reduced_by_repayment --loan LN-659
    python manage.py restore_penalty_reduced_by_repayment --apply
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Re-charge penalty the old daily job reversed after repayments, on open '
        'loans (dry-run unless --apply).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                            help='Only restore this loan number.')
        parser.add_argument('--window', type=int, default=7,
                            help='Days before a reduction to look for a repayment (default 7). '
                                 'Use the same value you audited with.')
        parser.add_argument('--apply', action='store_true',
                            help='Actually post the restoring entries. Without this, only previews.')

    def handle(self, *args, **options):
        from common.models import FinancialAuditLog, log_financial_event
        from loans.models import LoanAccount
        from loans.penalty_reductions import (
            OPEN_STATUSES, RESTORE_PREFIX, find_penalty_reductions, restore_marker,
        )
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        apply_changes = options['apply']
        today = timezone.localdate()
        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY-RUN — nothing will be posted. Re-run with --apply.'))

        reductions = find_penalty_reductions(
            loan_number=options['loan_number'], window_days=options['window'],
        )

        already_restored = set(
            JournalEntry.objects.filter(
                series__code='LNPEN',
                description__startswith=RESTORE_PREFIX,
                is_reversed=False,
            ).values_list('description', flat=True)
        )

        to_restore = defaultdict(list)   # loan.pk -> [(reduction, sched)]
        skipped = defaultdict(list)      # reason -> [reduction]
        for r in reductions:
            if any(restore_marker(r.txn) in d for d in already_restored):
                skipped['already restored'].append(r)
                continue
            if not r.repayment_driven:
                skipped['no repayment nearby — review manually'].append(r)
                continue
            if r.loan.status not in OPEN_STATUSES:
                skipped[f'loan no longer open — not recoverable by re-charging'].append(r)
                continue
            due = r.installment_due_date
            sched = None
            if due:
                sched = (
                    r.loan.repayment_schedule.filter(due_date=due, is_deleted=False)
                    .order_by('installment_number').first()
                )
            if sched is None:
                skipped['installment not found — review manually'].append(r)
                continue
            if sched.status == 'restructured':
                skipped['installment restructured — review manually'].append(r)
                continue
            to_restore[r.loan.pk].append((r, sched))

        series = None
        if apply_changes and to_restore:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNPEN', defaults={'description': 'Loan Penalty Accrual'},
            )

        grand_total = Decimal('0.00')
        posted = 0
        for loan_pk, items in to_restore.items():
            loan_total = sum((r.amount for r, _ in items), Decimal('0.00'))
            grand_total += loan_total
            first = items[0][0].loan
            self.stdout.write(
                f'\n{first.loan_number}  ({first.status})  restore ₦{loan_total:,.2f} '
                f'from {len(items)} reduction(s)'
            )
            for r, sched in items:
                self.stdout.write(
                    f'    {r.txn.date}  {r.txn.reference_number or r.txn.pk}  '
                    f'₦{r.amount:>12,.2f}  installment due {sched.due_date}'
                )
            if not apply_changes:
                continue

            with db_transaction.atomic():
                loan = LoanAccount.all_objects.select_for_update().get(pk=loan_pk)
                for r, sched in items:
                    # Credit back the exact account the reduction debited.
                    income_line = r.txn.entries.filter(side=JournalEntryLine.DEBIT).first()
                    income_account = income_line.account if income_line else loan.product.penalty_income_account
                    journal = JournalEntry.objects.create(
                        series=series,
                        date=today,
                        description=(
                            f'{RESTORE_PREFIX}{loan.loan_number} '
                            f'(installment due {sched.due_date}) {restore_marker(r.txn)}'
                        )[:255],
                        owner=loan.owner,
                        branch=loan.branch,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal, account=loan.account,
                        side=JournalEntryLine.DEBIT, amount=r.amount,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal, account=income_account,
                        side=JournalEntryLine.CREDIT, amount=r.amount,
                    )
                    journal.post()

                    sched.refresh_from_db()
                    sched.penalty_due += r.amount
                    sched.save(update_fields=['penalty_due', 'updated_at'])

                    log_financial_event(
                        FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                        acted_by=None,
                        record_type='LoanAccount',
                        record_id=str(loan.pk),
                        amount=r.amount,
                        description=(
                            f'Restored penalty wrongly reversed after a repayment on '
                            f'{loan.loan_number} (installment due {sched.due_date})'
                        ),
                        extra={
                            'loan_number': loan.loan_number,
                            'schedule_id': str(sched.pk),
                            'installment_due_date': str(sched.due_date),
                            'restored_transaction_id': str(r.txn.pk),
                            'restored_reference': r.txn.reference_number or '',
                            'journal_entry_id': str(journal.pk),
                        },
                    )
                    posted += 1

                loan.outstanding_penalties += loan_total
                loan.penalty_accrual_active = True
                loan.save(update_fields=['outstanding_penalties', 'penalty_accrual_active', 'updated_at'])

        if skipped:
            self.stdout.write('\n--- Skipped (not posted) ---')
            for reason, items in skipped.items():
                total = sum((r.amount for r in items), Decimal('0.00'))
                loans = sorted({r.loan.loan_number for r in items})
                shown = ', '.join(loans[:15]) + (' …' if len(loans) > 15 else '')
                self.stdout.write(
                    f'  {reason}: ₦{total:,.2f} in {len(items)} entr(y/ies) '
                    f'on {len(loans)} loan(s): {shown}'
                )

        verb = 'Restored' if apply_changes else 'Would restore'
        self.stdout.write(self.style.SUCCESS(
            f'\n{verb} ₦{grand_total:,.2f} across {len(to_restore)} loan(s)'
            + (f' ({posted} entries posted).' if apply_changes else '.')
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY-RUN — nothing posted.'))
