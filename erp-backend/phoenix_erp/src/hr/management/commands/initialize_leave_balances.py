# hr/management/commands/initialize_leave_balances.py
"""
Management command to initialize leave balances for all staff

Usage:
    python manage.py initialize_leave_balances
    python manage.py initialize_leave_balances --year 2026
    python manage.py initialize_leave_balances --branch-id 1
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from hr.models import Staff, LeaveType
from hr.services.leave_service import LeaveService
from hr.signals import create_default_leave_types


class Command(BaseCommand):
    help = 'Initialize leave balances for all staff members'

    def add_arguments(self, parser):
        parser.add_argument(
            '--year',
            type=int,
            default=timezone.now().year,
            help='Year to initialize balances for (default: current year)'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Initialize only for specific branch (default: all branches)'
        )
        parser.add_argument(
            '--create-leave-types',
            action='store_true',
            help='Create default leave types if they don\'t exist'
        )

    def handle(self, *args, **options):
        year = options['year']
        branch_id = options['branch_id']
        create_types = options['create_leave_types']

        self.stdout.write(self.style.SUCCESS(
            f'Initializing leave balances for year {year}...'
        ))

        # CRITICAL: Check database connection and show actual counts
        from django.db import connection
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = FALSE")
            before_count = cursor.fetchone()[0]
            self.stdout.write(f'Leave balances in database BEFORE: {before_count}')

        # Get staff queryset
        staff_queryset = Staff.objects.filter(is_deleted=False)
        
        if branch_id:
            staff_queryset = staff_queryset.filter(branch_id=branch_id)
            self.stdout.write(f'Filtering by branch ID: {branch_id}')
        
        staff_count = staff_queryset.count()
        
        if staff_count == 0:
            self.stdout.write(self.style.WARNING('No staff found to process.'))
            return

        self.stdout.write(f'Found {staff_count} staff members to process.')

        # Check/create leave types per branch
        branches_processed = set()
        
        for staff in staff_queryset:
            if staff.branch_id not in branches_processed:
                branches_processed.add(staff.branch_id)
                
                # Check if leave types exist for this branch
                leave_types_count = LeaveType.objects.filter(
                    branch=staff.branch,
                    is_deleted=False
                ).count()
                
                if leave_types_count == 0:
                    if create_types:
                        self.stdout.write(
                            self.style.WARNING(
                                f'No leave types found for branch {staff.branch}. Creating defaults...'
                            )
                        )
                        created = create_default_leave_types(
                            branch=staff.branch,
                            owner=staff.owner,
                            tenant=staff.tenant
                        )
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'Created {len(created)} default leave types for branch {staff.branch}'
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(
                                f'No leave types found for branch {staff.branch}. '
                                f'Use --create-leave-types to create defaults, or create them manually.'
                            )
                        )
                        continue

        # Initialize balances
        processed_count = 0
        total_balances = 0
        error_count = 0

        # CRITICAL: Wrap in explicit transaction
        from django.db import transaction
        
        try:
            with transaction.atomic():
                for staff in staff_queryset:
                    try:
                        self.stdout.write(
                            f'\nProcessing: {staff.first_name} {staff.last_name} '
                            f'(ID:{staff.id}, tenant:{staff.tenant_id}, branch:{staff.branch_id}, owner:{staff.owner_id})'
                        )
                        
                        balances = LeaveService.initialize_leave_balances(staff, year)
                        
                        if balances:
                            processed_count += 1
                            total_balances += len(balances)
                            self.stdout.write(
                                f'  ✓ {staff.first_name} {staff.last_name}: {len(balances)} balances'
                            )
                            
                            # VERIFY each balance in database immediately
                            for bal in balances:
                                from hr.models import LeaveBalance
                                exists = LeaveBalance.all_objects.filter(id=bal.id).exists()
                                if not exists:
                                    self.stdout.write(
                                        self.style.ERROR(
                                            f'    ❌ Balance ID {bal.id} NOT FOUND after creation!'
                                        )
                                    )
                                    error_count += 1
                                else:
                                    self.stdout.write(f'    ✓ Verified balance ID {bal.id} in database')
                        else:
                            self.stdout.write(
                                self.style.WARNING(
                                    f'  ⚠ {staff.first_name} {staff.last_name}: No balances created '
                                    f'(no leave types available for branch {staff.branch})'
                                )
                            )
                    except Exception as e:
                        error_count += 1
                        self.stdout.write(
                            self.style.ERROR(
                                f'  ✗ {staff.first_name} {staff.last_name}: {str(e)}'
                            )
                        )
                        import traceback
                        self.stdout.write(traceback.format_exc())
                        # Re-raise to rollback transaction
                        raise
                
                # If we get here, commit the transaction
                self.stdout.write(self.style.SUCCESS('\n✓ Transaction committed successfully'))
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Transaction rolled back due to error: {str(e)}'))
            raise

        # VERIFY final count
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = FALSE")
            after_count = cursor.fetchone()[0]
            self.stdout.write(f'\nLeave balances in database AFTER: {after_count}')
            self.stdout.write(f'Net change: {after_count - before_count}')

        # Summary
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('═' * 60))
        self.stdout.write(self.style.SUCCESS('Summary:'))
        self.stdout.write(self.style.SUCCESS('═' * 60))
        self.stdout.write(f'Staff processed: {processed_count} / {staff_count}')
        self.stdout.write(f'Total balances created: {total_balances}')
        self.stdout.write(f'Database records added: {after_count - before_count}')
        
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f'Errors: {error_count}'))
        
        if after_count == before_count and total_balances > 0:
            self.stdout.write(
                self.style.ERROR(
                    '\n❌ CRITICAL: Command reported created balances but database count unchanged!'
                    '\nThis indicates a transaction rollback or database connection issue.'
                )
            )
        
        self.stdout.write(self.style.SUCCESS('═' * 60))
        self.stdout.write(self.style.SUCCESS('Done!'))
