# incomes/tests/test_cashier_account_creation.py
"""
Tests for auto-creation of CashierAccount when recording cash payments
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from incomes.models import Income, IncomeCategory
from incomes.models_config import IncomeAccountingConfig
from incomes.services.accounting_integration import IncomeAccountingService
from cash_management.models import CashierAccount
from accounts.models import Account
from users.models import Tenant
from branches.models import Branch
from incomes.models import Invoice, FeeStructure

User = get_user_model()


class CashierAccountAutoCreationTest(TestCase):
    """Test auto-creation of cashier accounts for cash payments"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(
            name="Test School",
            subdomain="test"
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testcashier',
            email='cashier@test.com',
            password='testpass123'
        )
        self.user.tenant = self.tenant
        self.user.save()
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAIN",
            owner=self.user,
            tenant=self.tenant
        )
        
        # Create GL accounts
        # Parent Cash Account (100 - Cash and Bank)
        self.cash_parent = Account.objects.create(
            code='100',
            name='Cash and Bank',
            account_type='ASSET',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Child Cash Account (100-001 - Main Cash)
        self.cash_account = Account.objects.create(
            code='100-001',
            name='Main Cash',
            account_type='ASSET',
            level='CHILD',
            parent=self.cash_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Parent AR Account (140 - Accounts Receivable)
        self.ar_parent = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type='ASSET',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Child AR Account (140-001 - General Receivables)
        self.ar_account = Account.objects.create(
            code='140-001',
            name='General Receivables',
            account_type='ASSET',
            level='CHILD',
            parent=self.ar_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Parent Income Account (400 - Income)
        self.income_parent = Account.objects.create(
            code='400',
            name='Income',
            account_type='INCOME',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Child Income Account (400-001 - Tuition Income)
        self.income_account = Account.objects.create(
            code='400-001',
            name='Tuition Income',
            account_type='INCOME',
            level='CHILD',
            parent=self.income_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create Income Accounting Config
        self.config = IncomeAccountingConfig.objects.create(
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant,
            default_cash_account=self.cash_account,
            default_ar_account=self.ar_account
        )
        
        # Create Income Category
        self.category = IncomeCategory.objects.create(
            name='Tuition Fees',
            code='TUI',
            income_account=self.income_account,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create Income
        self.income = Income.objects.create(
            category=self.category,
            amount=Decimal('1000.00'),
            income_date=date.today(),
            description='Test tuition payment',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant,
            created_by=self.user
        )
    
    def test_cashier_account_not_created_initially(self):
        """Test that no cashier account exists initially"""
        count = CashierAccount.objects.filter(cashier=self.user).count()
        self.assertEqual(count, 0, "No cashier account should exist initially")
    
    def test_cashier_account_auto_created_on_cash_payment(self):
        """Test that cashier account is auto-created when recording cash payment"""
        # Record a cash payment
        journal_entry = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('500.00'),
            payment_method='cash',
            user=self.user,
            bank_account=None,
            notes='Test payment'
        )
        
        # Check that cashier account was created
        cashier_accounts = CashierAccount.objects.filter(
            cashier=self.user,
            owner=self.user,
            is_active=True,
            is_deleted=False
        )
        
        self.assertEqual(cashier_accounts.count(), 1, "One cashier account should be created")
        
        cashier_account = cashier_accounts.first()
        self.assertIsNotNone(cashier_account, "Cashier account should exist")
        self.assertEqual(cashier_account.cashier, self.user, "Cashier should be the user")
        self.assertTrue(cashier_account.account_number.startswith('CASH-'), 
                       f"Account number should start with CASH-, got {cashier_account.account_number}")
        self.assertIsNotNone(cashier_account.account, "GL account should be linked")
        self.assertEqual(cashier_account.account.level, 'CHILD', "GL account should be CHILD level")
        self.assertEqual(cashier_account.account.account_type, 'ASSET', "GL account should be ASSET type")
    
    def test_cashier_account_not_created_for_bank_payment(self):
        """Test that cashier account is NOT created for bank transfers"""
        # Record a bank transfer payment
        journal_entry = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('500.00'),
            payment_method='bank_transfer',
            user=self.user,
            bank_account=self.cash_account,  # Using bank account
            notes='Test bank payment'
        )
        
        # Check that no cashier account was created
        count = CashierAccount.objects.filter(cashier=self.user).count()
        self.assertEqual(count, 0, "No cashier account should be created for bank payments")
    
    def test_cashier_account_reused_on_second_payment(self):
        """Test that existing cashier account is reused for subsequent payments"""
        # First payment - creates cashier account
        journal_entry1 = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('300.00'),
            payment_method='cash',
            user=self.user,
            bank_account=None,
            notes='First payment'
        )
        
        first_count = CashierAccount.objects.filter(cashier=self.user).count()
        first_account = CashierAccount.objects.filter(cashier=self.user).first()
        
        # Second payment - should reuse existing cashier account
        journal_entry2 = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('200.00'),
            payment_method='cash',
            user=self.user,
            bank_account=None,
            notes='Second payment'
        )
        
        second_count = CashierAccount.objects.filter(cashier=self.user).count()
        second_account = CashierAccount.objects.filter(cashier=self.user).first()
        
        self.assertEqual(first_count, 1, "One cashier account after first payment")
        self.assertEqual(second_count, 1, "Still one cashier account after second payment")
        self.assertEqual(first_account.id, second_account.id, "Same cashier account should be reused")
    
    def test_cashier_gl_account_is_child_of_cash_account(self):
        """Test that the cashier's GL account is a child of the main cash account"""
        # Record a cash payment
        journal_entry = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('500.00'),
            payment_method='cash',
            user=self.user,
            bank_account=None,
            notes='Test payment'
        )
        
        cashier_account = CashierAccount.objects.get(cashier=self.user)
        cashier_gl = cashier_account.account
        
        # Check hierarchy
        self.assertEqual(cashier_gl.level, 'CHILD', "Cashier GL account should be CHILD level")
        self.assertIsNotNone(cashier_gl.parent, "Cashier GL account should have a parent")
        self.assertEqual(cashier_gl.parent.code, self.cash_account.code, 
                        "Cashier GL account parent should be the main cash account")
        self.assertTrue(cashier_gl.code.startswith(self.cash_account.code), 
                       f"Cashier GL code should start with parent code {self.cash_account.code}")
    
    def test_multiple_users_get_different_cashier_accounts(self):
        """Test that different users get different cashier accounts"""
        # Create second user
        user2 = User.objects.create_user(
            username='testcashier2',
            email='cashier2@test.com',
            password='testpass123'
        )
        user2.tenant = self.tenant
        user2.save()
        
        # Create second income
        income2 = Income.objects.create(
            category=self.category,
            amount=Decimal('800.00'),
            income_date=date.today(),
            description='Test payment 2',
            owner=user2,
            branch=self.branch,
            tenant=self.tenant,
            created_by=user2
        )
        
        # First user records payment
        journal_entry1 = IncomeAccountingService.record_income_receipt(
            income=self.income,
            amount=Decimal('500.00'),
            payment_method='cash',
            user=self.user,
            bank_account=None,
            notes='User 1 payment'
        )
        
        # Second user records payment
        journal_entry2 = IncomeAccountingService.record_income_receipt(
            income=income2,
            amount=Decimal('400.00'),
            payment_method='cash',
            user=user2,
            bank_account=None,
            notes='User 2 payment'
        )
        
        # Check both have cashier accounts
        cashier1 = CashierAccount.objects.filter(cashier=self.user).first()
        cashier2 = CashierAccount.objects.filter(cashier=user2).first()
        
        self.assertIsNotNone(cashier1, "User 1 should have cashier account")
        self.assertIsNotNone(cashier2, "User 2 should have cashier account")
        self.assertNotEqual(cashier1.id, cashier2.id, "Users should have different cashier accounts")
        self.assertNotEqual(cashier1.account_number, cashier2.account_number, 
                           "Users should have different account numbers")
        self.assertNotEqual(cashier1.account.id, cashier2.account.id, 
                           "Users should have different GL accounts")


class CashierAccountEdgeCasesTest(TestCase):
    """Test edge cases for cashier account creation"""
    
    def setUp(self):
        """Set up test data"""
        # Create minimal test setup
        self.tenant = Tenant.objects.create(name="Test School", subdomain="test")
        self.user = User.objects.create_user(username='testuser', password='test')
        self.user.tenant = self.tenant
        self.user.save()
        
        self.branch = Branch.objects.create(
            name="Main", code="MAIN", owner=self.user, tenant=self.tenant
        )
    
    def test_no_config_raises_validation_error(self):
        """Test that missing IncomeAccountingConfig raises ValidationError"""
        # No config created
        
        with self.assertRaises(Exception) as context:
            IncomeAccountingService.get_cash_account(
                owner=self.user,
                branch=self.branch,
                payment_method='cash',
                user=self.user
            )
        
        # Should raise ValidationError about missing config
        self.assertIn('configuration', str(context.exception).lower())


class InvoicePaymentCashierAccountTest(TestCase):
    """Test cashier account creation through Invoice payment recording"""
    
    def setUp(self):
        """Set up test data"""
        # Create tenant
        self.tenant = Tenant.objects.create(
            name="Test School",
            subdomain="test"
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testcashier',
            email='cashier@test.com',
            password='testpass123'
        )
        self.user.tenant = self.tenant
        self.user.save()
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAIN",
            owner=self.user,
            tenant=self.tenant
        )
        
        # Create GL accounts
        self.cash_parent = Account.objects.create(
            code='100',
            name='Cash and Bank',
            account_type='ASSET',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.cash_account = Account.objects.create(
            code='100-001',
            name='Main Cash',
            account_type='ASSET',
            level='CHILD',
            parent=self.cash_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.ar_parent = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type='ASSET',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.ar_account = Account.objects.create(
            code='140-001',
            name='General Receivables',
            account_type='ASSET',
            level='CHILD',
            parent=self.ar_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.income_parent = Account.objects.create(
            code='400',
            name='Income',
            account_type='INCOME',
            level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.income_account = Account.objects.create(
            code='400-001',
            name='Tuition Income',
            account_type='INCOME',
            level='CHILD',
            parent=self.income_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create Income Accounting Config
        self.config = IncomeAccountingConfig.objects.create(
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant,
            default_cash_account=self.cash_account,
            default_ar_account=self.ar_account
        )
        
        # Create Income Category
        self.category = IncomeCategory.objects.create(
            name='Tuition Fees',
            code='TUI',
            income_account=self.income_account,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create Fee Structure
        self.fee_structure = FeeStructure.objects.create(
            name='Standard Tuition',
            code='STD-TUI',
            category=self.category,
            total_amount=Decimal('1000.00'),
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create and post an invoice
        from clients.models import Client
        self.client = Client.objects.create(
            first_name='Test',
            last_name='Student',
            email='student@test.com',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.invoice = Invoice.objects.create(
            client=self.client,
            fee_structure=self.fee_structure,
            amount=Decimal('1000.00'),
            invoice_date=date.today(),
            due_date=date.today(),
            description='Test invoice',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant,
            created_by=self.user
        )
        
        # Post the invoice first (required before recording payment)
        self.invoice.post(user=self.user)
        self.invoice.refresh_from_db()
    
    def test_cashier_account_created_via_invoice_payment_api(self):
        """Test that cashier account is created when recording payment through Invoice API"""
        from rest_framework.test import APIRequestFactory
        from incomes.views import InvoiceViewSet
        
        # Verify no cashier account exists initially
        self.assertEqual(CashierAccount.objects.filter(cashier=self.user).count(), 0)
        
        # Create API request to record payment
        factory = APIRequestFactory()
        request = factory.post(
            f'/api/incomes/invoices/{self.invoice.id}/record_payment/',
            {
                'amount': '500.00',
                'payment_method': 'cash',
                'notes': 'Test cash payment'
            },
            format='json'
        )
        request.user = self.user
        
        # Call the view
        view = InvoiceViewSet.as_view({'post': 'record_payment'})
        response = view(request, pk=self.invoice.id)
        
        # Check response
        self.assertEqual(response.status_code, 200, f"Expected 200, got {response.status_code}: {response.data}")
        
        # Verify cashier account was created
        cashier_accounts = CashierAccount.objects.filter(
            cashier=self.user,
            is_active=True,
            is_deleted=False
        )
        self.assertEqual(cashier_accounts.count(), 1, "Cashier account should be auto-created")
        
        cashier_account = cashier_accounts.first()
        self.assertIsNotNone(cashier_account)
        self.assertEqual(cashier_account.cashier, self.user)
        self.assertTrue(cashier_account.account_number.startswith('CASH-'))
        self.assertEqual(cashier_account.account.account_type, 'ASSET')
    
    def test_invoice_payment_without_cashier_account_config(self):
        """Test that invoice payment works even without IncomeAccountingConfig (uses fallback)"""
        # Delete the config
        self.config.delete()
        
        # Verify no cashier account exists
        self.assertEqual(CashierAccount.objects.filter(cashier=self.user).count(), 0)
        
        # Try to record payment
        from rest_framework.test import APIRequestFactory
        from incomes.views import InvoiceViewSet
        
        factory = APIRequestFactory()
        request = factory.post(
            f'/api/incomes/invoices/{self.invoice.id}/record_payment/',
            {
                'amount': '500.00',
                'payment_method': 'cash',
                'notes': 'Test cash payment'
            },
            format='json'
        )
        request.user = self.user
        
        view = InvoiceViewSet.as_view({'post': 'record_payment'})
        response = view(request, pk=self.invoice.id)
        
        # Should succeed using fallback account
        self.assertEqual(response.status_code, 200, f"Expected 200, got {response.status_code}: {response.data}")
        
        # Cashier account should NOT be created without config (uses fallback)
        self.assertEqual(CashierAccount.objects.filter(cashier=self.user).count(), 0,
                        "Without config, should use fallback cash account, not create cashier account")
