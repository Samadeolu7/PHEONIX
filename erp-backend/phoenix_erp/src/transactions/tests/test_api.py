"""
Comprehensive test suite for transactions app API endpoints.

Tests cover:
- Transaction CRUD operations
- TransactionEntry management
- Transaction posting via API
- Transaction reversal via API
- Filtering and search
- Permissions and authentication
- Validation and error handling
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date

from ..models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account, Period
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class TransactionAPITest(TestCase):
    """Test Transaction API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        # Set thread-local tenant for manager filtering
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01',
            tenant=self.tenant
        )
        
        # Set user's branch for CurrentBranchDefault()
        self.user.branch = self.branch
        self.user.save()
        
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
            account_type=Account.ASSET,
            balance=Decimal('10000.00')
        )
        
        self.income = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='401',
            name='Income',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME,
            balance=Decimal('0.00')
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_transaction(self):
        """Test creating a transaction via API."""
        data = {
            'series': self.series.id,
            'date': '2024-12-15',
            'description': 'Test transaction',
            'branch': self.branch.id,
            'entries': [
                {
                    'account': self.cash.id,
                    'side': 'DR',
                    'amount': '500.00'
                },
                {
                    'account': self.income.id,
                    'side': 'CR',
                    'amount': '500.00'
                }
            ]
        }
        
        response = self.client.post('/api/transactions/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Transaction.objects.count(), 1)
        
        tx = Transaction.objects.first()
        self.assertEqual(tx.description, 'Test transaction')
        self.assertEqual(tx.entries.count(), 2)
    
    def test_create_transaction_requires_authentication(self):
        """Test that creating transactions requires authentication."""
        self.client.force_authenticate(user=None)
        
        data = {
            'series': self.series.id,
            'date': '2024-12-15',
            'description': 'Test',
            'branch': self.branch.id,
            'entries': []
        }
        
        response = self.client.post('/api/transactions/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_list_transactions(self):
        """Test listing transactions via API."""
        # Create test transactions
        for i in range(5):
            tx = Transaction.objects.create(
                series=self.series,
                date=date(2024, 12, i+1),
                description=f'Transaction {i+1}',
                owner=self.user,
                branch=self.branch
            )
            
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
        
        response = self.client.get('/api/transactions/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)
    
    def test_retrieve_transaction(self):
        """Test retrieving a single transaction via API."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test transaction',
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        response = self.client.get(f'/api/transactions/{tx.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['description'], 'Test transaction')
        self.assertEqual(len(response.data['entries']), 2)
    
    def test_filter_by_date_range(self):
        """Test filtering transactions by date range."""
        # Create transactions on different dates
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 1),
            description='Early transaction',
            owner=self.user,
            branch=self.branch
        )
        
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Mid transaction',
            owner=self.user,
            branch=self.branch
        )
        
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 31),
            description='Late transaction',
            owner=self.user,
            branch=self.branch
        )
        
        response = self.client.get(
            '/api/transactions/?date_from=2024-12-10&date_to=2024-12-20'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['description'], 'Mid transaction')
    
    def test_filter_by_approved_status(self):
        """Test filtering by approved status."""
        # Create approved and unapproved transactions
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Approved',
            owner=self.user,
            branch=self.branch,
            approved=True
        )
        
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Not approved',
            owner=self.user,
            branch=self.branch,
            approved=False
        )
        
        response = self.client.get('/api/transactions/?approved=true')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertTrue(response.data['results'][0]['approved'])
    
    def test_search_by_description(self):
        """Test searching transactions by description."""
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Cash receipt from customer',
            owner=self.user,
            branch=self.branch
        )
        
        Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Bank payment for supplies',
            owner=self.user,
            branch=self.branch
        )
        
        response = self.client.get('/api/transactions/?search=cash')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('Cash', response.data['results'][0]['description'])
    
    def test_post_transaction_action(self):
        """Test posting a transaction via API custom action."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Test',
            owner=self.user,
            branch=self.branch,
            approved=False
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        response = self.client.post(f'/api/transactions/{tx.id}/post/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        tx.refresh_from_db()
        self.assertTrue(tx.approved)
    
    def test_reverse_transaction_action(self):
        """Test reversing a transaction via API custom action."""
        tx = Transaction.objects.create(
            series=self.series,
            date=date(2024, 12, 15),
            description='Original',
            owner=self.user,
            branch=self.branch,
            approved=True
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('500.00')
        )
        
        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('500.00')
        )
        
        response = self.client.post(
            f'/api/transactions/{tx.id}/reverse/',
            {'reason': 'Test reversal'},
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        tx.refresh_from_db()
        self.assertTrue(tx.is_reversed)
        self.assertIsNotNone(tx.reversal_transaction)
    
    def test_cannot_create_unbalanced_transaction(self):
        """Test that API rejects unbalanced transactions."""
        data = {
            'series': self.series.id,
            'date': '2024-12-15',
            'description': 'Unbalanced',
            'branch': self.branch.id,
            'entries': [
                {
                    'account': self.cash.id,
                    'side': 'DR',
                    'amount': '500.00'
                },
                {
                    'account': self.income.id,
                    'side': 'CR',
                    'amount': '300.00'  # Unbalanced!
                }
            ]
        }
        
        response = self.client.post('/api/transactions/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('balance', str(response.data).lower())


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class TransactionSeriesAPITest(TestCase):
    """Test TransactionSeries API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        # Set thread-local tenant for manager filtering
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01',
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_series(self):
        """Test creating a transaction series via API."""
        data = {
            'code': 'INV',
            'description': 'Invoices'
        }
        
        response = self.client.post('/api/transactions/transaction-series/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TransactionSeries.objects.count(), 1)
        
        series = TransactionSeries.objects.first()
        self.assertEqual(series.code, 'INV')
    
    def test_list_series(self):
        """Test listing transaction series via API."""
        TransactionSeries.objects.create(code='GJ', description='General Journal')
        TransactionSeries.objects.create(code='CA', description='Cash')
        TransactionSeries.objects.create(code='SA', description='Sales')
        
        response = self.client.get('/api/transactions/transaction-series/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 3)
    
    def test_prevent_duplicate_series_code(self):
        """Test that duplicate series codes are rejected."""
        TransactionSeries.objects.create(code='GJ', description='General Journal')
        
        data = {
            'code': 'GJ',
            'description': 'Duplicate'
        }
        
        response = self.client.post('/api/transactions/transaction-series/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
