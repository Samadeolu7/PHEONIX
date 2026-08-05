"""
Management command: audit_orphaned_loan_repayment_journals

Read-only audit. Finds LNPMT-series journal entries that exist in the GL but
have no matching FinancialAuditLog(event_type=LOAN_REPAY) entry — i.e. cash
was received and posted (Dr. Cash / Cr. Loan Receivable+Income accounts) but
LoanAccount.record_payment() was never actually called for it, so the loan's
own fields (total_paid, outstanding_principal/interest/fees/penalties,
last_payment_date) and its LoanRepaymentSchedule rows were never updated.

Context: found via LN-714 (LNPMT-20260803-1918, 2026-08-03) — a ₦5,000
payment posted entirely to the "Loan Penalty (2026)" income account, but the
loan's last_payment_date/total_paid never moved past its prior 2026-05-07
payment. That pattern — a real GL posting with no trace in the loan record —
can only happen if the journal entry was created directly (e.g. a manual
journal entry through the generic transactions UI/API, or a one-off script)
rather than through record_payment(), which always writes both the journal
AND a FinancialAuditLog(LOAN_REPAY) row referencing it
(extra['journal_entry_id']) inside the same atomic block.

This command cross-checks every LNPMT transaction against that audit log to
find every other case of the same thing, across all loans, not just LN-714.

Makes no changes — report only. Fixing an orphaned entry means deciding, per
loan, whether to reverse the manual journal and re-run it through
record_payment(), or manually catch up the loan's fields/schedule to match
what the journal already posted — that's a judgment call per case, not
something to automate blindly.

Usage:
    python manage.py audit_orphaned_loan_repayment_journals
    python manage.py audit_orphaned_loan_repayment_journals --loan LN-714
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only audit: LNPMT journal entries with no matching '
        'FinancialAuditLog(LOAN_REPAY) — i.e. GL postings the loan record never saw.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Only check journal entries whose description references this loan number.',
        )

    def handle(self, *args, **options):
        from transactions.models import Transaction, TransactionEntry
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']

        txns = Transaction.all_objects.filter(
            series__code='LNPMT', is_deleted=False,
        ).select_related('series', 'created_by').order_by('date', 'id')

        if loan_number:
            txns = txns.filter(description__icontains=loan_number)

        total = txns.count()
        self.stdout.write(f'Checking {total} LNPMT journal entries…')

        logged_journal_ids = set(
            FinancialAuditLog.objects.filter(
                event_type=FinancialAuditLog.LOAN_REPAY,
            ).values_list('extra__journal_entry_id', flat=True)
        )

        orphans = []
        for txn in txns:
            if str(txn.pk) not in logged_journal_ids:
                orphans.append(txn)

        if not orphans:
            self.stdout.write(self.style.SUCCESS(
                'No orphaned LNPMT journal entries found — every one has a matching '
                'FinancialAuditLog(LOAN_REPAY) entry, meaning record_payment() ran for all of them.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'\n{len(orphans)} orphaned LNPMT journal entr{"y" if len(orphans) == 1 else "ies"} found '
            f'— posted to GL but never applied to the loan record:\n'
        ))

        grand_total = Decimal('0.00')
        for txn in orphans:
            debit_total = TransactionEntry.objects.filter(
                transaction=txn, side=TransactionEntry.DEBIT,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            credit_lines = TransactionEntry.objects.filter(
                transaction=txn, side=TransactionEntry.CREDIT,
            ).select_related('account')

            grand_total += debit_total
            created_by = txn.created_by.get_username() if txn.created_by_id else '(none)'
            self.stdout.write(
                f'  [{txn.reference_number}] {txn.date}  amount={debit_total:,.2f}  '
                f'created_by={created_by}  "{txn.description}"'
            )
            for c in credit_lines:
                self.stdout.write(f'      Cr. {c.account.code} {c.account.name}  {c.amount:,.2f}')

        self.stdout.write(self.style.WARNING(
            f'\nTotal orphaned amount: {grand_total:,.2f} across {len(orphans)} entries.\n'
            'Each of these was real cash received and posted to the GL, but the borrower\'s '
            'loan record (total_paid, outstanding balances, schedule, last_payment_date) does '
            'not reflect it. Decide per loan whether to reverse-and-reapply through the normal '
            'repayment flow, or manually catch up the loan fields to match — no automated fix '
            'applied here.'
        ))
