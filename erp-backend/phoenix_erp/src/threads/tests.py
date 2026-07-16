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


class ThreadPageUrlResolutionFieldsTests(TestCase):
    """
    page_url alone is the catalog ModulePage's static url_path (e.g. a list
    page's URL) — it can't represent a specific record's actual frontend
    route (e.g. '/clients/947', a hardcoded React route independent of the
    catalog). page_module_code/page_code let the frontend reverse-resolve
    the real per-record URL instead of landing on the generic list page.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='URL Resolution Org', slug='url-resolution-org')
        self.user = User.objects.create_user(username='url_user', password='test123', tenant=self.tenant)

        self.module = Module.objects.create(code='clients', name='Clients', icon='users')
        self.page = ModulePage.objects.create(
            module=self.module, code='clients', title='Client List',
            page_type='list', url_path='/clients/clients/', is_threadable=True,
        )

    def test_create_response_includes_module_and_page_codes(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            '/api/threads/threads/', {'page': self.page.id, 'object_id': 947}, format='json',
        )

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['page_module_code'], 'clients')
        self.assertEqual(resp.data['page_code'], 'clients')
        self.assertEqual(resp.data['page_url'], '/clients/clients/')

    def test_widget_summary_includes_module_and_page_codes(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/threads/threads/', {'page': self.page.id, 'object_id': 947}, format='json')

        resp = self.client.get('/api/threads/threads/widget-summary/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data['recent_threads']), 1)
        row = resp.data['recent_threads'][0]
        self.assertEqual(row['page_module_code'], 'clients')
        self.assertEqual(row['page_code'], 'clients')
        self.assertEqual(row['object_id'], 947)


class ThreadListObjectIdFilterTests(TestCase):
    """
    ?object_id=<n> used to only filter when a content_type param was ALSO
    given — but nothing in the frontend sends content_type today, so the
    filter silently never activated and every thread on a page leaked into
    every other record's discussion panel on that same page (e.g. two
    different clients sharing the generic 'clients' list ModulePage would
    see each other's threads). object_id alone must scope correctly.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='List Filter Org', slug='list-filter-org')
        self.user = User.objects.create_user(username='lf_user', password='test123', tenant=self.tenant)

        self.module = Module.objects.create(code='clients', name='Clients', icon='users')
        self.page = ModulePage.objects.create(
            module=self.module, code='clients', title='Client List',
            page_type='list', is_threadable=True, url_path='/clients/clients/',
        )

    def test_object_id_alone_scopes_to_the_right_record(self):
        self.client.force_authenticate(user=self.user)
        self.client.post('/api/threads/threads/', {'page': self.page.id, 'object_id': 947}, format='json')
        self.client.post('/api/threads/threads/', {'page': self.page.id, 'object_id': 999}, format='json')

        resp = self.client.get('/api/threads/threads/', {'page_id': self.page.id, 'object_id': 947})
        self.assertEqual(resp.status_code, 200)
        results = resp.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['object_id'], 947)


class ThreadTitleTests(TestCase):
    """
    Every thread on a shared list page used to come back with the SAME
    generic title (the page's own title, e.g. "Client List") since nothing
    let the creator name it — making the thread switcher useless for
    telling multiple discussions on the same page apart. title is now
    creatable; leaving it blank preserves the old page-title fallback
    (Thread.save() in models.py).
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Title Test Org', slug='title-test-org')
        self.user = User.objects.create_user(username='title_user', password='test123', tenant=self.tenant)

        self.module = Module.objects.create(code='clients', name='Clients', icon='users')
        self.page = ModulePage.objects.create(
            module=self.module, code='clients', title='Client List',
            page_type='list', is_threadable=True, url_path='/clients/clients/',
        )

    def test_explicit_title_is_saved(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            '/api/threads/threads/',
            {'page': self.page.id, 'object_id': 947, 'title': 'Inactive clients follow-up'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['title'], 'Inactive clients follow-up')

    def test_blank_title_falls_back_to_page_title(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            '/api/threads/threads/', {'page': self.page.id, 'object_id': 947}, format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['title'], 'Client List')
