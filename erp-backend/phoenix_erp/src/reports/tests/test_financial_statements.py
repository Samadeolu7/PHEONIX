# reports/tests/test_financial_statements.py
"""
Comprehensive tests for Financial Statement Service and API endpoints

Tests cover:
- Balance calculations (debit/credit logic per account type)
- Hierarchical account structures (parent/child relationships)
- Date range filtering
- Detail levels (summary, detailed, all)
- Trial balance validation (debits = credits)
- Balance sheet validation (assets = liabilities + equity)
- Comparative period calculations
- API endpoint validation
"""

from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import Account, AccountCategory
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from branches.models import Branch
from reports.services.financial_statements import FinancialStatementService

User = get_user_model()


class AFinancialStatementServiceTestCase(TestCase):
    """Test FinancialStatementService balance calculations and report generation"""
    
    def setUp(self):
        """Create test data: user, branch, accounts, transactions"""
        # Create user and branch
        self.user = User.objects.create_user(
            username='testowner',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            owner=self.user,
            created_by=self.user
        )
        
        # Create account categories
        self.asset_category = AccountCategory.objects.create(
            name='Assets',
            section=1,
            code_prefix='1',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.liability_category = AccountCategory.objects.create(
            name='Liabilities',
            section=2,
            code_prefix='2',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.equity_category = AccountCategory.objects.create(
            name='Equity',
            section=3,
            code_prefix='3',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.income_category = AccountCategory.objects.create(
            name='Income',
            section=4,
            code_prefix='4',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.expense_category = AccountCategory.objects.create(
            name='Expenses',
            section=5,
            code_prefix='5',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create parent accounts
        self.cash_parent = Account.objects.create(
            code='101',
            name='Cash and Bank',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.ar_parent = Account.objects.create(
            code='120',
            name='Accounts Receivable',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.ap_parent = Account.objects.create(
            code='201',
            name='Accounts Payable',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_PARENT,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.equity_parent = Account.objects.create(
            code='301',
            name='Capital',
            account_type=Account.EQUITY,
            account_level=Account.LEVEL_PARENT,
            category=self.equity_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.revenue_parent = Account.objects.create(
            code='401',
            name='Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            category=self.income_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.expense_parent = Account.objects.create(
            code='501',
            name='Operating Expenses',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create child accounts
        self.cash_account = Account.objects.create(
            code='101-001',
            name='Main Cash Account',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=self.cash_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.bank_account = Account.objects.create(
            code='101-002',
            name='Bank Account',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=self.cash_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.ar_account = Account.objects.create(
            code='120-001',
            name='Customer Receivables',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=self.ar_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.ap_account = Account.objects.create(
            code='201-001',
            name='Supplier Payables',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_CHILD,
            parent=self.ap_parent,
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.capital_account = Account.objects.create(
            code='301-001',
            name='Owner Capital',
            account_type=Account.EQUITY,
            account_level=Account.LEVEL_CHILD,
            parent=self.equity_parent,
            category=self.equity_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.revenue_account = Account.objects.create(
            code='401-001',
            name='Sales Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            parent=self.revenue_parent,
            category=self.income_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.expense_account = Account.objects.create(
            code='501-001',
            name='Salaries Expense',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_CHILD,
            parent=self.expense_parent,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create TransactionSeries for journal entries
        self.series = TransactionSeries.objects.create(
            code='JE',
            description='General Journal Entries'
        )
        
        # Create test transactions
        self._create_test_transactions()
        
        # Initialize service
        self.service = FinancialStatementService(self.user, self.branch)
    
    def _create_test_transactions(self):
        """Create sample transactions for testing"""
        today = date.today()
        
        # Transaction 1: Capital investment (DR Cash 10,000, CR Capital 10,000)
        trans1 = Transaction.objects.create(
            series=self.series,
            date=today - timedelta(days=30),
            description='Initial capital investment',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        TransactionEntry.objects.create(
            transaction=trans1,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('10000.00'),
            posted=True
        )
        TransactionEntry.objects.create(
            transaction=trans1,
            account=self.capital_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('10000.00'),
            posted=True
        )
        
        # Transaction 2: Sales revenue (DR AR 5,000, CR Revenue 5,000)
        trans2 = Transaction.objects.create(
            series=self.series,
            date=today - timedelta(days=20),
            description='Sales on credit',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        TransactionEntry.objects.create(
            transaction=trans2,
            account=self.ar_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('5000.00'),
            posted=True
        )
        TransactionEntry.objects.create(
            transaction=trans2,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('5000.00'),
            posted=True
        )
        
        # Transaction 3: Payment of salary (DR Expense 3,000, CR Cash 3,000)
        trans3 = Transaction.objects.create(
            series=self.series,
            date=today - timedelta(days=10),
            description='Salary payment',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        TransactionEntry.objects.create(
            transaction=trans3,
            account=self.expense_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('3000.00'),
            posted=True
        )
        TransactionEntry.objects.create(
            transaction=trans3,
            account=self.cash_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('3000.00'),
            posted=True
        )
        
        # Transaction 4: Purchase on credit (DR Expense 2,000, CR AP 2,000)
        trans4 = Transaction.objects.create(
            series=self.series,
            date=today - timedelta(days=5),
            description='Purchase supplies on credit',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        TransactionEntry.objects.create(
            transaction=trans4,
            account=self.expense_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('2000.00'),
            posted=True
        )
        TransactionEntry.objects.create(
            transaction=trans4,
            account=self.ap_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('2000.00'),
            posted=True
        )
    
    def test_calculate_asset_balance(self):
        """Test balance calculation for asset accounts (Debit - Credit)"""
        # Cash account: DR 10,000, CR 3,000 = Balance 7,000
        balance_data = self.service._calculate_account_balance(
            self.cash_account,
            None,
            date.today(),
            include_children=False
        )
        
        self.assertEqual(Decimal(balance_data['debit']), Decimal('10000.00'))
        self.assertEqual(Decimal(balance_data['credit']), Decimal('3000.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('7000.00'))
        self.assertEqual(balance_data['account_type'], Account.ASSET)
    
    def test_calculate_liability_balance(self):
        """Test balance calculation for liability accounts (Credit - Debit)"""
        # AP account: CR 2,000, DR 0 = Balance 2,000
        balance_data = self.service._calculate_account_balance(
            self.ap_account,
            None,
            date.today(),
            include_children=False
        )
        
        self.assertEqual(Decimal(balance_data['debit']), Decimal('0.00'))
        self.assertEqual(Decimal(balance_data['credit']), Decimal('2000.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('2000.00'))
        self.assertEqual(balance_data['account_type'], Account.LIABILITY)
    
    def test_calculate_equity_balance(self):
        """Test balance calculation for equity accounts (Credit - Debit)"""
        # Capital account: CR 10,000, DR 0 = Balance 10,000
        balance_data = self.service._calculate_account_balance(
            self.capital_account,
            None,
            date.today(),
            include_children=False
        )
        
        self.assertEqual(Decimal(balance_data['credit']), Decimal('10000.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('10000.00'))
        self.assertEqual(balance_data['account_type'], Account.EQUITY)
    
    def test_calculate_income_balance(self):
        """Test balance calculation for income accounts (Credit - Debit)"""
        # Revenue account: CR 5,000, DR 0 = Balance 5,000
        balance_data = self.service._calculate_account_balance(
            self.revenue_account,
            None,
            date.today(),
            include_children=False
        )
        
        self.assertEqual(Decimal(balance_data['credit']), Decimal('5000.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('5000.00'))
        self.assertEqual(balance_data['account_type'], Account.INCOME)
    
    def test_calculate_expense_balance(self):
        """Test balance calculation for expense accounts (Debit - Credit)"""
        # Expense account: DR 5,000 (3,000 + 2,000), CR 0 = Balance 5,000
        balance_data = self.service._calculate_account_balance(
            self.expense_account,
            None,
            date.today(),
            include_children=False
        )
        
        self.assertEqual(Decimal(balance_data['debit']), Decimal('5000.00'))
        self.assertEqual(Decimal(balance_data['credit']), Decimal('0.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('5000.00'))
        self.assertEqual(balance_data['account_type'], Account.EXPENSE)
    
    def test_hierarchical_balance_with_children(self):
        """Test parent account includes children when requested"""
        # Cash parent should include both cash and bank children
        balance_data = self.service._calculate_account_balance(
            self.cash_parent,
            None,
            date.today(),
            include_children=True
        )
        
        self.assertEqual(balance_data['level'], Account.LEVEL_PARENT)
        self.assertIn('children', balance_data)
        self.assertEqual(len(balance_data['children']), 2)  # cash_account and bank_account
        
        # Check children codes
        child_codes = [child['code'] for child in balance_data['children']]
        self.assertIn('101-001', child_codes)
        self.assertIn('101-002', child_codes)
    
    def test_date_range_filtering(self):
        """Test transactions are filtered by date range"""
        today = date.today()
        
        # Get balance for last 15 days only (excludes older transactions from period
        # but carries forward their net effect as the opening balance)
        balance_data = self.service._calculate_account_balance(
            self.cash_account,
            today - timedelta(days=15),
            today,
            include_children=False
        )
        
        # Opening balance (entries before 15-day window): DR 10,000 (capital)
        # Period entries (last 15 days): CR 3,000 (salary payment)
        # Expected: debit=10,000, credit=3,000, balance=7,000
        self.assertEqual(Decimal(balance_data['debit']), Decimal('10000.00'))
        self.assertEqual(Decimal(balance_data['credit']), Decimal('3000.00'))
        self.assertEqual(Decimal(balance_data['balance']), Decimal('7000.00'))
    
    def test_trial_balance_generation(self):
        """Test trial balance report generation"""
        result = self.service.generate_trial_balance(
            start_date=None,
            end_date=date.today(),
            detail_level='summary',
            include_zero_balances=False
        )
        
        self.assertIn('accounts', result)
        self.assertIn('totals', result)
        self.assertIn('is_balanced', result)
        
        # Check totals
        total_debits = Decimal(result['totals']['total_debits'])
        total_credits = Decimal(result['totals']['total_credits'])
        
        # Debits should equal credits (fundamental accounting equation)
        # Total debits = 10,000 (cash) + 5,000 (AR) + 5,000 (expenses) = 20,000
        # Total credits = 10,000 (capital) + 5,000 (revenue) + 3,000 (cash) + 2,000 (AP) = 20,000
        self.assertEqual(total_debits, Decimal('20000.00'))
        self.assertEqual(total_credits, Decimal('20000.00'))
        self.assertTrue(result['is_balanced'])
    
    def test_profit_loss_generation(self):
        """Test P&L statement generation"""
        today = date.today()
        result = self.service.generate_profit_loss(
            start_date=today - timedelta(days=30),
            end_date=today,
            detail_level='summary',
            comparative_period=False
        )
        
        self.assertIn('revenue', result)
        self.assertIn('expenses', result)
        self.assertIn('net_profit', result)
        
        # Revenue = 5,000
        # Expenses = 5,000
        # Net profit = 0
        self.assertEqual(Decimal(result['revenue']['total']), Decimal('5000.00'))
        self.assertEqual(Decimal(result['expenses']['total']), Decimal('5000.00'))
        self.assertEqual(Decimal(result['net_profit']), Decimal('0.00'))
    
    def test_profit_loss_with_comparative(self):
        """Test P&L with comparative period"""
        today = date.today()
        result = self.service.generate_profit_loss(
            start_date=today - timedelta(days=10),
            end_date=today,
            detail_level='summary',
            comparative_period=True
        )
        
        self.assertIn('comparative', result)
        self.assertIn('variance', result['comparative'])

    def test_profit_loss_excludes_pre_period_activity(self):
        """P&L for a sub-period must not fold in revenue/expense from before start_date.

        Revenue entry sits at today-20; window starts at today-10, so it must
        be excluded entirely (no brought-forward balance for income/expense -
        they are temporary accounts that close to equity each period).
        """
        today = date.today()
        result = self.service.generate_profit_loss(
            start_date=today - timedelta(days=10),
            end_date=today,
            detail_level='summary',
            comparative_period=False
        )

        # Revenue (today-20) falls outside the window -> must not appear
        self.assertEqual(Decimal(result['revenue']['total']), Decimal('0.00'))
        # Expenses (today-10 and today-5) fall inside the window
        self.assertEqual(Decimal(result['expenses']['total']), Decimal('5000.00'))
        self.assertEqual(Decimal(result['net_profit']), Decimal('-5000.00'))

    def test_balance_sheet_generation(self):
        """Test balance sheet generation"""
        result = self.service.generate_balance_sheet(
            as_of_date=date.today(),
            detail_level='summary',
            comparative_date=None
        )
        
        self.assertIn('assets', result)
        self.assertIn('liabilities', result)
        self.assertIn('equity', result)
        self.assertIn('is_balanced', result)
        
        # Assets = 7,000 (cash) + 5,000 (AR) = 12,000
        # Liabilities = 2,000 (AP)
        # Equity = 10,000 (capital)
        # Assets should equal Liabilities + Equity
        total_assets = Decimal(result['assets']['total'])
        total_liabilities = Decimal(result['liabilities']['total'])
        total_equity = Decimal(result['equity']['total'])
        
        self.assertEqual(total_assets, Decimal('12000.00'))
        self.assertEqual(total_liabilities, Decimal('2000.00'))
        self.assertEqual(total_equity, Decimal('10000.00'))
        self.assertEqual(total_assets, total_liabilities + total_equity)
        self.assertTrue(result['is_balanced'])
    
    def test_balance_sheet_current_classification(self):
        """Test current vs non-current asset/liability classification"""
        result = self.service.generate_balance_sheet(
            as_of_date=date.today(),
            detail_level='summary'
        )
        
        # Cash (101) and AR (120) are current assets (100-149 range)
        current_assets_total = Decimal(result['assets']['current']['total'])
        self.assertEqual(current_assets_total, Decimal('12000.00'))
        
        # AP (201) is current liability (200-249 range)
        current_liabilities_total = Decimal(result['liabilities']['current']['total'])
        self.assertEqual(current_liabilities_total, Decimal('2000.00'))
    
    def test_detail_level_summary(self):
        """Test summary detail level returns only parent accounts"""
        result = self.service.generate_trial_balance(
            detail_level='summary'
        )
        
        # Should only include parent accounts
        for account in result['accounts']:
            self.assertEqual(account['level'], Account.LEVEL_PARENT)
            self.assertNotIn('children', account)
    
    def test_detail_level_detailed(self):
        """Test detailed level includes parent with children array"""
        result = self.service.generate_trial_balance(
            detail_level='detailed'
        )
        
        # Find cash parent account
        cash_parent_data = next(
            (acc for acc in result['accounts'] if acc['code'] == '101'),
            None
        )
        
        if cash_parent_data:
            self.assertIn('children', cash_parent_data)
            self.assertGreater(len(cash_parent_data['children']), 0)
    
    def test_exclude_unposted_entries(self):
        """Test that unposted entries are excluded from calculations"""
        # Create unposted transaction
        trans = Transaction.objects.create(
            series=self.series,
            date=date.today(),
            description='Unposted transaction',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        TransactionEntry.objects.create(
            transaction=trans,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('999999.00'),
            posted=False  # NOT POSTED
        )
        
        # Balance should not include unposted entry
        balance_data = self.service._calculate_account_balance(
            self.cash_account,
            None,
            date.today(),
            include_children=False
        )
        
        # Should still be 7,000, not 7,000 + 999,999
        self.assertEqual(Decimal(balance_data['balance']), Decimal('7000.00'))
    
    def test_exclude_deleted_accounts(self):
        """Test that soft-deleted accounts are excluded"""
        # Soft delete an account
        self.bank_account.is_deleted = True
        self.bank_account.save()
        
        # Check parent's children
        balance_data = self.service._calculate_account_balance(
            self.cash_parent,
            None,
            date.today(),
            include_children=True
        )
        
        # Should only have 1 child (cash_account), not 2
        self.assertEqual(len(balance_data['children']), 1)
        self.assertEqual(balance_data['children'][0]['code'], '101-001')


class BFinancialReportsAPITestCase(TestCase):
    """Test Financial Reports API endpoints"""
    
    def setUp(self):
        """Setup API client and test data"""
        # Create user and authenticate
        self.user = User.objects.create_user(
            username='apiuser',
            email='api@example.com',
            password='apipass123'
        )
        self.branch = Branch.objects.create(
            name='API Branch',
            code='API',
            owner=self.user,
            created_by=self.user
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create minimal account structure for API testing
        self._create_minimal_accounts()
    
    def _create_minimal_accounts(self):
        """Create minimal accounts for API testing"""
        # Create categories
        asset_cat = AccountCategory.objects.create(
            name='Assets',
            section=1,
            code_prefix='1',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create one parent and one child
        cash_parent = Account.objects.create(
            code='101',
            name='Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            category=asset_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.cash_account = Account.objects.create(
            code='101-001',
            name='Main Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=cash_parent,
            category=asset_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_trial_balance_api_endpoint(self):
        """Test trial balance API endpoint"""
        url = '/api/reports/financial/trial_balance/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('success', response.data)
        self.assertTrue(response.data['success'])
        data = response.data['data']
        self.assertIn('accounts', data)
        self.assertIn('totals', data)
        self.assertIn('is_balanced', data)
    
    def test_trial_balance_with_date_filters(self):
        """Test trial balance with date range parameters"""
        url = '/api/reports/financial/trial_balance/'
        params = {
            'start_date': '2025-01-01',
            'end_date': '2025-12-31',
            'detail_level': 'summary'
        }
        response = self.client.get(url, params)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['data']
        self.assertIn('date_range', data)
    
    def test_profit_loss_api_endpoint(self):
        """Test P&L API endpoint"""
        url = '/api/reports/financial/profit_loss/'
        params = {
            'start_date': '2025-01-01',
            'end_date': '2025-12-31'
        }
        response = self.client.get(url, params)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['data']
        self.assertIn('revenue', data)
        self.assertIn('expenses', data)
        self.assertIn('net_profit', data)
    
    def test_profit_loss_missing_start_date(self):
        """Test P&L fails without start_date"""
        url = '/api/reports/financial/profit_loss/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_balance_sheet_api_endpoint(self):
        """Test balance sheet API endpoint"""
        url = '/api/reports/financial/balance_sheet/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['data']
        self.assertIn('assets', data)
        self.assertIn('liabilities', data)
        self.assertIn('equity', data)
    
    def test_invalid_detail_level(self):
        """Test invalid detail_level parameter"""
        url = '/api/reports/financial/trial_balance/'
        params = {'detail_level': 'invalid_level'}
        response = self.client.get(url, params)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_unauthenticated_access(self):
        """Test endpoints require authentication"""
        self.client.force_authenticate(user=None)
        url = '/api/reports/financial/trial_balance/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
