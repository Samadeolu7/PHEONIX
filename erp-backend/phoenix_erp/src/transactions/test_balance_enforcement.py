"""
Test Transaction Balance Enforcement

This test verifies that the Transaction model STRICTLY enforces:
1. Debits = Credits (balanced transactions)
2. All amounts are positive (no negative amounts)
3. Unbalanced transactions cannot be saved or posted
"""
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from accounts.models import Account, Period
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from branches.models import Branch

User = get_user_model()


class TransactionBalanceEnforcementTests(TestCase):
    """Test strict balance enforcement in Transaction model"""
    
    def setUp(self):
        """Set up test data"""
        # Create user and branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            branch=self.branch
        )
        
        # Create transaction series
        self.series = TransactionSeries.objects.create(
            code='TEST',
            description='Test Series',
            next_number=1,
            owner=self.user,
            branch=self.branch
        )
        
        # Create test accounts
        self.cash_account = Account.objects.create(
            code='1000',
            name='Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            owner=self.user,
            branch=self.branch
        )
        
        self.revenue_account = Account.objects.create(
            code='4000',
            name='Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            owner=self.user,
            branch=self.branch
        )
        
        self.expense_account = Account.objects.create(
            code='5000',
            name='Expenses',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_CHILD,
            owner=self.user,
            branch=self.branch
        )
    
    def test_balanced_transaction_posts_successfully(self):
        """Test that a properly balanced transaction posts without error"""
        # Create balanced transaction: Dr Cash 100, Cr Revenue 100
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test balanced transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Add entries
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        # Validate balance
        self.assertTrue(transaction.validate_entries())
        
        # Post should succeed
        transaction.post()
        self.assertTrue(transaction.approved)
        
        # Verify account balances updated
        self.cash_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        self.assertEqual(self.cash_account.balance, Decimal('100.00'))
        self.assertEqual(self.revenue_account.balance, Decimal('100.00'))
    
    def test_unbalanced_transaction_fails_validation(self):
        """Test that unbalanced transaction fails validation"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test unbalanced transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Add UNBALANCED entries: Dr Cash 100, Cr Revenue 50
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('50.00')  # WRONG! Should be 100
        )
        
        # Validation should FAIL
        self.assertFalse(transaction.validate_entries())
        
        # Posting should raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            transaction.post()
        
        self.assertIn('UNBALANCED', str(ctx.exception))
    
    def test_negative_amount_rejected(self):
        """Test that negative amounts are REJECTED"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test negative amount',
            owner=self.user,
            branch=self.branch
        )
        
        # Try to create entry with NEGATIVE amount
        entry = TransactionEntry(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('-100.00')  # INVALID!
        )
        
        # clean() should raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            entry.clean()
        
        self.assertIn('POSITIVE', str(ctx.exception).upper())
    
    def test_zero_amount_rejected(self):
        """Test that zero amounts are REJECTED"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test zero amount',
            owner=self.user,
            branch=self.branch
        )
        
        # Try to create entry with ZERO amount
        entry = TransactionEntry(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('0.00')  # INVALID!
        )
        
        # clean() should raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            entry.clean()
        
        self.assertIn('positive', str(ctx.exception).lower())
    
    def test_complex_balanced_transaction(self):
        """Test complex multi-entry balanced transaction"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Complex balanced transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Multiple debits and credits that balance
        # Dr Cash 100
        # Dr Expense 50
        # Cr Revenue 150
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.expense_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('50.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('150.00')
        )
        
        # Should validate and post
        self.assertTrue(transaction.validate_entries())
        transaction.post()
        self.assertTrue(transaction.approved)
    
    def test_transaction_cannot_be_posted_twice(self):
        """Test that a transaction cannot be posted twice"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test double posting',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        # First post succeeds
        transaction.post()
        self.assertTrue(transaction.approved)
        
        # Second post should FAIL
        with self.assertRaises(ValidationError) as ctx:
            transaction.post()
        
        self.assertIn('already posted', str(ctx.exception).lower())
    
    def test_save_validates_balance(self):
        """Test that save() enforces balance validation"""
        transaction = Transaction.objects.create(
            series=self.series,
            description='Test save validation',
            owner=self.user,
            branch=self.branch
        )
        
        # Add unbalanced entries
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('75.00')  # Unbalanced!
        )
        
        # Trying to save should raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            transaction.save()
        
        self.assertIn('UNBALANCED', str(ctx.exception).upper())


class GRNMandatoryPostingTests(TestCase):
    """Test that GRN posting is MANDATORY"""
    
    def setUp(self):
        """Set up test data for GRN tests"""
        # Create user and branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            branch=self.branch
        )
    
    def test_grn_posting_is_mandatory(self):
        """
        Test that GRN creation ALWAYS posts to accounting.
        This is verified by checking that the view's perform_create
        ALWAYS calls ProcurementService.post_grn() without any conditions.
        """
        # This is a documentation test - the actual enforcement is in the view
        # The view should NOT have any auto_post flag or conditional logic
        
        from procurement.views import GoodsReceivedNoteViewSet
        import inspect
        
        # Get the perform_create method source code
        source = inspect.getsource(GoodsReceivedNoteViewSet.perform_create)
        
        # Verify there's NO auto_post flag check
        self.assertNotIn('auto_post', source, 
            "GRN posting should be MANDATORY, not optional with auto_post flag")
        
        # Verify ProcurementService.post_grn IS called
        self.assertIn('ProcurementService.post_grn', source,
            "GRN creation MUST call post_grn() to maintain accounting integrity")
        
        # Verify it raises exception on failure (not just logging)
        self.assertIn('raise', source.lower(),
            "GRN posting failure MUST raise exception to trigger rollback")


if __name__ == '__main__':
    import django
    django.setup()
    from django.test.utils import get_runner
    from django.conf import settings
    
    TestRunner = get_runner(settings)
    test_runner = TestRunner()
    failures = test_runner.run_tests(['__main__'])
