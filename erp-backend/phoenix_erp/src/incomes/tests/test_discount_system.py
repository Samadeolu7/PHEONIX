# incomes/tests/test_discount_system.py
"""
Comprehensive tests for Discount & Scholarship System
Tests models, services, serializers, and API endpoints
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import transaction as db_transaction
from django.contrib.contenttypes.models import ContentType
from decimal import Decimal
from datetime import date, timedelta
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from receivables.models import CustomerReceivable
from transactions.models import Transaction, TransactionEntry
from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from incomes.services.discount_service import DiscountService
from users.models import Tenant

User = get_user_model()


class DiscountSystemTestCase(TestCase):
    """Base test case with common setup for discount system tests"""
    
    @classmethod
    def setUpTestData(cls):
        """Set up test data once for all tests"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        cls.tenant = Tenant.objects.create(name='Test Org', slug='testorg')
        set_current_tenant(cls.tenant)
        
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=cls.tenant
        )
        cls.branch = Branch.objects.create(
            owner=cls.user,
            name='Test Branch',
            code='TB01',
            tenant=cls.tenant
        )
        cls.user.branch = cls.branch
        cls.user.save()
        
    def setUp(self):
        """Set up fresh data for each test"""
        # Create accounts (parent-level to avoid hierarchy validation)
        self.ar_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='140', name='Accounts Receivable', account_type='current_asset',
            account_level=Account.LEVEL_PARENT
        )
        self.scholarship_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='520', name='Scholarships & Financial Aid', account_type='contra_revenue',
            account_level=Account.LEVEL_PARENT
        )
        self.staff_benefit_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='6010', name='Staff Benefits Expense', account_type='expense',
            account_level=Account.LEVEL_PARENT
        )
        self.revenue_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='5010', name='Tuition Revenue', account_type='revenue',
            account_level=Account.LEVEL_PARENT
        )
        
        # Create client
        self.client = Client.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            first_name='John', last_name='Doe', email='john@example.com', 
            phone_primary='1234567890', gender='male'
        )
        
        # Create receivable (using Client as generic content_object since we don't have actual Invoice/Fee)
        self.receivable = CustomerReceivable.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            client=self.client,
            content_type=ContentType.objects.get_for_model(Client),
            object_id=self.client.id,
            receivable_type='other',
            reference_number='TEST-001',
            original_amount=Decimal('500000.00'),
            balance=Decimal('500000.00'),
            due_date=date.today() + timedelta(days=30),
            status='pending'
        )


