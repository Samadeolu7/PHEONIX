"""
Management command to set up standard chart of accounts for all tenants.

This replaces the migration-based approach with a more reliable, idempotent command.

Usage:
    python manage.py setup_chart_of_accounts
    python manage.py setup_chart_of_accounts --tenant-id=5
    python manage.py setup_chart_of_accounts --force          # Recreate even if exists
    python manage.py setup_chart_of_accounts --parents-only   # Create only the 30 parent headers
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from users.models import Tenant
from accounts.utils.setup_accounts import create_standard_accounts, create_parent_accounts_only
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Set up standard chart of accounts for all tenants'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Set up accounts for specific tenant ID only',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force recreation even if accounts already exist',
        )
        parser.add_argument(
            '--parents-only',
            action='store_true',
            help=(
                'Create only the 30 PARENT (header/summary) accounts. '
                'Children can be added on demand as transactions occur.'
            ),
        )

    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        force = options.get('force', False)
        parents_only = options.get('parents_only', False)

        # Get tenants to process
        if tenant_id:
            try:
                tenants = [Tenant.objects.get(id=tenant_id)]
                self.stdout.write(f"Processing tenant ID: {tenant_id}")
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant with ID {tenant_id} does not exist')
        else:
            tenants = Tenant.objects.all()
            self.stdout.write(f"Processing {tenants.count()} tenant(s)")

        if not tenants:
            self.stdout.write(self.style.WARNING(
                '⚠️  No tenants found. Create a tenant first before setting up accounts.'
            ))
            return

        mode_label = "parent accounts only" if parents_only else "full chart of accounts"
        self.stdout.write(f"Mode: {mode_label}")

        total_created = 0
        total_skipped = 0
        total_errors = 0

        for tenant in tenants:
            self.stdout.write(f"\n🏢 Setting up accounts for: {tenant.name} (ID: {tenant.id})")

            try:
                with transaction.atomic():
                    if parents_only:
                        created, skipped = create_parent_accounts_only(
                            tenant=tenant,
                            force=force,
                        )
                    else:
                        created, skipped = create_standard_accounts(
                            tenant=tenant,
                            force=force,
                        )
                    total_created += created
                    total_skipped += skipped

                    if created > 0:
                        self.stdout.write(self.style.SUCCESS(
                            f'   ✅ Created {created} accounts, skipped {skipped} existing'
                        ))
                    else:
                        self.stdout.write(self.style.WARNING(
                            f'   ⏭️  Skipped {skipped} existing accounts (use --force to recreate)'
                        ))

            except Exception as e:
                total_errors += 1
                self.stdout.write(self.style.ERROR(
                    f'   ❌ Error setting up accounts for {tenant.name}: {str(e)}'
                ))
                logger.exception(f"Failed to setup accounts for tenant {tenant.id}")
                if not options.get('verbosity') or options['verbosity'] > 1:
                    raise

        # Summary
        tenant_count = len(tenants) if isinstance(tenants, list) else tenants.count()
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS(
            f'📊 SUMMARY ({mode_label}):\n'
            f'   Tenants processed: {tenant_count}\n'
            f'   Total accounts created: {total_created}\n'
            f'   Total accounts skipped: {total_skipped}\n'
            f'   Errors: {total_errors}'
        ))
        self.stdout.write('=' * 70)

        if total_errors == 0:
            self.stdout.write(self.style.SUCCESS(
                '\n✅ Chart of Accounts setup complete!'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'\n⚠️  Completed with {total_errors} error(s). Check logs for details.'
            ))
