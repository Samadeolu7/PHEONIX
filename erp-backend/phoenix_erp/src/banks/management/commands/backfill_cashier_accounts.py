"""
Management command to backfill CashierAccount records for existing
BankAccounts that have is_cashier_collection_account=True.

Run after deploying the auto_create_cashier_account_from_collection_bank
signal to create CashierAccount records for BankAccounts that were saved
before the signal existed.

Usage:
    python manage.py backfill_cashier_accounts
    python manage.py backfill_cashier_accounts --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Create CashierAccount records for existing collection BankAccounts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without making changes',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from banks.models import BankAccount
        from cash_management.models import CashierAccount

        dry_run = options.get('dry_run')

        qs = BankAccount.objects.filter(
            is_cashier_collection_account=True,
            gl_account__isnull=False,
        ).select_related('bank')

        created_count = 0
        skipped_count = 0
        restored_count = 0

        for ba in qs:
            existing = CashierAccount.objects.filter(account=ba.gl_account)

            if existing.filter(is_deleted=False).exists():
                skipped_count += 1
                continue

            dead = existing.filter(is_deleted=True).first()
            if dead:
                if dry_run:
                    self.stdout.write(
                        f"[DRY-RUN] Would restore CashierAccount COL{ba.id} "
                        f"for BankAccount {ba.account_number}"
                    )
                else:
                    dead.is_deleted = False
                    dead.is_active = True
                    dead.save(update_fields=['is_deleted', 'is_active'])
                    restored_count += 1
                continue

            display_name = ba.account_name or str(ba.bank)
            if dry_run:
                self.stdout.write(
                    f"[DRY-RUN] Would create CashierAccount COL{ba.id} "
                    f"('Collection - {display_name} - {ba.account_number}') "
                    f"for BankAccount {ba.account_number}"
                )
            else:
                CashierAccount.objects.create(
                    account=ba.gl_account,
                    account_number=f"COL{ba.id}",
                    name=f"Collection - {display_name} - {ba.account_number}",
                    is_active=True,
                    branch=ba.branch,
                    owner=ba.owner,
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY-RUN] Would create' if dry_run else 'Created'} "
            f"{created_count} new, restored {restored_count}, "
            f"skipped {skipped_count} existing."
        ))
