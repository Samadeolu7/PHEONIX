"""
Management command: correct_frontloaded_interest_allocation

Corrects the historical impact of the payment-allocation bug fixed in
record_payment() (2026-07-24, see audit_payment_allocation_frontloading and
LN-20260702-B91A43): payments on "legacy cash-basis fallback" loans were
allocated against the loan's whole-term aggregate outstanding_interest
before touching principal, so real cash collected got booked entirely as
Interest Income with principal never reducing.

Each affected LoanRepaymentSchedule row already has a correct total_paid
and a correct interest_paid (that field was always capped per-installment
correctly — see _update_schedule_with_payment) — only principal_paid is
wrong (stuck at 0 while status shows 'paid'). So the correct principal_paid
for any row is simply whatever's left after its own interest/fees/penalty
are accounted for:

    correct_principal_paid = min(
        row.total_paid - row.interest_paid - row.fees_paid - row.penalty_paid,
        row.principal_due,
    )

For each affected loan this command, per row with a shortfall:
  1. Updates the schedule row's principal_paid to the correct value.
  2. Shifts the loan's aggregate principal_paid up / interest_paid down by
     the same amount (outstanding_principal down / outstanding_interest up
     correspondingly) — total_paid is untouched, it was already correct.
  3. Posts one correcting journal entry per loan (series LNADJ):
         Dr. Interest Income account(s) that were actually credited by this
             loan's repayments (apportioned pro-rata if more than one was
             used across its payment history)
         Cr. Loan Receivable (the loan's own GL account)
     for the loan's total shortfall — reversing the amount that was
     recognized as income but should have reduced the receivable instead.

Read-only by default; --confirm applies both the data correction and posts
the journal entries. Safe to re-run: already-corrected rows show zero
shortfall and are skipped, so this is idempotent.

Usage:
    python manage.py correct_frontloaded_interest_allocation              # dry-run
    python manage.py correct_frontloaded_interest_allocation --confirm    # apply
"""
import re
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

REPAYMENT_DESC_RE = re.compile(r'^Loan repayment\s*[–-]\s*(\S+)')


class Command(BaseCommand):
    help = (
        'Correct historical principal/interest misallocation from the payment-allocation '
        'bug: recompute correct principal_paid per installment, rebalance loan aggregates, '
        'and post a correcting Dr Income / Cr Loan Receivable journal entry per loan.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Apply the correction. Without this flag, only a dry-run report runs.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from accounts.models import Account

        confirm = options['confirm']

        candidates = LoanAccount.objects.filter(
            interest_recognized_at_disbursement=False,
            interest_deferral_active=False,
            total_paid__gt=Decimal('0.00'),
            is_deleted=False,
        ).select_related('product', 'product__product', 'account').order_by('loan_number')

        grand_total = Decimal('0.00')
        loans_corrected = 0

        for loan in candidates:
            row_corrections = []  # (row, shortfall)
            for row in loan.repayment_schedule.all():
                correct_principal_paid = min(
                    row.total_paid - row.interest_paid - row.fees_paid - row.penalty_paid,
                    row.principal_due,
                )
                shortfall = correct_principal_paid - row.principal_paid
                if shortfall > Decimal('0.01'):
                    row_corrections.append((row, correct_principal_paid, shortfall))

            if not row_corrections:
                continue

            total_shortfall = sum(s for _, _, s in row_corrections)

            # Find which income account(s) this loan's repayments actually credited,
            # so the correcting debit reverses out of the right place(s).
            txns = JournalEntry.objects.filter(
                description__startswith=f'Loan repayment – {loan.loan_number}'
            )
            credited_by_account = defaultdict(Decimal)
            for txn in txns:
                for entry in txn.entries.filter(side=JournalEntryLine.CREDIT, account__account_type=Account.INCOME):
                    credited_by_account[entry.account] += entry.amount

            total_credited = sum(credited_by_account.values())

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan.loan_number}] {loan.product.product.name} — shortfall={total_shortfall:,.2f} '
                f'({len(row_corrections)} installment row(s))'
            ))

            if total_credited <= 0:
                self.stdout.write(self.style.ERROR(
                    '    No income-account credits found for this loan\'s repayments — '
                    'cannot determine where to debit from. Skipping, needs manual review.'
                ))
                continue

            # Apportion the correction pro-rata across whichever account(s) were credited,
            # rounding the last one to absorb any remainder so the entry balances exactly.
            debit_amounts = {}
            running = Decimal('0.00')
            accounts_sorted = sorted(credited_by_account.items(), key=lambda kv: kv[0].code)
            for i, (account, credited) in enumerate(accounts_sorted):
                if i == len(accounts_sorted) - 1:
                    amt = (total_shortfall - running).quantize(Decimal('0.01'))
                else:
                    amt = (total_shortfall * credited / total_credited).quantize(Decimal('0.01'))
                    running += amt
                if amt > 0:
                    debit_amounts[account] = amt

            for account, amt in debit_amounts.items():
                self.stdout.write(f'    Dr. {account.code:12} {account.name:35} {amt:>14,.2f}')
            self.stdout.write(f'    Cr. {loan.account.code:12} {loan.account.name:35} {total_shortfall:>14,.2f}')

            grand_total += total_shortfall
            loans_corrected += 1

            if not confirm:
                continue

            with db_transaction.atomic():
                for row, correct_principal_paid, _shortfall in row_corrections:
                    row.principal_paid = correct_principal_paid
                    row.save(update_fields=['principal_paid'])

                loan.principal_paid += total_shortfall
                loan.outstanding_principal -= total_shortfall
                loan.interest_paid -= total_shortfall
                loan.outstanding_interest += total_shortfall
                loan.save(update_fields=[
                    'principal_paid', 'outstanding_principal',
                    'interest_paid', 'outstanding_interest',
                ])

                series, _ = TransactionSeries.objects.get_or_create(
                    code='LNADJ',
                    defaults={'description': 'Loan Correcting Adjustments'},
                )
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=(
                        f'Interest/principal reclassification correction – {loan.loan_number}'
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    tenant=loan.tenant,
                )
                for account, amt in debit_amounts.items():
                    JournalEntryLine.objects.create(
                        transaction=journal_entry, account=account,
                        side=JournalEntryLine.DEBIT, amount=amt,
                    )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=loan.account,
                    side=JournalEntryLine.CREDIT, amount=total_shortfall,
                )
                journal_entry.post()

            self.stdout.write(self.style.SUCCESS(f'    Applied. Journal entry {journal_entry.reference_number}.'))

        self.stdout.write('')
        if loans_corrected == 0:
            self.stdout.write(self.style.SUCCESS('No loans need correction.'))
        elif not confirm:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN — would correct {loans_corrected} loan(s), total {grand_total:,.2f}. '
                f'Re-run with --confirm to apply.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Done. Corrected {loans_corrected} loan(s), total {grand_total:,.2f}.'
            ))
