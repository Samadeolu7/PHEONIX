from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache

from ..models import MenuGroup, MenuItem
from users.models import Tenant, User

class MenuViewTests(APITestCase):
    """Test menu-related views"""
    
    def setUp(self):
        # Clear cache
        cache.clear()
        
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create users
        self.admin_user = User.objects.create_user(
            username="admin",
            password="admin123",
            tenant=self.tenant,
            is_staff=True
        )
        
        self.normal_user = User.objects.create_user(
            username="normal",
            password="normal123",
            tenant=self.tenant
        )
        
        # Create test permission
        content_type = ContentType.objects.get_for_model(MenuGroup)
        self.test_permission = Permission.objects.create(
            codename="test_perm",
            name="Test Permission",
            content_type=content_type,
        )
        
        # Create menu structure
        self.menu_group = MenuGroup.objects.create(
            tenant=self.tenant,
            code="test",
            label="Test Group",
            owner=self.admin_user,
            created_by=self.admin_user
        )

    def test_menu_group_list(self):
        """Test listing menu groups"""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menugroup-list')
        response = self.client.get(url, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Handle pagination if present
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        # May have existing groups from other tests
        self.assertGreaterEqual(len(data), 1)
        # Find our test group
        test_groups = [g for g in data if g['code'] == 'test']
        self.assertEqual(len(test_groups), 1)

    def test_menu_group_create(self):
        """Test creating a menu group"""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menugroup-list')
        data = {
            'code': 'new-group',
            'label': 'New Group'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MenuGroup.objects.count(), 2)
        self.assertEqual(MenuGroup.objects.get(code='new-group').tenant, self.tenant)

    def test_menu_item_create(self):
        """Test creating a menu item"""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menuitem-list')
        data = {
            'group': self.menu_group.id,
            'code': 'new-item',
            'label': 'New Item',
            'route': '/new-item'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MenuItem.objects.count(), 1)

    def test_menu_item_bulk_create(self):
        """Test bulk creating menu items"""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menuitem-bulk-create')
        data = [
            {
                'group': self.menu_group.id,
                'code': f'item-{i}',
                'label': f'Item {i}',
                'route': f'/item-{i}'
            }
            for i in range(3)
        ]
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(MenuItem.objects.count(), 3)

    def test_menu_item_reorder(self):
        """Test reordering menu items"""
        # Create some items first
        items = []
        for i in range(3):
            items.append(MenuItem.objects.create(
                group=self.menu_group,
                code=f'item-{i}',
                label=f'Item {i}',
                route=f'/item-{i}',
                owner=self.admin_user,
                created_by=self.admin_user
            ))
        
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menuitem-reorder')
        data = {
            'group': self.menu_group.id,
            'order': [items[2].id, items[0].id, items[1].id]
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify new order
        items = MenuItem.objects.filter(group=self.menu_group).order_by('order')
        self.assertEqual(items[0].id, data['order'][0])
        self.assertEqual(items[1].id, data['order'][1])
        self.assertEqual(items[2].id, data['order'][2])

    def test_menu_cache(self):
        """Test menu caching"""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('common:menugroup-menu')
        
        # First request - should hit database
        response1 = self.client.get(url)
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        
        # Create new menu item
        MenuItem.objects.create(
            group=self.menu_group,
            code='cache-test',
            label='Cache Test',
            route='/cache-test'
        )
        
        # Second request - should hit cache
        response2 = self.client.get(url)
        self.assertEqual(response2.data, response1.data)
        
        # Clear cache
        cache.clear()
        
        # Third request - should hit database and include new item
        response3 = self.client.get(url)
        self.assertNotEqual(response3.data, response2.data)
        self.assertTrue(any(
            item['code'] == 'cache-test' 
            for group in response3.data 
            for item in group['items']
        ))
