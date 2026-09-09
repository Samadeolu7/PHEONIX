# hr/tests/test_api.py
"""
Tests for HR & Payroll API endpoints
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from hr.models import (
    Staff, LeaveType, LeaveBalance, LeaveRequest,
    Attendance, Payroll, Payslip, SalaryComponent, StaffPayInfo,
    BonusDeductionRequest,
)
from hr.config_models import HRConfig
from branches.models import Branch
from users.models import Tenant
from accounts.models import Account

User = get_user_model()


class TestLeaveRequestAPI(TestCase):
    """Test leave request API endpoints"""
    
    def setUp(self):
        """Setup test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company')
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001"
        )
        
        # Create user. is_system_admin bypasses HasActionPermission's
        # fine-grained checks (see permissions.services.PermissionResolver.
        # _is_wildcard) — no Role is set up here to grant HR page access.
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
            is_system_admin=True,
        )

        # Create HR config
        self.hr_config = HRConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            working_hours_per_day=Decimal('8.0'),
            tax_rate_percentage=Decimal('10.0'),
            overtime_multiplier=Decimal('1.5')
        )
        
        # Create staff. auto_create_staff_profile (hr/signals.py) already
        # created a stub Staff the moment self.user was saved above, so this
        # must update that row rather than create a second one — a plain
        # Staff.objects.create() here collides on the OneToOne user_id.
        self.staff, _ = Staff.objects.update_or_create(
            user=self.user,
            defaults=dict(
                first_name='John',
                last_name='Doe',
                department='IT',
                position='Developer',
                owner=self.user,
                branch=self.branch,
            ),
        )

        # Create leave type
        self.leave_type = LeaveType.objects.create(
            name='Annual Leave',
            code='ANNUAL',
            is_paid=True,
            requires_approval=True,
            default_days_per_year=20,
            owner=self.user,
            branch=self.branch
        )
        
        # Create leave balance
        current_year = timezone.now().year
        self.leave_balance = LeaveBalance.objects.create(
            staff=self.staff,
            leave_type=self.leave_type,
            year=current_year,
            entitled_days=Decimal('20.0'),
            owner=self.user,
            branch=self.branch
        )

        # A second user, distinct from the requester, to act as approver.
        # Self-approval is blocked by the view, so approve/reject tests must
        # authenticate as someone other than the leave request's own staff.
        # is_system_admin grants can_approve via PermissionResolver's
        # wildcard bypass — no Role/RolePermissionPolicy is set up here.
        self.approver = User.objects.create_user(
            username='approveruser',
            email='approver@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
            is_system_admin=True,
        )

        # Create API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_create_leave_request(self):
        """Test creating a leave request"""
        today = timezone.now().date()
        
        data = {
            'staff': self.staff.id,
            'leave_type': self.leave_type.id,
            'start_date': str(today + timedelta(days=7)),
            'end_date': str(today + timedelta(days=9)),
            'reason': 'Family vacation'
        }
        
        url = reverse('hr:leave-request-list')
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LeaveRequest.objects.count(), 1)
        
        leave_request = LeaveRequest.objects.first()
        self.assertEqual(leave_request.staff, self.staff)
        self.assertEqual(leave_request.status, 'draft')
    
    def test_submit_leave_request(self):
        """Test submitting a leave request"""
        today = timezone.now().date()
        
        # Create leave request
        leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Vacation',
            status='draft',
            owner=self.user,
            branch=self.branch
        )
        
        url = reverse('hr:leave-request-submit', kwargs={'pk': leave_request.id})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, 'submitted')
    
    def test_approve_leave_request(self):
        """Test approving a leave request"""
        today = timezone.now().date()
        
        # Create and submit leave request
        leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Vacation',
            status='submitted',
            owner=self.user,
            branch=self.branch
        )
        
        # Update leave balance to reflect pending
        self.leave_balance.pending_days = Decimal('3.0')
        self.leave_balance.save()

        self.client.force_authenticate(user=self.approver)
        url = reverse('hr:leave-request-approve', kwargs={'pk': leave_request.id})
        response = self.client.post(url, {'notes': 'Approved'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()

        self.assertEqual(leave_request.status, 'approved')
        self.assertEqual(self.leave_balance.used_days, Decimal('3.0'))
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))

    def test_cannot_approve_own_leave_request(self):
        """A staff member cannot approve their own leave request."""
        today = timezone.now().date()

        leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Vacation',
            status='submitted',
            owner=self.user,
            branch=self.branch
        )
        self.leave_balance.pending_days = Decimal('3.0')
        self.leave_balance.save()

        # self.client is still authenticated as self.user, who *is*
        # leave_request.staff.user
        url = reverse('hr:leave-request-approve', kwargs={'pk': leave_request.id})
        response = self.client.post(url, {'notes': 'Approved'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, 'submitted')

    def test_cancel_approved_leave_request_restores_balance(self):
        """Cancelling an approved leave request must give the used days back."""
        today = timezone.now().date()

        leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Vacation',
            status='approved',
            owner=self.user,
            branch=self.branch
        )
        self.leave_balance.used_days = Decimal('3.0')
        self.leave_balance.save()

        url = reverse('hr:leave-request-cancel', kwargs={'pk': leave_request.id})
        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()

        self.assertEqual(leave_request.status, 'cancelled')
        self.assertEqual(self.leave_balance.used_days, Decimal('0.0'))

    def test_create_leave_request_with_medical_certificate_url(self):
        """medical_certificate must accept a plain URL string, matching how
        the frontend actually submits it (JSON, not multipart)."""
        today = timezone.now().date()

        data = {
            'staff': self.staff.id,
            'leave_type': self.leave_type.id,
            'start_date': str(today + timedelta(days=7)),
            'end_date': str(today + timedelta(days=9)),
            'reason': 'Sick leave',
            'medical_certificate': 'https://example.com/medical-certificate.pdf',
        }

        url = reverse('hr:leave-request-list')
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        leave_request = LeaveRequest.objects.get(pk=response.data['id'])
        self.assertEqual(
            leave_request.medical_certificate,
            'https://example.com/medical-certificate.pdf'
        )

    def test_reject_leave_request(self):
        """Test rejecting a leave request"""
        today = timezone.now().date()
        
        # Create and submit leave request
        leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Vacation',
            status='submitted',
            owner=self.user,
            branch=self.branch
        )
        
        self.leave_balance.pending_days = Decimal('3.0')
        self.leave_balance.save()

        self.client.force_authenticate(user=self.approver)
        url = reverse('hr:leave-request-reject', kwargs={'pk': leave_request.id})
        response = self.client.post(
            url,
            {'reason': 'Not enough notice'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        
        self.assertEqual(leave_request.status, 'rejected')
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))
    
    def test_list_leave_requests(self):
        """Test listing leave requests"""
        today = timezone.now().date()
        
        # Create multiple leave requests
        for i in range(3):
            LeaveRequest.objects.create(
                reference_number=f'LV00{i+1}',
                staff=self.staff,
                leave_type=self.leave_type,
                start_date=today + timedelta(days=7+i*10),
                end_date=today + timedelta(days=9+i*10),
                num_days=Decimal('3.0'),
                reason=f'Vacation {i+1}',
                status='draft',
                owner=self.user,
                branch=self.branch
            )
        
        url = reverse('hr:leave-request-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 3)


class TestAttendanceAPI(TestCase):
    """Test attendance API endpoints"""
    
    def setUp(self):
        """Setup test data"""
        # Create tenant. Required so the Staff row auto-created by
        # auto_create_staff_profile (hr/signals.py) below has a tenant.
        self.tenant = Tenant.objects.create(name='Test Company')

        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001"
        )

        # Create user. is_system_admin bypasses HasActionPermission's
        # fine-grained checks (see permissions.services.PermissionResolver.
        # _is_wildcard) — these tests exercise the attendance endpoints'
        # own behavior, not the separate permissions system, and no Role
        # is set up here to grant the plain endpoint access it needs.
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
            is_system_admin=True,
        )

        # Create staff. auto_create_staff_profile (hr/signals.py) already
        # created a stub Staff the moment self.user was saved above, so this
        # must update that row rather than create a second one — a plain
        # Staff.objects.create() here collides on the OneToOne user_id.
        self.staff, _ = Staff.objects.update_or_create(
            user=self.user,
            defaults=dict(
                first_name='John',
                last_name='Doe',
                department='IT',
                position='Developer',
                owner=self.user,
                branch=self.branch,
                tenant=self.tenant,
            ),
        )

        # Create API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_clock_in(self):
        """Test clocking in"""
        url = reverse('hr:attendance-clock-in')
        response = self.client.post(
            url,
            {'staff': self.staff.id},
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Attendance.objects.count(), 1)
        
        attendance = Attendance.objects.first()
        self.assertEqual(attendance.staff, self.staff)
        self.assertIsNotNone(attendance.clock_in)
        self.assertEqual(attendance.status, 'present')
    
    def test_clock_out(self):
        """Test clocking out"""
        today = timezone.now().date()
        
        # Create attendance with clock in
        attendance = Attendance.objects.create(
            staff=self.staff,
            date=today,
            clock_in=timezone.now(),
            status='present',
            owner=self.user,
            branch=self.branch
        )
        
        url = reverse('hr:attendance-clock-out')
        response = self.client.post(
            url,
            {'staff': self.staff.id},
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        attendance.refresh_from_db()
        self.assertIsNotNone(attendance.clock_out)
    
    def test_cannot_clock_in_twice(self):
        """Test that staff cannot clock in twice on same day"""
        today = timezone.now().date()
        
        # Create attendance with clock in
        Attendance.objects.create(
            staff=self.staff,
            date=today,
            clock_in=timezone.now(),
            status='present',
            owner=self.user,
            branch=self.branch
        )
        
        url = reverse('hr:attendance-clock-in')
        response = self.client.post(
            url,
            {'staff': self.staff.id},
            format='json'
        )
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TestPayrollAPI(TestCase):
    """Test payroll API endpoints"""
    
    def setUp(self):
        """Setup test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company')
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001"
        )
        
        # Create user. is_system_admin bypasses HasActionPermission's
        # fine-grained checks (see permissions.services.PermissionResolver.
        # _is_wildcard) — no Role is set up here to grant HR page access.
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
            is_system_admin=True,
        )

        # Create HR config
        self.hr_config = HRConfig.objects.create(
            branch=self.branch,
            owner=self.user,
            working_hours_per_day=Decimal('8.0'),
            tax_rate_percentage=Decimal('10.0'),
            overtime_multiplier=Decimal('1.5')
        )
        
        # Create staff. auto_create_staff_profile (hr/signals.py) already
        # created a stub Staff the moment self.user was saved above, so this
        # must update that row rather than create a second one — a plain
        # Staff.objects.create() here collides on the OneToOne user_id.
        self.staff, _ = Staff.objects.update_or_create(
            user=self.user,
            defaults=dict(
                first_name='John',
                last_name='Doe',
                department='IT',
                position='Developer',
                owner=self.user,
                branch=self.branch,
            ),
        )

        # Create salary components
        self.basic_salary = SalaryComponent.objects.create(
            name='Basic Salary',
            component_type='EARNING',
            default_amount=Decimal('100000.00'),
            owner=self.user,
            branch=self.branch
        )
        
        StaffPayInfo.objects.create(
            staff=self.staff,
            component=self.basic_salary,
            amount=Decimal('100000.00'),
            owner=self.user,
            branch=self.branch
        )
        
        today = timezone.now().date()
        
        self.payroll = Payroll.objects.create(
            reference_number='PAY001',
            period_start=today - timedelta(days=30),
            period_end=today,
            pay_date=today + timedelta(days=5),
            status='draft',
            owner=self.user,
            branch=self.branch
        )
        
        # Create API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
    
    def test_create_payroll(self):
        """Test creating a payroll"""
        today = timezone.now().date()
        
        data = {
            'period_start': str(today - timedelta(days=30)),
            'period_end': str(today),
            'pay_date': str(today + timedelta(days=5)),
            'notes': 'Monthly payroll'
        }
        
        url = reverse('hr:payroll-list')
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Payroll.objects.count(), 2)
    
    def test_calculate_payroll(self):
        """Test calculating payroll"""
        url = reverse('hr:payroll-calculate', kwargs={'pk': self.payroll.id})
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.payroll.refresh_from_db()
        self.assertEqual(self.payroll.status, 'calculated')
        self.assertGreater(Payslip.objects.filter(payroll=self.payroll).count(), 0)
    
    def test_approve_payroll(self):
        """Test approving payroll"""
        # Must actually run `calculate` first (not just force status to
        # 'calculated') so the payroll has real, non-zero totals — approving
        # a payroll that was never calculated leaves total_gross_pay etc. at
        # their 0.00 default, and the accounting service correctly refuses
        # to post a zero-amount GL entry ("Amount must be POSITIVE"). This
        # mirrors the real workflow, where Approve is only ever reachable
        # after Calculate.
        calculate_url = reverse('hr:payroll-calculate', kwargs={'pk': self.payroll.id})
        calc_response = self.client.post(calculate_url, {}, format='json')
        self.assertEqual(calc_response.status_code, status.HTTP_200_OK)

        url = reverse('hr:payroll-approve', kwargs={'pk': self.payroll.id})
        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.payroll.refresh_from_db()
        self.assertEqual(self.payroll.status, 'approved')

    def test_process_payroll_scopes_payment_account_to_payroll_branch(self):
        """Regression test: `process` must resolve payment_account against
        the payroll's own branch, not request.user.branch. Before the fix,
        an elevated user processing a run for a branch other than their
        home branch could have the account lookup silently scoped to their
        own branch instead of the run's — this reproduces exactly that
        shape and asserts it's now rejected."""
        other_branch = Branch.objects.create(name='Other Branch', code='OB001')

        # Lives in the user's own home branch (self.branch) — must NOT be
        # accepted for a payroll that belongs to a different branch, even
        # though the old `branch=request.user.branch` lookup would have
        # matched it.
        home_branch_account = Account.objects.create(
            name='Home Branch Cash',
            code='1011',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
        )

        self.payroll.branch = other_branch
        self.payroll.status = 'approved'
        self.payroll.save()

        url = reverse('hr:payroll-process', kwargs={'pk': self.payroll.id})
        response = self.client.post(
            url, {'payment_account_id': home_branch_account.id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Invalid payment account', str(response.data))

        # The matching account, scoped to the payroll's own branch, must be
        # accepted and handed through to the accounting service — proves
        # this isn't just rejecting every account. `mark_as_paid` is mocked
        # out here because posting the actual GL entries needs a full chart
        # of accounts (salary payable, etc.) that's out of scope for a test
        # of the account *lookup* fix specifically.
        correct_account = Account.objects.create(
            name='Other Branch Cash',
            code='1012',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=other_branch,
        )
        with patch(
            'hr.services.payroll_service.PayrollService.mark_as_paid',
            return_value=(self.payroll, None),
        ) as mock_mark_as_paid:
            response = self.client.post(
                url, {'payment_account_id': correct_account.id}, format='json'
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_mark_as_paid.assert_called_once()
        self.assertEqual(
            mock_mark_as_paid.call_args.kwargs['payment_account'].id,
            correct_account.id,
        )

    def test_delete_draft_payroll_succeeds(self):
        """draft payrolls have no accounting entries yet — safe to delete."""
        url = reverse('hr:payroll-detail', kwargs={'pk': self.payroll.id})
        response = self.client.delete(url)

        self.assertIn(
            response.status_code,
            (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK),
        )
        self.assertTrue(
            Payroll.all_objects.get(pk=self.payroll.id).is_deleted
        )

    def test_delete_calculated_payroll_cleans_up_payslips_and_bonus_links(self):
        """calculated payrolls have payslips (and possibly linked
        bonus/deduction requests) but still no GL postings — deleting must
        tear those down rather than leave them dangling."""
        calculate_url = reverse('hr:payroll-calculate', kwargs={'pk': self.payroll.id})
        self.client.post(calculate_url, {}, format='json')
        self.payroll.refresh_from_db()
        self.assertEqual(self.payroll.status, 'calculated')
        self.assertGreater(Payslip.objects.filter(payroll=self.payroll).count(), 0)

        bonus_request = BonusDeductionRequest.objects.create(
            reference_number='BDR-TEST-001',
            staff=self.staff,
            component=self.basic_salary,
            amount=Decimal('5000.00'),
            reason='Test bonus',
            for_month=self.payroll.period_start,
            applied_in_payroll=self.payroll,
            requested_by=self.user,
            owner=self.user,
            branch=self.branch,
        )

        url = reverse('hr:payroll-detail', kwargs={'pk': self.payroll.id})
        response = self.client.delete(url)

        self.assertIn(
            response.status_code,
            (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK),
        )
        self.assertEqual(Payslip.all_objects.filter(payroll=self.payroll).count(), 0)
        bonus_request.refresh_from_db()
        self.assertIsNone(bonus_request.applied_in_payroll)

    def test_delete_approved_payroll_rejected(self):
        """Approved/paid runs have posted GL journal entries — deleting the
        Payroll row would orphan those Transactions, so this must be
        rejected rather than silently corrupting the books."""
        self.payroll.status = 'approved'
        self.payroll.save()

        url = reverse('hr:payroll-detail', kwargs={'pk': self.payroll.id})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.payroll.refresh_from_db()
        self.assertFalse(self.payroll.is_deleted)
