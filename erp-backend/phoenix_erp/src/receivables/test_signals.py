# receivables/test_signals.py
"""
Tests for receivables signals - auto-creation of CustomerReceivable
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

from receivables.models import CustomerReceivable
from clients.models import Client
from branches.models import Branch
from incomes.models import Invoice, FeeEntitlement, FeeStructure, IncomeCategory
from accounts.models import Account

User = get_user_model()


class InvoiceSignalTestCase(TestCase):
    """Test CustomerReceivable auto-creation from Invoice"""
    
    def setUp(self):
        """Set up test data"""
        # Create owner user
        self.owner = User.objects.create_user(
            username='owneruser',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            owner=self.owner,
            code='TEST'
        )
        # Create regular user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client = Client.objects.create(
            client_id='TEST9297',
            first_name='Test',
            last_name='Client',
            gender='male',
            phone_primary='1234567890',
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_invoice_creates_receivable(self):
        """Test that creating invoice auto-creates receivable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            amount=Decimal('100000.00'),
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Check receivable was created
        receivables = CustomerReceivable.objects.filter(
            receivable_type='invoice',
            object_id=invoice.id
        )
        self.assertEqual(receivables.count(), 1)
        
        receivable = receivables.first()
        self.assertEqual(receivable.client, self.client)
        self.assertEqual(receivable.reference_number, 'INV-001')
        self.assertEqual(receivable.original_amount, Decimal('100000.00'))
        self.assertEqual(receivable.balance, Decimal('100000.00'))
    
    def test_invoice_update_updates_receivable(self):
        """Test that updating invoice updates receivable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            amount=Decimal('100000.00'),
            amount_paid=Decimal('0'),
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Make payment on invoice (balance is computed from amount - amount_paid)
        invoice.amount_paid = Decimal('50000.00')
        invoice.save()
        
        # Check receivable updated
        receivable = CustomerReceivable.objects.get(
            receivable_type='invoice',
            object_id=invoice.id
        )
        self.assertEqual(receivable.amount_paid, Decimal('50000.00'))
        self.assertEqual(receivable.balance, Decimal('50000.00'))
    
    def test_invoice_delete_deletes_receivable(self):
        """Test that deleting invoice deletes receivable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            amount=Decimal('100000.00'),
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        invoice_id = invoice.id
        
        # Delete invoice
        invoice.delete()
        
        # Check receivable deleted
        receivables = CustomerReceivable.objects.filter(
            receivable_type='invoice',
            object_id=invoice_id
        )
        self.assertEqual(receivables.count(), 0)


class FeeEntitlementSignalTestCase(TestCase):
    """Test CustomerReceivable auto-creation from FeeEntitlement"""
    
    def setUp(self):
        """Set up test data"""
        # Create owner user
        self.owner = User.objects.create_user(
            username='owneruser',
            password='testpass123'
        )
        self.branch = Branch.objects.create(
            name='Test Branch',
            owner=self.owner,
            code='TEST'
        )
        # Create regular user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client = Client.objects.create(
            client_id='TEST9406',
            first_name='Test',
            last_name='Client',
            gender='male',
            phone_primary='1234567890',
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create parent revenue account (required for income account)
        parent_revenue = Account.objects.create(
            owner=self.owner,
            branch=self.branch,
            created_by=self.user,
            code='400',
            name='Revenue',
            account_type='INCOME',
            account_level='PARENT',
            enable_smart_forms=True
        )
        
        # Create income account (required for IncomeCategory)
        self.income_account = Account.objects.create(
            owner=self.owner,
            branch=self.branch,
            created_by=self.user,
            code='401-001',
            name='Tuition Revenue',
            account_type='INCOME',
            account_level='CHILD',
            enable_smart_forms=False,
            parent=parent_revenue
        )
        
        # Create income category for fee structure
        self.income_category = IncomeCategory.objects.create(
            name='Tuition Fees',
            code='TUITION',
            income_account=self.income_account,
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create fee structure (required for FeeEntitlement)
        self.fee_structure = FeeStructure.objects.create(
            name='Grade 10 Tuition',
            code='G10-TUITION',
            category=self.income_category,
            base_amount=Decimal('50000.00'),
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create invoice (required for FeeEntitlement)
        self.invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-FEE-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            amount=Decimal('50000.00'),
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_entitlement_creates_receivable(self):
        """Test that creating entitlement auto-creates receivable"""
        entitlement = FeeEntitlement.objects.create(
            client=self.client,
            invoice=self.invoice,
            fee_structure=self.fee_structure,
            total_amount=Decimal('50000.00'),
            minimum_required=Decimal('15000.00'),
            valid_from=timezone.now().date(),
            valid_until=timezone.now().date() + timedelta(days=90),
            status='pending',
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Check receivable was created
        receivables = CustomerReceivable.objects.filter(
            receivable_type='entitlement',
            object_id=entitlement.id
        )
        self.assertEqual(receivables.count(), 1)
        
        receivable = receivables.first()
        self.assertEqual(receivable.client, self.client)
        self.assertEqual(receivable.original_amount, Decimal('50000.00'))
    
    def test_entitlement_payment_updates_receivable(self):
        """Test that entitlement payment updates receivable"""
        entitlement = FeeEntitlement.objects.create(
            client=self.client,
            invoice=self.invoice,
            fee_structure=self.fee_structure,
            total_amount=Decimal('50000.00'),
            minimum_required=Decimal('15000.00'),
            amount_paid=Decimal('0'),
            valid_from=timezone.now().date(),
            valid_until=timezone.now().date() + timedelta(days=90),
            status='pending',
            owner=self.owner,
            branch=self.branch,
            created_by=self.user
        )
        
        # Make payment (balance is computed from total_amount - amount_paid)
        entitlement.amount_paid = Decimal('25000.00')
        entitlement.status = 'active'
        entitlement.save()
        
        # Check receivable updated
        receivable = CustomerReceivable.objects.get(
            receivable_type='entitlement',
            object_id=entitlement.id
        )
        self.assertEqual(receivable.amount_paid, Decimal('25000.00'))
        self.assertEqual(receivable.balance, Decimal('25000.00'))
