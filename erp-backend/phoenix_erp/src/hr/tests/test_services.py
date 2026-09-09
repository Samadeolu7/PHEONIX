# hr/tests/test_services.py
"""
Tests for HR service layer
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

from hr.models import (
    Staff, LeaveType, LeaveBalance, LeaveRequest,
    Attendance, Payroll, Payslip, SalaryComponent, StaffPayInfo
)
from hr.config_models import HRConfig
from hr.services.payroll_service import PayrollService
from hr.services.leave_service import LeaveService
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


class TestPayrollService(TestCase):
    """Test payroll calculation service"""
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        This catches any double-entry accounting errors
        """
        from django.db.models import Sum
        from transactions.models import TransactionEntry
        from decimal import Decimal
        
        # Calculate total debits and credits across all transaction entries
        total_debits = TransactionEntry.objects.filter(
            side=TransactionEntry.DEBIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_credits = TransactionEntry.objects.filter(
            side=TransactionEntry.CREDIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Verify they match
        self.assertEqual(
            total_debits,
            total_credits,
            f"{error_message}: Debits={total_debits}, Credits={total_credits}, Difference={total_debits - total_credits}"
        )
    
    def setUp(self):
        """Setup test data"""
        # Create tenant. Required so the Staff row auto-created by
        # auto_create_staff_profile (hr/signals.py) below has a tenant —
        # LeaveService.initialize_leave_balances refuses to create a
        # balance for a tenant-less staff record.
        self.tenant = Tenant.objects.create(name='Test Company')

        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001"
        )

        # Create user
        self.user = User.objects.create_user(
            username='teststaff',
            email='staff@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
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
                tenant=self.tenant,
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
        
        # Create payroll
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
    
    def test_calculate_payroll(self):
        """Test payroll calculation"""
        service = PayrollService(self.payroll)
        service.calculate_payroll()
        
        self.payroll.refresh_from_db()
        
        self.assertEqual(self.payroll.status, 'calculated')
        self.assertGreater(self.payroll.total_gross_pay, 0)
        self.assertGreater(self.payroll.total_deductions, 0)
        self.assertGreater(self.payroll.total_net_pay, 0)
        
        # Check payslip created
        payslips = Payslip.objects.filter(payroll=self.payroll)
        self.assertGreater(payslips.count(), 0)
        
        payslip = payslips.first()
        self.assertEqual(payslip.staff, self.staff)
        self.assertEqual(payslip.gross_pay, Decimal('100000.00'))
    
    def test_approve_payroll(self):
        """Test payroll approval"""
        # Calculate first
        service = PayrollService(self.payroll)
        service.calculate_payroll()
        
        # Approve
        service.approve_payroll(approved_by=self.user)
        
        self.payroll.refresh_from_db()
        self.assertEqual(self.payroll.status, 'approved')
    
    def test_mark_as_paid(self):
        """Test marking payroll as paid"""
        # Calculate and approve first
        service = PayrollService(self.payroll)
        service.calculate_payroll()
        service.approve_payroll(approved_by=self.user)
        
        # Mark as paid
        service.mark_as_paid(processed_by=self.user)
        
        self.payroll.refresh_from_db()
        self.assertEqual(self.payroll.status, 'paid')
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after marking payroll as paid")


class TestLeaveService(TestCase):
    """Test leave management service"""
    
    def setUp(self):
        """Setup test data"""
        # Create tenant. Required so the Staff row auto-created by
        # auto_create_staff_profile (hr/signals.py) below has a tenant —
        # LeaveService.initialize_leave_balances refuses to create a
        # balance for a tenant-less staff record.
        self.tenant = Tenant.objects.create(name='Test Company')

        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MB001"
        )

        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='user@test.com',
            password='testpass123',
            tenant=self.tenant,
            branch=self.branch,
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
                tenant=self.tenant,
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
        
        # Create leave request
        today = timezone.now().date()
        self.leave_request = LeaveRequest.objects.create(
            reference_number='LV001',
            staff=self.staff,
            leave_type=self.leave_type,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=9),
            num_days=Decimal('3.0'),
            reason='Family vacation',
            status='draft',
            owner=self.user,
            branch=self.branch
        )
    
    def test_validate_leave_request(self):
        """Test leave request validation"""
        service = LeaveService(self.leave_request)
        result = service.validate_leave_request()
        
        self.assertTrue(result['is_valid'])
        self.assertEqual(len(result['errors']), 0)
    
    def test_validate_insufficient_balance(self):
        """Test validation fails when insufficient leave balance"""
        # Reduce available balance
        self.leave_balance.used_days = Decimal('18.0')
        self.leave_balance.save()
        
        service = LeaveService(self.leave_request)
        result = service.validate_leave_request()
        
        self.assertFalse(result['is_valid'])
        self.assertGreater(len(result['errors']), 0)
    
    def test_submit_leave_request(self):
        """Test submitting leave request"""
        service = LeaveService(self.leave_request)
        result = service.submit_leave_request()
        
        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        
        self.assertTrue(result['success'])
        self.assertEqual(self.leave_request.status, 'submitted')
        self.assertEqual(self.leave_balance.pending_days, Decimal('3.0'))
    
    def test_approve_leave_request(self):
        """Test approving leave request"""
        # Submit first
        service = LeaveService(self.leave_request)
        service.submit_leave_request()
        
        # Approve
        service.approve_leave_request(approved_by=self.user, notes='Approved')
        
        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        
        self.assertEqual(self.leave_request.status, 'approved')
        self.assertEqual(self.leave_balance.used_days, Decimal('3.0'))
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))
    
    def test_reject_leave_request(self):
        """Test rejecting leave request"""
        # Submit first
        service = LeaveService(self.leave_request)
        service.submit_leave_request()
        
        # Reject
        service.reject_leave_request(rejected_by=self.user, reason='Insufficient notice')
        
        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        
        self.assertEqual(self.leave_request.status, 'rejected')
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))
        self.assertEqual(self.leave_balance.used_days, Decimal('0.0'))
    
    def test_cancel_approved_leave_request_restores_used_days(self):
        """Cancelling an approved request must give back the used days it
        consumed on approval, not leave the balance permanently reduced."""
        service = LeaveService(self.leave_request)
        service.submit_leave_request()
        service.approve_leave_request(approved_by=self.user)

        self.leave_balance.refresh_from_db()
        self.assertEqual(self.leave_balance.used_days, Decimal('3.0'))

        service.cancel_leave_request(cancelled_by=self.user)

        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        self.assertEqual(self.leave_request.status, 'cancelled')
        self.assertEqual(self.leave_balance.used_days, Decimal('0.0'))

    def test_cancel_submitted_leave_request_restores_pending_days(self):
        """Cancelling a submitted (not yet approved) request must release
        the pending days it reserved."""
        service = LeaveService(self.leave_request)
        service.submit_leave_request()

        self.leave_balance.refresh_from_db()
        self.assertEqual(self.leave_balance.pending_days, Decimal('3.0'))

        service.cancel_leave_request(cancelled_by=self.user)

        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        self.assertEqual(self.leave_request.status, 'cancelled')
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))

    def test_cancel_draft_leave_request(self):
        """A draft (never submitted) request can be cancelled with no
        balance side effects, since submit is what reserves pending_days."""
        service = LeaveService(self.leave_request)
        service.cancel_leave_request(cancelled_by=self.user)

        self.leave_request.refresh_from_db()
        self.leave_balance.refresh_from_db()
        self.assertEqual(self.leave_request.status, 'cancelled')
        self.assertEqual(self.leave_balance.pending_days, Decimal('0.0'))
        self.assertEqual(self.leave_balance.used_days, Decimal('0.0'))

    def test_cannot_cancel_rejected_leave_request(self):
        service = LeaveService(self.leave_request)
        service.submit_leave_request()
        service.reject_leave_request(rejected_by=self.user, reason='No')

        with self.assertRaises(Exception):
            service.cancel_leave_request(cancelled_by=self.user)

    def test_initialize_leave_balances_computes_carryover(self):
        """A leave type with allow_carryover=True must roll unused days
        from the prior year's balance into the new year's balance, capped
        at max_carryover_days."""
        self.leave_type.allow_carryover = True
        self.leave_type.max_carryover_days = 5
        self.leave_type.save()

        prior_year = timezone.now().year - 1
        # 20 entitled, 15 used -> 5 available to carry over, exactly at cap
        LeaveBalance.objects.filter(
            staff=self.staff, leave_type=self.leave_type, year=timezone.now().year
        ).delete()
        LeaveBalance.objects.create(
            staff=self.staff,
            leave_type=self.leave_type,
            year=prior_year,
            entitled_days=Decimal('20.0'),
            used_days=Decimal('15.0'),
            owner=self.user,
            branch=self.branch
        )

        current_year = timezone.now().year
        balances = LeaveService.initialize_leave_balances(self.staff, current_year)

        balance = next(b for b in balances if b.leave_type_id == self.leave_type.id)
        self.assertEqual(balance.carried_over_days, Decimal('5.00'))

    def test_initialize_leave_balances_carryover_capped_at_max(self):
        """Unused days beyond max_carryover_days must not all roll over."""
        self.leave_type.allow_carryover = True
        self.leave_type.max_carryover_days = 3
        self.leave_type.save()

        prior_year = timezone.now().year - 1
        LeaveBalance.objects.filter(
            staff=self.staff, leave_type=self.leave_type, year=timezone.now().year
        ).delete()
        # 20 entitled, 5 used -> 15 available, but cap is 3
        LeaveBalance.objects.create(
            staff=self.staff,
            leave_type=self.leave_type,
            year=prior_year,
            entitled_days=Decimal('20.0'),
            used_days=Decimal('5.0'),
            owner=self.user,
            branch=self.branch
        )

        current_year = timezone.now().year
        balances = LeaveService.initialize_leave_balances(self.staff, current_year)

        balance = next(b for b in balances if b.leave_type_id == self.leave_type.id)
        self.assertEqual(balance.carried_over_days, Decimal('3.00'))

    def test_initialize_leave_balances_no_carryover_when_disallowed(self):
        """allow_carryover=False must never roll days over, even if a prior
        year balance with unused days exists."""
        prior_year = timezone.now().year - 1
        LeaveBalance.objects.filter(
            staff=self.staff, leave_type=self.leave_type, year=timezone.now().year
        ).delete()
        LeaveBalance.objects.create(
            staff=self.staff,
            leave_type=self.leave_type,
            year=prior_year,
            entitled_days=Decimal('20.0'),
            used_days=Decimal('5.0'),
            owner=self.user,
            branch=self.branch
        )

        current_year = timezone.now().year
        balances = LeaveService.initialize_leave_balances(self.staff, current_year)

        balance = next(b for b in balances if b.leave_type_id == self.leave_type.id)
        self.assertEqual(balance.carried_over_days, Decimal('0.00'))

    def test_initialize_leave_balances(self):
        """Test initializing leave balances for staff"""
        # Create another leave type
        sick_leave = LeaveType.objects.create(
            name='Sick Leave',
            code='SICK',
            is_paid=True,
            requires_approval=False,
            default_days_per_year=10,
            owner=self.user,
            branch=self.branch
        )
        
        # Delete existing balances
        LeaveBalance.objects.filter(staff=self.staff).delete()
        
        # Initialize
        current_year = timezone.now().year
        LeaveService.initialize_leave_balances(self.staff, current_year)
        
        balances = LeaveBalance.objects.filter(staff=self.staff, year=current_year)
        
        self.assertGreater(balances.count(), 0)  # Should have created balances for all leave types
        
        for balance in balances:
            self.assertEqual(balance.entitled_days, balance.leave_type.default_days_per_year)
            self.assertEqual(balance.used_days, Decimal('0.0'))
            self.assertEqual(balance.pending_days, Decimal('0.0'))
