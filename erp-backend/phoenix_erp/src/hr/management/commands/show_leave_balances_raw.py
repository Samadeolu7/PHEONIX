# hr/management/commands/show_leave_balances_raw.py
"""
Show what's actually in the database vs. what's visible through managers

Usage:
    python manage.py show_leave_balances_raw
    python manage.py show_leave_balances_raw --user-id 1
"""

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Show raw leave balance data and visibility issues'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='Check visibility for specific user (e.g., admin user)',
        )

    def handle(self, *args, **options):
        user_id = options.get('user_id')

        self.stdout.write("=" * 80)
        self.stdout.write("RAW LEAVE BALANCE DATA")
        self.stdout.write("=" * 80 + "\n")

        # Show raw database data
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    lb.id,
                    lb.staff_id,
                    s.first_name,
                    s.last_name,
                    lt.name as leave_type,
                    lb.year,
                    lb.entitled_days,
                    lb.used_days,
                    lb.pending_days,
                    lb.is_deleted,
                    lb.tenant_id,
                    lb.owner_id,
                    lb.branch_id,
                    t.name as tenant_name,
                    b.name as branch_name,
                    u.email as owner_email
                FROM hr_leavebalance lb
                JOIN hr_staff s ON lb.staff_id = s.id
                JOIN hr_leavetype lt ON lb.leave_type_id = lt.id
                LEFT JOIN users_tenant t ON lb.tenant_id = t.id
                LEFT JOIN branches_branch b ON lb.branch_id = b.id
                LEFT JOIN users_user u ON lb.owner_id = u.id
                ORDER BY lb.id
            """)
            rows = cursor.fetchall()

        self.stdout.write(f"Total records in hr_leavebalance table: {len(rows)}\n")

        if not rows:
            self.stdout.write("❌ No leave balances found in database!")
            return

        self.stdout.write("All Leave Balances in Database:")
        self.stdout.write("-" * 80)
        
        for row in rows:
            (id, staff_id, first_name, last_name, leave_type, year, entitled, used, 
             pending, is_deleted, tenant_id, owner_id, branch_id, 
             tenant_name, branch_name, owner_email) = row
            
            deleted_flag = "🗑️ DELETED" if is_deleted else "✓"
            available = entitled - used - pending
            
            self.stdout.write(
                f"{deleted_flag} ID:{id:2d} | {first_name} {last_name} (Staff:{staff_id}) | "
                f"{leave_type} {year}"
            )
            self.stdout.write(
                f"         Entitled:{entitled} Used:{used} Pending:{pending} Available:{available}"
            )
            self.stdout.write(
                f"         Scoping: tenant={tenant_id} ({tenant_name}), "
                f"branch={branch_id} ({branch_name}), owner={owner_id} ({owner_email})"
            )
            self.stdout.write("")

        # If user_id provided, check what that user can see
        if user_id:
            self.stdout.write("\n" + "=" * 80)
            self.stdout.write(f"VISIBILITY CHECK FOR USER ID: {user_id}")
            self.stdout.write("=" * 80 + "\n")

            from users.models import User
            from hr.models import LeaveBalance

            try:
                user = User.objects.get(id=user_id)
                self.stdout.write(f"User: {user.email}")
                self.stdout.write(f"  is_superuser: {user.is_superuser}")
                self.stdout.write(f"  is_system_admin: {getattr(user, 'is_system_admin', False)}")
                self.stdout.write(f"  tenant_id: {getattr(user, 'tenant_id', None)}")
                self.stdout.write(f"  branch_id: {getattr(user, 'branch_id', None)}\n")

                # Check what this user can see via ORM
                visible_balances = LeaveBalance.objects.for_user(user)
                self.stdout.write(f"Balances visible to this user via ORM: {visible_balances.count()}")

                if visible_balances.count() == 0:
                    self.stdout.write("\n❌ USER CANNOT SEE ANY BALANCES!")
                    self.stdout.write("\nPossible reasons:")
                    self.stdout.write("  1. User's tenant_id doesn't match balance tenant_ids")
                    self.stdout.write("  2. User's branch_id doesn't match balance branch_ids")
                    self.stdout.write("  3. User doesn't have proper permissions")
                    
                    # Check for mismatches
                    sample_balance = rows[0]
                    balance_tenant = sample_balance[10]  # tenant_id
                    balance_branch = sample_balance[12]  # branch_id
                    
                    if user.tenant_id != balance_tenant:
                        self.stdout.write(
                            f"\n⚠️  TENANT MISMATCH: User tenant={user.tenant_id}, Balance tenant={balance_tenant}"
                        )
                    if user.branch_id != balance_branch:
                        self.stdout.write(
                            f"⚠️  BRANCH MISMATCH: User branch={user.branch_id}, Balance branch={balance_branch}"
                        )
                else:
                    self.stdout.write("\n✓ User can see these balances:")
                    for bal in visible_balances:
                        self.stdout.write(
                            f"  - ID:{bal.id} | {bal.staff.first_name} {bal.staff.last_name} | "
                            f"{bal.leave_type.name} {bal.year}"
                        )

            except User.DoesNotExist:
                self.stdout.write(f"❌ User {user_id} not found")

        # Check all users
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("ALL USERS IN SYSTEM:")
        self.stdout.write("=" * 80 + "\n")

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    id,
                    email,
                    is_superuser,
                    is_staff,
                    tenant_id,
                    branch_id
                FROM users_user
                WHERE is_active = TRUE
                ORDER BY id
            """)
            users = cursor.fetchall()

        for user_row in users:
            uid, email, is_super, is_staff, tenant, branch = user_row
            admin_flag = "👑" if is_super else "👤"
            self.stdout.write(
                f"{admin_flag} ID:{uid} | {email} | "
                f"tenant={tenant}, branch={branch}"
            )

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("💡 TIP: Run with --user-id=X to check visibility for specific user")
        self.stdout.write("Example: python manage.py show_leave_balances_raw --user-id=1")
        self.stdout.write("=" * 80)
