"""
One-off management command to point a Supplier at an EXISTING GL account —
typically one already created for that supplier by a prior data migration
(e.g. an opening-balance import that named an account after the vendor,
like "KPD Concept (2026)") — instead of the fresh account backfill_supplier_
accounts or the auto-provisioning signal would otherwise create.

Handles the case where backfill_supplier_accounts (or the signal) already
ran and created/linked a NEW account for the supplier before anyone noticed
a matching legacy account already existed: whatever balance and
AccountsPayable rows landed on the wrong (new) account are moved onto the
correct (target) account via a single GL transfer entry, and the now-empty
auto-created account is soft-deleted (only if it was auto-created by this
codebase — a pre-existing/legacy account is never touched or deleted).

Usage:
    python manage.py relink_supplier_account --supplier-code SUP-20260729-8679 --target-account-code 2109
    python manage.py relink_supplier_account --supplier-code SUP-20260729-8679 --target-account-code 2109 --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Relink a Supplier onto an existing GL account (e.g. one from a prior migration), moving any balance already posted to the wrong account"

    def add_arguments(self, parser):
        parser.add_argument('--supplier-code', required=True)
        parser.add_argument(
            '--target-account-code', required=True,
            help='Code of the existing GL account to link this supplier to (e.g. "2109").',
        )
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually make the change and post the transfer entry (default is dry-run).',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from liabilities.models import AccountsPayable
        from procurement.models import Supplier
        from django.contrib.contenttypes.models import ContentType
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from django.utils import timezone

        apply_changes = options['apply']
        supplier_code = options['supplier_code']
        target_code = options['target_account_code']

        supplier = Supplier.objects.filter(supplier_code=supplier_code, is_deleted=False).first()
        if not supplier:
            raise CommandError(f"No supplier found with supplier_code={supplier_code!r}")

        scope_filter = {'code': target_code}
        if supplier.branch_id:
            scope_filter['branch'] = supplier.branch
        target_account = Account.objects.filter(**scope_filter).first()
        if not target_account:
            raise CommandError(f"No account found with code={target_code!r} in this supplier's branch")

        if target_account.account_type != 'LIABILITY':
            raise CommandError(
                f"Account {target_code} is {target_account.account_type}, not LIABILITY — "
                f"cannot be used as an AccountsPayable subledger account."
            )
        if target_account.account_level != Account.LEVEL_CHILD:
            raise CommandError(f"Account {target_code} is a PARENT account — postings must go to a CHILD account.")

        # Refuse to steal an account another supplier is already using.
        existing_owner = Supplier.objects.filter(account_id=target_account.id).exclude(pk=supplier.pk).first()
        if existing_owner:
            raise CommandError(
                f"Account {target_code} is already linked to supplier "
                f"{existing_owner.supplier_code} - {existing_owner.name}."
            )

        old_account = supplier.account
        if old_account and old_account.id == target_account.id:
            self.stdout.write(self.style.SUCCESS(f"{supplier.supplier_code} is already linked to {target_code}. Nothing to do."))
            return

        self.stdout.write(
            f"{'[DRY-RUN] ' if not apply_changes else ''}"
            f"Relinking {supplier.supplier_code} - {supplier.name}: "
            f"{f'{old_account.code} ({old_account.name})' if old_account else '(none)'} -> "
            f"{target_account.code} ({target_account.name})"
        )

        supplier_ct = ContentType.objects.get_for_model(Supplier)
        affected_aps = list(
            AccountsPayable.objects.filter(
                content_type=supplier_ct, object_id=str(supplier.pk), is_deleted=False,
                account_id=old_account.id if old_account else None,
            )
        ) if old_account else []

        transfer_amount = Decimal('0.00')
        if old_account:
            old_account.refresh_from_db()
            transfer_amount = old_account.balance

        for ap in affected_aps:
            self.stdout.write(f"  - would repoint AP {ap.reference_number or ap.invoice_number} onto {target_code}")
        if transfer_amount != 0:
            direction = f"Dr {old_account.code} / Cr {target_code}" if transfer_amount > 0 else f"Dr {target_code} / Cr {old_account.code}"
            self.stdout.write(f"  - would transfer {abs(transfer_amount)} ({direction})")

        if not apply_changes:
            self.stdout.write("Re-run with --apply to make this change.")
            return

        with transaction.atomic():
            if old_account and transfer_amount != 0:
                series, _ = TransactionSeries.objects.get_or_create(
                    code='RELNK', defaults={'description': 'GL Account Transfer / Correction'},
                )
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=(
                        f"Relink {supplier.name} onto existing account {target_account.name} "
                        f"(was {old_account.name})"
                    ),
                    workflow_reference=f"RELINK-{supplier.supplier_code}",
                    branch=supplier.branch,
                    owner=supplier.owner,
                    tenant=supplier.tenant,
                )
                dr_account, cr_account = (old_account, target_account) if transfer_amount > 0 else (target_account, old_account)
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=dr_account,
                    side=JournalEntryLine.DEBIT, amount=abs(transfer_amount),
                )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=cr_account,
                    side=JournalEntryLine.CREDIT, amount=abs(transfer_amount),
                )
                journal_entry.post()

            for ap in affected_aps:
                ap.account = target_account
                ap.save(update_fields=['account'])

            supplier.account = target_account
            supplier.save(update_fields=['account'])

            if old_account and old_account.is_system_account:
                old_account.refresh_from_db()
                if old_account.balance == 0:
                    old_account.is_deleted = True
                    old_account.save(update_fields=['is_deleted'])
                    self.stdout.write(f"  - soft-deleted now-empty auto-created account {old_account.code}")

        self.stdout.write(self.style.SUCCESS(
            f"Relinked {supplier.supplier_code} onto {target_code}. "
            f"Repointed {len(affected_aps)} AP row(s), transferred {abs(transfer_amount)}."
        ))
