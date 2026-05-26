# hr/management/commands/audit_leave_requests.py
"""
Audit and fix orphaned leave requests (requests without corresponding leave balances).

This command finds leave requests that were created before the validation fix
and either:
1. Reports them (dry run)
2. Creates missing leave balances for them
3. Cancels invalid requests

Usage:
    # Find orphaned requests
    python manage.py audit_leave_requests
    
    # Create missing balances for orphaned requests
    python manage.py audit_leave_requests --fix --create-balances
    
    # Cancel orphaned requests (if they're in draft)
    python manage.py audit_leave_requests --fix --cancel-requests
    
    # Process specific branch
    python manage.py audit_leave_requests --branch-id=1 --fix
"""

from django.core.management.base import BaseCommand
from django.db.models import Q, Prefetch
from django.utils import timezone
from hr.models import LeaveRequest, LeaveBalance, Staff, LeaveType
from hr.services.leave_service import LeaveService
from collections import defaultdict


class Command(BaseCommand):
    help = 'Audit leave requests and find/fix orphaned requests without leave balances'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Actually fix the issues (default is dry-run)',
        )
        parser.add_argument(
            '--create-balances',
            action='store_true',
            help='Create missing leave balances for orphaned requests',
        )
        parser.add_argument(
            '--cancel-requests',
            action='store_true',
            help='Cancel orphaned leave requests (only draft status)',
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Process only specific branch',
        )
        parser.add_argument(
            '--status',
            type=str,
            help='Filter by request status (e.g., draft, submitted)',
        )

    def handle(self, *args, **options):
        fix_mode = options['fix']
        create_balances = options['create_balances']
        cancel_requests = options['cancel_requests']
        branch_id = options.get('branch_id')
        status_filter = options.get('status')

        self.stdout.write("=" * 80)
        self.stdout.write(self.style.WARNING("LEAVE REQUEST AUDIT - Data Integrity Check"))
        self.stdout.write("=" * 80)
        
        if not fix_mode:
            self.stdout.write(self.style.NOTICE("\nDRY RUN MODE - No changes will be made"))
            self.stdout.write("Use --fix to actually apply fixes\n")

        # Get all leave requests
        leave_requests = LeaveRequest.objects.select_related(
            'staff', 'leave_type', 'branch'
        ).prefetch_related('staff__leave_balances')
        
        if branch_id:
            leave_requests = leave_requests.filter(branch_id=branch_id)
        
        if status_filter:
            leave_requests = leave_requests.filter(status=status_filter)
        
        # Track issues by type
        orphaned_requests = []  # Requests without corresponding balances
        insufficient_balance = []  # Requests exceeding available balance
        total_requests = leave_requests.count()
        
        self.stdout.write(f"\n📊 Analyzing {total_requests} leave requests...\n")
        
        for request in leave_requests:
            year = request.start_date.year
            
            # Check if corresponding leave balance exists
            balance = LeaveBalance.objects.filter(
                staff=request.staff,
                leave_type=request.leave_type,
                year=year,
                is_deleted=False
            ).first()
            
            if not balance:
                orphaned_requests.append({
                    'request': request,
                    'year': year,
                    'balance': None
                })
            elif not balance.has_sufficient_balance(request.num_days):
                insufficient_balance.append({
                    'request': request,
                    'balance': balance,
                    'available': balance.available_days,
                    'requested': request.num_days
                })
        
        # Report findings
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("AUDIT RESULTS")
        self.stdout.write("=" * 80 + "\n")
        
        self.stdout.write(f"Total Leave Requests: {total_requests}")
        self.stdout.write(self.style.ERROR(f"Orphaned Requests (no balance): {len(orphaned_requests)}"))
        self.stdout.write(self.style.WARNING(f"Insufficient Balance: {len(insufficient_balance)}\n"))
        
        # Detail orphaned requests
        if orphaned_requests:
            self.stdout.write("\n" + "-" * 80)
            self.stdout.write(self.style.ERROR("ORPHANED LEAVE REQUESTS (Critical Data Integrity Issue)"))
            self.stdout.write("-" * 80 + "\n")
            
            # Group by staff
            by_staff = defaultdict(list)
            for item in orphaned_requests:
                by_staff[item['request'].staff].append(item)
            
            for staff, items in by_staff.items():
                self.stdout.write(f"\n👤 Staff: {staff.first_name} {staff.last_name} (ID: {staff.id})")
                self.stdout.write(f"   Branch: {staff.branch.name if staff.branch else 'N/A'}")
                
                for item in items:
                    request = item['request']
                    self.stdout.write(
                        f"   ⚠️  {request.reference_number} - {request.leave_type.name} "
                        f"({request.start_date} to {request.end_date}) - {request.num_days} days"
                    )
                    self.stdout.write(f"       Status: {request.status} | Year: {item['year']}")
                    self.stdout.write(f"       Missing: LeaveBalance for {item['year']}")
        
        # Detail insufficient balance requests
        if insufficient_balance:
            self.stdout.write("\n" + "-" * 80)
            self.stdout.write(self.style.WARNING("INSUFFICIENT BALANCE REQUESTS"))
            self.stdout.write("-" * 80 + "\n")
            
            for item in insufficient_balance:
                request = item['request']
                self.stdout.write(
                    f"   {request.reference_number} - {request.staff.first_name} {request.staff.last_name}"
                )
                self.stdout.write(
                    f"   Requested: {item['requested']} days | Available: {item['available']} days"
                )
        
        # Apply fixes if requested
        if fix_mode:
            self.stdout.write("\n" + "=" * 80)
            self.stdout.write(self.style.SUCCESS("APPLYING FIXES"))
            self.stdout.write("=" * 80 + "\n")
            
            if create_balances and orphaned_requests:
                self._create_missing_balances(orphaned_requests)
            
            if cancel_requests and orphaned_requests:
                self._cancel_orphaned_requests(orphaned_requests)
            
            if not (create_balances or cancel_requests):
                self.stdout.write(
                    self.style.WARNING(
                        "No fix action specified. Use --create-balances or --cancel-requests"
                    )
                )
        
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("AUDIT COMPLETE")
        self.stdout.write("=" * 80 + "\n")

    def _create_missing_balances(self, orphaned_requests):
        """Create missing leave balances for orphaned requests"""
        self.stdout.write("\n🔧 Creating missing leave balances...\n")
        
        # Group by staff and year
        by_staff_year = defaultdict(set)
        for item in orphaned_requests:
            request = item['request']
            by_staff_year[(request.staff, item['year'])].add(request.leave_type)
        
        created_count = 0
        for (staff, year), leave_types in by_staff_year.items():
            try:
                # Initialize all leave balances for this staff and year
                balances = LeaveService.initialize_leave_balances(staff, year)
                if balances:
                    created_count += len(balances)
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"   ✓ Created {len(balances)} leave balances for "
                            f"{staff.first_name} {staff.last_name} ({year})"
                        )
                    )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"   ✗ Error creating balances for {staff.first_name} {staff.last_name}: {str(e)}"
                    )
                )
        
        self.stdout.write(f"\n✓ Created {created_count} leave balances in total")

    def _cancel_orphaned_requests(self, orphaned_requests):
        """Cancel orphaned leave requests (only draft status)"""
        self.stdout.write("\n🔧 Cancelling orphaned leave requests...\n")
        
        cancelled_count = 0
        skipped_count = 0
        
        for item in orphaned_requests:
            request = item['request']
            
            if request.status == 'draft':
                request.status = 'cancelled'
                request.rejection_reason = (
                    "Automatically cancelled - No leave balance found. "
                    "Leave balances must be initialized before requesting leave."
                )
                request.save()
                cancelled_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"   ✓ Cancelled {request.reference_number} "
                        f"({request.staff.first_name} {request.staff.last_name})"
                    )
                )
            else:
                skipped_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"   ⚠️  Skipped {request.reference_number} (status: {request.status}) "
                        f"- can only cancel draft requests"
                    )
                )
        
        self.stdout.write(f"\n✓ Cancelled {cancelled_count} requests")
        if skipped_count:
            self.stdout.write(
                self.style.WARNING(
                    f"⚠️  Skipped {skipped_count} non-draft requests "
                    "(requires manual review)"
                )
            )
