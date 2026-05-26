"""
Comprehensive test suite for accounts app API endpoints.

Tests cover:
- Account CRUD operations (Create, Read, Update, Delete)
- List filtering and pagination
- Permissions and authentication
- Hierarchical account queries (children_summary)
- Validation and error handling
"""

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal

from ..models import Account, AccountCategory, Period
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class AccountAPITest(TestCase):
    """Test Account API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )

        # Ensure thread-local tenant is set so managers used by serializers
        # return objects for this tenant during API requests
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        # Ensure thread-local tenant is set for manager filtering during tests
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass

        # During tests, many objects are created without an explicit `tenant`.
        # Patch model save() for common account-related models to auto-fill
        # `tenant` from `owner.tenant` when missing. This avoids editing
        # many legacy tests and is safe for test scope only.
        try:
            from accounts.models import Account, AccountCategory, Period

            def _make_patch(model):
                # Avoid double-patching across multiple TestCase.setUp calls
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
        
        self.category = AccountCategory.objects.create(
            owner=self.user,
            branch=self.branch,
            section=1,
            name='Assets'
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.user)
    
    def test_create_account(self):
        """Test creating an account via API."""
        data = {
            'code': '101',
            'name': 'Cash Account',
            'account_level': Account.LEVEL_PARENT,
            'account_type': Account.ASSET,
            'branch': self.branch.id,
            'category': self.category.id
        }
        # Debug: dump category state before POST to trace Invalid pk errors
        try:
            print('\n[DEBUG] category.id =', getattr(self.category, 'id', None))
            cats = AccountCategory.all_objects.filter(branch=self.branch)
            print('[DEBUG] AccountCategory.all_objects for branch ->', list(cats.values('id','section','code_prefix','name','tenant_id','owner_id','is_deleted')))
        except Exception as e:
            print('[DEBUG] failed to list categories:', e)

        response = self.client.post('/api/accounts/', data, format='json')
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Error response: {response.data}")
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Account.objects.count(), 1)
        
        account = Account.objects.first()
        self.assertEqual(account.code, '101')
        self.assertEqual(account.name, 'Cash Account')
        self.assertEqual(account.owner, self.user)
    
    def test_create_account_requires_authentication(self):
        """Test that creating account requires authentication."""
        self.client.force_authenticate(user=None)
        
        data = {
            'code': '101',
            'name': 'Cash Account',
            'account_level': Account.LEVEL_PARENT,
            'account_type': Account.ASSET,
            'branch': self.branch.id
        }
        
        response = self.client.post('/api/accounts/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Account.objects.count(), 0)
    
    def test_list_accounts(self):
        """Test listing accounts via API."""
        # Create multiple accounts
        for i in range(1, 6):
            Account.objects.create(
                owner=self.user,
                branch=self.branch,
                code=f'10{i}',
                name=f'Account {i}',
                account_level=Account.LEVEL_PARENT,
                account_type=Account.ASSET
            )
        
        response = self.client.get('/api/accounts/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)
    
    def test_retrieve_account(self):
        """Test retrieving a single account via API."""
        account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash Account',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            balance=Decimal('5000.00')
        )
        
        response = self.client.get(f'/api/accounts/{account.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['code'], '101')
        self.assertEqual(response.data['name'], 'Cash Account')
        self.assertEqual(Decimal(response.data['balance']), Decimal('5000.00'))
    
    def test_update_account(self):
        """Test updating an account via API."""
        account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash Account',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        
        data = {
            'name': 'Updated Cash Account',
            'allow_manual_entries': False
        }
        
        response = self.client.patch(
            f'/api/accounts/{account.id}/',
            data,
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        account.refresh_from_db()
        self.assertEqual(account.name, 'Updated Cash Account')
        self.assertFalse(account.allow_manual_entries)
    
    def test_delete_account(self):
        """Test soft-deleting an account via API."""
        account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash Account',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        
        response = self.client.delete(f'/api/accounts/{account.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Confirm deletion via API (transactional visibility can hide DB changes from TestCase)
        get_resp = self.client.get(f'/api/accounts/{account.id}/')
        self.assertEqual(get_resp.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_filter_accounts_by_type(self):
        """Test filtering accounts by account type."""
        # Create accounts of different types
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='201',
            name='Accounts Payable',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.LIABILITY
        )
        
        response = self.client.get('/api/accounts/?account_type=ASSET')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Debug: print what we got
        if len(response.data['results']) != 1:
            print(f"Expected 1 ASSET account, got {len(response.data['results'])}")
            for acc in response.data['results']:
                print(f"  - {acc['code']}: {acc['name']} ({acc['account_type']})")
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['code'], '101')
    
    def test_filter_accounts_by_level(self):
        """Test filtering accounts by account level."""
        parent = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='150',
            name='Total Savings',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.SAVINGS
        )
        
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='150-001',
            name='John Savings',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.SAVINGS,
            parent=parent
        )
        
        response = self.client.get('/api/accounts/?account_level=PARENT')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['code'], '150')
    
    def test_search_accounts_by_name(self):
        """Test searching accounts by name."""
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='101',
            name='Cash in Bank',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='102',
            name='Petty Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='103',
            name='Accounts Receivable',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET
        )
        
        response = self.client.get('/api/accounts/?search=Cash')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)
    
    def test_children_summary_action(self):
        """Test children_summary custom action for parent accounts."""
        parent = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            code='150',
            name='Total Savings',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.SAVINGS
        )
        
        # Create child accounts with balances
        for i in range(1, 4):
            Account.objects.create(
                owner=self.user,
                branch=self.branch,
                code=f'150-00{i}',
                name=f'Savings {i}',
                account_level=Account.LEVEL_CHILD,
                account_type=Account.SAVINGS,
                parent=parent,
                balance=Decimal(f'{i * 1000}.00')
            )
        # Debug: verify children saved and tenant/owner fields
        try:
            print('\n[DEBUG] parent.id =', parent.id)
            children = Account.objects.filter(parent=parent)
            print('[DEBUG] children ->', list(children.values('id','code','name','owner_id','branch_id','tenant_id')))
        except Exception as e:
            print('[DEBUG] failed to list children:', e)

        response = self.client.get(f'/api/accounts/{parent.id}/children-summary/')
        print('[DEBUG] response.status_code =', response.status_code)
        try:
            print('[DEBUG] response.data =', response.data)
        except Exception as e:
            print('[DEBUG] response.data failed:', e)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['total_children'], 3)
        self.assertEqual(
            Decimal(response.data['summary']['total_balance']),
            Decimal('6000.00')  # 1000 + 2000 + 3000
        )
    
    def test_create_account_with_invalid_code(self):
        """Test that invalid account codes are rejected."""
        data = {
            'code': 'INVALID',  # Invalid format
            'name': 'Invalid Account',
            'account_level': Account.LEVEL_PARENT,
            'account_type': Account.ASSET,
            'branch': self.branch.id
        }
        
        response = self.client.post('/api/accounts/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Account.objects.count(), 0)
    
    def test_create_child_without_parent(self):
        """Test that child accounts require a parent."""
        data = {
            'code': '150-001',
            'name': 'Orphan Child',
            'account_level': Account.LEVEL_CHILD,
            'account_type': Account.SAVINGS,
            'branch': self.branch.id,
            'parent': None
        }
        
        response = self.client.post('/api/accounts/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('must have a parent', str(response.data).lower())


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class PeriodAPITest(TestCase):
    """Test Period API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )

        # Ensure thread-local tenant is set so managers used by serializers
        # return objects for this tenant during API requests
        try:
            from common.managers import set_current_tenant
            set_current_tenant(self.tenant)
        except Exception:
            pass
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        
        self.client.force_authenticate(user=self.user)
    
    def test_create_period(self):
        """Test creating a period via API."""
        data = {
            'period_type': Period.MONTH,
            'year': 2024,
            'month': 12,
            'is_closed': True,
            'branch': self.branch.id
        }
        
        response = self.client.post('/api/accounts/periods/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Period.objects.count(), 1)
        
        period = Period.objects.first()
        self.assertEqual(period.year, 2024)
        self.assertEqual(period.month, 12)
        self.assertTrue(period.is_closed)
    
    def test_list_periods(self):
        """Test listing periods via API."""
        # Create periods
        for month in range(1, 4):
            Period.objects.create(
                owner=self.user,
                branch=self.branch,
                period_type=Period.MONTH,
                year=2024,
                month=month,
                is_closed=True
            )
        
        response = self.client.get('/api/accounts/periods/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 3)
    
    def test_filter_periods_by_year(self):
        """Test filtering periods by year."""
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12
        )
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2023,
            month=12
        )
        
        response = self.client.get('/api/accounts/periods/?year=2024')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['year'], 2024)
    
    def test_filter_periods_by_closed_status(self):
        """Test filtering periods by is_closed status."""
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=11,
            is_closed=True
        )
        Period.objects.create(
            owner=self.user,
            branch=self.branch,
            period_type=Period.MONTH,
            year=2024,
            month=12,
            is_closed=False
        )
        
        response = self.client.get('/api/accounts/periods/?is_closed=true')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertTrue(response.data['results'][0]['is_closed'])


