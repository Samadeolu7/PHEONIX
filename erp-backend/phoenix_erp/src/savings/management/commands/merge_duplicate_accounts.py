"""
savings/management/commands/merge_duplicate_accounts.py
=======================================================
Merges duplicate SavingsAccount and LoanAccount records where the same
client holds more than one account linked to the same product.

For savings accounts
--------------------
- Groups all non-deleted, non-closed accounts by (client, product).
- Keeps the oldest (lowest pk) non-closed account as the canonical record.
- Adds the GL balances of every other account in the group to the canonical.
- Zeroes out and soft-deletes the surplus accounts (and their GL accounts).

For loan accounts
-----------------
- Groups all non-deleted, non-terminal accounts by (client, product).
- Keeps the account with the highest outstanding_principal (tie-break: lowest pk).
- Cancels and soft-deletes duplicate loans that have zero outstanding balance.
- Reports (does NOT auto-merge) duplicates that carry a non-zero balance; those
  need manual review because merging loan schedules is complex.

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
from django.db.models import Count

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
                .order_by('id')  # oldest first
            )

            # Primary = oldest non-closed account; fall back to oldest overall.
            primary = next((a for a in accounts if a.status != 'closed'), accounts[0])
            duplicates = [a for a in accounts if a.pk != primary.pk]

            combined_balance = sum(
                (a.account.balance for a in accounts),
                Decimal('0.00'),
            )
            client_label = getattr(primary.client, 'full_name', str(primary.client))
            product_label = primary.product.name

            self.stdout.write(
                f'\n  Client : {client_label}\n'
                f'  Product: {product_label}\n'
                f'  Accounts found: {len(accounts)} | Combined GL balance: {combined_balance}'
            )
            self.stdout.write(
                f'  → Keep  : #{primary.pk} '
                f'(GL {primary.account.code}, balance={primary.account.balance})'
            )
            for dup in duplicates:
                self.stdout.write(
                    f'  → Merge : #{dup.pk} '
                    f'(GL {dup.account.code}, balance={dup.account.balance})'
                )

            if dry_run:
                continue

            with transaction.atomic():
                # Transfer the combined balance to the primary GL account.
                primary.account.balance = combined_balance
                primary.account.save(update_fields=['balance', 'updated_at'])

                for dup in duplicates:
                    # Zero the duplicate GL account and soft-delete it.
                    dup.account.balance = Decimal('0.00')
                    dup.account.is_deleted = True
                    dup.account.save(update_fields=['balance', 'is_deleted', 'updated_at'])

                    # Close and soft-delete the duplicate savings account.
                    dup.status = 'closed'
                    dup.is_deleted = True
                    dup.save(update_fields=['status', 'is_deleted', 'updated_at'])

                total_merged += len(duplicates)

        action = 'Would merge' if dry_run else 'Merged'
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
                has_balance = (
                    dup.outstanding_principal > Decimal('0.00')
                    or dup.disbursed_amount > Decimal('0.00')
                )
                if has_balance:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  → MANUAL REVIEW NEEDED: #{dup.pk} '
                            f'(loan {dup.loan_number}, '
                            f'outstanding={dup.outstanding_principal}, '
                            f'disbursed={dup.disbursed_amount})'
                        )
                    )
                    needs_manual += 1
                else:
                    self.stdout.write(
                        f'  → Cancel: #{dup.pk} '
                        f'(loan {dup.loan_number}, zero balance)'
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
