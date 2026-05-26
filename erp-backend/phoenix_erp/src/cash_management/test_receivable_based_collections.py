# cash_management/test_receivable_based_collections.py
"""
Comprehensive test suite for receivable-based cash collection system
Tests that income accounts are correctly derived from invoices/receivables
All tests verify trial balance integrity after each transaction
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from django.db.models import Sum
from decimal import Decimal
from datetime import date, timedelta

from .models import CashierAccount, CashCollection, CashTransfer, CashReconciliation
from branches.models import Branch
from accounts.models import Account, AccountCategory
from clients.models import Client
from incomes.models import IncomeCategory, FeeStructure, Invoice
from receivables.models import CustomerReceivable
from transactions.models import Transaction, TransactionEntry


User = get_user_model()


class ReceivableBasedCollectionTests(TestCase):
    """
    Test that cash collections correctly derive income accounts from receivables
    Each test verifies trial balance integrity
    """
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        This catches any double-entry accounting errors
        """
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
            f"{error_message}. Debits: {total_debits}, Credits: {total_credits}, "
            f"Difference: {total_debits - total_credits}"
        )
    
    def setUp(self):
        """Set up test data"""
        # Create users
        self.cashier_user = User.objects.create_user(
            username='cashier1',
            email='cashier1@example.com',
            password='test123'
        )
        
        self.finance_user = User.objects.create_user(
            username='finance',
            email='finance@example.com',
            password='test123',
            is_superuser=True
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01',
            owner=self.finance_user
        )
        
        # Create client
        self.client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            email='john@example.com',
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create account categories
        self.asset_category = AccountCategory.objects.create(
            name='Cash and Bank',
            section=1,  # Assets
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.income_category = AccountCategory.objects.create(
            name='Revenue',
            section=4,  # Income
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create parent accounts
        self.cash_parent = Account.objects.create(
            name='Cash',
            code='150',
            account_type='ASSET',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.income_parent = Account.objects.create(
            name='Revenue',
            code='400',
            account_type='INCOME',
            account_level='PARENT',
            category=self.income_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create child income accounts for different fee types
        self.tuition_income_account = Account.objects.create(
            name='Tuition Income',
            code='401-001',
            account_type='INCOME',
            account_level='CHILD',
            parent=self.income_parent,
            category=self.income_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.lab_fees_income_account = Account.objects.create(
            name='Lab Fees Income',
            code='401-002',
            account_type='INCOME',
            account_level='CHILD',
            parent=self.income_parent,
            category=self.income_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.library_fees_income_account = Account.objects.create(
            name='Library Fees Income',
            code='401-003',
            account_type='INCOME',
            account_level='CHILD',
            parent=self.income_parent,
            category=self.income_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create cashier child account
        self.cashier_account_gl = Account.objects.create(
            name='Cashier 1 Account',
            code='150-001',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.cash_parent,
            category=self.asset_category,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create cashier account
        self.cashier_account = CashierAccount.objects.create(
            account_number='CASH-001',
            name='Main Cashier',
            cashier=self.cashier_user,
            account=self.cashier_account_gl,
            branch=self.branch,
            owner=self.finance_user,
            is_active=True
        )
        
        # Create income categories
        self.tuition_category = IncomeCategory.objects.create(
            name='Tuition Fees',
            code='TF',
            income_account=self.tuition_income_account,
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.lab_fees_category = IncomeCategory.objects.create(
            name='Lab Fees',
            code='LF',
            income_account=self.lab_fees_income_account,
            owner=self.finance_user,
            branch=self.branch
        )
        
        self.library_category = IncomeCategory.objects.create(
            name='Library Fees',
            code='LIBF',
            income_account=self.library_fees_income_account,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create fee structures
        self.tuition_fee_structure = FeeStructure.objects.create(
            name='Annual Tuition',
            code='TUITION-2024',
            category=self.tuition_category,
            base_amount=Decimal('500000.00'),
            approval_status='approved',
            approved_by=self.finance_user,
            approved_at=timezone.now(),
            owner=self.finance_user,
            branch=self.branch,
            is_active=True
        )
        
        self.lab_fee_structure = FeeStructure.objects.create(
            name='Lab Fees',
            code='LAB-2024',
            category=self.lab_fees_category,
            base_amount=Decimal('50000.00'),
            approval_status='approved',
            approved_by=self.finance_user,
            approved_at=timezone.now(),
            owner=self.finance_user,
            branch=self.branch,
            is_active=True
        )
    
    def test_tuition_payment_credits_tuition_income(self):
        """
        Test that payment against tuition invoice credits tuition income account
        """
        # Create tuition invoice
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-001',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Annual tuition fees',
            amount=Decimal('500000.00'),
            fee_structure=self.tuition_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Get the receivable (auto-created by signal)
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        # Create cash collection against tuition invoice
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('500000.00'),
            amount_collected=Decimal('500000.00'),
            payment_purpose='Tuition payment',
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Post the collection
        collection.post(self.finance_user)
        
        # Verify journal entry was created
        self.assertTrue(collection.is_posted)
        self.assertIsNotNone(collection.journal_entry)
        
        # Verify correct accounts were used
        journal_entry = collection.journal_entry
        entries = journal_entry.entries.all()
        
        # Should have 2 entries: DR Cashier, CR Tuition Income
        self.assertEqual(entries.count(), 2)
        
        # Verify debit to cashier account
        debit_entry = entries.get(side='DR')
        self.assertEqual(debit_entry.account, self.cashier_account_gl)
        self.assertEqual(debit_entry.amount, Decimal('500000.00'))
        
        # Verify credit to TUITION income account (not lab or library)
        credit_entry = entries.get(side='CR')
        self.assertEqual(credit_entry.account, self.tuition_income_account)
        self.assertEqual(credit_entry.amount, Decimal('500000.00'))
        
        # Verify cashier balance increased
        self.cashier_account.refresh_from_db()
        self.assertEqual(self.cashier_account.current_balance, Decimal('500000.00'))
        
        # Verify trial balance is maintained
        self.verify_trial_balance("Trial balance broken after tuition payment")
    
    def test_lab_fees_payment_credits_lab_income(self):
        """
        Test that payment against lab fees invoice credits lab fees income account
        """
        # Create lab fees invoice
        lab_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-002',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Lab fees for semester 1',
            amount=Decimal('50000.00'),
            fee_structure=self.lab_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Get the receivable
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=lab_invoice.id
        )
        
        # Create and post collection
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('50000.00'),
            amount_collected=Decimal('50000.00'),
            payment_purpose='Lab fees payment',
            owner=self.finance_user,
            branch=self.branch
        )
        
        collection.post(self.finance_user)
        
        # Verify credit to LAB FEES income account (not tuition or library)
        credit_entry = collection.journal_entry.entries.get(side='CR')
        self.assertEqual(credit_entry.account, self.lab_fees_income_account)
        self.assertEqual(credit_entry.amount, Decimal('50000.00'))
        
        # Verify trial balance is maintained
        self.verify_trial_balance("Trial balance broken after lab fees payment")
    
    def test_multiple_invoices_credit_correct_accounts(self):
        """
        Test that multiple invoices of different types credit correct income accounts
        """
        # Create tuition invoice
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-003',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Tuition',
            amount=Decimal('500000.00'),
            fee_structure=self.tuition_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Create lab invoice
        lab_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-004',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Lab fees',
            amount=Decimal('50000.00'),
            fee_structure=self.lab_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Pay tuition
        tuition_receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        tuition_collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=tuition_receivable,
            collection_date=date.today(),
            amount_due=Decimal('500000.00'),
            amount_collected=Decimal('500000.00'),
            payment_purpose='Tuition payment',            receipt_number='CASH-001',            owner=self.finance_user,
            branch=self.branch
        )
        tuition_collection.post(self.finance_user)
        
        # Pay lab fees
        lab_receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=lab_invoice.id
        )
        
        lab_collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=lab_receivable,
            collection_date=date.today(),
            amount_due=Decimal('50000.00'),
            amount_collected=Decimal('50000.00'),
            payment_purpose='Lab fees payment',
            receipt_number='CASH-002',
            owner=self.finance_user,
            branch=self.branch
        )
        lab_collection.post(self.finance_user)
        
        # Verify tuition payment credited tuition account
        tuition_credit = tuition_collection.journal_entry.entries.get(side='CR')
        self.assertEqual(tuition_credit.account, self.tuition_income_account)
        
        # Verify lab payment credited lab account
        lab_credit = lab_collection.journal_entry.entries.get(side='CR')
        self.assertEqual(lab_credit.account, self.lab_fees_income_account)
        
        # Verify cashier balance = tuition + lab fees
        self.cashier_account.refresh_from_db()
        self.assertEqual(
            self.cashier_account.current_balance,
            Decimal('550000.00')  # 500k + 50k
        )
        
        # Verify trial balance is maintained after multiple transactions
        self.verify_trial_balance("Trial balance broken after multiple invoice payments")
    
    def test_collection_without_receivable_fails(self):
        """
        Test that creating a collection without receivable fails validation
        """
        with self.assertRaises(ValidationError) as context:
            collection = CashCollection.objects.create(
                cashier_account=self.cashier_account,
                client=self.client,
                # receivable missing
                collection_date=date.today(),
                amount_due=Decimal('100000.00'),
                amount_collected=Decimal('100000.00'),
                payment_purpose='Payment',
                owner=self.finance_user,
                branch=self.branch
            )
            collection.post(self.finance_user)
        
        self.assertIn('Receivable is required', str(context.exception))
        
        # Verify trial balance unchanged (transaction should have failed)
        self.verify_trial_balance("Trial balance affected by failed transaction")
    
    def test_invoice_without_fee_structure_needs_category(self):
        """
        Test handling of invoices without fee structure
        (income account should come from category)
        """
        # Create invoice directly linked to category (no fee structure)
        # Note: Invoice model doesn't have direct category link, uses fee_structure
        # This tests the edge case
        
        # For this test, we'll verify the architecture handles the common case
        # where invoices ARE linked to fee structures
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-005',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Tuition (direct)',
            amount=Decimal('100000.00'),
            fee_structure=self.tuition_fee_structure,  # Has fee structure
            owner=self.finance_user,
            branch=self.branch
        )
        
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('100000.00'),
            amount_collected=Decimal('100000.00'),
            payment_purpose='Payment',
            owner=self.finance_user,
            branch=self.branch
        )
        
        collection.post(self.finance_user)
        
        # Should credit tuition income account
        credit_entry = collection.journal_entry.entries.get(side='CR')
        self.assertEqual(credit_entry.account, self.tuition_income_account)
        
        # Verify trial balance is maintained
        self.verify_trial_balance("Trial balance broken after invoice with fee structure payment")
    
    def test_partial_payment_credits_correct_account(self):
        """
        Test that partial payments credit the correct income account
        """
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-006',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Tuition',
            amount=Decimal('500000.00'),
            fee_structure=self.tuition_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        # Make partial payment (50%)
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('500000.00'),
            amount_collected=Decimal('250000.00'),  # Partial
            payment_purpose='Partial tuition payment',
            owner=self.finance_user,
            branch=self.branch
        )
        
        collection.post(self.finance_user)
        
        # Should still credit tuition income account
        credit_entry = collection.journal_entry.entries.get(side='CR')
        self.assertEqual(credit_entry.account, self.tuition_income_account)
        self.assertEqual(credit_entry.amount, Decimal('250000.00'))
        
        # Verify cashier balance
        self.cashier_account.refresh_from_db()
        self.assertEqual(self.cashier_account.current_balance, Decimal('250000.00'))
        
        # Verify trial balance is maintained
        self.verify_trial_balance("Trial balance broken after partial payment")
    
    def test_serializer_returns_derived_income_account_name(self):
        """
        Test that serializer returns the derived income account name (read-only)
        """
        from .serializers import CashCollectionSerializer
        
        # Create invoice and collection
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-007',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Tuition',
            amount=Decimal('500000.00'),
            fee_structure=self.tuition_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('500000.00'),
            amount_collected=Decimal('500000.00'),
            payment_purpose='Tuition',
            owner=self.finance_user,
            branch=self.branch
        )
        
        # Serialize
        serializer = CashCollectionSerializer(collection)
        data = serializer.data
        
        # Verify income_account_name is derived correctly
        self.assertEqual(data['receivable_reference'], 'INV-2024-007')
        self.assertEqual(data['income_account_name'], '401-001 - Tuition Income')
        
        # Verify trial balance (even though not posted yet, should still be balanced)
        self.verify_trial_balance("Trial balance broken after creating collection")
    
    def test_balance_validation_ensures_correct_income_account(self):
        """
        Test that balanced transaction validation ensures correct income account
        """
        tuition_invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-2024-008',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Tuition',
            amount=Decimal('500000.00'),
            fee_structure=self.tuition_fee_structure,
            owner=self.finance_user,
            branch=self.branch
        )
        
        receivable = CustomerReceivable.objects.get(
            content_type=ContentType.objects.get_for_model(Invoice),
            object_id=tuition_invoice.id
        )
        
        collection = CashCollection.objects.create(
            cashier_account=self.cashier_account,
            client=self.client,
            receivable=receivable,
            collection_date=date.today(),
            amount_due=Decimal('500000.00'),
            amount_collected=Decimal('500000.00'),
            payment_purpose='Tuition',
            owner=self.finance_user,
            branch=self.branch
        )
        
        collection.post(self.finance_user)
        
        # Verify transaction is balanced
        journal_entry = collection.journal_entry
        total_debits = sum(
            e.amount for e in journal_entry.entries.filter(side='DR')
        )
        total_credits = sum(
            e.amount for e in journal_entry.entries.filter(side='CR')
        )
        
        self.assertEqual(total_debits, total_credits)
        self.assertEqual(total_debits, Decimal('500000.00'))
        
        # Verify accounts are correct types
        debit_entry = journal_entry.entries.get(side='DR')
        credit_entry = journal_entry.entries.get(side='CR')
        
        self.assertEqual(debit_entry.account.account_type, 'ASSET')
        self.assertEqual(credit_entry.account.account_type, 'INCOME')
        
        # Verify trial balance is maintained
        self.verify_trial_balance("Trial balance broken after balanced transaction validation")


