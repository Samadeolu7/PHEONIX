"""
Management command to give every existing Supplier its own dedicated GL
subledger account, and reallocate any outstanding AccountsPayable balance
off the old shared "General Trade Creditors" account onto it.

Two things happen per supplier:
  1. If the supplier has no `.account` yet, create one (same helper the
     post_save signal uses for newly created suppliers).
  2. For any outstanding (unpaid/partial) AccountsPayable rows still pointed
     at a different account (i.e. the old shared system account), post one
     reallocation journal entry — Dr <old account> / Cr <supplier's own
     account> — for the supplier's total amount_due, then repoint those
     AccountsPayable rows onto the new account. Fully paid/cancelled rows
     are left untouched; they have no outstanding balance and don't affect
     anything going forward.

This posts real GL entries, so it defaults to a dry run. Pass --apply to
actually create accounts and post the reallocation entries.

Usage:
    python manage.py backfill_supplier_accounts
    python manage.py backfill_supplier_accounts --apply
    python manage.py backfill_supplier_accounts --apply --supplier-code KPD001
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Provision per-supplier GL accounts and reallocate outstanding AP balances onto them"

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually create accounts and post reallocation entries (default is dry-run).',
        )
        parser.add_argument(
            '--supplier-code',
            default=None,
            help='Limit to a single supplier by supplier_code (useful for spot-checking one vendor first).',
        )

    def handle(self, *args, **options):
        from procurement.models import Supplier
        from liabilities.models import AccountsPayable
        from accounts.utils.account_creation import get_or_create_supplier_payable_account
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from django.contrib.contenttypes.models import ContentType
        from django.utils import timezone

        apply_changes = options['apply']
        supplier_code = options.get('supplier_code')

        suppliers = Supplier.objects.filter(is_deleted=False)
        if supplier_code:
            suppliers = suppliers.filter(supplier_code=supplier_code)

        supplier_ct = ContentType.objects.get_for_model(Supplier)

        accounts_created = 0
        suppliers_reallocated = 0
        total_reallocated = Decimal('0.00')

        for supplier in suppliers:
            # ── 1. Ensure the supplier has its own account ──────────────────
            if not supplier.account_id:
                if apply_changes:
                    account = get_or_create_supplier_payable_account(
                        supplier, supplier.owner, supplier.branch
                    )
                else:
                    self.stdout.write(
                        f"[DRY-RUN] Would create GL account for supplier "
                        f"{supplier.supplier_code} - {supplier.name}"
                    )
                    accounts_created += 1
                    continue  # can't reallocate without a real account
                accounts_created += 1
            else:
                account = supplier.account

            # ── 2. Reallocate outstanding AP balance off any other account ──
            outstanding = list(
                AccountsPayable.objects
                .filter(
                    content_type=supplier_ct,
                    object_id=str(supplier.pk),
                    status__in=['unpaid', 'partial'],
                    is_deleted=False,
                )
                .exclude(account_id=account.id)
                .select_related('account')
            )
            if not outstanding:
                continue

            # Group by the (single, in practice) old shared account.
            by_old_account = {}
            for ap in outstanding:
                by_old_account.setdefault(ap.account_id, []).append(ap)

            for old_account_id, aps in by_old_account.items():
                old_account = aps[0].account
                supplier_total = sum((ap.amount_due for ap in aps), Decimal('0.00'))
                if supplier_total <= 0:
                    continue

                if not apply_changes:
                    self.stdout.write(
                        f"[DRY-RUN] Would reallocate {supplier_total} for "
                        f"{supplier.supplier_code} - {supplier.name} "
                        f"from '{old_account.name}' ({old_account.code}) to "
                        f"'{account.name}' ({account.code}) "
                        f"across {len(aps)} AP row(s): "
                        + ", ".join(ap.reference_number or ap.invoice_number for ap in aps)
                    )
                    suppliers_reallocated += 1
                    total_reallocated += supplier_total
                    continue

                with transaction.atomic():
                    series, _ = TransactionSeries.objects.get_or_create(
                        code='APRLC',
                        defaults={'description': 'Accounts Payable Subledger Reallocation'},
                    )
                    journal_entry = JournalEntry.objects.create(
                        series=series,
                        date=timezone.now().date(),
                        description=(
                            f"Opening balance reallocation: {supplier.name} — "
                            f"onto dedicated supplier account"
                        ),
                        workflow_reference=f"APRLC-{supplier.supplier_code}",
                        branch=supplier.branch,
                        owner=supplier.owner,
                        tenant=supplier.tenant,
                    )

                    # Dr: old shared account — clears the pooled liability
                    JournalEntryLine.objects.create(
                        transaction=journal_entry,
                        account=old_account,
                        side=JournalEntryLine.DEBIT,
                        amount=supplier_total,
                    )
                    # Cr: supplier's own account — re-establishes the same liability there
                    JournalEntryLine.objects.create(
                        transaction=journal_entry,
                        account=account,
                        side=JournalEntryLine.CREDIT,
                        amount=supplier_total,
                    )
                    journal_entry.post()

                    for ap in aps:
                        ap.account = account
                        ap.save(update_fields=['account'])

                self.stdout.write(self.style.SUCCESS(
                    f"Reallocated {supplier_total} for {supplier.supplier_code} - "
                    f"{supplier.name} onto account {account.code}"
                ))
                suppliers_reallocated += 1
                total_reallocated += supplier_total

        prefix = '[DRY-RUN] ' if not apply_changes else ''
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}Accounts created: {accounts_created}. "
            f"Suppliers reallocated: {suppliers_reallocated}. "
            f"Total reallocated: {total_reallocated}."
        ))
        if not apply_changes:
            self.stdout.write("Re-run with --apply to make these changes.")
