"""
Regression/coverage test for the generalized narrow-scope mechanism added to
ScopedModelViewSet._apply_officer_scope:

  1. Pages with no `officer_client_lookup` configured (the ~140+ pages with no
     client concept — GL accounts, budgets, reports, ...) used to silently
     return the queryset unchanged for a narrow scope tier (own_records /
     assigned_clients / ajo_group), i.e. full branch-wide access regardless of
     what an admin configured in Permission Setup. They now fall back to
     `created_by == user` instead — the one notion of "mine" every model
     supports.
  2. `get_narrow_scope_q()` lets a viewset redefine what a narrow scope means
     for its own domain (e.g. "payments made by or to me" instead of the
     generic client-officer relationship), overriding both the
     officer_client_lookup path and the created_by fallback.
"""
from decimal import Decimal
from unittest.mock import patch

from django.db.models import Q
from django.test import TestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from common.managers import set_current_tenant
from common.views import ScopedModelViewSet
from users.models import Tenant, User
from branches.models import Branch
from products.models import Fee


class _FakeEffectivePermission:
    def __init__(self, scope):
        self.scope = scope


class _FeeViewSetNoOverride(ScopedModelViewSet):
    """Mirrors a page with no client concept and no custom scope override."""
    queryset = Fee.objects.all()
    permission_module = 'products'
    permission_page = 'fees'
    skip_action_permission = True


class _FeeViewSetWithCustomOverride(ScopedModelViewSet):
    """Mirrors a page that redefines what a narrow scope means for its domain."""
    queryset = Fee.objects.all()
    permission_module = 'products'
    permission_page = 'fees'
    skip_action_permission = True

    def get_narrow_scope_q(self, scope, user, staff):
        if scope == 'own_records':
            # e.g. a payments viewset's "payments made by or to me"
            return Q(name=f"Custom-{user.username}")
        return None


class NarrowScopeFallbackTests(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.owner = User.objects.create_user(username="nsf_owner", password="pass")
        self.tenant = Tenant.objects.create(name="NSF Tenant", slug="nsf-tenant", owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()
        self.branch = Branch.objects.create(name="NSF Branch", code="NSF1", tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        self.mine_user = User.objects.create_user(username="nsf_mine", password="pass")
        self.mine_user.tenant = self.tenant
        self.mine_user.branch = self.branch
        self.mine_user.save()

        self.other_user = User.objects.create_user(username="nsf_other", password="pass")
        self.other_user.tenant = self.tenant
        self.other_user.branch = self.branch
        self.other_user.save()

        self.fee_mine = Fee.objects.create(
            name="Mine Fee", fee_type="fixed", fixed_amount=Decimal("10.00"),
            owner=self.owner, created_by=self.mine_user, branch=self.branch, tenant=self.tenant,
        )
        self.fee_other = Fee.objects.create(
            name="Other Fee", fee_type="fixed", fixed_amount=Decimal("20.00"),
            owner=self.owner, created_by=self.other_user, branch=self.branch, tenant=self.tenant,
        )
        self.fee_custom = Fee.objects.create(
            name=f"Custom-{self.mine_user.username}", fee_type="fixed", fixed_amount=Decimal("30.00"),
            owner=self.owner, created_by=self.other_user, branch=self.branch, tenant=self.tenant,
        )

    def tearDown(self):
        set_current_tenant(None)

    def _view_request(self, user):
        factory = APIRequestFactory()
        request = Request(factory.get('/fake/'))
        request.user = user
        return request

    def test_no_lookup_no_override_falls_back_to_created_by(self):
        view = _FeeViewSetNoOverride()
        view.request = self._view_request(self.mine_user)
        view.format_kwarg = None

        with patch(
            'permissions.services.PermissionResolver.resolve',
            return_value=_FakeEffectivePermission('own_records'),
        ):
            qs = view._apply_officer_scope(Fee.objects.filter(branch=self.branch))

        names = set(qs.values_list('name', flat=True))
        self.assertIn('Mine Fee', names)
        self.assertNotIn('Other Fee', names)

    def test_own_branch_scope_still_returns_everything(self):
        """own_branch/global must be completely unaffected by this change."""
        view = _FeeViewSetNoOverride()
        view.request = self._view_request(self.mine_user)
        view.format_kwarg = None

        with patch(
            'permissions.services.PermissionResolver.resolve',
            return_value=_FakeEffectivePermission('own_branch'),
        ):
            qs = view._apply_officer_scope(Fee.objects.filter(branch=self.branch))

        names = set(qs.values_list('name', flat=True))
        self.assertIn('Mine Fee', names)
        self.assertIn('Other Fee', names)

    def test_custom_override_wins_over_created_by_fallback(self):
        view = _FeeViewSetWithCustomOverride()
        view.request = self._view_request(self.mine_user)
        view.format_kwarg = None

        with patch(
            'permissions.services.PermissionResolver.resolve',
            return_value=_FakeEffectivePermission('own_records'),
        ):
            qs = view._apply_officer_scope(Fee.objects.filter(branch=self.branch))

        names = set(qs.values_list('name', flat=True))
        self.assertIn(f"Custom-{self.mine_user.username}", names)
        self.assertNotIn('Mine Fee', names)
        self.assertNotIn('Other Fee', names)
