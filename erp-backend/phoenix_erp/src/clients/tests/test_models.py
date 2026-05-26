from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from ..models import Client, ClientClassification
from users.models import Tenant, Branch

User = get_user_model()

class ClientModelTests(TestCase):
    """Test client model methods and constraints"""
    
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
        
        # Create client classification
        self.classification = ClientClassification.objects.create(
            name="Test Classification",
            code="TEST",
            owner=self.user,
            created_by=self.user
        )

    def test_client_creation(self):
        """Test creating a client with valid data"""
        client = Client.objects.create(
            name="Test Client",
            marital_status="single",
            next_of_kin="John Doe",
            next_of_kin_phone="1234567890",
            next_of_kin_relationship="Brother",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        self.assertEqual(str(client), "Test Client")
        self.assertEqual(client.marital_status, "single")

    def test_invalid_marital_status(self):
        """Test that invalid marital status is rejected"""
        with self.assertRaises(ValidationError):
            Client.objects.create(
                name="Invalid Client",
                marital_status="invalid_status",
                owner=self.user,
                created_by=self.user,
                branch=self.branch
            )

    def test_client_soft_delete(self):
        """Test soft delete functionality"""
        client = Client.objects.create(
            name="Test Client",
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )
        
        # Soft delete client
        client.delete()
        
        # Verify client is soft deleted
        self.assertTrue(client.is_deleted)
        self.assertEqual(Client.objects.count(), 0)
        self.assertEqual(Client.all_objects.count(), 1)

class ClientClassificationTests(TestCase):
    """Test client classification model"""
    
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            tenant=self.tenant
        )

    def test_classification_creation(self):
        """Test creating a client classification"""
        classification = ClientClassification.objects.create(
            name="Premium",
            code="PREM",
            description="Premium clients",
            owner=self.user,
            created_by=self.user
        )
        
        self.assertEqual(str(classification), "Premium")
        self.assertEqual(classification.code, "PREM")

    def test_unique_code(self):
        """Test that classification codes must be unique"""
        ClientClassification.objects.create(
            name="First Class",
            code="CLASS1",
            owner=self.user,
            created_by=self.user
        )
        
        # Attempt to create another classification with the same code
        with self.assertRaises(Exception):
            ClientClassification.objects.create(
                name="Second Class",
                code="CLASS1",  # Same code
                owner=self.user,
                created_by=self.user
            )