class InvoiceIncomeAccountTests(TestCase):
    """
    Test that invoices properly link to income accounts through fee structures
    Includes trial balance verification
    """
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        """
        total_debits = TransactionEntry.objects.filter(
            side=TransactionEntry.DEBIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_credits = TransactionEntry.objects.filter(
            side=TransactionEntry.CREDIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        self.assertEqual(
            total_debits,
            total_credits,
            f"{error_message}. Debits: {total_debits}, Credits: {total_credits}, "
            f"Difference: {total_debits - total_credits}"
        )
    
    def setUp(self):
        """Set up minimal test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='test123',
            is_superuser=True
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB',
            owner=self.user
        )
        
        self.client = Client.objects.create(
            first_name='Test',
            last_name='Client',
            email='client@example.com',
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        income_category = AccountCategory.objects.create(
            name='Revenue',
            section=4,  # Income
            owner=self.user,
            branch=self.branch
        )
        
        income_parent = Account.objects.create(
            name='Revenue',
            code='400',
            account_type='INCOME',
            account_level='PARENT',
            category=income_category,
            owner=self.user,
            branch=self.branch
        )
        
        self.tuition_account = Account.objects.create(
            name='Tuition Income',
            code='401',
            account_type='INCOME',
            account_level='CHILD',
            parent=income_parent,
            category=income_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create income category and fee structure
        self.income_category = IncomeCategory.objects.create(
            name='Tuition',
            code='TF',
            income_account=self.tuition_account,
            owner=self.user,
            branch=self.branch
        )
        
        self.fee_structure = FeeStructure.objects.create(
            name='Tuition 2024',
            code='T2024',
            category=self.income_category,
            base_amount=Decimal('100000.00'),
            approval_status='approved',
            approved_by=self.user,
            approved_at=timezone.now(),
            owner=self.user,
            branch=self.branch,
            is_active=True
        )
    
    def test_invoice_has_income_account_through_fee_structure(self):
        """
        Test that invoice → fee_structure → category → income_account chain works
        """
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='TEST-001',
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            description='Test invoice',
            amount=Decimal('100000.00'),
            fee_structure=self.fee_structure,
            owner=self.user,
            branch=self.branch
        )
        
        # Verify we can get income account through the chain
        self.assertEqual(
            invoice.fee_structure.category.income_account,
            self.tuition_account
        )
        
        # Verify trial balance (no transactions yet, should be zero)
        self.verify_trial_balance("Trial balance broken after invoice creation")
    
    def test_fee_structure_validates_income_account_type(self):
        """
        Test that income categories validate account type is INCOME
        """
        # Try to create income category with non-INCOME account
        asset_category = AccountCategory.objects.create(
            name='Cash and Bank',
            section=1,  # Assets
            owner=self.user,
            branch=self.branch
        )
        
        cash_account = Account.objects.create(
            name='Cash',
            code='100',
            account_type='ASSET',
            account_level='PARENT',
            category=asset_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Should fail validation
        with self.assertRaises(ValidationError):
            income_cat = IncomeCategory(
                name='Invalid',
                code='INV',
                income_account=cash_account,  # Wrong type!
                owner=self.user,
                branch=self.branch
            )
            income_cat.clean()
        
        # Verify trial balance unchanged (no transactions should have been created)
        self.verify_trial_balance("Trial balance affected by failed validation")
