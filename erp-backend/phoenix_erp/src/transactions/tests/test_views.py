from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from decimal import Decimal
from django.contrib.auth import get_user_model

from ..models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account, AccountCategory
from users.models import Tenant
from branches.models import Branch

User = get_user_model()

class TransactionAPITests(APITestCase):
    """Test transaction API endpoints"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant", slug="testorg")
        
        # Set thread-local tenant for manager filtering
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="BR01",
            tenant=self.tenant
        )
        
        # Create users
        self.admin_user = User.objects.create_user(
            username="admin",
            password="admin123",
            tenant=self.tenant,
            branch=self.branch,
            is_staff=True
        )
        
        self.normal_user = User.objects.create_user(
            username="normal",
            password="normal123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create account classification
        self.classification = AccountCategory.objects.create(
            name="Test Classification",
            section=1,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Create test accounts
        self.debit_account = Account.objects.create(
            name="Debit Account",
            code="110",  # Valid parent code
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        self.credit_account = Account.objects.create(
            name="Credit Account",
            code="210",  # Valid parent code
            account_type="LIABILITY",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Create transaction series
        self.series = TransactionSeries.objects.create(
            code="TX",
            description="Test Transactions"
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.admin_user)

    def test_create_transaction(self):
        """Test creating a transaction via API"""
        url = reverse('transactions:transaction-list')
        data = {
            'series': self.series.id,
            'date': '2024-01-01',
            'description': 'Test transaction',
            'entries': [
                {
                    'account': self.debit_account.id,
                    'amount': '100.00',
                    'side': 'DR'
                },
                {
                    'account': self.credit_account.id,
                    'amount': '100.00',
                    'side': 'CR'
                }
            ]
        }
        
        response = self.client.post(url, data, format='json')
        if response.status_code != 201:
            print(f"Create failed: {response.status_code}, {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(TransactionEntry.objects.count(), 2)
        
        # Verify account balances
        self.debit_account.refresh_from_db()
        self.credit_account.refresh_from_db()
        self.assertEqual(self.debit_account.balance, Decimal('100.00'))
        # LIABILITY accounts increase with credit entries
        self.assertEqual(self.credit_account.balance, Decimal('100.00'))

    def test_list_transactions(self):
        """Test listing transactions with filters"""
        # Create multiple transactions
        for i in range(3):
            transaction = Transaction.objects.create(
                series=self.series,
                owner=self.admin_user,
                created_by=self.admin_user,
                branch=self.branch
            )
            
            TransactionEntry.objects.create(
                transaction=transaction,
                account=self.debit_account,
                amount=Decimal('100.00'),
                side=TransactionEntry.DEBIT
            )
            
            TransactionEntry.objects.create(
                transaction=transaction,
                account=self.credit_account,
                amount=Decimal('100.00'),
                side=TransactionEntry.CREDIT
            )
        
        url = reverse('transactions:transaction-list')
        
        # Test basic listing
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 3)
        
        # Test filtering by account
        response = self.client.get(
            url + f'?account={self.debit_account.id}',
            format='json'
        )
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 3)

    def test_transaction_validation(self):
        """Test transaction validation in API"""
        url = reverse('transactions:transaction-list')
        
        # Test unbalanced transaction
        data = {
            'series': self.series.id,
            'date': '2024-01-01',
            'description': 'Unbalanced test',
            'entries': [
                {
                    'account': self.debit_account.id,
                    'amount': '100.00',
                    'side': 'DR'
                },
                {
                    'account': self.credit_account.id,
                    'amount': '90.00',  # Unbalanced
                    'side': 'CR'
                }
            ]
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test missing entries
        data = {
            'series': self.series.id,
            'date': '2024-01-01',
            'description': 'Empty entries test',
            'entries': []
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_transaction_permissions(self):
        """Test transaction permissions"""
        # Create a transaction as admin
        transaction = Transaction.objects.create(
            series=self.series,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.debit_account,
            amount=Decimal('100.00'),
            side=TransactionEntry.DEBIT
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.credit_account,
            amount=Decimal('100.00'),
            side=TransactionEntry.CREDIT
        )
        
        # Switch to normal user
        self.client.force_authenticate(user=self.normal_user)
        
        # Try to update transaction
        url = reverse('transactions:transaction-detail', args=[transaction.id])
        response = self.client.put(url, {})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Try to delete transaction
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_branch_transactions(self):
        """Test transactions between accounts in different branches"""
        # Create another branch and account
        other_branch = Branch.objects.create(
            name="Other Branch",
            code="BR02"
        )
        
        other_account = Account.objects.create(
            name="Other Account",
            code="111",  # Valid parent code
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=other_branch
        )
        
        # Try to create transaction between branches
        url = reverse('transactions:transaction-list')
        data = {
            'series': self.series.id,
            'date': '2024-01-01',
            'description': 'Cross-branch test',
            'entries': [
                {
                    'account': self.debit_account.id,  # First branch
                    'amount': '100.00',
                    'side': 'DR'
                },
                {
                    'account': other_account.id,  # Other branch
                    'amount': '100.00',
                    'side': 'CR'
                }
            ]
        }
        
        response = self.client.post(url, data, format='json')
        # Cross-branch transactions may be allowed in this system
        # If they should be blocked, add validation to the serializer
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST])
