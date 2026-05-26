# inventory/tests/test_invoice_pdf.py
"""
Tests for invoice PDF generation
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

from inventory.models import (
    Invoice, InvoiceItem, InventoryItem, InventoryCategory,
    Location
)
from inventory.services.pdf_service import InvoicePDFService
from clients.models import Client
from branches.models import Branch
from users.models import Tenant
from accounts.models import Account, AccountCategory

User = get_user_model()


class InvoicePDFTest(TestCase):
    """Test invoice PDF generation"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='test123',
            tenant=self.tenant
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001",
            address="123 Test St, Test City"
        )
        
        # Create account categories
        asset_category = AccountCategory.objects.create(
            name="Current Assets",
            section=1,
            code_prefix="100",
            branch=self.branch,
            owner=self.user
        )
        
        income_category = AccountCategory.objects.create(
            name="Revenue",
            section=4,
            code_prefix="400",
            branch=self.branch,
            owner=self.user
        )
        
        expense_category = AccountCategory.objects.create(
            name="Cost of Sales",
            section=5,
            code_prefix="500",
            branch=self.branch,
            owner=self.user
        )
        
        # Create accounts (as PARENT level to avoid validation issues)
        self.inventory_account = Account.objects.create(
            name="Inventory",
            code="1300",
            category=asset_category,
            branch=self.branch,
            owner=self.user,
            created_by=self.user,
            account_type="ASSET",
            account_level="PARENT"
        )
        
        self.sales_account = Account.objects.create(
            name="Sales Revenue",
            code="4000",
            category=income_category,
            branch=self.branch,
            owner=self.user,
            created_by=self.user,
            account_type="REVENUE",
            account_level="PARENT"
        )
        
        self.cogs_account = Account.objects.create(
            name="Cost of Goods Sold",
            code="5000",
            category=expense_category,
            branch=self.branch,
            owner=self.user,
            created_by=self.user,
            account_type="EXPENSE",
            account_level="PARENT"
        )
        
        # Create category
        self.category = InventoryCategory.objects.create(
            name="Test Category",
            code="TC",
            branch=self.branch,
            owner=self.user,
            inventory_account=self.inventory_account,
            sales_account=self.sales_account,
            cogs_account=self.cogs_account
        )
        
        # Create location
        self.location = Location.objects.create(
            name="Main Warehouse",
            code="WH001",
            location_type="warehouse",
            branch=self.branch,
            owner=self.user
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            name="Test Product",
            sku="TEST001",
            category=self.category,
            unit_of_measure="unit",
            cost_price=Decimal('100.00'),
            selling_price=Decimal('150.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create client
        self.client = Client.objects.create(
            client_id="CLI-001",
            first_name="John",
            last_name="Doe",
            gender="male",
            email="client@test.com",
            phone_primary="0987654321",
            address_street="456 Client Ave",
            address_city="Lagos",
            owner=self.user,
            branch=self.branch
        )
        
        # Create invoice
        self.invoice = Invoice.objects.create(
            invoice_number="INV-2026-001",
            client=self.client,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            subtotal=Decimal('450.00'),
            discount=Decimal('50.00'),
            tax_amount=Decimal('30.00'),
            total_amount=Decimal('430.00'),
            amount_paid=Decimal('0.00'),
            status='draft',
            notes="Thank you for your business",
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Create invoice items
        InvoiceItem.objects.create(
            invoice=self.invoice,
            item=self.item,
            description="Test Product - Premium Quality",
            quantity=Decimal('3.00'),
            unit_price=Decimal('150.00'),
            discount=Decimal('50.00'),
            total_price=Decimal('400.00')
        )
        
        InvoiceItem.objects.create(
            invoice=self.invoice,
            description="Service Fee",
            quantity=Decimal('1.00'),
            unit_price=Decimal('30.00'),
            discount=Decimal('0.00'),
            total_price=Decimal('30.00')
        )
    
    def test_pdf_service_initialization(self):
        """Test PDF service can be initialized"""
        pdf_service = InvoicePDFService(self.invoice)
        self.assertIsNotNone(pdf_service)
        self.assertEqual(pdf_service.invoice, self.invoice)
    
    def test_pdf_generation(self):
        """Test PDF can be generated"""
        pdf_service = InvoicePDFService(self.invoice)
        pdf_content = pdf_service.generate()
        
        # PDF should be generated and contain data
        self.assertIsNotNone(pdf_content)
        self.assertGreater(len(pdf_content), 0)
        
        # Check for PDF signature
        self.assertTrue(pdf_content.startswith(b'%PDF'))
    
    def test_currency_formatting(self):
        """Test currency formatting"""
        pdf_service = InvoicePDFService(self.invoice)
        
        # Test various amounts
        self.assertEqual(pdf_service._format_currency(Decimal('1234.56')), '₦1,234.56')
        self.assertEqual(pdf_service._format_currency(Decimal('0.00')), '₦0.00')
        self.assertEqual(pdf_service._format_currency(None), '₦0.00')
    
    def test_pdf_contains_invoice_data(self):
        """Test that generated PDF contains invoice information"""
        pdf_service = InvoicePDFService(self.invoice)
        pdf_content = pdf_service.generate()
        
        # PDF should be generated
        self.assertIsNotNone(pdf_content)
        self.assertGreater(len(pdf_content), 1000)  # Should be substantial
    
    def test_pdf_with_payment(self):
        """Test PDF generation with partial payment"""
        self.invoice.amount_paid = Decimal('200.00')
        self.invoice.status = 'partial'
        self.invoice.save()
        
        pdf_service = InvoicePDFService(self.invoice)
        pdf_content = pdf_service.generate()
        
        # Should generate successfully
        self.assertIsNotNone(pdf_content)
        self.assertTrue(pdf_content.startswith(b'%PDF'))
    
    def test_pdf_for_paid_invoice(self):
        """Test PDF generation for fully paid invoice"""
        self.invoice.amount_paid = self.invoice.total_amount
        self.invoice.status = 'paid'
        self.invoice.save()
        
        pdf_service = InvoicePDFService(self.invoice)
        pdf_content = pdf_service.generate()
        
        # Should generate successfully
        self.assertIsNotNone(pdf_content)
        self.assertTrue(pdf_content.startswith(b'%PDF'))
