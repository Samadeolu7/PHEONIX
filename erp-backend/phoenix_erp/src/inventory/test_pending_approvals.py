"""
Test suite for unified pending approvals endpoint.

Tests the aggregated view that combines pending items from:
- StockAdjustmentRequest
- StockTransferRequest  
- WriteOffRequest
- SalesOrder
"""
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from decimal import Decimal

from inventory.models import (
    StockAdjustmentRequest, StockTransferRequest, WriteOffRequest, SalesOrder
)
from inventory.config_models import InventoryConfig
# Import BaseApprovalTest to reuse its setUp
from inventory.test_approval_workflows import BaseApprovalTest


class PendingApprovalsTest(BaseApprovalTest):
    """Test unified pending approvals endpoint"""
    
    def test_empty_pending_approvals(self):
        """Test endpoint returns empty list when no pending items"""
        response = self.client.get('/api/inventory/pending-approvals/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 0)
        self.assertEqual(len(response.data['pending_approvals']), 0)
    
    def test_unified_pending_approvals(self):
        """Test endpoint aggregates all pending approval types"""
        # Create test client for sales orders
        from clients.models import Client
        test_client = Client.objects.create(
            first_name='Test',
            last_name='Client',
            email='client@test.com',
            phone_primary='1234567890',
            gender='other',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create second location for transfers
        from inventory.models import Location
        location_b = Location.objects.create(
            name='Warehouse B',
            code='WH-B',
            location_type='warehouse',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create pending adjustment
        adj = StockAdjustmentRequest.objects.create(
            request_number='ADJ-001',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100'),
            reason='Test adjustment',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Create pending transfer
        tfr = StockTransferRequest.objects.create(
            request_number='TRF-001',
            item=self.item,
            from_location=self.location,
            to_location=location_b,
            quantity=Decimal('5'),
            unit_cost=Decimal('100'),
            reason='Test transfer',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Create pending write-off
        wo = WriteOffRequest.objects.create(
            request_number='WO-001',
            item=self.item,
            location=self.location,
            quantity=Decimal('3'),
            unit_cost=Decimal('100'),
            reason='Damaged',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Create pending sales order
        so = SalesOrder.objects.create(
            so_number='SO-001',
            client=test_client,
            status='pending_approval',
            total_amount=Decimal('5000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Get unified approvals
        response = self.client.get('/api/inventory/pending-approvals/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 4)
        self.assertEqual(len(response.data['pending_approvals']), 4)
        
        # Verify summary
        summary = response.data['summary']
        self.assertEqual(summary['total_pending'], 4)
        self.assertEqual(summary['by_type']['adjustment']['count'], 1)
        self.assertEqual(summary['by_type']['transfer']['count'], 1)
        self.assertEqual(summary['by_type']['writeoff']['count'], 1)
        self.assertEqual(summary['by_type']['sales_order']['count'], 1)
        
        # Verify all types are present
        types = [item['type'] for item in response.data['pending_approvals']]
        self.assertIn('adjustment', types)
        self.assertIn('transfer', types)
        self.assertIn('writeoff', types)
        self.assertIn('sales_order', types)
    
    def test_filter_by_type(self):
        """Test filtering pending approvals by type"""
        # Create second location for transfers
        from inventory.models import Location
        location_b = Location.objects.create(
            name='Warehouse B',
            code='WH-B',
            location_type='warehouse',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create items
        StockAdjustmentRequest.objects.create(
            request_number='ADJ-001',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100'),
            reason='Test',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        StockTransferRequest.objects.create(
            request_number='TRF-001',
            item=self.item,
            from_location=self.location,
            to_location=location_b,
            quantity=Decimal('5'),
            unit_cost=Decimal('100'),
            reason='Test',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Filter for adjustments only
        response = self.client.get('/api/inventory/pending-approvals/?type=adjustment')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['pending_approvals'][0]['type'], 'adjustment')
    
    def test_sort_by_cost(self):
        """Test sorting pending approvals by cost"""
        # Create items with different costs
        StockAdjustmentRequest.objects.create(
            request_number='ADJ-001',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100'),
            reason='Low cost',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        StockAdjustmentRequest.objects.create(
            request_number='ADJ-002',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('100'),
            unit_cost=Decimal('100'),
            reason='High cost',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Sort by cost
        response = self.client.get('/api/inventory/pending-approvals/?sort=cost')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        
        # Verify highest cost first
        costs = [Decimal(item['estimated_cost']) for item in response.data['pending_approvals']]
        self.assertEqual(costs, sorted(costs, reverse=True))
    
    def test_approved_items_excluded(self):
        """Test that approved items are not included"""
        # Create pending item
        StockAdjustmentRequest.objects.create(
            request_number='ADJ-001',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100'),
            reason='Pending',
            status='pending',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        # Create approved item
        StockAdjustmentRequest.objects.create(
            request_number='ADJ-002',
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100'),
            reason='Approved',
            status='approved',
            owner=self.user,
            branch=self.branch,
            requested_by=self.user,
            created_by=self.user
        )
        
        response = self.client.get('/api/inventory/pending-approvals/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['pending_approvals'][0]['reason'], 'Pending')
