# hr/management/commands/debug_leave_balance.py
"""
Debug command to check leave balance tenant assignments
"""
from django.core.management.base import BaseCommand
from hr.models import LeaveBalance, Staff, LeaveRequest
from users.models import User


class Command(BaseCommand):
    help = 'Debug leave balance and request tenant assignments'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== Leave Balance & Request Debug ===\n'))
        
        # Check users
        users = User.objects.all()
        self.stdout.write(f'Total users: {users.count()}')
        for user in users[:3]:
            self.stdout.write(f'  User {user.id}: {user.username}, tenant={user.tenant}')
        
        # Check staff
        staff_members = Staff.all_objects.all()
        self.stdout.write(f'\nTotal staff: {staff_members.count()}')
        for staff in staff_members[:3]:
            self.stdout.write(f'  Staff {staff.id}: {staff.first_name} {staff.last_name}, tenant={staff.tenant}, owner={staff.owner}')
        
        # Check leave balances
        balances = LeaveBalance.all_objects.all()
        self.stdout.write(f'\nTotal leave balances: {balances.count()}')
        for balance in balances[:5]:
            self.stdout.write(
                f'  Balance {balance.id}: staff={balance.staff.first_name}, '
                f'type={balance.leave_type.code}, year={balance.year}, '
                f'tenant={balance.tenant}, entitled={balance.entitled_days}'
            )
        
        # Check leave requests
        requests = LeaveRequest.all_objects.all()
        self.stdout.write(f'\nTotal leave requests: {requests.count()}')
        for req in requests[:5]:
            self.stdout.write(
                f'  Request {req.id}: {req.reference_number}, staff={req.staff.first_name}, '
                f'status={req.status}, tenant={req.tenant}'
            )
        
        # Check for mismatches
        self.stdout.write(self.style.WARNING('\n=== Checking for tenant mismatches ==='))
        
        mismatch_balances = []
        for balance in balances:
            if balance.tenant != balance.staff.tenant:
                mismatch_balances.append(balance)
                self.stdout.write(
                    self.style.ERROR(
                        f'  MISMATCH: Balance {balance.id} tenant={balance.tenant} != '
                        f'staff.tenant={balance.staff.tenant}'
                    )
                )
        
        if not mismatch_balances:
            self.stdout.write(self.style.SUCCESS('  ✓ All leave balances have matching tenants'))
        
        mismatch_requests = []
        for req in requests:
            if req.tenant != req.staff.tenant:
                mismatch_requests.append(req)
                self.stdout.write(
                    self.style.ERROR(
                        f'  MISMATCH: Request {req.id} tenant={req.tenant} != '
                        f'staff.tenant={req.staff.tenant}'
                    )
                )
        
        if not mismatch_requests:
            self.stdout.write(self.style.SUCCESS('  ✓ All leave requests have matching tenants'))
        
        self.stdout.write(self.style.SUCCESS('\n=== Debug complete ==='))
