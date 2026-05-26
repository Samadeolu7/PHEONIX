"""
Tests for model-level balance protection

Run with: python manage.py test accounts.tests.test_balance_protection
"""
from django.test import TestCase, override_settings
from django.core.exceptions import PermissionError as DjangoPermissionError
from decimal import Decimal
from accounts.models import Account
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from branches.models import Branch
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class BalanceProtectionTestCase(TestCase):
    """Test that balance protection prevents unauthorized direct writes"""
    
    def setUp(self):
        """Create test fixtures"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        
        self.series = TransactionSeries.objects.create(
            code='TEST',
            description='Test Series'
        )
        
        self.account = Account.objects.create(
            code='1001',
            name='Test Asset Account',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            balance=Decimal('0.00')
        )
    
    def test_direct_balance_write_blocked(self):
        """Test that direct balance writes raise PermissionError"""
        account = self.account
        
        # Attempt direct write
        with self.assertRaises(PermissionError) as context:
            account.balance = Decimal('1000.00')
            account.save(update_fields=['balance'])
        
        self.assertIn('prohibited', str(context.exception).lower())
        self.assertIn('TransactionEntry.post()', str(context.exception))
    
    @override_settings(DISABLE_BALANCE_PROTECTION=True)
    def test_bypass_with_setting(self):
        """Test that bypass setting allows direct writes"""
        account = self.account
        
        # Should succeed with bypass enabled
        account.balance = Decimal('1000.00')
        account.save(update_fields=['balance'])
        
        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal('1000.00'))
    
    def test_canonical_posting_allowed(self):
        """Test that posting via TransactionEntry.post() is allowed"""
        # Create transaction and entries
        tx = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Test transaction',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create a second account for balancing
        contra_account = Account.objects.create(
            code='2001',
            name='Test Liability Account',
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        # Create balanced entries
        debit_entry = TransactionEntry.objects.create(
            transaction=tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        credit_entry = TransactionEntry.objects.create(
            transaction=tx,
            account=contra_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        # Validate and post (should succeed)
        tx.full_clean()
        Account.objects.select_for_update().filter(
            pk__in=[self.account.pk, contra_account.pk]
        )
        debit_entry.post()
        credit_entry.post()
        
        # Verify balances updated
        self.account.refresh_from_db()
        contra_account.refresh_from_db()
        
        self.assertEqual(self.account.balance, Decimal('500.00'))
        self.assertEqual(contra_account.balance, Decimal('500.00'))
    
    def test_update_balance_method_removed(self):
        """Test that Account.update_balance() method has been removed for security"""
        account = self.account
        
        # Method should not exist - it was a security leak
        self.assertFalse(hasattr(account, 'update_balance'),
                        "update_balance() method should be removed - use TransactionEntry.post() instead")
    
    def test_refresh_from_db_allowed(self):
        """Test that refresh_from_db doesn't trigger protection"""
        account = self.account
        
        # Change balance via SQL (bypass ORM)
        Account.objects.filter(pk=account.pk).update(balance=Decimal('250.00'))
        
        # Refresh should work without error
        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal('250.00'))
    
    def test_save_without_balance_allowed(self):
        """Test that saving other fields doesn't trigger protection"""
        account = self.account
        
        # Updating other fields should work
        account.name = 'Updated Account Name'
        account.save(update_fields=['name'])
        
        account.refresh_from_db()
        self.assertEqual(account.name, 'Updated Account Name')


class CashierAccountProtectionTestCase(TestCase):
    """Test balance protection for CashierAccount"""
    
    def setUp(self):
        """Create test fixtures"""
        from cash_management.models import CashierAccount
        
        self.user = User.objects.create_user(
            username='cashier',
            email='cashier@example.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB01',
            owner=self.user
        )
        
        self.account = Account.objects.create(
            code='1002',
            name='Cashier Cash Account',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        self.cashier_account = CashierAccount.objects.create(
            cashier=self.user,
            account=self.account,
            account_number='CASH001',
            name='Main Cashier',
            owner=self.user,
            branch=self.branch,
            current_balance=Decimal('0.00')
        )
    
    def test_direct_current_balance_write_blocked(self):
        """Test that direct current_balance writes are blocked"""
        cashier = self.cashier_account
        
        with self.assertRaises(PermissionError) as context:
            cashier.current_balance = Decimal('1000.00')
            cashier.save(update_fields=['current_balance'])
        
        self.assertIn('prohibited', str(context.exception).lower())
    
    @override_settings(DISABLE_BALANCE_PROTECTION=True)
    def test_cashier_bypass_with_setting(self):
        """Test that bypass works for CashierAccount"""
        cashier = self.cashier_account
        
        cashier.current_balance = Decimal('500.00')
        cashier.save(update_fields=['current_balance'])
        
        cashier.refresh_from_db()
        self.assertEqual(cashier.current_balance, Decimal('500.00'))
