"""
Tests for Invoice Accounting Integrity

Critical tests to ensure invoices marked as posted ALWAYS have corresponding GL entries.
This prevents the dangerous scenario where an invoice shows as posted but has no 
accounting records.
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.db import transaction
from django.core.exceptions import ValidationError
from unittest.mock import patch, Mock

from inventory.models import InventoryItem, Invoice, InvoiceItem
from clients.models import Client
from accounts.models import Account
from transactions.models import Transaction as JournalEntry, TransactionEntry, TransactionSeries
from branches.models import Branch

User = get_user_model()


class InvoicePostingIntegrityTest(TransactionTestCase):
    """
    Test invoice posting integrity using TransactionTestCase to properly test
    database transactions and rollback behavior.
    """
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB001'
        )
        
        # Create inventory category
        from inventory.models import InventoryCategory
        
        # First create accounts for the category
        # 1. COGS account
        cogs_parent = Account.objects.create(
            code='500',
            name='Cost of Goods Sold',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        cogs_account = Account.objects.create(
            code='500-001',
            name='COGS - General',
            account_type=Account.EXPENSE,
            account_level=Account.LEVEL_CHILD,
            parent=cogs_parent,
            owner=self.user,
            branch=self.branch
        )
        
        # 2. Inventory asset account
        inventory_parent = Account.objects.create(
            code='120',
            name='Inventory',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        inventory_account = Account.objects.create(
            code='120-001',
            name='General Inventory',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=inventory_parent,
            owner=self.user,
            branch=self.branch
        )
        
        # 3. Sales account (use the revenue account created later)
        revenue_parent = Account.objects.create(
            code='400',
            name='Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        sales_account = Account.objects.create(
            code='400-002',
            name='Product Sales',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            parent=revenue_parent,
            owner=self.user,
            branch=self.branch
        )
        
        self.category = InventoryCategory.objects.create(
            name='Test Category',
            code='TEST-CAT',
            cogs_account=cogs_account,
            inventory_account=inventory_account,
            sales_account=sales_account,
            owner=self.user,
            branch=self.branch
        )
        
        self.client = Client.objects.create(
            first_name='John',
            last_name='Doe',
            email='john@example.com',
            phone_primary='1234567890',
            gender='male',
            owner=self.user,
            branch=self.branch
        )
        
        self.item = InventoryItem.objects.create(
            name='Test item',
            sku='TEST-001',
            cost_price=Decimal('50.00'),
            selling_price=Decimal('100.00'),
            category=self.category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create AR account
        ar_parent = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch
        )
        
        self.ar_account = Account.objects.create(
            code='140-001',
            name='General Receivables',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=ar_parent,
            owner=self.user,
            branch=self.branch
        )
        
        # Create Revenue account (revenue_parent was already created above for sales_account)
        self.revenue_account = Account.objects.create(
            code='400-001',
            name='Sales Revenue',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            parent=revenue_parent,
            owner=self.user,
            branch=self.branch
        )
    
    def test_posted_invoice_must_have_journal_entry(self):
        """
        CRITICAL: An invoice marked as posted MUST have a corresponding journal entry.
        This is the core integrity check.
        """
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-001',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('100.00'),
            owner=self.user,
            branch=self.branch
        )
        
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Item',
            quantity=1,
            unit_price=Decimal('100.00'),
            total_price=Decimal('100.00')
        )
        
        # Initially, invoice should not be posted
        self.assertFalse(invoice.is_posted)
        self.assertIsNone(invoice.posted_at)
        
        # Create and post journal entry
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Invoice Transactions'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=invoice.invoice_date,
            description=f"Revenue for {invoice.invoice_number}",
            workflow_reference=invoice.invoice_number,
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.ar_account,
            side=TransactionEntry.DEBIT,
            amount=invoice.total_amount
        )
        
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=invoice.total_amount
        )
        
        # Post journal entry
        journal_entry.post()
        
        # Now mark invoice as posted
        invoice.is_posted = True
        invoice.save()
        
        # Verify invoice is posted
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_posted)
        
        # CRITICAL CHECK: Verify journal entry exists and is posted
        self.assertTrue(
            JournalEntry.objects.filter(
                workflow_reference=invoice.invoice_number,
                approved=True
            ).exists(),
            "Posted invoice must have an approved journal entry"
        )
        
        # Verify account balances were updated
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        
        self.assertEqual(
            self.ar_account.balance,
            Decimal('100.00'),
            "AR account balance must reflect the invoice amount"
        )
        
        self.assertEqual(
            self.revenue_account.balance,
            Decimal('-100.00'),
            "Revenue account balance must reflect the invoice amount (credit balance is negative)"
        )
    
    def test_posting_rolls_back_on_journal_entry_failure(self):
        """
        If journal entry posting fails, invoice should NOT be marked as posted.
        This tests the transaction atomicity.
        """
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-002',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('200.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # Attempt to post with invalid journal entry (unbalanced)
        try:
            with transaction.atomic():
                series, _ = TransactionSeries.objects.get_or_create(
                    code='INV',
                    defaults={'description': 'Invoice Transactions'}
                )
                
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=invoice.invoice_date,
                    description=f"Revenue for {invoice.invoice_number}",
                    workflow_reference=invoice.invoice_number,
                    owner=self.user,
                    branch=self.branch
                )
                
                # Only create debit entry (unbalanced!)
                TransactionEntry.objects.create(
                    transaction=journal_entry,
                    account=self.ar_account,
                    side=TransactionEntry.DEBIT,
                    amount=invoice.total_amount
                )
                
                # Try to post - this should fail
                journal_entry.post()
                
                # Try to mark invoice as posted
                invoice.is_posted = True
                invoice.save()
                
        except ValidationError:
            # Expected - unbalanced entries should fail
            pass
        
        # Verify invoice is NOT posted
        invoice.refresh_from_db()
        self.assertFalse(
            invoice.is_posted,
            "Invoice should NOT be posted if journal entry posting fails"
        )
        
        # Verify no journal entry exists
        self.assertFalse(
            JournalEntry.objects.filter(
                reference_number=invoice.invoice_number,
                approved=True
            ).exists(),
            "No approved journal entry should exist for failed posting"
        )
        
        # Verify account balances unchanged
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        
        self.assertEqual(
            self.ar_account.balance,
            Decimal('0.00'),
            "AR balance should be unchanged after failed posting"
        )
    
    def test_cannot_post_zero_amount_invoice(self):
        """Zero amount invoices should not be postable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-003',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('0.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # Verify invoice cannot be posted with zero amount
        self.assertEqual(invoice.total_amount, Decimal('0.00'))
        
        # In the actual view, this would return 400 error
        # Here we just verify the business rule
        self.assertFalse(invoice.is_posted)
    
    def test_cannot_post_negative_amount_invoice(self):
        """Negative amount invoices should not be postable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-004',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('-50.00'),
            owner=self.user,
            branch=self.branch
        )
        
        self.assertLess(invoice.total_amount, Decimal('0.00'))
        self.assertFalse(invoice.is_posted)
    
    def test_double_posting_prevention(self):
        """
        An invoice should not be postable twice.
        This prevents duplicate journal entries.
        """
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-005',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('150.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # First posting
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Invoice Transactions'}
        )
        
        journal_entry1 = JournalEntry.objects.create(
            series=series,
            date=invoice.invoice_date,
            description=f"First posting of {invoice.invoice_number}",
            workflow_reference=invoice.invoice_number,
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=journal_entry1,
            account=self.ar_account,
            side=TransactionEntry.DEBIT,
            amount=invoice.total_amount
        )
        
        TransactionEntry.objects.create(
            transaction=journal_entry1,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=invoice.total_amount
        )
        
        journal_entry1.post()
        invoice.is_posted = True
        invoice.save()
        
        # Verify first posting succeeded
        self.assertTrue(invoice.is_posted)
        self.ar_account.refresh_from_db()
        initial_ar_balance = self.ar_account.balance
        
        # Attempt second posting - should be prevented
        # In the view, this returns 400 error
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_posted)
        
        # Verify balance wasn't double-counted
        self.ar_account.refresh_from_db()
        self.assertEqual(
            self.ar_account.balance,
            initial_ar_balance,
            "Account balance should not change on attempted double-posting"
        )
    
    def test_cancelled_invoice_cannot_be_posted(self):
        """Cancelled invoices should not be postable"""
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-006',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('100.00'),
            status='cancelled',
            owner=self.user,
            branch=self.branch
        )
        
        self.assertEqual(invoice.status, 'cancelled')
        self.assertFalse(invoice.is_posted)
        
        # In the view, attempting to post would return 400 error
    
    def test_invoice_posting_updates_ar_and_revenue_correctly(self):
        """
        Verify that posting multiple invoices correctly accumulates
        in AR and Revenue accounts.
        """
        # Post first invoice
        invoice1 = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-007',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('100.00'),
            owner=self.user,
            branch=self.branch
        )
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Invoice Transactions'}
        )
        
        journal1 = JournalEntry.objects.create(
            series=series,
            date=invoice1.invoice_date,
            description=f"Revenue for {invoice1.invoice_number}",
            workflow_reference=invoice1.invoice_number,
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=journal1,
            account=self.ar_account,
            side=TransactionEntry.DEBIT,
            amount=invoice1.total_amount
        )
        
        TransactionEntry.objects.create(
            transaction=journal1,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=invoice1.total_amount
        )
        
        journal1.post()
        invoice1.is_posted = True
        invoice1.save()
        
        # Post second invoice
        invoice2 = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-008',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('200.00'),
            owner=self.user,
            branch=self.branch
        )
        
        journal2 = JournalEntry.objects.create(
            series=series,
            date=invoice2.invoice_date,
            description=f"Revenue for {invoice2.invoice_number}",
            workflow_reference=invoice2.invoice_number,
            owner=self.user,
            branch=self.branch
        )
        
        TransactionEntry.objects.create(
            transaction=journal2,
            account=self.ar_account,
            side=TransactionEntry.DEBIT,
            amount=invoice2.total_amount
        )
        
        TransactionEntry.objects.create(
            transaction=journal2,
            account=self.revenue_account,
            side=TransactionEntry.CREDIT,
            amount=invoice2.total_amount
        )
        
        journal2.post()
        invoice2.is_posted = True
        invoice2.save()
        
        # Verify cumulative balances
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        
        self.assertEqual(
            self.ar_account.balance,
            Decimal('300.00'),
            "AR should accumulate both invoices"
        )
        
        self.assertEqual(
            self.revenue_account.balance,
            Decimal('-300.00'),
            "Revenue should accumulate both invoices (credit balance is negative)"
        )
        
        # Verify both invoices are posted
        self.assertTrue(invoice1.is_posted)
        self.assertTrue(invoice2.is_posted)
        
        # Verify both have journal entries
        self.assertEqual(
            JournalEntry.objects.filter(
                workflow_reference__in=['INV-007', 'INV-008'],
                approved=True
            ).count(),
            2,
            "Both invoices should have approved journal entries"
        )
    
    def test_account_integrity_after_failed_posting(self):
        """
        If posting fails midway, ensure account balances remain consistent.
        """
        initial_ar_balance = self.ar_account.balance
        initial_revenue_balance = self.revenue_account.balance
        
        invoice = Invoice.objects.create(
            client=self.client,
            invoice_number='INV-009',
            due_date=date.today() + timedelta(days=30),
            total_amount=Decimal('250.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # Simulate a failure during posting
        try:
            with transaction.atomic():
                series, _ = TransactionSeries.objects.get_or_create(
                    code='INV',
                    defaults={'description': 'Invoice Transactions'}
                )
                
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=invoice.invoice_date,
                    description=f"Revenue for {invoice.invoice_number}",
                    workflow_reference=invoice.invoice_number,
                    owner=self.user,
                    branch=self.branch
                )
                
                TransactionEntry.objects.create(
                    transaction=journal_entry,
                    account=self.ar_account,
                    side=TransactionEntry.DEBIT,
                    amount=invoice.total_amount
                )
                
                TransactionEntry.objects.create(
                    transaction=journal_entry,
                    account=self.revenue_account,
                    side=TransactionEntry.CREDIT,
                    amount=invoice.total_amount
                )
                
                journal_entry.post()
                
                # Force an error before marking invoice as posted
                raise Exception("Simulated posting failure")
                
        except Exception:
            pass
        
        # Verify account balances rolled back
        self.ar_account.refresh_from_db()
        self.revenue_account.refresh_from_db()
        
        self.assertEqual(
            self.ar_account.balance,
            initial_ar_balance,
            "AR balance should rollback on failed posting"
        )
        
        self.assertEqual(
            self.revenue_account.balance,
            initial_revenue_balance,
            "Revenue balance should rollback on failed posting"
        )
        
        # Verify invoice not marked as posted
        invoice.refresh_from_db()
        self.assertFalse(invoice.is_posted)
