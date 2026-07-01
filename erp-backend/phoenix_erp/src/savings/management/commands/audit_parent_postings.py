"""
savings/management/commands/audit_parent_postings.py
=======================================================
READ-ONLY diagnostic. Makes NO database writes.

audit_ledger_integrity found that two PARENT-level accounts (2100 Trade and
Other Payables, 4200 Other Operating Income) have TransactionEntry rows
posted DIRECTLY against them (not their children), totalling exactly the
20,000 + 64,000 = 84,000 gap in the trial balance. The trial balance's
parent-rollup logic only sums children, so these direct entries are
invisible to the report even though the underlying ledger is balanced.

This command identifies exactly which transaction(s) posted those entries:
reference number, series, description, date, who created/owns it, and
whether the account had allow_manual_entries=True (meaning the posting was
explicitly permitted by account config) or False (meaning the
clean()-level guard should have blocked it, and something bypassed
validation to create it anyway).

Usage
-----
    python manage.py audit_parent_postings
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'READ-ONLY. Identifies the transactions that posted directly to '
        'parent-level GL accounts, bypassing the trial balance rollup. '
        'Makes no changes.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--codes',
            nargs='+',
            default=['2100', '4200'],
            help='Account codes to inspect (default: 2100 4200).',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from transactions.models import TransactionEntry

        self.stdout.write('=== Direct-to-Parent Postings Audit (read-only) ===\n')

        for code in options['codes']:
            try:
                acct = Account.all_objects.get(code=code)
            except Account.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Account {code} not found.\n'))
                continue
            except Account.MultipleObjectsReturned:
                self.stdout.write(self.style.ERROR(
                    f'Multiple accounts with code {code} found (multi-branch/tenant?) — '
                    f'inspect manually.\n'
                ))
                continue

            self.stdout.write(
                f'Account {acct.code} — {acct.name}\n'
                f'  account_level      : {acct.account_level}\n'
                f'  allow_manual_entries: {acct.allow_manual_entries}\n'
                f'  has children       : {acct.children.exists()}\n'
                f'  is_deleted         : {acct.is_deleted}\n'
            )

            entries = (
                TransactionEntry.objects
                .filter(account=acct)
                .select_related('transaction', 'transaction__series', 'transaction__owner', 'transaction__created_by')
                .order_by('transaction__date')
            )

            if not entries.exists():
                self.stdout.write('  No direct entries found on this account.\n')
                continue

            for e in entries:
                txn = e.transaction
                owner_label = getattr(txn.owner, 'email', None) or getattr(txn.owner, 'username', None) or txn.owner_id
                created_by_label = getattr(txn.created_by, 'email', None) or getattr(txn.created_by, 'username', None) or txn.created_by_id
                self.stdout.write(
                    f'  --- Entry id={e.pk} ---\n'
                    f'    Transaction    : {txn.reference_number} (id={txn.pk})\n'
                    f'    Series         : {txn.series.code if txn.series_id else "-"}\n'
                    f'    Date           : {txn.date}\n'
                    f'    Description    : {txn.description}\n'
                    f'    Owner          : {owner_label}\n'
                    f'    Created by     : {created_by_label}\n'
                    f'    Created at     : {txn.created_at}\n'
                    f'    Approved       : {txn.approved} (at {txn.approved_at})\n'
                    f'    Side / Amount  : {e.side} / {e.amount}\n'
                    f'    Posted         : {e.posted} (at {e.posted_at})\n'
                    f'    Workflow ref   : {getattr(txn, "workflow_reference", None)}\n'
                )
            self.stdout.write('')
