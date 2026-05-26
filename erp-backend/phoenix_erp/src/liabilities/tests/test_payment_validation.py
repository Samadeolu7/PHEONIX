# liabilities/tests/test_payment_validation.py
"""
Tests for vendor payment validation with PO reference and 3-way matching
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError

from liabilities.models import AccountsPayable
from procurement.models import Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceivedNote, GoodsReceivedNoteItem
from procurement.config_models import ProcurementConfig
from inventory.models import InventoryItem, Location, InventoryCategory
from branches.models import Branch
from users.models import User
from accounts.models import Account, AccountCategory
from accounts.utils.account_creation import get_or_create_system_account


@pytest.mark.django_db
class TestPaymentValidation(TestCase):
    """Test vendor payment validation with PO and 3-way matching"""
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test School', slug='testschool')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001",
            tenant=self.tenant
        )
        
        # Create users
        self.finance_officer = User.objects.create_user(
            username="finance",
            email="finance@test.com",
            password="test123",
            tenant=self.tenant
        )
        self.finance_officer.branch = self.branch
        self.finance_officer.save()
        
        # Create chart of accounts
        self.liability_account = get_or_create_system_account(
            code='200',
            name='Accounts Payable',
            account_type='LIABILITY',
            owner=self.finance_officer,
            branch=self.branch
        )
        
        self.inventory_account = get_or_create_system_account(
            code='140',
            name='Inventory',
            account_type='ASSET',
            owner=self.finance_officer,
            branch=self.branch
        )        
        self.cogs_account = get_or_create_system_account(
            code='500',
            name='Cost of Goods Sold',
            account_type='EXPENSE',
            owner=self.finance_officer,
            branch=self.branch
        )
        
        self.sales_account = get_or_create_system_account(
            code='400',
            name='Sales Revenue',
            account_type='INCOME',
            owner=self.finance_officer,
            branch=self.branch
        )        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name="Office Supplies Inc",
            email="supplier@office.com",
            phone="555-1234",
            contact_person="John Supplier",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Create inventory item
        category = InventoryCategory.objects.create(
            name="Office Supplies",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant,
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            code="OFF-SUPP"
        )
        
        self.item = InventoryItem.objects.create(
            name="Printer Paper",
            sku="PP-001",
            category=category,
            unit_of_measure="ream",
            cost_price=Decimal('45.00'),
            selling_price=Decimal('50.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Create location
        self.location = Location.objects.create(
            name="Main Warehouse",
            location_type="warehouse",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Create procurement config
        self.config = ProcurementConfig.objects.create(
            branch=self.branch,
            owner=self.finance_officer,
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00'),
            tenant=self.tenant
        )
    
    def test_payment_requires_posted_by(self):
        """Test that payment requires posted_by for accountability"""
        # Create payable without PO
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-001",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Try to make payment without posted_by
        with self.assertRaises(ValidationError) as context:
            payable.make_payment(
                amount=Decimal('1000.00'),
                notes="Test payment"
            )
        
        self.assertIn("posted by an authorized user", str(context.exception))
    
    def test_payment_without_po_logs_warning(self):
        """Test that payment without PO reference logs warning but allows payment"""
        import logging
        
        # Create payable without PO
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-002",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('500.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Make payment - should succeed with warning
        with self.assertLogs(level=logging.WARNING) as logs:
            remaining = payable.make_payment(
                amount=Decimal('500.00'),
                posted_by=self.finance_officer,
                notes="Utility bill payment"
            )
        
        # Check warning was logged
        self.assertTrue(any('WITHOUT Purchase Order' in log for log in logs.output))
        self.assertEqual(remaining, Decimal('0.00'))
        self.assertEqual(payable.posted_by, self.finance_officer)
        self.assertIsNotNone(payable.posted_at)
    
    def test_payment_with_failed_three_way_match_blocks_payment(self):
        """Test that failed 3-way match blocks payment"""
        # Create PO
        po = PurchaseOrder.objects.create(
            po_number="PO-001",
            supplier=self.supplier,
            order_date=timezone.now().date(),
            expected_delivery_date=timezone.now().date() + timezone.timedelta(days=7),
            delivery_location=self.location,
            status='approved',
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            item=self.item,
            quantity=Decimal('100'),
            unit_price=Decimal('50.00'),
            total_price=Decimal('5000.00'),
            tenant=self.tenant
        )
        
        # Create GRN with DIFFERENT quantity (to trigger failure)
        location = Location.objects.create(
            name="Main Warehouse",
            location_type="warehouse",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        grn = GoodsReceivedNote.objects.create(
            grn_number="GRN-FAIL-001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=timezone.now().date(),
            received_location=location,
            received_by=self.finance_officer,
            quality_status='passed',
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        GoodsReceivedNoteItem.objects.create(
            grn=grn,
            item=self.item,
            quantity_received=Decimal('50'),  # Only 50% received
            quantity_ordered=Decimal('100'),
            unit_cost=Decimal('50.00'),
            total_cost=Decimal('2500.00'),
            tenant=self.tenant
        )
        
        # Create payable with HIGHER amount than GRN (invoice fraud scenario)
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-FRAUD",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('5000.00'),  # Billing for 100 but only 50 received
            purchase_order=po,
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Validate 3-way match
        result = payable.validate_three_way_match(user=self.finance_officer)
        
        # Should fail due to major discrepancy
        self.assertEqual(payable.three_way_match_status, 'failed')
        
        # Try to make payment - should be BLOCKED
        with self.assertRaises(ValidationError) as context:
            payable.make_payment(
                amount=Decimal('5000.00'),
                posted_by=self.finance_officer,
                notes="Attempt to pay fraudulent invoice"
            )
        
        self.assertIn("3-way matching validation FAILED", str(context.exception))
    
    def test_payment_with_passed_three_way_match_succeeds(self):
        """Test that passed 3-way match allows payment"""
        # Create PO
        po = PurchaseOrder.objects.create(
            po_number="PO-002",
            supplier=self.supplier,
            order_date=timezone.now().date(),
            expected_delivery_date=timezone.now().date() + timezone.timedelta(days=7),
            delivery_location=self.location,
            status='approved',
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            item=self.item,
            quantity=Decimal('100'),
            unit_price=Decimal('50.00'),
            total_price=Decimal('5000.00'),
            tenant=self.tenant
        )
        
        # Create GRN with MATCHING quantity
        location = Location.objects.create(
            name="Main Warehouse",
            location_type="warehouse",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        grn = GoodsReceivedNote.objects.create(
            grn_number="GRN-PASS-001",
            purchase_order=po,
            supplier=self.supplier,
            received_date=timezone.now().date(),
            received_location=location,
            received_by=self.finance_officer,
            quality_status='passed',
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        GoodsReceivedNoteItem.objects.create(
            grn=grn,
            item=self.item,
            quantity_received=Decimal('100'),  # Perfect match
            quantity_ordered=Decimal('100'),
            unit_cost=Decimal('50.00'),
            total_cost=Decimal('5000.00'),
            tenant=self.tenant
        )
        
        # Create payable with MATCHING amount
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-GOOD",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('5000.00'),
            purchase_order=po,
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Validate 3-way match
        result = payable.validate_three_way_match(user=self.finance_officer)
        
        # Should pass
        self.assertEqual(payable.three_way_match_status, 'passed')
        
        # Make payment - should SUCCEED
        remaining = payable.make_payment(
            amount=Decimal('5000.00'),
            posted_by=self.finance_officer,
            notes="Payment for verified invoice"
        )
        
        self.assertEqual(remaining, Decimal('0.00'))
        self.assertEqual(payable.status, 'paid')
        self.assertEqual(payable.posted_by, self.finance_officer)
        self.assertIsNotNone(payable.posted_at)
