"""
management/commands/backfill_missing_default_savings.py

Finds Clients with no active Regular Savings (SAV-REG) account and opens
one for each, using the same logic as the `_create_default_savings_account`
post_save signal in savings/signals.py.

Root cause (fixed alongside this command): Account.create_with_parent()
looked up the parent GL account by `code` + `account_level` only, with no
tenant/branch scoping. Parent codes (e.g. '2140' Customer Savings Deposits)
are only unique per (tenant, branch) — every branch gets its own copy of
the chart of accounts via BranchCloneService. Once a tenant had more than
one branch, that lookup raised Account.MultipleObjectsReturned, which the
signal's broad `except Exception` swallowed and logged, silently skipping
savings account creation for every client created afterward across the
whole tenant (not just one branch). This command backfills anyone who fell
through that gap.

Run in dry-run mode first to see who would be affected:
    python manage.py backfill_missing_default_savings --dry-run

Then apply:
    python manage.py backfill_missing_default_savings
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

_SAVINGS_PARENT_CODE = '2140'
_DEFAULT_SAVINGS_PRODUCT_CODE = 'SAV-REG'


class Command(BaseCommand):
    help = (
        "Backfill a default Regular Savings (SAV-REG) account for any client "
        "who is missing one (e.g. because of the multi-branch GL lookup bug)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print who would be affected without writing to the database',
        )

    def handle(self, *args, **options):
        from accounts.models import Account
        from clients.models import Client
        from products.models import Product
        from savings.models import SavingsAccount

        dry = options['dry_run']

        clients_with_savings = SavingsAccount.objects.exclude(
            status='closed',
        ).values_list('client_id', flat=True)

        missing_clients = Client.objects.exclude(
            pk__in=clients_with_savings,
        ).select_related('branch', 'tenant').order_by('created_at')

        count = missing_clients.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('Every client already has a savings account. ✓'))
            return

        self.stdout.write(self.style.WARNING(f'{count} client(s) missing a default savings account:'))
        for client in missing_clients:
            self.stdout.write(
                f'  - [{client.pk}] {client.full_name} '
                f'(branch={client.branch_id}, tenant={client.tenant_id}, created={client.created_at})'
            )

        if dry:
            self.stdout.write('\nDRY RUN — no changes written. Re-run without --dry-run to apply.')
            return

        created = 0
        skipped = 0
        for client in missing_clients:
            product_qs = Product.objects.filter(
                product_type='SAVINGS',
                code=_DEFAULT_SAVINGS_PRODUCT_CODE,
                is_active=True,
            )
            product = (
                product_qs.filter(branch=client.branch).first()
                or product_qs.first()
            )
            if not product:
                self.stdout.write(self.style.ERROR(
                    f'  [{client.pk}] {client.full_name}: no active {_DEFAULT_SAVINGS_PRODUCT_CODE} '
                    f'product found — skipped.'
                ))
                skipped += 1
                continue

            try:
                with transaction.atomic():
                    gl_account = Account.create_with_parent(
                        parent_code=_SAVINGS_PARENT_CODE,
                        child_data={
                            'name': f'Savings – {client.full_name}',
                            'allow_manual_entries': True,
                            'owner': client.owner,
                            'branch': client.branch,
                            'tenant': client.tenant,
                            'created_by': client.created_by,
                        },
                    )
                    SavingsAccount.objects.create(
                        client=client,
                        account=gl_account,
                        product=product,
                        account_number=gl_account.code,
                        nickname=f"{client.first_name}'s Savings",
                        status='active',
                        opened_on=timezone.now().date(),
                        interest_rate=product.interest_rate or Decimal('0.00'),
                        interest_calculation_method='monthly',
                        minimum_balance=product.minimum_amount or Decimal('0.00'),
                        owner=client.owner,
                        branch=client.branch,
                        tenant=client.tenant,
                        created_by=client.created_by,
                    )
                created += 1
                self.stdout.write(f'  [{client.pk}] {client.full_name}: opened {gl_account.code}.')
            except Exception as exc:  # noqa: BLE001
                self.stdout.write(self.style.ERROR(
                    f'  [{client.pk}] {client.full_name}: failed — {exc}'
                ))
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Created {created} savings account(s), skipped {skipped}.'
        ))
