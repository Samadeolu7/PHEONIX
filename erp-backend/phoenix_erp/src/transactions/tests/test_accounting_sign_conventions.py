"""
Test Accounting Sign Conventions and Trial Balance Integrity

This test suite verifies the fundamental accounting equation:
    Assets = Liabilities + Equity

And ensures that:
1. Debits always equal credits in every transaction
2. Trial balance always sums to zero
3. Account balances follow proper sign conventions
4. No unbalanced transactions can be posted
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from accounts.models import Account
from branches.models import Branch
from users.models import Tenant
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class AccountingSignConventionTests(TestCase):
    """Test that accounting sign conventions are enforced correctly"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant and branch
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            slug="test"
        )
        
        self.branch = Branch.objects.create(
            name="Main Branch",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass",
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create transaction series
        self.series = TransactionSeries.objects.create(
            code="JE",
            description="Journal Entry"
        )
        
        # Create chart of accounts
        self.cash = Account.objects.create(
            code="1010",
            name="Cash",
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.accounts_receivable = Account.objects.create(
            code="1020",
            name="Accounts Receivable",
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.inventory = Account.objects.create(
            code="1030",
            name="Inventory",
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.accounts_payable = Account.objects.create(
            code="2010",
            name="Accounts Payable",
            account_type=Account.LIABILITY,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.capital = Account.objects.create(
            code="3010",
            name="Owner's Capital",
            account_type=Account.EQUITY,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.revenue = Account.objects.create(
            code="4010",
            name="Sales Revenue",
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
        
        self.cogs = Account.objects.create(
            code="5010",
            name="Cost of Goods Sold",
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_CHILD,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
            balance=Decimal('0.00')
        )
    
    def test_debit_increases_asset_account(self):
        """Test that debiting an asset account increases its balance"""
        # Create transaction: Dr Cash 1000
        txn = Transaction.objects.create(
            series=self.series,
            description="Capital contribution",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Cash 1000
        entry1 = TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        # Cr: Capital 1000
        entry2 = TransactionEntry.objects.create(
            transaction=txn,
            account=self.capital,
            side=TransactionEntry.CREDIT,
            amount=Decimal('1000.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh accounts
        self.cash.refresh_from_db()
        self.capital.refresh_from_db()
        
        # Cash (asset) should INCREASE with debit
        self.assertEqual(self.cash.balance, Decimal('1000.00'))
        # Capital (equity) should INCREASE with credit (stored as negative)
        self.assertEqual(self.capital.balance, Decimal('-1000.00'))
        
        # Trial balance should sum to zero
        trial_balance = self.cash.balance + self.capital.balance
        self.assertEqual(trial_balance, Decimal('0.00'))
    
    def test_credit_decreases_asset_account(self):
        """Test that crediting an asset account decreases its balance"""
        # Setup: Cash starts with 1000
        self.cash.balance = Decimal('1000.00')
        self.cash.save()
        
        # Create transaction: Cr Cash 300 (payment)
        txn = Transaction.objects.create(
            series=self.series,
            description="Pay supplier",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Accounts Payable 300 (reduce liability)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accounts_payable,
            side=TransactionEntry.DEBIT,
            amount=Decimal('300.00')
        )
        
        # Cr: Cash 300 (reduce asset)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash,
            side=TransactionEntry.CREDIT,
            amount=Decimal('300.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh account
        self.cash.refresh_from_db()
        
        # Cash should DECREASE with credit
        self.assertEqual(self.cash.balance, Decimal('700.00'))
    
    def test_credit_increases_liability_account(self):
        """Test that crediting a liability account increases its balance"""
        # Create transaction: purchase on credit
        txn = Transaction.objects.create(
            series=self.series,
            description="Purchase inventory on credit",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Inventory 500
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.inventory,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        # Cr: Accounts Payable 500
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accounts_payable,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh accounts
        self.inventory.refresh_from_db()
        self.accounts_payable.refresh_from_db()
        
        # Inventory (asset) should INCREASE with debit
        self.assertEqual(self.inventory.balance, Decimal('500.00'))
        # AP (liability) should INCREASE with credit (stored as negative)
        self.assertEqual(self.accounts_payable.balance, Decimal('-500.00'))
        
        # Trial balance
        trial_balance = self.inventory.balance + self.accounts_payable.balance
        self.assertEqual(trial_balance, Decimal('0.00'))
    
    def test_debit_decreases_liability_account(self):
        """Test that debiting a liability account decreases its balance"""
        # Setup: AP has balance of -500 (we owe 500)
        self.accounts_payable.balance = Decimal('-500.00')
        self.accounts_payable.save()
        
        self.cash.balance = Decimal('1000.00')
        self.cash.save()
        
        # Create transaction: pay off liability
        txn = Transaction.objects.create(
            series=self.series,
            description="Pay supplier",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Accounts Payable 200 (reduce liability)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accounts_payable,
            side=TransactionEntry.DEBIT,
            amount=Decimal('200.00')
        )
        
        # Cr: Cash 200 (reduce asset)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash,
            side=TransactionEntry.CREDIT,
            amount=Decimal('200.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh account
        self.accounts_payable.refresh_from_db()
        
        # AP should DECREASE (become less negative) with debit
        # Was -500, debited 200, now -300
        self.assertEqual(self.accounts_payable.balance, Decimal('-300.00'))
    
    def test_credit_increases_revenue_account(self):
        """Test that crediting a revenue account increases income"""
        # Create transaction: record sale
        txn = Transaction.objects.create(
            series=self.series,
            description="Sale on credit",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Accounts Receivable 750
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.accounts_receivable,
            side=TransactionEntry.DEBIT,
            amount=Decimal('750.00')
        )
        
        # Cr: Revenue 750
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('750.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh accounts
        self.accounts_receivable.refresh_from_db()
        self.revenue.refresh_from_db()
        
        # AR (asset) should INCREASE with debit
        self.assertEqual(self.accounts_receivable.balance, Decimal('750.00'))
        # Revenue (income) should INCREASE with credit (stored as negative)
        self.assertEqual(self.revenue.balance, Decimal('-750.00'))
        
        # Trial balance
        trial_balance = self.accounts_receivable.balance + self.revenue.balance
        self.assertEqual(trial_balance, Decimal('0.00'))
    
    def test_debit_increases_expense_account(self):
        """Test that debiting an expense account increases expenses"""
        # Create transaction: record COGS
        txn = Transaction.objects.create(
            series=self.series,
            description="Cost of goods sold",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: COGS 300
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cogs,
            side=TransactionEntry.DEBIT,
            amount=Decimal('300.00')
        )
        
        # Cr: Inventory 300
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.inventory,
            side=TransactionEntry.CREDIT,
            amount=Decimal('300.00')
        )
        
        # Post transaction
        txn.post()
        
        # Refresh accounts
        self.cogs.refresh_from_db()
        self.inventory.refresh_from_db()
        
        # COGS (expense) should INCREASE with debit
        self.assertEqual(self.cogs.balance, Decimal('300.00'))
        # Inventory (asset) should DECREASE with credit
        self.assertEqual(self.inventory.balance, Decimal('-300.00'))
    
    def test_unbalanced_transaction_rejected(self):
        """Test that unbalanced transactions cannot be posted"""
        # Create unbalanced transaction
        txn = Transaction.objects.create(
            series=self.series,
            description="Unbalanced entry (should fail)",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Dr: Cash 1000
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('1000.00')
        )
        
        # Cr: Revenue 800 (WRONG - should be 1000)
        TransactionEntry.objects.create(
            transaction=txn,
            account=self.revenue,
            side=TransactionEntry.CREDIT,
            amount=Decimal('800.00')  # Unbalanced!
        )
        
        # Posting should fail
        with self.assertRaises(ValidationError) as context:
            txn.post()
        
        self.assertIn('UNBALANCED', str(context.exception))
    
    def test_negative_amount_rejected(self):
        """Test that negative amounts are rejected"""
        txn = Transaction.objects.create(
            series=self.series,
            description="Invalid negative amount",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Try to create entry with negative amount
        entry = TransactionEntry(
            transaction=txn,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('-100.00')  # Invalid!
        )
        
        # Validation should fail
        with self.assertRaises(ValidationError) as context:
            entry.full_clean()
        
        self.assertIn('POSITIVE', str(context.exception))
    
    def test_trial_balance_always_zero(self):
        """Test that trial balance sums to zero after multiple transactions"""
        # Transaction 1: Capital contribution
        txn1 = Transaction.objects.create(
            series=self.series,
            description="Capital",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        TransactionEntry.objects.create(
            transaction=txn1, account=self.cash,
            side=TransactionEntry.DEBIT, amount=Decimal('10000.00')
        )
        TransactionEntry.objects.create(
            transaction=txn1, account=self.capital,
            side=TransactionEntry.CREDIT, amount=Decimal('10000.00')
        )
        txn1.post()
        
        # Transaction 2: Purchase inventory
        txn2 = Transaction.objects.create(
            series=self.series,
            description="Buy inventory",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        TransactionEntry.objects.create(
            transaction=txn2, account=self.inventory,
            side=TransactionEntry.DEBIT, amount=Decimal('5000.00')
        )
        TransactionEntry.objects.create(
            transaction=txn2, account=self.accounts_payable,
            side=TransactionEntry.CREDIT, amount=Decimal('5000.00')
        )
        txn2.post()
        
        # Transaction 3: Make sale
        txn3 = Transaction.objects.create(
            series=self.series,
            description="Sale",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        TransactionEntry.objects.create(
            transaction=txn3, account=self.accounts_receivable,
            side=TransactionEntry.DEBIT, amount=Decimal('8000.00')
        )
        TransactionEntry.objects.create(
            transaction=txn3, account=self.revenue,
            side=TransactionEntry.CREDIT, amount=Decimal('8000.00')
        )
        txn3.post()
        
        # Transaction 4: Record COGS
        txn4 = Transaction.objects.create(
            series=self.series,
            description="COGS",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        TransactionEntry.objects.create(
            transaction=txn4, account=self.cogs,
            side=TransactionEntry.DEBIT, amount=Decimal('3000.00')
        )
        TransactionEntry.objects.create(
            transaction=txn4, account=self.inventory,
            side=TransactionEntry.CREDIT, amount=Decimal('3000.00')
        )
        txn4.post()
        
        # Calculate trial balance
        all_accounts = Account.objects.filter(
            branch=self.branch,
            account_level=Account.LEVEL_CHILD
        )
        
        trial_balance = sum(acc.balance for acc in all_accounts)
        
        # Trial balance MUST equal zero
        self.assertEqual(
            trial_balance,
            Decimal('0.00'),
            f"Trial balance should be zero, got {trial_balance}"
        )
        
        # Verify accounting equation: Assets = Liabilities + Equity
        assets = sum(
            acc.balance for acc in all_accounts
            if acc.account_type in [Account.ASSET]
        )
        
        liabilities = sum(
            acc.balance for acc in all_accounts
            if acc.account_type == Account.LIABILITY
        )
        
        equity = sum(
            acc.balance for acc in all_accounts
            if acc.account_type in [Account.EQUITY, Account.INCOME]
        )
        
        expenses = sum(
            acc.balance for acc in all_accounts
            if acc.account_type == Account.EXPENSE
        )
        
        # Assets + Expenses = Liabilities + Equity + Revenue
        # In signed form: Assets + Expenses + Liabilities + Equity + Revenue = 0
        accounting_equation = assets + expenses + liabilities + equity
        self.assertEqual(
            accounting_equation,
            Decimal('0.00'),
            f"Accounting equation violated: {assets} + {expenses} + {liabilities} + {equity} = {accounting_equation}"
        )
    
    def test_verify_trial_balance_impact_method(self):
        """Test the Transaction.verify_trial_balance_impact() method"""
        # Create balanced transaction
        txn = Transaction.objects.create(
            series=self.series,
            description="Test trial balance verification",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        TransactionEntry.objects.create(
            transaction=txn, account=self.cash,
            side=TransactionEntry.DEBIT, amount=Decimal('500.00')
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.capital,
            side=TransactionEntry.CREDIT, amount=Decimal('500.00')
        )
        
        # Should verify successfully
        self.assertTrue(txn.verify_trial_balance_impact())
        
        # Create unbalanced transaction
        txn2 = Transaction.objects.create(
            series=self.series,
            description="Unbalanced",
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        TransactionEntry.objects.create(
            transaction=txn2, account=self.cash,
            side=TransactionEntry.DEBIT, amount=Decimal('500.00')
        )
        TransactionEntry.objects.create(
            transaction=txn2, account=self.capital,
            side=TransactionEntry.CREDIT, amount=Decimal('300.00')
        )
        
        # Should fail verification
        self.assertFalse(txn2.verify_trial_balance_impact())
