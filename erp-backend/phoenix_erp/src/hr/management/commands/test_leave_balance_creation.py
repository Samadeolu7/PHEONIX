# hr/management/commands/test_leave_balance_creation.py
"""
Simple test to verify leave balance creation works at all

Usage:
    python manage.py test_leave_balance_creation
"""

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone
from decimal import Decimal


class Command(BaseCommand):
    help = 'Test leave balance creation with minimal code'

    def handle(self, *args, **options):
        from hr.models import Staff, LeaveType, LeaveBalance

        self.stdout.write("=" * 80)
        self.stdout.write("LEAVE BALANCE CREATION TEST")
        self.stdout.write("=" * 80 + "\n")

        # Get first staff member
        staff = Staff.objects.filter(is_deleted=False).first()
        
        if not staff:
            self.stdout.write(self.style.ERROR("No staff found in database"))
            return

        self.stdout.write(f"Using test staff: {staff.first_name} {staff.last_name} (ID: {staff.id})")
        self.stdout.write(f"  tenant_id: {staff.tenant_id}")
        self.stdout.write(f"  branch_id: {staff.branch_id}")
        self.stdout.write(f"  owner_id: {staff.owner_id}\n")

        # Get first leave type
        leave_type = LeaveType.objects.filter(
            branch=staff.branch,
            is_deleted=False
        ).first()

        if not leave_type:
            self.stdout.write(self.style.ERROR(f"No leave types found for branch {staff.branch_id}"))
            self.stdout.write("Creating a test leave type...")
            
            leave_type = LeaveType(
                tenant=staff.tenant,
                branch=staff.branch,
                owner=staff.owner,
                name="Test Annual Leave",
                code="TAL",
                default_days_per_year=20,
                is_paid=True,
                requires_approval=True
            )
            leave_type.save()
            self.stdout.write(f"Created leave type ID: {leave_type.id}\n")

        self.stdout.write(f"Using leave type: {leave_type.name} (ID: {leave_type.id})\n")

        # Count before
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = FALSE")
            before_count = cursor.fetchone()[0]

        self.stdout.write(f"Database leave balance count BEFORE: {before_count}\n")

        # Test 1: Direct model creation
        self.stdout.write("TEST 1: Creating balance with LeaveBalance(...).save()")
        
        year = timezone.now().year
        
        # Delete any existing balance first
        LeaveBalance.all_objects.filter(
            staff=staff,
            leave_type=leave_type,
            year=year
        ).delete()

        try:
            with transaction.atomic():
                balance = LeaveBalance(
                    tenant=staff.tenant,
                    staff=staff,
                    leave_type=leave_type,
                    year=year,
                    branch=staff.branch,
                    owner=staff.owner,
                    entitled_days=Decimal('20.00'),
                    used_days=Decimal('0.00'),
                    pending_days=Decimal('0.00'),
                    carried_over_days=Decimal('0.00'),
                )
                
                self.stdout.write(f"  Creating balance with:")
                self.stdout.write(f"    tenant_id: {balance.tenant_id}")
                self.stdout.write(f"    staff_id: {balance.staff_id}")
                self.stdout.write(f"    leave_type_id: {balance.leave_type_id}")
                self.stdout.write(f"    year: {balance.year}")
                self.stdout.write(f"    branch_id: {balance.branch_id}")
                self.stdout.write(f"    owner_id: {balance.owner_id}")
                
                balance.save()
                
                self.stdout.write(f"  Balance saved with ID: {balance.id}")
                
                # Immediate verification with raw SQL
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id, staff_id, leave_type_id, year, entitled_days, is_deleted, 
                               tenant_id, branch_id, owner_id
                        FROM hr_leavebalance 
                        WHERE id = %s
                        """,
                        [balance.id]
                    )
                    row = cursor.fetchone()
                
                if row:
                    self.stdout.write(self.style.SUCCESS(f"  ✓ Balance ID {balance.id} verified in database with raw SQL:"))
                    self.stdout.write(f"    {row}")
                else:
                    self.stdout.write(self.style.ERROR(f"  ❌ Balance ID {balance.id} NOT FOUND with raw SQL!"))
                    self.stdout.write("  Transaction may have rolled back!")
                
                # Try ORM query
                orm_balance = LeaveBalance.all_objects.filter(id=balance.id).first()
                if orm_balance:
                    self.stdout.write(f"  ✓ Balance found via ORM (all_objects)")
                else:
                    self.stdout.write(self.style.ERROR(f"  ❌ Balance NOT found via ORM (all_objects)"))
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ ERROR: {str(e)}"))
            import traceback
            self.stdout.write(traceback.format_exc())

        # Count after
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = FALSE")
            after_count = cursor.fetchone()[0]

        self.stdout.write(f"\nDatabase leave balance count AFTER: {after_count}")
        self.stdout.write(f"Net change: {after_count - before_count}\n")

        # Show all balances for this staff
        self.stdout.write("=" * 80)
        self.stdout.write("ALL BALANCES FOR THIS STAFF:")
        self.stdout.write("=" * 80)
        
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, leave_type_id, year, entitled_days, used_days, is_deleted, tenant_id, branch_id
                FROM hr_leavebalance 
                WHERE staff_id = %s
                ORDER BY year DESC, id DESC
                """,
                [staff.id]
            )
            rows = cursor.fetchall()
        
        if rows:
            for row in rows:
                self.stdout.write(f"  ID:{row[0]} LT:{row[1]} Year:{row[2]} Entitled:{row[3]} Used:{row[4]} Deleted:{row[5]} Tenant:{row[6]} Branch:{row[7]}")
        else:
            self.stdout.write("  No balances found for this staff")

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("TEST COMPLETE")
        self.stdout.write("=" * 80)
