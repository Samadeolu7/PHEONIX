"""
Credit Note Tests

Comprehensive tests for credit note functionality including:
- Model validation
- Serialization
- API endpoints
- Accounting integration
- PDF generation
"""

from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from users.models import User, Tenant
from branches.models import Branch
from clients.models import Client
from accounts.models import Account, AccountCategory
from inventory.models import (
    InventoryCategory, InventoryItem, Location,
    Invoice, InvoiceItem
)
from inventory.models_credit_note import CreditNote, CreditNoteItem
from inventory.services.credit_note_accounting import CreditNoteAccountingService


class CreditNoteModelTest(TestCase):
    """Test credit note model"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001",
            address="123 Test St"
        )
        
        # Create user
        self.user = User.objects.create_user(
            username="testuser",
            email="test@test.com",
            password="password123",
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create accounts
        asset_category = AccountCategory.objects.create(
            name="Assets",
            section=1,  # Balance Sheet - Assets
            code_prefix="1",
            owner=self.user,
            branch=self.branch
        )
        
        revenue_category = AccountCategory.objects.create(
            name="Revenue",
            section=4,  # Income Statement - Revenue
            code_prefix="4",
            owner=self.user,
            branch=self.branch
        )
        
        self.ar_account = Account.objects.create(
            name="Accounts Receivable",
            code="1200",
            account_type="ASSET",
            account_level="PARENT",
            category=asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.sales_account = Account.objects.create(
            name="Sales Revenue",
            code="4000",
            account_type="REVENUE",
            account_level="PARENT",
            category=revenue_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create client
        self.client = Client.objects.create(
            client_id="CLI-001",
            first_name="John",
            last_name="Doe",
            gender="male",
            email="john@test.com",
            phone_primary="1234567890",
            owner=self.user,
            branch=self.branch
        )
        
        # Create inventory category
        self.inventory_category = InventoryCategory.objects.create(
            name="Test Category",
            code="TC",
            branch=self.branch,
            owner=self.user,
            inventory_account=self.ar_account,
            sales_account=self.sales_account,
            cogs_account=self.sales_account
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
            category=self.inventory_category,
            unit_of_measure="unit",
            cost_price=Decimal('100.00'),
            selling_price=Decimal('150.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create invoice
        self.invoice = Invoice.objects.create(
            invoice_number="INV-001",
            client=self.client,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            subtotal=Decimal('450.00'),
            discount=Decimal('50.00'),
            tax_amount=Decimal('30.00'),
            total_amount=Decimal('430.00'),
            amount_paid=Decimal('0.00'),
            status='draft',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Create invoice items
        self.invoice_item = InvoiceItem.objects.create(
            invoice=self.invoice,
            item=self.item,
            description="Test Product",
            quantity=Decimal('3.00'),
            unit_price=Decimal('150.00'),
            discount=Decimal('50.00'),
            total_price=Decimal('400.00')
        )
    
    def test_create_credit_note(self):
        """Test creating credit note"""
        credit_note = CreditNote.objects.create(
            original_invoice=self.invoice,
            client=self.client,
            issue_date=timezone.now().date(),
            reason="Product defective",
            subtotal=Decimal('400.00'),
            discount=Decimal('0.00'),
            tax_amount=Decimal('30.00'),
            total_amount=Decimal('430.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        self.assertIsNotNone(credit_note.id)
        self.assertIsNotNone(credit_note.credit_note_number)
        self.assertTrue(credit_note.credit_note_number.startswith('CN-'))
        self.assertEqual(credit_note.status, 'draft')
        self.assertFalse(credit_note.applied_to_account)
    
    def test_credit_note_number_generation(self):
        """Test automatic credit note number generation"""
        cn1 = CreditNote.objects.create(
            original_invoice=self.invoice,
            client=self.client,
            issue_date=timezone.now().date(),
            reason="Test 1",
            subtotal=Decimal('100.00'),
            total_amount=Decimal('100.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        cn2 = CreditNote.objects.create(
            original_invoice=self.invoice,
            client=self.client,
            issue_date=timezone.now().date(),
            reason="Test 2",
            subtotal=Decimal('100.00'),
            total_amount=Decimal('100.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        self.assertNotEqual(cn1.credit_note_number, cn2.credit_note_number)
        # Should increment
        num1 = int(cn1.credit_note_number.split('-')[-1])
        num2 = int(cn2.credit_note_number.split('-')[-1])
        self.assertEqual(num2, num1 + 1)
    
    def test_credit_note_validation(self):
        """Test credit note validation"""
        # Cannot exceed invoice amount
        with self.assertRaises(ValidationError):
            cn = CreditNote(
                original_invoice=self.invoice,
                client=self.client,
                issue_date=timezone.now().date(),
                reason="Test",
                subtotal=Decimal('500.00'),
                total_amount=Decimal('500.00'),  # Exceeds invoice total
                branch=self.branch,
                owner=self.user
            )
            cn.full_clean()
    
    def test_credit_note_item(self):
        """Test credit note item creation"""
        credit_note = CreditNote.objects.create(
            original_invoice=self.invoice,
            client=self.client,
            issue_date=timezone.now().date(),
            reason="Return",
            subtotal=Decimal('150.00'),
            total_amount=Decimal('150.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        item = CreditNoteItem.objects.create(
            credit_note=credit_note,
            original_invoice_item=self.invoice_item,
            item=self.item,
            description="Test Product Return",
            quantity_returned=Decimal('1.00'),
            original_quantity=Decimal('3.00'),
            unit_price=Decimal('150.00'),
            line_total=Decimal('150.00'),
            return_reason="defective"
        )
        
        self.assertEqual(item.credit_note, credit_note)
        self.assertEqual(item.quantity_returned, Decimal('1.00'))
    
    def test_credit_note_properties(self):
        """Test credit note computed properties"""
        credit_note = CreditNote.objects.create(
            original_invoice=self.invoice,
            client=self.client,
            issue_date=timezone.now().date(),
            reason="Test",
            subtotal=Decimal('100.00'),
            total_amount=Decimal('100.00'),
            status='issued',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # can_be_applied
        self.assertTrue(credit_note.can_be_applied)
        
        # remaining_amount
        self.assertEqual(credit_note.remaining_amount, Decimal('100.00'))
        
        # Apply credit
        credit_note.applied_to_account = True
        credit_note.status = 'applied'
        credit_note.save()
        
        self.assertFalse(credit_note.can_be_applied)
        self.assertEqual(credit_note.remaining_amount, Decimal('0.00'))


class CreditNoteAccountingTest(TestCase):
    """Test credit note accounting service"""
    
    def setUp(self):
        """Set up test data"""
        # Same setup as CreditNoteModelTest
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(name="Main", code="MB", address="123 St")
        self.user = User.objects.create_user(
            username="test", email="test@test.com", password="pass",
            tenant=self.tenant, branch=self.branch
        )
        
        asset_cat = AccountCategory.objects.create(
            name="Assets", section=1, code_prefix="1",
            owner=self.user, branch=self.branch
        )
        rev_cat = AccountCategory.objects.create(
            name="Revenue", section=4, code_prefix="4",
            owner=self.user, branch=self.branch
        )
        
        self.ar_account = Account.objects.create(
            name="Accounts Receivable", code="1200",
            account_type="ASSET", account_level="PARENT",
            category=asset_cat, owner=self.user, branch=self.branch,
            created_by=self.user
        )
        self.sales_account = Account.objects.create(
            name="Sales", code="4000",
            account_type="REVENUE", account_level="PARENT",
            category=rev_cat, owner=self.user, branch=self.branch,
            created_by=self.user
        )
        
        self.client = Client.objects.create(
            client_id="CLI-001", first_name="John", last_name="Doe",
            gender="male", phone_primary="123",
            owner=self.user, branch=self.branch
        )
        
        self.invoice = Invoice.objects.create(
            invoice_number="INV-001", client=self.client,
            invoice_date=timezone.now().date(), due_date=timezone.now().date(),
            total_amount=Decimal('430.00'), branch=self.branch,
            owner=self.user, created_by=self.user
        )
        
        self.credit_note = CreditNote.objects.create(
            original_invoice=self.invoice, client=self.client,
            issue_date=timezone.now().date(), reason="Return",
            subtotal=Decimal('100.00'), total_amount=Decimal('100.00'),
            status='issued', branch=self.branch, owner=self.user,
            created_by=self.user
        )
    
    def test_apply_credit_to_account(self):
        """Test applying credit to customer account"""
        service = CreditNoteAccountingService(self.credit_note)
        journal_entry = service.apply_credit_to_account(
            applied_by=self.user,
            notes="Test application"
        )
        
        self.assertIsNotNone(journal_entry)
        # Transaction uses series and workflow_reference instead of entry_type
        self.assertEqual(journal_entry.workflow_reference, self.credit_note.credit_note_number)
        
        # Refresh credit note
        self.credit_note.refresh_from_db()
        self.assertTrue(self.credit_note.applied_to_account)
        self.assertEqual(self.credit_note.status, 'applied')
        self.assertIsNotNone(self.credit_note.applied_date)
    
    def test_reverse_credit(self):
        """Test reversing applied credit"""
        # First apply
        service = CreditNoteAccountingService(self.credit_note)
        service.apply_credit_to_account(applied_by=self.user)
        
        # Then reverse
        reversal_entry = service.reverse_credit(
            reversed_by=self.user,
            reversal_reason="Error in application"
        )
        
        self.assertIsNotNone(reversal_entry)
        # Transaction uses workflow_reference instead of entry_type
        self.assertTrue(reversal_entry.is_reversal)
        
        # Refresh credit note
        self.credit_note.refresh_from_db()
        self.assertTrue(self.credit_note.reversed)
        self.assertIsNotNone(self.credit_note.reversed_date)


class CreditNoteAPITest(TestCase):
    """Test credit note REST API"""
    
    def setUp(self):
        """Set up test data and API client"""
        self.client_api = APIClient()
        
        # Create test data (similar to above)
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(name="Main", code="MB", address="123 St")
        self.user = User.objects.create_user(
            username="test", email="test@test.com", password="pass",
            tenant=self.tenant, branch=self.branch
        )
        
        # Authenticate
        self.client_api.force_authenticate(user=self.user)
        
        # Create necessary accounts
        asset_cat = AccountCategory.objects.create(
            name="Assets", section=1, code_prefix="1",
            owner=self.user, branch=self.branch
        )
        Account.objects.create(
            name="Accounts Receivable", code="1200",
            account_type="ASSET", account_level="PARENT",
            category=asset_cat, owner=self.user, branch=self.branch,
            created_by=self.user
        )
        
        # Create client
        self.client_obj = Client.objects.create(
            client_id="CLI-001", first_name="John", last_name="Doe",
            gender="male", phone_primary="123",
            owner=self.user, branch=self.branch
        )
        
        # Create invoice
        self.invoice = Invoice.objects.create(
            invoice_number="INV-001", client=self.client_obj,
            invoice_date=timezone.now().date(), due_date=timezone.now().date(),
            total_amount=Decimal('430.00'), branch=self.branch,
            owner=self.user, created_by=self.user
        )
    
    def test_list_credit_notes(self):
        """Test listing credit notes"""
        response = self.client_api.get('/api/inventory/credit-notes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_create_credit_note(self):
        """Test creating credit note via API"""
        data = {
            'original_invoice': self.invoice.id,
            'client': self.client_obj.id,
            'issue_date': timezone.now().date().isoformat(),
            'reason': 'Product defective',
            'subtotal': '100.00',
            'total_amount': '100.00',
            'status': 'draft'
        }
        
        response = self.client_api.post('/api/inventory/credit-notes/', data)
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response data: {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('credit_note_number', response.data)
    
    def test_apply_credit_note(self):
        """Test applying credit note via API"""
        # Create credit note
        credit_note = CreditNote.objects.create(
            original_invoice=self.invoice, client=self.client_obj,
            issue_date=timezone.now().date(), reason="Return",
            subtotal=Decimal('100.00'), total_amount=Decimal('100.00'),
            status='issued', branch=self.branch, owner=self.user,
            created_by=self.user
        )
        
        response = self.client_api.post(
            f'/api/inventory/credit-notes/{credit_note.id}/apply/',
            {'notes': 'Applying credit'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        # Verify credit was applied
        credit_note.refresh_from_db()
        self.assertTrue(credit_note.applied_to_account)


class CreditNotePDFTest(TestCase):
    """Test credit note PDF generation"""
    
    def setUp(self):
        """Set up test data"""
        self.tenant = Tenant.objects.create(name="Test Tenant")
        self.branch = Branch.objects.create(name="Main", code="MB", address="123 St")
        self.user = User.objects.create_user(
            username="test", email="test@test.com", password="pass",
            tenant=self.tenant, branch=self.branch
        )
        
        self.client_obj = Client.objects.create(
            client_id="CLI-001", first_name="John", last_name="Doe",
            gender="male", phone_primary="123",
            owner=self.user, branch=self.branch
        )
        
        self.invoice = Invoice.objects.create(
            invoice_number="INV-001", client=self.client_obj,
            invoice_date=timezone.now().date(), due_date=timezone.now().date(),
            total_amount=Decimal('430.00'), branch=self.branch,
            owner=self.user, created_by=self.user
        )
        
        self.credit_note = CreditNote.objects.create(
            original_invoice=self.invoice, client=self.client_obj,
            issue_date=timezone.now().date(), reason="Product defective",
            subtotal=Decimal('100.00'), total_amount=Decimal('100.00'),
            status='issued', branch=self.branch, owner=self.user,
            created_by=self.user
        )
    
    def test_pdf_generation(self):
        """Test PDF can be generated"""
        from inventory.services.credit_note_pdf import CreditNotePDFService
        
        pdf_service = CreditNotePDFService(self.credit_note)
        pdf_content = pdf_service.generate()
        
        self.assertIsNotNone(pdf_content)
        self.assertGreater(len(pdf_content), 0)
        # PDF files start with %PDF
        self.assertTrue(pdf_content.startswith(b'%PDF'))
