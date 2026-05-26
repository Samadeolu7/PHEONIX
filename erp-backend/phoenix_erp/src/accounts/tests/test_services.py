"""
Comprehensive test suite for accounts app services.

Tests cover:
- close_month: Monthly period closing
- reopen_period: Period reopening with validation
- year_end_close: Year-end closing with opening balances and retained earnings
- create_balance_snapshots: Balance snapshot creation
- get_live_balance: Live balance calculation from snapshots
"""

from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from ..models import Period, Account, BalanceSheetSnapshot
from ..services import (
    close_month, reopen_period, year_end_close,
    create_balance_snapshots, get_live_balance
)
from branches.models import Branch
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class CloseMonthServiceTest(TestCase):
    """Test monthly period closing service."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
    
    def test_close_month_creates_period(self):
        """Test that close_month creates a closed period."""
        close_month(
            owner=self.user,
            branch=self.branch,
            year=2024,
            month=12,
            reopenable=True
        )
        
        # Use all_objects to avoid tenant filtering in tests
        period = Period.all_objects.all_tenants().get(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12
        )
        
        self.assertTrue(period.is_closed)
        self.assertTrue(period.can_reopen)
    
    def test_close_month_non_reopenable(self):
        """Test closing month as non-reopenable."""
        close_month(
            owner=self.user,
            branch=self.branch,
            year=2024,
            month=12,
            reopenable=False
        )
        
        # Use all_objects to avoid tenant filtering in tests
        period = Period.all_objects.all_tenants().get(
            owner=self.user,
            branch=self.branch,
            year=2024,
            month=12
        )
        
        self.assertTrue(period.is_closed)
        self.assertFalse(period.can_reopen)
    
    def test_close_multiple_months(self):
        """Test closing multiple months."""
        for month in range(1, 13):
            close_month(self.user, self.branch, 2024, month)
        
        # Use all_objects to avoid tenant filtering in tests
        periods = Period.all_objects.all_tenants().filter(
            owner=self.user,
            branch=self.branch,
            year=2024
        )
        
        self.assertEqual(periods.count(), 12)
        self.assertTrue(all(p.is_closed for p in periods))


class ReopenPeriodServiceTest(TestCase):
    """Test period reopening service."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
    
    def test_reopen_reopenable_period(self):
        """Test reopening a period that can be reopened."""
        period = Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=11,
            is_closed=True,
            can_reopen=True
        )
        
        reopen_period(self.user, period.id)
        
        period.refresh_from_db()
        self.assertFalse(period.is_closed)
    
    def test_cannot_reopen_non_reopenable_period(self):
        """Test that non-reopenable periods cannot be reopened."""
        period = Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.YEAR,
            year=2023,
            is_closed=True,
            can_reopen=False
        )
        
        with self.assertRaises(ValueError) as cm:
            reopen_period(self.user, period.id)
        
        self.assertIn('cannot be reopened', str(cm.exception))
        
        period.refresh_from_db()
        self.assertTrue(period.is_closed)  # Should still be closed


