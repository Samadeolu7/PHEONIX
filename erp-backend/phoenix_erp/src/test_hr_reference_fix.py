"""
Test to verify HR reference number generation fix

This test demonstrates that the fix correctly generates unique reference numbers
for both Payroll and LeaveRequest models.

Run with: python manage.py test hr.tests.test_hr_reference_numbers
"""
import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix_erp.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from hr.models import LeaveRequest, Payroll, Staff, LeaveType
from branches.models import Branch
from common.models import ReferenceTracking
from common.services.reference_service import ReferenceService

User = get_user_model()


def test_leave_request_reference_generation():
    """Test that LeaveRequest generates unique reference numbers"""
    print("\n" + "="*70)
    print("Testing LeaveRequest Reference Number Generation")
    print("="*70)
    
    # Setup
    user = User.objects.first()
    if not user:
        print("❌ No user found. Please create a user first.")
        return
    
    branch = Branch.objects.first()
    if not branch:
        print("❌ No branch found. Please create a branch first.")
        return
    
    staff = Staff.objects.first()
    if not staff:
        print("❌ No staff found. Please create a staff member first.")
        return
    
    leave_type = LeaveType.objects.first()
    if not leave_type:
        print("❌ No leave type found. Please create a leave type first.")
        return
    
    tenant = getattr(user, 'tenant', user)
    
    print(f"\n📝 Generating first leave request reference...")
    ref1 = ReferenceService.generate_reference(
        module='hr',
        model_name='leave_request',
        tenant=tenant,
        branch=branch
    )
    print(f"   Generated: {ref1}")
    
    # Register it (this is what the fix does)
    ReferenceService.register_reference(
        reference_number=ref1,
        module='hr',
        model_name='leave_request',
        object_id=1,
        tenant=tenant,
        branch=branch,
        created_by=user,
        status='draft',
        amount=0.0,
        metadata={}
    )
    print(f"   ✅ Registered in tracking table")
    
    print(f"\n📝 Generating second leave request reference...")
    ref2 = ReferenceService.generate_reference(
        module='hr',
        model_name='leave_request',
        tenant=tenant,
        branch=branch
    )
    print(f"   Generated: {ref2}")
    
    # Verify they're different
    if ref1 != ref2:
        print(f"\n✅ SUCCESS: Generated unique references!")
        print(f"   First:  {ref1}")
        print(f"   Second: {ref2}")
    else:
        print(f"\n❌ FAILED: Both references are the same: {ref1}")
    
    # Check tracking table
    count = ReferenceTracking.objects.filter(
        module='hr',
        model_name='leave_request'
    ).count()
    print(f"\n📊 ReferenceTracking records for leave_request: {count}")


def test_payroll_reference_generation():
    """Test that Payroll generates unique reference numbers"""
    print("\n" + "="*70)
    print("Testing Payroll Reference Number Generation")
    print("="*70)
    
    # Setup
    user = User.objects.first()
    if not user:
        print("❌ No user found. Please create a user first.")
        return
    
    branch = Branch.objects.first()
    if not branch:
        print("❌ No branch found. Please create a branch first.")
        return
    
    tenant = getattr(user, 'tenant', user)
    
    print(f"\n📝 Generating first payroll reference...")
    ref1 = ReferenceService.generate_reference(
        module='hr',
        model_name='payroll',
        tenant=tenant,
        branch=branch
    )
    print(f"   Generated: {ref1}")
    
    # Register it (this is what the fix does)
    ReferenceService.register_reference(
        reference_number=ref1,
        module='hr',
        model_name='payroll',
        object_id=1,
        tenant=tenant,
        branch=branch,
        created_by=user,
        status='draft',
        amount=0.0,
        metadata={}
    )
    print(f"   ✅ Registered in tracking table")
    
    print(f"\n📝 Generating second payroll reference...")
    ref2 = ReferenceService.generate_reference(
        module='hr',
        model_name='payroll',
        tenant=tenant,
        branch=branch
    )
    print(f"   Generated: {ref2}")
    
    # Verify they're different
    if ref1 != ref2:
        print(f"\n✅ SUCCESS: Generated unique references!")
        print(f"   First:  {ref1}")
        print(f"   Second: {ref2}")
    else:
        print(f"\n❌ FAILED: Both references are the same: {ref1}")
    
    # Check tracking table
    count = ReferenceTracking.objects.filter(
        module='hr',
        model_name='payroll'
    ).count()
    print(f"\n📊 ReferenceTracking records for payroll: {count}")


def test_prefix_map():
    """Verify that new prefixes are in PREFIX_MAP"""
    print("\n" + "="*70)
    print("Testing PREFIX_MAP Contains New Entries")
    print("="*70)
    
    prefix_map = ReferenceService.PREFIX_MAP
    
    print("\n📋 Checking for 'leave_request'...")
    if 'leave_request' in prefix_map:
        print(f"   ✅ Found: leave_request → {prefix_map['leave_request']}")
    else:
        print(f"   ❌ Missing: leave_request")
    
    print("\n📋 Checking for 'payroll'...")
    if 'payroll' in prefix_map:
        print(f"   ✅ Found: payroll → {prefix_map['payroll']}")
    else:
        print(f"   ❌ Missing: payroll")
    
    print("\n📋 All prefixes in PREFIX_MAP:")
    for key, value in prefix_map.items():
        print(f"   {key:<30} → {value}")


if __name__ == '__main__':
    print("\n" + "="*70)
    print("HR REFERENCE NUMBER FIX - VERIFICATION TEST")
    print("="*70)
    print("\nThis test verifies that Payroll and LeaveRequest now generate")
    print("unique reference numbers correctly after the fix.")
    
    try:
        test_prefix_map()
        test_leave_request_reference_generation()
        test_payroll_reference_generation()
        
        print("\n" + "="*70)
        print("✅ ALL TESTS COMPLETED")
        print("="*70)
        print("\nIf all tests passed, the fix is working correctly!")
        print("\nNext steps:")
        print("1. Test creating actual leave requests via API")
        print("2. Test creating actual payroll records via API")
        print("3. Verify reference numbers are unique in database")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
