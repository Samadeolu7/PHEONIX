"""
GET /api/users/staff-users/search/ — used by the discussion-thread
participant picker. A blank/short q lists staff instead of returning
nothing, so the picker has something to show without requiring the user to
type first (see erp-frontend's ThreadPanel.tsx). Branch-scoped for
non-elevated users and for a director with a specific branch selected
(X-Branch-ID header); tenant-wide for a director viewing "All Branches"
(no header) or when searching by name (a discussion can be inter-branch).
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from branches.models import Branch
from users.models import Tenant

User = get_user_model()


class StaffUserSearchTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Staff Search Org', slug='staff-search-org')
        self.branch_a = Branch.objects.create(name='Branch A', code='SSA', tenant=self.tenant)
        self.branch_b = Branch.objects.create(name='Branch B', code='SSB', tenant=self.tenant)

        self.director = User.objects.create_user(
            username='ss_director', password='test123', tenant=self.tenant, branch=self.branch_a,
            is_superuser=True,
        )
        self.tenant.owner = self.director
        self.tenant.save(update_fields=['owner'])

        self.staff_a = User.objects.create_user(
            username='ss_staff_a', password='test123', tenant=self.tenant, branch=self.branch_a,
            first_name='Alice', last_name='Anderson',
        )
        self.staff_b = User.objects.create_user(
            username='ss_staff_b', password='test123', tenant=self.tenant, branch=self.branch_b,
            first_name='Bob', last_name='Baker',
        )

    def test_blank_query_lists_own_branch_for_non_elevated_user(self):
        self.client.force_authenticate(user=self.staff_a)
        resp = self.client.get('/api/users/staff-users/search/')
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data}
        self.assertIn(self.staff_a.id, ids)
        self.assertNotIn(self.staff_b.id, ids)

    def test_blank_query_lists_tenant_wide_for_director_all_branches(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/users/staff-users/search/')
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data}
        self.assertIn(self.staff_a.id, ids)
        self.assertIn(self.staff_b.id, ids)

    def test_blank_query_scopes_to_directors_selected_branch(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.get('/api/users/staff-users/search/', HTTP_X_BRANCH_ID=str(self.branch_b.id))
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data}
        self.assertIn(self.staff_b.id, ids)
        self.assertNotIn(self.staff_a.id, ids)

    def test_named_search_is_not_branch_restricted(self):
        # A discussion can be inter-branch — typing a name intentionally
        # searches wider than the default branch-scoped list.
        self.client.force_authenticate(user=self.staff_a)
        resp = self.client.get('/api/users/staff-users/search/', {'q': 'Bob'})
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data}
        self.assertIn(self.staff_b.id, ids)
