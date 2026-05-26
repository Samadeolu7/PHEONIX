# liabilities/tests/test_api.py
"""
API endpoint tests for Accounts Payable
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from liabilities.models import AccountsPayable
from procurement.models import Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceivedNote, GoodsReceivedNoteItem
from inventory.models import InventoryItem, InventoryCategory, Location
from branches.models import Branch
from users.models import User, Tenant
from accounts.models import Account
from accounts.utils.account_creation import get_or_create_system_account


class AccountsPayableAPITestCase(TestCase):
    """Test Accounts Payable API endpoints"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(
            name="Test Organization",
            slug="test-org"
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAIN",
            tenant=self.tenant
        )
        
        # Create users
        self.admin_user = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='testpass123',
            is_staff=True,
            tenant=self.tenant
        )
        
        self.finance_officer = User.objects.create_user(
            username='finance',
            email='finance@test.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        # Create accounts
        self.liability_account = get_or_create_system_account(
            code='200',
            name='Accounts Payable',
            account_type='LIABILITY',
            owner=self.finance_officer,
            branch=self.branch
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name="Test Supplier",
            supplier_code="SUP-001",
            email="supplier@test.com",
            phone="555-1234",
            contact_person="John Supplier",
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Create API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)
        
        # Set current tenant in thread-local (required for OwnerBranchManager filtering)
        from common.managers import set_current_tenant
        set_current_tenant(self.tenant)
    
    def test_list_payables(self):
        """Test GET /api/liabilities/payables/"""
        # Create test payable
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
        
        response = self.client.get('/api/liabilities/payables/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Handle pagination - response.data might be paginated
        if isinstance(response.data, dict) and 'results' in response.data:
            results = response.data['results']
        else:
            results = response.data
        
        # Debug: Print what we got
        if len(results) != 1:
            print(f"\nDEBUG: Expected 1 result, got {len(results)}")
            print(f"Payable ID created: {payable.id}")
            print(f"Response: {response.data}")
            print(f"All payables in DB: {AccountsPayable.objects.all().count()}")
            
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['invoice_number'], 'INV-001')
    
    def test_create_payable(self):
        """Test POST /api/liabilities/payables/"""
        data = {
            'vendor_type': 'supplier',
            'vendor_id': self.supplier.id,
            'account': self.liability_account.id,
            'invoice_number': 'INV-002',
            'invoice_date': timezone.now().date().isoformat(),
            'due_date': (timezone.now().date() + timezone.timedelta(days=30)).isoformat(),
            'amount': '2000.00',
            'description': 'Test invoice',
            'branch': self.branch.id,
            'owner': self.finance_officer.id,
            'tenant': self.tenant.id
        }
        
        response = self.client.post('/api/liabilities/payables/', data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['invoice_number'], 'INV-002')
        self.assertEqual(response.data['amount'], '2000.00')
    
    def test_get_payable_detail(self):
        """Test GET /api/liabilities/payables/{id}/"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-003",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1500.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        response = self.client.get(f'/api/liabilities/payables/{payable.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['invoice_number'], 'INV-003')
        self.assertEqual(response.data['vendor_name'], 'Test Supplier')
    
    def test_make_payment_without_posted_by_fails(self):
        """Test payment requires posted_by"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-004",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        # Try to make payment without posted_by
        response = self.client.post(
            f'/api/liabilities/payables/{payable.id}/make_payment/',
            {'amount': '500.00'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_make_payment_success(self):
        """Test successful payment"""
        payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-005",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        response = self.client.post(
            f'/api/liabilities/payables/{payable.id}/make_payment/',
            {
                'amount': '500.00',
                'posted_by': self.finance_officer.id,
                'posting_notes': 'Partial payment'
            }
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['new_paid_amount'], '500.00')
        self.assertEqual(response.data['payment_status'], 'partial')
    
    def test_get_overdue_payables(self):
        """Test GET /api/liabilities/payables/overdue/"""
        # Create overdue payable
        overdue_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-OVERDUE",
            invoice_date=timezone.now().date() - timezone.timedelta(days=60),
            due_date=timezone.now().date() - timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        response = self.client.get('/api/liabilities/payables/overdue/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['invoice_number'], 'INV-OVERDUE')
    
    def test_get_summary(self):
        """Test GET /api/liabilities/payables/summary/"""
        # Create multiple payables
        AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-SUM-1",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('1000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.liability_account,
            invoice_number="INV-SUM-2",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            amount=Decimal('2000.00'),
            branch=self.branch,
            owner=self.finance_officer,
            tenant=self.tenant
        )
        
        response = self.client.get('/api/liabilities/payables/summary/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_payables'], 2)
        self.assertEqual(response.data['total_amount'], '3000.00')
        self.assertEqual(response.data['total_outstanding'], '3000.00')
