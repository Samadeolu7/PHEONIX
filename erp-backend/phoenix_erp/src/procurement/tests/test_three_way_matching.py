# procurement/tests/test_three_way_matching.py
"""
Comprehensive tests for ThreeWayMatchingService
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import date, timedelta

from procurement.models import (
    Supplier, PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote, GoodsReceivedNoteItem
)
from procurement.services.three_way_matching import (
    ThreeWayMatchingService,
    MatchingResult,
    MatchingReportGenerator
)
from procurement.config_models import ProcurementConfig
from inventory.models import InventoryItem, Location, InventoryCategory
from branches.models import Branch
from users.models import User
from accounts.models import Account, AccountCategory
from accounts.utils.account_creation import get_or_create_system_account, get_or_create_child_account


@pytest.mark.django_db
class TestThreeWayMatchingService(TestCase):
    """Test cases for 3-way matching service"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org Match', slug='testorgmatch')
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
        
        # Create procurement config
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
        asset_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="AST",
            defaults={
                'section': 1,
                'name': "Assets"
            }
        )
        expense_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="EXP",
            defaults={
                'section': 5,
                'name': "Expenses"
            }
        )
        income_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="INC",
            defaults={
                'section': 4,
                'name': "Income"
            }
        )
        
        # Create parent GL accounts first
        inventory_parent = get_or_create_system_account(
            code="120",
            name="Inventory - Parent",
            account_type="ASSET",
            owner=self.user,
            branch=self.branch,
            account_level=Account.LEVEL_PARENT
        )
        cogs_parent = get_or_create_system_account(
            code="500",
            name="COGS - Parent",
            account_type="EXPENSE",
            owner=self.user,
            branch=self.branch,
            account_level=Account.LEVEL_PARENT
        )
        sales_parent = get_or_create_system_account(
            code="400",
            name="Sales - Parent",
            account_type="INCOME",
            owner=self.user,
            branch=self.branch,
            account_level=Account.LEVEL_PARENT
        )
        
        # Create child accounts
        self.inventory_account = get_or_create_child_account(
            parent_code="120",
            child_suffix="001",
            name="Inventory",
            account_type="ASSET",
            owner=self.user,
            branch=self.branch,
            parent_name="Inventory - Parent"
        )
        self.cogs_account = get_or_create_child_account(
            parent_code="500",
            child_suffix="001",
            name="Cost of Goods Sold",
            account_type="EXPENSE",
            owner=self.user,
            branch=self.branch,
            parent_name="COGS - Parent"
        )
        self.sales_account = get_or_create_child_account(
            parent_code="400",
            child_suffix="001",
            name="Sales Revenue",
            account_type="INCOME",
            owner=self.user,
            branch=self.branch,
            parent_name="Sales - Parent"
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test Category",
            code="CAT001",
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account
        )
        
        # Create inventory items
        self.item1 = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM001",
            name="Test Item 1",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            minimum_selling_price=Decimal('12.00')
        )
        
        self.item2 = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM002",
            name="Test Item 2",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('20.00'),
            selling_price=Decimal('30.00'),
            minimum_selling_price=Decimal('25.00')
        )
        
        # Create service instance
        self.service = ThreeWayMatchingService(self.config)
    
    def create_purchase_order(self, total_amount=Decimal('1000.00')):
        """Helper to create a test PO"""
        po = PurchaseOrder.objects.create(
            branch=self.branch,
            owner=self.user,
            po_number="PO001",
            supplier=self.supplier,
            order_date=date.today(),
            delivery_location=self.location,
            status='approved',
            subtotal=total_amount,
            total_amount=total_amount
        )
        
        # Add items
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            item=self.item1,
            description="Item 1",
            quantity=Decimal('10.00'),
            unit_price=Decimal('50.00'),
            total_price=Decimal('500.00')
        )
        
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            item=self.item2,
            description="Item 2",
            quantity=Decimal('20.00'),
            unit_price=Decimal('25.00'),
            total_price=Decimal('500.00')
        )
        
        return po
    
    def create_grn(self, po, quantity_variance=Decimal('0')):
        """Helper to create a test GRN"""
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=date.today(),
            received_location=self.location,
            received_by=self.user,
            quality_status='passed'
        )
        
        # Add items matching PO with optional variance
        for po_item in po.items.all():
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
        return grn
    
    # ========== PERFECT MATCH TESTS ==========
    
    def test_perfect_match_po_grn(self):
        """Test perfect match between PO and GRN"""
        po = self.create_purchase_order()
        grn = self.create_grn(po)
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'passed'
        assert result['can_proceed'] is True
        assert result['requires_approval'] is False
        assert result['matching_results']['supplier_match']['status'] == 'match'
        assert result['matching_results']['items_match']['status'] == 'match'
        assert result['matching_results']['quantities_match']['status'] == 'match'
        assert result['matching_results']['totals_match']['status'] == 'match'
        assert len(result['discrepancies']) == 0
    
    def test_perfect_match_po_grn_invoice(self):
        """Test perfect 3-way match"""
        po = self.create_purchase_order(Decimal('1000.00'))
        grn = self.create_grn(po)
        
        result = self.service.match_po_grn_invoice(
            po, grn,
            invoice_amount=Decimal('1000.00'),
            invoice_items=[]
        )
        
        assert result['overall_status'] == 'passed'
        assert result['can_proceed'] is True
        assert result['requires_approval'] is False
        assert result['matching_results']['invoice_match']['status'] == 'match'
    
    # ========== TOLERANCE TESTS ==========
    
    def test_within_tolerance_quantity_variance(self):
        """Test variance within tolerance (5%)"""
        po = self.create_purchase_order()
        # Create GRN with 2% quantity increase (within 5% tolerance)
        grn = self.create_grn(po, quantity_variance=Decimal('0.20'))  # 2% of 10
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'warning'
        assert result['can_proceed'] is True
        assert result['requires_approval'] is False  # Auto-approve within tolerance
        assert len(result['discrepancies']) > 0
        assert result['discrepancies'][0]['severity'] == 'minor'
    
    def test_exceed_tolerance_quantity_variance(self):
        """Test variance exceeding tolerance (>5%)"""
        po = self.create_purchase_order()
        # Create GRN with 10% quantity increase (exceeds 5% tolerance)
        grn = self.create_grn(po, quantity_variance=Decimal('1.00'))  # 10% of 10
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert result['can_proceed'] is False
        assert result['requires_approval'] is True
        assert any(d['severity'] == 'major' for d in result['discrepancies'])
    
    def test_invoice_within_tolerance(self):
        """Test invoice amount within tolerance"""
        po = self.create_purchase_order(Decimal('1000.00'))
        grn = self.create_grn(po)
        
        # Invoice is 3% higher (within 5% tolerance)
        result = self.service.match_po_grn_invoice(
            po, grn,
            invoice_amount=Decimal('1030.00'),
            invoice_items=[]
        )
        
        assert result['overall_status'] == 'warning'
        assert result['can_proceed'] is True
        assert result['requires_approval'] is False  # Auto-approve
    
    def test_invoice_exceed_tolerance(self):
        """Test invoice amount exceeding tolerance"""
        po = self.create_purchase_order(Decimal('1000.00'))
        grn = self.create_grn(po)
        
        # Invoice is 10% higher (exceeds 5% tolerance)
        result = self.service.match_po_grn_invoice(
            po, grn,
            invoice_amount=Decimal('1100.00'),
            invoice_items=[]
        )
        
        assert result['overall_status'] == 'failed'
        assert result['can_proceed'] is False
        assert result['requires_approval'] is True
    
    # ========== MISMATCH TESTS ==========
    
    def test_supplier_mismatch(self):
        """Test supplier mismatch between PO and GRN"""
        po = self.create_purchase_order()
        
        # Create GRN with different supplier
        different_supplier = Supplier.objects.create(
            branch=self.branch,
            owner=self.user,
            supplier_code="SUP002",
            name="Different Supplier",
            email="different@example.com"
        )
        
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=different_supplier,  # Different supplier!
            received_date=date.today(),
            received_location=self.location,
            received_by=self.user
        )
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert result['can_proceed'] is False
        assert result['matching_results']['supplier_match']['status'] == 'mismatch'
        assert any(d['type'] == 'supplier' for d in result['discrepancies'])
        assert any(d['severity'] == 'critical' for d in result['discrepancies'])
    
    def test_missing_items_in_grn(self):
        """Test items ordered but not received"""
        po = self.create_purchase_order()
        
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=date.today(),
            received_location=self.location,
            received_by=self.user
        )
        
        # Only add one item (missing the second)
        po_item = po.items.first()
        GoodsReceivedNoteItem.objects.create(
            grn=grn,
            item=po_item.item,
            po_item=po_item,
            quantity_ordered=po_item.quantity,
            quantity_received=po_item.quantity,
            quantity_accepted=po_item.quantity,
            unit_cost=po_item.unit_price,
            total_cost=po_item.total_price
        )
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert result['matching_results']['items_match']['status'] == 'partial_match'
        assert any('missing' in d['description'].lower() for d in result['discrepancies'])
    
    def test_extra_items_in_grn(self):
        """Test items received but not ordered"""
        po = self.create_purchase_order()
        grn = self.create_grn(po)
        
        # Add an extra item not in PO
        extra_item = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM999",
            name="Extra Item",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('100.00'),
            selling_price=Decimal('150.00'),
            minimum_selling_price=Decimal('120.00')
        )
        
        GoodsReceivedNoteItem.objects.create(
            grn=grn,
            item=extra_item,
            quantity_ordered=Decimal('0'),
            quantity_received=Decimal('5.00'),
            quantity_accepted=Decimal('5.00'),
            unit_cost=Decimal('100.00'),
            total_cost=Decimal('500.00')
        )
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'warning'
        assert any('extra' in d['description'].lower() or 'unexpected' in d['description'].lower() 
                  for d in result['discrepancies'])
    
    def test_zero_quantity_received(self):
        """Test item with zero quantity received"""
        po = self.create_purchase_order()
        
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=date.today(),
            received_location=self.location,
            received_by=self.user
        )
        
        # Add items with zero quantity
        for po_item in po.items.all():
            GoodsReceivedNoteItem.objects.create(
                grn=grn,
                item=po_item.item,
                po_item=po_item,
                quantity_ordered=po_item.quantity,
                quantity_received=Decimal('0'),  # Nothing received!
                quantity_accepted=Decimal('0'),
                unit_cost=po_item.unit_price,
                total_cost=Decimal('0')
            )
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert result['can_proceed'] is False
    
    # ========== PRICE VARIANCE TESTS ==========
    
    def test_price_variance_in_grn(self):
        """Test unit price difference between PO and GRN"""
        po = self.create_purchase_order()
        
        grn = GoodsReceivedNote.objects.create(
            branch=self.branch,
            owner=self.user,
            grn_number="GRN001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=date.today(),
            received_location=self.location,
            received_by=self.user
        )
        
        # Add items with different unit cost
        for po_item in po.items.all():
            GoodsReceivedNoteItem.objects.create(
                grn=grn,
                item=po_item.item,
                po_item=po_item,
                quantity_ordered=po_item.quantity,
                quantity_received=po_item.quantity,
                quantity_accepted=po_item.quantity,
                unit_cost=po_item.unit_price * Decimal('1.10'),  # 10% higher
                total_cost=po_item.quantity * po_item.unit_price * Decimal('1.10')
            )
        
        grn.calculate_total()
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert any(d['type'] == 'price' for d in result['discrepancies'])
    
    # ========== REPORT GENERATION TESTS ==========
    
    def test_report_generation(self):
        """Test matching report generation"""
        po = self.create_purchase_order()
        grn = self.create_grn(po, quantity_variance=Decimal('1.00'))
        
        result = self.service.match_po_grn(po, grn)
        report = MatchingReportGenerator.generate_report(result)
        
        assert isinstance(report, str)
        assert len(report) > 0
        assert 'PO vs GRN Matching Report' in report or '3-Way Matching Report' in report
        assert result['overall_status'].upper() in report
    
    # ========== CONFIG TESTS ==========
    
    def test_disable_three_way_matching(self):
        """Test behavior when 3-way matching is disabled"""
        self.config.enable_three_way_matching = False
        self.config.save()
        
        po = self.create_purchase_order()
        grn = self.create_grn(po, quantity_variance=Decimal('5.00'))  # Large variance
        
        # Service should still work but maybe with different thresholds
        result = self.service.match_po_grn(po, grn)
        assert result is not None
    
    def test_custom_tolerance(self):
        """Test custom tolerance percentage"""
        # Set tolerance to 10%
        self.config.matching_tolerance_percentage = Decimal('10.00')
        self.config.save()
        
        service = ThreeWayMatchingService(self.config)
        
        po = self.create_purchase_order()
        # 8% variance (should be within 10% tolerance)
        grn = self.create_grn(po, quantity_variance=Decimal('0.80'))
        
        result = service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'warning'
        assert result['can_proceed'] is True
    
    def test_auto_approve_disabled(self):
        """Test when auto-approve is disabled"""
        self.config.auto_approve_within_tolerance = False
        self.config.save()
        
        service = ThreeWayMatchingService(self.config)
        
        po = self.create_purchase_order()
        # Small variance within tolerance
        grn = self.create_grn(po, quantity_variance=Decimal('0.20'))
        
        result = service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'warning'
        assert result['requires_approval'] is True  # Should require approval even within tolerance
    
    # ========== EDGE CASES ==========
    
    def test_null_po(self):
        """Test handling of null PO"""
        with pytest.raises((ValueError, AttributeError)):
            self.service.match_po_grn(None, None)
    
    def test_negative_quantities(self):
        """Test handling of negative quantities"""
        po = self.create_purchase_order()
        grn = self.create_grn(po, quantity_variance=Decimal('-15.00'))  # Negative!
        
        result = self.service.match_po_grn(po, grn)
        
        assert result['overall_status'] == 'failed'
        assert result['can_proceed'] is False
    
    def test_very_large_numbers(self):
        """Test handling of very large numbers"""
        po = self.create_purchase_order(Decimal('999999999.99'))
        grn = self.create_grn(po)
        
        result = self.service.match_po_grn(po, grn)
        
        assert result is not None
        assert 'overall_status' in result


