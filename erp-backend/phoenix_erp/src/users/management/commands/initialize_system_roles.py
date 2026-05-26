# users/management/commands/initialize_system_roles.py
"""
Initialize System Roles and First Tenant
Creates:
1. System Administrator role (cross-tenant access)
2. Tenant Administrator role (tenant-wide access)
3. First tenant with owner
4. Default branch for first tenant

Usage:
    python manage.py initialize_system_roles
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from users.models import Tenant, Role
from branches.models import Branch
from django.utils.text import slugify
from django.contrib.auth.models import Permission

User = get_user_model()


class Command(BaseCommand):
    help = 'Initialize system with sys_admin role, first tenant, and admin role'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-name',
            type=str,
            default='Phoenix ERP',
            help='Name of the first tenant'
        )
        parser.add_argument(
            '--domain-type',
            type=str,
            default='multi',
            choices=['microfinance', 'school', 'hospital', 'retail', 'multi'],
            help='Domain type for the tenant'
        )
        parser.add_argument(
            '--admin-email',
            type=str,
            default='admin@phoenixerp.com',
            help='Email for the system administrator'
        )
        parser.add_argument(
            '--admin-username',
            type=str,
            default='sysadmin',
            help='Username for the system administrator'
        )
        parser.add_argument(
            '--admin-password',
            type=str,
            default='admin123',
            help='Password for the system administrator'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n🚀 Initializing System Roles and First Tenant...\n'))

        try:
            with transaction.atomic():
                # Step 1: Create first tenant
                tenant = self.create_first_tenant(options)
                
                # Step 2: Create default branch
                branch = self.create_default_branch(tenant)
                
                # Step 3: Create system administrator user
                sys_admin_user = self.create_system_administrator(tenant, branch, options)
                
                # Step 4: Set tenant owner
                tenant.owner = sys_admin_user
                tenant.save()
                
                # Step 5: Create sys_admin role (cross-tenant)
                sys_admin_role = self.create_sys_admin_role(tenant)
                
                # Step 6: Create admin role (tenant-wide)
                admin_role = self.create_admin_role(tenant)
                
                # Step 7: Assign sys_admin role to system administrator
                sys_admin_user.roles.add(sys_admin_role)
                sys_admin_user.is_system_admin = True
                sys_admin_user.save()

                self.stdout.write(self.style.SUCCESS('\n✅ System initialization completed successfully!\n'))
                self.print_summary(tenant, branch, sys_admin_user, sys_admin_role, admin_role, options)

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
            raise

    def create_first_tenant(self, options):
        """Create the first tenant"""
        tenant_name = options['tenant_name']
        domain_type = options['domain_type']
        slug = slugify(tenant_name)

        tenant, created = Tenant.objects.get_or_create(
            slug=slug,
            defaults={
                'name': tenant_name,
                'domain_type': domain_type,
                'is_active': True,
                'enabled_features': [
                    'dashboards',
                    'workflows',
                    'forms',
                    'reports',
                    'accounts',
                    'inventory',
                    'procurement',
                    'assets',
                    'liabilities',
                ],
                'settings': {
                    'currency': 'NGN',
                    'country': 'NG',
                    'timezone': 'Africa/Lagos',
                }
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created first tenant: {tenant_name}'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ Tenant already exists: {tenant_name}'))

        return tenant

    def create_default_branch(self, tenant):
        """Create default branch for tenant"""
        branch, created = Branch.objects.get_or_create(
            tenant=tenant,
            code='HQ',
            defaults={
                'name': 'Headquarters',
                'is_active': True,
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created default branch: {branch.name}'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ Branch already exists: {branch.name}'))

        return branch

    def create_system_administrator(self, tenant, branch, options):
        """Create system administrator user"""
        admin_email = options['admin_email']
        admin_username = options['admin_username']
        admin_password = options['admin_password']

        user, created = User.objects.get_or_create(
            username=admin_username,
            defaults={
                'email': admin_email,
                'first_name': 'System',
                'last_name': 'Administrator',
                'tenant': tenant,
                'branch': branch,
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
                'is_active_user': True,
            }
        )

        if created:
            user.set_password(admin_password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f'✓ Created system administrator: {admin_username}'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ User already exists: {admin_username}'))

        return user

    def create_sys_admin_role(self, tenant):
        """Create System Administrator role with cross-tenant access"""
        role, created = Role.objects.get_or_create(
            tenant=tenant,
            name='System Administrator',
            defaults={
                'description': 'Full system access across all tenants. Can manage all tenants, users, and system-wide settings.',
                'is_active': True,
                'can_access_dashboards': [],  # Empty means all dashboards
                'can_access_modules': [],  # Empty means all modules
                'can_access_pages': [],  # Empty means all pages
            }
        )

        if created:
            # Assign all permissions
            all_permissions = Permission.objects.all()
            role.permissions.set(all_permissions)
            self.stdout.write(self.style.SUCCESS(f'✓ Created sys_admin role with {all_permissions.count()} permissions'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ sys_admin role already exists'))

        return role

    def create_admin_role(self, tenant):
        """Create Tenant Administrator role with tenant-wide access"""
        role, created = Role.objects.get_or_create(
            tenant=tenant,
            name='Administrator',
            defaults={
                'description': 'Full access to all resources within the tenant. Can manage users, branches, and all modules.',
                'is_active': True,
                'can_access_dashboards': [],  # Empty means all dashboards in tenant
                'can_access_modules': [],  # Empty means all modules in tenant
                'can_access_pages': [],  # Empty means all pages in tenant
            }
        )

        if created:
            # Assign tenant-level permissions (exclude system-wide permissions)
            tenant_permissions = Permission.objects.exclude(
                codename__in=[
                    'add_tenant',
                    'change_tenant',
                    'delete_tenant',
                    'view_tenant',
                ]
            )
            role.permissions.set(tenant_permissions)
            self.stdout.write(self.style.SUCCESS(f'✓ Created admin role with {tenant_permissions.count()} permissions'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ admin role already exists'))

        return role

    def print_summary(self, tenant, branch, user, sys_admin_role, admin_role, options):
        """Print initialization summary"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('SYSTEM INITIALIZATION SUMMARY'))
        self.stdout.write('='*60 + '\n')
        
        self.stdout.write(f'🏢 Tenant:')
        self.stdout.write(f'   Name: {tenant.name}')
        self.stdout.write(f'   Domain Type: {tenant.get_domain_type_display()}')
        self.stdout.write(f'   Slug: {tenant.slug}\n')
        
        self.stdout.write(f'🏪 Branch:')
        self.stdout.write(f'   Name: {branch.name}')
        self.stdout.write(f'   Code: {branch.code}\n')
        
        self.stdout.write(f'👤 System Administrator:')
        self.stdout.write(f'   Username: {user.username}')
        self.stdout.write(f'   Email: {user.email}')
        self.stdout.write(f'   Password: {options["admin_password"]}\n')
        
        self.stdout.write(f'🔐 Roles Created:')
        self.stdout.write(f'   1. {sys_admin_role.name}')
        self.stdout.write(f'      - Cross-tenant access')
        self.stdout.write(f'      - {sys_admin_role.permissions.count()} permissions')
        self.stdout.write(f'   2. {admin_role.name}')
        self.stdout.write(f'      - Tenant-wide access')
        self.stdout.write(f'      - {admin_role.permissions.count()} permissions\n')
        
        self.stdout.write('='*60)
        self.stdout.write(self.style.SUCCESS('\n✨ Next Steps:'))
        self.stdout.write('1. Run migrations if not done: python manage.py migrate')
        self.stdout.write('2. Initialize school system: python manage.py initialize_school_erp')
        self.stdout.write(f'3. Login with: {user.username} / {options["admin_password"]}')
        self.stdout.write('='*60 + '\n')
