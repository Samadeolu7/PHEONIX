from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from datetime import date

from ..models import Client, ClientClassification
from users.models import Tenant, Branch

User = get_user_model()

class ClientAPITests(APITestCase):
    """Test client API endpoints"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            tenant=self.tenant
        )
        
        # Create users
        self.admin_user = User.objects.create_user(
            username="admin",
            password="admin123",
            tenant=self.tenant,
            branch=self.branch,
            is_staff=True
        )
        
        self.normal_user = User.objects.create_user(
            username="normal",
            password="normal123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create client classification
        self.classification = ClientClassification.objects.create(
            name="Test Classification",
            code="TEST",
            owner=self.admin_user,
            created_by=self.admin_user
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.admin_user)

    def test_create_client(self):
        """Test creating a client via API"""
        url = reverse('clients:client-list')
        data = {
            'name': 'John Doe',
            'marital_status': 'single',
            'next_of_kin': 'Jane Doe',
            'next_of_kin_phone': '1234567890',
            'next_of_kin_relationship': 'Sister',
            'date_of_birth': '1990-01-01'
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Client.objects.count(), 1)
        
        client = Client.objects.first()
        self.assertEqual(client.name, 'John Doe')
        self.assertEqual(client.owner, self.admin_user)
        self.assertEqual(client.branch, self.branch)

    def test_list_clients(self):
        """Test listing clients with filters"""
        # Create multiple clients
        clients = []
        for i in range(3):
            client = Client.objects.create(
                name=f"Client {i}",
                marital_status="single",
                owner=self.admin_user,
                created_by=self.admin_user,
                branch=self.branch
            )
            clients.append(client)
        
        url = reverse('clients:client-list')
        
        # Test basic listing
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
        
        # Test search
        response = self.client.get(url + '?search=Client 1')
        self.assertEqual(len(response.data), 1)

    def test_update_client(self):
        """Test updating a client"""
        client = Client.objects.create(
            name="Test Client",
            marital_status="single",
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('clients:client-detail', args=[client.id])
        data = {
            'name': 'Updated Client',
            'marital_status': 'married'
        }
        
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        client.refresh_from_db()
        self.assertEqual(client.name, 'Updated Client')
        self.assertEqual(client.marital_status, 'married')

    def test_delete_client(self):
        """Test soft-deleting a client"""
        client = Client.objects.create(
            name="Test Client",
            owner=self.admin_user,
            created_by=self.admin_user,
            branch=self.branch
        )
        
        url = reverse('clients:client-detail', args=[client.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify soft delete
        client.refresh_from_db()
        self.assertTrue(client.is_deleted)
        self.assertEqual(Client.objects.count(), 0)
        self.assertEqual(Client.all_objects.count(), 1)

class ClientClassificationAPITests(APITestCase):
    """Test client classification API endpoints"""
    
    def setUp(self):
        # Create tenant and branch
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(
            name="Test Branch",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.user)

    def test_classification_crud(self):
        """Test CRUD operations for client classifications"""
        url = reverse('clients:clientclassification-list')
        
        # Create
        data = {
            'name': 'Premium',
            'code': 'PREM',
            'description': 'Premium clients'
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        classification_id = response.data['id']
        
        # Read
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        
        # Update
        detail_url = reverse('clients:clientclassification-detail', args=[classification_id])
        update_data = {
            'name': 'VIP Clients',
            'code': 'PREM'
        }
        response = self.client.patch(detail_url, update_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'VIP Clients')
        
        # Delete
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ClientClassification.objects.count(), 0)
