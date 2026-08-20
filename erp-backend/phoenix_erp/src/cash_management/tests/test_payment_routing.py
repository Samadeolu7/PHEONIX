"""
Tests for Cash/Bank Payment Routing

Tests the complete payment flow:
1. Cash payments route to CashierAccount
2. Bank payments route to Bank Account  
3. Proper GL entries created
4. Treasury controls enforced
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import date

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from cash_management.models import CashierAccount, CashCollection
from cash_management.services.payment_routing import PaymentRoutingService
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine

User = get_user_model()


class PaymentRoutingServiceTests(TestCase):
    """Test payment routing service"""
    
    def setUp(self):
        """Set up test data"""
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB01',
            owner=self.user
        )
        self.user.branch = self.branch
        self.user.save()
        
        # Create client
        self.client = Client.objects.create(
            client_id='TEST-CLIENT-001',
            first_name='Test',
            last_name='Client',
            email='client@example.com',
            phone_primary='1234567890',
            gender='male',
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent cash account
        self.cash_parent = Account.objects.create(
            code='101',
            name='Cash on Hand',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        # Create cashier GL account (child)
        self.cashier_gl_account = Account.objects.create(
            code='101-CSH',
            name='Cashier Account',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.cash_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
        
        # Create cashier account
        self.cashier_account = CashierAccount.objects.create(
            account_number='CASH-001',
            cashier=self.user,
            account=self.cashier_gl_account,
            name='Test Cashier',
            daily_collection_limit=Decimal('1000000.00'),
            current_balance=Decimal('0.00'),
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent bank account
        self.bank_parent = Account.objects.create(
            code='102',
            name='Bank Accounts',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        # Create bank account (child)
        self.bank_account = Account.objects.create(
            code='102-BNK',
            name='Main Bank Account',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.bank_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent AR account
        self.ar_parent = Account.objects.create(
            code='140',
            name='Receivables',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        # Create AR account (child)
        self.ar_account = Account.objects.create(
            code='140-AR',
            name='Accounts Receivable',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.ar_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
    
    def test_determine_payment_route_cash(self):
        """Test that cash payments route to 'cash'"""
        self.assertEqual(
            PaymentRoutingService.determine_payment_route('cash'),
            'cash'
        )
        self.assertEqual(
            PaymentRoutingService.determine_payment_route('mobile_money'),
            'cash'
        )
    
    def test_determine_payment_route_bank(self):
        """Test that bank payments route to 'bank'"""
        self.assertEqual(
            PaymentRoutingService.determine_payment_route('bank_transfer'),
            'bank'
        )
        self.assertEqual(
            PaymentRoutingService.determine_payment_route('check'),
            'bank'
        )
        self.assertEqual(
            PaymentRoutingService.determine_payment_route('credit_card'),
            'bank'
        )
    
    def test_record_cash_payment_creates_collection(self):
        """Test that cash payment creates CashCollection"""
        journal_entry, cash_collection = PaymentRoutingService.record_cash_payment(
            amount=Decimal('50000.00'),
            payment_date=date.today(),
            payment_method='cash',
            cashier_account=self.cashier_account,
            client=self.client,
            reference_number='PMT-001',
            description='Test payment',
            user=self.user,
            ar_account=self.ar_account
        )
        
        # Verify cash collection created
        self.assertIsNotNone(cash_collection)
        self.assertEqual(cash_collection.amount_collected, Decimal('50000.00'))
        self.assertEqual(cash_collection.cashier_account, self.cashier_account)
        self.assertEqual(cash_collection.client, self.client)
        
        # Verify it's posted
        self.assertTrue(cash_collection.is_posted)
        self.assertIsNotNone(cash_collection.journal_entry)
        
        # Verify journal entry
        self.assertEqual(journal_entry.get_total_amount(), Decimal('50000.00'))
    
    def test_record_cash_payment_updates_cashier_balance(self):
        """Test that cash payment updates cashier account balance"""
        initial_balance = self.cashier_account.current_balance
        
        PaymentRoutingService.record_cash_payment(
            amount=Decimal('75000.00'),
            payment_date=date.today(),
            payment_method='cash',
            cashier_account=self.cashier_account,
            client=self.client,
            reference_number='PMT-002',
            description='Test payment 2',
            user=self.user,
            ar_account=self.ar_account
        )
        
        # Refresh and verify balance increased
        self.cashier_account.refresh_from_db()
        self.assertEqual(
            self.cashier_account.current_balance,
            initial_balance + Decimal('75000.00')
        )
    
    def test_record_bank_payment_creates_journal_entry(self):
        """Test that bank payment creates proper journal entry"""
        journal_entry = PaymentRoutingService.record_bank_payment(
            amount=Decimal('100000.00'),
            payment_date=date.today(),
            payment_method='bank_transfer',
            bank_account=self.bank_account,
            reference_number='TRX-12345',
            description='Bank payment test',
            user=self.user,
            ar_account=self.ar_account,
            branch=self.branch
        )
        
        # Verify journal entry
        self.assertIsNotNone(journal_entry)
        self.assertEqual(journal_entry.get_total_amount(), Decimal('100000.00'))
        self.assertEqual(journal_entry.workflow_reference, 'TRX-12345')
        
        # Verify journal entry lines
        lines = journal_entry.entries.all()
        self.assertEqual(lines.count(), 2)
        
        # Verify debit to bank
        debit_line = lines.filter(side=JournalEntryLine.DEBIT).first()
        self.assertEqual(debit_line.account, self.bank_account)
        self.assertEqual(debit_line.amount, Decimal('100000.00'))
        
        # Verify credit to AR
        credit_line = lines.filter(side=JournalEntryLine.CREDIT).first()
        self.assertEqual(credit_line.account, self.ar_account)
        self.assertEqual(credit_line.amount, Decimal('100000.00'))
    
    def test_route_payment_cash_without_cashier_account_auto_creates(self):
        """Cash payment with no cashier_account reuses/auto-creates the user's
        own cashier account instead of raising (see route_payment's
        docstring: "Auto-creates cashier accounts for cash payments if not
        provided")."""
        result = PaymentRoutingService.route_payment(
            amount=Decimal('50000.00'),
            payment_date=date.today(),
            payment_method='cash',
            client=self.client,
            reference_number='PMT-003',
            description='Test',
            user=self.user,
            ar_account=self.ar_account,
            cashier_account=None  # Not provided — should resolve automatically
        )

        # setUp already created an active cashier account for self.user in
        # self.branch, so route_payment should reuse it rather than creating
        # a second one — 'auto_created' just means "not explicitly passed by
        # the caller", not "a new row was inserted", so it's True either way.
        self.assertEqual(result['cashier_account'], self.cashier_account)
        self.assertTrue(result['auto_created'])
        self.assertEqual(result['route'], 'cash')
        self.assertIsNotNone(result['journal_entry'])
    
    def test_route_payment_bank_without_bank_account_raises_error(self):
        """Test that bank payment without bank account raises error"""
        with self.assertRaises(ValueError) as context:
            PaymentRoutingService.route_payment(
                amount=Decimal('100000.00'),
                payment_date=date.today(),
                payment_method='bank_transfer',
                client=self.client,
                reference_number='PMT-004',
                description='Test',
                user=self.user,
                ar_account=self.ar_account,
                bank_account=None  # Missing!
            )
        
        self.assertIn('Bank account required', str(context.exception))
    
    def test_route_payment_cash_success(self):
        """Test successful cash payment routing"""
        result = PaymentRoutingService.route_payment(
            amount=Decimal('60000.00'),
            payment_date=date.today(),
            payment_method='cash',
            client=self.client,
            reference_number='PMT-005',
            description='Cash payment test',
            user=self.user,
            ar_account=self.ar_account,
            cashier_account=self.cashier_account
        )
        
        # Verify routing
        self.assertEqual(result['route'], 'cash')
        self.assertIn('journal_entry', result)
        self.assertIn('cash_collection', result)
        self.assertIn('Cash payment recorded', result['message'])
        
        # Verify cash collection
        cash_collection = result['cash_collection']
        self.assertEqual(cash_collection.amount_collected, Decimal('60000.00'))
        self.assertTrue(cash_collection.is_posted)
    
    def test_route_payment_bank_success(self):
        """Test successful bank payment routing"""
        result = PaymentRoutingService.route_payment(
            amount=Decimal('150000.00'),
            payment_date=date.today(),
            payment_method='bank_transfer',
            client=self.client,
            reference_number='PMT-006',
            description='Bank payment test',
            user=self.user,
            ar_account=self.ar_account,
            bank_account=self.bank_account
        )
        
        # Verify routing
        self.assertEqual(result['route'], 'bank')
        self.assertIn('journal_entry', result)
        self.assertNotIn('cash_collection', result)
        self.assertIn('Bank payment recorded', result['message'])
        
        # Verify journal entry
        journal_entry = result['journal_entry']
        self.assertEqual(journal_entry.get_total_amount(), Decimal('150000.00'))
    
    def test_gl_balance_after_cash_payment(self):
        """Test that GL accounts are properly updated after cash payment"""
        # Get initial balances
        initial_cashier_balance = self.cashier_gl_account.balance
        initial_ar_balance = self.ar_account.balance
        
        # Record payment
        PaymentRoutingService.route_payment(
            amount=Decimal('80000.00'),
            payment_date=date.today(),
            payment_method='cash',
            client=self.client,
            reference_number='PMT-007',
            description='GL balance test',
            user=self.user,
            ar_account=self.ar_account,
            cashier_account=self.cashier_account
        )
        
        # Refresh GL accounts
        self.cashier_gl_account.refresh_from_db()
        self.ar_account.refresh_from_db()
        
        # Verify balances updated
        # Cashier account should increase (debit to asset)
        self.assertEqual(
            self.cashier_gl_account.balance,
            initial_cashier_balance + Decimal('80000.00')
        )
        
        # AR should decrease (credit to asset reduces it)
        self.assertEqual(
            self.ar_account.balance,
            initial_ar_balance - Decimal('80000.00')
        )
    
    def test_gl_balance_after_bank_payment(self):
        """Test that GL accounts are properly updated after bank payment"""
        # Get initial balances
        initial_bank_balance = self.bank_account.balance
        initial_ar_balance = self.ar_account.balance
        
        # Record payment
        PaymentRoutingService.route_payment(
            amount=Decimal('200000.00'),
            payment_date=date.today(),
            payment_method='bank_transfer',
            client=self.client,
            reference_number='PMT-008',
            description='GL balance test',
            user=self.user,
            ar_account=self.ar_account,
            bank_account=self.bank_account
        )
        
        # Refresh GL accounts
        self.bank_account.refresh_from_db()
        self.ar_account.refresh_from_db()
        
        # Verify balances updated
        # Bank account should increase (debit to asset)
        self.assertEqual(
            self.bank_account.balance,
            initial_bank_balance + Decimal('200000.00')
        )
        
        # AR should decrease (credit to asset reduces it)
        self.assertEqual(
            self.ar_account.balance,
            initial_ar_balance - Decimal('200000.00')
        )


class InvoicePaymentIntegrationTests(TestCase):
    """
    Integration tests for invoice payment with routing
    
    Tests the complete flow from invoice creation to payment recording
    """
    
    def setUp(self):
        """Set up test data"""
        # Setup similar to above
        self.user = User.objects.create_user(
            username='invoiceuser',
            email='invoice@example.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Invoice Branch',
            code='IB01',
            owner=self.user
        )
        self.user.branch = self.branch
        self.user.save()
        
        self.client = Client.objects.create(
            client_id='TEST-CLIENT-002',
            first_name='Invoice',
            last_name='Client',
            email='invoiceclient@example.com',
            phone_primary='9876543210',
            gender='female',
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent accounts
        self.cash_parent = Account.objects.create(
            code='101',
            name='Cash on Hand',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        self.cashier_gl_account = Account.objects.create(
            code='101-CSH2',
            name='Cashier 2 Cash Account',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.cash_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
        
        self.cashier_account = CashierAccount.objects.create(
            account_number='CASH-002',
            cashier=self.user,
            account=self.cashier_gl_account,
            name='Test Cashier 2',
            daily_collection_limit=Decimal('2000000.00'),
            current_balance=Decimal('0.00'),
            is_active=True,
            owner=self.user,
            branch=self.branch
        )
        
        self.bank_parent = Account.objects.create(
            code='102',
            name='Bank Accounts',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        self.bank_account = Account.objects.create(
            code='102-MAIN',
            name='Main Bank',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.bank_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
        
        self.ar_parent = Account.objects.create(
            code='140',
            name='Receivables',
            account_type='ASSET',
            account_level='PARENT',
            allow_manual_entries=False,
            owner=self.user,
            branch=self.branch
        )
        
        self.ar_account = Account.objects.create(
            code='140-002',
            name='AR - Invoices',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.ar_parent,
            allow_manual_entries=True,
            owner=self.user,
            branch=self.branch
        )
    
    def test_cash_payment_flow(self):
        """
        Test complete cash payment flow:
        1. Payment recorded
        2. CashCollection created
        3. GL entries correct
        4. Cashier account updated
        """
        result = PaymentRoutingService.route_payment(
            amount=Decimal('500000.00'),
            payment_date=date.today(),
            payment_method='cash',
            client=self.client,
            reference_number='INV-PMT-001',
            description='Invoice payment via cash',
            user=self.user,
            ar_account=self.ar_account,
            cashier_account=self.cashier_account,
            notes='Payment for invoice INV-001'
        )
        
        # Verify routing result
        self.assertEqual(result['route'], 'cash')
        self.assertIsNotNone(result['cash_collection'])
        self.assertIsNotNone(result['journal_entry'])
        
        # Verify cash collection
        cash_collection = result['cash_collection']
        self.assertEqual(cash_collection.amount_collected, Decimal('500000.00'))
        self.assertEqual(cash_collection.collection_mode, 'cash')
        self.assertTrue(cash_collection.is_posted)
        
        # Verify cashier account balance
        self.cashier_account.refresh_from_db()
        self.assertEqual(self.cashier_account.current_balance, Decimal('500000.00'))
        
        # Verify GL balances
        self.cashier_gl_account.refresh_from_db()
        self.ar_account.refresh_from_db()
        self.assertEqual(self.cashier_gl_account.balance, Decimal('500000.00'))
        self.assertEqual(self.ar_account.balance, Decimal('-500000.00'))  # Credit reduces asset
    
    def test_bank_payment_flow(self):
        """
        Test complete bank payment flow:
        1. Payment recorded
        2. No CashCollection (direct to bank)
        3. GL entries correct
        4. Bank account updated
        """
        result = PaymentRoutingService.route_payment(
            amount=Decimal('750000.00'),
            payment_date=date.today(),
            payment_method='bank_transfer',
            client=self.client,
            reference_number='INV-PMT-002',
            description='Invoice payment via bank',
            user=self.user,
            ar_account=self.ar_account,
            bank_account=self.bank_account
        )
        
        # Verify routing result
        self.assertEqual(result['route'], 'bank')
        self.assertNotIn('cash_collection', result)
        self.assertIsNotNone(result['journal_entry'])
        
        # Verify no cash collection created
        cash_collections = CashCollection.objects.filter(
            client=self.client,
            amount_collected=Decimal('750000.00')
        )
        self.assertEqual(cash_collections.count(), 0)
        
        # Verify GL balances
        self.bank_account.refresh_from_db()
        self.ar_account.refresh_from_db()
        self.assertEqual(self.bank_account.balance, Decimal('750000.00'))
        self.assertEqual(self.ar_account.balance, Decimal('-750000.00'))  # Credit reduces asset
