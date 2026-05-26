# hr/management/commands/diagnose_leave_balances.py
"""
Diagnostic command to check leave balance data and scoping issues

Usage:
    python manage.py diagnose_leave_balances
    python manage.py diagnose_leave_balances --staff-id 1
"""

from django.core.management.base import BaseCommand
from django.db import connection
from hr.models import LeaveBalance, Staff, LeaveType
from users.models import User


class Command(BaseCommand):
    help = 'Diagnose leave balance visibility and scoping issues'

    def add_arguments(self, parser):
        parser.add_argument(
            '--staff-id',
            type=int,
            help='Check specific staff member',
        )
        parser.add_argument(
            '--user-id',
            type=int,
            help='Check from perspective of specific user',
        )

    def handle(self, *args, **options):
        staff_id = options.get('staff_id')
        user_id = options.get('user_id')

        self.stdout.write("=" * 80)
        self.stdout.write(self.style.WARNING("LEAVE BALANCE DIAGNOSTIC"))
        self.stdout.write("=" * 80 + "\n")

        # Check raw database counts
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = FALSE
            """)
            total_count = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(*) FROM hr_leavebalance WHERE is_deleted = TRUE
            """)
            deleted_count = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT 
                    lb.id,
                    lb.staff_id,
                    s.first_name,
                    s.last_name,
                    lt.name as leave_type_name,
                    lb.year,
                    lb.entitled_days,
                    lb.is_deleted,
                    lb.tenant_id,
                    lb.owner_id,
                    lb.branch_id,
                    b.name as branch_name
                FROM hr_leavebalance lb
                JOIN hr_staff s ON lb.staff_id = s.id
                JOIN hr_leavetype lt ON lb.leave_type_id = lt.id
                LEFT JOIN core_branch b ON lb.branch_id = b.id
                WHERE lb.is_deleted = FALSE
                ORDER BY lb.created_at DESC
                LIMIT 20
            """)
            recent_balances = cursor.fetchall()

        self.stdout.write(f"📊 RAW DATABASE COUNTS:")
        self.stdout.write(f"   Active Leave Balances: {total_count}")
        self.stdout.write(f"   Deleted Leave Balances: {deleted_count}\n")

        if total_count == 0:
            self.stdout.write(self.style.ERROR(
                "❌ NO LEAVE BALANCES FOUND IN DATABASE!\n"
                "Run: python manage.py initialize_leave_balances --create-leave-types"
            ))
            return

        # Show recent balances with all scoping fields
        self.stdout.write("📋 RECENT LEAVE BALANCES (Last 20):")
        self.stdout.write("-" * 80)
        for row in recent_balances:
            (id, staff_id, first_name, last_name, leave_type, year, 
             entitled, is_deleted, tenant_id, owner_id, branch_id, branch_name) = row
            self.stdout.write(
                f"ID: {id:3d} | Staff: {first_name} {last_name} (ID:{staff_id}) | "
                f"{leave_type} {year} | {entitled} days"
            )
            self.stdout.write(
                f"         Scoping: tenant_id={tenant_id}, owner_id={owner_id}, "
                f"branch_id={branch_id} ({branch_name})"
            )

        # Check via ORM with default manager
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("🔍 ORM QUERY TESTS:")
        self.stdout.write("=" * 80 + "\n")

        # Test 1: All objects (bypassing manager filters)
        all_balances = LeaveBalance.all_objects.filter(is_deleted=False)
        self.stdout.write(f"1. LeaveBalance.all_objects.filter(is_deleted=False): {all_balances.count()}")

        # Test 2: Default manager
        default_balances = LeaveBalance.objects.all()
        self.stdout.write(f"2. LeaveBalance.objects.all(): {default_balances.count()}")

        # Test 3: If user specified, test for_user
        if user_id:
            try:
                user = User.objects.get(id=user_id)
                user_balances = LeaveBalance.objects.for_user(user)
                self.stdout.write(f"3. LeaveBalance.objects.for_user(user_id={user_id}): {user_balances.count()}")
                self.stdout.write(f"   User: {user.email}")
                self.stdout.write(f"   User tenant: {getattr(user, 'tenant_id', None)}")
                self.stdout.write(f"   User branch: {getattr(user, 'branch_id', None)}")
                
                # Show what would be visible
                if user_balances.count() > 0:
                    self.stdout.write("\n   Visible to this user:")
                    for bal in user_balances[:10]:
                        self.stdout.write(
                            f"   ✓ {bal.staff.first_name} {bal.staff.last_name} - "
                            f"{bal.leave_type.name} {bal.year}"
                        )
                else:
                    self.stdout.write(self.style.ERROR(
                        f"\n   ❌ NO BALANCES VISIBLE TO USER {user.email}!"
                    ))
                    
                    # Show why
                    self.stdout.write("\n   Mismatch Analysis:")
                    sample_balance = LeaveBalance.all_objects.filter(is_deleted=False).first()
                    if sample_balance:
                        self.stdout.write(f"   Sample Balance - tenant_id: {sample_balance.tenant_id}, branch_id: {sample_balance.branch_id}")
                        self.stdout.write(f"   User Filters    - tenant_id: {user.tenant_id}, branch_id: {user.branch_id}")
                        
                        if sample_balance.tenant_id != user.tenant_id:
                            self.stdout.write(self.style.ERROR(
                                f"   ⚠️  TENANT MISMATCH! Balance: {sample_balance.tenant_id}, User: {user.tenant_id}"
                            ))
                        if sample_balance.branch_id != user.branch_id:
                            self.stdout.write(self.style.ERROR(
                                f"   ⚠️  BRANCH MISMATCH! Balance: {sample_balance.branch_id}, User: {user.branch_id}"
                            ))
                            
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"User {user_id} not found"))

        # Check specific staff if provided
        if staff_id:
            self.stdout.write(f"\n" + "=" * 80)
            self.stdout.write(f"👤 STAFF SPECIFIC CHECK (ID: {staff_id}):")
            self.stdout.write("=" * 80 + "\n")
            
            try:
                staff = Staff.objects.get(id=staff_id)
                self.stdout.write(f"Staff: {staff.first_name} {staff.last_name}")
                self.stdout.write(f"Staff tenant_id: {staff.tenant_id}")
                self.stdout.write(f"Staff owner_id: {staff.owner_id}")
                self.stdout.write(f"Staff branch_id: {staff.branch_id}\n")
                
                staff_balances = LeaveBalance.all_objects.filter(
                    staff=staff,
                    is_deleted=False
                )
                self.stdout.write(f"Balances for this staff: {staff_balances.count()}")
                
                for bal in staff_balances:
                    self.stdout.write(
                        f"  - {bal.leave_type.name} {bal.year}: {bal.entitled_days} days "
                        f"(tenant:{bal.tenant_id}, branch:{bal.branch_id})"
                    )
                    
            except Staff.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Staff {staff_id} not found"))

        # Check for tenant/branch mismatches
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("🚨 SCOPING MISMATCH DETECTION:")
        self.stdout.write("=" * 80 + "\n")

        with connection.cursor() as cursor:
            # Check for balances where staff and balance have different tenants
            cursor.execute("""
                SELECT 
                    lb.id,
                    s.first_name,
                    s.last_name,
                    lb.tenant_id as balance_tenant,
                    s.tenant_id as staff_tenant,
                    lb.branch_id as balance_branch,
                    s.branch_id as staff_branch
                FROM hr_leavebalance lb
                JOIN hr_staff s ON lb.staff_id = s.id
                WHERE lb.is_deleted = FALSE
                AND (lb.tenant_id != s.tenant_id OR lb.branch_id != s.branch_id)
            """)
            mismatches = cursor.fetchall()

        if mismatches:
            self.stdout.write(self.style.ERROR(
                f"❌ FOUND {len(mismatches)} SCOPING MISMATCHES!\n"
            ))
            for row in mismatches:
                (id, first, last, bal_tenant, staff_tenant, bal_branch, staff_branch) = row
                self.stdout.write(f"Balance ID {id} - {first} {last}:")
                if bal_tenant != staff_tenant:
                    self.stdout.write(f"  ⚠️  Tenant: Balance={bal_tenant}, Staff={staff_tenant}")
                if bal_branch != staff_branch:
                    self.stdout.write(f"  ⚠️  Branch: Balance={bal_branch}, Staff={staff_branch}")
        else:
            self.stdout.write(self.style.SUCCESS("✓ No scoping mismatches found"))

        # Check leave types
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("📋 LEAVE TYPES:")
        self.stdout.write("=" * 80 + "\n")

        leave_types = LeaveType.objects.filter(is_deleted=False)
        self.stdout.write(f"Active Leave Types: {leave_types.count()}\n")
        for lt in leave_types:
            balance_count = LeaveBalance.all_objects.filter(
                leave_type=lt,
                is_deleted=False
            ).count()
            self.stdout.write(
                f"  - {lt.name} ({lt.code}): {lt.default_days_per_year} days "
                f"[{balance_count} balances] (branch_id: {lt.branch_id})"
            )

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("DIAGNOSTIC COMPLETE")
        self.stdout.write("=" * 80)
