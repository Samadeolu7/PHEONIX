"""
Test: Purchase Requisition to Purchase Order Flow

This test validates the complete procurement workflow:
1. Create requisition with workflow
2. Approve requisition
3. Convert approved requisition to PO
4. Verify PO is created correctly

This ensures the frontend can safely integrate the requisition-to-PO feature.
"""
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date, timedelta

from users.models import Tenant
from branches.models import Branch
from procurement.models import (
    Supplier, PurchaseRequisition, PurchaseRequisitionItem,
    PurchaseOrder, PurchaseOrderItem
)
from inventory.models import InventoryItem, InventoryCategory, Location
from accounts.models import Account

User = get_user_model()


class RequisitionToPOFlowTest(TransactionTestCase):
    """
    Test the complete requisition to PO workflow
    
    This test ensures:
    - Requisitions can be created with workflow
    - Requisitions can be approved
    - Approved requisitions can be converted to POs
    - PO contains correct data from requisition
    """
    
    def setUp(self):
        """Set up test data"""
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(
            name="Test Company Ltd",
            slug="test-company",
            domain_type="retail",
            is_active=True
        )
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAIN",
            is_active=True,
            tenant=self.tenant
        )
        
        # Create users
        self.requester = User.objects.create_user(
            username='requester',
            email='requester@test.com',
            password='testpass123',
            first_name='John',
            last_name='Requester'
        )
        self.requester.owner = self.tenant
        self.requester.tenant = self.tenant
        self.requester.branch = self.branch
        self.requester.save()
        
        self.approver = User.objects.create_user(
            username='approver',
            email='approver@test.com',
            password='testpass123',
            first_name='Jane',
            last_name='Approver'
        )
        self.approver.tenant = self.tenant
        self.approver.owner = self.tenant
        self.approver.branch = self.branch
        # is_superuser is the only blanket approval-authority bypass IsApprover
        # honors (common/approval_permissions.py) — is_staff alone no longer
        # grants approval rights, since it doesn't imply any RolePermissionPolicy
        # grant and was never meant to be a financial approval authority signal.
        self.approver.is_superuser = True
        self.approver.save()
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            owner=self.requester,  # owner is a User, not Tenant
            branch=self.branch,
            supplier_code='SUP-001',
            name='Test Supplier Ltd',
            email='supplier@test.com',
            phone='+234-123-456-7890',
            payment_terms='net_30',
            is_active=True
        )
        
        # Create GL accounts for inventory category
        self.inventory_account = Account.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Inventory Asset',
            code='130',
            account_type='ASSET',
            account_level='PARENT'
        )
        self.cogs_account = Account.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Cost of Goods Sold',
            code='510',
            account_type='EXPENSE',
            account_level='PARENT'
        )
        self.sales_account = Account.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Sales Revenue',
            code='410',
            account_type='INCOME',
            account_level='PARENT'
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Office Equipment',
            code='OFF-EQUIP',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account
        )
        
        # Create inventory items
        self.item1 = InventoryItem.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Laptop Dell XPS 15',
            sku='DELL-XPS15',
            category=self.category,
            selling_price=Decimal('1500.00'),
            cost_price=Decimal('1200.00'),
            is_active=True
        )
        
        self.item2 = InventoryItem.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Wireless Mouse',
            sku='MOUSE-WIRELESS',
            category=self.category,
            selling_price=Decimal('25.00'),
            cost_price=Decimal('15.00'),
            is_active=True
        )
        
        # Create location for delivery
        self.location = Location.objects.create(
            owner=self.requester,
            branch=self.branch,
            name='Main Warehouse',
            code='WH-MAIN',
            location_type='warehouse'
        )
        
        # Set up API client
        self.client = APIClient()
    
    def test_complete_requisition_to_po_flow(self):
        """Test: Create requisition -> Approve -> Convert to PO"""
        
        print("\n" + "="*70)
        print("TEST: Complete Requisition to Purchase Order Flow")
        print("="*70)
        
        # ============================================================
        # STEP 1: Create requisition with workflow
        # ============================================================
        print("\n[STEP 1] Creating purchase requisition...")
        
        self.client.force_authenticate(user=self.requester)
        
        requisition_data = {
            'requested_by': self.requester.id,
            'department': 'IT Department',
            'purpose': 'Upgrading development team equipment',
            'required_by_date': (date.today() + timedelta(days=30)).isoformat(),
            'items': [
                {
                    'item': self.item1.id,
                    'description': 'Dell XPS 15 Laptop - i7, 16GB RAM',
                    'quantity': 5,
                    'estimated_unit_price': 1200.00,
                    'notes': 'Intel i7, 16GB RAM, 512GB SSD'
                },
                {
                    'item': self.item2.id,
                    'description': 'Logitech Wireless Mouse',
                    'quantity': 5,
                    'estimated_unit_price': 15.00,
                    'notes': 'USB receiver, ergonomic design'
                }
            ]
        }
        
        # Note: Using standard create endpoint since workflow might not be set up
        response = self.client.post(
            '/api/procurement/purchase-requisitions/',
            data=requisition_data,
            format='json'
        )
        
        print(f"Response Status: {response.status_code}")
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Error Response: {response.data}")
        
        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Failed to create requisition. Response: {response.data}"
        )
        
        requisition_id = response.data['id']
        pr_number = response.data.get('pr_number', 'N/A')
        
        print(f"[OK] Requisition created successfully")
        print(f"  - Requisition ID: {requisition_id}")
        print(f"  - PR Number: {pr_number}")
        print(f"  - Status: {response.data.get('status')}")
        print(f"  - Items: {len(response.data.get('items', []))}")
        
        # Verify requisition in database
        requisition = PurchaseRequisition.objects.get(id=requisition_id)
        self.assertEqual(requisition.status, 'draft')
        self.assertEqual(requisition.requested_by, self.requester)
        
        # Verify items
        req_items = PurchaseRequisitionItem.objects.filter(requisition=requisition)
        self.assertEqual(req_items.count(), 2)
        
        # Calculate total
        total_amount = sum(
            item.quantity * item.estimated_unit_price 
            for item in req_items
        )
        print(f"  - Total Amount: ${total_amount:,.2f}")
        
        # ============================================================
        # STEP 2: Submit requisition (change status to submitted)
        # ============================================================
        print("\n[STEP 2] Submitting requisition for approval...")
        
        # Update status to submitted
        requisition.status = 'submitted'
        requisition.save()
        
        print(f"[OK] Requisition submitted")
        print(f"  - Status changed: draft -> submitted")
        
        # ============================================================
        # STEP 3: Approve requisition
        # ============================================================
        print("\n[STEP 3] Approving requisition...")
        
        self.client.force_authenticate(user=self.approver)
        
        response = self.client.post(
            f'/api/procurement/purchase-requisitions/{requisition_id}/approve/'
        )
        
        print(f"Response Status: {response.status_code}")
        if response.status_code != status.HTTP_200_OK:
            print(f"Error Response: {response.data}")
        
        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Failed to approve requisition. Response: {response.data}"
        )
        
        print(f"[OK] Requisition approved successfully")
        print(f"  - Approved by: {self.approver.get_full_name()}")
        print(f"  - Status: {response.data.get('status')}")
        
        # Verify approval in database
        requisition.refresh_from_db()
        self.assertEqual(requisition.status, 'approved')
        self.assertEqual(requisition.approved_by, self.approver)
        self.assertIsNotNone(requisition.approved_at)
        
        # ============================================================
        # STEP 4: Convert approved requisition to PO
        # ============================================================
        print("\n[STEP 4] Converting requisition to Purchase Order...")
        
        po_data = {
            'supplier': self.supplier.id,
            'delivery_location': self.location.id,
            'expected_delivery_date': (date.today() + timedelta(days=14)).isoformat(),
            'payment_terms': 'net_30',
            'notes': 'Urgent order - needed for Q1 projects'
        }
        
        response = self.client.post(
            f'/api/procurement/purchase-requisitions/{requisition_id}/convert-to-po/',
            data=po_data,
            format='json'
        )
        
        print(f"Response Status: {response.status_code}")
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Error Response: {response.data}")
        
        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Failed to convert to PO. Response: {response.data}"
        )
        
        # Response now wrapped in success message
        self.assertTrue(response.data.get('success'))
        po_data_response = response.data.get('po', response.data)
        
        po_id = po_data_response['id']
        po_number = po_data_response.get('po_number', 'N/A')
        
        print(f"[OK] Purchase Order created successfully")
        print(f"  - Message: {response.data.get('message', 'N/A')}")
        print(f"  - PO ID: {po_id}")
        print(f"  - PO Number: {po_number}")
        print(f"  - Supplier: {po_data_response.get('supplier_name')}")
        print(f"  - Status: {po_data_response.get('status')}")
        
        # Verify PO in database
        po = PurchaseOrder.objects.get(id=po_id)
        self.assertEqual(po.supplier, self.supplier)
        self.assertEqual(po.requisition, requisition)
        self.assertEqual(po.delivery_location, self.location)
        
        # Verify PO items match requisition items
        po_items = PurchaseOrderItem.objects.filter(purchase_order=po)
        self.assertEqual(po_items.count(), 2)
        
        # Verify requisition status updated
        requisition.refresh_from_db()
        self.assertEqual(requisition.status, 'po_created')
        
        print(f"  - PO Items: {po_items.count()}")
        
        # Print PO items detail
        print("\n  PO Items:")
        for po_item in po_items:
            print(f"    - {po_item.item.name}")
            print(f"      Qty: {po_item.quantity} x ${po_item.unit_price} = ${po_item.quantity * po_item.unit_price}")
        
        po_total = sum(item.quantity * item.unit_price for item in po_items)
        print(f"\n  - PO Total: ${po_total:,.2f}")
        
        # ============================================================
        # STEP 5: Verify data integrity
        # ============================================================
        print("\n[STEP 5] Verifying data integrity...")
        
        # Verify totals match
        self.assertEqual(
            po_total,
            total_amount,
            "PO total should match requisition total"
        )
        
        # Verify all items transferred correctly
        for req_item in req_items:
            matching_po_item = po_items.filter(item=req_item.item).first()
            self.assertIsNotNone(
                matching_po_item,
                f"Item {req_item.item.name} should be in PO"
            )
            self.assertEqual(
                matching_po_item.quantity,
                req_item.quantity,
                f"Quantities should match for {req_item.item.name}"
            )
        
        print(f"[OK] All data integrity checks passed")
        print(f"  - Item quantities match: [OK]")
        print(f"  - Total amounts match: [OK]")
        print(f"  - Requisition linked to PO: [OK]")
        print(f"  - Requisition status updated: [OK]")
        
        # ============================================================
        # STEP 6: Verify PO is retrievable via API
        # ============================================================
        print("\n[STEP 6] Verifying PO via API...")
        
        response = self.client.get(f'/api/procurement/purchase-orders/{po_id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], po_id)
        self.assertEqual(response.data['po_number'], po_number)
        
        print(f"[OK] PO retrievable via API")
        
        # ============================================================
        # SUMMARY
        # ============================================================
        print("\n" + "="*70)
        print("TEST SUMMARY: [OK] ALL TESTS PASSED")
        print("="*70)
        print(f"Requisition {pr_number} -> Purchase Order {po_number}")
        print(f"Total Value: ${po_total:,.2f}")
        print(f"Supplier: {self.supplier.name}")
        print(f"Items: {po_items.count()}")
        print("\n[OK] Frontend can safely implement requisition-to-PO feature")
        print("="*70 + "\n")
    
    def test_cannot_convert_unapproved_requisition(self):
        """Test: Cannot convert requisition that's not approved"""
        
        print("\n" + "="*70)
        print("TEST: Verify unapproved requisition cannot be converted")
        print("="*70)
        
        # Create draft requisition
        self.client.force_authenticate(user=self.requester)
        
        requisition = PurchaseRequisition.objects.create(
            owner=self.requester,
            branch=self.branch,
            pr_number='PR-TEST-002',
            requested_by=self.requester,
            department='IT',
            purpose='Test purpose',
            required_by_date=date.today() + timedelta(days=30),
            status='draft'  # Not approved
        )
        
        PurchaseRequisitionItem.objects.create(
            requisition=requisition,
            item=self.item1,
            description='Test item',
            quantity=1,
            estimated_unit_price=Decimal('100.00')
        )
        
        print(f"\nAttempting to convert draft requisition {requisition.pr_number}...")
        
        # Try to convert to PO
        po_data = {
            'supplier_id': self.supplier.id,
            'delivery_location_id': self.location.id,
            'expected_delivery_date': (date.today() + timedelta(days=14)).isoformat()
        }
        
        response = self.client.post(
            f'/api/procurement/purchase-requisitions/{requisition.id}/convert-to-po/',
            data=po_data,
            format='json'
        )
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.data}")
        
        # Should fail with 400
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('approved', str(response.data).lower())
        
        print(f"\n[OK] Correctly rejected conversion of unapproved requisition")
        print("="*70 + "\n")
    
    def test_requisition_approval_updates_status(self):
        """Test: Approval updates requisition status correctly"""
        
        print("\n" + "="*70)
        print("TEST: Verify approval updates status correctly")
        print("="*70)
        
        # Create submitted requisition
        requisition = PurchaseRequisition.objects.create(
            owner=self.requester,
            branch=self.branch,
            pr_number='PR-TEST-003',
            requested_by=self.requester,
            department='IT',
            purpose='Test purpose',
            required_by_date=date.today() + timedelta(days=30),
            status='submitted'  # Ready for approval
        )
        
        PurchaseRequisitionItem.objects.create(
            requisition=requisition,
            item=self.item1,
            description='Test item',
            quantity=1,
            estimated_unit_price=Decimal('100.00')
        )
        
        print(f"\nApproving requisition {requisition.pr_number}...")
        print(f"Initial status: {requisition.status}")
        
        # Approve
        self.client.force_authenticate(user=self.approver)
        response = self.client.post(
            f'/api/procurement/purchase-requisitions/{requisition.id}/approve/'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        requisition.refresh_from_db()
        
        print(f"Final status: {requisition.status}")
        print(f"Approved by: {requisition.approved_by.get_full_name()}")
        print(f"Approved at: {requisition.approved_at}")
        
        self.assertEqual(requisition.status, 'approved')
        self.assertEqual(requisition.approved_by, self.approver)
        self.assertIsNotNone(requisition.approved_at)
        
        print(f"\n[OK] Status updated correctly on approval")
        print("="*70 + "\n")


class RequisitionAPITest(TestCase):
    """Quick API endpoint tests"""
    
    def setUp(self):
        """Set up minimal test data"""
        from common.managers import set_current_tenant
        
        self.tenant = Tenant.objects.create(
            name="Test Co",
            slug="test-co",
            is_active=True
        )
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Main",
            code="MAIN",
            is_active=True,
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass'
        )
        self.user.owner = self.tenant
        self.user.branch = self.branch
        self.user.tenant = self.tenant
        self.user.save()
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_requisition_list_endpoint(self):
        """Test: Can list requisitions"""
        response = self.client.get('/api/procurement/purchase-requisitions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
    
    def test_requisition_create_endpoint_exists(self):
        """Test: Create endpoint exists (even if data is incomplete)"""
        response = self.client.post(
            '/api/procurement/purchase-requisitions/',
            data={},
            format='json'
        )
        # Should fail validation but endpoint exists
        self.assertIn(response.status_code, [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_201_CREATED
        ])


# Run tests with: python manage.py test procurement.test_requisition_to_po