@pytest.mark.django_db
class TestMatchingReportGenerator(TestCase):
    """Test matching report generator"""
    
    def test_passed_report(self):
        """Test report for passed match"""
        result = {
            'overall_status': 'passed',
            'can_proceed': True,
            'requires_approval': False,
            'matching_results': {
                'supplier_match': {'status': 'match', 'message': 'Suppliers match'},
                'items_match': {'status': 'match', 'message': 'All items match'},
                'quantities_match': {'status': 'match', 'message': 'Quantities match'},
                'totals_match': {'status': 'match', 'message': 'Totals match'},
            },
            'discrepancies': []
        }
        
        report = MatchingReportGenerator.generate_report(result)
        
        assert 'PASSED' in report or 'passed' in report
        assert 'Suppliers match' in report
    
    def test_failed_report_with_discrepancies(self):
        """Test report for failed match with discrepancies"""
        result = {
            'overall_status': 'failed',
            'can_proceed': False,
            'requires_approval': True,
            'matching_results': {
                'supplier_match': {'status': 'match', 'message': 'OK'},
                'items_match': {'status': 'mismatch', 'message': 'Missing items'},
                'quantities_match': {'status': 'mismatch', 'message': 'Quantity variance'},
                'totals_match': {'status': 'mismatch', 'message': 'Total mismatch'},
            },
            'discrepancies': [
                {
                    'type': 'quantity',
                    'severity': 'major',
                    'description': 'Large quantity variance',
                    'po_value': '100',
                    'grn_value': '80',
                    'variance': 20,
                    'variance_percentage': 20.0
                }
            ]
        }
        
        report = MatchingReportGenerator.generate_report(result)
        
        assert 'FAILED' in report or 'failed' in report
        assert 'quantity' in report.lower()
        assert '20' in report  # Variance
