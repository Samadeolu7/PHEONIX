"""
Tests for StockAdjustmentRequest creation with retry logic for unique constraint handling

Tests cover:
- Successful stock adjustment creation with auto-generated request_number
- Retry mechanism when request_number collision occurs
- Failure after max retry attempts
- Approval workflow integration
"""

from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status as http_status

from inventory.models import (
    InventoryItem,
    Location,
    StockAdjustmentRequest
)
from inventory.config_models import InventoryConfig
from products.models import ProductCategory
from branches.models import Branch
from users.models import Tenant
from common.managers import set_current_tenant

User = get_user_model()


class StockAdjustmentCreationTest(TestCase):
    """Test StockAdjustmentRequest creation with retry logic"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testinventory')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create inventory item (without category to avoid industry requirement)
        self.item = InventoryItem.objects.create(
            name='Test Widget',
            sku='TWG-001',
            cost_price=Decimal('10.00'),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create location
        self.location = Location.objects.create(
            name='Warehouse A',
            code='WHA',
            location_type='warehouse',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create inventory config requiring approval for adjustments > 100
        self.config = InventoryConfig.objects.create(
            owner=self.user,
            branch=self.branch,
            enable_adjustment_approval=True,
            adjustment_approval_threshold=Decimal('100.00')
        )
        
        # Set up API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_successful_adjustment_request_creation(self):
        """Test normal stock adjustment request creation succeeds"""
        adjustment_data = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '50.00',
            'reason': 'Count Adjustment',
            'notes': 'Found during physical count',
            'unit_cost': '10.00'
        }
        
        response = self.client.post(
            '/api/inventory/adjustments/',
            data=adjustment_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertIn('data', response.data)
        self.assertIn('request_number', response.data['data'])
        self.assertTrue(response.data['data']['request_number'].startswith('SADJ-'))
        self.assertEqual(response.data['data']['status'], 'pending')
        self.assertTrue(response.data['requires_approval'])
        
        # Verify adjustment was created in database
        adjustment = StockAdjustmentRequest.objects.get(
            request_number=response.data['data']['request_number']
        )
        self.assertEqual(adjustment.item, self.item)
        self.assertEqual(adjustment.quantity, Decimal('50.00'))
    
    def test_multiple_adjustments_same_item(self):
        """Test creating multiple adjustment requests for same item"""
        adjustment_data_1 = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '30.00',
            'reason': 'Found units',
            'unit_cost': '10.00'
        }
        
        adjustment_data_2 = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'decrease',
            'quantity': '20.00',
            'reason': 'Damaged units',
            'unit_cost': '10.00'
        }
        
        # Create first adjustment
        response1 = self.client.post('/api/inventory/adjustments/', data=adjustment_data_1, format='json')
        self.assertEqual(response1.status_code, http_status.HTTP_201_CREATED)
        
        # Create second adjustment
        response2 = self.client.post('/api/inventory/adjustments/', data=adjustment_data_2, format='json')
        self.assertEqual(response2.status_code, http_status.HTTP_201_CREATED)
        
        # Verify both adjustments exist with unique request numbers
        self.assertNotEqual(
            response1.data['data']['request_number'],
            response2.data['data']['request_number']
        )
        self.assertEqual(StockAdjustmentRequest.objects.count(), 2)
    
    @patch('common.services.reference_service.ReferenceService.generate_reference')
    def test_retry_on_request_number_collision(self, mock_generate_reference):
        """Test that retry mechanism works when request_number collision occurs"""
        # First call returns a duplicate number, second call returns unique number
        mock_generate_reference.side_effect = [
            'SADJ-2026-0001',  # First attempt - will collide
            'SADJ-2026-0002'   # Second attempt - will succeed
        ]
        
        # Create first adjustment with the duplicate number manually
        StockAdjustmentRequest.objects.create(
            request_number='SADJ-2026-0001',
            requested_by=self.user,
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('25.00'),
            unit_cost=Decimal('10.00'),
            estimated_cost=Decimal('250.00'),
            reason='Test',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Now try to create another adjustment - should retry and succeed
        adjustment_data = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '30.00',
            'reason': 'Count Adjustment',
            'unit_cost': '10.00'
        }
        
        response = self.client.post(
            '/api/inventory/adjustments/',
            data=adjustment_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(response.data['data']['request_number'], 'SADJ-2026-0002')
        
        # Verify generate_reference was called twice
        self.assertEqual(mock_generate_reference.call_count, 2)
    
    @patch('common.services.reference_service.ReferenceService.generate_reference')
    def test_retry_exhaustion_failure(self, mock_generate_reference):
        """Test that creation fails after max retry attempts"""
        # All attempts return the same duplicate number
        mock_generate_reference.return_value = 'SADJ-2026-0001'
        
        # Create first adjustment with the duplicate number
        StockAdjustmentRequest.objects.create(
            request_number='SADJ-2026-0001',
            requested_by=self.user,
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('25.00'),
            unit_cost=Decimal('10.00'),
            estimated_cost=Decimal('250.00'),
            reason='Test',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Try to create another adjustment - should fail after 5 attempts
        adjustment_data = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '30.00',
            'reason': 'Count Adjustment',
            'unit_cost': '10.00'
        }
        
        response = self.client.post(
            '/api/inventory/adjustments/',
            data=adjustment_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
        self.assertIn('Failed to generate unique request number', response.data['error'])
        
        # Verify generate_reference was called 5 times (max_attempts)
        self.assertEqual(mock_generate_reference.call_count, 5)
    
    def test_adjustment_without_approval_threshold(self):
        """Test that small adjustments don't require approval and execute immediately"""
        # Update config to not require approval for small amounts
        self.config.adjustment_approval_threshold = Decimal('1000.00')
        self.config.save()
        
        adjustment_data = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '5.00',
            'reason': 'Minor adjustment',
            'unit_cost': '10.00'  # Total: 50, below threshold
        }
        
        response = self.client.post(
            '/api/inventory/adjustments/',
            data=adjustment_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        # Small adjustments execute immediately, no approval needed
        self.assertIn('success', response.data)
    
    def test_concurrent_adjustment_creation_simulation(self):
        """Test that concurrent adjustment creations don't cause issues"""
        adjustment_data_template = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '10.00',
            'reason': 'Test adjustment',
            'unit_cost': '10.00'
        }
        
        # Create multiple adjustments rapidly
        responses = []
        for i in range(5):
            adjustment_data = adjustment_data_template.copy()
            adjustment_data['notes'] = f'Adjustment {i}'
            
            response = self.client.post(
                '/api/inventory/adjustments/',
                data=adjustment_data,
                format='json'
            )
            responses.append(response)
        
        # All should succeed
        successful_responses = [r for r in responses if r.status_code == http_status.HTTP_201_CREATED]
        self.assertEqual(len(successful_responses), 5)
        
        # All should have unique request numbers
        request_numbers = [r.data['data']['request_number'] for r in successful_responses]
        self.assertEqual(len(request_numbers), len(set(request_numbers)))
        
        # Verify all adjustments were created
        self.assertEqual(StockAdjustmentRequest.objects.count(), 5)
    
    def test_request_number_inherits_tenant_and_owner(self):
        """Test that adjustment request inherits tenant and owner from request user"""
        adjustment_data = {
            'item': self.item.id,
            'location': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '30.00',
            'reason': 'Test',
            'unit_cost': '10.00'
        }
        
        response = self.client.post(
            '/api/inventory/adjustments/',
            data=adjustment_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        
        # Verify tenant and owner were set correctly
        adjustment = StockAdjustmentRequest.objects.get(
            request_number=response.data['data']['request_number']
        )
        self.assertEqual(adjustment.owner, self.user)
        self.assertEqual(adjustment.branch, self.branch)
        self.assertEqual(adjustment.requested_by, self.user)
