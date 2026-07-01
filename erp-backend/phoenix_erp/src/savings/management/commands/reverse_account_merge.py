"""
savings/management/commands/reverse_account_merge.py
=====================================================
Reverses the changes made by merge_duplicate_accounts.

For each completed MERGE-series journal (non-zero balance transfer):
  - Posts an equal-and-opposite reversal journal so both GL accounts
    return to their pre-merge balances.
  - Marks the original MERGE journal as reversed.

For every SavingsAccount soft-deleted by the merge:
  - Restores is_deleted=False and status='active' on both the
    SavingsAccount record and its GL account.

Usage
-----
    python manage.py reverse_account_merge
    python manage.py reverse_account_merge --dry-run
"""
from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Reverse the changes made by merge_duplicate_accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be reversed without making any changes.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self._reverse_savings(dry_run)
        self.stdout.write(self.style.SUCCESS('\nDone.'))

    # ------------------------------------------------------------------
    def _reverse_savings(self, dry_run: bool) -> None:
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry,
            TransactionSeries,
        )
        from savings.models import SavingsAccount

        self.stdout.write('\n=== Reversing Savings Account Merge ===')

        # ── Step 1: Reverse any MERGE balance-transfer journals ───────────
        try:
            merge_series = TransactionSeries.objects.get(code='MERGE')
        except TransactionSeries.DoesNotExist:
            self.stdout.write('  No MERGE series found — no balance journals to reverse.')
            merge_series = None

        if merge_series:
            # Only original merge journals, not the reversals themselves
            merge_journals = JournalEntry.objects.filter(
                series=merge_series,
                approved=True,
                is_deleted=False,
                is_reversed=False,
                is_reversal=False,
            )

            if not merge_journals.exists():
                self.stdout.write('  No active MERGE journals to reverse.')
            else:
                from accounts.models import Account as GlAccount
                from django.db.models import F

                for journal in merge_journals:
                    entries = list(journal.entries.all())
                    if not entries:
                        continue

                    # In the original MERGE journal:
                    #   DEBIT  → duplicate GL account (balance was zeroed)
                    #   CREDIT → primary GL account   (balance was increased)
                    amount = entries[0].amount
                    self.stdout.write(
                        f'  Reversing journal {journal.reference_number} (amount={amount})'
                    )

                    if not dry_run:
                        with transaction.atomic():
                            # Create the reversal journal record.
                            reversal = JournalEntry.objects.create(
                                series=merge_series,
                                date=timezone.now().date(),
                                description=(
                                    f'Reversal of merge journal {journal.reference_number}'
                                ),
                                owner=journal.owner,
                                branch=journal.branch,
                                is_reversal=True,
                                reverses_transaction=journal,
                            )

                            # Apply reversed balance deltas directly via queryset
                            # update — the same mechanism TransactionEntry.post()
                            # uses internally.  This works even if the dup account
                            # is still soft-deleted (is_deleted=True) because we
                            # use all_objects (include_deleted=True) and Account
                            # balances are updated through QuerySet.update(), not
                            # Account.save(), so the balance guard is irrelevant.
                            for entry in entries:
                                # Savings accounts are credit-normal:
                                #   original DEBIT on dup   → balance_effect = -amount
                                #   original CREDIT on primary → balance_effect = +amount
                                # Reversal (swap sides):
                                #   CREDIT on dup   → balance_effect = +amount (restore)
                                #   DEBIT on primary → balance_effect = -amount (restore)
                                if entry.side == TransactionEntry.DEBIT:
                                    reversal_delta = entry.amount      # CREDIT restores dup
                                    reversed_side = TransactionEntry.CREDIT
                                else:
                                    reversal_delta = -entry.amount     # DEBIT reduces primary
                                    reversed_side = TransactionEntry.DEBIT

                                # Update the GL account balance directly.
                                GlAccount.all_objects.filter(pk=entry.account_id).update(
                                    balance=F('balance') + reversal_delta
                                )

                                # Create the reversal entry and mark it posted.
                                rev_entry = TransactionEntry.objects.create(
                                    transaction=reversal,
                                    account_id=entry.account_id,
                                    side=reversed_side,
                                    amount=entry.amount,
                                )
                                rev_entry.posted = True
                                rev_entry.posted_at = timezone.now()
                                rev_entry.save(update_fields=['posted', 'posted_at'])

                            # Mark reversal journal as approved.
                            reversal.approved = True
                            reversal.approved_at = timezone.now()
                            reversal.save(update_fields=['approved', 'approved_at'])

                            # Mark original MERGE journal as reversed.
                            journal.is_reversed = True
                            journal.reversed_at = timezone.now()
                            journal.reversal_transaction = reversal
                            journal.save(update_fields=[
                                'is_reversed', 'reversed_at', 'reversal_transaction',
                            ])

                        self.stdout.write(
                            f'    → Posted reversal {reversal.reference_number}'
                        )

        # ── Step 2: Restore soft-deleted duplicate SavingsAccounts ────────
        self.stdout.write('\n  Restoring soft-deleted savings accounts ...')

        # all_objects includes soft-deleted records
        merged_sas = (
            SavingsAccount.all_objects
            .filter(is_deleted=True, status='closed', account__is_deleted=True)
            .select_related('account', 'client', 'product')
        )

        restored = 0
        for sa in merged_sas:
            # Only restore when an active "primary" still exists for the same
            # client + product (confirms this was a merge-closed duplicate,
            # not an account closed for other reasons).
            primary_exists = (
                SavingsAccount.objects
                .filter(client_id=sa.client_id, product_id=sa.product_id, is_deleted=False)
                .exclude(pk=sa.pk)
                .exists()
            )
            if not primary_exists:
                continue

            client_label = getattr(sa.client, 'full_name', str(sa.client))
            self.stdout.write(
                f'  Restoring SavingsAccount #{sa.pk} '
                f'(GL {sa.account.code}) — client: {client_label}'
            )

            if not dry_run:
                with transaction.atomic():
                    # Restore GL account.  'balance' is NOT in update_fields so
                    # the Account.save() guard is never triggered.
                    sa.account.is_deleted = False
                    sa.account.save(update_fields=['is_deleted', 'updated_at'])

                    # Restore SavingsAccount
                    sa.status = 'active'
                    sa.is_deleted = False
                    sa.save(update_fields=['status', 'is_deleted', 'updated_at'])

                restored += 1

        action = 'Would restore' if dry_run else 'Restored'
        self.stdout.write(
            self.style.SUCCESS(f'\n  {action} {restored} savings account(s).')
        )
