"""
banks/management/commands/backfill_journal_entry_attribution.py
================================================================
One-time (and safely re-runnable) backfill for Transaction.created_by on
historical BankTransfer/BankPayment journal entries.

BankTransfer.complete() and BankPayment.post_payment() both receive the
acting user (`user` / `posted_by`) and record it on the transfer/payment
itself (`completed_by` / `posted_by`), but never passed created_by through
to the JournalEntry.objects.create() call that actually builds the
Transaction row bank reconciliation reads officer attribution from
(fetch_erp_payments() in banks/reconciliation_utils.py reads
txn.created_by only). That's been fixed going forward (see
BankTransfer.complete()/BankPayment.post_payment() in banks/models.py),
but every transfer/payment posted before the fix has a permanently
unattributed Transaction row — confirmed on production: 294/294 BTRF and
4/5 BKPAY journal entries had created_by NULL.

This command recovers the real actor from BankTransfer.completed_by /
BankPayment.posted_by (both were always correctly set — only the journal
entry's own created_by was missed) and backfills Transaction.created_by
from it. A transfer/payment with no completed_by/posted_by at all (should
not normally happen — both are required before completion/posting) is
left alone and reported separately rather than guessed at.

Usage:
    python manage.py backfill_journal_entry_attribution --dry-run
    python manage.py backfill_journal_entry_attribution
"""
from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Backfills Transaction.created_by on historical BankTransfer/BankPayment "
        "journal entries from completed_by/posted_by, recovering attribution lost "
        "before the created_by fix in BankTransfer.complete()/BankPayment.post_payment()."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import BankTransfer, BankPayment

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        updates = []  # (journal_entry, actor, label)
        skipped_no_actor = []

        transfers = BankTransfer.objects.filter(
            journal_entry__isnull=False, journal_entry__created_by__isnull=True,
        ).select_related('journal_entry', 'completed_by')
        for t in transfers:
            label = f'BankTransfer {t.transfer_number} (id={t.id}, journal_entry={t.journal_entry_id})'
            if not t.completed_by_id:
                skipped_no_actor.append(label)
                continue
            updates.append((t.journal_entry, t.completed_by, label))

        payments = BankPayment.objects.filter(
            journal_entry__isnull=False, journal_entry__created_by__isnull=True,
        ).select_related('journal_entry', 'posted_by')
        for p in payments:
            label = f'BankPayment {p.payment_number} (id={p.id}, journal_entry={p.journal_entry_id})'
            if not p.posted_by_id:
                skipped_no_actor.append(label)
                continue
            updates.append((p.journal_entry, p.posted_by, label))

        for journal_entry, actor, label in updates:
            self.stdout.write(f'  {"[DRY RUN] " if dry_run else ""}{label}: created_by -> {actor}')

        if not dry_run and updates:
            with db_transaction.atomic():
                for journal_entry, actor, _label in updates:
                    journal_entry.created_by = actor
                    journal_entry.save(update_fields=['created_by'])

        action = 'Would update' if dry_run else 'Updated'
        count = len(updates)
        self.stdout.write(f'\n{action} {count} journal entr{"y" if count == 1 else "ies"}.')

        if skipped_no_actor:
            self.stdout.write(self.style.WARNING(
                f'\n{len(skipped_no_actor)} had no completed_by/posted_by to recover from '
                f'— left unattributed:'
            ))
            for label in skipped_no_actor:
                self.stdout.write(f'  {label}')

        if not updates and not skipped_no_actor:
            self.stdout.write(self.style.SUCCESS('No unattributed BankTransfer/BankPayment journal entries found.'))
