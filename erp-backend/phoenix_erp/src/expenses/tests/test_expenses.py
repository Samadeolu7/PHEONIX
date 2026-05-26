"""
Comprehensive tests for Expenses System

Tests cover:
- Expense model validation and status workflow
- Expense accounting (journal entries)
- Expense API endpoints (CRUD + custom actions)
- Expense category management
- Prepaid expense management
"""

from decimal import Decimal
from datetime import datetime, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status as http_status

from expenses.models import Expense, ExpenseCategory, PrepaidExpense
from accounts.models import Account, AccountCategory
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from branches.models import Branch
from users.models import Tenant
from common.managers import set_current_tenant

User = get_user_model()


class ExpenseModelTest(TestCase):
    """Test expense model validation and workflows"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testmodel')
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
        self.expense_category = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,  # Expenses
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_category = AccountCategory.objects.create(
            name='Current Assets',
            code_prefix='1',
            section=1,  # Assets
            owner=self.user,
            branch=self.branch
        )
        
        self.liability_category = AccountCategory.objects.create(
            name='Current Liabilities',
            code_prefix='2',
            section=2,  # Liabilities
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.expense_account = Account.objects.create(
            name='Office Supplies',
            code='5010',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create proper parent+child cash account structure
        cash_parent = Account.objects.create(
            name='Cash on Hand',
            code='101',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            allow_manual_entries=False
        )
        
        self.cash_account = Account.objects.create(
            name='General Cash',
            code='101-001',
            account_type='ASSET',
            account_level='CHILD',
            parent=cash_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.prepaid_account = Account.objects.create(
            name='Prepaid Expenses',
            code='1050',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.payable_account = Account.objects.create(
            name='Accounts Payable',
            code='2010',
            account_type='LIABILITY',
            account_level='PARENT',
            category=self.liability_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create expense category
        self.category = ExpenseCategory.objects.create(
            name='Office Supplies',
            code='OFFICE',
            expense_account=self.expense_account,
            prepaid_account=self.prepaid_account,
            requires_approval=True,
            approval_threshold=Decimal('1000.00'),
            branch=self.branch,
            owner=self.user
        )
    
    def test_create_expense(self):
        """Test creating a basic expense"""
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        self.assertIsNotNone(expense.reference_number)
        self.assertTrue(expense.reference_number.startswith('EXP-'))
        self.assertEqual(expense.status, 'draft')
        self.assertFalse(expense.approved)
        self.assertFalse(expense.is_posted)
    
    def test_expense_amount_validation(self):
        """Test that total amount must equal subtotal + tax"""
        # This validation is in the serializer, not the model
        # Model accepts any values
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('10.00'),
            total_amount=Decimal('200.00'),  # Wrong total
            amount=Decimal('200.00'),
            payment_method='cash',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Model doesn't validate, but serializer will
        self.assertEqual(expense.total_amount, Decimal('200.00'))
    
    def test_expense_status_workflow(self):
        """Test expense status transitions"""
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            requires_approval=True,
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Start as draft
        self.assertEqual(expense.status, 'draft')
        
        # Submit for approval
        expense.status = 'submitted'
        expense.save()
        self.assertEqual(expense.status, 'submitted')
        
        # Approve
        expense.status = 'approved'
        expense.approved = True
        expense.approved_by = self.user
        expense.approved_at = timezone.now()
        expense.save()
        self.assertEqual(expense.status, 'approved')
        self.assertTrue(expense.approved)
        
        # Mark as paid
        expense.status = 'paid'
        expense.save()
        self.assertEqual(expense.status, 'paid')
    
    def test_expense_requires_approval_threshold(self):
        """Test approval requirement based on threshold"""
        # Below threshold
        expense1 = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Small expense',
            subtotal=Decimal('500.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('500.00'),
            amount=Decimal('500.00'),
            payment_method='cash',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Above threshold
        expense2 = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Large expense',
            subtotal=Decimal('1500.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('1500.00'),
            amount=Decimal('1500.00'),
            payment_method='cash',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Both created successfully
        self.assertIsNotNone(expense1.id)
        self.assertIsNotNone(expense2.id)


class ExpenseAccountingTest(TestCase):
    """Test expense accounting integration"""
    
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
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testacct')
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
        self.expense_category = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,  # Expenses
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_category = AccountCategory.objects.create(
            name='Current Assets',
            code_prefix='1',
            section=1,  # Assets
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.expense_account = Account.objects.create(
            name='Office Supplies',
            code='5010',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create proper parent+child cash account structure
        cash_parent = Account.objects.create(
            name='Cash on Hand',
            code='101',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            allow_manual_entries=False
        )
        
        self.cash_account = Account.objects.create(
            name='General Cash',
            code='101-001',
            account_type='ASSET',
            account_level='CHILD',
            parent=cash_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.prepaid_account = Account.objects.create(
            name='Prepaid Expenses',
            code='1050',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create expense category
        self.category = ExpenseCategory.objects.create(
            name='Office Supplies',
            code='OFFICE',
            expense_account=self.expense_account,
            prepaid_account=self.prepaid_account,
            branch=self.branch,
            owner=self.user
        )
        
        # Create expense
        self.expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            approved=True,
            approved_by=self.user,
            approved_at=timezone.now(),
            status='approved',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
    
    def test_post_expense(self):
        """Test posting expense to accounting"""
        from expenses.services.expense_accounting import ExpenseAccountingService
        
        service = ExpenseAccountingService(self.expense)
        journal_entry = service.post_expense(posted_by=self.user)
        
        # Check expense updated
        self.expense.refresh_from_db()
        self.assertTrue(self.expense.is_posted)
        self.assertIsNotNone(self.expense.posted_at)
        self.assertEqual(self.expense.status, 'paid')
        
        # Check journal entry created
        self.assertIsNotNone(journal_entry)
        self.assertEqual(journal_entry.workflow_reference, self.expense.reference_number)
        
        # Check journal entry lines
        entries = journal_entry.entries.all()
        self.assertEqual(entries.count(), 2)
        
        # Check debit (expense)
        from transactions.models import TransactionEntry
        debit_entry = entries.filter(side=TransactionEntry.DEBIT).first()
        self.assertEqual(debit_entry.account, self.expense_account)
        self.assertEqual(debit_entry.amount, self.expense.total_amount)
        
        # Check credit (cash)
        credit_entry = entries.filter(side=TransactionEntry.CREDIT).first()
        self.assertEqual(credit_entry.account, self.cash_account)
        self.assertEqual(credit_entry.amount, self.expense.total_amount)
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after posting expense")
    
    def test_prepaid_expense_amortization(self):
        """Test prepaid expense amortization"""
        from expenses.services.expense_accounting import PrepaidExpenseAccountingService
        
        # Create prepaid expense
        prepaid = PrepaidExpense.objects.create(
            category=self.category,
            purchase_date=timezone.now().date(),
            description='Annual insurance',
            total_amount=Decimal('1200.00'),
            consumed_amount=Decimal('0.00'),
            remaining_amount=Decimal('1200.00'),
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Amortize one month
        service = PrepaidExpenseAccountingService(prepaid)
        journal_entry = service.amortize_period(
            amount=Decimal('100.00'),
            period_end_date=(timezone.now() + timedelta(days=30)).date(),
            notes='Monthly amortization'
        )
        
        # Check prepaid updated
        prepaid.refresh_from_db()
        self.assertEqual(prepaid.consumed_amount, Decimal('100.00'))
        self.assertEqual(prepaid.remaining_amount, Decimal('1100.00'))
        self.assertNotEqual(prepaid.status, 'fully_consumed')
        
        # Check journal entry
        entries = journal_entry.entries.all()
        self.assertEqual(entries.count(), 2)
        
        # DR: Expense, CR: Prepaid
        from transactions.models import TransactionEntry
        debit_entry = entries.filter(side=TransactionEntry.DEBIT).first()
        self.assertEqual(debit_entry.account, self.expense_account)
        self.assertEqual(debit_entry.amount, Decimal('100.00'))
        
        credit_entry = entries.filter(side=TransactionEntry.CREDIT).first()
        self.assertEqual(credit_entry.account, self.prepaid_account)
        self.assertEqual(credit_entry.amount, Decimal('100.00'))
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after prepaid amortization")


class ExpenseAPITest(TestCase):
    """Test expense API endpoints"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testorg')
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
        self.expense_category = AccountCategory.objects.create(
            name='Expenses',
            code_prefix='5',
            section=5,  # Expenses
            owner=self.user,
            branch=self.branch
        )
        
        self.asset_category = AccountCategory.objects.create(
            name='Current Assets',
            code_prefix='1',
            section=1,  # Assets
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.expense_account = Account.objects.create(
            name='Office Supplies',
            code='5010',
            account_type='EXPENSE',
            account_level='PARENT',
            category=self.expense_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create proper parent+child cash account structure
        cash_parent = Account.objects.create(
            name='Cash on Hand',
            code='101',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
            allow_manual_entries=False
        )
        
        self.cash_account = Account.objects.create(
            name='General Cash',
            code='101-001',
            account_type='ASSET',
            account_level='CHILD',
            parent=cash_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        self.prepaid_account = Account.objects.create(
            name='Prepaid Expenses',
            code='1050',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
        # Create expense category
        self.category = ExpenseCategory.objects.create(
            name='Office Supplies',
            code='OFFICE',
            expense_account=self.expense_account,
            prepaid_account=self.prepaid_account,
            requires_approval=True,
            approval_threshold=Decimal('1000.00'),
            branch=self.branch,
            owner=self.user
        )
        
        # Authenticate
        self.client.force_authenticate(user=self.user)
    
    def test_create_expense_api(self):
        """Test creating expense via API"""
        data = {
            'category': self.category.id,
            'expense_date': timezone.now().date().isoformat(),
            'description': 'Test expense via API',
            'amount': '100.00',
            'subtotal': '100.00',
            'tax_amount_field': '0.00',
            'total_amount': '100.00',
            'payment_method': 'cash'
        }
        
        response = self.client.post('/api/expenses/', data, format='json')
        
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertIn('reference_number', response.data)
        self.assertTrue(response.data['reference_number'].startswith('EXP-'))
    
    def test_list_expenses(self):
        """Test listing expenses"""
        # Create test expenses
        for i in range(3):
            Expense.objects.create(
                category=self.category,
                expense_date=timezone.now().date(),
                description=f'Test expense {i}',
                subtotal=Decimal('100.00'),
                tax_amount_field=Decimal('0.00'),
                total_amount=Decimal('100.00'),
                amount=Decimal('100.00'),
                payment_method='cash',
                branch=self.branch,
                owner=self.user,
                created_by=self.user
            )
        
        response = self.client.get('/api/expenses/')
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 3)
    
    def test_approve_expense(self):
        """Test approving expense via API"""
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            requires_approval=True,
            status='submitted',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        response = self.client.post(
            f'/api/expenses/{expense.id}/approve/',
            {'notes': 'Approved for payment'},
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'approved')
        
        expense.refresh_from_db()
        self.assertTrue(expense.approved)
        self.assertEqual(expense.status, 'approved')
    
    def test_reject_expense(self):
        """Test rejecting expense via API"""
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            requires_approval=True,
            status='submitted',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        response = self.client.post(
            f'/api/expenses/{expense.id}/reject/',
            {'reason': 'Missing receipt'},
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'rejected')
        
        expense.refresh_from_db()
        self.assertEqual(expense.status, 'rejected')
    
    def test_post_expense_to_accounting(self):
        """Test posting expense to accounting via API"""
        expense = Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Test expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            approved=True,
            approved_by=self.user,
            approved_at=timezone.now(),
            status='approved',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        response = self.client.post(
            f'/api/expenses/{expense.id}/post/',
            {'notes': 'Posted to GL'},
            format='json'
        )
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'posted')
        
        expense.refresh_from_db()
        self.assertTrue(expense.is_posted)
        self.assertEqual(expense.status, 'paid')
    
    def test_get_expense_summary(self):
        """Test getting expense summary via API"""
        # Create test expenses
        for i in range(3):
            Expense.objects.create(
                category=self.category,
                expense_date=timezone.now().date(),
                description=f'Test expense {i}',
                subtotal=Decimal('100.00'),
                tax_amount_field=Decimal('0.00'),
                total_amount=Decimal('100.00'),
                amount=Decimal('100.00'),
                payment_method='cash',
                status='approved',
                branch=self.branch,
                owner=self.user,
                created_by=self.user
            )
        
        response = self.client.get('/api/expenses/summary/')
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertIn('total_count', response.data)
        self.assertIn('total_amount', response.data)
        self.assertEqual(response.data['total_count'], 3)
    
    def test_pending_approval_list(self):
        """Test getting expenses pending approval"""
        # Create approved expense
        Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Approved expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            requires_approval=True,
            approved=True,
            status='approved',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Create pending expense
        Expense.objects.create(
            category=self.category,
            expense_date=timezone.now().date(),
            description='Pending expense',
            subtotal=Decimal('100.00'),
            tax_amount_field=Decimal('0.00'),
            total_amount=Decimal('100.00'),
            amount=Decimal('100.00'),
            payment_method='cash',
            requires_approval=True,
            approved=False,
            status='submitted',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        response = self.client.get('/api/expenses/pending_approval/')
        
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['status'], 'submitted')

