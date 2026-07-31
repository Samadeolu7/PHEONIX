"""
One-off backfill for the multi-branch stock transfer workflow.

StockTransferRequest gained from_branch/to_branch fields (denormalized from
from_location.branch/to_location.branch) as part of adding cross-branch
transfer support and the dispatch/acknowledge workflow. New rows populate
these automatically in save() (see StockTransferRequest.save()), but any
row created before this change has them NULL.

This command backfills from_branch/to_branch on every existing row from its
locations. It does NOT remap the legacy 'executed' status — those rows have
no dispatch/acknowledge audit trail (dispatched_by/at, acknowledged_by/at),
so force-remapping them to 'acknowledged' would fabricate history that
never happened. 'executed' is kept as a permanent legacy terminal alias
(see StockTransferRequest.STATUS_CHOICES).

Usage:
    python manage.py backfill_stock_transfer_branches --dry-run
    python manage.py backfill_stock_transfer_branches
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Backfill from_branch/to_branch on StockTransferRequest rows created "
        "before the multi-branch transfer workflow, from their locations."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Print what would be changed without saving anything.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from django.db.models import Q
        from inventory.models import StockTransferRequest

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        rows = StockTransferRequest.objects.filter(
            Q(from_branch__isnull=True) | Q(to_branch__isnull=True)
        ).select_related('from_location', 'to_location')

        total = rows.count()
        self.stdout.write(f"Rows needing a branch backfill: {total}\n")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to backfill."))
            return

        fixed = 0
        skipped = 0

        for tr in rows:
            update_fields = []
            if tr.from_branch_id is None and tr.from_location_id and tr.from_location.branch_id:
                tr.from_branch_id = tr.from_location.branch_id
                update_fields.append('from_branch')
            if tr.to_branch_id is None and tr.to_location_id and tr.to_location.branch_id:
                tr.to_branch_id = tr.to_location.branch_id
                update_fields.append('to_branch')

            if not update_fields:
                self.stdout.write(
                    self.style.WARNING(
                        f"  SKIP  {tr.request_number} (id={tr.id}) — "
                        f"location has no branch either, cannot backfill"
                    )
                )
                skipped += 1
                continue

            self.stdout.write(
                f"  FIX   {tr.request_number} (id={tr.id}) -> "
                f"from_branch={tr.from_branch_id} to_branch={tr.to_branch_id}"
            )

            if not dry_run:
                tr.save(update_fields=update_fields)

            fixed += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f"\nDRY RUN complete. Would fix {fixed}, skip {skipped}."))
        else:
            self.stdout.write(self.style.SUCCESS(f"\nDone. Fixed {fixed}, skipped {skipped}."))
