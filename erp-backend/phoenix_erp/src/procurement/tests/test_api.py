# procurement/tests/test_api.py
"""
API tests for procurement endpoints
"""
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from procurement.models import (
    Supplier, PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote, GoodsReceivedNoteItem
)
from procurement.config_models import ProcurementConfig
from automations.models import WorkflowTemplate
from inventory.models import InventoryItem, Location, InventoryCategory
from branches.models import Branch
from users.models import User
from accounts.models import Account


class TestProcurementConfigAPI(TestCase):
    """Test procurement configuration API endpoints"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            tenant=self.tenant
        )
        self.user.branch = self.branch
        self.user.save()
        
        # Create client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create workflow template
        self.workflow = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test PR Workflow",
            run_sequence="PR_TEST",
            category="procurement",
            workflow_definition={"steps": []}
        )
    
    def test_list_configs(self):
        """Test listing procurement configs"""
        # Create config
        config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00')
        )
        
        url = reverse('procurement:procurement-config-list')
        response = self.client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['id'] == config.id
    
    def test_create_config(self):
        """Test creating procurement config"""
        url = reverse('procurement:procurement-config-list')
        data = {
            'enable_three_way_matching': True,
            'matching_tolerance_percentage': '5.00',
            'auto_approve_within_tolerance': True,
            'pr_prefix': 'PR',
            'po_prefix': 'PO',
            'grn_prefix': 'GRN',
            'default_pr_workflow': self.workflow.id
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['enable_three_way_matching'] is True
        assert response.data['matching_tolerance_percentage'] == '5.00'
        assert response.data['pr_prefix'] == 'PR'
    
    def test_retrieve_config(self):
        """Test retrieving single config"""
        config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00'),
            pr_prefix='TEST'
        )
        
        url = reverse('procurement:procurement-config-detail', args=[config.id])
        response = self.client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == config.id
        assert response.data['pr_prefix'] == 'TEST'
        assert 'next_pr_number' in response.data
    
    def test_update_config(self):
        """Test updating config"""
        config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            matching_tolerance_percentage=Decimal('5.00')
        )
        
        url = reverse('procurement:procurement-config-detail', args=[config.id])
        data = {
            'matching_tolerance_percentage': '10.00',
            'enable_three_way_matching': False
        }
        
        response = self.client.patch(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['matching_tolerance_percentage'] == '10.00'
        assert response.data['enable_three_way_matching'] is False
    
    def test_config_for_branch(self):
        """Test getting config for specific branch"""
        config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            pr_prefix='BRANCH'
        )
        
        url = reverse('procurement:procurement-config-for-branch')
        response = self.client.get(url, {'branch_id': self.branch.id})
        
        if response.status_code != status.HTTP_200_OK:
            print(f"Config for branch error: {response.status_code} - {response.data if hasattr(response, 'data') else response.content}")
        assert response.status_code == status.HTTP_200_OK
        assert response.data['pr_prefix'] == 'BRANCH'
    
    def test_available_workflows(self):
        """Test getting available workflows"""
        url = reverse('procurement:procurement-config-available-workflows')
        response = self.client.get(url, {'category': 'procurement'})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        assert any(w['id'] == self.workflow.id for w in response.data)
    
    def test_config_validation_tolerance(self):
        """Test tolerance percentage validation"""
        url = reverse('procurement:procurement-config-list')
        data = {
            'matching_tolerance_percentage': '150.00',  # Invalid!
            'enable_three_way_matching': True
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'matching_tolerance_percentage' in response.data
    
    def test_config_validation_high_value_threshold(self):
        """Test high value threshold validation"""
        url = reverse('procurement:procurement-config-list')
        data = {
            'high_value_threshold': '-1000.00',  # Invalid!
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'high_value_threshold' in response.data
    
    def test_workflow_details_in_response(self):
        """Test that workflow details are included"""
        config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            default_pr_workflow=self.workflow
        )
        
        url = reverse('procurement:procurement-config-detail', args=[config.id])
        response = self.client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['default_pr_workflow_details'] is not None
        assert response.data['default_pr_workflow_details']['name'] == self.workflow.name


class TestThreeWayMatchingAPI(TestCase):
    """Test 3-way matching API endpoints"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org 3Way', slug='testorg3way')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch 3Way",
            code="TB-3WAY",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            tenant=self.tenant
        )
        self.user.branch = self.branch
        self.user.save()
        
        # Create client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create config
        self.config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00'),
            auto_approve_within_tolerance=True
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            branch=self.branch,
            owner=self.user,
            supplier_code="SUP001",
            name="Test Supplier",
            email="supplier@example.com"
        )
        
        # Create location
        self.location = Location.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Main Warehouse",
            code="WH001"
        )
        
        # Create GL accounts for inventory category
        self.inventory_account = Account.objects.create(
            branch=self.branch,
            owner=self.user,
            code="140",
            name="Inventory Asset",
            account_type="ASSET",
            account_level="PARENT"
        )
        self.cogs_account = Account.objects.create(
            branch=self.branch,
            owner=self.user,
            code="500",
            name="Cost of Goods Sold",
            account_type="EXPENSE",
            account_level="PARENT"
        )
        self.sales_account = Account.objects.create(
            branch=self.branch,
            owner=self.user,
            code="400",
            name="Sales Revenue",
            account_type="INCOME",
            account_level="PARENT"
        )
        
        # Create category
        self.category = InventoryCategory.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test Category",
            code="CAT001",
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM001",
            name="Test Item",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('100.00'),
            selling_price=Decimal('150.00')
        )
    
    def create_test_po_grn(self, quantity_variance=Decimal('0')):
        """Helper to create test PO and GRN"""
        # Create PO
        po = PurchaseOrder.objects.create(
            branch=self.branch,
            owner=self.user,
            po_number="PO001",
            supplier=self.supplier,
            order_date='2026-01-01',
            delivery_location=self.location,
            status='approved',
            subtotal=Decimal('1000.00'),
            total_amount=Decimal('1000.00')
        )
        
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            item=self.item,
            description="Test Item",
            quantity=Decimal('10.00'),
            unit_price=Decimal('100.00'),
            total_price=Decimal('1000.00')
        )
        
        # Create GRN
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=self.supplier,
            received_date='2026-01-02',
            received_location=self.location,
            received_by=self.user,
            quality_status='passed'
        )
        
        po_item = po.items.first()
        GoodsReceivedNoteItem.objects.create(
            grn=grn,
            item=po_item.item,
            po_item=po_item,
            quantity_ordered=po_item.quantity,
            quantity_received=po_item.quantity + quantity_variance,
            quantity_accepted=po_item.quantity + quantity_variance,
            unit_cost=po_item.unit_price,
            total_cost=(po_item.quantity + quantity_variance) * po_item.unit_price
        )
        
        grn.calculate_total()
        
        return po, grn
    
    def test_match_perfect_match(self):
        """Test perfect match via API"""
        po, grn = self.create_test_po_grn()
        
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': po.id,
            'grn_id': grn.id,
            'invoice_amount': str(grn.total_amount)
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['overall_status'] == 'passed'
        assert response.data['can_proceed'] is True
        assert response.data['requires_approval'] is False
        assert 'report' in response.data
    
    def test_match_within_tolerance(self):
        """Test match with variance within tolerance"""
        # 2% variance
        po, grn = self.create_test_po_grn(quantity_variance=Decimal('0.20'))
        
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': po.id,
            'grn_id': grn.id,
            'invoice_amount': str(grn.total_amount)
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['overall_status'] == 'warning'
        assert response.data['can_proceed'] is True
        assert response.data['requires_approval'] is False  # Auto-approve
    
    def test_match_exceeds_tolerance(self):
        """Test match with variance exceeding tolerance"""
        # 15% variance
        po, grn = self.create_test_po_grn(quantity_variance=Decimal('1.50'))
        
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': po.id,
            'grn_id': grn.id,
            'invoice_amount': str(grn.total_amount)
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['overall_status'] == 'failed'
        assert response.data['can_proceed'] is False
        assert response.data['requires_approval'] is True
        assert len(response.data['discrepancies']) > 0
    
    def test_match_po_grn_endpoint(self):
        """Test 2-way matching endpoint"""
        po, grn = self.create_test_po_grn()
        
        url = reverse('procurement:three-way-matching-match-po-grn')
        data = {
            'po_id': po.id,
            'grn_id': grn.id
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['overall_status'] == 'passed'
        assert 'report' in response.data
    
    def test_match_missing_po(self):
        """Test matching with non-existent PO"""
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': 99999,
            'grn_id': 99999
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_match_missing_required_fields(self):
        """Test matching with missing required fields"""
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': 1
            # Missing grn_id
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'grn_id' in response.data
    
    def test_match_no_config(self):
        """Test matching when config doesn't exist"""
        # Delete config
        self.config.delete()
        
        po, grn = self.create_test_po_grn()
        
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': po.id,
            'grn_id': grn.id
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'config' in response.data['error'].lower()
    
    def test_match_response_structure(self):
        """Test that response has all required fields"""
        po, grn = self.create_test_po_grn()
        
        url = reverse('procurement:three-way-matching-match')
        data = {
            'po_id': po.id,
            'grn_id': grn.id
        }
        
        response = self.client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'overall_status' in response.data
        assert 'can_proceed' in response.data
        assert 'requires_approval' in response.data
        assert 'matching_results' in response.data
        assert 'discrepancies' in response.data
        assert 'report' in response.data
        
        # Check matching_results structure
        matching_results = response.data['matching_results']
        assert 'supplier_match' in matching_results
        assert 'items_match' in matching_results
        assert 'quantities_match' in matching_results
        assert 'totals_match' in matching_results


class TestProcurementConfigPermissions(TestCase):
    """Test permissions for procurement config API"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org Perms', slug='testorgperms')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch Config",
            code="TB-CFG",
            tenant=self.tenant
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            tenant=self.tenant
        )
        self.user.branch = self.branch
        self.user.save()
        
        self.client = APIClient()
    
    def test_unauthenticated_access(self):
        """Test that unauthenticated users cannot access"""
        url = reverse('procurement:procurement-config-list')
        response = self.client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_authenticated_access(self):
        """Test that authenticated users can access"""
        self.client.force_authenticate(user=self.user)
        url = reverse('procurement:procurement-config-list')
        response = self.client.get(url)
        
        assert response.status_code == status.HTTP_200_OK


class TestProcurementConfigFilters(TestCase):
    """Test filtering for procurement config API"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org Filters', slug='testorgfilters')
        set_current_tenant(self.tenant)
        
        self.branch1 = Branch.objects.create(
            name="Branch 1",
            code="B001",
            tenant=self.tenant
        )
        self.branch2 = Branch.objects.create(
            name="Branch 2",
            code="B002",
            tenant=self.tenant
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            tenant=self.tenant
        )
        self.user.branch = self.branch1
        self.user.save()
        
        self.config1 = ProcurementConfig.objects.create(
            branch=self.branch1,
            owner=self.user,
            enable_three_way_matching=True
        )
        
        self.config2 = ProcurementConfig.objects.create(
            branch=self.branch2,
            owner=self.user,
            enable_three_way_matching=False
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_filter_by_enable_three_way_matching(self):
        """Test filtering by enable_three_way_matching"""
        url = reverse('procurement:procurement-config-list')
        response = self.client.get(url, {'enable_three_way_matching': 'true'})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 1
        assert all(c['enable_three_way_matching'] for c in response.data['results'])
    
    def test_ordering(self):
        """Test ordering results"""
        url = reverse('procurement:procurement-config-list')
        response = self.client.get(url, {'ordering': '-created_at'})
        
        assert response.status_code == status.HTTP_200_OK
        # Most recent first
        if len(response.data['results']) > 1:
            assert response.data['results'][0]['created_at'] >= response.data['results'][1]['created_at']
