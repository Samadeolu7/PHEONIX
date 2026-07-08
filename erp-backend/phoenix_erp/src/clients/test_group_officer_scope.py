"""
Regression test for common.views.ScopedModelViewSet._apply_officer_scope():
unassigned records (officer_client_lookup IS NULL) must be visible even under
a narrowed scope (assigned_clients/own_records/ajo_group), matching every
ViewSet's own documented behavior (e.g. ClientViewSet's docstring: "credit_
officer -> only their assigned clients + unassigned clients"). The previous
implementation filtered by the officer FK alone with no IS NULL branch, so
unassigned groups/clients were silently hidden from anyone in a narrowed
scope — reported live as "Client Groups page does not show all groups".
"""
from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from branches.models import Branch
from clients.models import ClientGroup
from clients.views import ClientGroupViewSet
from hr.models import Staff
from users.models import Tenant

User = get_user_model()


class ClientGroupOfficerScopeTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Co', slug='test-co', is_active=True)
        self.branch = Branch.objects.create(name='Main', code='MAIN', tenant=self.tenant, is_active=True)

        self.officer_user = User.objects.create_user(username='officer1', password='x')
        self.officer_user.tenant = self.tenant
        self.officer_user.branch = self.branch
        self.officer_user.save()

        self.other_officer_user = User.objects.create_user(username='officer2', password='x')
        self.other_officer_user.tenant = self.tenant
        self.other_officer_user.branch = self.branch
        self.other_officer_user.save()

        # A post_save signal on User auto-creates a linked Staff profile —
        # use/update that one rather than creating a second (OneToOne would
        # violate the unique constraint on user_id).
        self.officer_staff, _ = Staff.objects.update_or_create(
            user=self.officer_user,
            defaults=dict(first_name='Officer', last_name='One',
                           tenant=self.tenant, branch=self.branch, owner=self.officer_user),
        )
        self.other_officer_staff, _ = Staff.objects.update_or_create(
            user=self.other_officer_user,
            defaults=dict(first_name='Officer', last_name='Two',
                           tenant=self.tenant, branch=self.branch, owner=self.other_officer_user),
        )

        self.own_group = ClientGroup.objects.create(
            name='Own Group', code='OWN', assigned_officer=self.officer_staff,
            tenant=self.tenant, branch=self.branch, owner=self.officer_user,
        )
        self.other_group = ClientGroup.objects.create(
            name='Other Group', code='OTHER', assigned_officer=self.other_officer_staff,
            tenant=self.tenant, branch=self.branch, owner=self.other_officer_user,
        )
        self.unassigned_group = ClientGroup.objects.create(
            name='Unassigned Group', code='UNASSIGNED', assigned_officer=None,
            tenant=self.tenant, branch=self.branch, owner=self.officer_user,
        )

    def _get_queryset_for(self, user, scope):
        factory = APIRequestFactory()
        django_request = factory.get('/api/clients/groups/')
        drf_request = Request(django_request)
        drf_request.user = user
        viewset = ClientGroupViewSet()
        viewset.request = drf_request
        viewset.format_kwarg = None
        viewset.action = 'list'
        with patch('permissions.services.PermissionResolver.resolve') as mock_resolve:
            mock_resolve.return_value = SimpleNamespace(scope=scope)
            return list(viewset.get_queryset())

    def test_assigned_clients_scope_includes_own_and_unassigned(self):
        names = {g.name for g in self._get_queryset_for(self.officer_user, 'assigned_clients')}
        self.assertIn('Own Group', names)
        self.assertIn('Unassigned Group', names)
        self.assertNotIn('Other Group', names)

    def test_own_records_scope_includes_own_and_unassigned(self):
        names = {g.name for g in self._get_queryset_for(self.officer_user, 'own_records')}
        self.assertIn('Own Group', names)
        self.assertIn('Unassigned Group', names)
        self.assertNotIn('Other Group', names)

    def test_ajo_group_scope_includes_own_and_unassigned(self):
        names = {g.name for g in self._get_queryset_for(self.officer_user, 'ajo_group')}
        self.assertIn('Own Group', names)
        self.assertIn('Unassigned Group', names)
        self.assertNotIn('Other Group', names)

    def test_own_branch_scope_sees_everything_in_branch(self):
        names = {g.name for g in self._get_queryset_for(self.officer_user, 'own_branch')}
        self.assertIn('Own Group', names)
        self.assertIn('Other Group', names)
        self.assertIn('Unassigned Group', names)
