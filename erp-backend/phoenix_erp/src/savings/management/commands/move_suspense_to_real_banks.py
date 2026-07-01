"""
savings/management/commands/move_suspense_to_real_banks.py
=============================================================
Final cleanup for the misrouted bank_account_id incident.

fix_misrouted_parent_entries moved 113,200.00 (misposted directly onto
parent accounts 2100 / 4200 by the old bank_account_id-resolution bug) into
a suspense account (1119, "Unidentified Cash Receipts - Pending
Reconciliation"), pending identification of the real destination.

That identification is now confirmed: the old bug did
Account.objects.get(pk=bank_account_id) against the GL chart of accounts
instead of BankAccount.objects.get(pk=bank_account_id).gl_account. Since
accounts.Account and banks.BankAccount are independent tables with
independent id sequences, whichever real BankAccount a cashier picked in
the UI just happened to collide numerically with a GL account:
  - BankAccount id=4 (First Bank Plc, 2048508315) collided with GL 2100
  - BankAccount id=5 (Moniepoint, 6683612430)     collided with GL 4200

This command moves each amount out of the suspense account into the real
bank's actual linked GL account (BankAccount.gl_account), determined per
suspense entry by inspecting its sibling entry in the same reclassification
journal (the parent account it was originally misposted onto) rather than
hardcoding amounts, so it's robust to running it fresh from whatever is
actually still sitting in suspense.

Usage
-----
    python manage.py move_suspense_to_real_banks --dry-run
    python manage.py move_suspense_to_real_banks
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

SUSPENSE_ACCOUNT_NAME = 'Unidentified Cash Receipts - Pending Reconciliation'
MOVE_SERIES_CODE = 'MOVEB'  # TransactionSeries.code is varchar(5)

# GL account code (misrouted destination) -> BankAccount.pk (real destination)
ORIGIN_GL_CODE_TO_BANK_ACCOUNT_ID = {
    '2100': 4,  # First Bank Plc, 2048508315
    '4200': 5,  # Moniepoint, 6683612430
}


class Command(BaseCommand):
    help = (
        'Moves funds out of the suspense account (created by '
        'fix_misrouted_parent_entries) into the real bank GL accounts they '
        'actually belong to, now that the mapping is confirmed.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from accounts.models import Account
        from banks.models import BankAccount
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        try:
            suspense_account = Account.objects.get(
                name=SUSPENSE_ACCOUNT_NAME, is_deleted=False
            )
        except Account.DoesNotExist:
            self.stdout.write(self.style.SUCCESS(
                'No suspense account found — nothing to move.'
            ))
            return

        entries = (
            TransactionEntry.objects
            .filter(account=suspense_account, side=TransactionEntry.DEBIT,
                    transaction__is_deleted=False)
            .select_related('transaction')
        )

        if not entries.exists():
            self.stdout.write(self.style.SUCCESS(
                f'Suspense account {suspense_account.code} has no debit entries '
                f'left to move. Nothing to do.'
            ))
            return

        # Group by origin GL code (found via the sibling credit entry in the
        # same reclassification journal) so multiple suspense entries with
        # the same origin move in one journal.
        by_origin: dict[str, Decimal] = {}
        source_entries: dict[str, list] = {}
        for entry in entries:
            sibling = (
                TransactionEntry.objects
                .filter(transaction=entry.transaction)
                .exclude(pk=entry.pk)
                .select_related('account')
                .first()
            )
            if not sibling:
                self.stdout.write(self.style.ERROR(
                    f'  Entry {entry.pk} ({entry.transaction.reference_number}) has '
                    f'no sibling entry — skipping, needs manual review.'
                ))
                continue
            origin_code = sibling.account.code
            by_origin[origin_code] = by_origin.get(origin_code, Decimal('0.00')) + entry.amount
            source_entries.setdefault(origin_code, []).append(entry.transaction.reference_number)

        unmapped = set(by_origin) - set(ORIGIN_GL_CODE_TO_BANK_ACCOUNT_ID)
        if unmapped:
            self.stdout.write(self.style.ERROR(
                f'  Found suspense funds from unmapped origin account(s): {unmapped}. '
                f'Add them to ORIGIN_GL_CODE_TO_BANK_ACCOUNT_ID before running this '
                f'command, or handle manually. Aborting.'
            ))
            return

        self.stdout.write('Suspense funds to move:\n')
        for origin_code, amount in by_origin.items():
            bank_account_id = ORIGIN_GL_CODE_TO_BANK_ACCOUNT_ID[origin_code]
            bank_account = BankAccount.objects.get(pk=bank_account_id)
            self.stdout.write(
                f'  {amount} (originally misrouted via GL {origin_code}) -> '
                f'{bank_account.bank.bank_name} {bank_account.account_number} '
                f'(GL {bank_account.gl_account.code})\n'
                f'    From: {", ".join(source_entries[origin_code])}'
            )

        if dry_run:
            return

        with db_transaction.atomic():
            move_series, _ = TransactionSeries.objects.get_or_create(
                code=MOVE_SERIES_CODE,
                defaults={'description': 'Suspense to Real Bank Account Reclassification'},
            )

            for origin_code, amount in by_origin.items():
                bank_account_id = ORIGIN_GL_CODE_TO_BANK_ACCOUNT_ID[origin_code]
                bank_account = BankAccount.objects.get(pk=bank_account_id)
                target_gl = bank_account.gl_account

                description = (
                    f'Move {amount} from suspense to real bank '
                    f'{bank_account.bank.bank_name} {bank_account.account_number} '
                    f'(originally misrouted via GL {origin_code})'
                )[:255]

                journal = Transaction.objects.create(
                    series=move_series,
                    date=timezone.now().date(),
                    description=description,
                    owner=suspense_account.owner,
                    branch=suspense_account.branch,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=suspense_account,
                    side=TransactionEntry.CREDIT, amount=amount,
                )
                TransactionEntry.objects.create(
                    transaction=journal, account=target_gl,
                    side=TransactionEntry.DEBIT, amount=amount,
                )
                journal.post()

                self.stdout.write(self.style.SUCCESS(
                    f'  Moved {amount} to {bank_account.bank.bank_name} '
                    f'{bank_account.account_number} via journal {journal.reference_number}'
                ))

        self.stdout.write(self.style.SUCCESS('\nDone.'))
