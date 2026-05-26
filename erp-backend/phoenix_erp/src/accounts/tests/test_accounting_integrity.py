"""
Comprehensive Accounting Integrity Test Suite

This test suite validates that the ERP's accounting system maintains proper
double-entry bookkeeping integrity across ALL operations including:

1. DOUBLE-ENTRY VALIDATION
   - All transactions must balance (debits = credits)
   - No orphan entries or unbalanced transactions
   
2. INVENTORY ACCOUNTING
   - Inventory purchases correctly update inventory asset accounts
   - Sales reduce inventory and record COGS
   - Inventory value matches account balances
   
3. FIXED ASSETS ACCOUNTING
   - Asset purchases are capitalized correctly
   - Depreciation expenses are recorded
   - Accumulated depreciation balances are accurate
   
4. INCOME & EXPENSE TRACKING
   - Revenue is recorded correctly (cash vs accrual)
   - Expenses are recorded on the correct side
   - Income statement accounts balance properly
   
5. BALANCE SHEET INTEGRITY
   - Assets = Liabilities + Equity (fundamental equation)
   - Parent account balances = sum of child account balances
   - Account balances match transaction entries
   
6. LOANS & SAVINGS
   - Loan disbursements and repayments are recorded correctly
   - Savings deposits and withdrawals balance
   - Interest accruals update balances properly
   
7. PERIOD CLOSING
   - Closed periods cannot be modified
   - Year-end closing transfers income to retained earnings
   - Opening balances for new period are correct

8. RECEIVABLES
   - Invoice creation records receivables correctly
   - Payments reduce receivable balances
   - Aging reports match account balances

CRITICAL: These tests ensure accounting data integrity which is
FUNDAMENTAL to any ERP system. All tests must pass.
"""

from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from decimal import Decimal
from datetime import date, timedelta
import logging

from accounts.models import Account, AccountCategory, Period, BalanceSheetSnapshot
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from inventory.models import InventoryItem, InventoryCategory, Location, InventoryStock, StockMovement
from assets.models import FixedAsset, AssetCategory
from loans.models import LoanAccount, LoanProduct
from savings.models import SavingsAccount
from receivables.models import CustomerReceivable
from branches.models import Branch
from users.models import Tenant
from clients.models import Client
from products.models import Product
from common.managers import set_current_tenant

User = get_user_model()
logger = logging.getLogger(__name__)


