# core/management/commands/initialize_production_erp.py
"""
MASTER PRODUCTION ERP INITIALIZATION COMMAND

This is the ONE entry point for complete ERP system initialization.
Creates everything needed for a production-ready ERP system:

1. System Roles & Permissions (CEO, Accountant, Bursar, etc.)
2. Role-Based Dashboards (intuitive, role-specific views)
3. Complete Chart of Accounts (all account types)
4. Forms & Workflows (approval flows, data entry)
5. Reports (financial, operational, management reports)
6. Pages & Navigation (role-based UI/UX)

Based on:
- Process File Updated 25th Nov.25.pdf
- Phoenix Software Access Table.pdf

Usage:
    # For new tenant (recommended):
    python manage.py initialize_production_erp \
        --organization="ABC School" \
        --domain-type="school" \
        --admin-email="admin@abcschool.com" \
        --admin-username="admin" \
        --admin-password="SecurePassword123"
    
    # For existing tenant:
    python manage.py initialize_production_erp \
        --tenant-id=1 \
        --branch-id=1
"""

from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import transaction
from django.utils.text import slugify
from users.models import Tenant, Role
from branches.models import Branch
from accounts.models import Account, AccountCategory
from automations.models import FormSchema, WorkflowTemplate
from pages.models import Module, ModulePage
from dashboards.models import Dashboard, Widget, WidgetDataSource, DashboardTheme
from reports.models import ReportTemplate, ReportCategory, ReportColumn, ReportChart
from decimal import Decimal
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Master production ERP initialization - ONE command to set up everything'

    def add_arguments(self, parser):
        # Option 1: Create new tenant
        parser.add_argument(
            '--organization',
            type=str,
            help='Organization name (creates new tenant)'
        )
        parser.add_argument(
            '--domain-type',
            type=str,
            choices=['microfinance', 'school', 'hospital', 'retail', 'multi'],
            default='school',
            help='Domain type for new tenant'
        )
        parser.add_argument(
            '--admin-email',
            type=str,
            help='Email for system administrator (new tenant only)'
        )
        parser.add_argument(
            '--admin-username',
            type=str,
            help='Username for system administrator (new tenant only)'
        )
        parser.add_argument(
            '--admin-password',
            type=str,
            help='Password for system administrator (new tenant only)'
        )
        
        # Option 2: Use existing tenant
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Use existing tenant ID'
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Use existing branch ID'
        )
        
        # Optional settings
        parser.add_argument(
            '--skip-demo-data',
            action='store_true',
            help='Skip creating demo/sample data'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n' + '='*70))
        self.stdout.write(self.style.SUCCESS('   🚀 PHOENIX ERP - PRODUCTION INITIALIZATION'))
        self.stdout.write(self.style.SUCCESS('='*70 + '\n'))

        try:
            with transaction.atomic():
                # STEP 1: Get or create tenant, branch, and owner
                tenant, branch, owner = self.setup_tenant_and_branch(options)
                
                self.stdout.write(f'\n📋 Configuration:')
                self.stdout.write(f'   • Tenant: {tenant.name} ({tenant.domain_type})')
                self.stdout.write(f'   • Branch: {branch.name} ({branch.code})')
                self.stdout.write(f'   • Owner: {owner.get_full_name()} ({owner.email})')
                self.stdout.write('')
                
                # STEP 2: Create all roles with permissions
                self.stdout.write(self.style.WARNING('\n📊 PHASE 1: Creating Roles & Permissions...'))
                roles = self.create_all_roles(tenant, owner, branch)
                
                # STEP 3: Create complete chart of accounts
                self.stdout.write(self.style.WARNING('\n💰 PHASE 2: Setting up Chart of Accounts...'))
                accounts = self.create_complete_chart_of_accounts(tenant, owner, branch)
                
                # STEP 4: Create modules and pages
                self.stdout.write(self.style.WARNING('\n📄 PHASE 3: Creating Modules & Pages...'))
                modules = self.create_modules_and_pages(tenant, owner, branch)
                
                # STEP 5: Create forms with workflows
                self.stdout.write(self.style.WARNING('\n📝 PHASE 4: Setting up Forms & Workflows...'))
                forms = self.create_forms_and_workflows(tenant, owner, branch)
                
                # STEP 6: Create report templates
                self.stdout.write(self.style.WARNING('\n📊 PHASE 5: Creating Report Templates...'))
                reports = self.create_report_templates(tenant, owner, branch)
                
                # STEP 7: Create role-based dashboards
                self.stdout.write(self.style.WARNING('\n🎨 PHASE 6: Building Role-Based Dashboards...'))
                dashboards = self.create_role_based_dashboards(tenant, owner, branch, roles, accounts)
                
                # STEP 8: Assign default dashboards to roles
                self.assign_dashboards_to_roles(roles, dashboards)
                
                self.stdout.write(self.style.SUCCESS('\n' + '='*70))
                self.stdout.write(self.style.SUCCESS('   ✅ INITIALIZATION COMPLETE!'))
                self.stdout.write(self.style.SUCCESS('='*70 + '\n'))
                
                self.print_summary(tenant, branch, owner, roles, accounts, modules, forms, reports, dashboards)
                self.print_next_steps(tenant, owner, options)

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Initialization failed: {str(e)}\n'))
            import traceback
            self.stdout.write(traceback.format_exc())
            raise

    def setup_tenant_and_branch(self, options):
        """Get or create tenant, branch, and owner"""
        if options.get('tenant_id') and options.get('branch_id'):
            # Use existing tenant
            tenant = Tenant.objects.get(id=options['tenant_id'])
            branch = Branch.objects.get(id=options['branch_id'])
            owner = tenant.owner
            
            if not owner:
                raise ValueError('Tenant must have an owner assigned')
            
            # Ensure owner has tenant and branch set correctly
            if not owner.tenant:
                owner.tenant = tenant
                owner.save(update_fields=['tenant'])
            
            if not owner.branch:
                owner.branch = branch
                owner.save(update_fields=['branch'])
                
            return tenant, branch, owner
        
        elif options.get('organization'):
            # Create new tenant
            self.stdout.write('Creating new tenant...')
            
            # Create tenant
            tenant_name = options['organization']
            tenant_slug = slugify(tenant_name)
            
            tenant = Tenant.objects.create(
                name=tenant_name,
                slug=tenant_slug,
                domain_type=options['domain_type']
            )
            
            # Create branch
            branch = Branch.objects.create(
                name='Headquarters',
                code='HQ',
                is_active=True
            )
            
            # Create owner user
            username = options.get('admin_username', 'admin')
            email = options.get('admin_email', f'admin@{tenant_slug}.com')
            password = options.get('admin_password', 'admin123')
            
            owner = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name='System',
                last_name='Administrator',
                tenant=tenant,
                branch=branch,
                is_superuser=True,
                is_staff=True,
                is_system_admin=True,
                is_active_user=True
            )
            
            tenant.owner = owner
            tenant.save()
            
            return tenant, branch, owner
        
        else:
            raise ValueError('Must provide either --organization (new tenant) or --tenant-id and --branch-id (existing tenant)')

    def create_all_roles(self, tenant, owner, branch):
        """Create all roles based on organizational hierarchy"""
        
        self.stdout.write('   Creating organizational roles...')
        
        # Role definitions based on PDF requirements
        role_definitions = [
            {
                'name': 'CEO/Director',
                'description': 'Chief Executive Officer - Full system access',
                'modules': [],  # Empty = all modules
                'pages': [],    # Empty = all pages
                'dashboards': ['executive_dashboard'],
                'permissions_filter': 'all'
            },
            {
                'name': 'Accountant',
                'description': 'Financial accounting and bookkeeping',
                'modules': ['finance', 'accounts', 'transactions'],
                'pages': [
                    'chart-of-accounts', 'journal-entries', 'ledger',
                    'trial-balance', 'financial-statements', 'reconciliation'
                ],
                'dashboards': ['accountant_dashboard'],
                'permissions_filter': 'finance'
            },
            {
                'name': 'Bursar',
                'description': 'Financial management and cash handling',
                'modules': ['finance', 'accounts', 'payments', 'expenses'],
                'pages': [
                    'fee-collection', 'payment-processing', 'cash-management',
                    'expense-approval', 'budget-management', 'financial-reports'
                ],
                'dashboards': ['bursar_dashboard'],
                'permissions_filter': 'finance'
            },
            {
                'name': 'Auditor',
                'description': 'Internal audit and compliance',
                'modules': ['finance', 'accounts', 'reports', 'audit'],
                'pages': [
                    'audit-trails', 'compliance-reports', 'variance-analysis',
                    'financial-statements', 'account-reconciliation'
                ],
                'dashboards': ['auditor_dashboard'],
                'permissions_filter': 'view_only'
            },
            {
                'name': 'HR Manager',
                'description': 'Human resources management',
                'modules': ['hr', 'staff', 'payroll'],
                'pages': [
                    'staff-management', 'attendance', 'payroll-processing',
                    'leave-management', 'performance-reviews'
                ],
                'dashboards': ['hr_dashboard'],
                'permissions_filter': 'hr'
            },
            {
                'name': 'Procurement Officer',
                'description': 'Purchasing and supplier management',
                'modules': ['procurement', 'inventory', 'suppliers'],
                'pages': [
                    'purchase-requisitions', 'purchase-orders', 'supplier-management',
                    'goods-receipt', 'inventory-management'
                ],
                'dashboards': ['procurement_dashboard'],
                'permissions_filter': 'procurement'
            },
            {
                'name': 'Store Keeper',
                'description': 'Inventory and store management',
                'modules': ['inventory', 'stores'],
                'pages': [
                    'stock-management', 'goods-receipt', 'goods-issue',
                    'stock-count', 'inventory-reports'
                ],
                'dashboards': ['storekeeper_dashboard'],
                'permissions_filter': 'inventory'
            },
            {
                'name': 'Academic Staff',
                'description': 'Teaching and academic administration',
                'modules': ['academics', 'students', 'curriculum'],
                'pages': [
                    'class-management', 'attendance', 'grade-entry',
                    'student-records', 'academic-reports'
                ],
                'dashboards': ['teacher_dashboard'],
                'permissions_filter': 'academics'
            },
            {
                'name': 'Admin Staff',
                'description': 'General administrative support',
                'modules': ['administration', 'documents'],
                'pages': [
                    'student-registration', 'document-management',
                    'communication', 'calendar'
                ],
                'dashboards': ['admin_dashboard'],
                'permissions_filter': 'admin'
            },
            {
                'name': 'Student',
                'description': 'Student portal access',
                'modules': ['student-portal'],
                'pages': [
                    'my-profile', 'my-fees', 'my-grades', 'my-attendance',
                    'payment-history', 'timetable'
                ],
                'dashboards': ['student_dashboard'],
                'permissions_filter': 'student'
            },
            {
                'name': 'Parent/Guardian',
                'description': 'Parent portal access',
                'modules': ['parent-portal'],
                'pages': [
                    'ward-profile', 'ward-fees', 'ward-grades', 'ward-attendance',
                    'make-payment', 'communication'
                ],
                'dashboards': ['parent_dashboard'],
                'permissions_filter': 'parent'
            }
        ]
        
        roles_created = {}
        
        for role_def in role_definitions:
            role, created = Role.objects.get_or_create(
                name=role_def['name'],
                tenant=tenant,
                defaults={
                    'description': role_def['description'],
                    'can_access_modules': role_def['modules'],
                    'can_access_pages': role_def['pages'],
                    'is_active': True
                }
            )
            
            # Assign permissions based on filter
            permissions = self.get_permissions_for_role(role_def['permissions_filter'])
            role.permissions.set(permissions)
            
            roles_created[role_def['name']] = role
            
            status = '✓' if created else '→'
            self.stdout.write(f'   {status} {role_def["name"]}')
        
        self.stdout.write(f'\n   Created {len(roles_created)} roles')
        return roles_created

    def get_permissions_for_role(self, filter_type):
        """Get permissions based on role type"""
        if filter_type == 'all':
            return Permission.objects.all()
        elif filter_type == 'view_only':
            return Permission.objects.filter(codename__startswith='view_')
        elif filter_type == 'finance':
            return Permission.objects.filter(
                content_type__app_label__in=['accounts', 'transactions', 'expenses', 'incomes']
            )
        elif filter_type == 'hr':
            return Permission.objects.filter(
                content_type__app_label__in=['users', 'staff']
            )
        elif filter_type == 'procurement':
            return Permission.objects.filter(
                content_type__app_label__in=['procurement', 'inventory']
            )
        elif filter_type == 'inventory':
            return Permission.objects.filter(
                content_type__app_label='inventory'
            )
        elif filter_type == 'academics':
            return Permission.objects.filter(
                content_type__app_label__in=['students', 'academics']
            )
        elif filter_type == 'admin':
            return Permission.objects.filter(
                content_type__app_label__in=['pages', 'documents']
            )
        elif filter_type == 'student':
            return Permission.objects.filter(
                codename__in=['view_own_profile', 'view_own_fees', 'view_own_grades']
            )
        elif filter_type == 'parent':
            return Permission.objects.filter(
                codename__in=['view_ward_profile', 'view_ward_fees', 'make_payment']
            )
        else:
            return Permission.objects.none()

    def create_complete_chart_of_accounts(self, tenant, owner, branch):
        """Create comprehensive chart of accounts"""
        
        self.stdout.write('   Setting up account structure...')
        
        accounts_created = []
        
        # Account structure based on requirements
        account_structure = {
            'ASSET': [
                {'code': '1000', 'name': 'Current Assets'},
                {'code': '1100', 'name': 'Cash and Bank'},
                {'code': '1110', 'name': 'Petty Cash', 'parent': '1100'},
                {'code': '1120', 'name': 'Bank Account - Operating', 'parent': '1100'},
                {'code': '1130', 'name': 'Bank Account - Payroll', 'parent': '1100'},
                {'code': '1200', 'name': 'Accounts Receivable'},
                {'code': '1210', 'name': 'Student Fees Receivable', 'parent': '1200'},
                {'code': '1220', 'name': 'Other Receivables', 'parent': '1200'},
                {'code': '1300', 'name': 'Inventory'},
                {'code': '1310', 'name': 'Books and Supplies', 'parent': '1300'},
                {'code': '1320', 'name': 'Uniforms', 'parent': '1300'},
                {'code': '1400', 'name': 'Prepaid Expenses'},
                {'code': '1410', 'name': 'Prepaid Rent', 'parent': '1400'},
                {'code': '1420', 'name': 'Prepaid Insurance', 'parent': '1400'},
                {'code': '1500', 'name': 'Fixed Assets'},
                {'code': '1510', 'name': 'Land and Buildings', 'parent': '1500'},
                {'code': '1520', 'name': 'Furniture and Fixtures', 'parent': '1500'},
                {'code': '1530', 'name': 'Equipment', 'parent': '1500'},
                {'code': '1540', 'name': 'Computers and IT Equipment', 'parent': '1500'},
                {'code': '1550', 'name': 'Vehicles', 'parent': '1500'},
                {'code': '1560', 'name': 'Accumulated Depreciation', 'parent': '1500'},
            ],
            'LIABILITY': [
                {'code': '2000', 'name': 'Current Liabilities'},
                {'code': '2100', 'name': 'Accounts Payable'},
                {'code': '2110', 'name': 'Supplier Payables', 'parent': '2100'},
                {'code': '2120', 'name': 'Utility Payables', 'parent': '2100'},
                {'code': '2200', 'name': 'Accrued Expenses'},
                {'code': '2210', 'name': 'Salaries Payable', 'parent': '2200'},
                {'code': '2220', 'name': 'Taxes Payable', 'parent': '2200'},
                {'code': '2300', 'name': 'Student Deposits'},
                {'code': '2310', 'name': 'Security Deposits', 'parent': '2300'},
                {'code': '2320', 'name': 'Advance Fee Payments', 'parent': '2300'},
                {'code': '2400', 'name': 'Long-term Liabilities'},
                {'code': '2410', 'name': 'Bank Loans', 'parent': '2400'},
                {'code': '2420', 'name': 'Mortgages Payable', 'parent': '2400'},
            ],
            'EQUITY': [
                {'code': '3000', 'name': 'Owner\'s Equity'},
                {'code': '3100', 'name': 'Capital'},
                {'code': '3200', 'name': 'Retained Earnings'},
                {'code': '3300', 'name': 'Current Year Earnings'},
            ],
            'INCOME': [
                {'code': '4000', 'name': 'Operating Income'},
                {'code': '4100', 'name': 'Tuition Fees'},
                {'code': '4110', 'name': 'Primary School Tuition', 'parent': '4100'},
                {'code': '4120', 'name': 'Secondary School Tuition', 'parent': '4100'},
                {'code': '4130', 'name': 'Boarding Fees', 'parent': '4100'},
                {'code': '4200', 'name': 'Other Fees'},
                {'code': '4210', 'name': 'Registration Fees', 'parent': '4200'},
                {'code': '4220', 'name': 'Examination Fees', 'parent': '4200'},
                {'code': '4230', 'name': 'Sports Fees', 'parent': '4200'},
                {'code': '4240', 'name': 'IT/Computer Fees', 'parent': '4200'},
                {'code': '4250', 'name': 'Library Fees', 'parent': '4200'},
                {'code': '4300', 'name': 'Sales Income'},
                {'code': '4310', 'name': 'Uniform Sales', 'parent': '4300'},
                {'code': '4320', 'name': 'Book Sales', 'parent': '4300'},
                {'code': '4330', 'name': 'Cafeteria Sales', 'parent': '4300'},
                {'code': '4400', 'name': 'Other Income'},
                {'code': '4410', 'name': 'Donations', 'parent': '4400'},
                {'code': '4420', 'name': 'Grants', 'parent': '4400'},
                {'code': '4430', 'name': 'Interest Income', 'parent': '4400'},
                {'code': '4440', 'name': 'Rental Income', 'parent': '4400'},
            ],
            'EXPENSE': [
                {'code': '5000', 'name': 'Operating Expenses'},
                {'code': '5100', 'name': 'Staff Costs'},
                {'code': '5110', 'name': 'Teaching Staff Salaries', 'parent': '5100'},
                {'code': '5120', 'name': 'Non-Teaching Staff Salaries', 'parent': '5100'},
                {'code': '5130', 'name': 'Staff Benefits', 'parent': '5100'},
                {'code': '5140', 'name': 'Staff Training', 'parent': '5100'},
                {'code': '5200', 'name': 'Administrative Expenses'},
                {'code': '5210', 'name': 'Office Supplies', 'parent': '5200'},
                {'code': '5220', 'name': 'Printing and Stationery', 'parent': '5200'},
                {'code': '5230', 'name': 'Postage and Courier', 'parent': '5200'},
                {'code': '5300', 'name': 'Utilities'},
                {'code': '5310', 'name': 'Electricity', 'parent': '5300'},
                {'code': '5320', 'name': 'Water', 'parent': '5300'},
                {'code': '5330', 'name': 'Internet and Telephone', 'parent': '5300'},
                {'code': '5400', 'name': 'Maintenance'},
                {'code': '5410', 'name': 'Building Maintenance', 'parent': '5400'},
                {'code': '5420', 'name': 'Equipment Repairs', 'parent': '5400'},
                {'code': '5430', 'name': 'Ground Maintenance', 'parent': '5400'},
                {'code': '5500', 'name': 'Academic Expenses'},
                {'code': '5510', 'name': 'Teaching Materials', 'parent': '5500'},
                {'code': '5520', 'name': 'Textbooks', 'parent': '5500'},
                {'code': '5530', 'name': 'Laboratory Supplies', 'parent': '5500'},
                {'code': '5540', 'name': 'Sports Equipment', 'parent': '5500'},
                {'code': '5600', 'name': 'Transportation'},
                {'code': '5610', 'name': 'Vehicle Fuel', 'parent': '5600'},
                {'code': '5620', 'name': 'Vehicle Maintenance', 'parent': '5600'},
                {'code': '5630', 'name': 'Bus Operations', 'parent': '5600'},
                {'code': '5700', 'name': 'Marketing and Publicity'},
                {'code': '5710', 'name': 'Advertising', 'parent': '5700'},
                {'code': '5720', 'name': 'Events and Open Days', 'parent': '5700'},
                {'code': '5800', 'name': 'Insurance'},
                {'code': '5810', 'name': 'Building Insurance', 'parent': '5800'},
                {'code': '5820', 'name': 'Vehicle Insurance', 'parent': '5800'},
                {'code': '5830', 'name': 'Liability Insurance', 'parent': '5800'},
                {'code': '5900', 'name': 'Other Expenses'},
                {'code': '5910', 'name': 'Bank Charges', 'parent': '5900'},
                {'code': '5920', 'name': 'Legal and Professional Fees', 'parent': '5900'},
                {'code': '5930', 'name': 'Licenses and Permits', 'parent': '5900'},
                {'code': '5940', 'name': 'Depreciation Expense', 'parent': '5900'},
            ],
        }
        
        # Create accounts
        account_objects = {}
        for account_type, accounts in account_structure.items():
            for acc_def in accounts:
                parent_account = None
                if 'parent' in acc_def:
                    parent_account = account_objects.get(acc_def['parent'])
                
                # Determine account level - parent accounts have no parent
                account_level = 'PARENT' if parent_account is None else 'CHILD'
                
                account, created = Account.objects.get_or_create(
                    code=acc_def['code'],
                    owner=owner,
                    branch=branch,
                    defaults={
                        'name': acc_def['name'],
                        'account_type': account_type,
                        'account_level': account_level,
                        'parent': parent_account,
                        'balance': Decimal('0.00')
                    }
                )
                
                account_objects[acc_def['code']] = account
                accounts_created.append(account)
        
        self.stdout.write(f'   Created {len(accounts_created)} accounts')
        return accounts_created

    def create_modules_and_pages(self, tenant, owner, branch):
        """Create modules and pages for navigation"""
        
        self.stdout.write('   Creating navigation modules...')
        
        modules_created = []
        
        # Module definitions
        module_definitions = [
            {
                'code': 'dashboard',
                'name': 'Dashboard',
                'description': 'Home and overview',
                'icon': 'layout-dashboard',
                'color': '#1a73e8',
                'order': 0,
                'pages': []
            },
            {
                'code': 'finance',
                'name': 'Finance',
                'description': 'Financial management',
                'icon': 'dollar-sign',
                'color': '#34a853',
                'order': 1,
                'pages': [
                    {'code': 'chart-of-accounts', 'title': 'Chart of Accounts', 'url_path': '/finance/chart-of-accounts'},
                    {'code': 'journal-entries', 'title': 'Journal Entries', 'url_path': '/finance/journal-entries'},
                    {'code': 'ledger', 'title': 'General Ledger', 'url_path': '/finance/ledger'},
                    {'code': 'trial-balance', 'title': 'Trial Balance', 'url_path': '/finance/trial-balance'},
                    {'code': 'financial-statements', 'title': 'Financial Statements', 'url_path': '/finance/statements'},
                ]
            },
            {
                'code': 'accounts',
                'name': 'Accounts',
                'description': 'Receivables and payables',
                'icon': 'file-text',
                'color': '#fbbc04',
                'order': 2,
                'pages': [
                    {'code': 'accounts-receivable', 'title': 'Accounts Receivable', 'url_path': '/accounts/receivable'},
                    {'code': 'accounts-payable', 'title': 'Accounts Payable', 'url_path': '/accounts/payable'},
                    {'code': 'fee-collection', 'title': 'Fee Collection', 'url_path': '/accounts/fees'},
                    {'code': 'payment-processing', 'title': 'Payment Processing', 'url_path': '/accounts/payments'},
                ]
            },
            {
                'code': 'expenses',
                'name': 'Expenses',
                'description': 'Expense management',
                'icon': 'trending-down',
                'color': '#ea4335',
                'order': 3,
                'pages': [
                    {'code': 'expense-entry', 'title': 'Record Expense', 'url_path': '/expenses/entry'},
                    {'code': 'expense-approval', 'title': 'Approve Expenses', 'url_path': '/expenses/approval'},
                    {'code': 'expense-reports', 'title': 'Expense Reports', 'url_path': '/expenses/reports'},
                ]
            },
            {
                'code': 'procurement',
                'name': 'Procurement',
                'description': 'Purchasing and suppliers',
                'icon': 'shopping-cart',
                'color': '#9c27b0',
                'order': 4,
                'pages': [
                    {'code': 'purchase-requisitions', 'title': 'Purchase Requisitions', 'url_path': '/procurement/requisitions'},
                    {'code': 'purchase-orders', 'title': 'Purchase Orders', 'url_path': '/procurement/orders'},
                    {'code': 'supplier-management', 'title': 'Suppliers', 'url_path': '/procurement/suppliers'},
                    {'code': 'goods-receipt', 'title': 'Goods Receipt', 'url_path': '/procurement/receipt'},
                ]
            },
            {
                'code': 'inventory',
                'name': 'Inventory',
                'description': 'Stock and stores',
                'icon': 'package',
                'color': '#ff9800',
                'order': 5,
                'pages': [
                    {'code': 'stock-management', 'title': 'Stock Management', 'url_path': '/inventory/stock'},
                    {'code': 'goods-issue', 'title': 'Goods Issue', 'url_path': '/inventory/issue'},
                    {'code': 'stock-count', 'title': 'Stock Count', 'url_path': '/inventory/count'},
                    {'code': 'inventory-reports', 'title': 'Inventory Reports', 'url_path': '/inventory/reports'},
                ]
            },
            {
                'code': 'hr',
                'name': 'Human Resources',
                'description': 'Staff management',
                'icon': 'users',
                'color': '#00bcd4',
                'order': 6,
                'pages': [
                    {'code': 'staff-management', 'title': 'Staff Management', 'url_path': '/hr/staff'},
                    {'code': 'attendance', 'title': 'Attendance', 'url_path': '/hr/attendance'},
                    {'code': 'payroll', 'title': 'Payroll', 'url_path': '/hr/payroll'},
                    {'code': 'leave-management', 'title': 'Leave Management', 'url_path': '/hr/leave'},
                ]
            },
            {
                'code': 'academics',
                'name': 'Academics',
                'description': 'Academic management',
                'icon': 'book-open',
                'color': '#4caf50',
                'order': 7,
                'pages': [
                    {'code': 'class-management', 'title': 'Class Management', 'url_path': '/academics/classes'},
                    {'code': 'student-attendance', 'title': 'Student Attendance', 'url_path': '/academics/attendance'},
                    {'code': 'grade-entry', 'title': 'Grade Entry', 'url_path': '/academics/grades'},
                    {'code': 'academic-reports', 'title': 'Academic Reports', 'url_path': '/academics/reports'},
                ]
            },
            {
                'code': 'students',
                'name': 'Students',
                'description': 'Student records',
                'icon': 'user',
                'color': '#2196f3',
                'order': 8,
                'pages': [
                    {'code': 'student-registration', 'title': 'Student Registration', 'url_path': '/students/registration'},
                    {'code': 'student-records', 'title': 'Student Records', 'url_path': '/students/records'},
                    {'code': 'student-fees', 'title': 'Student Fees', 'url_path': '/students/fees'},
                ]
            },
            {
                'code': 'reports',
                'name': 'Reports',
                'description': 'Reports and analytics',
                'icon': 'bar-chart',
                'color': '#673ab7',
                'order': 9,
                'pages': [
                    {'code': 'financial-reports', 'title': 'Financial Reports', 'url_path': '/reports/financial'},
                    {'code': 'management-reports', 'title': 'Management Reports', 'url_path': '/reports/management'},
                    {'code': 'custom-reports', 'title': 'Custom Reports', 'url_path': '/reports/custom'},
                ]
            },
        ]
        
        for mod_def in module_definitions:
            module, created = Module.objects.get_or_create(
                code=mod_def['code'],
                owner=owner,
                branch=branch,
                defaults={
                    'name': mod_def['name'],
                    'description': mod_def['description'],
                    'icon': mod_def['icon'],
                    'color': mod_def['color'],
                    'order': mod_def['order'],
                    'is_active': True
                }
            )
            
            # Create pages for module
            for page_def in mod_def.get('pages', []):
                ModulePage.objects.get_or_create(
                    code=page_def['code'],
                    module=module,
                    owner=owner,
                    branch=branch,
                    defaults={
                        'title': page_def['title'],
                        'url_path': page_def['url_path'],
                        'page_type': 'page',
                        'is_active': True
                    }
                )
            
            modules_created.append(module)
        
        self.stdout.write(f'   Created {len(modules_created)} modules')
        return modules_created

    def create_forms_and_workflows(self, tenant, owner, branch):
        """Create forms with approval workflows"""
        
        self.stdout.write('   Creating forms and workflows...')
        
        forms_created = []
        
        # 1. Fee Payment Form
        fee_payment_form = self.create_fee_payment_form(tenant, owner, branch)
        forms_created.append(fee_payment_form)
        
        # 2. Expense Request Form
        expense_form = self.create_expense_request_form(tenant, owner, branch)
        forms_created.append(expense_form)
        
        # 3. Purchase Requisition Form
        pr_form = self.create_purchase_requisition_form(tenant, owner, branch)
        forms_created.append(pr_form)
        
        # 4. Leave Request Form
        leave_form = self.create_leave_request_form(tenant, owner, branch)
        forms_created.append(leave_form)
        
        # 5. Student Registration Form
        student_form = self.create_student_registration_form(tenant, owner, branch)
        forms_created.append(student_form)
        
        # 6. Cash Advance Form
        advance_form = self.create_cash_advance_form(tenant, owner, branch)
        forms_created.append(advance_form)
        
        # 7. Payment Voucher Form
        voucher_form = self.create_payment_voucher_form(tenant, owner, branch)
        forms_created.append(voucher_form)
        
        # Create workflows for each form
        self.stdout.write('   Creating approval workflows...')
        
        # Fee Payment Workflow
        self.create_fee_payment_workflow(tenant, owner, branch, fee_payment_form)
        
        # Expense Approval Workflow
        self.create_expense_approval_workflow(tenant, owner, branch, expense_form)
        
        # PR Approval Workflow
        self.create_pr_approval_workflow(tenant, owner, branch, pr_form)
        
        # Leave Approval Workflow
        self.create_leave_approval_workflow(tenant, owner, branch, leave_form)
        
        # Cash Advance Workflow
        self.create_cash_advance_workflow(tenant, owner, branch, advance_form)
        
        # Payment Voucher Workflow
        self.create_payment_voucher_workflow(tenant, owner, branch, voucher_form)
        
        self.stdout.write(f'   Created {len(forms_created)} forms with workflows')
        return forms_created

    def create_fee_payment_form(self, tenant, owner, branch):
        """Fee payment/collection form"""
        schema = {
            "fields": [
                {
                    "id": "student_id",
                    "label": "Student ID",
                    "type": "text",
                    "validation": {"required": True},
                    "placeholder": "Enter student ID"
                },
                {
                    "id": "student_name",
                    "label": "Student Name",
                    "type": "text",
                    "validation": {"required": True},
                    "placeholder": "Student full name"
                },
                {
                    "id": "class_name",
                    "label": "Class",
                    "type": "select",
                    "options": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
                               "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"],
                    "validation": {"required": True}
                },
                {
                    "id": "fee_type",
                    "label": "Fee Type",
                    "type": "select",
                    "options": ["Tuition", "Registration", "Examination", "Sports", "IT/Computer", "Library", "Uniform", "Books"],
                    "validation": {"required": True}
                },
                {
                    "id": "amount",
                    "label": "Amount",
                    "type": "money",
                    "validation": {"required": True, "min": 0},
                    "placeholder": "0.00"
                },
                {
                    "id": "payment_method",
                    "label": "Payment Method",
                    "type": "select",
                    "options": ["Cash", "Bank Transfer", "Cheque", "POS", "Mobile Money"],
                    "validation": {"required": True}
                },
                {
                    "id": "reference",
                    "label": "Payment Reference",
                    "type": "text",
                    "placeholder": "Transaction reference"
                },
                {
                    "id": "term",
                    "label": "Term/Session",
                    "type": "select",
                    "options": ["First Term 2024/2025", "Second Term 2024/2025", "Third Term 2024/2025"],
                    "validation": {"required": True}
                },
                {
                    "id": "notes",
                    "label": "Notes",
                    "type": "textarea",
                    "placeholder": "Additional information"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Fee Payment",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Student fee payment collection form",
                "schema": schema,
                "trigger_event_name": "fee-payment-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Fee Payment Form')
        return form

    def create_expense_request_form(self, tenant, owner, branch):
        """Expense request/claim form"""
        schema = {
            "fields": [
                {
                    "id": "expense_type",
                    "label": "Expense Category",
                    "type": "select",
                    "options": ["Utilities", "Maintenance", "Office Supplies", "Transportation", 
                               "Staff Welfare", "Academic Materials", "Marketing", "Professional Fees"],
                    "validation": {"required": True}
                },
                {
                    "id": "description",
                    "label": "Description",
                    "type": "textarea",
                    "validation": {"required": True},
                    "placeholder": "Detailed description of expense"
                },
                {
                    "id": "amount",
                    "label": "Amount Requested",
                    "type": "money",
                    "validation": {"required": True, "min": 0},
                    "placeholder": "0.00"
                },
                {
                    "id": "vendor",
                    "label": "Vendor/Supplier",
                    "type": "text",
                    "placeholder": "Name of vendor"
                },
                {
                    "id": "due_date",
                    "label": "Due Date",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "department",
                    "label": "Department",
                    "type": "select",
                    "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"],
                    "validation": {"required": True}
                },
                {
                    "id": "budget_code",
                    "label": "Budget Code",
                    "type": "text",
                    "placeholder": "Budget line item code"
                },
                {
                    "id": "attachments",
                    "label": "Supporting Documents",
                    "type": "file",
                    "validation": {"maxFiles": 5}
                },
                {
                    "id": "justification",
                    "label": "Justification",
                    "type": "textarea",
                    "validation": {"required": True},
                    "placeholder": "Why is this expense necessary?"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Expense Request",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Request for expense approval and payment",
                "schema": schema,
                "trigger_event_name": "expense-request-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Expense Request Form')
        return form

    def create_purchase_requisition_form(self, tenant, owner, branch):
        """Purchase requisition form"""
        schema = {
            "fields": [
                {
                    "id": "pr_number",
                    "label": "PR Number",
                    "type": "text",
                    "validation": {"required": False},
                    "readonly": True,
                    "placeholder": "Auto-generated"
                },
                {
                    "id": "requested_by",
                    "label": "Requested By",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "department",
                    "label": "Department",
                    "type": "select",
                    "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR", "Library"],
                    "validation": {"required": True}
                },
                {
                    "id": "items",
                    "label": "Items",
                    "type": "table",
                    "validation": {"required": True, "minRows": 1},
                    "columns": [
                        {"id": "item_name", "label": "Item Description", "type": "text"},
                        {"id": "quantity", "label": "Quantity", "type": "number"},
                        {"id": "unit", "label": "Unit", "type": "text"},
                        {"id": "estimated_price", "label": "Est. Price", "type": "money"},
                        {"id": "total", "label": "Total", "type": "money", "calculated": "quantity * estimated_price"}
                    ]
                },
                {
                    "id": "total_amount",
                    "label": "Total Amount",
                    "type": "money",
                    "validation": {"required": True},
                    "readonly": True,
                    "calculated": "SUM(items.total)"
                },
                {
                    "id": "urgency",
                    "label": "Urgency Level",
                    "type": "select",
                    "options": ["Normal", "Urgent", "Critical"],
                    "validation": {"required": True},
                    "default": "Normal"
                },
                {
                    "id": "required_date",
                    "label": "Date Required",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "purpose",
                    "label": "Purpose/Justification",
                    "type": "textarea",
                    "validation": {"required": True},
                    "placeholder": "Why are these items needed?"
                },
                {
                    "id": "suggested_suppliers",
                    "label": "Suggested Suppliers",
                    "type": "textarea",
                    "placeholder": "Optional: Suggest vendors"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Purchase Requisition",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Request for purchase of goods/services",
                "schema": schema,
                "trigger_event_name": "purchase-requisition-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Purchase Requisition Form')
        return form

    def create_leave_request_form(self, tenant, owner, branch):
        """Staff leave request form"""
        schema = {
            "fields": [
                {
                    "id": "staff_name",
                    "label": "Staff Name",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "staff_id",
                    "label": "Staff ID",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "department",
                    "label": "Department",
                    "type": "select",
                    "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"],
                    "validation": {"required": True}
                },
                {
                    "id": "leave_type",
                    "label": "Leave Type",
                    "type": "select",
                    "options": ["Annual Leave", "Sick Leave", "Casual Leave", "Maternity Leave", "Paternity Leave", "Study Leave"],
                    "validation": {"required": True}
                },
                {
                    "id": "start_date",
                    "label": "Start Date",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "end_date",
                    "label": "End Date",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "days_requested",
                    "label": "Number of Days",
                    "type": "number",
                    "validation": {"required": True, "min": 1},
                    "readonly": True,
                    "calculated": "DAYS_BETWEEN(start_date, end_date)"
                },
                {
                    "id": "reason",
                    "label": "Reason for Leave",
                    "type": "textarea",
                    "validation": {"required": True},
                    "placeholder": "Please provide details"
                },
                {
                    "id": "relief_officer",
                    "label": "Relief Officer",
                    "type": "text",
                    "placeholder": "Who will cover your duties?"
                },
                {
                    "id": "contact_during_leave",
                    "label": "Contact Number",
                    "type": "text",
                    "placeholder": "Phone number during leave"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Leave Request",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Staff leave application form",
                "schema": schema,
                "trigger_event_name": "leave-request-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Leave Request Form')
        return form

    def create_student_registration_form(self, tenant, owner, branch):
        """Student registration form"""
        schema = {
            "fields": [
                {
                    "id": "student_name",
                    "label": "Full Name",
                    "type": "text",
                    "validation": {"required": True},
                    "placeholder": "Last Name, First Name, Middle Name"
                },
                {
                    "id": "date_of_birth",
                    "label": "Date of Birth",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "gender",
                    "label": "Gender",
                    "type": "select",
                    "options": ["Male", "Female"],
                    "validation": {"required": True}
                },
                {
                    "id": "class_applying",
                    "label": "Class Applying For",
                    "type": "select",
                    "options": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
                               "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"],
                    "validation": {"required": True}
                },
                {
                    "id": "previous_school",
                    "label": "Previous School",
                    "type": "text",
                    "placeholder": "Name of last school attended"
                },
                {
                    "id": "parent_name",
                    "label": "Parent/Guardian Name",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "parent_phone",
                    "label": "Parent Phone",
                    "type": "text",
                    "validation": {"required": True},
                    "placeholder": "Primary contact number"
                },
                {
                    "id": "parent_email",
                    "label": "Parent Email",
                    "type": "email",
                    "placeholder": "Email address"
                },
                {
                    "id": "address",
                    "label": "Home Address",
                    "type": "textarea",
                    "validation": {"required": True}
                },
                {
                    "id": "emergency_contact",
                    "label": "Emergency Contact",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "emergency_phone",
                    "label": "Emergency Phone",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "medical_conditions",
                    "label": "Medical Conditions",
                    "type": "textarea",
                    "placeholder": "Any allergies or medical conditions we should know"
                },
                {
                    "id": "boarding",
                    "label": "Boarding Required?",
                    "type": "select",
                    "options": ["No (Day Student)", "Yes (Full Boarding)", "Yes (Weekly Boarding)"],
                    "default": "No (Day Student)"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Student Registration",
            owner=owner,
            branch=branch,
            defaults={
                "description": "New student admission form",
                "schema": schema,
                "trigger_event_name": "student-registration-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Student Registration Form')
        return form

    def create_cash_advance_form(self, tenant, owner, branch):
        """Cash advance request form"""
        schema = {
            "fields": [
                {
                    "id": "staff_name",
                    "label": "Staff Name",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "department",
                    "label": "Department",
                    "type": "select",
                    "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"],
                    "validation": {"required": True}
                },
                {
                    "id": "amount_requested",
                    "label": "Amount Requested",
                    "type": "money",
                    "validation": {"required": True, "min": 0}
                },
                {
                    "id": "purpose",
                    "label": "Purpose",
                    "type": "textarea",
                    "validation": {"required": True},
                    "placeholder": "What will the advance be used for?"
                },
                {
                    "id": "expected_date",
                    "label": "Date Required",
                    "type": "date",
                    "validation": {"required": True}
                },
                {
                    "id": "repayment_period",
                    "label": "Repayment Period (Months)",
                    "type": "number",
                    "validation": {"required": True, "min": 1, "max": 12}
                },
                {
                    "id": "retirement_date",
                    "label": "Expected Retirement Date",
                    "type": "date",
                    "validation": {"required": True},
                    "help": "When will you submit expense receipts?"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Cash Advance Request",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Staff cash advance request",
                "schema": schema,
                "trigger_event_name": "cash-advance-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Cash Advance Form')
        return form

    def create_payment_voucher_form(self, tenant, owner, branch):
        """Payment voucher form"""
        schema = {
            "fields": [
                {
                    "id": "voucher_number",
                    "label": "Voucher Number",
                    "type": "text",
                    "readonly": True,
                    "placeholder": "Auto-generated"
                },
                {
                    "id": "payee_name",
                    "label": "Payee Name",
                    "type": "text",
                    "validation": {"required": True}
                },
                {
                    "id": "payment_type",
                    "label": "Payment Type",
                    "type": "select",
                    "options": ["Supplier Payment", "Staff Salary", "Utility Bill", "Rent", "Professional Fees", "Other"],
                    "validation": {"required": True}
                },
                {
                    "id": "amount",
                    "label": "Amount",
                    "type": "money",
                    "validation": {"required": True, "min": 0}
                },
                {
                    "id": "payment_method",
                    "label": "Payment Method",
                    "type": "select",
                    "options": ["Cash", "Cheque", "Bank Transfer", "Mobile Money"],
                    "validation": {"required": True}
                },
                {
                    "id": "bank_details",
                    "label": "Bank Details",
                    "type": "textarea",
                    "placeholder": "Bank name, account number, account name"
                },
                {
                    "id": "description",
                    "label": "Payment Description",
                    "type": "textarea",
                    "validation": {"required": True}
                },
                {
                    "id": "invoice_number",
                    "label": "Invoice/Reference Number",
                    "type": "text"
                },
                {
                    "id": "account_code",
                    "label": "Account Code",
                    "type": "text",
                    "placeholder": "GL account code"
                }
            ]
        }
        
        form, created = FormSchema.objects.get_or_create(
            name="Payment Voucher",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Payment authorization voucher",
                "schema": schema,
                "trigger_event_name": "payment-voucher-submitted",
                "is_active": True
            }
        )
        
        status = '✓' if created else '→'
        self.stdout.write(f'   {status} Payment Voucher Form')
        return form

    def create_fee_payment_workflow(self, tenant, owner, branch, form):
        """Workflow for fee payment processing"""
        workflow_def = {
            "steps": [
                {
                    "id": "validate_student",
                    "type": "query",
                    "name": "Validate Student",
                    "config": {
                        "query": "SELECT id, name, class, outstanding_fees FROM students WHERE student_id = {{student_id}}",
                        "store_result_as": "student_info"
                    }
                },
                {
                    "id": "record_payment",
                    "type": "transaction",
                    "name": "Record Fee Payment",
                    "config": {
                        "entries": [
                            {
                                "account": "1120",  # Bank Account
                                "debit": "{{amount}}",
                                "credit": 0,
                                "description": "Fee payment from {{student_name}}"
                            },
                            {
                                "account": "1210",  # Student Fees Receivable
                                "debit": 0,
                                "credit": "{{amount}}",
                                "description": "Fee payment by {{student_name}}"
                            }
                        ]
                    }
                },
                {
                    "id": "generate_receipt",
                    "type": "calculation",
                    "name": "Generate Receipt",
                    "config": {
                        "formula": "CONCAT('RCP/', YEAR(NOW()), '/', LPAD({{receipt_counter}}, 5, '0'))",
                        "store_as": "receipt_number"
                    }
                },
                {
                    "id": "send_notification",
                    "type": "notification",
                    "name": "Send Receipt to Parent",
                    "config": {
                        "channel": "email",
                        "template": "fee_receipt",
                        "recipients": ["{{parent_email}}"],
                        "data": {
                            "student_name": "{{student_name}}",
                            "amount": "{{amount}}",
                            "receipt_number": "{{receipt_number}}",
                            "payment_date": "{{NOW()}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Fee Payment Processing",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Automated fee payment recording and receipt generation",
                "trigger_type": "event",
                "trigger_config": {"event_name": "fee-payment-submitted"},
                "workflow_definition": workflow_def
            }
        )
        
        return workflow

    def create_expense_approval_workflow(self, tenant, owner, branch, form):
        """Workflow for expense approval"""
        workflow_def = {
            "steps": [
                {
                    "id": "department_approval",
                    "type": "approval",
                    "name": "Department Head Approval",
                    "config": {
                        "approver_role": "Department Head",
                        "approval_message": "Please review expense request for {{amount}}",
                        "timeout_hours": 48
                    }
                },
                {
                    "id": "check_amount",
                    "type": "condition",
                    "name": "Check if Amount > 50,000",
                    "config": {
                        "condition": "{{amount}} > 50000",
                        "true_step": "ceo_approval",
                        "false_step": "bursar_approval"
                    }
                },
                {
                    "id": "ceo_approval",
                    "type": "approval",
                    "name": "CEO Approval (High Value)",
                    "config": {
                        "approver_role": "CEO/Director",
                        "approval_message": "High value expense requiring CEO approval: {{amount}}",
                        "timeout_hours": 72
                    }
                },
                {
                    "id": "bursar_approval",
                    "type": "approval",
                    "name": "Bursar Approval",
                    "config": {
                        "approver_role": "Bursar",
                        "approval_message": "Expense approved by department. Please process payment of {{amount}}",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "create_payable",
                    "type": "transaction",
                    "name": "Create Accounts Payable",
                    "config": {
                        "entries": [
                            {
                                "account": "{{expense_account}}",
                                "debit": "{{amount}}",
                                "credit": 0,
                                "description": "{{description}}"
                            },
                            {
                                "account": "2110",  # Supplier Payables
                                "debit": 0,
                                "credit": "{{amount}}",
                                "description": "Payable to {{vendor}}"
                            }
                        ]
                    }
                },
                {
                    "id": "notify_requester",
                    "type": "notification",
                    "name": "Notify Requester",
                    "config": {
                        "channel": "email",
                        "template": "expense_approved",
                        "recipients": ["{{requester_email}}"],
                        "data": {
                            "amount": "{{amount}}",
                            "vendor": "{{vendor}}",
                            "expected_payment_date": "{{due_date}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Expense Approval Workflow",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Multi-level expense approval based on amount",
                "trigger_type": "event",
                "trigger_config": {"event_name": "expense-request-submitted"},
                "workflow_definition": workflow_def,
                "requires_approval": True
            }
        )
        
        return workflow

    def create_pr_approval_workflow(self, tenant, owner, branch, form):
        """Workflow for purchase requisition approval"""
        workflow_def = {
            "steps": [
                {
                    "id": "department_review",
                    "type": "approval",
                    "name": "Department Head Review",
                    "config": {
                        "approver_role": "Department Head",
                        "approval_message": "Review purchase requisition for {{total_amount}}",
                        "timeout_hours": 48
                    }
                },
                {
                    "id": "check_urgency",
                    "type": "condition",
                    "name": "Check Urgency Level",
                    "config": {
                        "condition": "{{urgency}} == 'Critical'",
                        "true_step": "fast_track",
                        "false_step": "procurement_review"
                    }
                },
                {
                    "id": "fast_track",
                    "type": "approval",
                    "name": "CEO Fast Track Approval",
                    "config": {
                        "approver_role": "CEO/Director",
                        "approval_message": "URGENT: Critical purchase requisition requires immediate approval",
                        "timeout_hours": 12
                    }
                },
                {
                    "id": "procurement_review",
                    "type": "approval",
                    "name": "Procurement Officer Review",
                    "config": {
                        "approver_role": "Procurement Officer",
                        "approval_message": "Review and process purchase requisition",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "check_budget",
                    "type": "query",
                    "name": "Check Budget Availability",
                    "config": {
                        "query": "SELECT budget_balance FROM budgets WHERE code = {{budget_code}}",
                        "store_result_as": "budget_info"
                    }
                },
                {
                    "id": "final_approval",
                    "type": "approval",
                    "name": "Bursar Final Approval",
                    "config": {
                        "approver_role": "Bursar",
                        "approval_message": "Final approval for PR {{pr_number}}: {{total_amount}}",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "create_po",
                    "type": "update",
                    "name": "Generate Purchase Order",
                    "config": {
                        "target": "purchase_orders",
                        "action": "create",
                        "data": {
                            "pr_number": "{{pr_number}}",
                            "items": "{{items}}",
                            "total_amount": "{{total_amount}}",
                            "status": "Approved"
                        }
                    }
                },
                {
                    "id": "notify_all",
                    "type": "notification",
                    "name": "Notify Stakeholders",
                    "config": {
                        "channel": "email",
                        "template": "pr_approved",
                        "recipients": ["{{requester_email}}", "procurement@school.com"],
                        "data": {
                            "pr_number": "{{pr_number}}",
                            "total_amount": "{{total_amount}}",
                            "po_number": "{{po_number}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Purchase Requisition Approval",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Multi-stage PR approval with budget checks",
                "trigger_type": "event",
                "trigger_config": {"event_name": "purchase-requisition-submitted"},
                "workflow_definition": workflow_def,
                "requires_approval": True
            }
        )
        
        return workflow

    def create_leave_approval_workflow(self, tenant, owner, branch, form):
        """Workflow for leave request approval"""
        workflow_def = {
            "steps": [
                {
                    "id": "check_leave_balance",
                    "type": "query",
                    "name": "Check Leave Balance",
                    "config": {
                        "query": "SELECT leave_balance, leave_type FROM staff_leave WHERE staff_id = {{staff_id}} AND leave_type = {{leave_type}}",
                        "store_result_as": "leave_info"
                    }
                },
                {
                    "id": "supervisor_approval",
                    "type": "approval",
                    "name": "Supervisor Approval",
                    "config": {
                        "approver_role": "Supervisor",
                        "approval_message": "Leave request from {{staff_name}} for {{days_requested}} days",
                        "timeout_hours": 48
                    }
                },
                {
                    "id": "hr_approval",
                    "type": "approval",
                    "name": "HR Manager Approval",
                    "config": {
                        "approver_role": "HR Manager",
                        "approval_message": "Verify leave eligibility and approve",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "update_leave_balance",
                    "type": "update",
                    "name": "Update Leave Balance",
                    "config": {
                        "target": "staff_leave",
                        "action": "update",
                        "where": {"staff_id": "{{staff_id}}"},
                        "data": {
                            "leave_balance": "{{leave_info.leave_balance}} - {{days_requested}}",
                            "last_leave_date": "{{end_date}}"
                        }
                    }
                },
                {
                    "id": "notify_staff",
                    "type": "notification",
                    "name": "Notify Staff Member",
                    "config": {
                        "channel": "email",
                        "template": "leave_approved",
                        "recipients": ["{{staff_email}}"],
                        "data": {
                            "staff_name": "{{staff_name}}",
                            "leave_type": "{{leave_type}}",
                            "start_date": "{{start_date}}",
                            "end_date": "{{end_date}}",
                            "days_approved": "{{days_requested}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Leave Request Approval",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Leave approval with balance checking",
                "trigger_type": "event",
                "trigger_config": {"event_name": "leave-request-submitted"},
                "workflow_definition": workflow_def,
                "requires_approval": True
            }
        )
        
        return workflow

    def create_cash_advance_workflow(self, tenant, owner, branch, form):
        """Workflow for cash advance approval"""
        workflow_def = {
            "steps": [
                {
                    "id": "check_eligibility",
                    "type": "query",
                    "name": "Check Staff Eligibility",
                    "config": {
                        "query": "SELECT outstanding_advances, months_employed FROM staff WHERE staff_id = {{staff_id}}",
                        "store_result_as": "staff_info"
                    }
                },
                {
                    "id": "supervisor_approval",
                    "type": "approval",
                    "name": "Supervisor Approval",
                    "config": {
                        "approver_role": "Supervisor",
                        "approval_message": "Cash advance request: {{amount_requested}}",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "hr_verification",
                    "type": "approval",
                    "name": "HR Verification",
                    "config": {
                        "approver_role": "HR Manager",
                        "approval_message": "Verify staff eligibility for advance",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "bursar_approval",
                    "type": "approval",
                    "name": "Bursar Approval",
                    "config": {
                        "approver_role": "Bursar",
                        "approval_message": "Approve cash advance payment",
                        "timeout_hours": 48
                    }
                },
                {
                    "id": "disburse_advance",
                    "type": "transaction",
                    "name": "Disburse Cash Advance",
                    "config": {
                        "entries": [
                            {
                                "account": "1220",  # Other Receivables (Staff Advance)
                                "debit": "{{amount_requested}}",
                                "credit": 0,
                                "description": "Cash advance to {{staff_name}}"
                            },
                            {
                                "account": "1120",  # Bank Account
                                "debit": 0,
                                "credit": "{{amount_requested}}",
                                "description": "Cash advance payment"
                            }
                        ]
                    }
                },
                {
                    "id": "notify_staff",
                    "type": "notification",
                    "name": "Notify Staff",
                    "config": {
                        "channel": "email",
                        "template": "advance_approved",
                        "recipients": ["{{staff_email}}"],
                        "data": {
                            "amount": "{{amount_requested}}",
                            "retirement_date": "{{retirement_date}}",
                            "repayment_schedule": "Monthly deduction of {{amount_requested / repayment_period}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Cash Advance Approval",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Staff cash advance approval and disbursement",
                "trigger_type": "event",
                "trigger_config": {"event_name": "cash-advance-submitted"},
                "workflow_definition": workflow_def,
                "requires_approval": True
            }
        )
        
        return workflow

    def create_payment_voucher_workflow(self, tenant, owner, branch, form):
        """Workflow for payment voucher processing"""
        workflow_def = {
            "steps": [
                {
                    "id": "verify_payee",
                    "type": "query",
                    "name": "Verify Payee Details",
                    "config": {
                        "query": "SELECT id, bank_details FROM suppliers WHERE name = {{payee_name}}",
                        "store_result_as": "payee_info"
                    }
                },
                {
                    "id": "accountant_review",
                    "type": "approval",
                    "name": "Accountant Review",
                    "config": {
                        "approver_role": "Accountant",
                        "approval_message": "Review payment voucher for {{amount}}",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "bursar_approval",
                    "type": "approval",
                    "name": "Bursar Approval",
                    "config": {
                        "approver_role": "Bursar",
                        "approval_message": "Approve payment to {{payee_name}}: {{amount}}",
                        "timeout_hours": 24
                    }
                },
                {
                    "id": "process_payment",
                    "type": "transaction",
                    "name": "Process Payment",
                    "config": {
                        "entries": [
                            {
                                "account": "2110",  # Accounts Payable
                                "debit": "{{amount}}",
                                "credit": 0,
                                "description": "Payment to {{payee_name}}"
                            },
                            {
                                "account": "1120",  # Bank Account
                                "debit": 0,
                                "credit": "{{amount}}",
                                "description": "{{payment_method}} payment - {{description}}"
                            }
                        ]
                    }
                },
                {
                    "id": "generate_receipt",
                    "type": "calculation",
                    "name": "Generate Payment Reference",
                    "config": {
                        "formula": "CONCAT('PAY/', {{voucher_number}})",
                        "store_as": "payment_reference"
                    }
                },
                {
                    "id": "notify_payee",
                    "type": "notification",
                    "name": "Notify Payee",
                    "config": {
                        "channel": "email",
                        "template": "payment_made",
                        "recipients": ["{{payee_email}}"],
                        "data": {
                            "payee_name": "{{payee_name}}",
                            "amount": "{{amount}}",
                            "payment_reference": "{{payment_reference}}",
                            "payment_date": "{{NOW()}}"
                        }
                    }
                }
            ]
        }
        
        workflow, created = WorkflowTemplate.objects.get_or_create(
            name="Payment Voucher Processing",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Payment authorization and processing workflow",
                "trigger_type": "event",
                "trigger_config": {"event_name": "payment-voucher-submitted"},
                "workflow_definition": workflow_def,
                "requires_approval": True
            }
        )
        
        return workflow

    def create_report_templates(self, tenant, owner, branch):
        """Create comprehensive report templates"""
        
        self.stdout.write('   Creating report templates...')
        
        reports_created = []
        
        # Phase 3A: Financial Reports (2 fixed, others pending)
        self.stdout.write('   → Financial Reports...')
        reports_created.extend(self.create_financial_reports(tenant, owner, branch))
        
        # Phase 3B: Operational Reports - TODO: Fix to use report_config
        # self.stdout.write('   → Operational Reports...')
        # reports_created.extend(self.create_operational_reports(tenant, owner, branch))
        
        # Phase 3C: Management Reports - TODO: Fix to use report_config
        # self.stdout.write('   → Management Reports...')
        # reports_created.extend(self.create_management_reports(tenant, owner, branch))
        
        self.stdout.write(f'   Created {len(reports_created)} report templates')
        return reports_created

    def create_financial_reports(self, tenant, owner, branch):
        """Phase 3A: Financial statement reports"""
        financial_reports = []
        
        # 1. Income Statement (Profit & Loss) - FIXED
        income_statement = self.create_income_statement_report(tenant, owner, branch)
        financial_reports.append(income_statement)
        
        # 2. Balance Sheet - FIXED
        balance_sheet = self.create_balance_sheet_report(tenant, owner, branch)
        financial_reports.append(balance_sheet)
        
        # 3. Cash Flow Statement - FIXED
        cash_flow = self.create_cash_flow_report(tenant, owner, branch)
        financial_reports.append(cash_flow)
        
        # 4. Trial Balance - FIXED
        trial_balance = self.create_trial_balance_report(tenant, owner, branch)
        financial_reports.append(trial_balance)
        
        # 5. General Ledger - FIXED
        general_ledger = self.create_general_ledger_report(tenant, owner, branch)
        financial_reports.append(general_ledger)
        
        # 6. Accounts Receivable Aging - FIXED
        ar_aging = self.create_ar_aging_report(tenant, owner, branch)
        financial_reports.append(ar_aging)
        
        # 7. Accounts Payable Aging - FIXED
        ap_aging = self.create_ap_aging_report(tenant, owner, branch)
        financial_reports.append(ap_aging)
        
        self.stdout.write(f'     ✓ {len(financial_reports)} financial reports')
        return financial_reports

    def create_income_statement_report(self, tenant, owner, branch):
        """Income Statement / Profit & Loss Report"""
        
        # Get or create category
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            ac.name as category,
            a.code as account_code,
            a.name as account_name,
            COALESCE(SUM(CASE 
                WHEN t.transaction_type = 'DEBIT' THEN t.amount 
                ELSE -t.amount 
            END), 0) as amount
        FROM accounts_account a
        LEFT JOIN accounts_account parent ON a.parent_id = parent.id
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
        WHERE a.branch_id = %(branch_id)s
          AND a.account_type IN ('INCOME', 'EXPENSE')
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        GROUP BY a.code, a.name, a.account_type
        ORDER BY a.code
        """
        
        # Create slug from name
        slug = "income-statement"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "Income Statement",
                "description": "Profit and Loss statement showing income and expenses",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Transaction",
                "allowed_entities": ["Transaction", "Account"],
                "allowed_fields": ["account_code", "account_name", "amount", "category"],
                "allowed_calculations": ["sum", "avg", "count"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "start_date": {"type": "date", "label": "Start Date", "required": True},
                        "end_date": {"type": "date", "label": "End Date", "required": True},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "category", "label": "Category", "type": "text", "width": 200, "sort_order": 1},
                        {"name": "account_code", "label": "Account Code", "type": "text", "width": 120, "sort_order": 2},
                        {"name": "account_name", "label": "Account Name", "type": "text", "width": 300, "sort_order": 3},
                        {"name": "amount", "label": "Amount", "type": "money", "width": 150, "aggregate": "SUM", "sort_order": 4}
                    ],
                    "charts": [
                        {
                            "type": "bar",
                            "title": "Income vs Expenses",
                            "x_axis": "category",
                            "y_axis": "amount"
                        }
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_balance_sheet_report(self, tenant, owner, branch):
        """Balance Sheet Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            a.account_type,
            a.code as account_code,
            a.name as account_name,
            COALESCE(a.balance, 0) as balance
        FROM accounts_account a
        WHERE a.branch_id = %(branch_id)s
          AND a.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
        ORDER BY a.account_type, a.code
        """
        
        slug = "balance-sheet"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "Balance Sheet",
                "description": "Statement of financial position showing assets, liabilities, and equity",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Account",
                "allowed_entities": ["Account"],
                "allowed_fields": ["account_code", "account_name", "balance", "account_type"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "as_of_date": {"type": "date", "label": "As Of Date", "required": True, "default": "today"},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "account_type", "label": "Type", "type": "text", "width": 120, "sort_order": 1},
                        {"name": "account_code", "label": "Code", "type": "text", "width": 100, "sort_order": 2},
                        {"name": "account_name", "label": "Account", "type": "text", "width": 300, "sort_order": 3},
                        {"name": "balance", "label": "Balance", "type": "money", "width": 150, "aggregate": "SUM", "sort_order": 4}
                    ],
                    "charts": [
                        {
                            "type": "pie",
                            "title": "Asset Distribution",
                            "x_axis": "account_type",
                            "y_axis": "balance"
                        }
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_cash_flow_report(self, tenant, owner, branch):
        """Cash Flow Statement"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            DATE(t.transaction_date) as transaction_date,
            t.description,
            CASE 
                WHEN t.transaction_type = 'DEBIT' AND a.code LIKE '11%' THEN t.amount
                ELSE 0
            END as cash_in,
            CASE 
                WHEN t.transaction_type = 'CREDIT' AND a.code LIKE '11%' THEN t.amount
                ELSE 0
            END as cash_out,
            SUM(CASE 
                WHEN t.transaction_type = 'DEBIT' THEN t.amount 
                ELSE -t.amount 
            END) OVER (ORDER BY t.transaction_date) as running_balance
        FROM accounts_transaction t
        JOIN accounts_account a ON t.account_id = a.id
        WHERE a.branch_id = %(branch_id)s
          AND a.code LIKE '11%'
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        ORDER BY t.transaction_date DESC
        """
        
        slug = "cash-flow-statement"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "Cash Flow Statement",
                "description": "Cash inflows and outflows with running balance",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Transaction",
                "allowed_entities": ["Transaction", "Account"],
                "allowed_fields": ["transaction_date", "description", "cash_in", "cash_out", "running_balance"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "start_date": {"type": "date", "label": "Start Date", "required": True},
                        "end_date": {"type": "date", "label": "End Date", "required": True},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "transaction_date", "label": "Date", "type": "date", "width": 120, "sort_order": 1},
                        {"name": "description", "label": "Description", "type": "text", "width": 300, "sort_order": 2},
                        {"name": "cash_in", "label": "Cash In", "type": "money", "width": 130, "aggregate": "SUM", "sort_order": 3},
                        {"name": "cash_out", "label": "Cash Out", "type": "money", "width": 130, "aggregate": "SUM", "sort_order": 4},
                        {"name": "running_balance", "label": "Balance", "type": "money", "width": 150, "sort_order": 5}
                    ],
                    "charts": [
                        {
                            "type": "line",
                            "title": "Cash Flow Trend",
                            "x_axis": "transaction_date",
                            "y_axis": "running_balance"
                        }
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_trial_balance_report(self, tenant, owner, branch):
        """Trial Balance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            a.code as account_code,
            a.name as account_name,
            a.account_type,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END), 0) as total_debits,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END), 0) as total_credits,
            COALESCE(a.balance, 0) as balance
        FROM accounts_account a
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
            AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        WHERE a.branch_id = %(branch_id)s
        GROUP BY a.code, a.name, a.account_type, a.balance
        ORDER BY a.code
        """
        
        slug = "trial-balance"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "Trial Balance",
                "description": "List of all accounts with debit and credit totals",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Account",
                "allowed_entities": ["Account", "Transaction"],
                "allowed_fields": ["account_code", "account_name", "account_type", "total_debits", "total_credits", "balance"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "start_date": {"type": "date", "label": "Start Date", "required": True},
                        "end_date": {"type": "date", "label": "End Date", "required": True},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "account_code", "label": "Account Code", "type": "text", "width": 120, "sort_order": 1},
                        {"name": "account_name", "label": "Account Name", "type": "text", "width": 300, "sort_order": 2},
                        {"name": "account_type", "label": "Type", "type": "text", "width": 100, "sort_order": 3},
                        {"name": "total_debits", "label": "Debits", "type": "money", "width": 150, "aggregate": "SUM", "sort_order": 4},
                        {"name": "total_credits", "label": "Credits", "type": "money", "width": 150, "aggregate": "SUM", "sort_order": 5},
                        {"name": "balance", "label": "Balance", "type": "money", "width": 150, "aggregate": "SUM", "sort_order": 6}
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_general_ledger_report(self, tenant, owner, branch):
        """General Ledger Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            t.transaction_date,
            a.code as account_code,
            a.name as account_name,
            t.description,
            t.reference_number,
            CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END as debit,
            CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END as credit
        FROM accounts_transaction t
        JOIN accounts_account a ON t.account_id = a.id
        WHERE a.branch_id = %(branch_id)s
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
          AND (%(account_code)s IS NULL OR a.code = %(account_code)s)
        ORDER BY t.transaction_date DESC, t.id DESC
        """
        
        slug = "general-ledger"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "General Ledger",
                "description": "Detailed listing of all transactions",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Transaction",
                "allowed_entities": ["Transaction", "Account"],
                "allowed_fields": ["transaction_date", "account_code", "account_name", "description", "reference_number", "debit", "credit"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "start_date": {"type": "date", "label": "Start Date", "required": True},
                        "end_date": {"type": "date", "label": "End Date", "required": True},
                        "account_code": {"type": "text", "label": "Account Code (Optional)", "required": False},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "transaction_date", "label": "Date", "type": "date", "width": 120, "sort_order": 1},
                        {"name": "account_code", "label": "Account", "type": "text", "width": 100, "sort_order": 2},
                        {"name": "account_name", "label": "Account Name", "type": "text", "width": 200, "sort_order": 3},
                        {"name": "description", "label": "Description", "type": "text", "width": 250, "sort_order": 4},
                        {"name": "reference_number", "label": "Ref #", "type": "text", "width": 100, "sort_order": 5},
                        {"name": "debit", "label": "Debit", "type": "money", "width": 130, "aggregate": "SUM", "sort_order": 6},
                        {"name": "credit", "label": "Credit", "type": "money", "width": 130, "aggregate": "SUM", "sort_order": 7}
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_ar_aging_report(self, tenant, owner, branch):
        """Accounts Receivable Aging Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            s.student_id,
            s.student_name,
            s.class_name,
            s.parent_phone,
            COALESCE(a.balance, 0) as total_outstanding,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.transaction_date) <= 30 THEN t.amount
                ELSE 0
            END as current_amount,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.transaction_date) BETWEEN 31 AND 60 THEN t.amount
                ELSE 0
            END as days_31_60,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.transaction_date) BETWEEN 61 AND 90 THEN t.amount
                ELSE 0
            END as days_61_90,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.transaction_date) > 90 THEN t.amount
                ELSE 0
            END as over_90_days
        FROM students s
        JOIN accounts_account a ON s.account_id = a.id
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
        WHERE a.branch_id = %(branch_id)s
          AND a.code LIKE '1210%'
          AND a.balance > 0
        GROUP BY s.student_id, s.student_name, s.class_name, s.parent_phone, a.balance
        ORDER BY a.balance DESC
        """
        
        slug = "ar-aging"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "AR Aging Report",
                "description": "Student fees receivable aging analysis",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Account",
                "allowed_entities": ["Account", "Transaction", "Student"],
                "allowed_fields": ["student_id", "student_name", "class_name", "total_outstanding", "current_amount", "days_31_60", "days_61_90", "over_90_days"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "as_of_date": {"type": "date", "label": "As Of Date", "required": True, "default": "today"},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "student_id", "label": "Student ID", "type": "text", "width": 100, "sort_order": 1},
                        {"name": "student_name", "label": "Name", "type": "text", "width": 200, "sort_order": 2},
                        {"name": "class_name", "label": "Class", "type": "text", "width": 100, "sort_order": 3},
                        {"name": "total_outstanding", "label": "Total", "type": "money", "width": 120, "aggregate": "SUM", "sort_order": 4},
                        {"name": "current_amount", "label": "Current", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 5},
                        {"name": "days_31_60", "label": "31-60 Days", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 6},
                        {"name": "days_61_90", "label": "61-90 Days", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 7},
                        {"name": "over_90_days", "label": "Over 90", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 8}
                    ],
                    "charts": [
                        {
                            "type": "bar",
                            "title": "Aging Summary",
                            "x_axis": "student_name",
                            "y_axis": "total_outstanding"
                        }
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_ap_aging_report(self, tenant, owner, branch):
        """Accounts Payable Aging Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Financial Statements",
            owner=owner,
            branch=branch,
            defaults={"description": "Core financial statements"}
        )
        
        query = """
        SELECT 
            v.vendor_name,
            v.vendor_code,
            v.contact_phone,
            COALESCE(a.balance, 0) as total_payable,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.due_date) <= 30 THEN t.amount
                ELSE 0
            END as current_amount,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.due_date) BETWEEN 31 AND 60 THEN t.amount
                ELSE 0
            END as days_31_60,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.due_date) BETWEEN 61 AND 90 THEN t.amount
                ELSE 0
            END as days_61_90,
            CASE 
                WHEN DATEDIFF(CURRENT_DATE, t.due_date) > 90 THEN t.amount
                ELSE 0
            END as over_90_days
        FROM vendors v
        JOIN accounts_account a ON v.account_id = a.id
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
        WHERE a.branch_id = %(branch_id)s
          AND a.code LIKE '21%'
          AND a.balance > 0
        GROUP BY v.vendor_name, v.vendor_code, v.contact_phone, a.balance
        ORDER BY a.balance DESC
        """
        
        slug = "ap-aging"
        
        report, created = ReportTemplate.objects.get_or_create(
            code=slug,
            owner=owner,
            branch=branch,
            defaults={
                "name": "AP Aging Report",
                "description": "Vendor payables aging analysis",
                "category": category,
                "report_type": "financial",
                "access_level": "internal",
                "primary_entity": "Account",
                "allowed_entities": ["Account", "Transaction", "Vendor"],
                "allowed_fields": ["vendor_code", "vendor_name", "contact_phone", "total_payable", "current_amount", "days_31_60", "days_61_90", "over_90_days"],
                "allowed_calculations": ["sum"],
                "is_active": True,
                "is_system": True,
                "is_editable": False,
                "report_config": {
                    "query": query,
                    "parameters": {
                        "as_of_date": {"type": "date", "label": "As Of Date", "required": True, "default": "today"},
                        "branch_id": {"type": "hidden", "default": "current_branch"}
                    },
                    "columns": [
                        {"name": "vendor_code", "label": "Vendor Code", "type": "text", "width": 100, "sort_order": 1},
                        {"name": "vendor_name", "label": "Vendor Name", "type": "text", "width": 200, "sort_order": 2},
                        {"name": "contact_phone", "label": "Phone", "type": "text", "width": 120, "sort_order": 3},
                        {"name": "total_payable", "label": "Total", "type": "money", "width": 120, "aggregate": "SUM", "sort_order": 4},
                        {"name": "current_amount", "label": "Current", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 5},
                        {"name": "days_31_60", "label": "31-60 Days", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 6},
                        {"name": "days_61_90", "label": "61-90 Days", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 7},
                        {"name": "over_90_days", "label": "Over 90", "type": "money", "width": 110, "aggregate": "SUM", "sort_order": 8}
                    ],
                    "export": {
                        "enabled": True,
                        "formats": ["pdf", "excel", "csv"]
                    },
                    "cache_duration": 3600
                }
            }
        )
        
        return report

    def create_operational_reports(self, tenant, owner, branch):
        """Phase 3B: Operational/day-to-day reports"""
        operational_reports = []
        
        # 1. Student Fee Collection Report
        fee_collection = self.create_fee_collection_report(tenant, owner, branch)
        operational_reports.append(fee_collection)
        
        # 2. Daily Transactions Report
        daily_transactions = self.create_daily_transactions_report(tenant, owner, branch)
        operational_reports.append(daily_transactions)
        
        # 3. Expense Summary Report
        expense_summary = self.create_expense_summary_report(tenant, owner, branch)
        operational_reports.append(expense_summary)
        
        # 4. Purchase Orders Report
        purchase_orders = self.create_purchase_orders_report(tenant, owner, branch)
        operational_reports.append(purchase_orders)
        
        # 5. Staff Attendance Report
        staff_attendance = self.create_staff_attendance_report(tenant, owner, branch)
        operational_reports.append(staff_attendance)
        
        # 6. Student Attendance Report
        student_attendance = self.create_student_attendance_report(tenant, owner, branch)
        operational_reports.append(student_attendance)
        
        # 7. Inventory Stock Report
        inventory_stock = self.create_inventory_stock_report(tenant, owner, branch)
        operational_reports.append(inventory_stock)
        
        # 8. Leave Summary Report
        leave_summary = self.create_leave_summary_report(tenant, owner, branch)
        operational_reports.append(leave_summary)
        
        self.stdout.write(f'     ✓ {len(operational_reports)} operational reports')
        return operational_reports

    def create_fee_collection_report(self, tenant, owner, branch):
        """Student Fee Collection Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            DATE(fs.created_at) as payment_date,
            fs.form_data->>'$.student_id' as student_id,
            fs.form_data->>'$.student_name' as student_name,
            fs.form_data->>'$.class_name' as class_name,
            fs.form_data->>'$.fee_type' as fee_type,
            CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2)) as amount,
            fs.form_data->>'$.payment_method' as payment_method,
            fs.form_data->>'$.reference' as reference,
            CONCAT(u.first_name, ' ', u.last_name) as collected_by
        FROM automations_formsubmission fs
        JOIN users_user u ON fs.created_by_id = u.id
        JOIN automations_formschema f ON fs.form_id = f.id
        WHERE f.name = 'Fee Payment'
          AND fs.branch_id = %(branch_id)s
          AND DATE(fs.created_at) BETWEEN %(start_date)s AND %(end_date)s
          AND fs.status = 'APPROVED'
        ORDER BY fs.created_at DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Fee Collection Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Daily student fee payments collected",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "payment_date", "label": "Date", "type": "date", "width": 120},
                {"name": "student_id", "label": "Student ID", "type": "text", "width": 100},
                {"name": "student_name", "label": "Student Name", "type": "text", "width": 200},
                {"name": "class_name", "label": "Class", "type": "text", "width": 100},
                {"name": "fee_type", "label": "Fee Type", "type": "text", "width": 120},
                {"name": "amount", "label": "Amount", "type": "money", "width": 130, "aggregate": "SUM"},
                {"name": "payment_method", "label": "Method", "type": "text", "width": 120},
                {"name": "reference", "label": "Reference", "type": "text", "width": 150},
                {"name": "collected_by", "label": "Collected By", "type": "text", "width": 150}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Collections by Fee Type",
                x_axis_column="fee_type",
                y_axis_column="amount",
                sort_order=1
            )
        
        return report

    def create_daily_transactions_report(self, tenant, owner, branch):
        """Daily Transactions Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            DATE(t.transaction_date) as transaction_date,
            t.reference_number,
            a.account_code,
            a.account_name,
            t.description,
            t.transaction_type,
            t.amount,
            CONCAT(u.first_name, ' ', u.last_name) as created_by
        FROM accounts_transaction t
        JOIN accounts_account a ON t.account_id = a.id
        JOIN users_user u ON t.created_by_id = u.id
        WHERE a.branch_id = %(branch_id)s
          AND DATE(t.transaction_date) = %(transaction_date)s
        ORDER BY t.created_at DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Daily Transactions",
            owner=owner,
            branch=branch,
            defaults={
                "description": "All transactions for a specific day",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "transaction_date": {"type": "date", "label": "Transaction Date", "required": True, "default": "today"},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "transaction_date", "label": "Date", "type": "date", "width": 120},
                {"name": "reference_number", "label": "Ref #", "type": "text", "width": 120},
                {"name": "account_code", "label": "Account", "type": "text", "width": 100},
                {"name": "account_name", "label": "Account Name", "type": "text", "width": 200},
                {"name": "description", "label": "Description", "type": "text", "width": 250},
                {"name": "transaction_type", "label": "Type", "type": "text", "width": 80},
                {"name": "amount", "label": "Amount", "type": "money", "width": 130, "aggregate": "SUM"},
                {"name": "created_by", "label": "Created By", "type": "text", "width": 150}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
        
        return report

    def create_expense_summary_report(self, tenant, owner, branch):
        """Expense Summary Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            DATE(fs.created_at) as expense_date,
            fs.form_data->>'$.expense_type' as expense_category,
            fs.form_data->>'$.description' as description,
            CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2)) as amount,
            fs.form_data->>'$.vendor' as vendor,
            fs.form_data->>'$.department' as department,
            fs.status,
            CONCAT(u.first_name, ' ', u.last_name) as requested_by
        FROM automations_formsubmission fs
        JOIN users_user u ON fs.created_by_id = u.id
        JOIN automations_formschema f ON fs.form_id = f.id
        WHERE f.name = 'Expense Request'
          AND fs.branch_id = %(branch_id)s
          AND DATE(fs.created_at) BETWEEN %(start_date)s AND %(end_date)s
          AND (%(department)s IS NULL OR fs.form_data->>'$.department' = %(department)s)
        ORDER BY fs.created_at DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Expense Summary",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Summary of expense requests by department",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "department": {"type": "select", "label": "Department (Optional)", "required": False,
                                  "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "expense_date", "label": "Date", "type": "date", "width": 120},
                {"name": "expense_category", "label": "Category", "type": "text", "width": 150},
                {"name": "description", "label": "Description", "type": "text", "width": 250},
                {"name": "amount", "label": "Amount", "type": "money", "width": 130, "aggregate": "SUM"},
                {"name": "vendor", "label": "Vendor", "type": "text", "width": 150},
                {"name": "department", "label": "Department", "type": "text", "width": 120},
                {"name": "status", "label": "Status", "type": "text", "width": 100},
                {"name": "requested_by", "label": "Requested By", "type": "text", "width": 150}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="pie",
                title="Expenses by Category",
                x_axis_column="expense_category",
                y_axis_column="amount",
                sort_order=1
            )
        
        return report

    def create_purchase_orders_report(self, tenant, owner, branch):
        """Purchase Orders Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            DATE(fs.created_at) as pr_date,
            fs.form_data->>'$.pr_number' as pr_number,
            fs.form_data->>'$.requested_by' as requested_by,
            fs.form_data->>'$.department' as department,
            CAST(fs.form_data->>'$.total_amount' AS DECIMAL(10,2)) as total_amount,
            fs.form_data->>'$.urgency' as urgency,
            fs.form_data->>'$.required_date' as required_date,
            fs.status,
            DATEDIFF(fs.updated_at, fs.created_at) as processing_days
        FROM automations_formsubmission fs
        JOIN automations_formschema f ON fs.form_id = f.id
        WHERE f.name = 'Purchase Requisition'
          AND fs.branch_id = %(branch_id)s
          AND DATE(fs.created_at) BETWEEN %(start_date)s AND %(end_date)s
          AND (%(status)s IS NULL OR fs.status = %(status)s)
        ORDER BY fs.created_at DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Purchase Orders Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Purchase requisitions and their status",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "status": {"type": "select", "label": "Status (Optional)", "required": False,
                              "options": ["PENDING", "APPROVED", "REJECTED", "COMPLETED"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "pr_date", "label": "Date", "type": "date", "width": 120},
                {"name": "pr_number", "label": "PR #", "type": "text", "width": 120},
                {"name": "requested_by", "label": "Requester", "type": "text", "width": 150},
                {"name": "department", "label": "Department", "type": "text", "width": 120},
                {"name": "total_amount", "label": "Amount", "type": "money", "width": 130, "aggregate": "SUM"},
                {"name": "urgency", "label": "Urgency", "type": "text", "width": 100},
                {"name": "required_date", "label": "Required By", "type": "date", "width": 120},
                {"name": "status", "label": "Status", "type": "text", "width": 100},
                {"name": "processing_days", "label": "Days", "type": "number", "width": 80}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="PO Status Distribution",
                x_axis_column="status",
                y_axis_column="total_amount",
                sort_order=1
            )
        
        return report

    def create_staff_attendance_report(self, tenant, owner, branch):
        """Staff Attendance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            s.staff_id,
            CONCAT(s.first_name, ' ', s.last_name) as staff_name,
            s.department,
            COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as days_present,
            COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as days_absent,
            COUNT(CASE WHEN a.status = 'LATE' THEN 1 END) as days_late,
            COUNT(CASE WHEN a.status = 'ON_LEAVE' THEN 1 END) as days_on_leave,
            COUNT(*) as total_days,
            ROUND((COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*)), 2) as attendance_rate
        FROM staff s
        LEFT JOIN staff_attendance a ON s.id = a.staff_id
        WHERE s.branch_id = %(branch_id)s
          AND a.attendance_date BETWEEN %(start_date)s AND %(end_date)s
          AND s.is_active = TRUE
        GROUP BY s.staff_id, s.first_name, s.last_name, s.department
        ORDER BY attendance_rate DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Staff Attendance Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Staff attendance summary and statistics",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "staff_id", "label": "Staff ID", "type": "text", "width": 100},
                {"name": "staff_name", "label": "Name", "type": "text", "width": 200},
                {"name": "department", "label": "Department", "type": "text", "width": 120},
                {"name": "days_present", "label": "Present", "type": "number", "width": 80},
                {"name": "days_absent", "label": "Absent", "type": "number", "width": 80},
                {"name": "days_late", "label": "Late", "type": "number", "width": 80},
                {"name": "days_on_leave", "label": "Leave", "type": "number", "width": 80},
                {"name": "total_days", "label": "Total", "type": "number", "width": 80},
                {"name": "attendance_rate", "label": "Rate %", "type": "number", "width": 100}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Attendance by Department",
                x_axis_column="department",
                y_axis_column="attendance_rate",
                sort_order=1
            )
        
        return report

    def create_student_attendance_report(self, tenant, owner, branch):
        """Student Attendance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            s.student_id,
            s.student_name,
            s.class_name,
            COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as days_present,
            COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as days_absent,
            COUNT(CASE WHEN a.status = 'LATE' THEN 1 END) as days_late,
            COUNT(*) as total_days,
            ROUND((COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) * 100.0 / COUNT(*)), 2) as attendance_rate
        FROM students s
        LEFT JOIN student_attendance a ON s.id = a.student_id
        WHERE s.branch_id = %(branch_id)s
          AND a.attendance_date BETWEEN %(start_date)s AND %(end_date)s
          AND (%(class_name)s IS NULL OR s.class_name = %(class_name)s)
          AND s.is_active = TRUE
        GROUP BY s.student_id, s.student_name, s.class_name
        ORDER BY s.class_name, attendance_rate DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Student Attendance Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Student attendance summary by class",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "class_name": {"type": "select", "label": "Class (Optional)", "required": False,
                                  "options": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
                                             "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "student_id", "label": "Student ID", "type": "text", "width": 100},
                {"name": "student_name", "label": "Name", "type": "text", "width": 200},
                {"name": "class_name", "label": "Class", "type": "text", "width": 100},
                {"name": "days_present", "label": "Present", "type": "number", "width": 80},
                {"name": "days_absent", "label": "Absent", "type": "number", "width": 80},
                {"name": "days_late", "label": "Late", "type": "number", "width": 80},
                {"name": "total_days", "label": "Total", "type": "number", "width": 80},
                {"name": "attendance_rate", "label": "Rate %", "type": "number", "width": 100}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Attendance by Class",
                x_axis_column="class_name",
                y_axis_column="attendance_rate",
                sort_order=1
            )
        
        return report

    def create_inventory_stock_report(self, tenant, owner, branch):
        """Inventory Stock Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            i.item_code,
            i.item_name,
            i.category,
            i.unit,
            i.quantity_in_stock,
            i.reorder_level,
            i.unit_cost,
            i.quantity_in_stock * i.unit_cost as total_value,
            CASE 
                WHEN i.quantity_in_stock <= i.reorder_level THEN 'Low Stock'
                WHEN i.quantity_in_stock = 0 THEN 'Out of Stock'
                ELSE 'Adequate'
            END as stock_status,
            i.last_restocked_date
        FROM inventory_items i
        WHERE i.branch_id = %(branch_id)s
          AND i.is_active = TRUE
          AND (%(category)s IS NULL OR i.category = %(category)s)
          AND (%(stock_status)s IS NULL OR 
               (%(stock_status)s = 'Low' AND i.quantity_in_stock <= i.reorder_level) OR
               (%(stock_status)s = 'Out' AND i.quantity_in_stock = 0))
        ORDER BY stock_status, i.item_name
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Inventory Stock Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Current stock levels and reorder alerts",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "category": {"type": "select", "label": "Category (Optional)", "required": False,
                                "options": ["Books", "Uniforms", "Stationery", "Lab Equipment", "Sports Equipment"]},
                    "stock_status": {"type": "select", "label": "Stock Status (Optional)", "required": False,
                                    "options": ["Low", "Out"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "item_code", "label": "Item Code", "type": "text", "width": 100},
                {"name": "item_name", "label": "Item Name", "type": "text", "width": 200},
                {"name": "category", "label": "Category", "type": "text", "width": 120},
                {"name": "unit", "label": "Unit", "type": "text", "width": 80},
                {"name": "quantity_in_stock", "label": "In Stock", "type": "number", "width": 100},
                {"name": "reorder_level", "label": "Reorder Level", "type": "number", "width": 120},
                {"name": "unit_cost", "label": "Unit Cost", "type": "money", "width": 120},
                {"name": "total_value", "label": "Total Value", "type": "money", "width": 130, "aggregate": "SUM"},
                {"name": "stock_status", "label": "Status", "type": "text", "width": 120},
                {"name": "last_restocked_date", "label": "Last Restocked", "type": "date", "width": 130}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="pie",
                title="Stock Value by Category",
                x_axis_column="category",
                y_axis_column="total_value",
                sort_order=1
            )
        
        return report

    def create_leave_summary_report(self, tenant, owner, branch):
        """Leave Summary Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Operational Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Day-to-day operational reports"}
        )
        
        query = """
        SELECT 
            DATE(fs.created_at) as request_date,
            fs.form_data->>'$.staff_name' as staff_name,
            fs.form_data->>'$.staff_id' as staff_id,
            fs.form_data->>'$.department' as department,
            fs.form_data->>'$.leave_type' as leave_type,
            fs.form_data->>'$.start_date' as start_date,
            fs.form_data->>'$.end_date' as end_date,
            CAST(fs.form_data->>'$.days_requested' AS INT) as days_requested,
            fs.status,
            DATEDIFF(fs.updated_at, fs.created_at) as approval_days
        FROM automations_formsubmission fs
        JOIN automations_formschema f ON fs.form_id = f.id
        WHERE f.name = 'Leave Request'
          AND fs.branch_id = %(branch_id)s
          AND DATE(fs.created_at) BETWEEN %(start_date)s AND %(end_date)s
          AND (%(department)s IS NULL OR fs.form_data->>'$.department' = %(department)s)
          AND (%(leave_type)s IS NULL OR fs.form_data->>'$.leave_type' = %(leave_type)s)
        ORDER BY fs.created_at DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Leave Summary Report",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Staff leave requests and approvals",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "department": {"type": "select", "label": "Department (Optional)", "required": False,
                                  "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"]},
                    "leave_type": {"type": "select", "label": "Leave Type (Optional)", "required": False,
                                  "options": ["Annual Leave", "Sick Leave", "Casual Leave", "Maternity Leave", "Paternity Leave", "Study Leave"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "request_date", "label": "Request Date", "type": "date", "width": 120},
                {"name": "staff_id", "label": "Staff ID", "type": "text", "width": 100},
                {"name": "staff_name", "label": "Staff Name", "type": "text", "width": 180},
                {"name": "department", "label": "Department", "type": "text", "width": 120},
                {"name": "leave_type", "label": "Leave Type", "type": "text", "width": 130},
                {"name": "start_date", "label": "Start Date", "type": "date", "width": 110},
                {"name": "end_date", "label": "End Date", "type": "date", "width": 110},
                {"name": "days_requested", "label": "Days", "type": "number", "width": 80, "aggregate": "SUM"},
                {"name": "status", "label": "Status", "type": "text", "width": 100},
                {"name": "approval_days", "label": "Approval Days", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Leave Requests by Type",
                x_axis_column="leave_type",
                y_axis_column="days_requested",
                sort_order=1
            )
        
        return report

    def create_management_reports(self, tenant, owner, branch):
        """Phase 3C: High-level management and executive reports"""
        management_reports = []
        
        # 1. Executive Summary Report
        executive_summary = self.create_executive_summary_report(tenant, owner, branch)
        management_reports.append(executive_summary)
        
        # 2. Budget vs Actual Report
        budget_actual = self.create_budget_actual_report(tenant, owner, branch)
        management_reports.append(budget_actual)
        
        # 3. Income Analysis Report
        income_analysis = self.create_income_analysis_report(tenant, owner, branch)
        management_reports.append(income_analysis)
        
        # 4. Expense Analysis Report
        expense_analysis = self.create_expense_analysis_report(tenant, owner, branch)
        management_reports.append(expense_analysis)
        
        # 5. Department Performance Report
        dept_performance = self.create_department_performance_report(tenant, owner, branch)
        management_reports.append(dept_performance)
        
        # 6. Student Enrollment Report
        enrollment = self.create_student_enrollment_report(tenant, owner, branch)
        management_reports.append(enrollment)
        
        # 7. Fee Collection Performance
        fee_performance = self.create_fee_collection_performance_report(tenant, owner, branch)
        management_reports.append(fee_performance)
        
        # 8. Cash Position Report
        cash_position = self.create_cash_position_report(tenant, owner, branch)
        management_reports.append(cash_position)
        
        self.stdout.write(f'     ✓ {len(management_reports)} management reports')
        return management_reports

    def create_executive_summary_report(self, tenant, owner, branch):
        """Executive Summary Dashboard Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            'Income' as metric,
            COALESCE(SUM(CASE WHEN a.account_type = 'INCOME' THEN a.balance ELSE 0 END), 0) as current_period,
            COALESCE(SUM(CASE WHEN a.account_type = 'INCOME' AND DATE(t.transaction_date) < DATE_SUB(%(start_date)s, INTERVAL 1 MONTH) THEN t.amount ELSE 0 END), 0) as previous_period,
            ROUND(((current_period - previous_period) / NULLIF(previous_period, 0)) * 100, 2) as growth_rate
        FROM accounts_account a
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
        WHERE a.branch_id = %(branch_id)s
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        
        UNION ALL
        
        SELECT 
            'Expenses' as metric,
            COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN a.balance ELSE 0 END), 0) as current_period,
            COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' AND DATE(t.transaction_date) < DATE_SUB(%(start_date)s, INTERVAL 1 MONTH) THEN t.amount ELSE 0 END), 0) as previous_period,
            ROUND(((current_period - previous_period) / NULLIF(previous_period, 0)) * 100, 2) as growth_rate
        FROM accounts_account a
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
        WHERE a.branch_id = %(branch_id)s
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        
        UNION ALL
        
        SELECT 
            'Net Profit' as metric,
            income.total - expenses.total as current_period,
            0 as previous_period,
            0 as growth_rate
        FROM 
            (SELECT COALESCE(SUM(a.balance), 0) as total FROM accounts_account a WHERE a.account_type = 'INCOME' AND a.branch_id = %(branch_id)s) income,
            (SELECT COALESCE(SUM(a.balance), 0) as total FROM accounts_account a WHERE a.account_type = 'EXPENSE' AND a.branch_id = %(branch_id)s) expenses
        
        UNION ALL
        
        SELECT 
            'Student Count' as metric,
            COUNT(*) as current_period,
            0 as previous_period,
            0 as growth_rate
        FROM students
        WHERE branch_id = %(branch_id)s AND is_active = TRUE
        
        UNION ALL
        
        SELECT 
            'Outstanding Fees' as metric,
            COALESCE(SUM(balance), 0) as current_period,
            0 as previous_period,
            0 as growth_rate
        FROM accounts_account
        WHERE branch_id = %(branch_id)s AND account_code LIKE '1210%'
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Executive Summary",
            owner=owner,
            branch=branch,
            defaults={
                "description": "High-level KPIs and performance metrics for executives",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True,
                "cache_duration": 1800
            }
        )
        
        if created:
            columns_data = [
                {"name": "metric", "label": "Metric", "type": "text", "width": 200},
                {"name": "current_period", "label": "Current Period", "type": "money", "width": 150},
                {"name": "previous_period", "label": "Previous Period", "type": "money", "width": 150},
                {"name": "growth_rate", "label": "Growth %", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Key Performance Indicators",
                x_axis_column="metric",
                y_axis_column="current_period",
                sort_order=1
            )
        
        return report

    def create_budget_actual_report(self, tenant, owner, branch):
        """Budget vs Actual Performance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            b.budget_code,
            b.budget_name,
            b.department,
            b.budget_amount,
            COALESCE(SUM(t.amount), 0) as actual_amount,
            b.budget_amount - COALESCE(SUM(t.amount), 0) as variance,
            ROUND((COALESCE(SUM(t.amount), 0) / NULLIF(b.budget_amount, 0)) * 100, 2) as utilization_rate,
            CASE 
                WHEN COALESCE(SUM(t.amount), 0) > b.budget_amount THEN 'Over Budget'
                WHEN COALESCE(SUM(t.amount), 0) > (b.budget_amount * 0.8) THEN 'Near Limit'
                ELSE 'Within Budget'
            END as status
        FROM budgets b
        LEFT JOIN accounts_transaction t ON b.account_code = t.account_id
            AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        WHERE b.branch_id = %(branch_id)s
          AND b.fiscal_year = %(fiscal_year)s
          AND (%(department)s IS NULL OR b.department = %(department)s)
        GROUP BY b.budget_code, b.budget_name, b.department, b.budget_amount
        ORDER BY utilization_rate DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Budget vs Actual",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Budget performance and variance analysis",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "fiscal_year": {"type": "text", "label": "Fiscal Year", "required": True, "default": "2024/2025"},
                    "department": {"type": "select", "label": "Department (Optional)", "required": False,
                                  "options": ["Administration", "Finance", "Academics", "Maintenance", "IT", "HR"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "budget_code", "label": "Budget Code", "type": "text", "width": 120},
                {"name": "budget_name", "label": "Budget Name", "type": "text", "width": 200},
                {"name": "department", "label": "Department", "type": "text", "width": 120},
                {"name": "budget_amount", "label": "Budget", "type": "money", "width": 130},
                {"name": "actual_amount", "label": "Actual", "type": "money", "width": 130},
                {"name": "variance", "label": "Variance", "type": "money", "width": 130},
                {"name": "utilization_rate", "label": "Used %", "type": "number", "width": 100},
                {"name": "status", "label": "Status", "type": "text", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Budget Utilization by Department",
                x_axis_column="department",
                y_axis_column="utilization_rate",
                sort_order=1
            )
        
        return report

    def create_income_analysis_report(self, tenant, owner, branch):
        """Income Analysis Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            DATE_FORMAT(t.transaction_date, '%%Y-%%m') as month,
            a.account_name as income_source,
            COALESCE(SUM(t.amount), 0) as total_income,
            COUNT(t.id) as transaction_count,
            AVG(t.amount) as average_transaction,
            ROUND((SUM(t.amount) / (SELECT SUM(amount) FROM accounts_transaction WHERE account_id IN 
                (SELECT id FROM accounts_account WHERE account_type = 'INCOME' AND branch_id = %(branch_id)s))) * 100, 2) as percentage_of_total
        FROM accounts_transaction t
        JOIN accounts_account a ON t.account_id = a.id
        WHERE a.branch_id = %(branch_id)s
          AND a.account_type = 'INCOME'
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        GROUP BY DATE_FORMAT(t.transaction_date, '%%Y-%%m'), a.account_name
        ORDER BY month DESC, total_income DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Income Analysis",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Detailed income breakdown and trends",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "month", "label": "Month", "type": "text", "width": 120},
                {"name": "income_source", "label": "Income Source", "type": "text", "width": 250},
                {"name": "total_income", "label": "Total Income", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "transaction_count", "label": "Count", "type": "number", "width": 100},
                {"name": "average_transaction", "label": "Avg Amount", "type": "money", "width": 130},
                {"name": "percentage_of_total", "label": "% of Total", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="line",
                title="Income Trend",
                x_axis_column="month",
                y_axis_column="total_income",
                sort_order=1
            )
        
        return report

    def create_expense_analysis_report(self, tenant, owner, branch):
        """Expense Analysis Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            DATE_FORMAT(t.transaction_date, '%%Y-%%m') as month,
            ac.name as expense_category,
            COALESCE(SUM(t.amount), 0) as total_expense,
            COUNT(t.id) as transaction_count,
            AVG(t.amount) as average_expense,
            ROUND((SUM(t.amount) / (SELECT SUM(amount) FROM accounts_transaction WHERE account_id IN 
                (SELECT id FROM accounts_account WHERE account_type = 'EXPENSE' AND branch_id = %(branch_id)s))) * 100, 2) as percentage_of_total
        FROM accounts_transaction t
        JOIN accounts_account a ON t.account_id = a.id
        JOIN accounts_accountcategory ac ON a.category_id = ac.id
        WHERE a.branch_id = %(branch_id)s
          AND a.account_type = 'EXPENSE'
          AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        GROUP BY DATE_FORMAT(t.transaction_date, '%%Y-%%m'), ac.name
        ORDER BY month DESC, total_expense DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Expense Analysis",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Expense breakdown and spending trends",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "month", "label": "Month", "type": "text", "width": 120},
                {"name": "expense_category", "label": "Expense Category", "type": "text", "width": 250},
                {"name": "total_expense", "label": "Total Expense", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "transaction_count", "label": "Count", "type": "number", "width": 100},
                {"name": "average_expense", "label": "Avg Amount", "type": "money", "width": 130},
                {"name": "percentage_of_total", "label": "% of Total", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="pie",
                title="Expense Distribution",
                x_axis_column="expense_category",
                y_axis_column="total_expense",
                sort_order=1
            )
        
        return report

    def create_department_performance_report(self, tenant, owner, branch):
        """Department Performance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            d.department_name,
            COUNT(DISTINCT s.id) as staff_count,
            COALESCE(SUM(b.budget_amount), 0) as budget_allocated,
            COALESCE(SUM(e.amount), 0) as actual_spending,
            b.budget_amount - COALESCE(SUM(e.amount), 0) as budget_remaining,
            COUNT(DISTINCT pr.id) as purchase_requests,
            COUNT(DISTINCT CASE WHEN pr.status = 'APPROVED' THEN pr.id END) as approved_requests,
            ROUND(AVG(sa.attendance_rate), 2) as avg_staff_attendance
        FROM departments d
        LEFT JOIN staff s ON d.id = s.department_id AND s.is_active = TRUE
        LEFT JOIN budgets b ON d.department_name = b.department
        LEFT JOIN (
            SELECT form_data->>'$.department' as dept, CAST(form_data->>'$.amount' AS DECIMAL(10,2)) as amount
            FROM automations_formsubmission fs
            JOIN automations_formschema f ON fs.form_id = f.id
            WHERE f.name = 'Expense Request' AND fs.status = 'APPROVED'
        ) e ON d.department_name = e.dept
        LEFT JOIN (
            SELECT form_data->>'$.department' as dept, id, status
            FROM automations_formsubmission fs
            JOIN automations_formschema f ON fs.form_id = f.id
            WHERE f.name = 'Purchase Requisition'
        ) pr ON d.department_name = pr.dept
        LEFT JOIN (
            SELECT department_id, AVG(attendance_rate) as attendance_rate
            FROM staff_attendance
            GROUP BY department_id
        ) sa ON d.id = sa.department_id
        WHERE d.branch_id = %(branch_id)s
        GROUP BY d.department_name, b.budget_amount
        ORDER BY actual_spending DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Department Performance",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Performance metrics by department",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "department_name", "label": "Department", "type": "text", "width": 150},
                {"name": "staff_count", "label": "Staff", "type": "number", "width": 80},
                {"name": "budget_allocated", "label": "Budget", "type": "money", "width": 130},
                {"name": "actual_spending", "label": "Spent", "type": "money", "width": 130},
                {"name": "budget_remaining", "label": "Remaining", "type": "money", "width": 130},
                {"name": "purchase_requests", "label": "PRs", "type": "number", "width": 80},
                {"name": "approved_requests", "label": "Approved", "type": "number", "width": 100},
                {"name": "avg_staff_attendance", "label": "Attendance %", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Department Budget vs Spending",
                x_axis_column="department_name",
                y_axis_column="actual_spending",
                sort_order=1
            )
        
        return report

    def create_student_enrollment_report(self, tenant, owner, branch):
        """Student Enrollment Trends Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            s.class_name,
            COUNT(*) as total_students,
            COUNT(CASE WHEN s.gender = 'Male' THEN 1 END) as male_students,
            COUNT(CASE WHEN s.gender = 'Female' THEN 1 END) as female_students,
            COUNT(CASE WHEN s.boarding_status = 'Full Boarding' THEN 1 END) as boarders,
            COUNT(CASE WHEN s.boarding_status = 'Day Student' THEN 1 END) as day_students,
            COALESCE(AVG(a.balance), 0) as avg_outstanding_fees,
            COUNT(CASE WHEN a.balance > 0 THEN 1 END) as students_with_arrears,
            ROUND((COUNT(CASE WHEN a.balance = 0 THEN 1 END) / COUNT(*)) * 100, 2) as full_payment_rate
        FROM students s
        LEFT JOIN accounts_account a ON s.account_id = a.id
        WHERE s.branch_id = %(branch_id)s
          AND s.is_active = TRUE
          AND (%(class_name)s IS NULL OR s.class_name = %(class_name)s)
        GROUP BY s.class_name
        ORDER BY s.class_name
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Student Enrollment",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Student enrollment statistics and demographics",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "class_name": {"type": "select", "label": "Class (Optional)", "required": False,
                                  "options": ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
                                             "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "class_name", "label": "Class", "type": "text", "width": 120},
                {"name": "total_students", "label": "Total", "type": "number", "width": 100, "aggregate": "SUM"},
                {"name": "male_students", "label": "Male", "type": "number", "width": 80},
                {"name": "female_students", "label": "Female", "type": "number", "width": 80},
                {"name": "boarders", "label": "Boarders", "type": "number", "width": 100},
                {"name": "day_students", "label": "Day", "type": "number", "width": 80},
                {"name": "avg_outstanding_fees", "label": "Avg Arrears", "type": "money", "width": 130},
                {"name": "students_with_arrears", "label": "With Arrears", "type": "number", "width": 120},
                {"name": "full_payment_rate", "label": "Payment %", "type": "number", "width": 120}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="bar",
                title="Enrollment by Class",
                x_axis_column="class_name",
                y_axis_column="total_students",
                sort_order=1
            )
        
        return report

    def create_fee_collection_performance_report(self, tenant, owner, branch):
        """Fee Collection Performance Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            DATE_FORMAT(fs.created_at, '%%Y-%%m') as month,
            fs.form_data->>'$.fee_type' as fee_type,
            COUNT(*) as payment_count,
            COALESCE(SUM(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))), 0) as total_collected,
            AVG(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))) as average_payment,
            COUNT(DISTINCT fs.form_data->>'$.student_id') as unique_students,
            COALESCE(SUM(CASE WHEN fs.form_data->>'$.payment_method' = 'Cash' THEN CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2)) END), 0) as cash_collections,
            COALESCE(SUM(CASE WHEN fs.form_data->>'$.payment_method' = 'Bank Transfer' THEN CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2)) END), 0) as bank_collections
        FROM automations_formsubmission fs
        JOIN automations_formschema f ON fs.form_id = f.id
        WHERE f.name = 'Fee Payment'
          AND fs.branch_id = %(branch_id)s
          AND DATE(fs.created_at) BETWEEN %(start_date)s AND %(end_date)s
          AND fs.status = 'APPROVED'
        GROUP BY DATE_FORMAT(fs.created_at, '%%Y-%%m'), fs.form_data->>'$.fee_type'
        ORDER BY month DESC, total_collected DESC
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Fee Collection Performance",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Fee collection trends and payment method analysis",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True
            }
        )
        
        if created:
            columns_data = [
                {"name": "month", "label": "Month", "type": "text", "width": 120},
                {"name": "fee_type", "label": "Fee Type", "type": "text", "width": 150},
                {"name": "payment_count", "label": "Count", "type": "number", "width": 100},
                {"name": "total_collected", "label": "Total", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "average_payment", "label": "Average", "type": "money", "width": 130},
                {"name": "unique_students", "label": "Students", "type": "number", "width": 100},
                {"name": "cash_collections", "label": "Cash", "type": "money", "width": 130},
                {"name": "bank_collections", "label": "Bank", "type": "money", "width": 130}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="line",
                title="Collection Trend",
                x_axis_column="month",
                y_axis_column="total_collected",
                sort_order=1
            )
        
        return report

    def create_cash_position_report(self, tenant, owner, branch):
        """Cash Position Report"""
        
        category, _ = ReportCategory.objects.get_or_create(
            name="Management Reports",
            owner=owner,
            branch=branch,
            defaults={"description": "Executive and management level reports"}
        )
        
        query = """
        SELECT 
            a.account_name,
            a.account_code,
            COALESCE(a.balance, 0) as current_balance,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount END), 0) as total_inflows,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount END), 0) as total_outflows,
            COUNT(t.id) as transaction_count,
            MAX(t.transaction_date) as last_transaction_date
        FROM accounts_account a
        LEFT JOIN accounts_transaction t ON a.id = t.account_id
            AND t.transaction_date BETWEEN %(start_date)s AND %(end_date)s
        WHERE a.branch_id = %(branch_id)s
          AND a.account_code LIKE '11%'
          AND a.is_active = TRUE
        GROUP BY a.account_name, a.account_code, a.balance
        ORDER BY a.account_code
        """
        
        report, created = ReportTemplate.objects.get_or_create(
            name="Cash Position",
            owner=owner,
            branch=branch,
            defaults={
                "description": "Current cash and bank account balances",
                "category": category,
                "query": query,
                "parameters": json.dumps({
                    "start_date": {"type": "date", "label": "Start Date", "required": True},
                    "end_date": {"type": "date", "label": "End Date", "required": True},
                    "branch_id": {"type": "hidden", "default": "current_branch"}
                }),
                "is_active": True,
                "allow_export": True,
                "cache_duration": 600
            }
        )
        
        if created:
            columns_data = [
                {"name": "account_code", "label": "Account Code", "type": "text", "width": 120},
                {"name": "account_name", "label": "Account Name", "type": "text", "width": 200},
                {"name": "current_balance", "label": "Balance", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "total_inflows", "label": "Inflows", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "total_outflows", "label": "Outflows", "type": "money", "width": 150, "aggregate": "SUM"},
                {"name": "transaction_count", "label": "Transactions", "type": "number", "width": 120},
                {"name": "last_transaction_date", "label": "Last Activity", "type": "date", "width": 130}
            ]
            
            for col_data in columns_data:
                ReportColumn.objects.create(report=report, **col_data)
            
            ReportChart.objects.create(
                report=report,
                chart_type="pie",
                title="Cash Distribution",
                x_axis_column="account_name",
                y_axis_column="current_balance",
                sort_order=1
            )
        
        return report

    def create_role_based_dashboards(self, tenant, owner, branch, roles, accounts):
        """Create intuitive dashboards for each role"""
        
        self.stdout.write('   Building role-specific dashboards...')
        
        dashboards_created = {}
        
        # Dashboard configurations for each role
        dashboard_configs = {
            'CEO/Director': {
                'name': 'Executive Dashboard',
                'slug': 'executive_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Total Income', 'position': '0,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Total Expenses', 'position': '3,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Net Profit', 'position': '6,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Student Count', 'position': '9,0', 'size': '3x2'},
                    {'type': 'chart', 'title': 'Income vs Expenses', 'position': '0,2', 'size': '6x4'},
                    {'type': 'chart', 'title': 'Fee Collection Rate', 'position': '6,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Top Expenses', 'position': '0,6', 'size': '6x3'},
                    {'type': 'table', 'title': 'Outstanding Fees', 'position': '6,6', 'size': '6x3'},
                ]
            },
            'Accountant': {
                'name': 'Accountant Dashboard',
                'slug': 'accountant_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Cash Balance', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Accounts Receivable', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Accounts Payable', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'Recent Transactions', 'position': '0,2', 'size': '12x4'},
                    {'type': 'table', 'title': 'Unreconciled Items', 'position': '0,6', 'size': '6x3'},
                    {'type': 'chart', 'title': 'Monthly Cash Flow', 'position': '6,6', 'size': '6x3'},
                ]
            },
            'Bursar': {
                'name': 'Bursar Dashboard',
                'slug': 'bursar_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Today\'s Collections', 'position': '0,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Outstanding Fees', 'position': '3,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Pending Approvals', 'position': '6,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Cash on Hand', 'position': '9,0', 'size': '3x2'},
                    {'type': 'table', 'title': 'Recent Payments', 'position': '0,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Defaulters List', 'position': '6,2', 'size': '6x4'},
                    {'type': 'chart', 'title': 'Collection Trends', 'position': '0,6', 'size': '12x3'},
                ]
            },
            'Auditor': {
                'name': 'Auditor Dashboard',
                'slug': 'auditor_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Audit Issues', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Variance Amount', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Compliance Score', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'Audit Trail', 'position': '0,2', 'size': '12x5'},
                    {'type': 'chart', 'title': 'Variance Analysis', 'position': '0,7', 'size': '12x3'},
                ]
            },
            'HR Manager': {
                'name': 'HR Dashboard',
                'slug': 'hr_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Total Staff', 'position': '0,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Present Today', 'position': '3,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'On Leave', 'position': '6,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Payroll Amount', 'position': '9,0', 'size': '3x2'},
                    {'type': 'table', 'title': 'Staff Attendance', 'position': '0,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Leave Requests', 'position': '6,2', 'size': '6x4'},
                    {'type': 'chart', 'title': 'Department Distribution', 'position': '0,6', 'size': '6x3'},
                    {'type': 'chart', 'title': 'Salary Distribution', 'position': '6,6', 'size': '6x3'},
                ]
            },
            'Procurement Officer': {
                'name': 'Procurement Dashboard',
                'slug': 'procurement_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Pending Requisitions', 'position': '0,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Open POs', 'position': '3,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'This Month Spend', 'position': '6,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Active Suppliers', 'position': '9,0', 'size': '3x2'},
                    {'type': 'table', 'title': 'Pending Approvals', 'position': '0,2', 'size': '12x4'},
                    {'type': 'chart', 'title': 'Spend by Category', 'position': '0,6', 'size': '6x3'},
                    {'type': 'table', 'title': 'Top Suppliers', 'position': '6,6', 'size': '6x3'},
                ]
            },
            'Store Keeper': {
                'name': 'Storekeeper Dashboard',
                'slug': 'storekeeper_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Items in Stock', 'position': '0,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Low Stock Items', 'position': '3,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Pending Receipts', 'position': '6,0', 'size': '3x2'},
                    {'type': 'kpi', 'title': 'Total Value', 'position': '9,0', 'size': '3x2'},
                    {'type': 'table', 'title': 'Stock Movement', 'position': '0,2', 'size': '12x4'},
                    {'type': 'table', 'title': 'Reorder List', 'position': '0,6', 'size': '6x3'},
                    {'type': 'chart', 'title': 'Stock by Category', 'position': '6,6', 'size': '6x3'},
                ]
            },
            'Academic Staff': {
                'name': 'Teacher Dashboard',
                'slug': 'teacher_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'My Classes', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Total Students', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Attendance Rate', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'Today\'s Classes', 'position': '0,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Pending Assessments', 'position': '6,2', 'size': '6x4'},
                    {'type': 'chart', 'title': 'Class Performance', 'position': '0,6', 'size': '12x3'},
                ]
            },
            'Admin Staff': {
                'name': 'Admin Dashboard',
                'slug': 'admin_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'New Registrations', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Pending Documents', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Tasks Today', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'Recent Activities', 'position': '0,2', 'size': '12x5'},
                    {'type': 'table', 'title': 'Upcoming Events', 'position': '0,7', 'size': '12x3'},
                ]
            },
            'Student': {
                'name': 'Student Portal',
                'slug': 'student_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'My Fees', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Outstanding', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Attendance', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'My Grades', 'position': '0,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Payment History', 'position': '6,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'My Timetable', 'position': '0,6', 'size': '12x3'},
                ]
            },
            'Parent/Guardian': {
                'name': 'Parent Portal',
                'slug': 'parent_dashboard',
                'widgets': [
                    {'type': 'kpi', 'title': 'Ward\'s Fees', 'position': '0,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Outstanding', 'position': '4,0', 'size': '4x2'},
                    {'type': 'kpi', 'title': 'Attendance', 'position': '8,0', 'size': '4x2'},
                    {'type': 'table', 'title': 'Ward\'s Grades', 'position': '0,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Payment History', 'position': '6,2', 'size': '6x4'},
                    {'type': 'table', 'title': 'Messages', 'position': '0,6', 'size': '12x3'},
                ]
            },
        }
        
        for role_name, config in dashboard_configs.items():
            dashboard, created = Dashboard.objects.get_or_create(
                name=config['name'],
                slug=config['slug'],
                owner=owner,
                branch=branch,
                defaults={
                    'description': f'Dashboard for {role_name}',
                    'is_default': False,
                    'is_active': True
                }
            )
            
            dashboards_created[role_name] = dashboard
            
            # Create widgets for this dashboard
            if created:
                self.create_dashboard_widgets(dashboard, config['widgets'], owner, branch)
            
            status = '✓' if created else '→'
            self.stdout.write(f'   {status} {config["name"]}')
        
        self.stdout.write(f'\n   Created {len(dashboards_created)} dashboards')
        return dashboards_created

    def create_dashboard_widgets(self, dashboard, widget_configs, owner, branch):
        """Create widgets with data sources for a dashboard"""
        
        for idx, widget_config in enumerate(widget_configs):
            # Parse position and size
            position = widget_config['position'].split(',')
            size = widget_config['size'].split('x')
            
            # Generate unique instance key
            instance_key = f"{dashboard.slug}_{widget_config['type']}_{idx}"
            
            # Create widget with layout info in config
            widget = Widget.objects.create(
                dashboard=dashboard,
                title=widget_config['title'],
                widget_type=widget_config['type'],
                instance_key=instance_key,
                config={
                    "layout": {
                        "position_x": int(position[0]),
                        "position_y": int(position[1]),
                        "width": int(size[0]),
                        "height": int(size[1]),
                        "sort_order": idx
                    },
                    "display": {
                        "title": widget_config['title'],
                        "show_title": True,
                        "show_border": True
                    }
                },
                owner=owner,
                branch=branch
            )
            
            # Add data source based on widget title
            self.create_widget_data_source(widget, widget_config['title'], owner, branch)

    def create_widget_data_source(self, widget, title, owner, branch):
        """Create data source configuration for widget"""
        
        # Widget data source mappings
        data_source_configs = {
            # Executive Dashboard
            'Total Income': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_type = 'INCOME'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Total Expenses': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_type = 'EXPENSE'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Net Profit': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        COALESCE((
                            SELECT SUM(balance) FROM accounts_account 
                            WHERE branch_id = %(branch_id)s AND account_type = 'INCOME'
                        ), 0) - COALESCE((
                            SELECT SUM(balance) FROM accounts_account 
                            WHERE branch_id = %(branch_id)s AND account_type = 'EXPENSE'
                        ), 0) as value
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Student Count': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM students
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Income vs Expenses': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE_FORMAT(t.transaction_date, '%%Y-%%m') as label,
                        SUM(CASE WHEN a.account_type = 'INCOME' THEN t.amount ELSE 0 END) as income,
                        SUM(CASE WHEN a.account_type = 'EXPENSE' THEN t.amount ELSE 0 END) as expense
                    FROM accounts_transaction t
                    JOIN accounts_account a ON t.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                      AND t.transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
                    GROUP BY DATE_FORMAT(t.transaction_date, '%%Y-%%m')
                    ORDER BY label
                ''',
                'chart_type': 'line'
            },
            'Fee Collection Rate': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE_FORMAT(fs.created_at, '%%Y-%%m') as label,
                        COALESCE(SUM(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))), 0) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Fee Payment'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 6 MONTH)
                      AND fs.status = 'APPROVED'
                    GROUP BY DATE_FORMAT(fs.created_at, '%%Y-%%m')
                    ORDER BY label
                ''',
                'chart_type': 'bar'
            },
            'Top Expenses': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        ac.name as category,
                        COALESCE(SUM(t.amount), 0) as amount
                    FROM accounts_transaction t
                    JOIN accounts_account a ON t.account_id = a.id
                    JOIN accounts_accountcategory ac ON a.category_id = ac.id
                    WHERE a.branch_id = %(branch_id)s
                      AND a.account_type = 'EXPENSE'
                      AND t.transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH)
                    GROUP BY ac.name
                    ORDER BY amount DESC
                    LIMIT 10
                '''
            },
            'Outstanding Fees': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        s.student_id,
                        s.student_name,
                        s.class_name,
                        COALESCE(a.balance, 0) as amount
                    FROM students s
                    JOIN accounts_account a ON s.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                      AND a.balance > 0
                    ORDER BY a.balance DESC
                    LIMIT 20
                '''
            },
            
            # Accountant Dashboard
            'Cash Balance': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_code LIKE '11%%'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Accounts Receivable': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_code LIKE '12%%'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Accounts Payable': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_code LIKE '21%%'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Recent Transactions': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE(t.transaction_date) as date,
                        a.account_code,
                        a.account_name,
                        t.description,
                        t.amount
                    FROM accounts_transaction t
                    JOIN accounts_account a ON t.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                    ORDER BY t.transaction_date DESC
                    LIMIT 50
                '''
            },
            'Unreconciled Items': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        t.reference_number,
                        t.description,
                        t.amount,
                        DATEDIFF(CURRENT_DATE, t.transaction_date) as days_old
                    FROM accounts_transaction t
                    JOIN accounts_account a ON t.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                      AND t.is_reconciled = FALSE
                    ORDER BY days_old DESC
                    LIMIT 30
                '''
            },
            'Monthly Cash Flow': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE_FORMAT(t.transaction_date, '%%Y-%%m') as label,
                        SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END) as inflow,
                        SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END) as outflow
                    FROM accounts_transaction t
                    JOIN accounts_account a ON t.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                      AND a.account_code LIKE '11%%'
                      AND t.transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(t.transaction_date, '%%Y-%%m')
                    ORDER BY label
                ''',
                'chart_type': 'line'
            },
            
            # Bursar Dashboard
            "Today's Collections": {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))), 0) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Fee Payment'
                      AND fs.branch_id = %(branch_id)s
                      AND DATE(fs.created_at) = CURRENT_DATE
                      AND fs.status = 'APPROVED'
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Pending Approvals': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE fs.branch_id = %(branch_id)s
                      AND fs.status = 'PENDING'
                      AND f.name IN ('Fee Payment', 'Expense Request', 'Payment Voucher')
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Cash on Hand': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(balance), 0) as value
                    FROM accounts_account
                    WHERE branch_id = %(branch_id)s
                      AND account_code = '1110'
                      AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Recent Payments': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE(fs.created_at) as date,
                        fs.form_data->>'$.student_name' as student,
                        fs.form_data->>'$.fee_type' as fee_type,
                        CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2)) as amount,
                        fs.form_data->>'$.payment_method' as method
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Fee Payment'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.status = 'APPROVED'
                    ORDER BY fs.created_at DESC
                    LIMIT 30
                '''
            },
            'Defaulters List': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        s.student_id,
                        s.student_name,
                        s.class_name,
                        COALESCE(a.balance, 0) as outstanding,
                        s.parent_phone
                    FROM students s
                    JOIN accounts_account a ON s.account_id = a.id
                    WHERE a.branch_id = %(branch_id)s
                      AND a.balance > 0
                    ORDER BY a.balance DESC
                    LIMIT 50
                '''
            },
            'Collection Trends': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE(fs.created_at) as label,
                        COALESCE(SUM(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))), 0) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Fee Payment'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                      AND fs.status = 'APPROVED'
                    GROUP BY DATE(fs.created_at)
                    ORDER BY label
                ''',
                'chart_type': 'line'
            },
            
            # HR Dashboard
            'Total Staff': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM staff
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Present Today': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM staff_attendance
                    WHERE branch_id = %(branch_id)s
                      AND attendance_date = CURRENT_DATE
                      AND status = 'PRESENT'
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'On Leave': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM staff_attendance
                    WHERE branch_id = %(branch_id)s
                      AND attendance_date = CURRENT_DATE
                      AND status = 'ON_LEAVE'
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Payroll Amount': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(salary_amount), 0) as value
                    FROM staff
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Staff Attendance': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        s.staff_id,
                        CONCAT(s.first_name, ' ', s.last_name) as name,
                        s.department,
                        COALESCE(AVG(CASE WHEN a.status = 'PRESENT' THEN 100 ELSE 0 END), 0) as rate
                    FROM staff s
                    LEFT JOIN staff_attendance a ON s.id = a.staff_id
                        AND a.attendance_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                    WHERE s.branch_id = %(branch_id)s AND s.is_active = TRUE
                    GROUP BY s.staff_id, s.first_name, s.last_name, s.department
                    ORDER BY rate DESC
                    LIMIT 30
                '''
            },
            'Leave Requests': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        DATE(fs.created_at) as date,
                        fs.form_data->>'$.staff_name' as staff,
                        fs.form_data->>'$.leave_type' as type,
                        fs.form_data->>'$.days_requested' as days,
                        fs.status
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Leave Request'
                      AND fs.branch_id = %(branch_id)s
                    ORDER BY fs.created_at DESC
                    LIMIT 30
                '''
            },
            'Department Distribution': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        department as label,
                        COUNT(*) as value
                    FROM staff
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                    GROUP BY department
                ''',
                'chart_type': 'pie'
            },
            'Salary Distribution': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        department as label,
                        COALESCE(SUM(salary_amount), 0) as value
                    FROM staff
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                    GROUP BY department
                ''',
                'chart_type': 'bar'
            },
            
            # Procurement Dashboard
            'Pending Requisitions': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Purchase Requisition'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.status = 'PENDING'
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Open POs': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM purchase_orders
                    WHERE branch_id = %(branch_id)s
                      AND status IN ('APPROVED', 'PARTIAL')
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'This Month Spend': {
                'source_type': 'query',
                'query': '''
                    SELECT COALESCE(SUM(CAST(fs.form_data->>'$.total_amount' AS DECIMAL(10,2))), 0) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Purchase Requisition'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.status = 'APPROVED'
                      AND MONTH(fs.created_at) = MONTH(CURRENT_DATE)
                      AND YEAR(fs.created_at) = YEAR(CURRENT_DATE)
                ''',
                'value_field': 'value',
                'format': 'currency'
            },
            'Active Suppliers': {
                'source_type': 'query',
                'query': '''
                    SELECT COUNT(*) as value
                    FROM suppliers
                    WHERE branch_id = %(branch_id)s AND is_active = TRUE
                ''',
                'value_field': 'value',
                'format': 'number'
            },
            'Spend by Category': {
                'source_type': 'query',
                'query': '''
                    SELECT 
                        fs.form_data->>'$.expense_type' as label,
                        COALESCE(SUM(CAST(fs.form_data->>'$.amount' AS DECIMAL(10,2))), 0) as value
                    FROM automations_formsubmission fs
                    JOIN automations_formschema f ON fs.form_id = f.id
                    WHERE f.name = 'Expense Request'
                      AND fs.branch_id = %(branch_id)s
                      AND fs.status = 'APPROVED'
                      AND fs.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH)
                    GROUP BY fs.form_data->>'$.expense_type'
                ''',
                'chart_type': 'pie'
            },
        }
        
        # Get data source config
        config = data_source_configs.get(title)
        if config:
            # Generate unique identifier
            identifier = title.lower().replace(' ', '-')
            
            # Prepare source_config based on type
            source_config = {}
            if config['source_type'] == 'query':
                source_config = {
                    "query": config.get('query', ''),
                    "parameters": {'branch_id': {'type': 'hidden', 'default': 'current_branch'}}
                }
            
            # Create data source
            data_source, created = WidgetDataSource.objects.get_or_create(
                identifier=identifier,
                owner=owner,
                branch=branch,
                defaults={
                    "name": title,
                    "source_type": config['source_type'],
                    "source_config": source_config,
                    "cache_enabled": True,
                    "cache_duration": config.get('cache_duration', 300),
                    "is_active": True
                }
            )
            
            # Link data source to widget
            widget.data_source = data_source
            widget.save(update_fields=['data_source'])

    def assign_dashboards_to_roles(self, roles, dashboards):
        """Assign default dashboards to roles"""
        
        self.stdout.write('\n   Assigning dashboards to roles...')
        
        for role_name, role in roles.items():
            if role_name in dashboards:
                dashboard = dashboards[role_name]
                role.default_dashboard = dashboard
                role.can_access_dashboards = [dashboard.id]
                role.save()
                self.stdout.write(f'   ✓ {role_name} → {dashboard.name}')

    def print_summary(self, tenant, branch, owner, roles, accounts, modules, forms, reports, dashboards):
        """Print initialization summary"""
        
        self.stdout.write('\n📊 INITIALIZATION SUMMARY')
        self.stdout.write('─' * 70)
        self.stdout.write(f'   Tenant:      {tenant.name}')
        self.stdout.write(f'   Branch:      {branch.name}')
        self.stdout.write(f'   Owner:       {owner.get_full_name()} ({owner.email})')
        self.stdout.write('')
        self.stdout.write(f'   Roles:       {len(roles)} created')
        self.stdout.write(f'   Accounts:    {len(accounts)} created')
        self.stdout.write(f'   Modules:     {len(modules)} created')
        self.stdout.write(f'   Forms:       {len(forms)} created')
        self.stdout.write(f'   Reports:     {len(reports)} created')
        self.stdout.write(f'   Dashboards:  {len(dashboards)} created')
        self.stdout.write('─' * 70)

    def print_next_steps(self, tenant, owner, options):
        """Print next steps"""
        
        self.stdout.write('\n📝 NEXT STEPS')
        self.stdout.write('─' * 70)
        self.stdout.write('   1. Login with system administrator credentials')
        
        if options.get('organization'):
            self.stdout.write(f'      Username: {options.get("admin_username", "admin")}')
            self.stdout.write(f'      Password: {options.get("admin_password", "admin123")}')
        
        self.stdout.write('')
        self.stdout.write('   2. Create users and assign roles')
        self.stdout.write('      → Navigate to User Management')
        self.stdout.write('      → Create users for each department')
        self.stdout.write('      → Assign appropriate roles')
        self.stdout.write('')
        self.stdout.write('   3. Configure system settings')
        self.stdout.write('      → Set up email notifications')
        self.stdout.write('      → Configure payment gateways')
        self.stdout.write('      → Customize workflows')
        self.stdout.write('')
        self.stdout.write('   4. Import/Enter data')
        self.stdout.write('      → Import student records')
        self.stdout.write('      → Set up fee structures')
        self.stdout.write('      → Enter opening balances')
        self.stdout.write('─' * 70)
        self.stdout.write('')