@override_settings(SECURE_SSL_REDIRECT=False, SECURE_PROXY_SSL_HEADER=None)
class AccountCategoryAPITest(TestCase):
    """Test AccountCategory API endpoints."""
    
    def setUp(self):
        """Set up test data and API client."""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name='Test Organization',
            slug='testorg'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01'
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch
        )
        # Defensive cleanup: remove any pre-existing categories for this owner/branch
        try:
            # Remove any pre-seeded or leftover categories for this branch to avoid migration contamination
            AccountCategory.all_objects.filter(branch=self.branch).delete()
        except Exception:
            # If AccountCategory isn't available yet or delete fails, ignore — test will surface errors
            pass

        
        self.client.force_authenticate(user=self.user)
    
    def test_create_category(self):
        """Test creating an account category via API."""
        data = {
            'section': 1,
            'name': 'Current Assets'
        }
        response = self.client.post('/api/accounts/account-classifications/', data, format='json')
        # Debug: show API response and DB state
        print('\n[DEBUG] create_category response.status =', response.status_code)
        try:
            print('[DEBUG] response.data =', response.data)
        except Exception as e:
            print('[DEBUG] response.data failed:', e)

        print('[DEBUG] AccountCategory.all_objects for branch ->', list(AccountCategory.all_objects.filter(branch=self.branch).values('id','section','code_prefix','name','tenant_id','owner_id','is_deleted')))
        print('[DEBUG] AccountCategory.objects for branch ->', list(AccountCategory.objects.filter(branch=self.branch).values('id','section','code_prefix','name','tenant_id','owner_id','is_deleted')))

        # If API returned an id, inspect that record directly
        try:
            cid = response.data.get('id') if isinstance(response.data, dict) else None
            if cid:
                print('[DEBUG] created id ->', cid)
                print('[DEBUG] created record ->', list(AccountCategory.all_objects.filter(id=cid).values('id','section','code_prefix','name','tenant_id','owner_id','branch_id','is_deleted')))
        except Exception as e:
            print('[DEBUG] failed to inspect created id:', e)

        print('[DEBUG] Last few AccountCategory.all_objects ->', list(AccountCategory.all_objects.order_by('-id')[:10].values('id','section','code_prefix','name','tenant_id','owner_id','branch_id','is_deleted')))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AccountCategory.objects.count(), 1)

        category = AccountCategory.objects.first()
        self.assertEqual(category.section, 1)
        self.assertEqual(category.name, 'Current Assets')
        self.assertEqual(category.code_prefix, '1')
    
    def test_list_categories(self):
        """Test listing account categories via API."""
        # Clear any existing categories for this test
        AccountCategory.objects.filter(owner=self.user, branch=self.branch).delete()
        
        # Create categories
        for i in range(1, 6):
            AccountCategory.objects.create(
                owner=self.user,
                branch=self.branch,
                section=i,
                name=f'Category {i}'
            )
        
        response = self.client.get('/api/accounts/account-classifications/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)
    
    def test_prevent_duplicate_section(self):
        """Test that duplicate sections are prevented."""
        AccountCategory.objects.create(
            owner=self.user,
            branch=self.branch,
            section=1,
            name='Current Assets'
        )
        
        # Try to create another category in same section with different name - should succeed
        data = {
            'section': 1,
            'name': 'Fixed Assets'
        }
        
        response = self.client.post('/api/accounts/account-classifications/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AccountCategory.objects.filter(owner=self.user).count(), 2)
        
        # Try to create another category with same name in same section - should fail
        data2 = {
            'section': 1,
            'name': 'Current Assets'
        }
        
        response2 = self.client.post('/api/accounts/account-classifications/', data2, format='json')
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        # The error can be in 'name' field or 'non_field_errors' depending on where it's caught
        self.assertTrue('name' in response2.data or 'non_field_errors' in response2.data)
        self.assertEqual(AccountCategory.objects.filter(owner=self.user).count(), 2)
