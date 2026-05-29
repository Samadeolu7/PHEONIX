"""
Test account type validation to ensure features only attach to correct account types
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from decimal import Decimal

from accounts.models import Account, AccountCategory
from branches.models import Branch
from incomes.models import IncomeCategory
from expenses.models import ExpenseCategory
from assets.models import AssetCategory
from liabilities.models import AccountsPayable, AccruedLiability, TaxLiability
from clients.models import Client
from users.models import Tenant

User = get_user_model()


class AccountTypeValidationTest(TestCase):
    """Test that account type validation prevents incorrect attachments"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Tenant',
            slug='test-tenant'
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            owner=self.user,
            created_by=self.user
        )
        
        # Create account categories
        self.income_category = AccountCategory.objects.create(
            name='Income',
            code_prefix='4',
            section=4,
            owner=self.user,
            branch=self.branch
        )
        
        self.expense_category = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_category = AccountCategory.objects.create(
            name='Assets',
            code_prefix='1',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        
        self.liability_category = AccountCategory.objects.create(
            name='Liabilities',
            code_prefix='2',
            section=2,
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts of different types
        income_parent = Account.objects.create(
            name='Income Parent',
            code='4000',
            account_type='INCOME',
            account_level='PARENT',
            category=self.income_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.income_account = Account.objects.create(
            name='Test Income',
            code='4010',
            account_type='INCOME',
            account_level='CHILD',
            parent=income_parent,
            category=self.income_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.expense_account = Account.objects.create(
            name='Test Expense',
            code='5010',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.asset_account = Account.objects.create(
            name='Test Asset',
            code='1010',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.liability_account = Account.objects.create(
            name='Test Liability',
            code='2010',
            account_type='LIABILITY',
            account_level='PARENT',
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create client for liability tests
        self.client = Client.objects.create(
            first_name='Test',
            last_name='Client',
            client_id='CLI001',
            email='client@test.com',
            phone_primary='1234567890',
            gender='male',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_income_category_requires_income_account(self):
        """Test that IncomeCategory rejects non-income accounts"""
        # This should work
        income_cat = IncomeCategory(
            name='Valid Income',
            code='INC001',
            income_account=self.income_account,
            behavior_config={},
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        income_cat.full_clean()  # Should not raise
        
        # This should fail - using expense account for income
        invalid_income_cat = IncomeCategory(
            name='Invalid Income',
            code='INC002',
            income_account=self.expense_account,
            behavior_config={},
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_income_cat.full_clean()
        
        self.assertIn('income_account', context.exception.message_dict)
        self.assertIn('INCOME account', str(context.exception))
    
    def test_expense_category_requires_expense_account(self):
        """Test that ExpenseCategory rejects non-expense accounts"""
        # This should work
        expense_cat = ExpenseCategory(
            name='Valid Expense',
            code='EXP001',
            expense_account=self.expense_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        expense_cat.full_clean()  # Should not raise
        
        # This should fail - using income account for expense
        invalid_expense_cat = ExpenseCategory(
            name='Invalid Expense',
            code='EXP002',
            expense_account=self.income_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_expense_cat.full_clean()
        
        self.assertIn('expense_account', context.exception.message_dict)
        self.assertIn('EXPENSE account', str(context.exception))
    
    def test_expense_category_prepaid_requires_asset_account(self):
        """Test that ExpenseCategory prepaid_account must be ASSET"""
        # This should fail - using expense account for prepaid (should be asset)
        invalid_expense_cat = ExpenseCategory(
            name='Invalid Prepaid',
            code='EXP003',
            expense_account=self.expense_account,
            prepaid_account=self.expense_account,  # Wrong type
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_expense_cat.full_clean()
        
        self.assertIn('prepaid_account', context.exception.message_dict)
        self.assertIn('ASSET type', str(context.exception))
    
    def test_asset_category_requires_correct_account_types(self):
        """Test that AssetCategory validates all three account types"""
        # This should fail - using income account for asset
        invalid_asset_cat = AssetCategory(
            name='Invalid Asset',
            code='AST001',
            asset_account=self.income_account,  # Wrong type
            depreciation_account=self.expense_account,
            accumulated_depreciation_account=self.asset_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_asset_cat.full_clean()
        
        self.assertIn('asset_account', context.exception.message_dict)
        self.assertIn('ASSET account', str(context.exception))
        
        # Test depreciation account must be EXPENSE
        invalid_asset_cat2 = AssetCategory(
            name='Invalid Asset 2',
            code='AST002',
            asset_account=self.asset_account,
            depreciation_account=self.income_account,  # Wrong type
            accumulated_depreciation_account=self.asset_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_asset_cat2.full_clean()
        
        self.assertIn('depreciation_account', context.exception.message_dict)
        self.assertIn('EXPENSE type', str(context.exception))
    
    def test_accounts_payable_requires_liability_account(self):
        """Test that AccountsPayable rejects non-liability accounts"""
        from datetime import date
        
        # This should fail - using asset account for payable
        invalid_payable = AccountsPayable(
            supplier=self.client,
            account=self.asset_account,  # Wrong type
            invoice_number='INV001',
            invoice_date=date.today(),
            due_date=date.today(),
            amount=Decimal('1000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_payable.full_clean()
        
        self.assertIn('account', context.exception.message_dict)
        self.assertIn('LIABILITY account', str(context.exception))
    
    def test_accrued_liability_requires_liability_account(self):
        """Test that AccruedLiability rejects non-liability accounts"""
        from datetime import date
        
        # Create expense category first
        expense_cat = ExpenseCategory.objects.create(
            name='Test Expense Cat',
            code='EXPCAT001',
            expense_account=self.expense_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # This should fail - using expense account for liability
        invalid_liability = AccruedLiability(
            account=self.expense_account,  # Wrong type
            expense_category=expense_cat,
            description='Test',
            accrual_date=date.today(),
            expected_payment_date=date.today(),
            accrued_amount=Decimal('500.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_liability.full_clean()
        
        self.assertIn('account', context.exception.message_dict)
        self.assertIn('LIABILITY account', str(context.exception))
    
    def test_tax_liability_requires_liability_account(self):
        """Test that TaxLiability rejects non-liability accounts"""
        from datetime import date
        
        # This should fail - using income account for tax liability
        invalid_tax = TaxLiability(
            tax_type='vat',
            account=self.income_account,  # Wrong type
            period_start=date.today(),
            period_end=date.today(),
            taxable_amount=Decimal('10000.00'),
            tax_rate=Decimal('15.00'),
            tax_amount=Decimal('1500.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        with self.assertRaises(ValidationError) as context:
            invalid_tax.full_clean()
        
        self.assertIn('account', context.exception.message_dict)
        self.assertIn('LIABILITY account', str(context.exception))
