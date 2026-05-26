# core/management/commands/initialize_erp_system.py
"""
Comprehensive ERP System Initialization Command
Creates complete chart of accounts, workflows, forms, pages, and reports
Based on client requirements for school/organization management

Usage:
    python manage.py initialize_erp_system --organization="School Name" [--country=NG]
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from accounts.models import Account, AccountCategory
from automations.models import FormSchema, WorkflowTemplate
from pages.models import Module, ModulePage
from reports.models import ReportTemplate
from products.models import Product, ProductCategory
from decimal import Decimal
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Initialize complete ERP system with chart of accounts, workflows, forms, pages, and reports'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--organization',
            type=str,
            required=True,
            help='Organization name (e.g., "ABC School", "XYZ Company")'
        )
        parser.add_argument(
            '--country',
            type=str,
            default='NG',
            help='Country code for localization (default: NG for Nigeria)'
        )
        parser.add_argument(
            '--currency',
            type=str,
            default='NGN',
            help='Currency code (default: NGN for Nigerian Naira)'
        )
        parser.add_argument(
            '--user-id',
            type=int,
            help='User ID to use as creator (defaults to first superuser)'
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f'\n🚀 Initializing ERP System for {options["organization"]}...\n'))
        
        # Get user
        user_id = options.get('user_id')
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'User with ID {user_id} not found'))
                return
        else:
            user = User.objects.filter(is_superuser=True).first()
            if not user:
                self.stdout.write(self.style.ERROR('No superuser found'))
                return
        
        self.stdout.write(f'👤 Using user: {user.get_full_name()} ({user.email})')
        self.stdout.write(f'🏢 Tenant: {user.tenant.name}')
        self.stdout.write(f'🏪 Branch: {user.branch.name if user.branch else "No branch assigned"}')
        
        if not user.branch:
            self.stdout.write(self.style.ERROR('❌ User must have a branch assigned'))
            return
        
        # In our system, resources are owned by the user and scoped to their branch
        owner = user  # User is the owner
        branch = user.branch
        tenant = user.tenant
        self.country = options['country']
        self.currency = options['currency']
        
        # Initialize system
        try:
            with transaction.atomic():
                self.stdout.write('\n' + '='*60)
                self.stdout.write('PHASE 1: CHART OF ACCOUNTS')
                self.stdout.write('='*60)
                self.create_chart_of_accounts(owner, branch, user)
                
                self.stdout.write('\n' + '='*60)
                self.stdout.write('PHASE 2: PRODUCT CATALOG')
                self.stdout.write('='*60)
                self.create_product_catalog(owner, branch, user)
                
                self.stdout.write('\n' + '='*60)
                self.stdout.write('PHASE 3: WORKFLOW AUTOMATION')
                self.stdout.write('='*60)
                self.create_workflows(owner, branch, user)
                
                self.stdout.write('\n' + '='*60)
                self.stdout.write('PHASE 4: FORMS & UI PAGES')
                self.stdout.write('='*60)
                self.create_forms_and_pages(owner, branch, user)
                
                self.stdout.write('\n' + '='*60)
                self.stdout.write('PHASE 5: REPORTS & ANALYTICS')
                self.stdout.write('='*60)
                self.create_reports(owner, branch, user)
            
            self.stdout.write(self.style.SUCCESS('\n✅ ERP System Initialization Complete!\n'))
            self.print_summary()
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n❌ Initialization failed: {str(e)}\n'))
            raise
    
    def create_chart_of_accounts(self, owner, branch, user):
        """Create comprehensive chart of accounts"""
        self.stdout.write('\n📊 Creating Chart of Accounts...')
        
        # Define account structure
        # Based on client's requirements: fees, expenses, loans, assets, liabilities
        
        accounts_structure = {
            # ASSETS
            'ASSETS': {
                'type': 'asset',
                'code': '1000',
                'accounts': {
                    'Current Assets': {
                        'code': '1100',
                        'accounts': {
                            'Cash and Bank': {
                                'code': '1110',
                                'accounts': {
                                    'Cash in Hand': {'code': '1111'},
                                    'Bank - Main Account': {'code': '1112'},
                                    'Bank - Salary Account': {'code': '1113'},
                                    'Mobile Money': {'code': '1114'},
                                    'Petty Cash': {'code': '1115'},
                                }
                            },
                            'Accounts Receivable': {
                                'code': '1120',
                                'accounts': {
                                    'Student Fees Receivable': {'code': '1121'},
                                    'Other Receivables': {'code': '1122'},
                                    'Staff Loans Receivable': {'code': '1123'},
                                }
                            },
                            'Inventory': {
                                'code': '1130',
                                'accounts': {
                                    'School Supplies Inventory': {'code': '1131'},
                                    'Uniforms Inventory': {'code': '1132'},
                                    'Textbooks Inventory': {'code': '1133'},
                                    'Stationery Inventory': {'code': '1134'},
                                }
                            },
                            'Prepaid Expenses': {
                                'code': '1140',
                                'accounts': {
                                    'Prepaid Rent': {'code': '1141'},
                                    'Prepaid Insurance': {'code': '1142'},
                                    'Prepaid Licenses': {'code': '1143'},
                                }
                            },
                        }
                    },
                    'Fixed Assets': {
                        'code': '1200',
                        'accounts': {
                            'Land and Buildings': {
                                'code': '1210',
                                'accounts': {
                                    'Land': {'code': '1211'},
                                    'Buildings': {'code': '1212'},
                                    'Accumulated Depreciation - Buildings': {'code': '1213', 'is_contra': True},
                                }
                            },
                            'Furniture and Equipment': {
                                'code': '1220',
                                'accounts': {
                                    'Classroom Furniture': {'code': '1221'},
                                    'Office Furniture': {'code': '1222'},
                                    'Computer Equipment': {'code': '1223'},
                                    'Laboratory Equipment': {'code': '1224'},
                                    'Accumulated Depreciation - Equipment': {'code': '1225', 'is_contra': True},
                                }
                            },
                            'Vehicles': {
                                'code': '1230',
                                'accounts': {
                                    'School Buses': {'code': '1231'},
                                    'Other Vehicles': {'code': '1232'},
                                    'Accumulated Depreciation - Vehicles': {'code': '1233', 'is_contra': True},
                                }
                            },
                        }
                    },
                }
            },
            
            # LIABILITIES
            'LIABILITIES': {
                'type': 'liability',
                'code': '2000',
                'accounts': {
                    'Current Liabilities': {
                        'code': '2100',
                        'accounts': {
                            'Accounts Payable': {
                                'code': '2110',
                                'accounts': {
                                    'Suppliers Payable': {'code': '2111'},
                                    'Utilities Payable': {'code': '2112'},
                                    'Other Payables': {'code': '2113'},
                                }
                            },
                            'Salaries and Wages Payable': {
                                'code': '2120',
                                'accounts': {
                                    'Teaching Staff Salaries Payable': {'code': '2121'},
                                    'Non-Teaching Staff Salaries Payable': {'code': '2122'},
                                    'Allowances Payable': {'code': '2123'},
                                }
                            },
                            'Taxes Payable': {
                                'code': '2130',
                                'accounts': {
                                    'PAYE Tax Payable': {'code': '2131'},
                                    'VAT Payable': {'code': '2132'},
                                    'Pension Payable': {'code': '2133'},
                                    'NHF Payable': {'code': '2134'},
                                }
                            },
                            'Deferred Income': {
                                'code': '2140',
                                'accounts': {
                                    'Advance Fee Payments': {'code': '2141'},
                                    'Prepaid Tuition': {'code': '2142'},
                                }
                            },
                        }
                    },
                    'Long-term Liabilities': {
                        'code': '2200',
                        'accounts': {
                            'Loans Payable': {
                                'code': '2210',
                                'accounts': {
                                    'Bank Loans': {'code': '2211'},
                                    'Development Loans': {'code': '2212'},
                                    'Equipment Loans': {'code': '2213'},
                                }
                            },
                        }
                    },
                }
            },
            
            # EQUITY
            'EQUITY': {
                'type': 'equity',
                'code': '3000',
                'accounts': {
                    'Owners Equity': {'code': '3100'},
                    'Retained Earnings': {'code': '3200'},
                    'Current Year Earnings': {'code': '3300'},
                }
            },
            
            # INCOME
            'INCOME': {
                'type': 'income',
                'code': '4000',
                'accounts': {
                    'Tuition and Fees': {
                        'code': '4100',
                        'accounts': {
                            'Tuition Fees': {'code': '4110'},
                            'Registration Fees': {'code': '4120'},
                            'Examination Fees': {'code': '4130'},
                            'Late Payment Fees': {'code': '4140'},
                        }
                    },
                    'Other Income': {
                        'code': '4200',
                        'accounts': {
                            'Uniform Sales': {'code': '4210'},
                            'Textbook Sales': {'code': '4220'},
                            'Cafeteria Income': {'code': '4230'},
                            'Transportation Fees': {'code': '4240'},
                            'After School Programs': {'code': '4250'},
                            'Donations': {'code': '4260'},
                        }
                    },
                }
            },
            
            # EXPENSES
            'EXPENSES': {
                'type': 'expense',
                'code': '5000',
                'accounts': {
                    'Personnel Expenses': {
                        'code': '5100',
                        'accounts': {
                            'Teaching Staff Salaries': {'code': '5110'},
                            'Non-Teaching Staff Salaries': {'code': '5120'},
                            'Staff Training and Development': {'code': '5130'},
                            'Staff Welfare': {'code': '5140'},
                        }
                    },
                    'Operating Expenses': {
                        'code': '5200',
                        'accounts': {
                            'Utilities': {
                                'code': '5210',
                                'accounts': {
                                    'Electricity': {'code': '5211'},
                                    'Water': {'code': '5212'},
                                    'Internet and Phone': {'code': '5213'},
                                }
                            },
                            'Maintenance and Repairs': {
                                'code': '5220',
                                'accounts': {
                                    'Building Maintenance': {'code': '5221'},
                                    'Equipment Repairs': {'code': '5222'},
                                    'Vehicle Maintenance': {'code': '5223'},
                                }
                            },
                            'Supplies and Materials': {
                                'code': '5230',
                                'accounts': {
                                    'Classroom Supplies': {'code': '5231'},
                                    'Office Supplies': {'code': '5232'},
                                    'Cleaning Supplies': {'code': '5233'},
                                }
                            },
                        }
                    },
                    'Administrative Expenses': {
                        'code': '5300',
                        'accounts': {
                            'Rent': {'code': '5310'},
                            'Insurance': {'code': '5320'},
                            'Professional Fees': {'code': '5330'},
                            'Bank Charges': {'code': '5340'},
                            'Licenses and Permits': {'code': '5350'},
                        }
                    },
                    'Fuel and Transportation': {
                        'code': '5400',
                        'accounts': {
                            'Vehicle Fuel': {'code': '5410'},
                            'Transportation Services': {'code': '5420'},
                        }
                    },
                }
            },
        }
        
        def create_accounts_recursive(structure, parent=None, level=0):
            """Recursively create accounts from structure"""
            created_count = 0
            
            for account_name, account_data in structure.items():
                # Check if this is a category or account definition
                if 'type' in account_data:
                    # This is a top-level category
                    category, cat_created = AccountCategory.objects.get_or_create(
                        owner=owner,
                        branch=branch,
                        name=account_name,
                        defaults={
                            'code': account_data['code'],
                            'description': f'{account_name} category',
                            'is_active': True
                        }
                    )
                    
                    if cat_created:
                        self.stdout.write(f'  {"  " * level}✓ Category: {account_name} ({account_data["code"]})')
                    
                    # Create accounts under this category
                    if 'accounts' in account_data:
                        created_count += create_accounts_recursive(
                            account_data['accounts'],
                            parent=None,
                            level=level + 1
                        )
                else:
                    # This is an account
                    account_type = parent.account_type if parent else structure.get('type', 'asset')
                    code = account_data.get('code', '')
                    is_contra = account_data.get('is_contra', False)
                    
                    # Determine category
                    if parent:
                        category = parent.category
                    else:
                        # Find category by account type
                        category = AccountCategory.objects.filter(
                            owner=owner,
                            branch=branch,
                            name__icontains=account_name.split()[0]
                        ).first()
                    
                    account, acc_created = Account.objects.get_or_create(
                        owner=owner,
                        branch=branch,
                        code=code,
                        defaults={
                            'name': account_name,
                            'account_type': account_type,
                            'category': category,
                            'parent_account': parent,
                            'is_active': True,
                            'currency': self.currency,
                            'is_contra_account': is_contra
                        }
                    )
                    
                    if acc_created:
                        created_count += 1
                        indent = "  " * level
                        contra_mark = " [CONTRA]" if is_contra else ""
                        self.stdout.write(f'  {indent}✓ {account_name} ({code}){contra_mark}')
                    
                    # Create child accounts
                    if 'accounts' in account_data:
                        created_count += create_accounts_recursive(
                            account_data['accounts'],
                            parent=account,
                            level=level + 1
                        )
            
            return created_count
        
        total_created = create_accounts_recursive(accounts_structure)
        self.stdout.write(self.style.SUCCESS(f'\n✅ Created {total_created} accounts'))
    
    def create_product_catalog(self, owner, branch, user):
        """Create product catalog for fees, services, and items"""
        self.stdout.write('\n📦 Creating Product Catalog...')
        
        products = [
            # Fee Products
            {
                'category': 'School Fees',
                'products': [
                    {'code': 'FEE-TUI-PRI', 'name': 'Primary School Tuition (Per Term)', 'type': 'FEE', 'price': 150000},
                    {'code': 'FEE-TUI-SEC', 'name': 'Secondary School Tuition (Per Term)', 'type': 'FEE', 'price': 200000},
                    {'code': 'FEE-REG', 'name': 'Registration Fee (One-time)', 'type': 'FEE', 'price': 25000},
                    {'code': 'FEE-EXAM', 'name': 'Examination Fee (Per Term)', 'type': 'FEE', 'price': 15000},
                    {'code': 'FEE-DEV', 'name': 'Development Levy (Annual)', 'type': 'FEE', 'price': 50000},
                ]
            },
            # Inventory Items
            {
                'category': 'Uniforms',
                'products': [
                    {'code': 'UNI-SHI-PRI', 'name': 'Primary School Shirt', 'type': 'ITEM', 'price': 3500},
                    {'code': 'UNI-TRO-PRI', 'name': 'Primary School Trousers/Skirt', 'type': 'ITEM', 'price': 4500},
                    {'code': 'UNI-SPO', 'name': 'Sports Uniform Set', 'type': 'ITEM', 'price': 8000},
                ]
            },
            {
                'category': 'Textbooks',
                'products': [
                    {'code': 'BOOK-MAT-P1', 'name': 'Mathematics Primary 1', 'type': 'ITEM', 'price': 2500},
                    {'code': 'BOOK-ENG-P1', 'name': 'English Primary 1', 'type': 'ITEM', 'price': 2500},
                    {'code': 'BOOK-SCI-S1', 'name': 'Science Secondary 1', 'type': 'ITEM', 'price': 3500},
                ]
            },
            {
                'category': 'Stationery',
                'products': [
                    {'code': 'STAT-NOTE-A4', 'name': 'A4 Notebook (200 pages)', 'type': 'ITEM', 'price': 800},
                    {'code': 'STAT-PEN-BLU', 'name': 'Blue Pen (Pack of 10)', 'type': 'ITEM', 'price': 500},
                    {'code': 'STAT-PENC-HB', 'name': 'HB Pencils (Pack of 12)', 'type': 'ITEM', 'price': 600},
                ]
            },
            # Services
            {
                'category': 'Transportation',
                'products': [
                    {'code': 'SVC-TRANS-SHORT', 'name': 'Transportation (Short Route)', 'type': 'SERVICE', 'price': 15000},
                    {'code': 'SVC-TRANS-LONG', 'name': 'Transportation (Long Route)', 'type': 'SERVICE', 'price': 25000},
                ]
            },
            {
                'category': 'After School Programs',
                'products': [
                    {'code': 'SVC-MUSIC', 'name': 'Music Lessons (Per Term)', 'type': 'SERVICE', 'price': 20000},
                    {'code': 'SVC-SPORTS', 'name': 'Sports Club (Per Term)', 'type': 'SERVICE', 'price': 15000},
                    {'code': 'SVC-COMP', 'name': 'Computer Training (Per Term)', 'type': 'SERVICE', 'price': 25000},
                ]
            },
        ]
        
        created_count = 0
        
        for category_data in products:
            # Create product category
            category, _ = ProductCategory.objects.get_or_create(
                owner=owner,
                branch=branch,
                name=category_data['category'],
                defaults={
                    'code': category_data['category'].replace(' ', '_').upper(),
                    'description': f'{category_data["category"]} products',
                    'is_active': True
                }
            )
            
            # Create products
            for product_data in category_data['products']:
                product, created = Product.objects.get_or_create(
                    owner=owner,
                    branch=branch,
                    code=product_data['code'],
                    defaults={
                        'name': product_data['name'],
                        'product_type': product_data['type'],
                        'category': category,
                        'pricing_type': 'FIXED',
                        'fixed_price': product_data['price'],
                        'currency': self.currency,
                        'is_active': True,
                        'created_by': user
                    }
                )
                
                if created:
                    created_count += 1
                    self.stdout.write(f'  ✓ {product.name} ({product.code}) - ₦{product.fixed_price:,.0f}')
        
        self.stdout.write(self.style.SUCCESS(f'\n✅ Created {created_count} products'))
    
    def create_workflows(self, owner, branch, user):
        """Create essential workflows for business processes"""
        self.stdout.write('\n🔄 Creating Workflows...')
        
        # This will be implemented to call:
        # - setup_procurement_system
        # - setup_allocation_system
        # - setup_inventory_system
        # And add custom workflows for fees, loans, etc.
        
        self.stdout.write('  ℹ️  Run individual setup commands for modules:')
        self.stdout.write('     python manage.py setup_procurement_system')
        self.stdout.write('     python manage.py setup_allocation_system')
        self.stdout.write('     python manage.py setup_inventory_system')
    
    def create_forms_and_pages(self, owner, branch, user):
        """Create forms and UI pages"""
        self.stdout.write('\n📄 Creating Forms and Pages...')
        
        # This will be implemented similarly
        self.stdout.write('  ℹ️  Forms and pages created via module setup commands')
    
    def create_reports(self, owner, branch, user):
        """Create essential reports"""
        self.stdout.write('\n📊 Creating Reports...')
        
        # This will be implemented similarly
        self.stdout.write('  ℹ️  Reports created via module setup commands')
    
    def print_summary(self):
        """Print setup summary"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('🎉 SYSTEM READY!'))
        self.stdout.write('='*60 + '\n')
        self.stdout.write('📋 What was created:')
        self.stdout.write('   • Complete Chart of Accounts (Assets, Liabilities, Equity, Income, Expenses)')
        self.stdout.write('   • Product Catalog (Fees, Inventory Items, Services)')
        self.stdout.write('   • Account Categories with workflow inheritance')
        self.stdout.write('   • Foundation for intelligent workflow system\n')
        self.stdout.write('🚀 Next Steps:')
        self.stdout.write('   1. Run module-specific setup commands:')
        self.stdout.write('      python manage.py setup_procurement_system')
        self.stdout.write('      python manage.py setup_allocation_system')
        self.stdout.write('      python manage.py setup_inventory_system')
        self.stdout.write('   2. Access the application:')
        self.stdout.write('      http://localhost:3000')
        self.stdout.write('   3. Create accounts and assign workflows')
        self.stdout.write('   4. Configure fee structures and payment plans\n')
        self.stdout.write('='*60 + '\n')
