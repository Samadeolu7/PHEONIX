"""
Management command to backfill missing receivables from existing invoices
Usage: python manage.py backfill_receivables [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from incomes.models import Invoice as IncomeInvoice
from inventory.models import Invoice as InventoryInvoice
from receivables.models import CustomerReceivable
from receivables.signals import (
    create_or_update_receivable_for_income_invoice,
    create_or_update_receivable_for_inventory_invoice
)


class Command(BaseCommand):
    help = 'Backfill missing CustomerReceivable records from existing invoices'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force re-creation of all receivables (even if they exist)',
        )
        parser.add_argument(
            '--update-aging',
            action='store_true',
            help='Update aging buckets and status for all existing receivables',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']
        update_aging = options['update_aging']
        
        self.stdout.write(self.style.SUCCESS('\n' + '='*70))
        self.stdout.write(self.style.SUCCESS('RECEIVABLE BACKFILL COMMAND'))
        self.stdout.write(self.style.SUCCESS('='*70 + '\n'))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('🔍 DRY RUN MODE - No changes will be made\n'))
        
        # Update aging if requested
        if update_aging:
            self.stdout.write('Updating aging buckets and statuses for all receivables...')
            all_receivables = CustomerReceivable.objects.all()
            self.stdout.write(f'  Found {all_receivables.count()} total receivables')
            
            updated_count = 0
            for receivable in all_receivables:
                try:
                    if not dry_run:
                        receivable.update_aging()
                        updated_count += 1
                        if updated_count % 100 == 0:
                            self.stdout.write(f'    Updated {updated_count} receivables...')
                    else:
                        self.stdout.write(f'    Would update: {receivable.reference_number}')
                        updated_count += 1
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'    ✗ Failed to update aging for {receivable.reference_number}: {e}')
                    )
            
            if not dry_run:
                self.stdout.write(
                    self.style.SUCCESS(f'  ✓ Updated aging for {updated_count} receivables')
                )
            self.stdout.write('')
        
        # Process Income Invoices
        self.stdout.write('Processing Income Invoices...')
        income_invoices = IncomeInvoice.objects.all()
        self.stdout.write(f'  Found {income_invoices.count()} income invoices')
        
        income_ct = ContentType.objects.get_for_model(IncomeInvoice)
        existing_income_receivables = set(
            CustomerReceivable.objects.filter(content_type=income_ct)
            .values_list('object_id', flat=True)
        )
        
        if force:
            missing_income = income_invoices
            self.stdout.write(f'  FORCE mode: Processing all {missing_income.count()} invoices')
        else:
            missing_income = income_invoices.exclude(id__in=existing_income_receivables)
            self.stdout.write(f'  Missing receivables: {missing_income.count()}')
        
        created_income = 0
        updated_income = 0
        failed_income = 0
        
        for invoice in missing_income:
            try:
                if not dry_run:
                    with transaction.atomic():
                        # If force mode, delete existing first
                        if force:
                            CustomerReceivable.objects.filter(
                                content_type=income_ct,
                                object_id=invoice.id
                            ).delete()
                        
                        # Call the signal handler to create/update
                        create_or_update_receivable_for_income_invoice(
                            sender=IncomeInvoice,
                            instance=invoice,
                            created=True,
                            raw=False,
                            using='default',
                            update_fields=None
                        )
                    
                    # Check if it was created or updated
                    if invoice.id in existing_income_receivables and not force:
                        updated_income += 1
                    else:
                        created_income += 1
                    
                    if (created_income + updated_income) % 10 == 0:
                        self.stdout.write(f'    Processed {created_income + updated_income}...')
                else:
                    self.stdout.write(f'    Would process: {invoice.invoice_number} (Status: {invoice.status})')
                    created_income += 1
                    
            except Exception as e:
                failed_income += 1
                self.stdout.write(
                    self.style.ERROR(f'    ✗ Failed on invoice {invoice.invoice_number}: {e}')
                )
        
        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Created: {created_income}, Updated: {updated_income}, Failed: {failed_income}')
            )
        
        # Process Inventory Invoices
        self.stdout.write('\nProcessing Inventory Invoices...')
        inventory_invoices = InventoryInvoice.objects.all()
        self.stdout.write(f'  Found {inventory_invoices.count()} inventory invoices')
        
        inventory_ct = ContentType.objects.get_for_model(InventoryInvoice)
        existing_inventory_receivables = set(
            CustomerReceivable.objects.filter(content_type=inventory_ct)
            .values_list('object_id', flat=True)
        )
        
        if force:
            missing_inventory = inventory_invoices
            self.stdout.write(f'  FORCE mode: Processing all {missing_inventory.count()} invoices')
        else:
            missing_inventory = inventory_invoices.exclude(id__in=existing_inventory_receivables)
            self.stdout.write(f'  Missing receivables: {missing_inventory.count()}')
        
        created_inventory = 0
        updated_inventory = 0
        failed_inventory = 0
        
        for invoice in missing_inventory:
            try:
                if not dry_run:
                    with transaction.atomic():
                        # If force mode, delete existing first
                        if force:
                            CustomerReceivable.objects.filter(
                                content_type=inventory_ct,
                                object_id=invoice.id
                            ).delete()
                        
                        # Call the signal handler to create/update
                        create_or_update_receivable_for_inventory_invoice(
                            sender=InventoryInvoice,
                            instance=invoice,
                            created=True,
                            raw=False,
                            using='default',
                            update_fields=None
                        )
                    
                    # Check if it was created or updated
                    if invoice.id in existing_inventory_receivables and not force:
                        updated_inventory += 1
                    else:
                        created_inventory += 1
                    
                    if (created_inventory + updated_inventory) % 10 == 0:
                        self.stdout.write(f'    Processed {created_inventory + updated_inventory}...')
                else:
                    self.stdout.write(f'    Would process: {invoice.invoice_number} (Status: {invoice.status})')
                    created_inventory += 1
                    
            except Exception as e:
                failed_inventory += 1
                self.stdout.write(
                    self.style.ERROR(f'    ✗ Failed on inventory invoice {invoice.invoice_number}: {e}')
                )
        
        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Created: {created_inventory}, Updated: {updated_inventory}, Failed: {failed_inventory}')
            )
        
        # Summary
        self.stdout.write('\n' + '='*70)
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write('='*70)
        
        total_created = created_income + created_inventory
        total_updated = updated_income + updated_inventory
        total_failed = failed_income + failed_inventory
        
        self.stdout.write(f'Total Receivables Created: {total_created}')
        self.stdout.write(f'Total Receivables Updated: {total_updated}')
        if total_failed > 0:
            self.stdout.write(self.style.ERROR(f'Total Failed: {total_failed}'))
        
        # Show current state
        all_receivables = CustomerReceivable.objects.all()
        self.stdout.write(f'\nTotal CustomerReceivables in DB: {all_receivables.count()}')
        
        # Show breakdown by status
        self.stdout.write('\nReceivables by Status:')
        for status, label in CustomerReceivable.STATUS_CHOICES:
            count = all_receivables.filter(status=status).count()
            if count > 0:
                self.stdout.write(f'  {label}: {count}')
        
        self.stdout.write('\n' + '='*70 + '\n')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('This was a DRY RUN. Run without --dry-run to apply changes.'))