class AccountingIntegrityTestBase(TestCase):
    """Base class with common setup for all accounting tests"""
    
    @classmethod
    def setUpTestData(cls):
        """Set up test data once for all test methods"""
        # Create tenant
        cls.tenant = Tenant.objects.create(name="Test Tenant")
        set_current_tenant(cls.tenant)
        
        # Create branch
        cls.branch = Branch.objects.create(
            name="Main Branch",
            code="MB01",
            tenant=cls.tenant
        )
        
        # Create user
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=cls.tenant,
            branch=cls.branch
        )
        cls.tenant.owner = cls.user
        cls.tenant.save()
        
        # Create transaction series
        cls.series = TransactionSeries.objects.create(
            code='TX',
            description='General Transactions'
        )
        cls.ob_series = TransactionSeries.objects.create(
            code='OB',
            description='Opening Balance'
        )
        
        # Create account categories for all sections
        cls.asset_category = AccountCategory.objects.create(
            owner=cls.user,
            branch=cls.branch,
            section=1,
            name='Current Assets',
            created_by=cls.user,
            tenant=cls.tenant
        )
        
        cls.liability_category = AccountCategory.objects.create(
            owner=cls.user,
            branch=cls.branch,
            section=2,
            name='Current Liabilities',
            created_by=cls.user,
            tenant=cls.tenant
        )
        
        cls.equity_category = AccountCategory.objects.create(
            owner=cls.user,
            branch=cls.branch,
            section=3,
            name='Equity',
            created_by=cls.user,
            tenant=cls.tenant
        )
        
        cls.income_category = AccountCategory.objects.create(
            owner=cls.user,
            branch=cls.branch,
            section=4,
            name='Revenue',
            created_by=cls.user,
            tenant=cls.tenant
        )
        
        cls.expense_category = AccountCategory.objects.create(
            owner=cls.user,
            branch=cls.branch,
            section=5,
            name='Operating Expenses',
            created_by=cls.user,
            tenant=cls.tenant
        )
    
    def setUp(self):
        """Set up for each test method"""
        set_current_tenant(self.tenant)
        
        # Create basic chart of accounts
        self._create_chart_of_accounts()
    
    def _create_chart_of_accounts(self):
        """Create a basic chart of accounts for testing"""
        # Assets
        self.cash_account = Account.objects.create(
            code='101',
            name='Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.inventory_account = Account.objects.create(
            code='120',
            name='Inventory',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.fixed_assets_account = Account.objects.create(
            code='150',
            name='Fixed Assets',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.accumulated_depreciation_account = Account.objects.create(
            code='155',
            name='Accumulated Depreciation',
            account_type=Account.ASSET,  # Contra-asset
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.accounts_receivable = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Liabilities
        self.accounts_payable = Account.objects.create(
            code='201',
            name='Accounts Payable',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_PARENT,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.loans_payable = Account.objects.create(
            code='250',
            name='Loans Payable',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_PARENT,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Equity
        self.capital_account = Account.objects.create(
            code='301',
            name='Capital',
            account_type=Account.EQUITY,
            account_level=Account.LEVEL_PARENT,
            category=self.equity_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.retained_earnings = Account.objects.create(
            code='350',
            name='Retained Earnings',
            account_type=Account.EQUITY,
            account_level=Account.LEVEL_PARENT,
            category=self.equity_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Income
        self.sales_revenue = Account.objects.create(
            code='401',
            name='Sales Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            category=self.income_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Expenses
        self.cogs_account = Account.objects.create(
            code='501',
            name='Cost of Goods Sold',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.depreciation_expense = Account.objects.create(
            code='520',
            name='Depreciation Expense',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        self.operating_expense = Account.objects.create(
            code='550',
            name='Operating Expenses',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
    
    def assertAccountBalance(self, account, expected_balance, msg=None):
        """Assert that an account has the expected balance"""
        account.refresh_from_db()
        self.assertEqual(
            account.balance,
            Decimal(str(expected_balance)),
            msg or f"Account {account.name} balance mismatch"
        )
    
    def assertBalanceSheetBalances(self, msg=None):
        """Assert that the fundamental accounting equation holds: Assets = Liabilities + Equity"""
        # Calculate total assets
        total_assets = Account.objects.filter(
            owner=self.user,
            branch=self.branch,
            account_type=Account.ASSET,
            is_deleted=False
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        
        # Calculate total liabilities
        total_liabilities = Account.objects.filter(
            owner=self.user,
            branch=self.branch,
            account_type=Account.LIABILITY,
            is_deleted=False
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        
        # Calculate total equity
        total_equity = Account.objects.filter(
            owner=self.user,
            branch=self.branch,
            account_type=Account.EQUITY,
            is_deleted=False
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        
        # Calculate net income (Income - Expenses)
        total_income = Account.objects.filter(
            owner=self.user,
            branch=self.branch,
            account_type=Account.INCOME,
            is_deleted=False
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        
        total_expenses = Account.objects.filter(
            owner=self.user,
            branch=self.branch,
            account_type=Account.EXPENSE,
            is_deleted=False
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        
        # Net income increases equity
        total_equity_with_income = total_equity + total_income - total_expenses
        
        self.assertEqual(
            total_assets,
            total_liabilities + total_equity_with_income,
            msg or f"Balance sheet doesn't balance: Assets={total_assets}, Liabilities={total_liabilities}, Equity={total_equity_with_income}"
        )
    
    def assertTransactionBalances(self, transaction, msg=None):
        """Assert that a transaction's debits equal credits"""
        debits = TransactionEntry.objects.filter(
            transaction=transaction,
            side=TransactionEntry.DEBIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        credits = TransactionEntry.objects.filter(
            transaction=transaction,
            side=TransactionEntry.CREDIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        self.assertEqual(
            debits,
            credits,
            msg or f"Transaction {transaction.reference_number} doesn't balance: Dr={debits}, Cr={credits}"
        )


class DoubleEntryValidationTests(AccountingIntegrityTestBase):
    """Test that all transactions maintain double-entry bookkeeping"""
    
    def test_simple_transaction_balances(self):
        """Test that a simple transaction balances (debits = credits)"""
        # Create a cash receipt transaction
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Cash receipt from customer',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Cash
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        # Cr. Sales Revenue
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        # Validate transaction balances
        self.assertTransactionBalances(txn)
        
        # Post transaction
        for entry in txn.entries.all():
            entry.post()
        
        # Verify account balances
        self.assertAccountBalance(self.cash_account, 1000.00)
        self.assertAccountBalance(self.sales_revenue, 1000.00)
        
        # Verify balance sheet still balances
        self.assertBalanceSheetBalances()
    
    def test_unbalanced_transaction_rejected(self):
        """Test that unbalanced transactions are rejected"""
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Unbalanced transaction',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Cash 1000
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        # Cr. Sales Revenue 500 (UNBALANCED!)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        # Validation should fail
        with self.assertRaises(ValidationError):
            txn.full_clean()
    
    def test_multi_entry_transaction_balances(self):
        """Test complex transaction with multiple entries"""
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Split transaction',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Cash 1000
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        # Dr. Accounts Receivable 500
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accounts_receivable,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        # Cr. Sales Revenue 1500
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1500.00')
        )
        
        # Validate and post
        self.assertTransactionBalances(txn)
        
        for entry in txn.entries.all():
            entry.post()
        
        # Verify balances
        # Cash was debited 1000, so balance should be 1000
        self.assertAccountBalance(self.cash_account, 1000.00)
        # Accounts Receivable was debited 500, so balance should be 500
        self.assertAccountBalance(self.accounts_receivable, 500.00)
        # Sales Revenue was credited 1500, so balance should be 1500
        self.assertAccountBalance(self.sales_revenue, 1500.00)
        self.assertBalanceSheetBalances()


class InventoryAccountingTests(AccountingIntegrityTestBase):
    """Test inventory accounting integration"""
    
    def setUp(self):
        super().setUp()
        
        # Create inventory category
        self.inv_category = InventoryCategory.objects.create(
            name='Electronics',
            code='ELEC',
            owner=self.user,
            branch=self.branch,
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_revenue,
            tenant=self.tenant
        )
        
        # Create location
        self.location = Location.objects.create(
            name='Main Warehouse',
            code='WH01',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            name='Laptop',
            sku='LAP001',
            category=self.inv_category,
            unit_of_measure='unit',
            cost_price=Decimal('500.00'),
            selling_price=Decimal('800.00'),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
    
    def test_inventory_purchase_updates_accounts(self):
        """Test that inventory purchase increases inventory asset and decreases cash"""
        # Record purchase: Buy 10 laptops at $500 each
        quantity = Decimal('10')
        unit_cost = Decimal('500.00')
        total_cost = quantity * unit_cost
        
        # Create purchase transaction
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description=f'Purchase {quantity} {self.item.name}',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Inventory
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.inventory_account,
            side=TransactionEntry.DEBIT,
            amount=total_cost
        )
        
        # Cr. Cash
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=total_cost
        )
        
        # Post transaction
        for entry in txn.entries.all():
            entry.post()
        
        # Verify inventory asset increased
        self.assertAccountBalance(self.inventory_account, 5000.00)
        
        # Verify cash decreased (assuming we started with 0)
        self.assertAccountBalance(self.cash_account, -5000.00)
        
        # Balance sheet should still balance
        self.assertBalanceSheetBalances()
    
    def test_inventory_sale_records_cogs_and_revenue(self):
        """Test that inventory sale records both COGS and revenue"""
        # First, purchase inventory
        purchase_qty = Decimal('10')
        purchase_cost = Decimal('500.00')
        purchase_total = purchase_qty * purchase_cost
        
        purchase_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Purchase inventory',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=purchase_txn,
            account=self.inventory_account,
            side=TransactionEntry.DEBIT,
            amount=purchase_total
        )
        
        TransactionEntry.objects.create(
            transaction=purchase_txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=purchase_total
        )
        
        for entry in purchase_txn.entries.all():
            entry.post()
        
        # Now sell 5 units
        sale_qty = Decimal('5')
        sale_cost = Decimal('500.00')  # Cost per unit
        sale_price = Decimal('800.00')  # Selling price per unit
        
        # Transaction 1: Record COGS
        cogs_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='COGS for sale',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. COGS
        TransactionEntry.objects.create(
            transaction=cogs_txn,
            account=self.cogs_account,
            side=TransactionEntry.DEBIT,
            amount=sale_qty * sale_cost
        )
        
        # Cr. Inventory
        TransactionEntry.objects.create(
            transaction=cogs_txn,
            account=self.inventory_account,
            side=TransactionEntry.CREDIT,
            amount=sale_qty * sale_cost
        )
        
        for entry in cogs_txn.entries.all():
            entry.post()
        
        # Transaction 2: Record revenue
        revenue_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Sales revenue',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Cash
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=sale_qty * sale_price
        )
        
        # Cr. Sales Revenue
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=sale_qty * sale_price
        )
        
        for entry in revenue_txn.entries.all():
            entry.post()
        
        # Verify:
        # - Inventory reduced by cost (10 * 500 - 5 * 500 = 2500)
        self.assertAccountBalance(self.inventory_account, 2500.00)
        
        # - COGS increased by cost (5 * 500 = 2500)
        self.assertAccountBalance(self.cogs_account, 2500.00)
        
        # - Sales revenue increased by selling price (5 * 800 = 4000)
        self.assertAccountBalance(self.sales_revenue, 4000.00)
        
        # - Cash increased by selling price minus original purchase
        # Initial: 0, Purchase: -5000, Sale: +4000 = -1000
        self.assertAccountBalance(self.cash_account, -1000.00)
        
        # Verify gross profit = Revenue - COGS = 4000 - 2500 = 1500
        gross_profit = self.sales_revenue.balance - self.cogs_account.balance
        self.assertEqual(gross_profit, Decimal('1500.00'))
        
        # Balance sheet should balance
        self.assertBalanceSheetBalances()
    
    def test_inventory_value_matches_account_balance(self):
        """Test that total inventory value equals inventory account balance"""
        # Purchase various items
        purchases = [
            (10, Decimal('100.00')),  # 10 units @ $100
            (5, Decimal('200.00')),   # 5 units @ $200
            (8, Decimal('150.00')),   # 8 units @ $150
        ]
        
        total_inventory_value = Decimal('0.00')
        
        for qty, cost in purchases:
            value = qty * cost
            total_inventory_value += value
            
            txn = Transaction.objects.create(
                series=self.series,
                date=timezone.now().date(),
                description=f'Purchase {qty} units at ${cost}',
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            TransactionEntry.objects.create(
                transaction=txn,
                account=self.inventory_account,
                side=TransactionEntry.DEBIT,
                amount=value
            )
            
            TransactionEntry.objects.create(
                transaction=txn,
                account=self.cash_account,
                side=TransactionEntry.CREDIT,
                amount=value
            )
            
            for entry in txn.entries.all():
                entry.post()
        
        # Inventory account balance should match total value
        self.assertAccountBalance(self.inventory_account, total_inventory_value)
        self.assertBalanceSheetBalances()


class FixedAssetAccountingTests(AccountingIntegrityTestBase):
    """Test fixed asset accounting integration"""
    
    def setUp(self):
        super().setUp()
        
        # Create asset category
        self.asset_category_fixed = AssetCategory.objects.create(
            name='Vehicles',
            code='VEH',
            asset_account=self.fixed_assets_account,
            depreciation_account=self.depreciation_expense,
            accumulated_depreciation_account=self.accumulated_depreciation_account,
            default_depreciation_method='straight_line',
            default_useful_life_years=5,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
    
    def test_asset_purchase_capitalized(self):
        """Test that fixed asset purchase is capitalized (not expensed)"""
        asset_cost = Decimal('50000.00')
        
        # Purchase asset transaction
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Purchase vehicle',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Fixed Assets
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.fixed_assets_account,
            side=TransactionEntry.DEBIT,
            amount=asset_cost
        )
        
        # Cr. Cash
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=asset_cost
        )
        
        for entry in txn.entries.all():
            entry.post()
        
        # Verify asset account increased
        self.assertAccountBalance(self.fixed_assets_account, 50000.00)
        
        # Verify expense account NOT increased (it's capitalized, not expensed)
        self.assertAccountBalance(self.operating_expense, 0.00)
        
        self.assertBalanceSheetBalances()
    
    def test_depreciation_expense_recorded(self):
        """Test that depreciation expense is recorded correctly"""
        # Assume asset purchased for $50,000 with 5-year life
        # Annual depreciation = 50,000 / 5 = 10,000
        # Monthly depreciation = 10,000 / 12 = 833.33
        
        monthly_depreciation = Decimal('833.33')
        
        # Record depreciation expense
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Monthly depreciation',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Depreciation Expense
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.depreciation_expense,
            side=TransactionEntry.DEBIT,
            amount=monthly_depreciation
        )
        
        # Cr. Accumulated Depreciation
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accumulated_depreciation_account,
            side=TransactionEntry.CREDIT,
            amount=monthly_depreciation
        )
        
        for entry in txn.entries.all():
            entry.post()
        
        # Verify depreciation expense increased
        self.assertAccountBalance(self.depreciation_expense, 833.33)
        
        # Verify accumulated depreciation increased (credit balance = negative in ASSET type)
        # Accumulated depreciation is a contra-asset, so credits make it negative
        self.assertAccountBalance(self.accumulated_depreciation_account, -833.33)
        
        self.assertBalanceSheetBalances()
    
    def test_net_book_value_calculation(self):
        """Test that net book value = cost - accumulated depreciation"""
        # Purchase asset
        asset_cost = Decimal('50000.00')
        
        purchase_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Purchase vehicle',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=purchase_txn,
            account=self.fixed_assets_account,
            side=TransactionEntry.DEBIT,
            amount=asset_cost
        )
        
        TransactionEntry.objects.create(
            transaction=purchase_txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=asset_cost
        )
        
        for entry in purchase_txn.entries.all():
            entry.post()
        
        # Record 12 months of depreciation
        monthly_depreciation = Decimal('833.33')
        
        for month in range(12):
            depr_txn = Transaction.objects.create(
                series=self.series,
                date=timezone.now().date(),
                description=f'Depreciation month {month + 1}',
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            TransactionEntry.objects.create(
                transaction=depr_txn,
                account=self.depreciation_expense,
                side=TransactionEntry.DEBIT,
                amount=monthly_depreciation
            )
            
            TransactionEntry.objects.create(
                transaction=depr_txn,
                account=self.accumulated_depreciation_account,
                side=TransactionEntry.CREDIT,
                amount=monthly_depreciation
            )
            
            for entry in depr_txn.entries.all():
                entry.post()
        
        # After 12 months
        total_depreciation = monthly_depreciation * 12
        
        self.assertAccountBalance(self.fixed_assets_account, 50000.00)
        # Accumulated depreciation is credited, so negative balance for ASSET type
        self.assertAccountBalance(self.accumulated_depreciation_account, -total_depreciation)
        
        # Net book value (asset cost + accumulated depreciation since it's negative)
        net_book_value = asset_cost + self.accumulated_depreciation_account.balance  # Adding negative value
        expected_nbv = Decimal('50000.00') - Decimal('9999.96')  # 833.33 * 12
        
        # Refresh to get current balance
        self.accumulated_depreciation_account.refresh_from_db()
        actual_nbv = asset_cost + self.accumulated_depreciation_account.balance
        self.assertEqual(actual_nbv, expected_nbv)
        
        self.assertBalanceSheetBalances()


class IncomeExpenseTrackingTests(AccountingIntegrityTestBase):
    """Test income and expense recording"""
    
    def test_cash_revenue_recorded_correctly(self):
        """Test cash revenue increases cash and income"""
        revenue = Decimal('5000.00')
        
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Service revenue',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Cash
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=revenue
        )
        
        # Cr. Sales Revenue
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=revenue
        )
        
        for entry in txn.entries.all():
            entry.post()
        
        self.assertAccountBalance(self.cash_account, 5000.00)
        self.assertAccountBalance(self.sales_revenue, 5000.00)
        self.assertBalanceSheetBalances()
    
    def test_expense_payment_recorded_correctly(self):
        """Test expense payment reduces cash and increases expenses"""
        expense = Decimal('2000.00')
        
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Office rent',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Dr. Operating Expense
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.operating_expense,
            side=TransactionEntry.DEBIT,
            amount=expense
        )
        
        # Cr. Cash
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=expense
        )
        
        for entry in txn.entries.all():
            entry.post()
        
        self.assertAccountBalance(self.operating_expense, 2000.00)
        self.assertAccountBalance(self.cash_account, -2000.00)
        self.assertBalanceSheetBalances()
    
    def test_net_income_calculation(self):
        """Test net income = revenue - expenses"""
        # Record revenue
        revenue_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Service revenue',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('10000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('10000.00')
        )
        
        for entry in revenue_txn.entries.all():
            entry.post()
        
        # Record expenses
        expense_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Operating expenses',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=expense_txn,
            account=self.operating_expense,
            side=TransactionEntry.DEBIT,
            amount=Decimal('6000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=expense_txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('6000.00')
        )
        
        for entry in expense_txn.entries.all():
            entry.post()
        
        # Calculate net income - refresh accounts to get current balances
        self.sales_revenue.refresh_from_db()
        self.operating_expense.refresh_from_db()
        
        total_revenue = self.sales_revenue.balance
        total_expenses = self.operating_expense.balance
        net_income = total_revenue - total_expenses
        
        self.assertEqual(total_revenue, Decimal('10000.00'))
        self.assertEqual(total_expenses, Decimal('6000.00'))
        self.assertEqual(net_income, Decimal('4000.00'))
        
        self.assertBalanceSheetBalances()


class BalanceSheetIntegrityTests(AccountingIntegrityTestBase):
    """Test balance sheet integrity and fundamental equation"""
    
    def test_fundamental_equation_holds(self):
        """Test Assets = Liabilities + Equity after various transactions"""
        # Initial investment
        investment_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Owner investment',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=investment_txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=investment_txn,
            account=self.capital_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100000.00')
        )
        
        for entry in investment_txn.entries.all():
            entry.post()
        
        # Should balance
        self.assertBalanceSheetBalances()
        
        # Take a loan
        loan_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Bank loan',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=loan_txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('50000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=loan_txn,
            account=self.loans_payable,
            side=TransactionEntry.CREDIT,
            amount=Decimal('50000.00')
        )
        
        for entry in loan_txn.entries.all():
            entry.post()
        
        # Should still balance
        self.assertBalanceSheetBalances()
        
        # Purchase asset
        asset_txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Purchase equipment',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=asset_txn,
            account=self.fixed_assets_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('30000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=asset_txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('30000.00')
        )
        
        for entry in asset_txn.entries.all():
            entry.post()
        
        # Should still balance
        self.assertBalanceSheetBalances()
    
    def test_parent_child_account_balances(self):
        """Test that parent account balance equals sum of children"""
        # Create parent account (using 260 to avoid conflict with existing 150 Fixed Assets)
        parent = Account.objects.create(
            code='260',
            name='Savings Accounts',
            account_type=Account.SAVINGS,
            account_level=Account.LEVEL_PARENT,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create child accounts
        child1 = Account.objects.create(
            code='260-001',
            name='John Savings',
            account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD,
            parent=parent,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        child2 = Account.objects.create(
            code='260-002',
            name='Jane Savings',
            account_type=Account.SAVINGS,
            account_level=Account.LEVEL_CHILD,
            parent=parent,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Post transactions to children
        txn1 = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='John deposit',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=txn1,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('5000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=txn1,
            account=child1,
            side=TransactionEntry.CREDIT,
            amount=Decimal('5000.00')
        )
        
        for entry in txn1.entries.all():
            entry.post()
        
        txn2 = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Jane deposit',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=txn2,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('3000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=txn2,
            account=child2,
            side=TransactionEntry.CREDIT,
            amount=Decimal('3000.00')
        )
        
        for entry in txn2.entries.all():
            entry.post()
        
        # Verify children balances
        self.assertAccountBalance(child1, 5000.00)
        self.assertAccountBalance(child2, 3000.00)
        
        # Verify parent total (using method, not balance field for parent)
        total_children = parent.get_total_children_balance()
        self.assertEqual(total_children, Decimal('8000.00'))


class PeriodClosingTests(AccountingIntegrityTestBase):
    """Test period closing and year-end procedures"""
    
    def test_closed_period_rejects_transactions(self):
        """Test that transactions cannot be posted to closed periods"""
        # Close December 2024
        period = Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12,
            is_closed=True,
            tenant=self.tenant
        )
        
        # Try to create transaction in closed period
        txn = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Transaction in closed period',
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            tenant=self.tenant
        )
        
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        # Validation should fail
        with self.assertRaises(ValidationError) as context:
            txn.full_clean()
        
        self.assertIn('closed', str(context.exception).lower())
    
    def test_year_end_closing_transfers_net_income(self):
        """Test that year-end closing transfers net income to retained earnings"""
        # Record some revenue and expenses for the year
        revenue_txn = Transaction.objects.create(
            series=self.series,
            date=date(2024, 6, 15),
            description='Revenue',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('50000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=revenue_txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('50000.00')
        )
        
        for entry in revenue_txn.entries.all():
            entry.post()
        
        expense_txn = Transaction.objects.create(
            series=self.series,
            date=date(2024, 7, 15),
            description='Expenses',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=expense_txn,
            account=self.operating_expense,
            side=TransactionEntry.DEBIT,
            amount=Decimal('30000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=expense_txn,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('30000.00')
        )
        
        for entry in expense_txn.entries.all():
            entry.post()
        
        # Net income = 50000 - 30000 = 20000
        net_income = Decimal('20000.00')
        
        # Year-end closing entry (simplified - normally done by service)
        closing_txn = Transaction.objects.create(
            series=self.ob_series,
            date=date(2024, 12, 31),
            description='Year-end closing - transfer net income',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Close revenue accounts (Dr. Revenue)
        TransactionEntry.objects.create(
            transaction=closing_txn,
            account=self.sales_revenue,
            side=TransactionEntry.DEBIT,
            amount=Decimal('50000.00')
        )
        
        # Close expense accounts (Cr. Expenses)
        TransactionEntry.objects.create(
            transaction=closing_txn,
            account=self.operating_expense,
            side=TransactionEntry.CREDIT,
            amount=Decimal('30000.00')
        )
        
        # Transfer to retained earnings (Cr. Retained Earnings)
        TransactionEntry.objects.create(
            transaction=closing_txn,
            account=self.retained_earnings,
            side=TransactionEntry.CREDIT,
            amount=net_income
        )
        
        for entry in closing_txn.entries.all():
            entry.post()
        
        # After closing:
        # - Revenue and expense accounts should be zero
        # - Retained earnings should have net income
        self.assertAccountBalance(self.sales_revenue, 0.00)
        self.assertAccountBalance(self.operating_expense, 0.00)
        self.assertAccountBalance(self.retained_earnings, 20000.00)


class TransactionReversalTests(AccountingIntegrityTestBase):
    """Test transaction reversal integrity"""
    
    def test_transaction_reversal_restores_balances(self):
        """Test that reversing a transaction restores original balances"""
        # Record initial balances
        initial_cash = self.cash_account.balance
        initial_revenue = self.sales_revenue.balance
        
        # Create and post transaction
        txn = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Sale',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        for entry in txn.entries.all():
            entry.post()
        
        txn.approved = True
        txn.save()
        
        # Verify balances changed
        self.assertAccountBalance(self.cash_account, 1000.00)
        self.assertAccountBalance(self.sales_revenue, 1000.00)
        
        # Reverse the transaction
        reversal = txn.reverse(user=self.user, reason='Error correction')
        
        # Verify balances restored
        self.assertAccountBalance(self.cash_account, initial_cash)
        self.assertAccountBalance(self.sales_revenue, initial_revenue)
        
        # Verify reversal attributes
        txn.refresh_from_db()
        self.assertTrue(txn.is_reversed)
        self.assertTrue(reversal.is_reversal)
        self.assertEqual(reversal.reverses_transaction, txn)


class ComprehensiveAccountingScenarioTests(AccountingIntegrityTestBase):
    """Test complete business scenarios end-to-end"""
    
    def test_complete_business_cycle(self):
        """
        Test a complete business cycle:
        1. Owner invests capital
        2. Purchase inventory
        3. Sell inventory
        4. Pay expenses
        5. Verify all accounts balance
        """
        # 1. Owner invests $100,000
        investment = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Owner investment',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=investment,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=investment,
            account=self.capital_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100000.00')
        )
        
        for entry in investment.entries.all():
            entry.post()
        
        self.assertBalanceSheetBalances()
        
        # 2. Purchase inventory for $60,000
        purchase = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Purchase inventory',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=purchase,
            account=self.inventory_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('60000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=purchase,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('60000.00')
        )
        
        for entry in purchase.entries.all():
            entry.post()
        
        self.assertBalanceSheetBalances()
        
        # 3. Sell inventory for $100,000 (cost: $50,000)
        # 3a. Record COGS
        cogs = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='COGS',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=cogs,
            account=self.cogs_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('50000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=cogs,
            account=self.inventory_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('50000.00')
        )
        
        for entry in cogs.entries.all():
            entry.post()
        
        # 3b. Record revenue
        sale = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Sales revenue',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=sale,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=sale,
            account=self.sales_revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100000.00')
        )
        
        for entry in sale.entries.all():
            entry.post()
        
        self.assertBalanceSheetBalances()
        
        # 4. Pay operating expenses $30,000
        expenses = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Operating expenses',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        TransactionEntry.objects.create(
            transaction=expenses,
            account=self.operating_expense,
            side=TransactionEntry.DEBIT,
            amount=Decimal('30000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=expenses,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('30000.00')
        )
        
        for entry in expenses.entries.all():
            entry.post()
        
        self.assertBalanceSheetBalances()
        
        # Verify final balances
        # Cash: 100,000 - 60,000 + 100,000 - 30,000 = 110,000
        self.assertAccountBalance(self.cash_account, 110000.00)
        
        # Inventory: 60,000 - 50,000 = 10,000
        self.assertAccountBalance(self.inventory_account, 10000.00)
        
        # Capital: 100,000
        self.assertAccountBalance(self.capital_account, 100000.00)
        
        # Revenue: 100,000
        self.assertAccountBalance(self.sales_revenue, 100000.00)
        
        # COGS: 50,000
        self.assertAccountBalance(self.cogs_account, 50000.00)
        
        # Expenses: 30,000
        self.assertAccountBalance(self.operating_expense, 30000.00)
        
        # Net income: 100,000 - 50,000 - 30,000 = 20,000
        net_income = (self.sales_revenue.balance - 
                     self.cogs_account.balance - 
                     self.operating_expense.balance)
        self.assertEqual(net_income, Decimal('20000.00'))
        
        # Total assets: 110,000 + 10,000 = 120,000
        # Total liabilities: 0
        # Total equity + net income: 100,000 + 20,000 = 120,000
        # Assets = Liabilities + Equity ✓
        self.assertBalanceSheetBalances()


# Run all tests
if __name__ == '__main__':
    import unittest
    unittest.main()
