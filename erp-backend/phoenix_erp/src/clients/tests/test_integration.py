from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from django.utils import timezone

from ..models import Client, ClientClassification
from transactions.models import Transaction, TransactionEntry
from accounts.models import Account, AccountClassification
from loans.models import Loan
from users.models import Tenant, Branch

User = get_user_model()

class ClientIntegrationTests(TestCase):
    """Test client interactions with other models"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create client
        self.client = Client.objects.create(
            name="Test Client",
            marital_status="single",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create account classification
        self.acc_classification = AccountClassification.objects.create(
            name="Test Classification",
            code="TEST",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.loan_account = Account.objects.create(
            name="Loan Account",
            code="LOAN001",
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.acc_classification,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        self.cash_account = Account.objects.create(
            name="Cash Account",
            code="CASH001",
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.acc_classification,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )

    def test_client_loan_workflow(self):
        """Test full client loan workflow"""
        # Create loan
        loan = Loan.objects.create(
            client=self.client,
            amount=Decimal('1000.00'),
            term=12,  # months
            interest_rate=Decimal('15.00'),
            status='approved',
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create loan disbursement transaction
        disbursement = Transaction.objects.create(
            client=self.client,
            transaction_type='loan_disbursement',
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Add transaction entries
        TransactionEntry.objects.create(
            transaction=disbursement,
            account=self.loan_account,
            amount=loan.amount,
            side=TransactionEntry.DEBIT
        )
        
        TransactionEntry.objects.create(
            transaction=disbursement,
            account=self.cash_account,
            amount=loan.amount,
            side=TransactionEntry.CREDIT
        )
        
        # Verify account balances
        self.loan_account.refresh_from_db()
        self.cash_account.refresh_from_db()
        
        self.assertEqual(self.loan_account.balance, loan.amount)
        self.assertEqual(self.cash_account.balance, -loan.amount)
        
        # Test loan repayment
        repayment_amount = Decimal('100.00')
        
        repayment = Transaction.objects.create(
            client=self.client,
            transaction_type='loan_repayment',
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=repayment,
            account=self.cash_account,
            amount=repayment_amount,
            side=TransactionEntry.DEBIT
        )
        
        TransactionEntry.objects.create(
            transaction=repayment,
            account=self.loan_account,
            amount=repayment_amount,
            side=TransactionEntry.CREDIT
        )
        
        # Verify updated balances
        self.loan_account.refresh_from_db()
        self.cash_account.refresh_from_db()
        
        self.assertEqual(
            self.loan_account.balance,
            loan.amount - repayment_amount
        )
        self.assertEqual(
            self.cash_account.balance,
            -loan.amount + repayment_amount
        )

    def test_client_deletion_constraints(self):
        """Test constraints when trying to delete a client with active loans/transactions"""
        # Create loan
        loan = Loan.objects.create(
            client=self.client,
            amount=Decimal('1000.00'),
            term=12,
            interest_rate=Decimal('15.00'),
            status='approved',
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Create transaction
        transaction = Transaction.objects.create(
            client=self.client,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Try to delete client
        with self.assertRaises(Exception):
            self.client.delete()
        
        # Verify client still exists
        self.client.refresh_from_db()
        self.assertFalse(self.client.is_deleted)
        
        # Clean up loan and transaction
        loan.delete()
        transaction.delete()
        
        # Now client can be deleted
        self.client.delete()
        self.client.refresh_from_db()
        self.assertTrue(self.client.is_deleted)
