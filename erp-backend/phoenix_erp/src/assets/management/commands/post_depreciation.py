"""
Management command: post_depreciation
======================================

Generates and posts the current-month depreciation entry for every active
fixed asset that does not yet have a record for the current period.

Usage
-----
    python manage.py post_depreciation
    python manage.py post_depreciation --period 2026-02-01
    python manage.py post_depreciation --dry-run
    python manage.py post_depreciation --asset 42
    python manage.py post_depreciation --branch 3

Options
-------
--period YYYY-MM-DD     Target period date (default: today).
--dry-run               Calculate only; do not create/post any records.
--asset ID              Process a single asset by primary key.
--branch ID             Limit to assets in the given branch.
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.core.exceptions import ValidationError


class Command(BaseCommand):
    help = "Generate and post monthly depreciation entries for active fixed assets."

    def add_arguments(self, parser):
        parser.add_argument(
            '--period',
            default=None,
            help='Period date in YYYY-MM-DD format (default: today).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would happen without writing anything.',
        )
        parser.add_argument(
            '--asset',
            type=int,
            default=None,
            help='Process only the asset with this primary key.',
        )
        parser.add_argument(
            '--branch',
            type=int,
            default=None,
            help='Limit to assets belonging to this branch ID.',
        )

    def handle(self, *args, **options):
        from assets.models import FixedAsset
        from assets.services.depreciation import DepreciationService

        # Resolve period date
        period_str = options['period']
        if period_str:
            from datetime import date
            try:
                year, month, day = (int(x) for x in period_str.split('-'))
                period_date = date(year, month, day)
            except (ValueError, TypeError):
                raise CommandError(f"Invalid period date: '{period_str}'. Use YYYY-MM-DD.")
        else:
            period_date = timezone.now().date()

        dry_run    = options['dry_run']
        asset_pk   = options['asset']
        branch_pk  = options['branch']

        # Build queryset
        qs = FixedAsset.objects.filter(
            status__in=['active', 'idle'],
            is_deleted=False,
        ).select_related('category', 'owner', 'branch')

        if asset_pk:
            qs = qs.filter(pk=asset_pk)
        if branch_pk:
            qs = qs.filter(branch_id=branch_pk)

        total   = qs.count()
        skipped = 0
        created = 0
        errors  = 0

        self.stdout.write(
            f"Processing {total} asset(s) for period "
            f"{period_date.strftime('%B %Y')}"
            + (" [DRY RUN]" if dry_run else "")
        )

        for asset in qs.iterator():
            try:
                if dry_run:
                    schedule = DepreciationService.calculate_schedule(asset)
                    from assets.services.depreciation import _month_start
                    ps = _month_start(period_date)
                    entry_data = next(
                        (p for p in schedule if p['period_start'] == ps), None
                    )
                    if entry_data:
                        self.stdout.write(
                            f"  [DRY] {asset.asset_number} — "
                            f"would post {entry_data['depreciation_amount']}"
                        )
                        created += 1
                    else:
                        self.stdout.write(
                            f"  [DRY] {asset.asset_number} — nothing to post"
                        )
                        skipped += 1
                else:
                    entry = DepreciationService.generate_and_post_current_period(
                        asset=asset,
                        period_date=period_date,
                        posted_by=None,    # system-generated; journal_entry.created_by will be None
                    )
                    if entry and entry.is_posted:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  ✓ {asset.asset_number} — posted {entry.depreciation_amount} "
                                f"(JE #{entry.journal_entry_id})"
                            )
                        )
                        created += 1
                    else:
                        skipped += 1

            except NotImplementedError:
                self.stdout.write(
                    self.style.WARNING(
                        f"  ⚠ {asset.asset_number} — skipped (units_of_production)"
                    )
                )
                skipped += 1
            except ValidationError as exc:
                self.stderr.write(
                    self.style.ERROR(f"  ✗ {asset.asset_number} — {exc}")
                )
                errors += 1
            except Exception as exc:
                self.stderr.write(
                    self.style.ERROR(f"  ✗ {asset.asset_number} — unexpected error: {exc}")
                )
                errors += 1

        self.stdout.write(
            f"\nDone. Posted: {created}, Skipped: {skipped}, Errors: {errors}"
        )
        if errors:
            raise CommandError(f"{errors} asset(s) failed — review output above.")
