"""
Test to verify unified invoice model structure
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from incomes.models import Invoice, InvoiceItem

def test_invoice_model_structure():
    """Test that the Invoice and InvoiceItem models have the correct structure"""
    print("=" * 60)
    print("Testing Unified Invoice Model Structure")
    print("=" * 60)
    
    try:
        # Check Invoice model fields
        print("\n✓ Checking Invoice model fields...")
        invoice_fields = [f.name for f in Invoice._meta.get_fields()]
        
        required_invoice_fields = [
            'invoice_number', 'invoice_date', 'due_date', 'client',
            'subtotal', 'discount_amount', 'tax_amount', 'total_amount',
            'amount_paid', 'status', 'is_posted', 'posted_at', 'posted_by'
        ]
        
        missing_fields = [f for f in required_invoice_fields if f not in invoice_fields]
        if missing_fields:
            print(f"❌ Missing Invoice fields: {missing_fields}")
            return False
        
        print(f"  ✓ All required fields present: {', '.join(required_invoice_fields)}")
        
        # Check InvoiceItem model fields
        print("\n✓ Checking InvoiceItem model fields...")
        item_fields = [f.name for f in InvoiceItem._meta.get_fields()]
        
        required_item_fields = [
            'invoice', 'item_type', 'fee_structure', 'inventory_item',
            'description', 'quantity', 'unit_price', 'line_total'
        ]
        
        missing_item_fields = [f for f in required_item_fields if f not in item_fields]
        if missing_item_fields:
            print(f"❌ Missing InvoiceItem fields: {missing_item_fields}")
            return False
        
        print(f"  ✓ All required fields present: {', '.join(required_item_fields)}")
        
        # Check InvoiceItem choices
        print("\n✓ Checking InvoiceItem item_type choices...")
        item_type_field = InvoiceItem._meta.get_field('item_type')
        choices = [choice[0] for choice in item_type_field.choices]
        expected_choices = ['service', 'inventory', 'custom']
        
        if set(choices) != set(expected_choices):
            print(f"❌ InvoiceItem item_type choices don't match")
            print(f"   Expected: {expected_choices}")
            print(f"   Got: {choices}")
            return False
        
        print(f"  ✓ Item types correct: {', '.join(choices)}")
        
        # Check relationships
        print("\n✓ Checking relationships...")
        
        # Invoice -> InvoiceItem (reverse relation)
        if 'items' not in [f.name for f in Invoice._meta.get_fields()]:
            print("❌ Invoice missing 'items' reverse relation")
            return False
        print("  ✓ Invoice has 'items' reverse relation to InvoiceItem")
        
        # InvoiceItem -> Invoice
        invoice_relation = InvoiceItem._meta.get_field('invoice')
        if invoice_relation.related_model != Invoice:
            print("❌ InvoiceItem 'invoice' field doesn't point to Invoice model")
            return False
        print("  ✓ InvoiceItem has 'invoice' relation to Invoice")
        
        # Check methods
        print("\n✓ Checking Invoice methods...")
        invoice_methods = dir(Invoice)
        
        required_methods = ['calculate_totals', 'update_totals']
        missing_methods = [m for m in required_methods if m not in invoice_methods]
        
        if missing_methods:
            print(f"❌ Missing Invoice methods: {missing_methods}")
            return False
        
        print(f"  ✓ All required methods present: {', '.join(required_methods)}")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nUnified Invoice System Model Structure:")
        print("  • Invoice model: Enhanced with line item support")
        print("  • InvoiceItem model: Supports 3 types (service, inventory, custom)")
        print("  • Relationships: Invoice <--> InvoiceItem (one-to-many)")
        print("  • Methods: calculate_totals(), update_totals()")
        print("  • Fields: subtotal, discount_amount, tax_amount, total_amount")
        print("\n✓ Ready for API integration and frontend development!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_invoice_model_structure()
    exit(0 if success else 1)
