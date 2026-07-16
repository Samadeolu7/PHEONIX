"""
banks/management/commands/dedupe_reconciliation_exceptions.py
================================================================
One-time (and safely re-runnable) cleanup for duplicate ReconciliationException
rows created by a dedup bug in _persist_outcome (banks/tasks.py): the
get_or_create dedup_filter used to include resolved=False, so once a director
resolved a bank_only/erp_only/amount_diff exception whose underlying bank line
was still genuinely unmatched (ReconciliationBankTransaction.matched never
flips True for a manually-resolved-without-a-match exception), the NEXT rerun
could never find that resolved row — the filter excluded it — and created a
brand new duplicate exception for the exact same bank_transaction_id /
loan_payment_id. That silently reopened work a director had already closed
out, and inflated DailyReconciliation.unmatched_bank_count/unmatched_erp_count
(both counted from unresolved exceptions) past the true number of outstanding
bank lines.

This command:
  1. Finds every group of ReconciliationException rows sharing the same
     natural key (reconciliation, exception_type, bank_transaction_id and/or
     loan_payment_id depending on type) with more than one row.
  2. Keeps exactly one row per group — the earliest resolved=True row if any
     exist (a director's decision should win over a stale duplicate),
     otherwise the earliest created row — and deletes the rest.
  3. Recomputes matched_count/unmatched_bank_count/unmatched_erp_count/
     total_bank_transactions on every DailyReconciliation touched, using the
     same aggregation _persist_outcome runs after a normal match.

Safe to re-run — a second pass finds nothing once duplicates are gone.

Run this BEFORE applying the migration that adds ReconciliationException's
partial unique constraints (uniq_bank_only_exception_per_recon etc.) — that
migration will fail outright on a table that still has duplicate rows.

Usage:
    python manage.py dedupe_reconciliation_exceptions --dry-run
    python manage.py dedupe_reconciliation_exceptions
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Count

NATURAL_KEYS = {
    'bank_only':   ['reconciliation_id', 'exception_type', 'bank_transaction_id'],
    'erp_only':    ['reconciliation_id', 'exception_type', 'loan_payment_id'],
    'amount_diff': ['reconciliation_id', 'exception_type', 'bank_transaction_id', 'loan_payment_id'],
}


class Command(BaseCommand):
    help = (
        "Merges duplicate ReconciliationException rows created by the pre-fix dedup "
        "bug in _persist_outcome, then recomputes affected DailyReconciliation counts. "
        "Run before applying the partial-unique-constraint migration."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import DailyReconciliation, ReconciliationException

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        touched_recon_ids: set[int] = set()
        total_deleted = 0
        total_groups = 0

        for exc_type, key_fields in NATURAL_KEYS.items():
            dupe_groups = (
                ReconciliationException.objects
                .filter(exception_type=exc_type)
                .values(*key_fields)
                .annotate(n=Count('id'))
                .filter(n__gt=1)
            )
            for group in dupe_groups:
                total_groups += 1
                filter_kwargs = {k: group[k] for k in key_fields}
                rows = list(
                    ReconciliationException.objects.filter(**filter_kwargs).order_by('created_at')
                )
                resolved_rows = [r for r in rows if r.resolved]
                keeper = resolved_rows[0] if resolved_rows else rows[0]
                losers = [r for r in rows if r.pk != keeper.pk]

                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}recon={group["reconciliation_id"]} '
                    f'{exc_type}: keeping id={keeper.pk} (resolved={keeper.resolved}), '
                    f'deleting {len(losers)} duplicate(s): {[r.pk for r in losers]}'
                )
                touched_recon_ids.add(group['reconciliation_id'])
                total_deleted += len(losers)

                if not dry_run:
                    with db_transaction.atomic():
                        ReconciliationException.objects.filter(pk__in=[r.pk for r in losers]).delete()

        if total_groups == 0:
            self.stdout.write(self.style.SUCCESS('No duplicate exception groups found.'))
        else:
            action = 'Would delete' if dry_run else 'Deleted'
            self.stdout.write(f'\n{action} {total_deleted} duplicate row(s) across {total_groups} group(s).')

        # --- recompute counts for every touched reconciliation ---
        if not touched_recon_ids:
            return

        if dry_run:
            self.stdout.write(
                f'\nWould recompute counts for {len(touched_recon_ids)} affected reconciliation(s).'
            )
            return

        from banks.reconciliation_utils import recompute_reconciliation_counts

        self.stdout.write('\nRecomputing counts for affected reconciliations...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'total={recon.total_bank_transactions} matched={recon.matched_count} '
                f'unmatched_bank={recon.unmatched_bank_count} unmatched_erp={recon.unmatched_erp_count}'
            )
