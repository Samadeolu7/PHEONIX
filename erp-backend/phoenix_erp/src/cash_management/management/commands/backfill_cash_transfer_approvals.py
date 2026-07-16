"""
cash_management/management/commands/backfill_cash_transfer_approvals.py
=========================================================================
One-time backfill for CashTransfer records posted before the fix in
CashTransfer.post() (cash_management/models.py) that added the missing
journal_entry.post() call.

Why: CashTransfer.post() created its two TransactionEntry rows (bank debit /
cashier credit) but never called Transaction.post() on the parent journal
entry. That left journal_entry.approved=False forever, which made these
transfers invisible to bank reconciliation's fetch_erp_payments()
(banks/reconciliation_utils.py), since it only considers approved
transactions as bank-credit candidates. It also meant the GL Account.balance
for the destination bank account and the cashier's GL account were never
actually updated by these transfers (TransactionEntry.posted stayed False).

This command finds every CashTransfer stuck in that state and posts its
journal entry, exactly as CashTransfer.post() should have done at creation
time. It is idempotent — safe to re-run — because it only ever selects rows
where journal_entry.approved is still False.

Usage
-----
    python manage.py backfill_cash_transfer_approvals --dry-run
    python manage.py backfill_cash_transfer_approvals
    python manage.py backfill_cash_transfer_approvals --branch 2
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Posts the journal entry for every CashTransfer that was marked "
        "'posted' but whose journal entry was never actually approved, "
        "making it visible to bank reconciliation."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--branch', dest='branch_id', type=int, default=None,
            help='Restrict to a single branch id (default: all branches).',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview what would change without making any changes.',
        )

    def handle(self, *args, **options):
        from cash_management.models import CashTransfer
        from transactions.models import Transaction

        dry_run = options['dry_run']
        branch_id = options['branch_id']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        qs = CashTransfer.objects.filter(
            status='posted',
            journal_entry__isnull=False,
            journal_entry__approved=False,
        ).select_related('journal_entry', 'cashier_account', 'destination_account')

        if branch_id is not None:
            qs = qs.filter(branch_id=branch_id)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS('No affected CashTransfer records found.'))
            return

        self.stdout.write(f'Found {total} CashTransfer(s) with an unapproved journal entry:\n')

        fixed = 0
        failed = 0

        for transfer in qs.order_by('transfer_date'):
            je = transfer.journal_entry
            self.stdout.write(
                f'  {transfer.transfer_number}: {transfer.cashier_account} -> '
                f'{transfer.destination_account} amount={transfer.amount} '
                f'date={transfer.transfer_date} journal_entry={je.reference_number}'
            )

            if dry_run:
                continue

            try:
                with db_transaction.atomic():
                    je.post()
                    # Preserve the original posting time for audit accuracy
                    # instead of leaving today's date on approved_at.
                    Transaction.objects.filter(pk=je.pk).update(
                        approved_at=transfer.posted_at or transfer.transfer_date
                    )
                fixed += 1
            except Exception as exc:
                failed += 1
                self.stdout.write(self.style.ERROR(
                    f'    FAILED to post {transfer.transfer_number}: {exc}'
                ))

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'\n{total} row(s) would be posted. Re-run without --dry-run to apply.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(f'\nPosted {fixed} row(s).'))
            if failed:
                self.stdout.write(self.style.ERROR(f'{failed} row(s) failed — see above.'))
