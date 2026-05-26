# inventory/test_approval_workflows.py
"""
Comprehensive tests for inventory approval workflows
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal

from inventory.models import (
    InventoryItem, Location, StockMovement, InventoryStock,
    StockAdjustmentRequest, StockTransferRequest, WriteOffRequest,
    SalesOrder, InventoryCategory
)
from inventory.config_models import InventoryConfig
from branches.models import Branch
from clients.models import Client
from accounts.models import Account

User = get_user_model()


class BaseApprovalTest(TestCase):
    """Base test class with common setup"""
    
    def setUp(self):
        """Set up test data"""
        # Create test user and branch
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            email='test@example.com',
            first_name='Test',
            last_name='User'
        )
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB001',
            owner=self.user,
            created_by=self.user
        )
        self.user.branch = self.branch
        self.user.save()
        
        # Create required accounts for InventoryCategory
        self.inventory_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            code='1300',
            name='Inventory Asset',
            account_type='current_asset',
            account_level=Account.LEVEL_PARENT
        )
        self.cogs_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            code='5100',
            name='Cost of Goods Sold',
            account_type='expense',
            account_level=Account.LEVEL_PARENT
        )
        self.sales_account = Account.objects.create(
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            code='4100',
            name='Sales Revenue',
            account_type='revenue',
            account_level=Account.LEVEL_PARENT
        )
        
        # Create test location
        self.location = Location.objects.create(
            name='Warehouse A',
            code='WH-A',
            location_type='warehouse',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create test category with required accounts
        self.category = InventoryCategory.objects.create(
            name='Test Category',
            code='TEST',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create test item
        self.item = InventoryItem.objects.create(
            name='Test Product',
            sku='TEST-001',
            category=self.category,
            unit_of_measure='pcs',
            cost_price=Decimal('100.00'),
            selling_price=Decimal('150.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Set up API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_adjustment_with_approval_required(self):
        """Test creating adjustment when approval is required"""
        # Configure to require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': True,
                'adjustment_approval_threshold': None  # All adjustments need approval
            }
        )
        
        # Create adjustment
        response =  self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '10',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'pending')
        
        # Verify request was created
        request_obj = StockAdjustmentRequest.objects.get(pk=response.data['data']['id'])
        self.assertEqual(request_obj.status, 'pending')
        self.assertEqual(request_obj.quantity, Decimal('10'))
        self.assertEqual(request_obj.estimated_cost, Decimal('1000.00'))
    
    def test_adjustment_without_approval(self):
        """Test creating adjustment when approval is NOT required"""
        # Configure to NOT require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_adjustment_approval': False
        })
        
        # Create adjustment
        response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '10',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_approval'])
        
        # Verify stock movement was created
        self.assertTrue(StockMovement.objects.filter(item=self.item).exists())
    
    def test_adjustment_with_threshold(self):
        """Test adjustment approval based on threshold"""
        # Configure with threshold
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': True,
                'adjustment_approval_threshold': Decimal('500.00')  # Only >= $500 needs approval
            }
        )
        
        # Create small adjustment (below threshold)
        response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '3',  # 3 × $100 = $300 (below threshold)
            'unit_cost': '100.00',
            'reason': 'Small adjustment'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_approval'])  # Should NOT require approval
        
        # Create large adjustment (above threshold)
        response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '10',  # 10 × $100 = $1000 (above threshold)
            'unit_cost': '100.00',
            'reason': 'Large adjustment'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_approval'])  # SHOULD require approval
        self.assertEqual(response.data['data']['status'], 'pending')
    
    def test_approve_adjustment(self):
        """Test approving a pending adjustment"""
        # Create pending request
        request_obj = StockAdjustmentRequest.objects.create(
            request_number='ADJ-TEST-001',
            requested_by=self.user,
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100.00'),
            estimated_cost=Decimal('1000.00'),
            reason='Test',
            status='pending',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Approve it
        response = self.client.post(f'/api/inventory/adjustments/{request_obj.id}/approve/', {
            'notes': 'Approved for testing'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'approved')
        self.assertEqual(request_obj.approved_by, self.user)
        self.assertIsNotNone(request_obj.approved_at)
    
    def test_reject_adjustment(self):
        """Test rejecting a pending adjustment"""
        # Create pending request
        request_obj = StockAdjustmentRequest.objects.create(
            request_number='ADJ-TEST-002',
            requested_by=self.user,
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100.00'),
            estimated_cost=Decimal('1000.00'),
            reason='Test',
            status='pending',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Reject it
        response = self.client.post(f'/api/inventory/adjustments/{request_obj.id}/reject/', {
            'notes': 'Not needed'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'rejected')
    
    def test_execute_approved_adjustment(self):
        """Test executing an approved adjustment"""
        # Create approved request
        request_obj = StockAdjustmentRequest.objects.create(
            request_number='ADJ-TEST-003',
            requested_by=self.user,
            item=self.item,
            location=self.location,
            adjustment_type='increase',
            quantity=Decimal('10'),
            unit_cost=Decimal('100.00'),
            estimated_cost=Decimal('1000.00'),
            reason='Test',
            status='approved',
            approved_by=self.user,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Execute it
        response = self.client.post(f'/api/inventory/adjustments/{request_obj.id}/execute/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'executed')
        self.assertIsNotNone(request_obj.stock_movement)
        
        # Verify stock movement was created
        movement = request_obj.stock_movement
        self.assertEqual(movement.item, self.item)
        self.assertEqual(movement.to_location, self.location)  # For increase adjustment
        self.assertEqual(movement.quantity, Decimal('10'))


class StockTransferApprovalTest(BaseApprovalTest):
    """Test stock transfer approval workflows"""
    
    def setUp(self):
        super().setUp()
        # Create second test location
        self.from_location = self.location  # Use base location as from
        self.to_location = Location.objects.create(
            name='Warehouse B',
            code='WH-B',
            location_type='warehouse',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        self.location_b = self.to_location  # Keep alias for backward compatibility
    
    def test_transfer_with_approval_required(self):
        """Test creating transfer when approval is required"""
        # Configure to require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_transfer_approval': True,
                'transfer_approval_threshold': None  # All transfers need approval
            }
        )
        
        # Create transfer
        response = self.client.post('/api/inventory/transfers/', {
            'item_id': self.item.id,
            'from_location_id': self.location.id,
            'to_location_id': self.location_b.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Rebalancing stock'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'pending')
    
    def test_transfer_without_approval(self):
        """Test creating transfer when approval is NOT required"""
        # Configure to NOT require approval for adjustments or transfers
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': False,
                'require_transfer_approval': False
            }
        )
        
        # First, create some stock at from_location using adjustment
        adjustment_response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.from_location.id,
            'adjustment_type': 'increase',
            'quantity': '50',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        self.assertEqual(adjustment_response.status_code, status.HTTP_201_CREATED)
        
        # Create transfer
        response = self.client.post('/api/inventory/transfers/', {
            'item_id': self.item.id,
            'from_location_id': self.location.id,
            'to_location_id': self.location_b.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Rebalancing stock'
        })
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_approval'])
    
    def test_full_transfer_workflow(self):
        """Test complete transfer workflow: create → approve → execute"""
        # Configure - no approval for adjustments, all transfers require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': False,
                'require_transfer_approval': True,
                'transfer_approval_threshold': None  # All transfers need approval
            }
        )
        
        # First, create some stock at from_location using adjustment
        adjustment_response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.from_location.id,
            'adjustment_type': 'increase',
            'quantity': '100',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        self.assertEqual(adjustment_response.status_code, status.HTTP_201_CREATED)
        
        # Step 1: Create transfer request
        response = self.client.post('/api/inventory/transfers/', {
            'item_id': self.item.id,
            'from_location_id': self.from_location.id,
            'to_location_id': self.to_location.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Rebalancing stock'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['data']['id']
        
        # Step 2: Approve
        response = self.client.post(f'/api/inventory/transfers/{request_id}/approve/', {
            'notes': 'Approved'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'approved')
        
        # Step 3: Execute
        response = self.client.post(f'/api/inventory/transfers/{request_id}/execute/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'executed')
        
        # Verify both movements were created
        request_obj = StockTransferRequest.objects.get(pk=request_id)
        self.assertIsNotNone(request_obj.transfer_out_movement)
        self.assertIsNotNone(request_obj.transfer_in_movement)


class WriteOffApprovalTest(BaseApprovalTest):
    """Test write-off approval workflows"""
    
    def test_writeoff_with_approval_required(self):
        """Test creating write-off when approval is required"""
        # Configure to require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_writeoff_approval': True,
                'writeoff_approval_threshold': None
            }
        )
        
        # Create write-off request
        response = self.client.post('/api/inventory/writeoffs/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Damaged goods'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'pending')
        
        # Verify request was created
        request_obj = WriteOffRequest.objects.get(pk=response.data['data']['id'])
        self.assertEqual(request_obj.status, 'pending')
        self.assertEqual(request_obj.quantity, Decimal('5'))
        self.assertEqual(request_obj.estimated_cost, Decimal('500.00'))
    
    def test_writeoff_without_approval(self):
        """Test creating write-off when approval is NOT required"""
        # Configure to NOT require approval for adjustments or write-offs
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': False,
                'require_writeoff_approval': False
            }
        )
        
        # First, create some stock using adjustment
        adjustment_response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '10',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        self.assertEqual(adjustment_response.status_code, status.HTTP_201_CREATED)
        
        # Create write-off
        response = self.client.post('/api/inventory/writeoffs/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Damaged goods'
        })
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_approval'])
    
    def test_writeoff_with_threshold(self):
        """Test write-off approval based on threshold"""
        # Configure - no approval for adjustments, threshold for write-offs
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': False,
                'require_writeoff_approval': True,
                'writeoff_approval_threshold': Decimal('500.00')
            }
        )
        
        # First, create some stock using adjustment
        adjustment_response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '100',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        self.assertEqual(adjustment_response.status_code, status.HTTP_201_CREATED)
        
        # Small write-off (below threshold)
        response = self.client.post('/api/inventory/writeoffs/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'quantity': '3',  # $300
            'unit_cost': '100.00',
            'reason': 'Small damage'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_approval'])
        
        # Large write-off (above threshold)
        response = self.client.post('/api/inventory/writeoffs/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'quantity': '10',  # $1000
            'unit_cost': '100.00',
            'reason': 'Large damage'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_approval'])
    
    def test_full_writeoff_workflow(self):
        """Test complete write-off workflow: create → approve → execute"""
        # Configure - no approval for adjustments, all write-offs require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={
                'require_adjustment_approval': False,
                'require_writeoff_approval': True,
                'writeoff_approval_threshold': None  # All require approval
            }
        )
        
        # First, create some stock using adjustment
        adjustment_response = self.client.post('/api/inventory/adjustments/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'adjustment_type': 'increase',
            'quantity': '100',
            'unit_cost': '100.00',
            'reason': 'Initial stock'
        })
        self.assertEqual(adjustment_response.status_code, status.HTTP_201_CREATED)
        
        # Step 1: Create write-off request
        response = self.client.post('/api/inventory/writeoffs/', {
            'item_id': self.item.id,
            'location_id': self.location.id,
            'quantity': '5',
            'unit_cost': '100.00',
            'reason': 'Expired inventory'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_id = response.data['data']['id']
        
        # Step 2: Approve
        response = self.client.post(f'/api/inventory/writeoffs/{request_id}/approve/', {
            'notes': 'Approved'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'approved')
        
        # Step 3: Execute
        response = self.client.post(f'/api/inventory/writeoffs/{request_id}/execute/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'executed')
        
        # Verify movement was created
        request_obj = WriteOffRequest.objects.get(pk=request_id)
        self.assertIsNotNone(request_obj.stock_movement)
        self.assertEqual(request_obj.stock_movement.movement_type, 'write_off')


class SalesOrderApprovalTest(BaseApprovalTest):
    """Test sales order approval workflows"""
    
    def setUp(self):
        super().setUp()
        # Create test client
        self.test_client = Client.objects.create(
            first_name='Test',
            last_name='Client',
            email='client@test.com',
            phone_primary='1234567890',
            gender='other',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_salesorder_with_approval_required(self):
        """Test submitting sales order when approval is required"""
        # Configure to require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_sales_order_approval': True, 'sales_order_approval_threshold': None
        })
        
        # Create sales order
        order = SalesOrder.objects.create(
            so_number='SO-001',
            client=self.test_client,
            status='draft',
            total_amount=Decimal('5000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Submit for approval
        response = self.client.post(f'/api/inventory/sales-orders/{order.id}/submit/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'pending_approval')
    
    def test_salesorder_without_approval(self):
        """Test submitting sales order when approval is NOT required"""
        # Configure to NOT require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_sales_order_approval': False
        })
        
        # Create sales order
        order = SalesOrder.objects.create(
            so_number='SO-002',
            client=self.test_client,
            status='draft',
            total_amount=Decimal('5000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Submit for approval
        response = self.client.post(f'/api/inventory/sales-orders/{order.id}/submit/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'confirmed')
    
    def test_salesorder_with_threshold(self):
        """Test sales order approval based on threshold"""
        # Configure with threshold
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_sales_order_approval': True, 'sales_order_approval_threshold': Decimal('10000.00')
        })
        
        # Small order (below threshold)
        small_order = SalesOrder.objects.create(
            so_number='SO-003',
            client=self.test_client,
            status='draft',
            total_amount=Decimal('5000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        response = self.client.post(f'/api/inventory/sales-orders/{small_order.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'confirmed')
        
        # Large order (above threshold)
        large_order = SalesOrder.objects.create(
            so_number='SO-004',
            client=self.test_client,
            status='draft',
            total_amount=Decimal('15000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        response = self.client.post(f'/api/inventory/sales-orders/{large_order.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['requires_approval'])
        self.assertEqual(response.data['data']['status'], 'pending_approval')
    
    def test_full_salesorder_workflow(self):
        """Test complete sales order workflow: create → submit → approve → confirm"""
        # Configure to require approval
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_sales_order_approval': True
        })
        
        # Step 1: Create order
        order = SalesOrder.objects.create(
            so_number='SO-005',
            client=self.test_client,
            status='draft',
            total_amount=Decimal('5000.00'),
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Step 2: Submit for approval
        response = self.client.post(f'/api/inventory/sales-orders/{order.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'pending_approval')
        
        # Step 3: Approve
        response = self.client.post(f'/api/inventory/sales-orders/{order.id}/approve/', {
            'notes': 'Approved for processing'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'approved')
        
        # Step 4: Confirm
        response = self.client.post(f'/api/inventory/sales-orders/{order.id}/confirm/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['status'], 'confirmed')


class InventoryConfigTest(BaseApprovalTest):
    """Test InventoryConfig helper methods"""
    
    def test_requires_adjustment_approval_with_threshold(self):
        """Test adjustment approval threshold logic"""
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_writeoff_approval': True, 'adjustment_approval_threshold': Decimal('1000.00')}
        )
        
        # Below threshold
        self.assertFalse(config.requires_adjustment_approval(Decimal('500.00')))
        
        # Equal to threshold
        self.assertTrue(config.requires_adjustment_approval(Decimal('1000.00')))
        
        # Above threshold
        self.assertTrue(config.requires_adjustment_approval(Decimal('1500.00')))
        
        # Unknown cost
        self.assertTrue(config.requires_adjustment_approval(None))
    
    def test_requires_approval_when_disabled(self):
        """Test that disabled approval always returns False"""
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_adjustment_approval': False, 'adjustment_approval_threshold': Decimal('100.00')}
        )
        
        # Should always return False when disabled
        self.assertFalse(config.requires_adjustment_approval(Decimal('50.00')))
        self.assertFalse(config.requires_adjustment_approval(Decimal('500.00')))
        self.assertFalse(config.requires_adjustment_approval(None))
    
    def test_requires_approval_all_when_no_threshold(self):
        """Test that NULL threshold means all require approval"""
        config, _ = InventoryConfig.objects.update_or_create(
            owner=self.user,
            branch=self.branch,
            defaults={'require_writeoff_approval': True, 'writeoff_approval_threshold': None  # All require approval
        })
        
        # All amounts should require approval
        self.assertTrue(config.requires_writeoff_approval(Decimal('10.00')))
        self.assertTrue(config.requires_writeoff_approval(Decimal('1000.00')))
        self.assertTrue(config.requires_writeoff_approval(None))




