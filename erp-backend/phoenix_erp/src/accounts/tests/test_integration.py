from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from ..models import Account, AccountCategory
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant
from branches.models import Branch
from common.models import MenuGroup, MenuItem
from transactions.models import Transaction, TransactionEntry
from common.managers import set_current_tenant

User = get_user_model()

class AccountIntegrationTestCase(APITestCase):
    """Base class for account integration tests"""
    
    def setUp(self):
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        # Ensure middleware can pick up tenant during test requests
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB01"
        )
        
        # Create users
        self.admin_user = User.objects.create_user(
            username="admin",
            password="admin123",
            tenant=self.tenant,
            branch=self.branch,
            is_staff=True,
            is_superuser=True
        )
        # Make admin user the tenant owner so owner-based permission checks pass
        self.tenant.owner = self.admin_user
        self.tenant.save(update_fields=['owner'])
        
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
        
        # Create test account
        self.account = Account.objects.create(
            name="Test Account",
            code="TEST001",
            account_type="ASSET",
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

class AccountTransactionIntegrationTests(AccountIntegrationTestCase):
    """Test account and transaction interactions"""
    
    def test_account_balance_after_transaction(self):
        """Test that account balance is updated after transaction"""
        self.client.force_authenticate(user=self.admin_user)
        
        # Create another account for double entry
        account2 = Account.objects.create(
            name="Test Account 2",
            code="TEST002",
            account_type="LIABILITY",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Create transaction
        transaction_data = {
            "series": self.series.id,
            "date": "2024-01-01",
            "description": "Test balance update",
            "entries": [
                {
                    "account": self.account.id,
                    "amount": "100.00",
                    "side": "DR"
                },
                {
                    "account": account2.id,
                    "amount": "100.00",
                    "side": "CR"
                }
            ]
        }
        
        url = reverse('transactions:transaction-list')
        response = self.client.post(url, transaction_data, format='json')
        if response.status_code != status.HTTP_201_CREATED:
            print('DEBUG: transactions POST response', response.status_code, getattr(response, 'data', None))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify account balances
        self.account.refresh_from_db()
        account2.refresh_from_db()
        
        self.assertEqual(self.account.balance, 100.00)
        self.assertEqual(account2.balance, 100.00)

    def test_transaction_with_deleted_account(self):
        """Test handling of transactions when account is soft-deleted"""
        self.client.force_authenticate(user=self.admin_user)
        
        # Create transaction first
        account2 = Account.objects.create(
            name="Test Account 2",
            code="TEST002",
            account_type="LIABILITY",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        transaction = Transaction.objects.create(
            series=self.series,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=self.account,
            amount=100.00,
            side=TransactionEntry.DEBIT
        )
        
        TransactionEntry.objects.create(
            transaction=transaction,
            account=account2,
            amount=100.00,
            side=TransactionEntry.CREDIT
        )
        
        # Now soft-delete the account
        url = reverse('accounts:account-detail', args=[self.account.id])
        response = self.client.delete(url)
        if response.status_code != status.HTTP_204_NO_CONTENT:
            print('DEBUG: account DELETE response', response.status_code, getattr(response, 'data', None))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify we can still access the transaction
        url = reverse('transactions:transaction-detail', args=[transaction.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['entries']), 2)

class AccountMenuIntegrationTests(AccountIntegrationTestCase):
    """Test account and menu system interactions"""
    
    def test_menu_permissions_with_accounts(self):
        """Test menu items with account-related permissions"""
        self.client.force_authenticate(user=self.admin_user)
        
        # Create menu items with account permissions
        menu_group = MenuGroup.objects.create(
            tenant=self.tenant,
            code="accounts",
            label="Accounts",
            owner=self.admin_user,
            created_by=self.admin_user
        )
        
        menu_items = [
            {
                'code': 'account-list',
                'label': 'Account List',
                'route': '/accounts',
                'permission': 'accounts.view_account'
            },
            {
                'code': 'account-create',
                'label': 'Create Account',
                'route': '/accounts/create',
                'permission': 'accounts.add_account'
            }
        ]
        
        for item_data in menu_items:
            MenuItem.objects.create(
                group=menu_group,
                **item_data
            )
        
        # Test menu access with and without permissions
        url = reverse('common:menugroup-menu')
        
        # Admin user should see all items
        response = self.client.get(url)
        if response.status_code != status.HTTP_200_OK:
            print('DEBUG: menu response', response.status_code, getattr(response, 'data', None))
        if not response.data:
            print('DEBUG: menu response empty data', response.status_code, response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data[0]['items']), 2)
        
        # Normal user without permissions should see no items
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)  # No groups with accessible items
