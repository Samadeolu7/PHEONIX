# inventory/tests/test_stock_reservation.py
"""
Tests for automatic stock reservation when invoices are created
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal

from inventory.models import (
    InventoryItem, InventoryStock, Location, Invoice, InvoiceItem,
    Client, InventoryCategory
)
from accounts.models import Account, AccountCategory
from branches.models import Branch

User = get_user_model()


class StockReservationTests(TestCase):
    """Test automatic stock reservation on invoice creation"""
    
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
        
        # Create account categories and accounts (simplified)
        self.asset_category = AccountCategory.objects.create(
            section=1, name='Current Assets', code_prefix='1',
            owner=self.user, branch=self.branch
        )
        self.expense_category = AccountCategory.objects.create(
            section=5, name='COGS', code_prefix='5',
            owner=self.user, branch=self.branch
        )
        self.revenue_category = AccountCategory.objects.create(
            section=4, name='Revenue', code_prefix='4',
            owner=self.user, branch=self.branch
        )
        
        self.asset_parent = Account.objects.create(
            code='1000', name='Assets', account_type='asset',
            account_level='PARENT', category=self.asset_category,
            owner=self.user, branch=self.branch
        )
        self.expense_parent = Account.objects.create(
            code='5000', name='Expenses', account_type='expense',
            account_level='PARENT', category=self.expense_category,
            owner=self.user, branch=self.branch
        )
        self.revenue_parent = Account.objects.create(
            code='4000', name='Revenue', account_type='revenue',
            account_level='PARENT', category=self.revenue_category,
            owner=self.user, branch=self.branch
        )
        
        self.inventory_account = Account.objects.create(
            code='1200', name='Inventory', account_type='asset',
            account_level='CHILD', parent=self.asset_parent,
            category=self.asset_category, owner=self.user, branch=self.branch
        )
        self.cogs_account = Account.objects.create(
            code='5010', name='COGS', account_type='expense',
            account_level='CHILD', parent=self.expense_parent,
            category=self.expense_category, owner=self.user, branch=self.branch
        )
        self.sales_account = Account.objects.create(
            code='4010', name='Sales', account_type='revenue',
            account_level='CHILD', parent=self.revenue_parent,
            category=self.revenue_category, owner=self.user, branch=self.branch
        )
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            name='General Supplies', code='GEN',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            owner=self.user, branch=self.branch
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            name='Test Notebook', sku='NB-001',
            category=self.category,
            cost_price=Decimal('10.00'),
            selling_price=Decimal('15.00'),
            valuation_method='average',
            owner=self.user, branch=self.branch
        )
        
        # Create stock record with initial quantity
        self.stock = InventoryStock.objects.create(
            item=self.item,
            location=self.location,
            quantity_on_hand=Decimal('100'),
            quantity_reserved=Decimal('0'),
            quantity_available=Decimal('100'),
            average_cost=Decimal('10.00'),
            total_value=Decimal('1000.00'),
            owner=self.user, branch=self.branch
        )
        
        # Create client
        self.client_obj = Client.objects.create(
            first_name='Test', last_name='School',
            phone_primary='1234567890', gender='male',
            owner=self.user, branch=self.branch
        )
    
    def test_stock_reserved_on_invoice_item_creation(self):
        """Test that stock is reserved when invoice item is created"""
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
        
        # Add invoice item - should trigger reservation
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice,
            item=self.item,
            description='Test Notebook',
            quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Refresh stock and invoice item
        self.stock.refresh_from_db()
        invoice_item.refresh_from_db()
        
        # Verify stock was reserved
        self.assertEqual(self.stock.quantity_on_hand, Decimal('100'))  # Unchanged
        self.assertEqual(self.stock.quantity_reserved, Decimal('10'))  # Reserved
        self.assertEqual(self.stock.quantity_available, Decimal('90'))  # Reduced
        
        # Verify invoice item tracks the reservation
        self.assertEqual(invoice_item.reserved_quantity, Decimal('10'))
        self.assertEqual(invoice_item.reserved_from_location, self.location)
        self.assertFalse(invoice_item.is_reservation_released)
    
    def test_multiple_invoices_reserve_correctly(self):
        """Test that multiple invoices can reserve from same stock"""
        # Create first invoice
        invoice1 = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        InvoiceItem.objects.create(
            invoice=invoice1, item=self.item,
            description='Notebook', quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Create second invoice
        invoice2 = Invoice.objects.create(
            invoice_number='INV-002',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        InvoiceItem.objects.create(
            invoice=invoice2, item=self.item,
            description='Notebook', quantity=Decimal('20'),
            unit_price=Decimal('15.00')
        )
        
        # Verify total reservations
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_reserved, Decimal('30'))
        self.assertEqual(self.stock.quantity_available, Decimal('70'))
    
    def test_reservation_released_on_posting(self):
        """Test that reservation is released when invoice is posted"""
        # Create invoice with item
        invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice, item=self.item,
            description='Notebook', quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Verify initial reservation
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_reserved, Decimal('10'))
        self.assertEqual(self.stock.quantity_available, Decimal('90'))
        
        # Post the invoice
        invoice.post(user=self.user)
        
        # Refresh everything
        self.stock.refresh_from_db()
        invoice_item.refresh_from_db()
        
        # Verify reservation was released
        self.assertEqual(self.stock.quantity_reserved, Decimal('0'))
        # Stock should be reduced
        self.assertEqual(self.stock.quantity_on_hand, Decimal('90'))
        # Available = on_hand - reserved
        self.assertEqual(self.stock.quantity_available, Decimal('90'))
        
        # Verify reservation marked as released
        self.assertTrue(invoice_item.is_reservation_released)
    
    def test_reservation_released_on_item_deletion(self):
        """Test that reservation is released when invoice item is deleted"""
        # Create invoice with item
        invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice, item=self.item,
            description='Notebook', quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Verify reservation
        self.stock.refresh_from_db()
        initial_reserved = self.stock.quantity_reserved
        self.assertEqual(initial_reserved, Decimal('10'))
        
        # Delete the invoice item
        invoice_item.delete()
        
        # Verify reservation was released
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_reserved, Decimal('0'))
        self.assertEqual(self.stock.quantity_available, Decimal('100'))
    
    def test_insufficient_stock_prevents_reservation(self):
        """Test that invoice item creation fails if insufficient stock"""
        # Set stock to low amount
        self.stock.quantity_on_hand = Decimal('5')
        self.stock.quantity_available = Decimal('5')
        self.stock.save()
        
        # Try to create invoice with more than available
        invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # This should create the item but fail to reserve (logged as error)
        invoice_item = InvoiceItem.objects.create(
            invoice=invoice, item=self.item,
            description='Notebook', quantity=Decimal('10'),
            unit_price=Decimal('15.00')
        )
        
        # Refresh
        invoice_item.refresh_from_db()
        
        # Reservation should have failed (quantity stays 0)
        self.assertEqual(invoice_item.reserved_quantity, Decimal('0'))
        self.assertIsNone(invoice_item.reserved_from_location)
    
    def test_service_items_not_reserved(self):
        """Test that items without inventory link don't reserve stock"""
        invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date='2026-02-01',
            due_date='2026-03-01',
            branch=self.branch,
            owner=self.user,
            created_by=self.user
        )
        
        # Create service item (no inventory link)
        service_item = InvoiceItem.objects.create(
            invoice=invoice,
            item=None,  # No inventory item
            description='Consulting Service',
            quantity=Decimal('1'),
            unit_price=Decimal('500.00')
        )
        
        # Verify no reservation
        service_item.refresh_from_db()
        self.assertEqual(service_item.reserved_quantity, Decimal('0'))
        self.assertIsNone(service_item.reserved_from_location)
        
        # Stock should be unchanged
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity_reserved, Decimal('0'))
