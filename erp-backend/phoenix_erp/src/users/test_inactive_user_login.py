"""
Deleted/deactivated staff must not be able to sign in.

Deactivation only flips `is_active_user`, which Django/simplejwt ignore on
their own, and a hard delete blocked by linked records used to leave the
account fully active. See users/authentication.py and
StaffUserViewSet.destroy.
"""
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch
from users.models import Tenant

User = get_user_model()

LOGIN_URL = '/api/users/auth/login/'
REFRESH_URL = '/api/users/auth/refresh/'


class InactiveUserLoginTests(TestCase):

    def setUp(self):
        cache.clear()  # the login endpoint is rate-limited per client
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Inactive Login Org', slug='inactive-login-org')
        self.branch = Branch.objects.create(name='Main', code='ILM', tenant=self.tenant)
        self.director = User.objects.create_user(
            username='il_director', password='test123', tenant=self.tenant, branch=self.branch,
            is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])
        self.staff = User.objects.create_user(
            username='il_staff', password='test123', tenant=self.tenant, branch=self.branch,
        )

    def _login(self, username='il_staff'):
        return self.client.post(LOGIN_URL, {'username': username, 'password': 'test123'}, format='json')

    def test_active_user_can_login(self):
        self.assertEqual(self._login().status_code, 200)

    def test_deactivated_user_cannot_login(self):
        self.staff.is_active_user = False
        self.staff.save()
        self.assertEqual(self._login().status_code, 401)

    def test_existing_tokens_rejected_after_deactivation(self):
        tokens = self._login().json()
        self.staff.is_active_user = False
        self.staff.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get('/api/users/staff-users/search/').status_code, 401)

        self.client.credentials()
        resp = self.client.post(REFRESH_URL, {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(resp.status_code, 401)

    def test_deactivate_endpoint_blocks_login(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post(f'/api/users/staff-users/{self.staff.id}/deactivate/')
        self.assertEqual(resp.status_code, 200)
        self.client.force_authenticate(user=None)
        self.assertEqual(self._login().status_code, 401)

    def test_delete_removes_user(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.delete(f'/api/users/staff-users/{self.staff.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.staff.pk).exists())
        self.client.force_authenticate(user=None)
        self.assertEqual(self._login().status_code, 401)

    def test_blocked_delete_deactivates_instead(self):
        self.client.force_authenticate(user=self.director)
        with mock.patch.object(User, 'delete', side_effect=ProtectedError('linked', set())):
            resp = self.client.delete(f'/api/users/staff-users/{self.staff.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('deactivated', resp.json()['detail'])

        self.staff.refresh_from_db()
        self.assertFalse(self.staff.is_active)
        self.assertFalse(self.staff.is_active_user)
        self.client.force_authenticate(user=None)
        self.assertEqual(self._login().status_code, 401)

    def test_cannot_delete_tenant_owner(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.delete(f'/api/users/staff-users/{self.director.id}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(Tenant.objects.filter(pk=self.tenant.pk).exists())
