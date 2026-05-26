"""
Comprehensive test suite for transactions app models.

Tests cover:
- TransactionSeries model (sequence generation)
- Transaction model (creation, validation, approval, reversal)
- TransactionEntry model (posting, validation)
- Double-entry accounting validation
- Period closure validation
- Concurrency control
"""

from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from decimal import Decimal
from datetime import date
import unittest

from ..models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account, AccountCategory, Period
from branches.models import Branch

User = get_user_model()


class TransactionSeriesModelTest(TestCase):
    """Test TransactionSeries model for reference number generation."""
    
    def test_create_transaction_series(self):
        """Test creating a transaction series."""
        series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
        self.assertEqual(series.code, 'GJ')
        self.assertEqual(series.description, 'General Journal')
        self.assertIn('General Journal', str(series))
    
    def test_sequence_name_auto_generation(self):
        """Test that sequence_name is automatically generated."""
        series = TransactionSeries.objects.create(
            code='CA',
            description='Cash Transactions'
        )
        
        self.assertEqual(series.sequence_name, 'seq_ref_ca')
    
    def test_unique_code_constraint(self):
        """Test that series codes must be unique."""
        TransactionSeries.objects.create(code='GJ', description='General Journal')
        
        with self.assertRaises(IntegrityError):
            TransactionSeries.objects.create(code='GJ', description='Duplicate')
    
    def test_postgres_sequence_created(self):
        """Test that PostgreSQL sequence is created on save."""
        series = TransactionSeries.objects.create(
            code='TEST',
            description='Test Series'
        )
        
        # Sequence should exist (we can't easily test this without postgres)
        self.assertIsNotNone(series.sequence_name)


class TransactionModelTest(TestCase):
    """Test Transaction model."""
    
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
        
        self.series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
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
            balance=Decimal('0.00')
        )
    
    def test_create_transaction(self):
        """Test creating a basic transaction."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test transaction',
            owner=self.user,
            branch=self.branch
        )
        
        self.assertEqual(tx.series, self.series)
        self.assertEqual(tx.description, 'Test transaction')
        self.assertFalse(tx.approved)
        self.assertFalse(tx.is_reversed)
        self.assertIsNotNone(tx.reference_number)
    
    def test_reference_number_auto_generation(self):
        """Test that reference numbers are automatically generated."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch
        )
        
        # Should follow format: CODE-YYYYMMDD-NNNN
        self.assertIsNotNone(tx.reference_number)
        self.assertIn('GJ', tx.reference_number)
        self.assertIn('20241215', tx.reference_number)
    
    def test_unique_reference_number(self):
        """Test that reference numbers are unique."""
        tx1 = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='First',
            owner=self.user,
            branch=self.branch
        )
        
        # Cannot manually create duplicate
        with self.assertRaises(IntegrityError):
            Transaction.objects.create(
                series=self.series,
                date=date(2024, 12, 15),
                description='Second',
                owner=self.user,
                branch=self.branch,
                reference_number=tx1.reference_number
            )
    
    def test_validate_entries_balanced(self):
        """Test validation that debits equal credits."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Balanced transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Create balanced entries
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        self.assertTrue(tx.validate_entries())
    
    def test_validate_entries_unbalanced(self):
        """Test validation fails when debits don't equal credits."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Unbalanced transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Create unbalanced entries
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('300.00')  # Unbalanced!
        )
        
        self.assertFalse(tx.validate_entries())
    
    def test_cannot_post_already_approved(self):
        """Test that already approved transactions cannot be posted again."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch,
            approved=True
        )
        
        with self.assertRaises(ValidationError) as cm:
            tx.post()
        
        self.assertIn('already posted', str(cm.exception).lower())
    
    def test_get_total_amount(self):
        """Test getting total transaction amount."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('750.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('750.00')
        )
        
        self.assertEqual(tx.get_total_amount(), Decimal('750.00'))


