# procurement/tests/test_workflow_handlers.py
"""
Tests for procurement workflow step handlers
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import date

from procurement.models import (
    Supplier, PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote, GoodsReceivedNoteItem
)
from procurement.config_models import ProcurementConfig
from procurement.workflow_step_handlers import (
    ThreeWayMatchingStepHandler,
    GRNCreationStepHandler
)
from automations.models import WorkflowTemplate, WorkflowRun
from inventory.models import InventoryItem, Location, InventoryCategory
from branches.models import Branch
from users.models import User
from accounts.models import Account, AccountCategory
from accounts.utils.account_creation import get_or_create_system_account, get_or_create_child_account


@pytest.mark.django_db
class TestThreeWayMatchingStepHandler(TestCase):
    """Test 3-way matching step handler integration with workflow executor"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org WF', slug='testorgwf')
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
        inventory_account = get_or_create_child_account(
            parent_code="120",
            child_suffix="001",
            name="Inventory",
            account_type="ASSET",
            owner=self.user,
            branch=self.branch,
            parent_name="Inventory - Parent"
        )
        cogs_account = get_or_create_child_account(
            parent_code="500",
            child_suffix="001",
            name="Cost of Goods Sold",
            account_type="EXPENSE",
            owner=self.user,
            branch=self.branch,
            parent_name="COGS - Parent"
        )
        sales_account = get_or_create_child_account(
            parent_code="400",
            child_suffix="001",
            name="Sales Revenue",
            account_type="INCOME",
            owner=self.user,
            branch=self.branch,
            parent_name="Sales - Parent"
        )
        
        # Create category
        self.category = InventoryCategory.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test Category",
            code="CAT001",
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            sales_account=sales_account
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM001",
            name="Test Item",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            minimum_selling_price=Decimal('12.00')
        )
        
        # Create workflow template
        self.workflow_template = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test Invoice Matching Workflow",
            run_sequence="TEST_MATCH",
            workflow_definition={
                "steps": [
                    {
                        "id": "match_invoice",
                        "type": "three_way_matching",
                        "name": "Perform 3-Way Match",
                        "config": {
                            "po_id": "${context.po_id}",
                            "grn_id": "${context.grn_id}",
                            "invoice_amount": "${form.invoice_amount}"
                        },
                        "on_passed": "approve_payment",
                        "on_warning": "finance_review",
                        "on_failed": "escalate_to_manager"
                    }
                ]
            }
        )
        
        # Create step handler
        self.handler = ThreeWayMatchingStepHandler()
    
    def create_test_po_grn(self, quantity_variance=Decimal('0')):
        """Helper to create test PO and GRN"""
        # Create PO
        po = PurchaseOrder.objects.create(
            branch=self.branch,
            owner=self.user,
            po_number="PO001",
            supplier=self.supplier,
            order_date=date.today(),
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
            received_date=date.today(),
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
    
    # ========== HANDLER EXECUTION TESTS ==========
    
    def test_handler_perfect_match(self):
        """Test handler with perfect match"""
        po, grn = self.create_test_po_grn()
        
        # Create workflow run
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={
                'po_id': po.id,
                'grn_id': grn.id
            }
        )
        
        # Define step
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': po.id,
                'grn_id': grn.id,
                'invoice_amount': str(grn.total_amount)
            },
            'on_passed': 'approve_payment',
            'on_warning': 'finance_review',
            'on_failed': 'escalate_to_manager'
        }
        
        # Execute handler
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is True
        assert result['matching_result']['overall_status'] == 'passed'
        assert result['next_step'] == 'approve_payment'
        assert result['requires_approval'] is False
    
    def test_handler_variance_within_tolerance(self):
        """Test handler with variance within tolerance"""
        # 2% variance (within 5% tolerance)
        po, grn = self.create_test_po_grn(quantity_variance=Decimal('0.20'))
        
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={'po_id': po.id, 'grn_id': grn.id}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': po.id,
                'grn_id': grn.id,
                'invoice_amount': str(grn.total_amount)
            },
            'on_passed': 'approve_payment',
            'on_warning': 'finance_review',
            'on_failed': 'escalate_to_manager'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is True
        assert result['matching_result']['overall_status'] == 'warning'
        assert result['next_step'] == 'finance_review'
        # Auto-approve within tolerance
        assert result['requires_approval'] is False
    
    def test_handler_variance_exceeds_tolerance(self):
        """Test handler with variance exceeding tolerance"""
        # 15% variance (exceeds 5% tolerance)
        po, grn = self.create_test_po_grn(quantity_variance=Decimal('1.50'))
        
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={'po_id': po.id, 'grn_id': grn.id}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': po.id,
                'grn_id': grn.id,
                'invoice_amount': str(grn.total_amount)
            },
            'on_passed': 'approve_payment',
            'on_warning': 'finance_review',
            'on_failed': 'escalate_to_manager'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is True  # Handler executed successfully
        assert result['matching_result']['overall_status'] == 'failed'
        assert result['next_step'] == 'escalate_to_manager'
        assert result['requires_approval'] is True  # Requires manual approval
    
    def test_handler_critical_mismatch(self):
        """Test handler with critical mismatch (e.g., wrong supplier)"""
        po, grn = self.create_test_po_grn()
        
        # Change GRN supplier to create mismatch
        different_supplier = Supplier.objects.create(
            branch=self.branch,
            owner=self.user,
            supplier_code="SUP002",
            name="Wrong Supplier",
            email="wrong@example.com"
        )
        grn.supplier = different_supplier
        grn.save()
        
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={'po_id': po.id, 'grn_id': grn.id}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': po.id,
                'grn_id': grn.id,
                'invoice_amount': str(grn.total_amount)
            },
            'on_passed': 'approve_payment',
            'on_warning': 'finance_review',
            'on_failed': 'escalate_to_manager'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is True
        assert result['matching_result']['overall_status'] == 'failed'
        assert result['next_step'] == 'escalate_to_manager'
        assert result['requires_approval'] is True
        assert any(d['severity'] == 'critical' 
                  for d in result['matching_result']['discrepancies'])
    
    # ========== ERROR HANDLING TESTS ==========
    
    def test_handler_missing_po(self):
        """Test handler when PO not found"""
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': 99999,  # Non-existent PO
                'grn_id': 99999,
                'invoice_amount': '1000.00'
            },
            'on_failed': 'error_handler'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is False
        assert 'error' in result
        assert result['next_step'] == 'error_handler'
    
    def test_handler_missing_config(self):
        """Test handler with missing required config"""
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                # Missing required fields!
            },
            'on_failed': 'error_handler'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        assert result['success'] is False
        assert 'error' in result
    
    # ========== CONTEXT UPDATE TESTS ==========
    
    def test_handler_updates_context(self):
        """Test that handler updates workflow context with matching result"""
        po, grn = self.create_test_po_grn()
        
        workflow_run = WorkflowRun.objects.create(
            branch=self.branch,
            owner=self.user,
            template=self.workflow_template,
            status='running',
            context={'po_id': po.id, 'grn_id': grn.id}
        )
        
        step = {
            'id': 'match_invoice',
            'type': 'three_way_matching',
            'name': 'Perform 3-Way Match',
            'config': {
                'po_id': po.id,
                'grn_id': grn.id,
                'invoice_amount': str(grn.total_amount)
            },
            'on_passed': 'approve_payment'
        }
        
        result = self.handler.execute(step, workflow_run, workflow_run.context)
        
        # Check that matching result is stored in context
        assert 'matching_result' in result
        assert result['matching_result']['overall_status'] in ['passed', 'warning', 'failed']


