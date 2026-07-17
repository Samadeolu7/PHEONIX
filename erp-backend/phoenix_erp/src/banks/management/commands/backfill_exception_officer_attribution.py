"""
banks/management/commands/backfill_exception_officer_attribution.py
================================================================
One-time (and safely re-runnable) backfill for ReconciliationException.
officer/erp_branch on existing erp_only exceptions whose underlying
Transaction's created_by was fixed by backfill_journal_entry_attribution.

ReconciliationException.officer is a SNAPSHOT captured once, at exception-
creation time, from Transaction.created_by (see _persist_outcome, banks/
tasks.py) — it is not a live lookup. Migration 0019
(backfill_exception_accountability_fields) already ran this same backfill
once, but it ran BEFORE the created_by fix on BankTransfer.complete()/
BankPayment.post_payment() existed, so it permanently copied officer=NULL
onto every exception whose underlying Transaction still had created_by=NULL
at that time — migrations don't re-run when the source data changes later.
backfill_journal_entry_attribution then fixed the underlying Transaction
rows, but nothing re-copied that fix onto the already-created
ReconciliationException rows — hence "Unattributed" persisting in the
Missing Money Summary even after that backfill ran.

This command re-runs the exact same logic as migration 0019, safe to run
as many times as needed (only touches rows with officer still NULL). Run
AFTER backfill_journal_entry_attribution so it has corrected data to pull
from — running it first will just find nothing changed and need a second
pass anyway.

Usage:
    python manage.py backfill_exception_officer_attribution --dry-run
    python manage.py backfill_exception_officer_attribution
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Re-derives ReconciliationException.officer/erp_branch for existing erp_only "
        "exceptions with officer=NULL, from Transaction.created_by via loan_payment_id — "
        "run after backfill_journal_entry_attribution so it picks up the corrected data."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import ReconciliationException
        from transactions.models import Transaction

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        erp_side = list(
            ReconciliationException.objects.filter(
                exception_type='erp_only', loan_payment_id__isnull=False, officer__isnull=True,
            ).values_list('id', 'loan_payment_id')
        )
        txn_ids = {loan_payment_id for _, loan_payment_id in erp_side}
        txns_by_id = {
            t.id: t
            for t in Transaction.objects.filter(id__in=txn_ids).select_related('created_by', 'created_by__branch')
        }

        updated = 0
        still_unattributed = 0
        for exc_id, loan_payment_id in erp_side:
            txn = txns_by_id.get(loan_payment_id)
            if txn is None or txn.created_by_id is None:
                still_unattributed += 1
                continue

            officer = txn.created_by
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}exception id={exc_id} '
                f'(transaction={loan_payment_id}): officer -> {officer}'
            )
            if not dry_run:
                ReconciliationException.objects.filter(id=exc_id).update(
                    officer_id=officer.id, erp_branch_id=officer.branch_id,
                )
            updated += 1

        action = 'Would update' if dry_run else 'Updated'
        self.stdout.write(f'\n{action} {updated} exception(s).')

        if still_unattributed:
            self.stdout.write(self.style.WARNING(
                f'\n{still_unattributed} erp_only exception(s) still have no created_by on their '
                f'underlying transaction — genuinely unattributed (predates both fixes, or the '
                f'posting instrument still doesn\'t tag an actor), left as-is.'
            ))

        if not erp_side:
            self.stdout.write(self.style.SUCCESS('No unattributed erp_only exceptions found.'))