class YearEndCloseServiceTest(TransactionTestCase):
    """Test year-end closing service with transactions."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        # Create opening balance series
        self.ob_series = TransactionSeries.objects.create(
            code='OB',
            description='Opening Balance'
        )
        
        # Create accounts
        self.cash_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            balance=Decimal('10000.00')
        )
        
        self.income_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='401',
            name='Service Income',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME,
            balance=Decimal('50000.00')
        )
        
        self.expense_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='501',
            name='Salaries Expense',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.EXPENSE,
            balance=Decimal('30000.00')
        )
        
        self.re_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='RE',
            name='Retained Earnings',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.EQUITY,
            balance=Decimal('0.00')
        )
    
    def test_year_end_close_creates_period(self):
        """Test that year_end_close creates a closed year period."""
        tx_id, re_tx_id = year_end_close(self.user, self.branch, 2024)
        
        # Use all_objects to avoid tenant filtering in tests
        period = Period.all_objects.all_tenants().get(
            owner=self.user,
            branch=self.branch,
            period_type=Period.YEAR,
            year=2024
        )
        
        self.assertTrue(period.is_closed)
        self.assertFalse(period.can_reopen)
    
    def test_year_end_close_creates_opening_balances(self):
        """Test that opening balance transactions are created."""
        tx_id, re_tx_id = year_end_close(self.user, self.branch, 2024)
        
        # Check that opening balance transaction exists
        # Use all_objects to avoid tenant filtering in tests
        tx = Transaction.all_objects.all_tenants().get(id=tx_id)
        self.assertEqual(tx.series, self.ob_series)
        self.assertEqual(tx.date, date(2025, 1, 1))
        self.assertIn('Opening Balance', tx.description)
        
        # Check entries were created for accounts with balances
        entries = TransactionEntry.objects.filter(transaction=tx)
        self.assertGreater(entries.count(), 0)
    
    def test_year_end_close_calculates_retained_earnings(self):
        """Test that net income is transferred to retained earnings."""
        # Income: 50000, Expenses: 30000 → Net Income: 20000
        tx_id, re_tx_id = year_end_close(self.user, self.branch, 2024)
        
        # Check retained earnings transaction was created
        self.assertIsNotNone(re_tx_id)
        
        # Use all_objects to avoid tenant filtering in tests
        re_tx = Transaction.all_objects.all_tenants().get(id=re_tx_id)
        self.assertIn('Retained Earnings', re_tx.description)
        
        # Net income should be credited to retained earnings
        re_entry = TransactionEntry.objects.filter(
            transaction=re_tx,
            account=self.re_account
        ).first()
        
        self.assertIsNotNone(re_entry)
        self.assertEqual(re_entry.side, TransactionEntry.CREDIT)
    
    def test_year_end_close_prevents_duplicate(self):
        """Test that year cannot be closed twice."""
        year_end_close(self.user, self.branch, 2024)
        
        # Attempting to close same year again should fail
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            year_end_close(self.user, self.branch, 2024)


class CreateBalanceSnapshotsServiceTest(TestCase):
    """Test balance snapshot creation service."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.period = Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12,
            is_closed=True
        )
        
        # Create multiple accounts
        self.accounts = []
        for i in range(1, 4):
            account = Account.objects.create(
                owner=self.user,
                branch=self.branch,
                code=f'10{i}',
                name=f'Account {i}',
                account_level=Account.LEVEL_PARENT,
                account_type=Account.ASSET,
                balance=Decimal(f'{i * 1000}.00')
            )
            self.accounts.append(account)
    
    def test_create_snapshots_for_all_accounts(self):
        """Test that snapshots are created for all accounts."""
        create_balance_snapshots(
            self.user,
            self.branch,
            Period.MONTH,
            2024,
            12
        )
        
        # Use all_objects to avoid tenant filtering in tests
        snapshots = BalanceSheetSnapshot.all_objects.all_tenants().filter(
            owner=self.user,
            period__id=self.period.id
        )
        
        self.assertEqual(snapshots.count(), len(self.accounts))
        
        # Verify balances match
        for account in self.accounts:
            snapshot = snapshots.get(account=account)
            self.assertEqual(snapshot.balance, account.balance)
    
    def test_snapshots_replace_existing(self):
        """Test that creating snapshots replaces existing ones."""
        # Create initial snapshots
        create_balance_snapshots(self.user, self.branch, Period.MONTH, 2024, 12)
        initial_count = BalanceSheetSnapshot.objects.filter(period=self.period).count()
        
        # Create again
        create_balance_snapshots(self.user, self.branch, Period.MONTH, 2024, 12)
        final_count = BalanceSheetSnapshot.objects.filter(period=self.period).count()
        
        # Count should be the same (old ones deleted)
        self.assertEqual(initial_count, final_count)


class GetLiveBalanceServiceTest(TestCase):
    """Test live balance calculation service."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            balance=Decimal('5000.00')
        )
    
    def test_live_balance_without_snapshot(self):
        """Test that live balance returns current balance when no snapshot exists."""
        live_balance = get_live_balance(self.user, self.account)
        self.assertEqual(live_balance, self.account.balance)
    
    def test_live_balance_with_snapshot(self):
        """Test live balance calculation with existing snapshot."""
        # Create closed period and snapshot
        period = Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=11,
            is_closed=True
        )
        
        snapshot = BalanceSheetSnapshot.objects.create(
            owner=self.user,
            branch=self.branch,
            period=period,
            account=self.account,
            balance=Decimal('3000.00')
        )
        
        # Create transaction series
        series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
        # Create transaction after snapshot period
        tx = Transaction.objects.create(
            series=series,
            date=date(2024, 12, 15),
            owner=self.user,
            branch=self.branch,
            description='Test transaction'
        )
        
        # Add entry increasing account balance by 2000
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('2000.00')
        )
        
        # Live balance should be snapshot + delta
        live_balance = get_live_balance(self.user, self.account)
        self.assertEqual(live_balance, Decimal('5000.00'))  # 3000 + 2000
