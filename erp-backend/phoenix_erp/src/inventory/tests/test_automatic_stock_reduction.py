# inventory/tests/test_automatic_stock_reduction.py
"""
Tests for automatic stock reduction when invoices are posted
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from decimal import Decimal

from inventory.models import (
    InventoryItem, InventoryStock, Location, Invoice, InvoiceItem,
    Client, InventoryCategory, StockMovement
)
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
from accounts.models import Account, AccountCategory
from branches.models import Branch

User = get_user_model()


class AutomaticStockReductionTests(TestCase):
    """Test automatic stock reduction on invoice posting"""
    
    def setUp(self):
        """Set up test data"""
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            owner=self.user
        )
        
        # Create location
        self.location = Location.objects.create(
            name='Main Warehouse',
            code='WH-MAIN',
            location_type='warehouse',
            branch=self.branch,
            owner=self.user
        )
        
        # Create account category for current assets
        self.asset_category = AccountCategory.objects.create(
            section=1,  # Assets
            name='Current Assets',
            code_prefix='1',
            owner=self.user,
            branch=self.branch
        )
        
        # Create account category for COGS
        self.expense_category = AccountCategory.objects.create(
            section=5,  # Expenses
            name='Cost of Goods Sold',
            code_prefix='5',
            owner=self.user,
            branch=self.branch
        )
        
        # Create account category for revenue
        self.revenue_category = AccountCategory.objects.create(
            section=4,  # Income/Revenue
            name='Sales Revenue',
            code_prefix='4',
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent account for current assets
        self.asset_parent = Account.objects.create(
            code='1000',
            name='Current Assets',
            account_type='asset',
            account_level='PARENT',
            category=self.asset_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent account for expenses
        self.expense_parent = Account.objects.create(
            code='5000',
            name='Operating Expenses',
            account_type='expense',
            account_level='PARENT',
            category=self.expense_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create parent account for revenue
        self.revenue_parent = Account.objects.create(
            code='4000',
            name='Sales Revenue',
            account_type='revenue',
            account_level='PARENT',
            category=self.revenue_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create child accounts for inventory and COGS
        self.inventory_account = Account.objects.create(
            code='1200',
            name='Inventory',
            account_type='asset',
            account_level='CHILD',
            parent=self.asset_parent,
            category=self.asset_category,
            owner=self.user,
            branch=self.branch
        )
        
        self.cogs_account = Account.objects.create(
            code='5010',
            name='Cost of Goods Sold',
            account_type='expense',
            account_level='CHILD',
            parent=self.expense_parent,
            category=self.expense_category,
            owner=self.user,
            branch=self.branch
        )
        
        self.sales_account = Account.objects.create(
            code='4010',
            name='Sales Revenue',
            account_type='revenue',
            account_level='CHILD',
            parent=self.revenue_parent,
            category=self.revenue_category,
            owner=self.user,
            branch=self.branch
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            name='General Supplies',
            code='GEN',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            name='Test Notebook',
            sku='NB-001',
            category=self.category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            valuation_method='average',
            owner=self.user,
            branch=self.branch
        )
        
        # Create stock record with initial quantity
        self.stock = InventoryStock.objects.create(
            item=self.item,
            location=self.location,
            quantity_on_hand=Decimal('100'),
            quantity_available=Decimal('100'),
            average_cost=Decimal('10.00'),
            total_value=Decimal('1000.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # Create client
        self.client_obj = Client.objects.create(
            first_name='Test',
            last_name='School',
            phone_primary='1234567890',
            gender='male',
            owner=self.user,
            branch=self.branch
        )
    
    def test_stock_reduced_when_invoice_posted(self):
        """Test that stock is reduced when invoice is posted"""
        # Create invoice
        invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Add invoice item
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Verify initial stock
        self.stock.refresh_from_db()
        initial_quantity = self.stock.quantity_on_hand
        self.assertEqual(initial_quantity, Decimal('100'))
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Verify stock was reduced
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, Decimal('90'))
        self.assertEqual(self.stock.quantity_available, Decimal('90'))
        
        # Verify invoice is posted
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_posted)
        self.assertIsNotNone(invoice.posted_at)
        self.assertEqual(invoice.posted_by, self.user)
    
    def test_stock_movement_created(self):
        """Test that stock movement record is created"""
        # Create invoice
        invoice = Invoice.objects.create(
            invoice_number='INV-002',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Add invoice item
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('5'),
            unit_price=Decimal('15.00')
        )
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Verify stock movement was created
        movement = StockMovement.objects.filter(
            item=self.item,
            movement_type='sale',
            reference_number='INV-002'
        ).first()
        
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, Decimal('5'))
        self.assertEqual(movement.from_location, self.location)
    
    def test_cogs_journal_entry_created(self):
        """Test that COGS journal entry is created"""
        # Create invoice
        invoice = Invoice.objects.create(
            invoice_number='INV-003',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Add invoice item
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Verify COGS journal entry was created
        # Expected: Dr COGS 100.00 (10 units x 10.00 cost), Cr Inventory 100.00
        journal_entries = JournalEntry.objects.filter(
            workflow_reference='INV-003'
        )
        
        self.assertTrue(journal_entries.exists())
        journal_entry = journal_entries.first()
        
        # Check debit to COGS
        cogs_line = JournalEntryLine.objects.filter(
            transaction=journal_entry,
            account=self.cogs_account,
            side=JournalEntryLine.DEBIT
        ).first()
        
        self.assertIsNotNone(cogs_line)
        self.assertEqual(cogs_line.amount, Decimal('100.00'))
        
        # Check credit to Inventory
        inventory_line = JournalEntryLine.objects.filter(
            transaction=journal_entry,
            account=self.inventory_account,
            side=JournalEntryLine.CREDIT
        ).first()
        
        self.assertIsNotNone(inventory_line)
        self.assertEqual(inventory_line.amount, Decimal('100.00'))
    
    def test_multiple_items_reduced(self):
        """Test that multiple items on invoice are all reduced"""
        # Create second item
        item2 = InventoryItem.objects.create(
            name='Test Pen',
            sku='PEN-001',
            category=self.category,
            cost_price=Decimal('2.00'),
            selling_price=Decimal('3.00'),
            valuation_method='average',
            owner=self.user,
            branch=self.branch
        )
        
        stock2 = InventoryStock.objects.create(
            item=item2,
            location=self.location,
            quantity_on_hand=Decimal('200'),
            quantity_available=Decimal('200'),
            average_cost=Decimal('2.00'),
            total_value=Decimal('400.00'),
            owner=self.user,
            branch=self.branch
        )
        
        # Create invoice with two items
        invoice = Invoice.objects.create(
            invoice_number='INV-004',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        InvoiceItem.objects.create(
            invoice=invoice,
            item=item2,
            description='Test Pen',
            quantity=Decimal('50'),
            unit_price=Decimal('3.00')
        )
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Verify both stocks were reduced
        self.stock.refresh_from_db()
        stock2.refresh_from_db()
        
        self.assertEqual(self.stock.quantity_on_hand, Decimal('90'))
        self.assertEqual(stock2.quantity_on_hand, Decimal('150'))
    
    def test_prevent_double_posting(self):
        """Test that invoice cannot be posted twice"""
        # Create invoice
        invoice = Invoice.objects.create(
            invoice_number='INV-005',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Post the invoice
        result1 = invoice.post(user=self.user)
        self.assertTrue(result1)
        
        # Verify stock after first posting
        self.stock.refresh_from_db()
        quantity_after_first_post = self.stock.quantity_on_hand
        
        # Try to post again
        result2 = invoice.post(user=self.user)
        self.assertFalse(result2)  # Should return False
        
        # Verify stock was NOT reduced again
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, quantity_after_first_post)
    
    def test_service_item_skipped(self):
        """Test that invoice items without inventory item are skipped"""
        # Create invoice
        invoice = Invoice.objects.create(
            invoice_number='INV-006',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Add service item (no inventory item link)
        InvoiceItem.objects.create(
            invoice=invoice,
            item=None,  # Service item
            description='Consulting Service',
            quantity=Decimal('1'),
            unit_price=Decimal('500.00')
        )
        
        # Add inventory item
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('5'),
            unit_price=Decimal('15.00')
        )
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Verify only inventory item stock was reduced
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, Decimal('95'))
        
        # Verify stock movement only for inventory item
        movements = StockMovement.objects.filter(reference_number='INV-006')
        self.assertEqual(movements.count(), 1)
        self.assertEqual(movements.first().item, self.item)
    
    def test_insufficient_stock_error(self):
        """Test handling when insufficient stock available"""
        # Set stock to very low amount
        self.stock.quantity_on_hand = Decimal('5')
        self.stock.quantity_available = Decimal('5')
        self.stock.save()
        
        # Create invoice requesting more than available
        invoice = Invoice.objects.create(
            invoice_number='INV-007',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),  # More than available
            unit_price=Decimal('15.00')
        )
        
        # Post the invoice - should not raise exception but log error
        # Invoice posts successfully, but stock reduction fails
        invoice.post(user=self.user)
        
        # Invoice is posted even though stock reduction failed
        invoice.refresh_from_db()
        self.assertTrue(invoice.is_posted)
        
        # Stock should remain unchanged (reduction failed)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_on_hand, Decimal('5'))
    
    def test_empty_invoice_cannot_be_posted(self):
        """Test that invoice with no items cannot be posted"""
        # Create invoice with no items
        invoice = Invoice.objects.create(
            invoice_number='INV-008',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Try to post - should raise ValidationError
        with self.assertRaises(ValidationError):
            invoice.post(user=self.user)
