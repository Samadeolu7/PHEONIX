from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

from accounts.models import Account
from branches.models import Branch
from clients.models import Client, ClientClassification
from procurement.models import Supplier
from liabilities.models import AccountsPayable
from users.models import User


class AccountsPayableTest(TestCase):
    def setUp(self):
        """Set up test data"""
        self.branch = Branch.objects.create(
            name="Test Branch",
            code="TB001"
        )
        
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            branch=self.branch
        )
        
        # Create liability account
        self.liability_account = Account.objects.create(
            code="2100",
            name="Accounts Payable",
            account_type="LIABILITY",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense account (wrong type for testing)
        self.expense_account = Account.objects.create(
            code="5100",
            name="Office Supplies",
            account_type="EXPENSE",
            account_level="PARENT",
            branch=self.branch,
            owner=self.user
        )
        
        # Create client
        classification = ClientClassification.objects.create(
            name="Standard",
            description="Standard client"
        )
        
        self.client = Client.objects.create(
            client_id="CL001",
            first_name="John",
            last_name="Doe",
            phone_primary="1234567890",
            classification=classification,
            branch=self.branch,
            owner=self.user
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            supplier_code="SUP001",
            name="Test Supplier Inc",
            contact_person="Jane Smith",
            email="supplier@test.com",
            phone="0987654321",
            payment_terms="net_30",
            branch=self.branch,
            owner=self.user
        )
    
    def test_create_payable_for_client(self):
        """Test creating AccountsPayable for Client vendor"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.client,
            account=self.liability_account,
            invoice_number="INV-001",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            description="Test payable for client",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(payable.vendor, self.client)
        self.assertEqual(payable.amount, Decimal('1000.00'))
        self.assertEqual(payable.amount_due, Decimal('1000.00'))
        self.assertEqual(payable.status, 'unpaid')
        self.assertEqual(payable.vendor_name, "John Doe")
    
    def test_create_payable_for_supplier(self):
        """Test creating AccountsPayable for Supplier vendor"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-002",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('2500.00'),
            description="Test payable for supplier",
            branch=self.branch,
            owner=self.user
        )
        
        self.assertEqual(payable.vendor, self.supplier)
        self.assertEqual(payable.amount, Decimal('2500.00'))
        self.assertEqual(payable.amount_due, Decimal('2500.00'))
        self.assertEqual(payable.status, 'unpaid')
        self.assertEqual(payable.vendor_name, "Test Supplier Inc")
    
    def test_for_vendor_query(self):
        """Test querying payables for specific vendor"""
        # Create payables for both client and supplier
        client_payable = AccountsPayable.create_for_vendor(
            vendor=self.client,
            account=self.liability_account,
            invoice_number="INV-CLIENT",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('500.00'),
            branch=self.branch,
            owner=self.user
        )
        
        supplier_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-SUPPLIER",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('750.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Query for client payables
        client_payables = AccountsPayable.for_vendor(self.client)
        self.assertEqual(client_payables.count(), 1)
        self.assertEqual(client_payables.first(), client_payable)
        
        # Query for supplier payables
        supplier_payables = AccountsPayable.for_vendor(self.supplier)
        self.assertEqual(supplier_payables.count(), 1)
        self.assertEqual(supplier_payables.first(), supplier_payable)
    
    def test_make_payment(self):
        """Test making payments against AccountsPayable"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-PAY",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Make partial payment
        remaining = payable.make_payment(Decimal('300.00'))
        self.assertEqual(payable.amount_paid, Decimal('300.00'))
        self.assertEqual(payable.amount_due, Decimal('700.00'))
        self.assertEqual(remaining, Decimal('700.00'))
        self.assertEqual(payable.status, 'partial')
        
        # Make full payment
        remaining = payable.make_payment(Decimal('700.00'))
        self.assertEqual(payable.amount_paid, Decimal('1000.00'))
        self.assertEqual(payable.amount_due, Decimal('0.00'))
        self.assertEqual(remaining, Decimal('0.00'))
        self.assertEqual(payable.status, 'paid')
    
    def test_payment_validation(self):
        """Test payment amount validation"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-VAL",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('500.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Test negative payment
        with self.assertRaises(ValidationError):
            payable.make_payment(Decimal('-100.00'))
        
        # Test overpayment
        with self.assertRaises(ValidationError):
            payable.make_payment(Decimal('600.00'))
    
    def test_reference_number_auto_generation(self):
        """Test that reference numbers are auto-generated"""
        payable1 = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-REF1",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('100.00'),
            branch=self.branch,
            owner=self.user
        )
        
        payable2 = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-REF2",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('200.00'),
            branch=self.branch,
            owner=self.user
        )
        
        self.assertTrue(payable1.reference_number.startswith('AP-'))
        self.assertTrue(payable2.reference_number.startswith('AP-'))
        self.assertNotEqual(payable1.reference_number, payable2.reference_number)
    
    def test_overdue_payables(self):
        """Test querying overdue payables"""
        today = timezone.now().date()
        past_date = today - timezone.timedelta(days=10)
        future_date = today + timezone.timedelta(days=10)
        
        # Create overdue payable
        overdue_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-OVERDUE",
            invoice_date=past_date - timezone.timedelta(days=20),
            due_date=past_date,
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Create current payable
        current_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-CURRENT",
            invoice_date=today,
            due_date=future_date,
            amount=Decimal('500.00'),
            branch=self.branch,
            owner=self.user
        )
        
        overdue = AccountsPayable.overdue_payables()
        self.assertEqual(overdue.count(), 1)
        self.assertEqual(overdue.first(), overdue_payable)
    
    def test_account_type_validation(self):
        """Test that only LIABILITY accounts can be used"""
        with self.assertRaises(ValidationError):
            payable = AccountsPayable.create_for_vendor(
                vendor=self.supplier,
                account=self.expense_account,  # Wrong account type
                invoice_number="INV-WRONG",
                invoice_date=timezone.now().date(),
                due_date=timezone.now().date() + timezone.timedelta(days=30),
                amount=Decimal('100.00'),
                branch=self.branch,
                owner=self.user
            )
            payable.full_clean()  # Trigger validation
