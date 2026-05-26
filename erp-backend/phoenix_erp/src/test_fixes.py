"""
Test script to verify the fixes for:
1. Prepaid expense amortization (Child accounts must have a parent error)
2. Voucher creation (Type error)
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from decimal import Decimal
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from users.models import Tenant
from branches.models import Branch
from expenses.models import ExpenseCategory, PrepaidExpense, PrepaidVoucher
from expenses.services.expense_accounting import PrepaidExpenseAccountingService
from common.managers import set_current_tenant

User = get_user_model()

def test_prepaid_amortization():
    """Test prepaid expense amortization - should not throw 'Child accounts must have a parent' error"""
    print("\n" + "="*70)
    print("TEST 1: Prepaid Expense Amortization")
    print("="*70)
    
    try:
        # Setup
        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(name="Test Tenant", subdomain="test")
        set_current_tenant(tenant)
        
        user = User.objects.filter(tenant=tenant).first()
        if not user:
            user = User.objects.create_user(
                username='testuser',
                email='test@test.com',
                password='testpass',
                tenant=tenant
            )
        
        branch = Branch.objects.filter(tenant=tenant).first()
        if not branch:
            branch = Branch.objects.create(
                name="Test Branch",
                code="TB001",
                tenant=tenant
            )
        
        # Create expense category
        category, _ = ExpenseCategory.objects.get_or_create(
            name="Test Category",
            owner=user,
            branch=branch,
            defaults={'description': 'Test'}
        )
        
        # Create prepaid expense
        prepaid = PrepaidExpense.objects.create(
            category=category,
            purchase_date=date.today(),
            description="Test prepaid expense",
            total_amount=Decimal("100.00"),
            measurable=True,
            unit_of_measure="kg",
            total_units=Decimal("10.00"),
            consumed_units=Decimal("0.00"),
            unit_cost=Decimal("10.00"),
            supplier_name="Test Supplier",
            supplier_invoice="INV001",
            owner=user,
            branch=branch
        )
        
        print(f"✓ Created prepaid expense: {prepaid.reference_number}")
        
        # Amortize
        service = PrepaidExpenseAccountingService(prepaid)
        journal_entry = service.amortize_period(
            amount=Decimal("50.00"),
            period_end_date=date.today(),
            notes="Test amortization"
        )
        
        print(f"✓ Amortization successful! Journal Entry ID: {journal_entry.id}")
        print(f"  Amount amortized: {Decimal('50.00')}")
        print(f"  Remaining: {prepaid.remaining_amount}")
        print("\n✅ TEST 1 PASSED: No 'Child accounts must have a parent' error!")
        
    except Exception as e:
        print(f"\n❌ TEST 1 FAILED: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()


def test_voucher_creation():
    """Test voucher creation - should not throw type error"""
    print("\n" + "="*70)
    print("TEST 2: Voucher Creation")
    print("="*70)
    
    try:
        # Setup
        tenant = Tenant.objects.first()
        set_current_tenant(tenant)
        
        user = User.objects.filter(tenant=tenant).first()
        branch = Branch.objects.filter(tenant=tenant).first()
        
        # Get or create prepaid expense
        category, _ = ExpenseCategory.objects.get_or_create(
            name="Test Category",
            owner=user,
            branch=branch,
            defaults={'description': 'Test'}
        )
        
        prepaid = PrepaidExpense.objects.create(
            category=category,
            purchase_date=date.today(),
            description="Test for voucher",
            total_amount=Decimal("1000.00"),
            measurable=True,
            unit_of_measure="liters",
            total_units=Decimal("100.00"),
            consumed_units=Decimal("0.00"),
            unit_cost=Decimal("10.00"),
            supplier_name="Test Supplier",
            supplier_invoice="INV002",
            owner=user,
            branch=branch
        )
        
        print(f"✓ Created prepaid expense: {prepaid.reference_number}")
        
        # Create voucher (simulating API data as strings)
        from expenses.serializers import PrepaidVoucherSerializer
        data = {
            'beneficiary_type': 'asset',
            'issue_date': date.today(),
            'prepaid_expense': prepaid.id,
            'beneficiary_name': 'Company Demo',
            'beneficiary_reference': 'VEH93',
            'allocated_units': '10.00',  # String as it comes from API
            'allocated_amount': '100.00',  # String as it comes from API
            'expiry_date': date.today() + timedelta(days=7),
            'redemption_date': date.today() + timedelta(days=8),
            'redemption_location': 'Shell',
            'notes': 'Test note'
        }
        
        serializer = PrepaidVoucherSerializer(data=data)
        if serializer.is_valid():
            voucher = serializer.save(
                voucher_number='TEST-VOUCH-001',
                owner=user,
                branch=branch
            )
            print(f"✓ Voucher created successfully: {voucher.voucher_number}")
            print(f"  Beneficiary: {voucher.beneficiary_name}")
            print(f"  Allocated units: {voucher.allocated_units}")
            print(f"  Allocated amount: {voucher.allocated_amount}")
            print("\n✅ TEST 2 PASSED: No type error!")
        else:
            print(f"\n❌ TEST 2 FAILED: Validation errors: {serializer.errors}")
        
    except Exception as e:
        print(f"\n❌ TEST 2 FAILED: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    print("\n" + "="*70)
    print("TESTING FIXES FOR EXPENSES MODULE")
    print("="*70)
    
    test_prepaid_amortization()
    test_voucher_creation()
    
    print("\n" + "="*70)
    print("ALL TESTS COMPLETED")
    print("="*70 + "\n")
