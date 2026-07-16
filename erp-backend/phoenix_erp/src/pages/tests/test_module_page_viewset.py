"""
ModuleViewSet/ModulePageViewSet.get_queryset() used to filter by
owner=request.user / branch=request.user.branch — but Module/ModulePage are
a single shared catalog (owner=None, branch=None for seeded rows; see
pages/models.py), so that filter matched nothing for any catalog page,
regardless of the tenant fix that made them visible via admin-all. This
silently 404'd every ordinary access path (by-path lookups, thread-config)
even though the page showed up fine in the admin catalog list. These tests
cover the fixed queryset and the thread-config action restored from the
dead, shadowed pages/views.py file (shadowed by the pages/views/ package —
see the deleted file's removal in this same change).
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from pages.models import Module, ModulePage
from users.models import Tenant

User = get_user_model()


class ModulePageViewSetCatalogVisibilityTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.get()  # seeded by users/migrations/0002

        self.director = User.objects.create_user(
            username='pv_director', password='test123', tenant=self.tenant, is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.staff_user = User.objects.create_user(
            username='pv_staff', password='test123', tenant=self.tenant,
        )

        # Mirrors the real seeded catalog shape: owner=None, branch=None,
        # not tied to whichever user happened to create it.
        self.module = Module.objects.create(code='accounts', name='Accounts', icon='book')
        self.page = ModulePage.objects.create(
            module=self.module, code='1130_transaction', title='Bank Account Transaction',
            page_type='form', page_config={'form_schema_id': 1, 'submitEndpoint': '/x', 'successUrl': '/y'},
        )

    def test_catalog_page_appears_in_list_for_ordinary_user(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get('/api/pages/module-pages/')
        self.assertEqual(resp.status_code, 200)
        results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        codes = {row['code'] for row in results}
        self.assertIn('1130_transaction', codes)

    def test_by_code_resolves_page_id(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get(
            '/api/pages/module-pages/by-code/',
            {'module': 'accounts', 'page': '1130_transaction'},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['data']['id'], self.page.id)

    def test_by_code_404_for_unknown_page(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get(
            '/api/pages/module-pages/by-code/',
            {'module': 'accounts', 'page': 'nonexistent'},
        )
        self.assertEqual(resp.status_code, 404)

    def test_by_code_requires_both_params(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get('/api/pages/module-pages/by-code/', {'module': 'accounts'})
        self.assertEqual(resp.status_code, 400)

    def test_thread_config_get_returns_current_state(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get(f'/api/pages/module-pages/{self.page.id}/thread-config/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['id'], self.page.id)
        self.assertEqual(resp.data['is_threadable'], False)

    def test_thread_config_patch_forbidden_for_non_director(self):
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.patch(
            f'/api/pages/module-pages/{self.page.id}/thread-config/',
            {'is_threadable': True}, format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.page.refresh_from_db()
        self.assertFalse(self.page.is_threadable)

    def test_thread_config_patch_updates_for_director(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.patch(
            f'/api/pages/module-pages/{self.page.id}/thread-config/',
            {'is_threadable': True, 'who_can_initiate': ['Director'], 'max_open_threads': 3},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.page.refresh_from_db()
        self.assertTrue(self.page.is_threadable)
        self.assertEqual(self.page.page_config['thread']['who_can_initiate'], ['Director'])
        self.assertEqual(self.page.page_config['thread']['max_open_threads'], 3)
