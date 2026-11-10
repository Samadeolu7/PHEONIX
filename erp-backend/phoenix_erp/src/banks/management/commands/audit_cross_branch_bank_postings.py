"""
Read-only: money that was posted into ANOTHER branch's bank account.

Each row is an approved, non-reversed journal entry whose debit lands on a
bank account's GL but whose own branch (the loan's / savings account's
branch) differs from the bank account's branch. Those payments sit on the
other branch's bank reconciliation, which is why the paying branch couldn't
see its own gaps. New postings like this are now refused
(PaymentRoutingService.ensure_bank_account_branch); this shows the history.

Usage:
    python manage.py audit_cross_branch_bank_postings
    python manage.py audit_cross_branch_bank_postings --since 2026-07-01 --details
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date


class Command(BaseCommand):
    help = 'List payments posted into a bank account that belongs to a different branch (read-only).'

    def add_arguments(self, parser):
        parser.add_argument('--since', help='Only entries dated on/after this ISO date')
        parser.add_argument('--details', action='store_true', help='Print every entry, not just the summary')
        parser.add_argument('--limit', type=int, default=200, help='Max detail rows (default 200)')

    def handle(self, *args, **opts):
        from banks.models import BankAccount
        from transactions.models import TransactionEntry

        accounts = {
            ba.gl_account_id: ba
            for ba in BankAccount.all_objects.select_related('branch').exclude(branch__isnull=True)
            .exclude(gl_account__isnull=True)
        }
        if not accounts:
            self.stdout.write('No branch-owned bank accounts found.')
            return

        # Set-up problem that makes cross-branch postings possible: the bank
        # account says branch Y but its GL account sits in branch X, so X's
        # payments post fine in the ledger yet land on Y's reconciliation.
        # Since 2026-11-10 such postings are refused (TransactionEntry.clean),
        # so these accounts must be corrected before X can use them.
        mismatched = [
            ba for ba in BankAccount.all_objects.select_related('branch', 'gl_account__branch')
            .exclude(branch__isnull=True).exclude(gl_account__isnull=True)
            if ba.gl_account.branch_id != ba.branch_id
        ]
        if mismatched:
            self.stdout.write(self.style.ERROR(
                'Bank accounts whose GL account is in a DIFFERENT branch (fix which branch each belongs to):'
            ))
            for ba in mismatched:
                gl_branch = ba.gl_account.branch.name if ba.gl_account.branch else 'no branch'
                self.stdout.write(
                    f'  BankAccount #{ba.pk} {ba.account_name} ({ba.account_number}): '
                    f'bank account branch={ba.branch.name}, GL {ba.gl_account.code} branch={gl_branch}'
                )
            self.stdout.write('')
        else:
            self.stdout.write(self.style.SUCCESS('Every bank account and its GL account are in the same branch.'))

        qs = TransactionEntry.objects.filter(
            account_id__in=accounts.keys(),
            side=TransactionEntry.DEBIT,
            transaction__approved=True,
            transaction__is_reversed=False,
            transaction__is_deleted=False,
        ).select_related('transaction__branch', 'transaction__created_by', 'transaction__series')
        since = parse_date(opts['since']) if opts.get('since') else None
        if since:
            qs = qs.filter(transaction__date__gte=since)

        groups = defaultdict(lambda: {'count': 0, 'amount': Decimal('0')})
        details = []
        for entry in qs.iterator():
            txn = entry.transaction
            ba = accounts[entry.account_id]
            if txn.branch_id is None or txn.branch_id == ba.branch_id:
                continue
            key = (txn.branch.name if txn.branch else '?', ba.branch.name, ba.account_name)
            groups[key]['count'] += 1
            groups[key]['amount'] += entry.amount
            if opts['details'] and len(details) < opts['limit']:
                details.append((txn, ba, entry.amount))

        if not groups:
            self.stdout.write(self.style.SUCCESS('No cross-branch postings found.'))
            return

        self.stdout.write(self.style.WARNING('Payments posted into another branch\'s bank account:'))
        self.stdout.write(f'{"Payment branch":<22} {"Account branch":<22} {"Bank account":<32} {"Count":>6} {"Amount":>16}')
        total_n, total_amt = 0, Decimal('0')
        for (pay_branch, acct_branch, acct), g in sorted(groups.items(), key=lambda kv: -kv[1]['amount']):
            self.stdout.write(f'{pay_branch:<22} {acct_branch:<22} {acct[:32]:<32} {g["count"]:>6} {g["amount"]:>16,.2f}')
            total_n += g['count']
            total_amt += g['amount']
        self.stdout.write(f'{"TOTAL":<78} {total_n:>6} {total_amt:>16,.2f}')

        if details:
            self.stdout.write('')
            for txn, ba, amount in details:
                series = getattr(txn.series, 'code', '')
                who = txn.created_by.get_full_name() if txn.created_by else '?'
                self.stdout.write(
                    f'  #{txn.pk} {txn.date} {series:<6} {amount:>12,.2f}  {txn.branch.name} -> '
                    f'{ba.account_name} ({ba.branch.name}) by {who}: {(txn.description or "")[:70]}'
                )
