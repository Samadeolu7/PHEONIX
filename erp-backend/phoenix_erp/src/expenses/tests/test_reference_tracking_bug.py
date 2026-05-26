"""
Test to verify the REAL bug - missing register_reference calls
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from common.services.reference_service import ReferenceService
from common.models import ReferenceTracking
from branches.models import Branch

User = get_user_model()


class ReferenceTrackingBugTest(TestCase):
    def setUp(self):
        # Create test user with tenant
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB001',
            tenant=self.user.tenant,
            owner=self.user
        )
    
    def test_sequential_generation_without_registration(self):
        """
        This test proves the bug:
        Without register_reference(), sequential calls generate duplicate numbers
        """
        tenant = self.user.tenant
        branch = self.branch
        
        # First generation
        ref1 = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=tenant,
            branch=branch
        )
        print(f"\n1st call generated: {ref1}")
        
        # Check if it's in ReferenceTracking
        tracking_count = ReferenceTracking.objects.filter(
            reference_number=ref1
        ).count()
        print(f"Found in ReferenceTracking: {tracking_count}")
        
        # Second generation WITHOUT registering the first
        ref2 = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=tenant,
            branch=branch
        )
        print(f"2nd call generated: {ref2}")
        
        # THE BUG: They should be different but will be THE SAME!
        print(f"\nref1 == ref2? {ref1 == ref2}")
        print(f"Expected: False (different numbers)")
        print(f"Actual: {ref1 == ref2}")
        
        if ref1 == ref2:
            print("\n❌ BUG CONFIRMED: Same number generated twice!")
            print("Reason: generate_reference() checks ReferenceTracking, but we never called register_reference()")
        
        self.assertEqual(ref1, ref2, "BUG: Without register_reference, same number generated!")
    
    def test_with_proper_registration(self):
        """
        This shows how it SHOULD work
        """
        tenant = self.user.tenant
        branch = self.branch
        
        # First generation
        ref1 = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=tenant,
            branch=branch
        )
        print(f"\n1st call generated: {ref1}")
        
        # PROPERLY REGISTER IT
        ReferenceService.register_reference(
            reference_number=ref1,
            module='expenses',
            model_name='prepaid_voucher',
            object_id=999,  # Dummy ID for test
            tenant=tenant,
            branch=branch,
            created_by=self.user
        )
        print(f"Registered {ref1} to ReferenceTracking")
        
        # Second generation
        ref2 = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=tenant,
            branch=branch
        )
        print(f"2nd call generated: {ref2}")
        
        # NOW they should be different
        print(f"\nref1 == ref2? {ref1 == ref2}")
        print(f"Expected: False (different numbers)")
        print(f"Actual: {ref1 == ref2}")
        
        if ref1 != ref2:
            print(f"\n✅ CORRECT: Different numbers generated ({ref1} → {ref2})")
            print("Reason: register_reference() saved to ReferenceTracking, so next call incremented")
        
        self.assertNotEqual(ref1, ref2, "With register_reference, should generate different numbers")
