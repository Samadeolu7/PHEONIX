from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase, APIRequestFactory
from rest_framework.request import Request
from rest_framework import status

from ..models import MenuGroup, MenuItem
from ..serializers import MenuGroupSerializer, MenuItemSerializer, IsTenantUser
from users.models import Tenant, Role
from branches.models import Branch

User = get_user_model()

class MenuSerializerTests(TestCase):
    """Test menu serializers"""
    
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant
        )
        
        self.menu_group = MenuGroup.objects.create(
            tenant=self.tenant,
            code="test",
            label="Test Group",
            owner=self.user,
            created_by=self.user
        )
        
        self.menu_item = MenuItem.objects.create(
            group=self.menu_group,
            code="item1",
            label="Item 1",
            route="/item1"
        )

    def test_menu_group_serializer(self):
        """Test MenuGroupSerializer"""
        serializer = MenuGroupSerializer(self.menu_group)
        data = serializer.data
        
        self.assertEqual(data['code'], 'test')
        self.assertEqual(data['label'], 'Test Group')
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['code'], 'item1')

    def test_menu_item_serializer_permission_validation(self):
        """Test permission format validation in MenuItemSerializer"""
        # Invalid permission format
        invalid_data = {
            'group': self.menu_group.id,
            'code': 'test',
            'label': 'Test Item',
            'route': '/test',
            'permission': 'invalid_permission'  # Missing dot
        }
        serializer = MenuItemSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('permission', serializer.errors)
        
        # Valid permission format
        valid_data = {
            'group': self.menu_group.id,
            'code': 'test',
            'label': 'Test Item',
            'route': '/test',
            'permission': 'app.permission'
        }
        serializer = MenuItemSerializer(data=valid_data)
        self.assertTrue(serializer.is_valid())


class IsTenantUserObjectPermissionTests(TestCase):
    """
    Regression test: IsTenantUser.has_object_permission() used to compare
    obj.branch strictly against request.user's own home branch, ignoring the
    branch-switcher's X-Branch-ID override entirely. Queryset-level scoping
    (ScopedModelViewSet._apply_director_branch_override) already honored that
    header, so a director LISTing another branch's records via the switcher
    worked fine — but RETRIEVE/UPDATE/DELETE on any single one of those same
    records 403'd here, because this check never looked at the header at all.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name='IsTenantUser Tenant')
        self.home_branch = Branch.objects.create(name='Home', code='HOME', tenant=self.tenant)
        self.other_branch = Branch.objects.create(name='Other', code='OTHR', tenant=self.tenant)
        self.third_branch = Branch.objects.create(name='Third', code='THRD', tenant=self.tenant)

        self.elevated_user = User.objects.create_user(
            username='director', password='pass', tenant=self.tenant, branch=self.home_branch,
        )
        global_role = Role.objects.create(
            tenant=self.tenant, name='Director', default_scope=Role.SCOPE_GLOBAL,
        )
        self.elevated_user.roles.add(global_role)

        self.regular_user = User.objects.create_user(
            username='teller', password='pass', tenant=self.tenant, branch=self.home_branch,
        )

        from products.models import Fee
        self.object_in_other_branch = Fee.objects.create(
            name='Fee In Other Branch', fee_type='fixed', fixed_amount=Decimal('10.00'),
            owner=self.elevated_user, branch=self.other_branch, tenant=self.tenant,
        )

    def _request(self, user, branch_header=None):
        factory = APIRequestFactory()
        django_request = factory.get('/fake/')
        if branch_header is not None:
            django_request.META['HTTP_X_BRANCH_ID'] = str(branch_header)
        request = Request(django_request)
        request.user = user
        return request

    def test_elevated_user_with_switcher_set_to_objects_branch_is_allowed(self):
        request = self._request(self.elevated_user, branch_header=self.other_branch.pk)
        allowed = IsTenantUser().has_object_permission(request, None, self.object_in_other_branch)
        self.assertTrue(allowed)

    def test_elevated_user_with_no_branch_selected_sees_all_branches(self):
        request = self._request(self.elevated_user, branch_header=None)
        allowed = IsTenantUser().has_object_permission(request, None, self.object_in_other_branch)
        self.assertTrue(allowed)

    def test_elevated_user_with_switcher_set_to_a_different_branch_is_denied(self):
        request = self._request(self.elevated_user, branch_header=self.third_branch.pk)
        allowed = IsTenantUser().has_object_permission(request, None, self.object_in_other_branch)
        self.assertFalse(allowed)

    def test_regular_user_cannot_reach_another_branchs_object(self):
        request = self._request(self.regular_user, branch_header=None)
        allowed = IsTenantUser().has_object_permission(request, None, self.object_in_other_branch)
        self.assertFalse(allowed)

    def test_regular_user_ignores_branch_header_even_if_present(self):
        # Non-elevated users can't use the switcher at all — the header must
        # be inert for them, same as _get_director_branch_override elsewhere.
        request = self._request(self.regular_user, branch_header=self.other_branch.pk)
        allowed = IsTenantUser().has_object_permission(request, None, self.object_in_other_branch)
        self.assertFalse(allowed)
