"""
management/commands/fix_missing_savings_product_config.py

Finds Products with product_type='SAVINGS' that have no matching
SavingsProduct config row. Every read/write path on a SavingsAccount
(deposit, withdraw, etc.) looks up this config via
`savings_account.product.savings_product_config` — if it's missing,
those actions fail with:

    "No SavingsProduct configuration found for product '<name>'."

This mainly affects data created before SavingsProduct configs existed,
or products created outside the normal seeding/import commands (e.g.
`import_legacy_data`'s SAV-REG product, which historically never got a
config row).

Run in dry-run mode first to see what would be created:
    python manage.py fix_missing_savings_product_config --dry-run

Then apply:
    python manage.py fix_missing_savings_product_config

Each backfilled config is created with safe, no-cycle defaults
(is_daily_contribution=False, has_savings_cycle=False,
withdrawal_needs_approval=True). Products that already have a config are
left untouched.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Backfill a default SavingsProduct config for any SAVINGS product "
        "that is missing one (prevents withdrawal/deposit failures)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would be created without writing to the database',
        )

    def handle(self, *args, **options):
        from products.models import Product
        from savings.models import SavingsProduct

        dry = options['dry_run']

        missing = Product.objects.filter(
            product_type='SAVINGS',
        ).exclude(
            pk__in=SavingsProduct.objects.values_list('product_id', flat=True),
        )

        count = missing.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('All SAVINGS products already have a config. ✓'))
            return

        self.stdout.write(self.style.WARNING(f'{count} SAVINGS product(s) missing a SavingsProduct config:'))
        for product in missing:
            self.stdout.write(f'  - [{product.code}] {product.name} (pk={product.pk}, branch={product.branch_id})')

        if dry:
            self.stdout.write('\nDRY RUN — no changes written. Re-run without --dry-run to apply.')
            return

        created = 0
        for product in missing:
            SavingsProduct.objects.create(
                product=product,
                is_daily_contribution=False,
                first_deposit_is_income=False,
                has_savings_cycle=False,
                withdrawal_needs_approval=True,
                only_account_manager_can_withdraw=False,
                owner=product.owner,
                tenant=product.tenant,
                branch=product.branch,
                created_by=product.owner,
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f'\nDone. Created {created} SavingsProduct config record(s).'))
