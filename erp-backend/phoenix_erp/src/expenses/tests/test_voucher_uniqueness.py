"""
Verify that voucher numbers are now unique and tracked
"""
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from expenses.models import PrepaidExpense, PrepaidVoucher, ExpenseCategory, Resource
from procurement.models import Supplier
from branches.models import Branch
from accounts.models import Account, AccountCategory
from common.models import ReferenceTracking
from users.models import Tenant
from common.managers import set_current_tenant
from decimal import Decimal
from django.utils import timezone
import json

User = get_user_model()


class VoucherNumberUniquenessTest(TestCase):
    def setUp(self):
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testunique')
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
            email='test@test.com',
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
        
        self.client = Client()
        self.client.force_login(self.user)
    
    def test_sequential_vouchers_have_unique_numbers(self):
        """Test that creating multiple vouchers generates sequential unique numbers"""
        
        # Create 5 vouchers sequentially
        voucher_numbers = []
        
        # Create resource for vouchers
        resource = Resource.objects.create(
            name='Company Vehicle',
            resource_type='vehicle',
            measurable=True,
            unit_of_measure='liters',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )
        
        for i in range(1, 6):
            response = self.client.post('/api/expenses/vouchers/', {
                'prepaid_expense_id': self.prepaid_expense.id,
                'resource_id': resource.id,
                'allocated_units': '10.0',
                'start_date': '2026-01-15',
                'end_date': '2026-02-15'
            }, content_type='application/json')
            
            self.assertEqual(response.status_code, 201, f"Failed to create voucher {i}: {response.content}")
            
            data = response.json()
            voucher_number = data['voucher_number']
            voucher_numbers.append(voucher_number)
            print(f"Created voucher {i}: {voucher_number}")
        
        # Verify all numbers are unique
        unique_numbers = set(voucher_numbers)
        print(f"\nTotal created: {len(voucher_numbers)}")
        print(f"Unique numbers: {len(unique_numbers)}")
        print(f"Voucher numbers: {voucher_numbers}")
        
        self.assertEqual(len(unique_numbers), 5, 
                        f"Expected 5 unique numbers, got {len(unique_numbers)}: {voucher_numbers}")
        
        # Verify they're sequential
        for i in range(1, 6):
            expected_suffix = f"{i:04d}"
            self.assertTrue(
                any(num.endswith(expected_suffix) for num in voucher_numbers),
                f"Expected to find a voucher ending with {expected_suffix}"
            )
        
        # Verify all are in ReferenceTracking
        for voucher_num in voucher_numbers:
            tracking_exists = ReferenceTracking.objects.filter(
                reference_number=voucher_num
            ).exists()
            self.assertTrue(tracking_exists, 
                          f"Voucher {voucher_num} not found in ReferenceTracking!")
            print(f"✅ {voucher_num} found in ReferenceTracking")
        
        print(f"\n✅ All {len(voucher_numbers)} vouchers have unique numbers and are tracked!")
    
    def test_reference_tracking_increments(self):
        """Verify ReferenceTracking is being used for number generation"""
        
        # Check initial state
        initial_count = ReferenceTracking.objects.filter(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=self.tenant
        ).count()
        print(f"Initial ReferenceTracking count: {initial_count}")
        
        # Create resource for vouchers
        resource = Resource.objects.create(
            name='Company Vehicle',
            resource_type='vehicle',
            measurable=True,
            unit_of_measure='liters',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )
        
        # Create first voucher
        response1 = self.client.post('/api/expenses/vouchers/', {
            'prepaid_expense_id': self.prepaid_expense.id,
            'resource_id': resource.id,
            'allocated_units': '10.0',
            'start_date': '2026-01-15',
            'end_date': '2026-02-15'
        }, content_type='application/json')
        
        self.assertEqual(response1.status_code, 201)
        voucher1_num = response1.json()['voucher_number']
        print(f"1st voucher: {voucher1_num}")
        
        # Verify it's in tracking
        track_count_1 = ReferenceTracking.objects.filter(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=self.tenant
        ).count()
        self.assertEqual(track_count_1, initial_count + 1, 
                        "ReferenceTracking not incremented after 1st voucher")
        print(f"ReferenceTracking count after 1st: {track_count_1}")
        
        # Create second voucher
        response2 = self.client.post('/api/expenses/vouchers/', {
            'prepaid_expense_id': self.prepaid_expense.id,
            'resource_id': resource.id,
            'allocated_units': '10.0',
            'start_date': '2026-01-15',
            'end_date': '2026-02-15'
        }, content_type='application/json')
        
        self.assertEqual(response2.status_code, 201)
        voucher2_num = response2.json()['voucher_number']
        print(f"2nd voucher: {voucher2_num}")
        
        # Verify it's in tracking
        track_count_2 = ReferenceTracking.objects.filter(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=self.tenant
        ).count()
        self.assertEqual(track_count_2, initial_count + 2,
                        "ReferenceTracking not incremented after 2nd voucher")
        print(f"ReferenceTracking count after 2nd: {track_count_2}")
        
        # Verify numbers are different
        self.assertNotEqual(voucher1_num, voucher2_num,
                          "Second voucher got duplicate number!")
        
        print(f"\n✅ ReferenceTracking is working correctly!")
        print(f"   - Each voucher creates a tracking record")
        print(f"   - Sequential calls generate unique numbers")
