from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from branches.models import Branch
from users.models import Tenant
from django.db import transaction

User = get_user_model()

class Command(BaseCommand):
    help = 'Setup initial data for the system'

    def handle(self, *args, **options):
        with transaction.atomic():
            # Get or create the superuser tenant
            user = User.objects.filter(username='samuel').first()
            if not user:
                self.stdout.write('Superuser not found. Please run createsuperuser first.')
                return

            # Create tenant for the superuser
            tenant, created = Tenant.objects.get_or_create(
                owner=user,
                defaults={
                    'name': 'Main Organization'
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS('Created tenant: Main Organization'))

            # Update user's tenant
            User.objects.filter(id=user.id).update(tenant=tenant)
            self.stdout.write(self.style.SUCCESS('Associated user with tenant'))

        # Create main branch
        branch, created = Branch.objects.get_or_create(
            code='HQ',
            defaults={
                'name': 'Headquarters',
                'address': 'Main Office',
                'owner': user,
                'created_by': user
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('Created branch: Headquarters'))

        # Associate user with branch
        if not user.branch:
            user.branch = branch
            user.save()
            self.stdout.write(self.style.SUCCESS('Associated user with branch'))

        self.stdout.write(self.style.SUCCESS('\nSetup complete!'))
        self.stdout.write(f'Tenant ID: {tenant.id}')
        self.stdout.write(f'Branch ID: {branch.id}')
        self.stdout.write(f'User ID: {user.id}')