@pytest.mark.django_db
class TestGRNCreationStepHandler(TestCase):
    """Test GRN creation step handler"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org GRN', slug='testorggrn')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch GRN",
            code="TB-GRN",
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
        
        self.supplier = Supplier.objects.create(
            branch=self.branch,
            owner=self.user,
            supplier_code="SUP001",
            name="Test Supplier",
            email="supplier@example.com"
        )
        
        self.location = Location.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Main Warehouse",
            code="WH001"
        )
        
        # Create GL account categories
        asset_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="AST2",
            defaults={
                'section': 1,
                'name': "Assets"
            }
        )
        expense_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="EXP2",
            defaults={
                'section': 5,
                'name': "Expenses"
            }
        )
        income_cat, _ = AccountCategory.objects.get_or_create(
            owner=self.user,
            branch=self.branch,
            code_prefix="INC2",
            defaults={
                'section': 4,
                'name': "Income"
            }
        )
        
        # Create parent GL accounts
        inventory_parent, _ = Account.objects.get_or_create(
            code="121",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'name': "Inventory - Parent",
                'account_type': "ASSET",
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        cogs_parent, _ = Account.objects.get_or_create(
            code="501",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                'name': "COGS - Parent",
                'account_type': "EXPENSE",
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        sales_parent, _ = Account.objects.get_or_create(
            code="401",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                'name': "Sales - Parent",
                'account_type': "INCOME",
                'account_level': Account.LEVEL_PARENT,
                'created_by': self.user
            }
        )
        
        # Create child accounts
        inventory_account, _ = Account.objects.get_or_create(
            code="121-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': asset_cat,
                'name': "Inventory",
                'account_type': "ASSET",
                'account_level': Account.LEVEL_CHILD,
                'parent': inventory_parent,
                'created_by': self.user
            }
        )
        cogs_account, _ = Account.objects.get_or_create(
            code="501-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': expense_cat,
                'name': "Cost of Goods Sold",
                'account_type': "EXPENSE",
                'account_level': Account.LEVEL_CHILD,
                'parent': cogs_parent,
                'created_by': self.user
            }
        )
        sales_account, _ = Account.objects.get_or_create(
            code="401-001",
            owner=self.user,
            branch=self.branch,
            defaults={
                'category': income_cat,
                'name': "Sales Revenue",
                'account_type': "INCOME",
                'account_level': Account.LEVEL_CHILD,
                'parent': sales_parent,
                'created_by': self.user
            }
        )
        
        self.category = InventoryCategory.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Test Category",
            code="CAT001",
            inventory_account=inventory_account,
            cogs_account=cogs_account,
            sales_account=sales_account
        )
        
        self.item = InventoryItem.objects.create(
            branch=self.branch,
            owner=self.user,
            sku="ITEM001",
            name="Test Item",
            category=self.category,
            unit_of_measure="pcs",
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            minimum_selling_price=Decimal('12.00')
        )
        
        self.handler = GRNCreationStepHandler()
    
    def test_grn_handler_placeholder(self):
        """Test that GRN handler is implemented (placeholder test)"""
        # This is a placeholder - full implementation would test actual GRN creation
        assert self.handler is not None
        assert hasattr(self.handler, 'execute')
        
        # Can add more tests once handler is fully implemented
        # For now, this ensures the handler structure is correct


@pytest.mark.django_db
class TestWorkflowIntegration(TestCase):
    """Integration tests for procurement workflows"""
    
    def setUp(self):
        """Create test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Org WFI', slug='testorgwfi')
        set_current_tenant(self.tenant)
        
        self.branch = Branch.objects.create(
            name="Test Branch WF",
            code="TB-WF",
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
        
        self.config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00'),
            auto_approve_within_tolerance=True,
            pr_prefix="PR",
            po_prefix="PO",
            grn_prefix="GRN"
        )
    
    def test_workflow_template_with_matching_step(self):
        """Test that workflow templates can include 3-way matching steps"""
        workflow = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Invoice Matching Workflow",
            run_sequence="INVOICE_MATCH",
            workflow_definition={
                "steps": [
                    {
                        "id": "perform_3way_match",
                        "type": "three_way_matching",
                        "name": "Perform 3-Way Match",
                        "config": {
                            "po_id": "${context.po_id}",
                            "grn_id": "${context.grn_id}",
                            "invoice_amount": "${form.invoice_amount}"
                        },
                        "on_passed": "auto_approve",
                        "on_warning": "finance_review",
                        "on_failed": "escalate"
                    },
                    {
                        "id": "auto_approve",
                        "type": "notification",
                        "name": "Notify Auto-Approved",
                        "config": {
                            "message": "Invoice auto-approved"
                        }
                    },
                    {
                        "id": "finance_review",
                        "type": "approval",
                        "name": "Finance Review",
                        "config": {
                            "approvers": {"type": "role", "roles": ["Finance Manager"]}
                        }
                    },
                    {
                        "id": "escalate",
                        "type": "approval",
                        "name": "CFO Approval",
                        "config": {
                            "approvers": {"type": "role", "roles": ["CFO"]}
                        }
                    }
                ]
            }
        )
        
        assert workflow is not None
        assert workflow.workflow_definition['steps'][0]['type'] == 'three_way_matching'
        
    def test_config_get_workflow_methods(self):
        """Test ProcurementConfig workflow getter methods"""
        # Create workflow templates
        pr_workflow = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Standard PR Workflow",
            run_sequence="PR_STANDARD",
            workflow_definition={"steps": []}
        )
        
        po_workflow = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="Standard PO Workflow",
            run_sequence="PO_STANDARD",
            workflow_definition={"steps": []}
        )
        
        high_value_workflow = WorkflowTemplate.objects.create(
            branch=self.branch,
            owner=self.user,
            name="High Value PO Workflow",
            run_sequence="PO_HIGH_VALUE",
            workflow_definition={"steps": []}
        )
        
        # Update config
        self.config.default_pr_workflow = pr_workflow
        self.config.default_po_workflow = po_workflow
        self.config.high_value_threshold = Decimal('10000.00')
        self.config.high_value_po_workflow = high_value_workflow
        self.config.save()
        
        # Test getters
        assert self.config.get_workflow_for_pr() == pr_workflow
        assert self.config.get_workflow_for_po(Decimal('5000.00')) == po_workflow  # Low value
        assert self.config.get_workflow_for_po(Decimal('15000.00')) == high_value_workflow  # High value

