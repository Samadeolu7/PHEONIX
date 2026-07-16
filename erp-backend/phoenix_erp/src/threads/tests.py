"""
ThreadViewSet.create() used to return ThreadCreateSerializer's own .data —
that serializer has no `participants` field at all (write_only
participant_ids only), so a just-created thread came back with
participants undefined. The frontend's panel unconditionally does
selectedThread.participants.slice(0, 6) right after creating a thread,
which crashed immediately. This covers the fix: create() re-serializes the
saved instance with the full ThreadSerializer before responding.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from pages.models import Module, ModulePage
from users.models import Tenant

User = get_user_model()


class ThreadCreateResponseTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Threads Test Org', slug='threads-test-org')
        self.user = User.objects.create_user(username='thread_user', password='test123', tenant=self.tenant)

        self.module = Module.objects.create(code='loans', name='Loans', icon='book')
        self.page = ModulePage.objects.create(
            module=self.module, code='loan-accounts', title='Loan Accounts',
            page_type='list', is_threadable=True,
        )

    def test_create_response_includes_participants(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post('/api/threads/threads/', {'page': self.page.id}, format='json')

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIn('participants', resp.data)
        participant_user_ids = {p['user'] for p in resp.data['participants']}
        self.assertIn(self.user.id, participant_user_ids)

    def test_create_rejected_when_page_not_threadable(self):
        self.page.is_threadable = False
        self.page.save(update_fields=['is_threadable'])

        self.client.force_authenticate(user=self.user)
        resp = self.client.post('/api/threads/threads/', {'page': self.page.id}, format='json')

        self.assertEqual(resp.status_code, 400)