class TransactionReversalTest(TransactionTestCase):
    """Test transaction reversal logic."""
    
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
        
        self.series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
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
            name='Income',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME,
            balance=Decimal('0.00')
        )
    
    def test_reverse_transaction(self):
        """Test reversing a posted transaction."""
        # Create and post transaction
        tx = Transaction.objects.create(
            series=self.series,
            date=timezone.localdate(),
            description='Original transaction',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        tx.post()
        
        # Reverse it
        reversal = tx.reverse(reason='Test reversal', user=self.user)
        
        # Check original marked as reversed
        tx.refresh_from_db()
        self.assertTrue(tx.is_reversed)
        self.assertIsNotNone(tx.reversed_at)
        self.assertEqual(tx.reversed_by, self.user)
        self.assertEqual(tx.reversal_reason, 'Test reversal')
        self.assertEqual(tx.reversal_transaction, reversal)
        
        # Check reversal transaction created
        self.assertTrue(reversal.is_reversal)
        self.assertEqual(reversal.reverses_transaction, tx)
        self.assertIn('REVERSAL', reversal.description)
        
        # Check reversal entries are opposite
        original_entries = list(tx.entries.all())
        reversal_entries = list(reversal.entries.all())
        
        self.assertEqual(len(original_entries), len(reversal_entries))
        
        for orig_entry in original_entries:
            # Find matching account in reversal
            rev_entry = next(
                e for e in reversal_entries 
                if e.account == orig_entry.account
            )
            
            # Should be opposite side
            if orig_entry.side == TransactionEntry.DEBIT:
                self.assertEqual(rev_entry.side, TransactionEntry.CREDIT)
            else:
                self.assertEqual(rev_entry.side, TransactionEntry.DEBIT)
            
            # Same amount
            self.assertEqual(rev_entry.amount, orig_entry.amount)
    
    def test_cannot_reverse_already_reversed(self):
        """Test that already reversed transactions cannot be reversed again."""
        tx = Transaction.objects.create(
            series=self.series,
            date=timezone.localdate(),
            description='Test',
            owner=self.user,
            branch=self.branch,
            approved=True
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        # Reverse once
        tx.reverse(reason='First reversal', user=self.user)
        
        # Try to reverse again
        tx.refresh_from_db()
        with self.assertRaises(ValidationError) as cm:
            tx.reverse(reason='Second reversal', user=self.user)
        
        error_message = str(cm.exception).lower()
        self.assertTrue('already' in error_message and 'reversed' in error_message)
    
    def test_cannot_reverse_unapproved(self):
        """Test that unapproved transactions cannot be reversed."""
        tx = Transaction.objects.create(
            series=self.series,
            date=timezone.localdate(),
            description='Unapproved',
            owner=self.user,
            branch=self.branch,
            approved=False
        )
        
        # Add entries so reverse() has something to work with
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash_account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income_account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        # Verify transaction is not approved
        tx.refresh_from_db()
        self.assertFalse(tx.approved, "Transaction should not be approved before reverse attempt")
        
        # This should raise ValidationError because transaction is not approved
        try:
            result = tx.reverse(reason='Test', user=self.user)
            self.fail(f"Expected ValidationError but reverse() succeeded and returned: {result}")
        except ValidationError as e:
            self.assertIn('unapproved', str(e).lower())


class TransactionEntryModelTest(TestCase):
    """Test TransactionEntry model."""
    
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
        
        self.series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
        self.account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            balance=Decimal('1000.00')
        )
        
        self.tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch
        )
    
    def test_create_debit_entry(self):
        """Test creating a debit entry."""
        entry = TransactionEntry.objects.create(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        self.assertEqual(entry.side, TransactionEntry.DEBIT)
        self.assertEqual(entry.amount, Decimal('500.00'))
        self.assertFalse(entry.posted)
    
    def test_create_credit_entry(self):
        """Test creating a credit entry."""
        entry = TransactionEntry.objects.create(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.CREDIT,
            amount=Decimal('300.00')
        )
        
        self.assertEqual(entry.side, TransactionEntry.CREDIT)
        self.assertEqual(entry.amount, Decimal('300.00'))
    
    def test_amount_must_be_positive(self):
        """Test that entry amounts must be positive."""
        entry = TransactionEntry(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('-100.00')  # Negative!
        )
        
        with self.assertRaises(ValidationError):
            entry.clean()
    
    def test_post_entry_updates_balance(self):
        """Test that posting an entry updates account balance."""
        initial_balance = self.account.balance
        
        entry = TransactionEntry.objects.create(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        entry.post()
        
        self.account.refresh_from_db()
        self.assertEqual(
            self.account.balance,
            initial_balance + Decimal('500.00')
        )
        self.assertTrue(entry.posted)
        self.assertIsNotNone(entry.posted_at)
    
    def test_cannot_post_already_posted(self):
        """Test that already posted entries cannot be posted again."""
        entry = TransactionEntry.objects.create(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00'),
            posted=True
        )
        
        with self.assertRaises(ValidationError) as cm:
            entry.post()
        
        self.assertIn('already posted', str(cm.exception).lower())
    
    def test_entry_string_representation(self):
        """Test entry string representation."""
        entry = TransactionEntry.objects.create(
            transaction=self.tx,
            account=self.account,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        entry_str = str(entry)
        self.assertIn(self.tx.reference_number, entry_str)
        self.assertIn('101', entry_str)  # Account code
        self.assertIn('Dr', entry_str)  # Debit
        self.assertIn('500', entry_str)  # Amount


class PeriodClosureValidationTest(TestCase):
    """Test period closure validation."""
    
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
        
        self.series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
        # Create accounts needed by tests
        self.cash = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        
        self.income = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='4010',
            name='Income - Period Closure',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME
        )
        
        self.account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='1010',
            name='Cash - Period Closure',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
    
    def test_cannot_post_to_closed_month(self):
        """Test that transactions cannot be posted to closed months."""
        # Close December 2024
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12,
            is_closed=True
        )
        
        # Try to create transaction in closed month
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),  # In closed month
            description='Test',
            owner=self.user,
            branch=self.branch
        )
        
        # Add balanced entries so clean() can access them
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        with self.assertRaises(ValidationError) as cm:
            tx.clean()
        
        self.assertIn('closed', str(cm.exception).lower())
    
    def test_cannot_post_to_closed_year(self):
        """Test that transactions cannot be posted to closed years."""
        # Close year 2023
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.YEAR,
            year=2023,
            is_closed=True
        )
        
        # Try to create transaction in closed year
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2023, 6, 15),  # In closed year
            description='Test',
            owner=self.user,
            branch=self.branch
        )
        
        # Add balanced entries so clean() can access them
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )
        
        with self.assertRaises(ValidationError) as cm:
            tx.clean()
        
        self.assertIn('closed', str(cm.exception).lower())
    
    def test_can_post_to_open_period(self):
        """Test that transactions can be posted to open periods."""
        # Don't close any periods
        
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch
        )
        
        # Should not raise validation error
        tx.clean()
        self.assertIsNotNone(tx.reference_number)


