from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db.models import Sum

from ..models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account, AccountCategory
from users.models import Tenant
from branches.models import Branch
from clients.models import Client

User = get_user_model()

class TransactionIntegrationTests(TestCase):
    """Test transaction interactions with other models"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="BR01"
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create account classification
        self.classification = AccountCategory.objects.create(
            name="Test Classification",
            section=1,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.cash_account = Account.objects.create(
            name="Cash",
            code="CASH001",
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        self.loan_account = Account.objects.create(
            name="Loans",
            code="LOAN001",
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create transaction series
        self.series = TransactionSeries.objects.create(
            code="TX",
            description="Test Transactions"
        )

    def test_client_loan_transaction(self):
        """Test creating a loan disbursement transaction"""
        # Create client
        client = Client.objects.create(
            first_name="Test",
            last_name="Client",
            phone_primary="1234567890",
            gender="male",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create loan disbursement transaction
        transaction = Transaction.objects.create(
            series=self.series,
            description="Loan Disbursement",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        amount = Decimal('1000.00')
        
        # Debit loan account
        entry1 = TransactionEntry.objects.create(
            transaction=transaction,
            account=self.loan_account,
            amount=amount,
            side=TransactionEntry.DEBIT
        )
        entry1.post()
        
        # Credit cash account
        entry2 = TransactionEntry.objects.create(
            transaction=transaction,
            account=self.cash_account,
            amount=amount,
            side=TransactionEntry.CREDIT
        )
        entry2.post()
        
        # Verify account balances
        self.loan_account.refresh_from_db()
        self.cash_account.refresh_from_db()
        
        self.assertEqual(self.loan_account.balance, amount)
        self.assertEqual(self.cash_account.balance, -amount)

    def test_multiple_branch_transactions(self):
        """Test transactions across multiple branches"""
        # Create another branch
        branch2 = Branch.objects.create(
            name="Branch 2",
            code="BR02"
        )
        
        # Create accounts in branch 2
        cash2 = Account.objects.create(
            name="Cash Branch 2",
            code="CASH002",
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.user,
            created_by=self.user,
            branch=branch2
        )
        
        # Try inter-branch transaction
        transaction = Transaction.objects.create(
            series=self.series,
            description="Branch Transfer",
            owner=self.user,
            created_by=self.user,
            branch=self.branch  # First branch
        )
        
        amount = Decimal('500.00')
        
        # This should raise a validation error
        with self.assertRaises(ValidationError):
            entry1 = TransactionEntry.objects.create(
                transaction=transaction,
                account=self.cash_account,  # Branch 1
                amount=amount,
                side=TransactionEntry.CREDIT
            )
            
            entry2 = TransactionEntry.objects.create(
                transaction=transaction,
                account=cash2,  # Branch 2 - different branch!
                amount=amount,
                side=TransactionEntry.DEBIT
            )
            
            # Validate the cross-branch entry
            entry2.clean()

    def test_account_balance_history(self):
        """Test account balance history through transactions"""
        initial_balance = self.cash_account.balance
        transactions = []
        
        # Create multiple transactions
        amounts = [100, 200, -150, 300, -50]  # Positive for debit, negative for credit
        
        for amount in amounts:
            transaction = Transaction.objects.create(
                series=self.series,
                owner=self.user,
                created_by=self.user,
                branch=self.branch
            )
            
            entry1 = TransactionEntry.objects.create(
                transaction=transaction,
                account=self.cash_account,
                amount=abs(amount),
                side=TransactionEntry.DEBIT if amount > 0 else TransactionEntry.CREDIT
            )
            entry1.post()
            
            # Create offsetting entry
            entry2 = TransactionEntry.objects.create(
                transaction=transaction,
                account=self.loan_account,
                amount=abs(amount),
                side=TransactionEntry.CREDIT if amount > 0 else TransactionEntry.DEBIT
            )
            entry2.post()
            
            transactions.append(transaction)
        
        # Verify final balance
        self.cash_account.refresh_from_db()
        expected_balance = initial_balance + sum(amounts)
        self.assertEqual(self.cash_account.balance, expected_balance)
        
        # Verify balance after each transaction matches running total
        running_total = initial_balance
        for i, amount in enumerate(amounts):
            running_total += amount
            # Get entries for this specific transaction and earlier transactions only
            entries_to_date = TransactionEntry.objects.filter(
                account=self.cash_account,
                posted=True,
                transaction_id__in=[t.id for t in transactions[:i+1]]
            )
            
            balance_to_date = initial_balance + sum(
                entry.amount * (1 if entry.side == TransactionEntry.DEBIT else -1)
                for entry in entries_to_date
            )
            
            self.assertEqual(balance_to_date, running_total)
