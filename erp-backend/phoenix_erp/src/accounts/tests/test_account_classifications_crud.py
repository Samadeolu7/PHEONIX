from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from users.models import Tenant, User
from branches.models import Branch
from accounts.models import AccountCategory
from common.managers import set_current_tenant


class AccountClassificationCrudTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Org A', slug='orga')
        self.branch = Branch.objects.create(name='Main', code='M01', tenant=self.tenant)
        self.user = User.objects.create_user(
            username='usera', email='a@example.com', password='pass',
            tenant=self.tenant, branch=self.branch
        )
        set_current_tenant(self.tenant)
        self.client.force_authenticate(user=self.user)

    def post_and_verify(self, payload):
        resp = self.client.post('/api/accounts/account-classifications/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, msg=f"POST failed: {resp.data}")
        created_id = resp.data.get('id')
        self.assertIsNotNone(created_id)

        # Verify tenant set
        cat = AccountCategory.objects.get(pk=created_id)
        self.assertIsNotNone(cat.tenant)
        self.assertEqual(cat.tenant.id, self.tenant.id)

        # Verify visible in list for this tenant
        list_resp = self.client.get('/api/accounts/account-classifications/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        ids = [r['id'] for r in results]
        self.assertIn(created_id, ids)

        return created_id

    def test_create_assets_classification_without_description(self):
        payload = {'name': 'Assets Demo', 'section': 1}
        self.post_and_verify(payload)

    def test_create_expenses_classification_without_description(self):
        payload = {'name': 'Expenses Demo', 'section': 5}
        self.post_and_verify(payload)
