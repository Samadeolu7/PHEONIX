from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from users.models import Tenant, User
from branches.models import Branch
from common.services.reference_service import ReferenceService
from hr.models import Payroll, Staff
from hr.services.payroll_service import PayrollService


class ReferenceAndPayrollTests(TestCase):
    def setUp(self):
        # Create tenant, user and branch
        self.user = User.objects.create_user(username='testuser', password='pass')
        self.tenant = Tenant.objects.create(name='TestTenant', slug='testtenant', owner=self.user)
        self.user.tenant = self.tenant
        self.user.save()
        self.branch = Branch.objects.create(name='Main Branch', code='MAIN', tenant=self.tenant, owner=self.user)

    def test_reference_register_increments(self):
        # Generate a reference and register it, then generate another and ensure increment
        ref1 = ReferenceService.generate_reference('hr', 'payroll', tenant=self.tenant, branch=self.branch)
        # Register the reference (simulate object creation)
        rt = ReferenceService.register_reference(
            reference_number=ref1,
            module='hr',
            model_name='payroll',
            object_id=1,
            tenant=self.tenant,
            branch=self.branch,
            created_by=self.user
        )
        self.assertIsNotNone(rt)

        ref2 = ReferenceService.generate_reference('hr', 'payroll', tenant=self.tenant, branch=self.branch)
        self.assertNotEqual(ref1, ref2)

        # Numeric suffix should increment by 1
        n1 = int(ref1.split('-')[-1])
        n2 = int(ref2.split('-')[-1])
        self.assertEqual(n2, n1 + 1)

    def test_payroll_calculate_accepts_id_list(self):
        # Create a staff member
        staff = Staff.objects.create(first_name='Jane', last_name='Doe', tenant=self.tenant, owner=self.user, branch=self.branch)

        # Create payroll in draft
        today = timezone.now().date()
        payroll = Payroll.objects.create(
            reference_number='PROLL-TEST-0001',
            period_start=today - timedelta(days=30),
            period_end=today,
            pay_date=today,
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch,
            status='draft'
        )

        service = PayrollService(payroll)
        result = service.calculate_payroll(staff_list=[staff.id])

        self.assertIsInstance(result, dict)
        # Payroll status should update
        payroll.refresh_from_db()
        self.assertEqual(payroll.status, 'calculated')
        # At least the payroll ran (result keys present)
        self.assertIn('payslips_created', result)

