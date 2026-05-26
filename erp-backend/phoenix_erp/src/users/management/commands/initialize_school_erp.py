# users/management/commands/initialize_school_erp.py
"""
Initialize Complete School ERP System
This command sets up everything needed for a school:
- Chart of Accounts (fees, expenses, etc.)
- Workflows (fee collection, expense approval, etc.)
- Forms (student registration, fee payment, etc.)
- Pages & Modules (Finance, Administration, etc.)
- Reports (financial statements, fee summaries, etc.)
- Default Roles (Accountant, Teacher, Principal, etc.)

Prerequisites:
- Must run initialize_system_roles first
- Requires a tenant and branch

Usage:
    python manage.py initialize_school_erp --tenant-id=1 --branch-id=1
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from users.models import Tenant, Role
from branches.models import Branch
from accounts.models import Account, AccountCategory
from accounts.utils.setup_accounts import create_standard_accounts
from accounts.utils.account_creation import get_or_create_child_account
from automations.models import FormSchema, WorkflowTemplate
from pages.models import Module, ModulePage
from dashboards.models import Dashboard
from decimal import Decimal
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Initialize complete school ERP system with all components'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            required=True,
            help='ID of the tenant to initialize'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            required=True,
            help='ID of the branch to use'
        )
        parser.add_argument(
            '--school-name',
            type=str,
            default='Phoenix School',
            help='Name of the school'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n🏫 Initializing School ERP System...\n'))

        try:
            # Get tenant and branch
            tenant = Tenant.objects.get(id=options['tenant_id'])
            branch = Branch.objects.get(id=options['branch_id'])
            owner = tenant.owner

            if not owner:
                self.stdout.write(self.style.ERROR('❌ Tenant must have an owner. Run initialize_system_roles first.'))
                return

            self.stdout.write(f'🏢 Tenant: {tenant.name}')
            self.stdout.write(f'🏪 Branch: {branch.name}')
            self.stdout.write(f'👤 Owner: {owner.get_full_name()}\n')

            with transaction.atomic():
                # Step 1: Create School-specific Roles
                roles_created = self.create_school_roles(tenant, owner, branch)
                
                # Step 2: Create Chart of Accounts
                accounts_created = self.create_chart_of_accounts(tenant, owner, branch, options['school_name'])
                
                # Step 3: Create Inventory Stores
                stores_created = self.create_inventory_stores(tenant, owner, branch)
                
                # Step 4: Create Modules and Pages
                modules_created = self.create_modules_and_pages(tenant, owner, branch)
                
                # Step 5: Create Workflows
                workflows_created = self.create_workflows(tenant, owner, branch)
                
                # Step 6: Create Forms
                forms_created = self.create_forms(tenant, owner, branch)
                
                # Step 7: Create Default Dashboard
                dashboard_created = self.create_default_dashboard(tenant, owner, branch)

                self.stdout.write(self.style.SUCCESS('\n✅ School ERP initialization completed successfully!\n'))
                self.print_summary(roles_created, accounts_created, modules_created, 
                                 workflows_created, forms_created, dashboard_created)

        except Tenant.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Tenant with ID {options["tenant_id"]} not found'))
        except Branch.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'❌ Branch with ID {options["branch_id"]} not found'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
            raise

    def create_school_roles(self, tenant, owner, branch):
        """Create school-specific roles"""
        self.stdout.write('\n👥 Creating School Roles...')
        
        roles_config = [
            {
                'name': 'Principal',
                'description': 'School principal with full access to school operations',
                'dashboards': [],
                'modules': ['finance', 'administration', 'academics', 'students', 'staff'],
                'pages': [],
            },
            {
                'name': 'Accountant',
                'description': 'Manages financial transactions, fee collection, and reports',
                'dashboards': [],
                'modules': ['finance', 'accounts'],
                'pages': ['fee-collection', 'expense-management', 'financial-reports'],
            },
            {
                'name': 'Teacher',
                'description': 'Teaching staff with limited access',
                'dashboards': [],
                'modules': ['academics', 'students'],
                'pages': ['class-management', 'attendance'],
            },
            {
                'name': 'Bursar',
                'description': 'Financial officer managing budgets and expenditures',
                'dashboards': [],
                'modules': ['finance', 'accounts', 'procurement'],
                'pages': ['budget-management', 'expense-approval', 'financial-reports'],
            },
            {
                'name': 'Student',
                'description': 'Student access to view fees and make payments',
                'dashboards': [],
                'modules': ['student-portal'],
                'pages': ['my-fees', 'payment-history'],
            },
        ]
        
        created_roles = []
        for role_data in roles_config:
            role, created = Role.objects.get_or_create(
                tenant=tenant,
                name=role_data['name'],
                defaults={
                    'description': role_data['description'],
                    'is_active': True,
                    'can_access_dashboards': role_data['dashboards'],
                    'can_access_modules': role_data['modules'],
                    'can_access_pages': role_data['pages'],
                }
            )
            if created:
                created_roles.append(role)
                self.stdout.write(f'  ✓ Created role: {role.name}')

        return created_roles

    def create_chart_of_accounts(self, tenant, owner, branch, school_name):
        """
        Seed chart of accounts for a school tenant.

        Step 1 – call create_standard_accounts() to ensure the full FIRS/IFRS
        parent + child structure is in place (idempotent, skips existing rows).

        Step 2 – add school-specific child accounts under the correct FIRS parents
        using get_or_create_child_account() so each child has a proper parent FK
        and a valid 4-digit code.
        """
        self.stdout.write('\n💰 Creating Chart of Accounts...')

        # ------------------------------------------------------------------
        # Step 1: full FIRS/IFRS chart of accounts (parents + standard children)
        # ------------------------------------------------------------------
        created_count, skipped_count = create_standard_accounts(tenant, force=False)
        self.stdout.write(
            f'  ✓ Standard FIRS accounts: {created_count} created, {skipped_count} already existed'
        )

        # ------------------------------------------------------------------
        # Step 2: school-specific child accounts
        # Each tuple: (parent_code, child_suffix, name, account_type)
        # child_suffix is 3 digits; final code = int(parent_code) + int(suffix)
        # ------------------------------------------------------------------
        school_children = [
            # -----------------------------------------------------------
            # REVENUE – children of 4100 Revenue from Contracts
            # Standard already creates 4101-4105.
            # "Revenue – Tuition"      = 4103 School Fees (already standard)
            # "Revenue – Other Revenue" = 4209 Miscellaneous Income (standard, under 4200)
            # -----------------------------------------------------------
            ('4100', '006', 'Revenue – Registration Fees',        'INCOME'),   # 4106
            ('4100', '007', 'Revenue – Uniform Sales',            'INCOME'),   # 4107
            ('4100', '008', 'Revenue – Textbook Sales',           'INCOME'),   # 4108
            ('4100', '009', 'Revenue – Development Levy',         'INCOME'),   # 4109
            ('4100', '010', 'Revenue – Launch Income',            'INCOME'),   # 4110
            ('4100', '011', 'Revenue – Special Event Income',     'INCOME'),   # 4111
            ('4100', '012', 'Revenue – Coding Classes',           'INCOME'),   # 4112
            ('4100', '013', 'Revenue – Transportation Fees',      'INCOME'),   # 4113
            ('4100', '014', 'Revenue – PTA Levy',                 'INCOME'),   # 4114
            ('4100', '015', 'Revenue – Practical Fees',               'INCOME'),   # 4115
            ('4100', '016', 'Revenue – BECE and NECO Examination Fees','INCOME'),   # 4116

            # -----------------------------------------------------------
            # COST OF SALES – children of 5100
            # Standard already creates 5101-5104.
            # -----------------------------------------------------------
            ('5100', '005', 'Cost of Sales – Uniform',            'EXPENSE'),  # 5105
            ('5100', '006', 'Cost of Sales – Textbook',           'EXPENSE'),  # 5106
            ('5100', '007', 'Cost of Sales – Launch',             'EXPENSE'),  # 5107
            ('5100', '008', 'Cost of Sales – Transportation',     'EXPENSE'),  # 5108
            ('5100', '009', 'Cost of Sales – Special Event',      'EXPENSE'),  # 5109

            # -----------------------------------------------------------
            # PERSONNEL COSTS – children of 5200
            # Standard: 5201 Salaries and Wages  → "Salary and Wages" template line
            #           5206 Staff Medical        → "Medical Expenses" template line
            # -----------------------------------------------------------
            ('5200', '008', 'Employee Welfare and Other Costs',        'EXPENSE'),  # 5208

            # -----------------------------------------------------------
            # ADMINISTRATIVE EXPENSES – children of 5300
            # Standard covers: 5302 Utilities, 5303 Office Supplies, 5304 Comms,
            #   5305 Repairs, 5306 Insurance, 5307 Audit, 5309 Cleaning
            # New lines from template:
            # -----------------------------------------------------------
            ('5300', '011', 'Computer and Technology Expenses',        'EXPENSE'),  # 5311
            ('5300', '012', 'Electricity and Energy Expenses',         'EXPENSE'),  # 5312
            ('5300', '013', 'Water Expenses',                          'EXPENSE'),  # 5313
            ('5300', '014', 'Repair – Generator',                      'EXPENSE'),  # 5314
            ('5300', '015', 'Repair – Motor Vehicle',                  'EXPENSE'),  # 5315

            # -----------------------------------------------------------
            # SELLING / DISTRIBUTION – children of 5400
            # Standard: 5402 Travel/Transport → "Transport Expenses" template line
            #           5403 Entertainment      → "Entertainment Expenses" template line
            # -----------------------------------------------------------
            ('5400', '005', 'Fuel Expenses',                           'EXPENSE'),  # 5405
        ]

        school_accounts = []
        for parent_code, suffix, name, acct_type in school_children:
            try:
                acct = get_or_create_child_account(
                    parent_code=parent_code,
                    child_suffix=suffix,
                    name=name,
                    account_type=acct_type,
                    owner=owner,
                    branch=branch,
                    parent_name=None,   # parent already exists from Step 1
                )
                school_accounts.append(acct)
            except Exception as e:
                self.stdout.write(self.style.WARNING(
                    f'  ⚠ Skipped school account "{name}" ({parent_code}+{suffix}): {e}'
                ))

        self.stdout.write(
            f'  ✓ School-specific child accounts: {len(school_accounts)} created/confirmed'
        )
        return school_accounts

    def create_inventory_stores(self, tenant, owner, branch):
        """
        Create the two school inventory store locations.

        - Primary School Store   (code: PRI-STORE)
        - Secondary School Store (code: SEC-STORE)
        """
        self.stdout.write('\n🏪 Creating Inventory Stores...')

        from inventory.models import Location

        stores = [
            {
                'code': 'PRI-STORE',
                'name': 'Primary School Store',
                'location_type': 'store',
                'address': 'Primary School Block',
            },
            {
                'code': 'SEC-STORE',
                'name': 'Secondary School Store',
                'location_type': 'store',
                'address': 'Secondary School Block',
            },
        ]

        created_stores = []
        for store_data in stores:
            loc, created = Location.objects.get_or_create(
                branch=branch,
                code=store_data['code'],
                defaults={
                    'name': store_data['name'],
                    'location_type': store_data['location_type'],
                    'address': store_data['address'],
                    'is_active': True,
                    'owner': owner,
                    'tenant': tenant,
                }
            )
            if created:
                created_stores.append(loc)
                self.stdout.write(f'  ✓ Created store: {loc.name} [{loc.code}]')
            else:
                self.stdout.write(f'  ℹ Already exists: {loc.name} [{loc.code}]')

        return created_stores

    def create_modules_and_pages(self, tenant, owner, branch):
        """Create school modules and pages"""
        self.stdout.write('\n📄 Creating Modules and Pages...')
        
        modules_config = [
            {
                'code': 'finance',
                'name': 'Finance',
                'icon': 'dollar-sign',
                'pages': [
                    ('fee-collection', 'Fee Collection', 'form'),
                    ('expense-management', 'Expense Management', 'form'),
                    ('financial-reports', 'Financial Reports', 'report'),
                ]
            },
            {
                'code': 'administration',
                'name': 'Administration',
                'icon': 'briefcase',
                'pages': [
                    ('staff-management', 'Staff Management', 'list'),
                    ('student-registration', 'Student Registration', 'form'),
                ]
            },
            {
                'code': 'academics',
                'name': 'Academics',
                'icon': 'book',
                'pages': [
                    ('class-management', 'Class Management', 'list'),
                    ('attendance', 'Attendance', 'form'),
                ]
            },
        ]
        
        created_count = 0
        for module_data in modules_config:
            module, created = Module.objects.get_or_create(
                code=module_data['code'],
                owner=owner,
                branch=branch,
                defaults={
                    'name': module_data['name'],
                    'icon': module_data['icon'],
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                
            for page_code, page_title, page_type in module_data['pages']:
                page, created = ModulePage.objects.get_or_create(
                    code=page_code,
                    module=module,
                    owner=owner,
                    branch=branch,
                    defaults={
                        'title': page_title,
                        'page_type': page_type,
                        'url_path': f'/{module_data["code"]}/{page_code}',
                        'is_active': True,
                    }
                )
                if created:
                    created_count += 1
        
        self.stdout.write(f'  ✓ Created {created_count} modules and pages')
        return created_count

    def create_workflows(self, tenant, owner, branch):
        """Create school workflows"""
        self.stdout.write('\n⚙️ Creating Workflows...')
        
        # This would integrate with the existing workflow system
        # For now, placeholder
        self.stdout.write('  ℹ️  Workflow creation pending (integrate with automations)')
        return 0

    def create_forms(self, tenant, owner, branch):
        """Create school forms"""
        self.stdout.write('\n📝 Creating Forms...')
        
        # This would integrate with the existing forms system
        # For now, placeholder
        self.stdout.write('  ℹ️  Form creation pending (integrate with automations)')
        return 0

    def create_default_dashboard(self, tenant, owner, branch):
        """Create default dashboard"""
        self.stdout.write('\n📊 Creating Default Dashboard...')
        
        dashboard, created = Dashboard.objects.get_or_create(
            slug='school-admin-dashboard',
            owner=owner,
            branch=branch,
            defaults={
                'name': 'School Admin Dashboard',
                'is_public': False,
                'is_active': True,
            }
        )
        
        if created:
            self.stdout.write(f'  ✓ Created dashboard: {dashboard.name}')
        return dashboard if created else None

    def print_summary(self, roles, accounts, modules, workflows, forms, dashboard):
        """Print initialization summary"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('SCHOOL ERP INITIALIZATION SUMMARY'))
        self.stdout.write('='*60 + '\n')
        self.stdout.write(f'✓ Roles: {len(roles)} created')
        self.stdout.write(f'✓ Accounts: {len(accounts)} created')
        self.stdout.write(f'✓ Modules & Pages: {modules} created')
        self.stdout.write(f'✓ Workflows: {workflows} created')
        self.stdout.write(f'✓ Forms: {forms} created')
        self.stdout.write(f'✓ Dashboard: {"Yes" if dashboard else "No"}')
        self.stdout.write('='*60 + '\n')
