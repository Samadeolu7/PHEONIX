"""
Management command to fix invalid custom_labels in Tenant model.
This fixes any tenants where custom_labels is not a proper dictionary.
"""
from django.core.management.base import BaseCommand
from users.models import Tenant


class Command(BaseCommand):
    help = 'Fix invalid custom_labels data in Tenant model'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        self.stdout.write('Checking all tenants for invalid custom_labels...')
        
        tenants = Tenant.objects.all()
        fixed_count = 0
        
        for tenant in tenants:
            custom_labels = tenant.custom_labels
            needs_fix = False
            
            # Check if custom_labels is invalid
            if custom_labels is None:
                needs_fix = True
                new_value = {}
                reason = "NULL value"
            elif not isinstance(custom_labels, dict):
                needs_fix = True
                new_value = {}
                reason = f"Invalid type: {type(custom_labels).__name__}"
            elif isinstance(custom_labels, str):
                needs_fix = True
                new_value = {}
                reason = f"String value: {custom_labels!r}"
            
            if needs_fix:
                self.stdout.write(
                    self.style.WARNING(
                        f'Tenant {tenant.id} ({tenant.name}): {reason}'
                    )
                )
                
                if not dry_run:
                    tenant.custom_labels = new_value
                    tenant.save(update_fields=['custom_labels'])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'  → Fixed: Set to {new_value}'
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.NOTICE(
                            f'  → Would fix: Set to {new_value}'
                        )
                    )
                
                fixed_count += 1
        
        if fixed_count == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    'All tenants have valid custom_labels ✓'
                )
            )
        else:
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f'\nWould fix {fixed_count} tenant(s). Run without --dry-run to apply changes.'
                    )
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(
                        f'\nSuccessfully fixed {fixed_count} tenant(s) ✓'
                    )
                )
