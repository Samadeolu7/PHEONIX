"""
savings/management/commands/merge_duplicate_accounts.py
=======================================================
Merges duplicate SavingsAccount and LoanAccount records where the same
client holds more than one account linked to the same product.

For savings accounts
--------------------
- Groups all non-deleted, non-closed accounts by (client, product).
- Keeps the account with the HIGHEST GL balance as the canonical record
  (ties broken by lowest pk / oldest account).
- For each duplicate with a non-zero GL balance, posts a balanced journal
  entry (Dr duplicate / Cr primary) to transfer the balance through proper
  double-entry accounting.  The guard is never bypassed.
- Soft-deletes the surplus GL accounts and SavingsAccounts.
  Each duplicate retains its own ledger history; entries are NOT repointed.

For loan accounts
-----------------
- Groups all non-deleted, non-terminal active loans by (client, product).
- Keeps the loan with the highest outstanding_principal (tie-break: lowest pk).
- Cancels and soft-deletes duplicate loans that have zero OUTSTANDING balance.
  (A loan that was disbursed but fully repaid — outstanding=0 — is safe to cancel.)
- Reports duplicates with non-zero outstanding for manual review.

Usage
-----
    python manage.py merge_duplicate_accounts
    python manage.py merge_duplicate_accounts --dry-run
    python manage.py merge_duplicate_accounts --savings-only
    python manage.py merge_duplicate_accounts --loans-only

NOTE: Run this command BEFORE applying migration
      savings/0008_unique_active_savings_per_client_product.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

logger = logging.getLogger(__name__)

# Loan statuses that mean the loan is no longer active.
TERMINAL_LOAN_STATUSES = frozenset(['paid_off', 'written_off', 'rejected', 'cancelled'])


class Command(BaseCommand):
    help = (
        "Merge duplicate SavingsAccount / LoanAccount records for the same "
        "client + product combination.\n\n"
        "IMPORTANT: run this command before applying the database migration "
        "savings/0008_unique_active_savings_per_client_product."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be merged/cancelled without making any changes.',
        )
        parser.add_argument(
            '--savings-only',
            action='store_true',
            help='Only process savings account duplicates (skip loans).',
        )
        parser.add_argument(
            '--loans-only',
            action='store_true',
            help='Only process loan account duplicates (skip savings).',
        )

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        do_savings = not options['loans_only']
        do_loans = not options['savings_only']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        if do_savings:
            self._merge_savings(dry_run)
        if do_loans:
            self._merge_loans(dry_run)

        self.stdout.write(self.style.SUCCESS('\nDone.'))

    # ------------------------------------------------------------------
    # Savings
    # ------------------------------------------------------------------
    def _merge_savings(self, dry_run: bool) -> None:
        from savings.models import SavingsAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry,
            TransactionSeries,
        )

        self.stdout.write('\n=== Savings Account Duplicates ===')

        # Find (client, product) pairs with more than one non-deleted account.
        groups = (
            SavingsAccount.objects
            .values('client', 'product')
            .annotate(count=Count('id'))
            .filter(count__gt=1)
            .order_by('client', 'product')
        )

        if not groups.exists():
            self.stdout.write('  No duplicate savings accounts found.')
            return

        total_merged = 0

        for group in groups:
            client_id = group['client']
            product_id = group['product']

            accounts = list(
                SavingsAccount.objects
                .filter(client_id=client_id, product_id=product_id)
                .select_related('account', 'client', 'product')
            )

            # Primary = highest GL balance; tie-break -> lowest pk (oldest).
            accounts.sort(key=lambda a: (-a.account.balance, a.pk))
            primary = accounts[0]
            duplicates = [a for a in accounts if a.pk != primary.pk]

            combined_balance = sum(
                (a.account.balance for a in accounts), Decimal('0.00')
            )
            client_label = getattr(primary.client, 'full_name', str(primary.client))
            product_label = primary.product.name

            self.stdout.write(
                f'\n  Client : {client_label}\n'
                f'  Product: {product_label}\n'
                f'  Accounts found: {len(accounts)} | Combined GL balance: {combined_balance}'
            )
            self.stdout.write(
                f'  -> Keep  : #{primary.pk} '
                f'(GL {primary.account.code}, balance={primary.account.balance})'
            )
            for dup in duplicates:
                entry_count = TransactionEntry.objects.filter(account=dup.account).count()
                self.stdout.write(
                    f'  -> Close : #{dup.pk} '
                    f'(GL {dup.account.code}, balance={dup.account.balance}, '
                    f'ledger entries={entry_count})'
                )

            if dry_run:
                continue

            with transaction.atomic():
                series, _ = TransactionSeries.objects.get_or_create(
                    code='MRGADM',
                    defaults={'description': 'Account Merge Administration'},
                )

                for dup in duplicates:
                    dup_balance = dup.account.balance

                    if dup_balance > Decimal('0.00'):
                        # Transfer the duplicate's balance to the primary via a
                        # proper balanced journal entry so the guard is never
                        # bypassed and the audit trail is complete.
                        #
                        # SAVINGS is credit-normal:
                        #   Dr dup.account   → reduces its balance to 0
                        #   Cr primary.account → increases primary's balance
                        journal = JournalEntry.objects.create(
                            series=series,
                            date=timezone.now().date(),
                            description=(
                                f'Account merge: '
                                f'{dup.account_number} -> {primary.account_number}'
                            ),
                            owner=primary.owner,
                            branch=primary.branch,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal,
                            account=dup.account,
                            side=TransactionEntry.DEBIT,
                            amount=dup_balance,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal,
                            account=primary.account,
                            side=TransactionEntry.CREDIT,
                            amount=dup_balance,
                        )
                        journal.post()
                        self.stdout.write(
                            f'    Transferred {dup_balance} via journal {journal.reference_number}'
                        )

                    elif dup_balance < Decimal('0.00'):
                        # Unusual: duplicate has a debit balance on a savings account.
                        # Reverse the direction so amounts remain positive.
                        abs_balance = abs(dup_balance)
                        journal = JournalEntry.objects.create(
                            series=series,
                            date=timezone.now().date(),
                            description=(
                                f'Account merge (debit-balance correction): '
                                f'{dup.account_number} -> {primary.account_number}'
                            ),
                            owner=primary.owner,
                            branch=primary.branch,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal,
                            account=dup.account,
                            side=TransactionEntry.CREDIT,
                            amount=abs_balance,
                        )
                        TransactionEntry.objects.create(
                            transaction=journal,
                            account=primary.account,
                            side=TransactionEntry.DEBIT,
                            amount=abs_balance,
                        )
                        journal.post()
                        self.stdout.write(
                            self.style.WARNING(
                                f'    WARNING: duplicate had negative balance {dup_balance}; '
                                f'reversed via journal {journal.reference_number}'
                            )
                        )

                    # Soft-delete the duplicate GL account.
                    # Balance is now 0 in the DB (zeroed by journal.post() above or
                    # was already 0).  Omitting 'balance' from update_fields means
                    # the Account.save() guard is never triggered.
                    dup.account.is_deleted = True
                    dup.account.save(update_fields=['is_deleted', 'updated_at'])

                    # Close and soft-delete the duplicate SavingsAccount.
                    dup.status = 'closed'
                    dup.is_deleted = True
                    dup.save(update_fields=['status', 'is_deleted', 'updated_at'])

                total_merged += len(duplicates)

        action = 'Would close' if dry_run else 'Closed'
        self.stdout.write(
            self.style.SUCCESS(f'\n  {action} {total_merged} duplicate savings account(s).')
        )

    # ------------------------------------------------------------------
    # Loans
    # ------------------------------------------------------------------
    def _merge_loans(self, dry_run: bool) -> None:
        from loans.models import LoanAccount

        self.stdout.write('\n=== Loan Account Duplicates ===')

        terminal = list(TERMINAL_LOAN_STATUSES)

        # Find (client, product) pairs with more than one active (non-terminal) loan.
        groups = (
            LoanAccount.objects
            .exclude(status__in=terminal)
            .values('client', 'product')
            .annotate(count=Count('id'))
            .filter(count__gt=1)
            .order_by('client', 'product')
        )

        if not groups.exists():
            self.stdout.write('  No duplicate active loan accounts found.')
            return

        total_cancelled = 0
        needs_manual = 0

        for group in groups:
            client_id = group['client']
            product_id = group['product']

            accounts = list(
                LoanAccount.objects
                .filter(client_id=client_id, product_id=product_id)
                .exclude(status__in=terminal)
                .select_related('client', 'product__product')
                .order_by('-outstanding_principal', 'id')
            )

            # Primary = highest outstanding balance (oldest on tie).
            primary = accounts[0]
            duplicates = accounts[1:]

            try:
                client_label = getattr(primary.client, 'full_name', str(primary.client))
            except Exception:
                client_label = f'client_id={client_id}'
            try:
                product_label = primary.product.product.name
            except Exception:
                product_label = f'product_id={product_id}'

            self.stdout.write(
                f'\n  Client : {client_label}\n'
                f'  Product: {product_label}\n'
                f'  Active loans found: {len(accounts)}'
            )
            self.stdout.write(
                f'  → Keep  : #{primary.pk} '
                f'(loan {primary.loan_number}, outstanding={primary.outstanding_principal})'
            )

            for dup in duplicates:
                # Only flag for manual review when outstanding principal is non-zero.
                # A loan with outstanding=0 (even if disbursed_amount>0, i.e. fully
                # repaid) is safe to cancel — no remaining debt exists.
                has_outstanding = dup.outstanding_principal > Decimal('0.00')
                if has_outstanding:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  -> MANUAL REVIEW NEEDED: #{dup.pk} '
                            f'(loan {dup.loan_number}, '
                            f'outstanding={dup.outstanding_principal}, '
                            f'disbursed={dup.disbursed_amount})'
                        )
                    )
                    needs_manual += 1
                else:
                    self.stdout.write(
                        f'  -> Cancel: #{dup.pk} '
                        f'(loan {dup.loan_number}, outstanding=0)'
                    )
                    if not dry_run:
                        with transaction.atomic():
                            dup.status = 'cancelled'
                            dup.is_deleted = True
                            dup.save(update_fields=['status', 'is_deleted', 'updated_at'])

                            dup.account.is_deleted = True
                            dup.account.save(update_fields=['is_deleted', 'updated_at'])

                        total_cancelled += 1

        action = 'Would cancel' if dry_run else 'Cancelled'
        self.stdout.write(
            self.style.SUCCESS(f'\n  {action} {total_cancelled} zero-balance duplicate loan account(s).')
        )
        if needs_manual:
            self.stdout.write(
                self.style.ERROR(
                    f'  {needs_manual} duplicate loan account(s) have non-zero balances '
                    f'and require MANUAL REVIEW before they can be merged.'
                )
            )
