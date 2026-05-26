from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status

from ..models import MenuGroup, MenuItem
from ..serializers import MenuGroupSerializer, MenuItemSerializer
from users.models import Tenant

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
