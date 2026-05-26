"""
Test script for unified invoice system with mixed line items
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from incomes.models import Invoice, InvoiceItem, FeeStructure
from inventory.models import InventoryItem
from clients.models import Client
from users.models import User
from django.utils import timezone
from decimal import Decimal

def test_unified_invoice():
    """Test creating an invoice with mixed line items"""
    print("=" * 60)
    print("Testing Unified Invoice System")
    print("=" * 60)
    
    try:
        # Get or create test user
        user = User.objects.filter(is_active=True).first()
        if not user:
            print("❌ No active users found.")
            return
        print(f"✓ Using user: {user.username}")
        
        # Get or create test client
        client, created = Client.objects.get_or_create(
            name="Test Client",
            defaults={
                'email': 'test@example.com',
                'phone': '1234567890',
                'owner': user,
                'tenant': getattr(user, 'tenant', user),
                'branch': user.branch if hasattr(user, 'branch') else None
            }
        )
        if created:
            print(f"✓ Created test client: {client.name}")
        else:
            print(f"✓ Using existing client: {client.name}")
        
        # Get test fee structure (service)
        fee_structure = FeeStructure.objects.first()
        if fee_structure:
            print(f"✓ Found fee structure: {fee_structure.name}")
        else:
            print("⚠ No fee structure found - will create custom service item")
        
        # Get test inventory item
        inventory_item = InventoryItem.objects.first()
        if inventory_item:
            print(f"✓ Found inventory item: {inventory_item.name}")
        else:
            print("⚠ No inventory items found - will skip inventory line item")
        
        print("\n" + "-" * 60)
        print("Creating Invoice with Mixed Line Items")
        print("-" * 60)
        
        # Create invoice
        invoice = Invoice.objects.create(
            client=client,
            invoice_number="TEST-INV-001",
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description="Test invoice with mixed items",
            notes="This is a test invoice",
            discount_amount=Decimal('10.00'),
            status='draft',
            owner=user,
            branch=user.branch if hasattr(user, 'branch') else None,
            tenant=getattr(user, 'tenant', user)
        )
        print(f"✓ Invoice created: {invoice.invoice_number}")
        
        # Add service line item (linked to fee structure)
        if fee_structure:
            service_item = InvoiceItem.objects.create(
                invoice=invoice,
                item_type='service',
                fee_structure=fee_structure,
                description=f"Service: {fee_structure.name}",
                quantity=Decimal('1.00'),
                unit_price=fee_structure.amount,
                line_total=fee_structure.amount,
                owner=user,
                tenant=getattr(user, 'tenant', user)
            )
            print(f"✓ Service item added: {service_item.description} - ${service_item.line_total}")
        
        # Add custom service line item
        custom_item = InvoiceItem.objects.create(
            invoice=invoice,
            item_type='custom',
            description="Custom consulting service",
            quantity=Decimal('5.00'),
            unit_price=Decimal('100.00'),
            line_total=Decimal('500.00'),
            owner=user,
            tenant=getattr(user, 'tenant', user)
        )
        print(f"✓ Custom item added: {custom_item.description} - ${custom_item.line_total}")
        
        # Add inventory line item
        if inventory_item:
            inventory_line = InvoiceItem.objects.create(
                invoice=invoice,
                item_type='inventory',
                inventory_item=inventory_item,
                description=f"Product: {inventory_item.name}",
                quantity=Decimal('2.00'),
                unit_price=inventory_item.unit_cost or Decimal('50.00'),
                line_total=Decimal('100.00') if inventory_item.unit_cost is None else inventory_item.unit_cost * 2,
                owner=user,
                tenant=getattr(user, 'tenant', user)
            )
            print(f"✓ Inventory item added: {inventory_line.description} - ${inventory_line.line_total}")
        
        # Calculate totals
        invoice.update_totals()
        print("\n" + "-" * 60)
        print("Invoice Totals")
        print("-" * 60)
        print(f"Subtotal:        ${invoice.subtotal}")
        print(f"Discount:       -${invoice.discount_amount}")
        print(f"Tax:            +${invoice.tax_amount}")
        print(f"Total Amount:    ${invoice.total_amount}")
        print(f"Amount Paid:     ${invoice.amount_paid}")
        print(f"Balance:         ${invoice.balance}")
        
        # Verify line items
        items = invoice.items.all()
        print(f"\n✓ Total line items: {items.count()}")
        
        print("\n" + "-" * 60)
        print("Line Items Breakdown")
        print("-" * 60)
        for i, item in enumerate(items, 1):
            print(f"{i}. Type: {item.item_type}")
            print(f"   Description: {item.description}")
            print(f"   Quantity: {item.quantity} × ${item.unit_price} = ${item.line_total}")
            if item.fee_structure:
                print(f"   Fee Structure: {item.fee_structure.name}")
            if item.inventory_item:
                print(f"   Inventory Item: {item.inventory_item.name}")
            print()
        
        print("=" * 60)
        print("✅ TEST PASSED: Unified Invoice System Working!")
        print("=" * 60)
        
        # Cleanup
        print("\nCleaning up test data...")
        invoice.delete()
        print("✓ Test invoice deleted")
        
        # Delete test client if created
        if created:
            client.delete()
            print("✓ Test client deleted")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_unified_invoice()
