from django.test import TestCase
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status

from users.models import Tenant, User
from branches.models import Branch
from accounts.models import AccountCategory


class TenantPopulationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create initial tenant/branch/user used by API tests
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        self.branch = Branch.objects.create(name='Main Branch', code='MB01', tenant=self.tenant)
        self.user = User.objects.create_user(
            username='apiuser', email='api@example.com', password='pass',
            tenant=self.tenant, branch=self.branch
        )
        self.client.force_authenticate(user=self.user)

    def test_accountcategory_api_sets_tenant(self):
        """Creating an AccountCategory via API should set tenant from request."""
        data = {'section': 5, 'name': 'Expense Category Test'}
        resp = self.client.post('/api/accounts/account-classifications/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        created_id = resp.data.get('id')
        self.assertIsNotNone(created_id)

        # Use all_tenants() to bypass thread-local tenant scoping in manager
        cat = AccountCategory.objects.all_tenants().get(pk=created_id)
        self.assertIsNotNone(cat.tenant)
        self.assertEqual(cat.tenant.id, self.tenant.id)
        # Ensure the created classification is returned in the list for this tenant
        list_resp = self.client.get('/api/accounts/account-classifications/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in list_resp.data.get('results', list_resp.data)]
        self.assertIn(created_id, ids)

    def test_populate_missing_tenants_command(self):
        """Management command should populate NULL tenant fields for target apps."""
        # Create target tenant to populate
        target_tenant = Tenant.objects.create(name='PopulateTenant', slug='poptenant')

        # Create an AccountCategory with tenant=NULL using raw SQL to bypass all Django logic
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO accounts_accountcategory (owner_id, branch_id, section, name, code_prefix, description, tenant_id, created_at, updated_at, is_deleted, is_system_category)
                VALUES (%s, %s, %s, %s, %s, %s, NULL, NOW(), NOW(), FALSE, FALSE)
                RETURNING id
            """, [self.user.id, self.branch.id, 1, 'Orphan Category', '1', ''])
            orphan_id = cursor.fetchone()[0]

        # Use all_tenants() to read orphan regardless of thread-local tenant scoping
        orphan = AccountCategory.all_objects.all_tenants().get(pk=orphan_id)
        self.assertIsNone(orphan.tenant)

        # Run the management command for the accounts app
        call_command('populate_missing_tenants', '--tenant-id', str(target_tenant.id), '--apps', 'accounts')

        orphan.refresh_from_db()
        self.assertIsNotNone(orphan.tenant)
        self.assertEqual(orphan.tenant.id, target_tenant.id)