class DiscountProgramModelTests(DiscountSystemTestCase):
    """Tests for DiscountProgram model"""
    
    def test_create_percentage_scholarship_program(self):
        """Test creating a percentage-based scholarship program"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            max_recipients=50,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365),
            discount_account=self.scholarship_account
        )
        
        self.assertEqual(program.name, 'Merit Scholarship')
        self.assertEqual(program.program_type, 'scholarship')
        self.assertEqual(program.discount_type, 'percentage')
        self.assertEqual(program.discount_value, Decimal('80.00'))
        self.assertTrue(program.program_code)  # Auto-generated
        
    def test_create_fixed_amount_discount_program(self):
        """Test creating a fixed amount discount program"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Early Payment Discount',
            program_type='discount',
            discount_type='fixed_amount',
            discount_value=Decimal('50000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertEqual(program.discount_type, 'fixed_amount')
        self.assertEqual(program.discount_value, Decimal('50000.00'))
        
    def test_create_full_waiver_program(self):
        """Test creating a full waiver program"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Staff Children Waiver',
            program_type='staff_benefit',
            discount_type='full_waiver',
            discount_value=Decimal('0.00'),  # Not used for full waiver but required by model
            start_date=date.today(),
            discount_account=self.staff_benefit_account
        )
        
        self.assertEqual(program.discount_type, 'full_waiver')
        
    def test_budget_remaining_calculation(self):
        """Test budget_remaining property"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            budget_allocated=Decimal('1000000.00'),
            budget_used=Decimal('300000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertEqual(program.budget_remaining, Decimal('700000.00'))
        
    def test_budget_utilization_percent_calculation(self):
        """Test budget_utilization_percent property"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            budget_allocated=Decimal('1000000.00'),
            budget_used=Decimal('300000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertEqual(program.budget_utilization_percent, Decimal('30.00'))
        
    def test_is_within_budget_true(self):
        """Test is_within_budget when budget available"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            budget_allocated=Decimal('1000000.00'),
            budget_used=Decimal('500000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertTrue(program.is_within_budget)
        
    def test_is_within_budget_false(self):
        """Test is_within_budget when budget exceeded"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            budget_allocated=Decimal('1000000.00'),
            budget_used=Decimal('1000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertFalse(program.is_within_budget)
        
    def test_has_recipient_capacity_true(self):
        """Test has_recipient_capacity when slots available"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            max_recipients=50,
            current_recipients=30,
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertTrue(program.has_recipient_capacity)
        
    def test_has_recipient_capacity_false(self):
        """Test has_recipient_capacity when slots full"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            max_recipients=50,
            current_recipients=50,
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertFalse(program.has_recipient_capacity)
        
    def test_is_valid_when_active_and_within_dates(self):
        """Test is_valid property when active and within date range"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            is_active=True,
            start_date=date.today() - timedelta(days=10),
            end_date=date.today() + timedelta(days=10),
            discount_account=self.scholarship_account
        )
        
        self.assertTrue(program.is_valid)
        
    def test_is_valid_false_when_inactive(self):
        """Test is_valid property when inactive"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            is_active=False,
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        self.assertFalse(program.is_valid)
        
    def test_is_valid_false_when_expired(self):
        """Test is_valid property when expired"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            is_active=True,
            start_date=date.today() - timedelta(days=365),
            end_date=date.today() - timedelta(days=1),
            discount_account=self.scholarship_account
        )
        
        self.assertFalse(program.is_valid)


class DiscountApplicationModelTests(DiscountSystemTestCase):
    """Tests for DiscountApplication model"""
    
    def setUp(self):
        super().setUp()
        self.program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            max_recipients=50,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365),
            discount_account=self.scholarship_account
        )
        
    def test_create_application(self):
        """Test creating a discount application"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Excellent academic performance'
        )
        
        self.assertEqual(application.program, self.program)
        self.assertEqual(application.client, self.client)
        self.assertEqual(application.status, 'draft')
        self.assertTrue(application.application_number)  # Auto-generated
        
    def test_application_number_auto_generation(self):
        """Test application_number is auto-generated"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        
        self.assertTrue(application.application_number.startswith('APP-'))
        
    def test_submit_draft_application(self):
        """Test submitting a draft application"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        
        application.submit()
        
        self.assertEqual(application.status, 'submitted')
        
    def test_approve_application(self):
        """Test approving an application"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        
        application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved for merit'
        )
        
        self.assertEqual(application.status, 'approved')
        self.assertEqual(application.reviewed_by, self.user)
        self.assertIsNotNone(application.review_date)
        self.assertEqual(application.effective_from, date.today())
        
    def test_reject_application(self):
        """Test rejecting an application"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        
        application.reject(
            rejected_by=self.user,
            notes='Does not meet GPA requirement'
        )
        
        self.assertEqual(application.status, 'rejected')
        self.assertEqual(application.reviewed_by, self.user)
        
    def test_revoke_approved_application(self):
        """Test revoking an approved application"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved'
        )
        
        application.revoke(
            revoked_by=self.user,
            notes='Failed courses'
        )
        
        self.assertEqual(application.status, 'revoked')
        
    def test_actual_discount_value_without_custom(self):
        """Test actual_discount_value uses program value"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        
        self.assertEqual(application.actual_discount_value, Decimal('80.00'))
        
    def test_actual_discount_value_with_custom(self):
        """Test actual_discount_value uses custom value"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test',
            custom_discount_value=Decimal('60.00')
        )
        
        self.assertEqual(application.actual_discount_value, Decimal('60.00'))
        
    def test_is_active_true(self):
        """Test is_active when within effective dates"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(
            approved_by=self.user,
            effective_from=date.today() - timedelta(days=10),
            effective_to=date.today() + timedelta(days=10),
            notes='Approved'
        )
        
        self.assertTrue(application.is_active)
        
    def test_is_active_false_when_not_approved(self):
        """Test is_active false when not approved"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        
        self.assertFalse(application.is_active)
        
    def test_is_active_false_when_expired(self):
        """Test is_active false when expired"""
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(
            approved_by=self.user,
            effective_from=date.today() - timedelta(days=365),
            effective_to=date.today() - timedelta(days=1),
            notes='Approved'
        )
        
        self.assertFalse(application.is_active)


