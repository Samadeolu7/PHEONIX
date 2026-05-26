# hr/management/commands/fix_leave_balance_tenant.py
"""
Fix leave balances with NULL tenant_id

Usage:
    python manage.py fix_leave_balance_tenant
"""

from django.core.management.base import BaseCommand
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Fix leave balances with NULL tenant_id by syncing with staff'

    def handle(self, *args, **options):
        self.stdout.write("=" * 80)
        self.stdout.write("FIXING NULL TENANT_ID IN LEAVE BALANCES")
        self.stdout.write("=" * 80 + "\n")

        # Show current state
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) 
                FROM hr_leavebalance 
                WHERE tenant_id IS NULL AND is_deleted = FALSE
            """)
            null_count = cursor.fetchone()[0]

        self.stdout.write(f"Leave balances with NULL tenant_id: {null_count}\n")

        if null_count == 0:
            self.stdout.write("✓ No balances need fixing!")
            return

        # Fix by syncing with staff tenant
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("""
                    UPDATE hr_leavebalance lb
                    SET tenant_id = s.tenant_id
                    FROM hr_staff s
                    WHERE lb.staff_id = s.id
                    AND lb.tenant_id IS NULL
                    AND s.tenant_id IS NOT NULL
                    RETURNING lb.id, lb.staff_id, s.tenant_id
                """)
                fixed_rows = cursor.fetchall()

        self.stdout.write(f"✓ Fixed {len(fixed_rows)} leave balances:\n")
        for balance_id, staff_id, tenant_id in fixed_rows:
            self.stdout.write(f"  Balance ID {balance_id} (Staff {staff_id}) -> tenant_id={tenant_id}")

        # Verify
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) 
                FROM hr_leavebalance 
                WHERE tenant_id IS NULL AND is_deleted = FALSE
            """)
            remaining_null = cursor.fetchone()[0]

        self.stdout.write(f"\nRemaining NULL tenant_ids: {remaining_null}")

        if remaining_null > 0:
            self.stdout.write("\n⚠️  Some balances still have NULL tenant_id.")
            self.stdout.write("These may belong to staff without tenant_id set.")
            
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT lb.id, s.id, s.first_name, s.last_name, s.tenant_id
                    FROM hr_leavebalance lb
                    JOIN hr_staff s ON lb.staff_id = s.id
                    WHERE lb.tenant_id IS NULL AND lb.is_deleted = FALSE
                """)
                problem_rows = cursor.fetchall()
            
            for balance_id, staff_id, first, last, staff_tenant in problem_rows:
                self.stdout.write(
                    f"  Balance {balance_id}: Staff {staff_id} ({first} {last}) "
                    f"has tenant_id={staff_tenant}"
                )

        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("DONE!")
        self.stdout.write("=" * 80)
