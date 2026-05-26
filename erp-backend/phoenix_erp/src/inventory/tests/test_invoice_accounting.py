"""
Test invoice accounting integration

Verifies that:
1. Invoice posting creates correct revenue recognition journal entries
2. Payment recording creates correct cash/AR journal entries
3. Account balances are updated correctly
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction

from inventory.models import Invoice, InvoiceItem
from accounts.models import Account
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
from clients.models import Client
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


class InvoiceAccountingTests(TestCase):
    """Test invoice accounting integration"""
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        This catches any double-entry accounting errors
        """
        from django.db.models import Sum
        
        # Calculate total debits and credits across all transaction entries
        total_debits = JournalEntryLine.objects.filter(
            side=JournalEntryLine.DEBIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_credits = JournalEntryLine.objects.filter(
            side=JournalEntryLine.CREDIT
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
        self.tenant = Tenant.objects.create(name="Test Tenant")
        
        # Create branch
        self.branch = Branch.objects.create(
            name="Main Branch",
            code="MAIN",
            tenant=self.tenant
        )
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            email='test@example.com',
            tenant=self.tenant,
            branch=self.branch
        )
        
        # Create client
        self.client = Client.objects.create(
            client_id="CLI-001",
            first_name="Test",
            last_name="Client",
            gender="male",
            email="client@test.com",
            phone_primary="1234567890",
            owner=self.user,
            branch=self.branch
        )
        
        # Create accounts
        # Create parent accounts first
        ar_parent = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type='ASSET',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        revenue_parent = Account.objects.create(
            code='400',
            name='Revenue',
            account_type='REVENUE',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create child accounts
        self.ar_account = Account.objects.create(
            code='140-001',
            name='General Receivables',
            account_type='ASSET',
            account_level='CHILD',
            parent=ar_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.revenue_account = Account.objects.create(
            code='400-001',
            name='Sales Revenue',
            account_type='REVENUE',
            account_level='CHILD',
            parent=revenue_parent,
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        self.cash_account = Account.objects.create(
            code='101',
            name='Cash on Hand',
            account_type='ASSET',
            account_level='PARENT',
            owner=self.user,
            branch=self.branch,
            tenant=self.tenant
        )
        
        # Create invoice (without items since we're testing accounting only)
        self.invoice = Invoice.objects.create(
            invoice_number="INV-001",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            client=self.client,
            subtotal=Decimal('200.00'),
            discount=Decimal('0.00'),
            tax_amount=Decimal('0.00'),
            total_amount=Decimal('200.00'),
            amount_paid=Decimal('0.00'),
            status='sent',
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
    
    def test_invoice_posting_creates_journal_entry(self):
        """Test that posting an invoice creates revenue recognition journal entry"""
        # Verify invoice is not posted
        self.assertFalse(self.invoice.is_posted)
        self.assertIsNone(self.invoice.posted_at)
        
        # Get initial account balances
        initial_ar_balance = self.ar_account.balance
        initial_revenue_balance = self.revenue_account.balance
        
        # Post invoice (simulating the post() endpoint)
        from django.db import transaction as db_transaction
        
        with db_transaction.atomic():
            # Create journal entry
            journal_entry = JournalEntry.objects.create(
                entry_date=self.invoice.invoice_date,
                reference_number=self.invoice.invoice_number,
                description=f"Revenue recognition for invoice {self.invoice.invoice_number}",
                total_amount=self.invoice.total_amount,
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            # Dr. AR
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.ar_account,
                side=JournalEntryLine.DEBIT,
                amount=self.invoice.total_amount
            )
            
            # Cr. Revenue
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.revenue_account,
                side=JournalEntryLine.CREDIT,
                amount=self.invoice.total_amount
            )
            
            # Post journal entry
            journal_entry.post()
            
            # Update invoice
            self.invoice.is_posted = True
            self.invoice.posted_at = timezone.now()
            self.invoice.save()
        
        # Refresh invoice from database
        self.invoice.refresh_from_db()
        
        # Verify invoice is posted
        self.assertTrue(self.invoice.is_posted)
        self.assertIsNotNone(self.invoice.posted_at)
        
        # Verify journal entry exists
        journal_entries = JournalEntry.objects.filter(
            reference_number=self.invoice.invoice_number
        )
        self.assertEqual(journal_entries.count(), 1)
        
        journal_entry = journal_entries.first()
        self.assertEqual(journal_entry.total_amount, Decimal('200.00'))
        
        # Verify journal entry lines
        lines = journal_entry.entries.all()
        self.assertEqual(lines.count(), 2)
        
        # Check AR debit
        ar_line = lines.filter(account=self.ar_account, side=JournalEntryLine.DEBIT).first()
        self.assertIsNotNone(ar_line)
        self.assertEqual(ar_line.amount, Decimal('200.00'))
        
        # Check Revenue credit
        revenue_line = lines.filter(account=self.revenue_account, side=JournalEntryLine.CREDIT).first()
        self.assertIsNotNone(revenue_line)
        self.assertEqual(revenue_line.amount, Decimal('200.00'))
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after invoice posting")
        
        # Verify account balances updated
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        
        self.assertEqual(
            self.ar_account.balance,
            initial_ar_balance + Decimal('200.00'),
            "AR account should increase by invoice amount"
        )
        self.assertEqual(
            self.revenue_account.balance,
            initial_revenue_balance + Decimal('200.00'),
            "Revenue account should increase by invoice amount"
        )
    
    def test_payment_recording_creates_journal_entry(self):
        """Test that recording payment creates cash/AR journal entry"""
        # First post the invoice to create AR
        with db_transaction.atomic():
            journal_entry = JournalEntry.objects.create(
                entry_date=self.invoice.invoice_date,
                reference_number=self.invoice.invoice_number,
                description=f"Revenue recognition for invoice {self.invoice.invoice_number}",
                total_amount=self.invoice.total_amount,
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.ar_account,
                side=JournalEntryLine.DEBIT,
                amount=self.invoice.total_amount
            )
            
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.revenue_account,
                side=JournalEntryLine.CREDIT,
                amount=self.invoice.total_amount
            )
            
            journal_entry.post()
            
            self.invoice.is_posted = True
            self.invoice.posted_at = timezone.now()
            self.invoice.save()
        
        # Get initial balances after posting invoice
        self.ar_account.refresh_from_db()
        self.cash_account.refresh_from_db()
        ar_balance_after_invoice = self.ar_account.balance
        cash_balance_before_payment = self.cash_account.balance
        
        # Record payment
        payment_amount = Decimal('100.00')
        
        with db_transaction.atomic():
            # Create payment journal entry
            payment_entry = JournalEntry.objects.create(
                entry_date=timezone.now().date(),
                reference_number=f"PMT-{self.invoice.invoice_number}",
                description=f"Payment for invoice {self.invoice.invoice_number}",
                total_amount=payment_amount,
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            # Dr. Cash
            JournalEntryLine.objects.create(
                transaction=payment_entry,
                account=self.cash_account,
                side=JournalEntryLine.DEBIT,
                amount=payment_amount
            )
            
            # Cr. AR
            JournalEntryLine.objects.create(
                transaction=payment_entry,
                account=self.ar_account,
                side=JournalEntryLine.CREDIT,
                amount=payment_amount
            )
            
            # Post payment
            payment_entry.post()
            
            # Update invoice
            self.invoice.amount_paid += payment_amount
            self.invoice.status = 'partial'
            self.invoice.save()
        
        # Verify payment journal entry
        payment_entries = JournalEntry.objects.filter(
            reference_number=f"PMT-{self.invoice.invoice_number}"
        )
        self.assertEqual(payment_entries.count(), 1)
        
        # Verify account balances
        self.ar_account.refresh_from_db()
        self.cash_account.refresh_from_db()
        
        self.assertEqual(
            self.cash_account.balance,
            cash_balance_before_payment + payment_amount,
            "Cash should increase by payment amount"
        )
        self.assertEqual(
            self.ar_account.balance,
            ar_balance_after_invoice - payment_amount,
            "AR should decrease by payment amount"
        )
        
        # Verify invoice updated
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.amount_paid, payment_amount)
        self.assertEqual(self.invoice.status, 'partial')
        self.assertEqual(self.invoice.balance, Decimal('100.00'))
    
    def test_full_invoice_workflow(self):
        """Test complete invoice workflow: post invoice, receive payment, verify balances"""
        # Initial balances
        initial_ar = self.ar_account.balance
        initial_revenue = self.revenue_account.balance
        initial_cash = self.cash_account.balance
        
        # Step 1: Post invoice (recognize revenue)
        with db_transaction.atomic():
            journal_entry = JournalEntry.objects.create(
                entry_date=self.invoice.invoice_date,
                reference_number=self.invoice.invoice_number,
                description=f"Revenue recognition for invoice {self.invoice.invoice_number}",
                total_amount=self.invoice.total_amount,
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.ar_account,
                side=JournalEntryLine.DEBIT,
                amount=self.invoice.total_amount
            )
            
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.revenue_account,
                side=JournalEntryLine.CREDIT,
                amount=self.invoice.total_amount
            )
            
            journal_entry.post()
            
            self.invoice.is_posted = True
            self.invoice.posted_at = timezone.now()
            self.invoice.save()
        
        # Step 2: Receive full payment
        with db_transaction.atomic():
            payment_entry = JournalEntry.objects.create(
                entry_date=timezone.now().date(),
                reference_number=f"PMT-{self.invoice.invoice_number}",
                description=f"Payment for invoice {self.invoice.invoice_number}",
                total_amount=self.invoice.total_amount,
                owner=self.user,
                branch=self.branch,
                created_by=self.user
            )
            
            JournalEntryLine.objects.create(
                transaction=payment_entry,
                account=self.cash_account,
                side=JournalEntryLine.DEBIT,
                amount=self.invoice.total_amount
            )
            
            JournalEntryLine.objects.create(
                transaction=payment_entry,
                account=self.ar_account,
                side=JournalEntryLine.CREDIT,
                amount=self.invoice.total_amount
            )
            
            payment_entry.post()
            
            self.invoice.amount_paid = self.invoice.total_amount
            self.invoice.status = 'paid'
            self.invoice.save()
        
        # Verify final balances
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        self.cash_account.refresh_from_db()        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after full invoice workflow")        
        # AR: +200 (invoice) -200 (payment) = 0 net change
        self.assertEqual(self.ar_account.balance, initial_ar, "AR should return to initial balance after full payment")
        
        # Revenue: +200 (invoice posted)
        self.assertEqual(self.revenue_account.balance, initial_revenue + Decimal('200.00'), "Revenue should increase by invoice amount")
        
        # Cash: +200 (payment received)
        self.assertEqual(self.cash_account.balance, initial_cash + Decimal('200.00'), "Cash should increase by payment amount")
        
        # Verify invoice status
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, 'paid')
        self.assertEqual(self.invoice.balance, Decimal('0.00'))