class AppliedDiscountModelTests(DiscountSystemTestCase):
    """Tests for AppliedDiscount model"""
    
    def setUp(self):
        super().setUp()
        self.program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        self.application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        self.application.submit()
        self.application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved'
        )
    
    def test_create_applied_discount(self):
        """Test creating an applied discount"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00')
        )
        
        self.assertEqual(applied_discount.application, self.application)
        self.assertEqual(applied_discount.receivable, self.receivable)
        self.assertEqual(applied_discount.discount_amount, Decimal('400000.00'))
        self.assertFalse(applied_discount.is_posted)
        
    def test_can_be_posted_true(self):
        """Test can_be_posted when not yet posted"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00')
        )
        
        self.assertTrue(applied_discount.can_be_posted)
        
    def test_can_be_posted_false_when_already_posted(self):
        """Test can_be_posted false when already posted"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00'),
            is_posted=True
        )
        
        self.assertFalse(applied_discount.can_be_posted)
        
    def test_can_be_reversed_true(self):
        """Test can_be_reversed when posted but not reversed"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00'),
            is_posted=True
        )
        
        self.assertTrue(applied_discount.can_be_reversed)
        
    def test_can_be_reversed_false_when_not_posted(self):
        """Test can_be_reversed false when not posted"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00')
        )
        
        self.assertFalse(applied_discount.can_be_reversed)
        
    def test_can_be_reversed_false_when_already_reversed(self):
        """Test can_be_reversed false when already reversed"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00'),
            is_posted=True,
            is_reversed=True
        )
        
        self.assertFalse(applied_discount.can_be_reversed)


