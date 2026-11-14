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

For every CONFIRMED reduction on an open loan (active / disbursed /
defaulted), reverses that reduction with Transaction.reverse() (the standard
audited path: a linked opposite entry, Dr Loan Receivable / Cr Penalty
Income, and the original marked is_reversed), then adds the amount back to
the installment's penalty_due and the loan's outstanding_penalties so the
schedule, the loan totals and GL stay in step.

Reversing (rather than posting a fresh "restored" entry) keeps the client's
ledger clean: the wrong reduction and its reversal are a linked pair that
the ledger views hide, so the client only sees the penalty as originally
charged (see the project rule in CLAUDE.md).

Skipped and listed for manual review, never posted:
  - loans no longer open (paid off, closed, written off): the money can no
    longer be collected by re-charging the loan;
  - reductions NOT CONFIRMED by the check in loans/penalty_reductions.py
    (no repayment on that installment explains the exact amount): these may
    be legitimate corrections of an overcharged penalty;
  - reductions whose installment is now 'restructured': the penalty may
    already have been rolled into the restructured terms.

Safe to re-run: a reduction already reversed is no longer selected.

Usage:
    python manage.py restore_penalty_reduced_by_repayment               # dry-run
    python manage.py restore_penalty_reduced_by_repayment --loan LN-659
    python manage.py restore_penalty_reduced_by_repayment --apply
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction

REVERSAL_REASON = (
    'Penalty wrongly reduced by the daily job after a repayment; '
    'restored by restore_penalty_reduced_by_repayment'
)


class Command(BaseCommand):
    help = (
        'Re-charge penalty the old daily job reversed after repayments, on open '
        'loans (dry-run unless --apply).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                            help='Only restore this loan number.')
        parser.add_argument('--apply', action='store_true',
                            help='Actually post the restoring entries. Without this, only previews.')

    def handle(self, *args, **options):
        from common.models import FinancialAuditLog, log_financial_event
        from loans.models import LoanAccount
        from loans.penalty_reductions import OPEN_STATUSES, find_penalty_reductions

        apply_changes = options['apply']
        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY-RUN — nothing will be posted. Re-run with --apply.'))

        reductions = find_penalty_reductions(loan_number=options['loan_number'])

        to_restore = defaultdict(list)   # loan.pk -> [(reduction, sched)]
        skipped = defaultdict(list)      # reason -> [reduction]
        for r in reductions:
            if not r.repayment_driven:
                skipped[f'not confirmed ({r.verdict})'].append(r)
                continue
            if r.loan.status not in OPEN_STATUSES:
                skipped['loan no longer open — not recoverable by re-charging'].append(r)
                continue
            sched = r.sched
            if sched.status == 'restructured':
                skipped['installment restructured — review manually'].append(r)
                continue
            to_restore[r.loan.pk].append((r, sched))

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
                    reversal = r.txn.reverse(user=None, reason=REVERSAL_REASON)

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
                            'reversal_transaction_id': str(reversal.pk),
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
            + (f' ({posted} reductions reversed).' if apply_changes else '.')
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY-RUN — nothing posted.'))
