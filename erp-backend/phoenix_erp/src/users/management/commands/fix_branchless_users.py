"""
Management command: fix_branchless_users

Lists all staff users who have no branch assigned, and optionally assigns
them to a branch in bulk.

Usage:
  # List affected users
  python manage.py fix_branchless_users

  # Assign all branchless users to branch ID 1
  python manage.py fix_branchless_users --branch-id 1

  # Assign only within a specific tenant
  python manage.py fix_branchless_users --tenant-id 1 --branch-id 2
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Find and optionally fix staff users with no branch assigned'

    def add_arguments(self, parser):
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID to assign to all branchless users (omit to list only)',
        )
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Restrict to a specific tenant',
        )

    def handle(self, *args, **options):
        from users.models import User
        from branches.models import Branch

        qs = (
            User.objects
            .filter(branch__isnull=True, tenant__isnull=False)
            .exclude(is_system_admin=True)
            .select_related('tenant')
            .order_by('tenant__name', 'username')
        )

        tenant_id = options.get('tenant_id')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        users = list(qs)

        if not users:
            self.stdout.write(self.style.SUCCESS('No branchless users found.'))
            return

        self.stdout.write(
            self.style.WARNING(f'Found {len(users)} user(s) with no branch:')
        )
        for u in users:
            self.stdout.write(
                f'  id={u.id}  username={u.username}  tenant={u.tenant.name if u.tenant else "—"}'
            )

        branch_id = options.get('branch_id')
        if not branch_id:
            self.stdout.write(
                '\nRun with --branch-id <id> to assign a branch to all listed users.'
            )
            return

        try:
            branch = Branch.objects.get(pk=branch_id)
        except Branch.DoesNotExist:
            self.stderr.write(self.style.ERROR(f'Branch id={branch_id} not found.'))
            return

        with transaction.atomic():
            updated = qs.update(branch=branch)

        self.stdout.write(
            self.style.SUCCESS(
                f'Assigned branch "{branch.name}" (id={branch.id}) to {updated} user(s).'
            )
        )