class DiscountServiceTests(DiscountSystemTestCase):
    """Tests for DiscountService business logic"""
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        This catches any double-entry accounting errors
        """
        from django.db.models import Sum
        
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
        super().setUp()
        self.program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            max_recipients=50,
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        self.application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        self.application.submit()
        self.application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved'
        )
    
    def test_calculate_discount_amount_percentage(self):
        """Test calculating percentage discount"""
        amount = DiscountService.calculate_discount_amount(
            program=self.program,
            application=self.application,
            receivable=self.receivable
        )
        
        # 80% of 500,000 = 400,000
        self.assertEqual(amount, Decimal('400000.00'))
        
    def test_calculate_discount_amount_fixed(self):
        """Test calculating fixed amount discount"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Fixed Discount',
            program_type='discount',
            discount_type='fixed_amount',
            discount_value=Decimal('50000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(approved_by=self.user, effective_from=date.today(), effective_to=date.today() + timedelta(days=365), notes='Approved')
        
        amount = DiscountService.calculate_discount_amount(
            program=program,
            application=application,
            receivable=self.receivable
        )
        
        self.assertEqual(amount, Decimal('50000.00'))
        
    def test_calculate_discount_amount_full_waiver(self):
        """Test calculating full waiver discount"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Full Waiver',
            program_type='waiver',
            discount_type='full_waiver',
            discount_value=Decimal('0.00'),  # Not used for full waiver but required by model
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(approved_by=self.user, effective_from=date.today(), effective_to=date.today() + timedelta(days=365), notes='Approved')
        
        amount = DiscountService.calculate_discount_amount(
            program=program,
            application=application,
            receivable=self.receivable
        )
        
        self.assertEqual(amount, Decimal('500000.00'))
        
    def test_apply_discount_to_receivable_success(self):
        """Test successfully applying discount to receivable"""
        with db_transaction.atomic():
            applied_discount = DiscountService.apply_discount_to_receivable(
                application=self.application,
                receivable=self.receivable,
                user=self.user
            )
        
        self.assertIsNotNone(applied_discount)
        self.assertEqual(applied_discount.discount_amount, Decimal('400000.00'))
        self.assertTrue(applied_discount.is_posted)
        self.assertIsNotNone(applied_discount.journal_entry)
        
        # Check receivable balance updated
        self.receivable.refresh_from_db()
        self.assertEqual(self.receivable.balance, Decimal('100000.00'))
        
        # Check program budget updated
        self.program.refresh_from_db()
        self.assertEqual(self.program.budget_used, Decimal('400000.00'))
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after applying discount to receivable")
        
    def test_apply_discount_fails_when_not_approved(self):
        """Test applying discount fails when application not approved"""
        unapproved_app = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=self.program,
            client=self.client,
            reason='Test'
        )
        
        with self.assertRaises(ValidationError):
            DiscountService.apply_discount_to_receivable(
                application=unapproved_app,
                receivable=self.receivable,
                user=self.user
            )
            
    def test_apply_discount_fails_when_budget_exceeded(self):
        """Test applying discount fails when budget exceeded"""
        self.program.budget_used = Decimal('4900000.00')
        self.program.save()
        
        with self.assertRaises(ValidationError) as cm:
            with db_transaction.atomic():
                DiscountService.apply_discount_to_receivable(
                    application=self.application,
                    receivable=self.receivable,
                    user=self.user
                )
        
        self.assertIn('budget', str(cm.exception).lower())
        
    def test_create_discount_journal_entry(self):
        """Test creating journal entry for discount"""
        applied_discount = AppliedDiscount.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            application=self.application,
            receivable=self.receivable,
            discount_amount=Decimal('400000.00')
        )
        
        with db_transaction.atomic():
            journal_entry = DiscountService.create_discount_journal_entry(
                applied_discount=applied_discount,
                user=self.user
            )
        
        self.assertIsNotNone(journal_entry)
        self.assertIsNotNone(journal_entry.series)
        self.assertEqual(journal_entry.series.code, 'DSC')
        
        # Check entries
        entries = journal_entry.entries.all()
        self.assertEqual(entries.count(), 2)
        
        debit_entry = entries.filter(side=TransactionEntry.DEBIT).first()
        credit_entry = entries.filter(side=TransactionEntry.CREDIT).first()
        
        self.assertEqual(debit_entry.account, self.scholarship_account)
        self.assertEqual(debit_entry.amount, Decimal('400000.00'))
        self.assertEqual(credit_entry.account, self.ar_account)
        self.assertEqual(credit_entry.amount, Decimal('400000.00'))
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after discount journal entry")
        
    def test_create_reversal_journal_entry(self):
        """Test creating reversal journal entry"""
        # First apply discount
        with db_transaction.atomic():
            applied_discount = DiscountService.apply_discount_to_receivable(
                application=self.application,
                receivable=self.receivable,
                user=self.user
            )
        
        # Now reverse it
        with db_transaction.atomic():
            reversal_entry = DiscountService.create_reversal_journal_entry(
                applied_discount=applied_discount,
                user=self.user,
                reason='Student failed courses'
            )
        
        self.assertIsNotNone(reversal_entry)
        self.assertTrue(reversal_entry.is_reversal)
        self.assertEqual(reversal_entry.reverses_transaction, applied_discount.journal_entry)
        
        # Check entries (opposite of original)
        entries = reversal_entry.entries.all()
        self.assertEqual(entries.count(), 2)
        
        debit_entry = entries.filter(side=TransactionEntry.DEBIT).first()
        credit_entry = entries.filter(side=TransactionEntry.CREDIT).first()
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after reversal journal entry")
        
        self.assertEqual(debit_entry.account, self.ar_account)  # Restore AR
        self.assertEqual(credit_entry.account, self.scholarship_account)  # Reverse discount
        
    def test_get_client_discount_summary(self):
        """Test getting discount summary for a client"""
        # Apply a discount first
        with db_transaction.atomic():
            DiscountService.apply_discount_to_receivable(
                application=self.application,
                receivable=self.receivable,
                user=self.user
            )
        
        summary = DiscountService.get_client_discount_summary(self.client)
        
        self.assertEqual(summary['total_applications'], 1)
        self.assertEqual(summary['approved_applications'], 1)
        self.assertEqual(summary['total_discounts_received'], Decimal('400000.00'))
        self.assertEqual(summary['discounts_count'], 1)
        
    def test_get_program_statistics(self):
        """Test getting program statistics"""
        # Apply a discount first
        with db_transaction.atomic():
            DiscountService.apply_discount_to_receivable(
                application=self.application,
                receivable=self.receivable,
                user=self.user
            )
        
        stats = DiscountService.get_program_statistics(self.program)
        
        self.assertEqual(stats['program_name'], 'Merit Scholarship')
        self.assertEqual(stats['budget_allocated'], Decimal('5000000.00'))
        self.assertEqual(stats['budget_used'], Decimal('400000.00'))
        self.assertEqual(stats['applications']['total'], 1)
        self.assertEqual(stats['applications']['approved'], 1)
        self.assertEqual(stats['discounts']['total_count'], 1)
        self.assertEqual(stats['discounts']['total_amount'], Decimal('400000.00'))


class DiscountAPITests(APITestCase):
    """Tests for Discount System API endpoints"""
    
    def setUp(self):
        """Set up test data"""
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testcompany')
        set_current_tenant(self.tenant)
        
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        self.branch = Branch.objects.create(
            owner=self.user,
            name='Test Branch',
            code='TB01',
            tenant=self.tenant
        )
        self.user.branch = self.branch
        self.user.save()
        
        # Authenticate
        self.client.force_authenticate(user=self.user)
        
        # Create accounts with proper account_level
        self.ar_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='140', name='Accounts Receivable', account_type='current_asset',
            account_level=Account.LEVEL_PARENT
        )
        self.scholarship_account = Account.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            code='520', name='Scholarships & Financial Aid', account_type='contra_revenue',
            account_level=Account.LEVEL_PARENT
        )
        
        # Create client
        self.test_client = Client.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            first_name='John', last_name='Doe', email='john@example.com',
            phone_primary='1234567890', gender='male'
        )
        
        # Create receivable (using Client as generic content_object since we don't have actual Invoice/Fee)
        self.receivable = CustomerReceivable.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            client=self.test_client,
            content_type=ContentType.objects.get_for_model(Client),
            object_id=self.test_client.id,
            receivable_type='other',
            reference_number='TEST-002',
            original_amount=Decimal('500000.00'),
            balance=Decimal('500000.00'),
            due_date=date.today() + timedelta(days=30),
            status='pending'
        )
        
    def test_create_discount_program(self):
        """Test creating discount program via API"""
        url = '/api/incomes/discount-programs/'
        data = {
            'name': 'Merit Scholarship 2026',
            'program_type': 'scholarship',
            'discount_type': 'percentage',
            'discount_value': '80.00',
            'budget_allocated': '5000000.00',
            'max_recipients': 50,
            'start_date': date.today().isoformat(),
            'end_date': (date.today() + timedelta(days=365)).isoformat(),
            'is_active': True,
            'discount_account': self.scholarship_account.id
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Merit Scholarship 2026')
        self.assertTrue(response.data['program_code'])
        
    def test_list_discount_programs(self):
        """Test listing discount programs"""
        DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        url = '/api/incomes/discount-programs/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data['results']), 0)
        
    def test_filter_programs_by_type(self):
        """Test filtering programs by program_type"""
        DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Discount',
            program_type='discount',
            discount_type='percentage',
            discount_value=Decimal('10.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        url = '/api/incomes/discount-programs/?program_type=scholarship'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['program_type'], 'scholarship')
        
    def test_create_discount_application(self):
        """Test creating discount application via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        url = '/api/incomes/discount-applications/'
        data = {
            'program': program.id,
            'client': self.test_client.id,
            'reason': 'Excellent academic performance'
        }
        
        response = self.client.post(url, data, format='json')
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Create Application API Error: {response.status_code} - {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'draft')
        self.assertTrue(response.data['application_number'])
        
    def test_submit_application(self):
        """Test submitting application via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.test_client,
            reason='Test'
        )
        
        url = f'/api/incomes/discount-applications/{application.id}/submit/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'submitted')
        
    def test_approve_application(self):
        """Test approving application via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.test_client,
            reason='Test'
        )
        application.submit()
        
        url = f'/api/incomes/discount-applications/{application.id}/approve/'
        data = {
            'effective_from': date.today().isoformat(),
            'effective_to': (date.today() + timedelta(days=365)).isoformat(),
            'review_notes': 'Approved for merit'
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'approved')
        
    def test_apply_discount_to_receivable(self):
        """Test applying discount to receivable via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.test_client,
            reason='Test'
        )
        application.submit()
        application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved'
        )
        
        url = '/api/incomes/applied-discounts/apply/'
        data = {
            'application_id': application.id,
            'receivable_id': self.receivable.id
        }
        
        response = self.client.post(url, data, format='json')
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Apply Discount API Error: {response.status_code} - {response.data}")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['discount_amount'], '400000.00')
        self.assertTrue(response.data['is_posted'])
        
    def test_reverse_applied_discount(self):
        """Test reversing applied discount via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.test_client,
            reason='Test'
        )
        application.submit()
        application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved'
        )
        
        with db_transaction.atomic():
            applied_discount = DiscountService.apply_discount_to_receivable(
                application=application,
                receivable=self.receivable,
                user=self.user
            )
        
        url = f'/api/incomes/applied-discounts/{applied_discount.id}/reverse/'
        data = {
            'reason': 'Student failed courses'
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_reversed'])
        
    def test_get_client_discount_summary(self):
        """Test getting client discount summary via API"""
        url = '/api/incomes/applied-discounts/client_summary/'
        data = {
            'client_id': self.test_client.id
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_applications', response.data)
        self.assertIn('total_discounts_received', response.data)
        
    def test_get_program_eligibility(self):
        """Test getting program eligibility via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            start_date=date.today(),
            is_active=True,
            discount_account=self.scholarship_account
        )
        
        url = f'/api/incomes/discount-programs/{program.id}/eligibility/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('can_accept_applications', response.data)
        self.assertIn('is_active', response.data)
        
    def test_get_program_budget(self):
        """Test getting program budget via API"""
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Test Program',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        url = f'/api/incomes/discount-programs/{program.id}/budget/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('budget_allocated', response.data)
        self.assertIn('budget_remaining', response.data)
        self.assertIn('budget_utilization_percent', response.data)


class DiscountIntegrationTests(DiscountSystemTestCase):
    """Integration tests for complete discount workflows"""
    
    def test_complete_scholarship_lifecycle(self):
        """Test complete scholarship workflow from creation to application"""
        # Step 1: Create program
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship 2026',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            max_recipients=50,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365),
            is_active=True,
            discount_account=self.scholarship_account
        )
        
        # Step 2: Student applies
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.client,
            reason='Excellent academic performance with 3.8 GPA'
        )
        self.assertEqual(application.status, 'draft')
        
        # Step 3: Student submits
        application.submit()
        self.assertEqual(application.status, 'submitted')
        
        # Step 4: Admin approves
        application.approve(
            approved_by=self.user,
            effective_from=date.today(),
            effective_to=date.today() + timedelta(days=365),
            notes='Approved for academic excellence'
        )
        self.assertEqual(application.status, 'approved')
        
        # Step 5: Apply to receivable
        initial_balance = self.receivable.balance
        
        with db_transaction.atomic():
            applied_discount = DiscountService.apply_discount_to_receivable(
                application=application,
                receivable=self.receivable,
                user=self.user
            )
        
        # Verify discount applied
        self.assertEqual(applied_discount.discount_amount, Decimal('400000.00'))
        self.assertTrue(applied_discount.is_posted)
        
        # Verify receivable reduced
        self.receivable.refresh_from_db()
        self.assertEqual(
            self.receivable.balance,
            initial_balance - Decimal('400000.00')
        )
        
        # Verify program budget updated
        program.refresh_from_db()
        self.assertEqual(program.budget_used, Decimal('400000.00'))
        
        # Verify journal entry created
        self.assertIsNotNone(applied_discount.journal_entry)
        entries = applied_discount.journal_entry.entries.all()
        self.assertEqual(entries.count(), 2)
        
    def test_discount_reversal_workflow(self):
        """Test reversing a discount when student loses scholarship"""
        # Setup: Apply discount first
        program = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('80.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        application = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program,
            client=self.client,
            reason='Test'
        )
        application.submit()
        application.approve(approved_by=self.user, effective_from=date.today(), effective_to=date.today() + timedelta(days=365), notes='Approved')
        
        with db_transaction.atomic():
            applied_discount = DiscountService.apply_discount_to_receivable(
                application=application,
                receivable=self.receivable,
                user=self.user
            )
        
        # Record state before reversal
        balance_before_reversal = self.receivable.balance
        budget_before_reversal = program.budget_used
        
        # Reverse the discount
        with db_transaction.atomic():
            applied_discount.reverse(
                user=self.user,
                reason='Student GPA dropped below 3.0'
            )
        
        # Verify reversal
        applied_discount.refresh_from_db()
        self.assertTrue(applied_discount.is_reversed)
        self.assertIsNotNone(applied_discount.reversal_entry)
        
        # Verify receivable restored
        self.receivable.refresh_from_db()
        self.assertEqual(
            self.receivable.balance,
            balance_before_reversal + Decimal('400000.00')
        )
        
        # Verify budget restored
        program.refresh_from_db()
        self.assertEqual(
            program.budget_used,
            budget_before_reversal - Decimal('400000.00')
        )
        
    def test_multiple_discounts_same_client(self):
        """Test applying multiple discounts to same client"""
        # Create two programs
        program1 = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Merit Scholarship',
            program_type='scholarship',
            discount_type='percentage',
            discount_value=Decimal('50.00'),
            budget_allocated=Decimal('5000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        program2 = DiscountProgram.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            name='Book Allowance',
            program_type='discount',
            discount_type='fixed_amount',
            discount_value=Decimal('50000.00'),
            budget_allocated=Decimal('1000000.00'),
            start_date=date.today(),
            discount_account=self.scholarship_account
        )
        
        # Create second receivable
        receivable2 = CustomerReceivable.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            client=self.client,
            content_type=ContentType.objects.get_for_model(Client),
            object_id=self.client.id,
            receivable_type='other',
            reference_number='TEST-003',
            original_amount=Decimal('100000.00'),
            balance=Decimal('100000.00'),
            due_date=date.today() + timedelta(days=30),
            status='pending'
        )
        
        # Apply both discounts
        application1 = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program1, client=self.client, reason='Test'
        )
        application1.submit()
        application1.approve(approved_by=self.user, effective_from=date.today(), effective_to=date.today() + timedelta(days=365), notes='Approved')
        
        application2 = DiscountApplication.objects.create(
            owner=self.user, branch=self.branch, created_by=self.user,
            program=program2, client=self.client, reason='Test'
        )
        application2.submit()
        application2.approve(approved_by=self.user, effective_from=date.today(), effective_to=date.today() + timedelta(days=365), notes='Approved')
        
        with db_transaction.atomic():
            discount1 = DiscountService.apply_discount_to_receivable(
                application=application1,
                receivable=self.receivable,
                user=self.user
            )
        
        with db_transaction.atomic():
            discount2 = DiscountService.apply_discount_to_receivable(
                application=application2,
                receivable=receivable2,
                user=self.user
            )
        
        # Verify both applied
        self.assertEqual(discount1.discount_amount, Decimal('250000.00'))
        self.assertEqual(discount2.discount_amount, Decimal('50000.00'))
        
        # Verify client summary
        summary = DiscountService.get_client_discount_summary(self.client)
        self.assertEqual(summary['total_applications'], 2)
        self.assertEqual(summary['approved_applications'], 2)
        self.assertEqual(summary['total_discounts_received'], Decimal('300000.00'))


# Make tests discoverable
__all__ = [
    'DiscountProgramModelTests',
    'DiscountApplicationModelTests',
    'AppliedDiscountModelTests',
    'DiscountServiceTests',
    'DiscountAPITests',
    'DiscountIntegrationTests',
]
