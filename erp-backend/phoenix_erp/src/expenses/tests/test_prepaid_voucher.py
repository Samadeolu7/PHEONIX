"""
Tests for PrepaidVoucher creation with retry logic for unique constraint handling

Tests cover:
- Successful voucher creation with auto-generated voucher_number
- Retry mechanism when voucher_number collision occurs
- Failure after max retry attempts
- Validation of allocated_units against prepaid expense balance
- Multiple vouchers for different assets from same prepaid expense
"""

from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status as http_status

from expenses.models import (
    ExpenseCategory, 
    PrepaidExpense, 
    PrepaidVoucher,
    Resource
)
from accounts.models import Account, AccountCategory
from procurement.models import Supplier
from branches.models import Branch
from users.models import Tenant
from common.managers import set_current_tenant

User = get_user_model()


class PrepaidVoucherCreationTest(TestCase):
    """Test PrepaidVoucher creation with retry logic"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testvoucher')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create account categories
        self.expense_cat = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_cat = AccountCategory.objects.create(
            name='Current Assets',
            code_prefix='1',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.expense_account = Account.objects.create(
            name='Fuel Expense',
            code='5200',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.prepaid_account = Account.objects.create(
            name='Prepaid Expenses',
            code='1300',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name='Test Supplier',
            contact_person='John Doe',
            email='supplier@test.com',
            phone='1234567890',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create expense category
        self.category = ExpenseCategory.objects.create(
            name='Fuel',
            code='FUEL',
            expense_account=self.expense_account,
            prepaid_account=self.prepaid_account,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create prepaid expense
        self.prepaid_expense = PrepaidExpense.objects.create(
            reference_number='PREP-2026-0001',
            category=self.category,
            supplier=self.supplier,
            supplier_name='Test Supplier',
            description='Diesel Fuel Prepaid',
            measurable=True,
            unit_of_measure='liters',
            total_units=Decimal('1000.00'),
            consumed_units=Decimal('0.00'),
            unit_cost=Decimal('1.50'),
            total_amount=Decimal('1500.00'),
            purchase_date=timezone.now().date(),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Set up API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_successful_voucher_creation(self):
        """Test normal voucher creation succeeds"""
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat(),
            'notes': 'Test voucher'
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertIn('voucher_number', response.data)
        self.assertTrue(response.data['voucher_number'].startswith('VOUCH-'))
        self.assertEqual(response.data['beneficiary_reference'], 'VEH005')
        self.assertEqual(response.data['allocated_units'], '100.00')
        
        # Verify voucher was created in database
        voucher = PrepaidVoucher.objects.get(voucher_number=response.data['voucher_number'])
        self.assertEqual(voucher.beneficiary_reference, 'VEH005')
        self.assertEqual(voucher.status, 'active')
    
    def test_multiple_vouchers_same_prepaid_expense(self):
        """Test creating multiple vouchers for different assets from same prepaid expense"""
        voucher_data_1 = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH001',
            'beneficiary_reference': 'VEH001',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        voucher_data_2 = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH002',
            'beneficiary_reference': 'VEH002',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '200.00',
            'allocated_amount': '300.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        # Create first voucher
        response1 = self.client.post('/api/expenses/vouchers/', data=voucher_data_1, format='json')
        self.assertEqual(response1.status_code, http_status.HTTP_201_CREATED)
        
        # Create second voucher for different asset
        response2 = self.client.post('/api/expenses/vouchers/', data=voucher_data_2, format='json')
        self.assertEqual(response2.status_code, http_status.HTTP_201_CREATED)
        
        # Verify both vouchers exist
        self.assertEqual(PrepaidVoucher.objects.filter(prepaid_expense=self.prepaid_expense).count(), 2)
    
    def test_insufficient_balance_validation(self):
        """Test that voucher creation fails when allocated_units exceed remaining_units"""
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '2000.00',  # More than total_units (1000)
            'allocated_amount': '3000.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
        self.assertIn('allocated_units', response.data)
        self.assertIn('Insufficient balance', str(response.data['allocated_units']))
    
    @patch('common.services.reference_service.ReferenceService.generate_reference')
    def test_retry_on_voucher_number_collision(self, mock_generate_reference):
        """Test that retry mechanism works when voucher_number collision occurs"""
        # First call returns a duplicate number, second call returns unique number
        mock_generate_reference.side_effect = [
            'VOUCH-2026-0001',  # First attempt - will collide
            'VOUCH-2026-0002'   # Second attempt - will succeed
        ]
        
        # Create first voucher with the duplicate number manually
        PrepaidVoucher.objects.create(
            voucher_number='VOUCH-2026-0001',
            prepaid_expense=self.prepaid_expense,
            beneficiary_type='asset',
            beneficiary_name='Vehicle VEH001',
            beneficiary_reference='VEH001',
            allocated_units=Decimal('50.00'),
            allocated_amount=Decimal('75.00'),
            issue_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Now try to create another voucher - should retry and succeed
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(response.data['voucher_number'], 'VOUCH-2026-0002')
        
        # Verify generate_reference was called twice
        self.assertEqual(mock_generate_reference.call_count, 2)
    
    @patch('common.services.reference_service.ReferenceService.generate_reference')
    def test_retry_exhaustion_failure(self, mock_generate_reference):
        """Test that creation fails after max retry attempts"""
        # All attempts return the same duplicate number
        mock_generate_reference.return_value = 'VOUCH-2026-0001'
        
        # Create first voucher with the duplicate number
        PrepaidVoucher.objects.create(
            voucher_number='VOUCH-2026-0001',
            prepaid_expense=self.prepaid_expense,
            beneficiary_type='asset',
            beneficiary_name='Vehicle VEH001',
            beneficiary_reference='VEH001',
            allocated_units=Decimal('50.00'),
            allocated_amount=Decimal('75.00'),
            issue_date=timezone.now().date(),
            expiry_date=timezone.now().date() + timedelta(days=30),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Try to create another voucher - should fail after 5 attempts
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
        self.assertIn('voucher_number', response.data)
        self.assertIn('Failed to generate unique voucher number', str(response.data['voucher_number']))
        
        # Verify generate_reference was called 5 times (max_attempts)
        self.assertEqual(mock_generate_reference.call_count, 5)
    
    def test_expiry_date_validation(self):
        """Test that expiry_date must be after issue_date"""
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() - timedelta(days=1)).isoformat()  # Past date
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
        self.assertIn('expiry_date', response.data)
    
    def test_voucher_created_with_correct_tenant_and_owner(self):
        """Test that voucher inherits tenant and owner from request user"""
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        
        # Verify tenant and owner were set correctly
        voucher = PrepaidVoucher.objects.get(voucher_number=response.data['voucher_number'])
        self.assertEqual(voucher.owner, self.user)
        self.assertEqual(voucher.branch, self.branch)
        self.assertEqual(voucher.tenant, self.tenant)
    
    def test_concurrent_voucher_creation_simulation(self):
        """Test that concurrent voucher creations don't cause issues"""
        voucher_data_template = {
            'beneficiary_type': 'asset',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '50.00',
            'allocated_amount': '75.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        # Create multiple vouchers rapidly
        responses = []
        for i in range(5):
            voucher_data = voucher_data_template.copy()
            voucher_data['beneficiary_name'] = f'Vehicle VEH{i:03d}'
            voucher_data['beneficiary_reference'] = f'VEH{i:03d}'
            
            response = self.client.post(
                '/api/expenses/vouchers/',
                data=voucher_data,
                format='json'
            )
            responses.append(response)
        
        # All should succeed
        for response in responses:
            self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        
        # All should have unique voucher numbers
        voucher_numbers = [r.data['voucher_number'] for r in responses]
        self.assertEqual(len(voucher_numbers), len(set(voucher_numbers)))
        
        # Verify all vouchers were created
        self.assertEqual(PrepaidVoucher.objects.filter(prepaid_expense=self.prepaid_expense).count(), 5)


class PrepaidVoucherStatusWorkflowTest(TestCase):
    """Test PrepaidVoucher status transitions and workflow"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testvoucherworkflow')
        set_current_tenant(self.tenant)
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create account categories
        from accounts.models import AccountCategory
        self.expense_cat = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_cat = AccountCategory.objects.create(
            name='Current Assets',
            code_prefix='1',
            section=1,
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        from accounts.models import Account
        self.expense_account = Account.objects.create(
            name='Fuel Expense',
            code='5200',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.prepaid_account = Account.objects.create(
            name='Prepaid Expenses',
            code='1300',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_cat,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name='Test Supplier',
            contact_person='John Doe',
            email='supplier@test.com',
            phone='1234567890',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create expense category
        self.category = ExpenseCategory.objects.create(
            name='Fuel',
            code='FUEL',
            expense_account=self.expense_account,
            prepaid_account=self.prepaid_account,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create prepaid expense
        self.prepaid_expense = PrepaidExpense.objects.create(
            reference_number='PREP-2026-0002',
            category=self.category,
            supplier=self.supplier,
            supplier_name='Test Supplier',
            description='Diesel Fuel Prepaid',
            measurable=True,
            unit_of_measure='liters',
            total_units=Decimal('1000.00'),
            consumed_units=Decimal('0.00'),
            unit_cost=Decimal('1.50'),
            total_amount=Decimal('1500.00'),
            purchase_date=timezone.now().date(),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Set up API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_voucher_initial_status_is_active(self):
        """Test that newly created voucher has 'active' status"""
        voucher_data = {
            'beneficiary_type': 'asset',
            'beneficiary_name': 'Vehicle VEH005',
            'beneficiary_reference': 'VEH005',
            'prepaid_expense': self.prepaid_expense.id,
            'allocated_units': '100.00',
            'allocated_amount': '150.00',
            'issue_date': timezone.now().date().isoformat(),
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }
        
        response = self.client.post(
            '/api/expenses/vouchers/',
            data=voucher_data,
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'active')
        
        voucher = PrepaidVoucher.objects.get(voucher_number=response.data['voucher_number'])
        self.assertEqual(voucher.status, 'active')
        self.assertEqual(voucher.consumed_units, Decimal('0.00'))