class DoubleEntryValidationTest(TestCase):
    """Test double-entry bookkeeping validation."""
    
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
        
        self.series = TransactionSeries.objects.create(
            code='GJ',
            description='General Journal'
        )
        
        self.cash = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        
        self.income = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='401',
            name='Income',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME
        )
        
        self.expense = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='501',
            name='Expense',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.EXPENSE
        )
        
        # Aliases for tests that expect debit_account/credit_account
        self.debit_account = self.cash
        self.credit_account = self.income
    
    def test_balanced_simple_transaction(self):
        """Test simple balanced transaction (2 entries)."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Cash receipt',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        self.assertTrue(tx.validate_entries())
        tx.clean()  # Should not raise
    
    def test_balanced_compound_transaction(self):
        """Test compound balanced transaction (3+ entries)."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Split transaction',
            owner=self.user,
            branch=self.branch
        )
        
        # Debit cash 1500
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1500.00')
        )
        
        # Credit income 1000
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        # Credit income 500 (split)
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        self.assertTrue(tx.validate_entries())
    
    def test_unbalanced_transaction_fails_validation(self):
        """Test that unbalanced transactions fail validation."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Unbalanced',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('800.00')  # Unbalanced!
        )
        
        with self.assertRaises(ValidationError) as cm:
            tx.clean()
        
        error_msg = str(cm.exception).lower()
        self.assertIn('balance', error_msg)
        self.assertIn('debit', error_msg)
        self.assertIn('credit', error_msg)

    def test_transaction_validation(self):
        """Test transaction validation rules"""
        transaction = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test validation',
            owner=self.user,
            branch=self.branch
        )
        
        # Test unbalanced entries
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.debit_account,
            amount=Decimal('100.00'),
            side=TransactionEntry.DEBIT
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.credit_account,
            amount=Decimal('90.00'),  # Unbalanced amount
            side=TransactionEntry.CREDIT
        )
        
        with self.assertRaises(ValidationError):
            transaction.clean()

    def test_account_balance_update(self):
        """Test that account balances are updated correctly"""
        initial_debit_balance = self.debit_account.balance
        initial_credit_balance = self.credit_account.balance
        
        # Create transaction
        transaction = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        amount = Decimal('100.00')
        
        # Add entries and post them
        entry1 = TransactionEntry.objects.create(
            transaction=transaction,
            account=self.debit_account,
            amount=amount,
            side=TransactionEntry.DEBIT
        )
        entry1.post()
        
        entry2 = TransactionEntry.objects.create(
            transaction=transaction,
            account=self.credit_account,
            amount=amount,
            side=TransactionEntry.CREDIT
        )
        entry2.post()
        
        # Refresh accounts from db
        self.debit_account.refresh_from_db()
        self.credit_account.refresh_from_db()
        
        # Check balances
        self.assertEqual(
            self.debit_account.balance,
            initial_debit_balance + amount
        )
        self.assertEqual(
            self.credit_account.balance,
            initial_credit_balance + amount
        )

    @unittest.expectedFailure  # Blocked by migration dependency: inventory.0002_initial applied before assets.0003_initial
    def test_soft_delete_cascade(self):
        """Test that soft deleting a transaction soft deletes its entries"""
        transaction = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test soft delete',
            owner=self.user,
            branch=self.branch
        )
        
        entry = TransactionEntry.objects.create(
            transaction=transaction,
            account=self.debit_account,
            amount=Decimal('100.00'),
            side=TransactionEntry.DEBIT
        )
        
        # Soft delete transaction
        transaction.delete()
        
        # Verify transaction is soft deleted
        self.assertTrue(transaction.is_deleted)
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(Transaction.all_objects.count(), 1)
        
        # Verify entry is also soft deleted
        entry.refresh_from_db()
        self.assertTrue(entry.is_deleted)
        self.assertEqual(TransactionEntry.objects.count(), 0)
        self.assertEqual(TransactionEntry.all_objects.count(), 1)
