from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from decimal import Decimal

from ..models import Account, AccountCategory
from users.models import Tenant
from branches.models import Branch

User = get_user_model()

class AccountViewSetTests(APITestCase):
    """Test account viewset endpoints"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB01"
        )
        # Ensure thread-local tenant is set so managers used by views/serializers
        # return objects for this tenant during API requests
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass

        # During tests, many objects are created without an explicit `tenant`.
        # Patch model save() for common account-related models to auto-fill
        # `tenant` from `owner.tenant` when missing. This mirrors the test_api
        # behavior and avoids editing many legacy tests.
        try:
            from accounts.models import Account, AccountCategory, Period

            def _make_patch(model):
                if hasattr(model, '_orig_test_save'):
                    return
                model._orig_test_save = model.save
                def _patched(self, *a, **k):
                    if hasattr(self, 'tenant') and not getattr(self, 'tenant', None):
                        owner = getattr(self, 'owner', None)
                        if owner and getattr(owner, 'tenant', None):
                            self.tenant = owner.tenant
                    return model._orig_test_save(self, *a, **k)
                model.save = _patched

            _make_patch(Account)
            _make_patch(AccountCategory)
            _make_patch(Period)
        except Exception:
            pass
        
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
        
        # Create classification
        self.classification = AccountCategory.objects.create(
            name="Test Classification",
            section=1,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.admin_user)

    def test_create_account(self):
        """Test creating an account via API"""
        url = reverse('accounts:account-list')
        data = {
            'name': 'New Account',
            'code': '150',  # Valid parent account code (100-599)
            'account_type': 'ASSET',
            'account_level': 'PARENT',
            'category': self.classification.id
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Account.objects.count(), 1)
        
        account = Account.objects.first()
        self.assertEqual(account.name, 'New Account')
        self.assertEqual(account.owner, self.admin_user)
        self.assertEqual(account.branch, self.branch)

    def test_list_accounts(self):
        """Test listing accounts with filters"""
        # Create test accounts
        accounts = [
            Account.objects.create(
                name=f"Account {i}",
                code=f"{100 + i}",  # Valid parent codes: 100, 101, 102, 103, 104
                account_type="ASSET" if i % 2 == 0 else "LIABILITY",
                account_level=Account.LEVEL_PARENT,
                category=self.classification,
                owner=self.admin_user,
                created_by=self.admin_user,
                branch=self.branch
            )
            for i in range(5)
        ]
        
        url = reverse('accounts:account-list')
        
        # Test basic listing
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Response might be paginated, check if it's a dict with results
        if isinstance(response.data, dict) and 'results' in response.data:
            self.assertEqual(len(response.data['results']), 5)
        else:
            self.assertEqual(len(response.data), 5)
        
        # Test account_type filter
        response = self.client.get(url + '?account_type=ASSET', format='json')
        if isinstance(response.data, dict) and 'results' in response.data:
            self.assertEqual(len(response.data['results']), 3)  # Should get 3 asset accounts
        else:
            self.assertEqual(len(response.data), 3)
        
        # Test search
        response = self.client.get(url + '?search=Account 1', format='json')
        if isinstance(response.data, dict) and 'results' in response.data:
            # Search should find "Account 1" - only code 101 has "1" in both name and code
            self.assertGreaterEqual(len(response.data['results']), 1)
        else:
            self.assertGreaterEqual(len(response.data), 1)
        
        # Test ordering
        response = self.client.get(url + '?ordering=code', format='json')
        if isinstance(response.data, dict) and 'results' in response.data:
            self.assertEqual(response.data['results'][0]['code'], '100')  # First account code
        else:
            self.assertEqual(response.data[0]['code'], '100')

    def test_update_account(self):
        """Test updating an account"""
        account = Account.objects.create(
            name="Test Account",
            code="200",  # Valid parent code
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('accounts:account-detail', args=[account.id])
        data = {
            'name': 'Updated Account',
            'code': '200',  # Keep same code
            'account_type': 'ASSET',
            'account_level': 'PARENT',
            'category': self.classification.id
        }
        
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        account.refresh_from_db()
        self.assertEqual(account.name, 'Updated Account')

    def test_delete_account(self):
        """Test soft-deleting an account"""
        account = Account.objects.create(
            name="Test Account",
            code="201",  # Valid parent code
            account_type="ASSET",
            account_level=Account.LEVEL_PARENT,
            category=self.classification,
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('accounts:account-detail', args=[account.id])
        response = self.client.delete(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify soft delete
        account.refresh_from_db()
        self.assertTrue(account.is_deleted)
        self.assertEqual(Account.objects.count(), 0)  # Should not be in default queryset
        # Ensure thread-local tenant is set before querying all_objects
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        self.assertEqual(Account.all_objects.count(), 1)  # Should be in all_objects

class AccountCategoryViewSetTests(APITestCase):
    """Test account category viewset endpoints"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB02"
        )
        # Ensure thread-local tenant is set so managers used by views/serializers
        # return objects for this tenant during API requests
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.user)

    def test_classification_crud(self):
        """Test CRUD operations for account classifications"""
        url = reverse('accounts:accountclassification-list')
        
        # Create
        data = {
            'name': 'Test Classification New',
            'code': 'TESTNEW',
            'section': 3  # Equity section (not used in setUp)
        }
        response = self.client.post(url, data, format='json')
        if response.status_code != 201:
            print(f"Create failed: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', response.data)
        
        classification_id = response.data['id']
        
        # Read - verify the newly created one exists
        detail_url = reverse('accounts:accountclassification-detail', args=[classification_id])
        response = self.client.get(detail_url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Test Classification New')
        
        # Update
        update_data = {
            'name': 'Updated Classification',
            'code': 'TESTNEW',
            'section': 3
        }
        response = self.client.put(detail_url, update_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Classification')
        
        # Delete
        response = self.client.delete(detail_url, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify it's deleted
        response = self.client.get(detail_url, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
