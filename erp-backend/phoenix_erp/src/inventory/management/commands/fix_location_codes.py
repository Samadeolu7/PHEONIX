"""
Management command to fix empty location codes.
Converts empty string codes to NULL to avoid unique constraint violations.
"""
from django.core.management.base import BaseCommand
from inventory.models import Location


class Command(BaseCommand):
    help = 'Fix empty location codes by converting them to NULL'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be fixed without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        self.stdout.write('Checking all locations for empty codes...')
        
        # Find locations with empty code
        locations_with_empty_code = Location.objects.filter(code='')
        count = locations_with_empty_code.count()
        
        if count == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    'All locations have valid codes (no empty strings) ✓'
                )
            )
            return
        
        self.stdout.write(
            self.style.WARNING(
                f'Found {count} location(s) with empty code strings'
            )
        )
        
        for location in locations_with_empty_code:
            self.stdout.write(
                self.style.WARNING(
                    f'Location {location.id} ({location.name}) in branch {location.branch_id}: code=""'
                )
            )
            
            if not dry_run:
                location.code = None
                location.save(update_fields=['code'])
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  → Fixed: Set code to NULL'
                    )
                )
            else:
                self.stdout.write(
                    self.style.NOTICE(
                        f'  → Would fix: Set code to NULL'
                    )
                )
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\nWould fix {count} location(s). Run without --dry-run to apply changes.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nSuccessfully fixed {count} location(s) ✓'
                )
            )
            self.stdout.write(
                self.style.NOTICE(
                    '\nNext steps:'
                )
            )
            self.stdout.write('  1. Run: python manage.py makemigrations')
            self.stdout.write('  2. Run: python manage.py migrate')
