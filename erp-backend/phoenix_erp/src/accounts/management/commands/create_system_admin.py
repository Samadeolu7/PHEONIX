"""
Management command to create system admin user

This user manages all tenant subscriptions from a central account.

Usage:
    python manage.py create_system_admin --email admin@yourcompany.com --password yourpassword
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction
from users.models import Tenant
from branches.models import Branch

User = get_user_model()


class Command(BaseCommand):
    help = 'Create system administrator account for managing tenant subscriptions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            required=True,
            help='Email address for system admin'
        )
        parser.add_argument(
            '--password',
            type=str,
            required=True,
            help='Password for system admin'
        )
        parser.add_argument(
            '--first-name',
            type=str,
            default='System',
            help='First name (default: System)'
        )
        parser.add_argument(
            '--last-name',
            type=str,
            default='Administrator',
            help='Last name (default: Administrator)'
        )
        parser.add_argument(
            '--company-name',
            type=str,
            default='System Administration',
            help='Company/Tenant name (default: System Administration)'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        email = options['email']
        password = options['password']
        first_name = options['first_name']
        last_name = options['last_name']
        company_name = options['company_name']

        # Check if system admin already exists
        if User.objects.filter(email=email).exists():
            raise CommandError(f'User with email {email} already exists')

        if User.objects.filter(is_system_admin=True).exists():
            raise CommandError('System admin already exists. Only one system admin is allowed.')

        self.stdout.write('Creating system admin account...')

        # 1. Create tenant for system admin
        tenant = Tenant.objects.create(
            name=company_name,
            slug='system-admin',
            domain_type='multi',
            is_active=True
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Created tenant: {tenant.name}'))

        # 2. Create system admin user
        username = email.split('@')[0]
        admin_user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            tenant=tenant,
            is_superuser=True,
            is_staff=True,
            is_system_admin=True,
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Created user: {admin_user.email}'))

        # 3. Link tenant to owner
        tenant.owner = admin_user
        tenant.save()

        # 4. Create main branch for system admin
        branch = Branch.objects.create(
            name='Head Office',
            owner=admin_user,
            code='HQ',
            address='System Administration',
            is_active=True
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Created branch: {branch.name}'))

        # 5. Set default branch for user
        admin_user.branch = branch
        admin_user.save()

        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('System Admin Account Created Successfully!'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(f'Email: {admin_user.email}')
        self.stdout.write(f'Username: {admin_user.username}')
        self.stdout.write(f'Company: {tenant.name}')
        self.stdout.write(f'Branch: {branch.name}')
        self.stdout.write(self.style.WARNING('\nNext steps:'))
        self.stdout.write('1. Run: python manage.py setup_subscription_products')
        self.stdout.write('2. Log in to admin panel and configure subscription products')
        self.stdout.write('3. Create chart of accounts for subscription tracking')
