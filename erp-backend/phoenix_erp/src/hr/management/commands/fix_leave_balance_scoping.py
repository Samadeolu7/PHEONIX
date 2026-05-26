# hr/management/commands/fix_leave_balance_scoping.py
"""
Fix leave balance scoping issues by syncing tenant/branch/owner with staff

Usage:
    python manage.py fix_leave_balance_scoping --dry-run
    python manage.py fix_leave_balance_scoping --fix
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from hr.models import LeaveBalance, Staff


class Command(BaseCommand):
    help = 'Fix leave balance scoping mismatches (sync with staff tenant/branch/owner)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Actually apply fixes (default is dry-run)',
        )
        parser.add_argument(
            '--balance-id',
            type=int,
            help='Fix only specific balance ID',
        )

    def handle(self, *args, **options):
        fix_mode = options['fix']
        balance_id = options.get('balance_id')

        self.stdout.write("=" * 80)
        self.stdout.write(self.style.WARNING("LEAVE BALANCE SCOPING FIX"))
        self.stdout.write("=" * 80 + "\n")

        if not fix_mode:
            self.stdout.write(self.style.NOTICE("DRY RUN MODE - No changes will be made"))
            self.stdout.write("Use --fix to actually apply fixes\n")

        # Get all leave balances with staff
        balances = LeaveBalance.all_objects.filter(is_deleted=False).select_related('staff')
        
        if balance_id:
            balances = balances.filter(id=balance_id)

        total_count = balances.count()
        mismatched_count = 0
        fixed_count = 0
        error_count = 0

        self.stdout.write(f"Checking {total_count} leave balances...\n")

        for balance in balances:
            staff = balance.staff
            issues = []
            fixes = {}

            # Check tenant mismatch
            if balance.tenant_id != staff.tenant_id:
                issues.append(f"Tenant: {balance.tenant_id} → {staff.tenant_id}")
                fixes['tenant'] = staff.tenant
                fixes['tenant_id'] = staff.tenant_id

            # Check branch mismatch
            if balance.branch_id != staff.branch_id:
                issues.append(f"Branch: {balance.branch_id} → {staff.branch_id}")
                fixes['branch'] = staff.branch
                fixes['branch_id'] = staff.branch_id

            # Check owner mismatch
            if balance.owner_id != staff.owner_id:
                issues.append(f"Owner: {balance.owner_id} → {staff.owner_id}")
                fixes['owner'] = staff.owner
                fixes['owner_id'] = staff.owner_id

            if issues:
                mismatched_count += 1
                self.stdout.write(
                    f"❌ Balance ID {balance.id} - {staff.first_name} {staff.last_name} "
                    f"({balance.leave_type.name} {balance.year})"
                )
                for issue in issues:
                    self.stdout.write(f"   {issue}")

                if fix_mode:
                    try:
                        with transaction.atomic():
                            for field, value in fixes.items():
                                setattr(balance, field, value)
                            balance.save()
                        fixed_count += 1
                        self.stdout.write(self.style.SUCCESS("   ✓ FIXED"))
                    except Exception as e:
                        error_count += 1
                        self.stdout.write(self.style.ERROR(f"   ✗ ERROR: {str(e)}"))
                else:
                    self.stdout.write("   (Would fix in --fix mode)")

        # Summary
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write("SUMMARY")
        self.stdout.write("=" * 80)
        self.stdout.write(f"Total balances checked: {total_count}")
        self.stdout.write(f"Mismatched balances: {mismatched_count}")
        
        if fix_mode:
            self.stdout.write(self.style.SUCCESS(f"Fixed: {fixed_count}"))
            if error_count > 0:
                self.stdout.write(self.style.ERROR(f"Errors: {error_count}"))
        else:
            self.stdout.write(self.style.NOTICE(
                f"\nRun with --fix to correct {mismatched_count} mismatched balances"
            ))

        if mismatched_count == 0:
            self.stdout.write(self.style.SUCCESS("\n✓ All leave balances have correct scoping!"))

        self.stdout.write("=" * 80)
