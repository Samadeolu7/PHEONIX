"""
cash_management/management/commands/reassign_cashier_ledger_entries.py
========================================================================
Repoints TransactionEntry rows from one cashier's GL cash account to
another's, for cases where a bug caused one cashier's postings to land on
a different cashier's CashierAccount.account.

Incident this was written for: every posting made by Simon Uche
(CASH-0005) was being recorded against Israel Lawal's GL cash account
(CASH-0002 -> accounts.Account 1116) instead of his own (accounts.Account
1120). Israel never actually posted anything himself, so the entire
ledger under 1116 belongs to Simon.

What this command does
-----------------------
Moves every TransactionEntry currently posted against the source
CashierAccount's GL account to the target CashierAccount's GL account,
by updating TransactionEntry.account only. It deliberately does NOT:
  - touch Account.balance (the cached GL balance) on either account,
  - touch CashierAccount.current_balance on either account,
  - touch the parent account's rolled-up balance,
  - create any new Transaction/journal entry.
Those cached balances already reflect reality (they were the one part of
this incident nobody got wrong); only the underlying ledger rows were
misfiled. A plain queryset .update() on TransactionEntry.account is safe
for this because nothing in this codebase recomputes balances from a
TransactionEntry save/post — that only happens inside
TransactionEntry.post(), which this command never calls (see
move_parent_transactions_to_children.py for the same pattern).

Safety
------
- Refuses to run across two different branches/tenants (TransactionEntry
  normally enforces this in .clean(), which a raw .update() bypasses).
- Snapshots both accounts' cached balances before the move and asserts
  they are byte-for-byte unchanged afterwards; aborts the transaction
  otherwise.
- --dry-run prints exactly what would move without writing anything.

Usage
-----
    python manage.py reassign_cashier_ledger_entries --from CASH-0002 --to CASH-0005 --dry-run
    python manage.py reassign_cashier_ledger_entries --from CASH-0002 --to CASH-0005
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum, Q


class Command(BaseCommand):
    help = (
        "Repoints all ledger entries from one cashier's GL cash account to "
        "another's, without changing either account's cached balance. Use "
        "when a posting bug filed one cashier's transactions under a "
        "different cashier's CashierAccount."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--from', dest='from_account_number', required=True,
            help="CashierAccount.account_number to move entries OFF of (e.g. CASH-0002).",
        )
        parser.add_argument(
            '--to', dest='to_account_number', required=True,
            help="CashierAccount.account_number to move entries ONTO (e.g. CASH-0005).",
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview what would be moved without making any changes.',
        )

    def handle(self, *args, **options):
        from cash_management.models import CashierAccount
        from transactions.models import TransactionEntry

        dry_run = options['dry_run']
        from_number = options['from_account_number']
        to_number = options['to_account_number']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        try:
            source_cashier = CashierAccount.objects.select_related('account').get(
                account_number=from_number
            )
        except CashierAccount.DoesNotExist:
            raise CommandError(f'No CashierAccount with account_number={from_number!r}')

        try:
            target_cashier = CashierAccount.objects.select_related('account').get(
                account_number=to_number
            )
        except CashierAccount.DoesNotExist:
            raise CommandError(f'No CashierAccount with account_number={to_number!r}')

        source_account = source_cashier.account
        target_account = target_cashier.account

        if source_account is None or target_account is None:
            raise CommandError('Both cashier accounts must have a linked GL account.')
        if source_account.pk == target_account.pk:
            raise CommandError('--from and --to resolve to the same GL account; nothing to do.')
        if source_account.branch_id != target_account.branch_id:
            raise CommandError(
                f'Refusing to move entries across branches '
                f'({source_account.branch_id} -> {target_account.branch_id}).'
            )
        if source_account.tenant_id != target_account.tenant_id:
            raise CommandError('Refusing to move entries across tenants.')

        entries = TransactionEntry.objects.filter(account=source_account)
        entry_count = entries.count()

        if entry_count == 0:
            self.stdout.write(self.style.SUCCESS(
                f'{source_cashier.account_number} ({source_account.code}) has no ledger '
                f'entries. Nothing to move.'
            ))
            return

        totals = entries.aggregate(
            debit=Sum('amount', filter=Q(side=TransactionEntry.DEBIT)),
            credit=Sum('amount', filter=Q(side=TransactionEntry.CREDIT)),
        )
        debit_total = totals['debit'] or 0
        credit_total = totals['credit'] or 0

        refs = list(
            entries.select_related('transaction')
            .values_list('transaction__reference_number', flat=True)
            .distinct()
            .order_by('transaction__reference_number')
        )

        self.stdout.write(
            f'Source: {source_cashier.account_number} - {source_cashier.name} '
            f'(GL {source_account.code}, cached balance={source_account.balance}, '
            f'CashierAccount.current_balance={source_cashier.current_balance})\n'
            f'Target: {target_cashier.account_number} - {target_cashier.name} '
            f'(GL {target_account.code}, cached balance={target_account.balance}, '
            f'CashierAccount.current_balance={target_cashier.current_balance})\n'
            f'\nEntries to move: {entry_count} (total debit={debit_total}, '
            f'total credit={credit_total}, net={debit_total - credit_total})\n'
        )
        if len(refs) <= 60:
            self.stdout.write('Reference numbers:\n  ' + '\n  '.join(refs) + '\n')
        else:
            self.stdout.write(f'{len(refs)} distinct transaction reference numbers.\n')

        if dry_run:
            self.stdout.write(self.style.WARNING(
                'Dry run complete — no changes made. Re-run without --dry-run to apply.'
            ))
            return

        before = {
            'source_balance': source_account.balance,
            'target_balance': target_account.balance,
            'source_cashier_balance': source_cashier.current_balance,
            'target_cashier_balance': target_cashier.current_balance,
        }

        with db_transaction.atomic():
            moved = entries.update(account=target_account)

            source_account.refresh_from_db(fields=['balance'])
            target_account.refresh_from_db(fields=['balance'])
            source_cashier.refresh_from_db(fields=['current_balance'])
            target_cashier.refresh_from_db(fields=['current_balance'])

            if (
                source_account.balance != before['source_balance']
                or target_account.balance != before['target_balance']
                or source_cashier.current_balance != before['source_cashier_balance']
                or target_cashier.current_balance != before['target_cashier_balance']
            ):
                raise CommandError(
                    'Aborting: a cached balance changed unexpectedly during the move. '
                    'Rolling back.'
                )

        self.stdout.write(self.style.SUCCESS(
            f'\nMoved {moved} ledger entries from {source_cashier.account_number} '
            f'({source_account.code}) to {target_cashier.account_number} '
            f'({target_account.code}).\n'
            f'Balances unchanged: source={source_account.balance} '
            f'(cashier={source_cashier.current_balance}), '
            f'target={target_account.balance} (cashier={target_cashier.current_balance}).'
        ))
