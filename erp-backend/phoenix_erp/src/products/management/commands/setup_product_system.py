# products/management/commands/setup_product_system.py
"""
Management command to initialize the product system
Creates default products, validation templates, and system configuration
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from products.models import Product
from accounts.models import Account
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Initialize the product system with default products and configuration'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--branch-id',
            type=int,
            help='Branch ID to create products for',
        )
        parser.add_argument(
            '--skip-examples',
            action='store_true',
            help='Skip creating example products',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete existing system products and recreate',
        )
    
    def handle(self, *args, **options):
        branch_id = options.get('branch_id')
        skip_examples = options.get('skip_examples')
        reset = options.get('reset')
        
        if not branch_id:
            self.stdout.write(self.style.ERROR('--branch-id is required'))
            return
        
        try:
            from branches.models import Branch
            branch = Branch.objects.get(id=branch_id)
        except Branch.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Branch with ID {branch_id} not found'))
            return
        
        self.stdout.write(self.style.SUCCESS(f'Setting up product system for branch: {branch.name}'))
        
        try:
            with transaction.atomic():
                if reset:
                    self._reset_products(branch)
                
                if not skip_examples:
                    self._create_example_products(branch)
                
                self._initialize_cache()
                
            self.stdout.write(self.style.SUCCESS('✓ Product system setup complete!'))
            self._print_summary()
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Setup failed: {str(e)}'))
            logger.exception("Product system setup failed")
    
    def _reset_products(self, branch):
        """Delete existing system products"""
        self.stdout.write('Resetting existing products...')
        
        count = Product.objects.filter(
            branch=branch,
            metadata_schema__system_generated=True
        ).delete()[0]
        
        self.stdout.write(f'  Deleted {count} system products')
    
    def _create_example_products(self, branch):
        """Create example products for each type"""
        self.stdout.write('Creating example products...')
        
        # Get owner (first superuser or branch owner)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        owner = User.objects.filter(is_superuser=True).first() or branch.owner
        
        products_created = []
        
        # 1. Savings Product - Basic
        if not Product.objects.filter(branch=branch, code='SAV-BASIC').exists():
            savings_basic = Product.objects.create(
                owner=owner,
                branch=branch,
                created_by=owner,
                name='Basic Savings Account',
                code='SAV-BASIC',
                description='Standard savings account with daily interest calculation',
                product_class='FINANCIAL',
                product_type='SAVINGS',
                is_active=True,
                
                # Limits
                minimum_amount=Decimal('100.00'),
                maximum_amount=Decimal('1000000.00'),
                min_transaction_amount=Decimal('10.00'),
                max_transaction_amount=Decimal('50000.00'),
                daily_transaction_limit=Decimal('100000.00'),
                
                # Interest
                interest_rate=Decimal('3.50'),
                interest_posting_method='accrual',
                interest_posting_cron='0 0 1 * *',  # Monthly on 1st
                
                # Fees
                auto_debit_fees=True,
                fee_structure={
                    'maintenance_fee': 50.00,
                    'cron': '0 0 1 * *',  # Monthly
                    'transaction_fee': 0,
                    'withdrawal_fee': 0
                },
                
                # Validation
                validation_scope='account',
                validation_rules={
                    'min_balance': 100.00,
                    'allow_overdraft': False
                },
                
                metadata_schema={'system_generated': True}
            )
            products_created.append(savings_basic)
            self.stdout.write(f'  ✓ Created: {savings_basic.name}')
        
        # 2. Savings Product - Premium
        if not Product.objects.filter(branch=branch, code='SAV-PREMIUM').exists():
            savings_premium = Product.objects.create(
                owner=owner,
                branch=branch,
                created_by=owner,
                name='Premium Savings Account',
                code='SAV-PREMIUM',
                description='High-interest savings account with higher minimum balance',
                product_class='FINANCIAL',
                product_type='SAVINGS',
                is_active=True,
                
                # Limits
                minimum_amount=Decimal('10000.00'),
                maximum_amount=Decimal('5000000.00'),
                min_transaction_amount=Decimal('100.00'),
                max_transaction_amount=Decimal('500000.00'),
                daily_transaction_limit=Decimal('1000000.00'),
                
                # Interest
                interest_rate=Decimal('5.50'),
                interest_posting_method='auto_journal',
                interest_posting_cron='0 0 1 * *',  # Monthly
                
                # Fees (waived for premium)
                auto_debit_fees=False,
                fee_structure={
                    'maintenance_fee': 0,
                    'transaction_fee': 0
                },
                
                # Validation
                validation_scope='account',
                validation_rules={
                    'min_balance': 10000.00,
                    'allow_overdraft': True,
                    'overdraft_limit': 5000.00
                },
                
                metadata_schema={'system_generated': True}
            )
            products_created.append(savings_premium)
            self.stdout.write(f'  ✓ Created: {savings_premium.name}')
        
        # 3. Loan Product - Personal
        if not Product.objects.filter(branch=branch, code='LOAN-PERSONAL').exists():
            loan_personal = Product.objects.create(
                owner=owner,
                branch=branch,
                created_by=owner,
                name='Personal Loan',
                code='LOAN-PERSONAL',
                description='Short-term personal loan with flexible repayment',
                product_class='FINANCIAL',
                product_type='LOAN',
                is_active=True,
                
                # Limits
                minimum_amount=Decimal('5000.00'),
                maximum_amount=Decimal('500000.00'),
                min_transaction_amount=Decimal('1000.00'),
                
                # Interest
                interest_rate=Decimal('12.00'),
                
                # Repayment config
                repayment_config={
                    'min_term_months': 6,
                    'max_term_months': 36,
                    'frequencies': ['monthly', 'biweekly'],
                    'grace_period_days': 3
                },
                
                # Fees
                fee_structure={
                    'processing_fee_percent': 2.0,
                    'late_payment_fee': 500.00,
                    'early_repayment_penalty_percent': 1.0
                },
                
                # Validation
                validation_scope='account',
                
                metadata_schema={'system_generated': True}
            )
            products_created.append(loan_personal)
            self.stdout.write(f'  ✓ Created: {loan_personal.name}')
        
        # 4. Expense Product - Office Supplies
        if not Product.objects.filter(branch=branch, code='EXP-OFFICE').exists():
            expense_office = Product.objects.create(
                owner=owner,
                branch=branch,
                created_by=owner,
                name='Office Supplies Budget',
                code='EXP-OFFICE',
                description='Daily and monthly limits for office supplies expenses',
                product_class='FINANCIAL',
                product_type='EXPENSE',
                is_active=True,
                
                # Transaction limits
                min_transaction_amount=Decimal('10.00'),
                max_transaction_amount=Decimal('5000.00'),
                daily_transaction_limit=Decimal('10000.00'),
                monthly_transaction_limit=Decimal('50000.00'),
                
                # Validation scope
                validation_scope='category',  # Apply to entire expense category
                
                # Validation rules
                validation_rules={
                    'require_receipt': True,
                    'require_approval_above': 2000.00,
                    'blocked_days': []  # Can add weekend restrictions
                },
                
                metadata_schema={'system_generated': True}
            )
            products_created.append(expense_office)
            self.stdout.write(f'  ✓ Created: {expense_office.name}')
        
        # 5. Expense Product - Travel
        if not Product.objects.filter(branch=branch, code='EXP-TRAVEL').exists():
            expense_travel = Product.objects.create(
                owner=owner,
                branch=branch,
                created_by=owner,
                name='Travel & Entertainment Budget',
                code='EXP-TRAVEL',
                description='Budget limits for travel and entertainment expenses',
                product_class='FINANCIAL',
                product_type='EXPENSE',
                is_active=True,
                
                # Transaction limits
                min_transaction_amount=Decimal('50.00'),
                max_transaction_amount=Decimal('50000.00'),
                daily_transaction_limit=Decimal('100000.00'),
                monthly_transaction_limit=Decimal('500000.00'),
                
                # Validation scope
                validation_scope='user',  # Apply per user
                
                # Validation rules
                validation_rules={
                    'require_receipt': True,
                    'require_approval_above': 10000.00,
                    'require_pre_approval': True
                },
                
                requires_approval=True,
                
                metadata_schema={'system_generated': True}
            )
            products_created.append(expense_travel)
            self.stdout.write(f'  ✓ Created: {expense_travel.name}')
        
        self.stdout.write(self.style.SUCCESS(f'  Created {len(products_created)} example products'))
    
    def _initialize_cache(self):
        """Initialize Redis cache keys for product validation"""
        self.stdout.write('Initializing cache...')
        
        try:
            from django.core.cache import cache
            
            # Test cache connection
            cache.set('product_system_initialized', True, 60)
            
            if cache.get('product_system_initialized'):
                self.stdout.write('  ✓ Cache connection verified')
            else:
                self.stdout.write(self.style.WARNING('  ⚠ Cache not available - validation will use database'))
        
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  ⚠ Cache initialization failed: {str(e)}'))
    
    def _print_summary(self):
        """Print setup summary"""
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('SETUP SUMMARY'))
        self.stdout.write('='*60)
        
        from products.models import Product
        
        total_products = Product.objects.count()
        savings_products = Product.objects.filter(product_type='SAVINGS').count()
        loan_products = Product.objects.filter(product_type='LOAN').count()
        expense_products = Product.objects.filter(product_type='EXPENSE').count()
        
        self.stdout.write(f'\nTotal Products: {total_products}')
        self.stdout.write(f'  - Savings: {savings_products}')
        self.stdout.write(f'  - Loans: {loan_products}')
        self.stdout.write(f'  - Expenses: {expense_products}')
        
        # Check for scheduled workflows
        from automations.models import WorkflowTemplate
        scheduled_workflows = WorkflowTemplate.objects.filter(
            trigger_type='schedule',
            workflow_type='system'
        ).count()
        
        self.stdout.write(f'\nScheduled Workflows: {scheduled_workflows}')
        
        self.stdout.write('\n' + '='*60)
        self.stdout.write('\nNext Steps:')
        self.stdout.write('1. Run migrations: python manage.py migrate')
        self.stdout.write('2. Link products to accounts via admin or API')
        self.stdout.write('3. Test product validation in workflows')
        self.stdout.write('4. Monitor scheduled workflow execution')
        self.stdout.write('='*60 + '\n')
