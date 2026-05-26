from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.core.cache import cache

from ..models import MenuGroup, MenuItem
from users.models import Tenant

User = get_user_model()

class TestBaseSetup(APITestCase):
    """Base test class with common setup"""
    
    def setUp(self):
        # Clear cache
        cache.clear()
        
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create test user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            email="test@example.com",
            tenant=self.tenant
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        cache.clear()


class MenuGroupModelTests(TestCase):
    """Test menu group model methods and constraints"""
    
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

    def test_unique_together_constraint(self):
        """Test that tenant and code combination must be unique"""
        with self.assertRaises(Exception):
            MenuGroup.objects.create(
                tenant=self.tenant,
                code="test",  # Same code as existing
                label="Another Test",
                owner=self.user,
                created_by=self.user
            )

    def test_ordering(self):
        """Test that menu groups are ordered by order field"""
        group2 = MenuGroup.objects.create(
            tenant=self.tenant,
            code="test2",
            label="Test Group 2",
            order=1,
            owner=self.user,
            created_by=self.user
        )
        
        groups = MenuGroup.objects.all()
        self.assertEqual(groups[0], self.menu_group)  # order=0
        self.assertEqual(groups[1], group2)  # order=1

    def test_get_accessible_items(self):
        """Test getting items accessible to a user"""
        # Create menu items with different permissions
        item1 = MenuItem.objects.create(
            group=self.menu_group,
            code="item1",
            label="Item 1",
            route="/item1",
            owner=self.user,
            created_by=self.user
        )
        
        item2 = MenuItem.objects.create(
            group=self.menu_group,
            code="item2",
            label="Item 2",
            route="/item2",
            permission="accounts.view_account",  # Permission user doesn't have
            owner=self.user,
            created_by=self.user
        )
        
        accessible_items = self.menu_group.get_accessible_items(self.user)
        self.assertEqual(len(accessible_items), 1)
        self.assertEqual(accessible_items[0], item1)

    def test_reorder_items(self):
        """Test reordering menu items"""
        # Create items with initial order
        items = []
        for i in range(3):
            items.append(MenuItem.objects.create(
                group=self.menu_group,
                code=f"item{i}",
                label=f"Item {i}",
                route=f"/item{i}",
                order=i,
                owner=self.user,
                created_by=self.user
            ))
        
        # Reorder items
        new_order = [items[2].id, items[0].id, items[1].id]
        self.menu_group.reorder_items(new_order)
        
        # Verify new order
        reordered_items = MenuItem.objects.filter(group=self.menu_group).order_by('order')
        self.assertEqual(reordered_items[0].id, items[2].id)
        self.assertEqual(reordered_items[1].id, items[0].id)
        self.assertEqual(reordered_items[2].id, items[1].id)
