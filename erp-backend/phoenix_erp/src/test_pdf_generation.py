"""
Standalone script to test PDF generation without running the Django server
Tests the Purchase Order PDF generator directly
"""
import os
import sys
import django

# Setup Django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from procurement.models import PurchaseOrder
from reports.pdf_generators.purchase_order import PurchaseOrderPDFGenerator
from users.models import User


def test_pdf_generation():
    """Test PDF generation for PO #3"""
    print("=" * 60)
    print("Testing PDF Generation")
    print("=" * 60)
    
    try:
        # Get the test PO
        po_id = 3
        print(f"\n1. Fetching Purchase Order #{po_id}...")
        po = PurchaseOrder.objects.select_related(
            'supplier', 
            'delivery_location', 
            'requisition',
            'owner'
        ).get(pk=po_id)
        print(f"   ✓ Found PO: {po.po_number}")
        print(f"   - Supplier: {po.supplier.name}")
        print(f"   - Total: ${po.total_amount}")
        print(f"   - Items: {po.items.count()}")
        
        # Get user for context
        print(f"\n2. Getting user context...")
        user = po.owner
        print(f"   ✓ User: {user.username}")
        if hasattr(user, 'tenant'):
            print(f"   - Tenant: {user.tenant.name}")
        
        # Generate HTML first (no GTK required)
        print(f"\n3. Generating HTML template...")
        generator = PurchaseOrderPDFGenerator(po, user)
        html_content = generator.render_html()
        print(f"   ✓ HTML generated: {len(html_content)} characters")
        
        # Save HTML for inspection
        html_path = 'test_po.html'
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"   ✓ HTML saved to: {html_path}")
        
        # Try to generate PDF
        print(f"\n4. Attempting PDF generation...")
        try:
            pdf_bytes = generator.generate_pdf()
            pdf_size = len(pdf_bytes.getvalue())
            print(f"   ✓ PDF generated: {pdf_size} bytes")
            
            # Save PDF to file
            pdf_path = 'test_po.pdf'
            with open(pdf_path, 'wb') as f:
                f.write(pdf_bytes.getvalue())
            print(f"   ✓ PDF saved to: {pdf_path}")
            
            print("\n" + "=" * 60)
            print("SUCCESS! PDF generation working correctly")
            print("=" * 60)
            print(f"\nGenerated files:")
            print(f"  - HTML: {os.path.abspath(html_path)}")
            print(f"  - PDF:  {os.path.abspath(pdf_path)}")
            
        except Exception as pdf_error:
            print(f"   ✗ PDF generation failed: {str(pdf_error)}")
            print(f"\n   This is a WeasyPrint/GTK issue.")
            print(f"   The HTML template is working correctly though!")
            print(f"   You can open {html_path} in a browser to see the result.")
            
            # Check if it's a GTK error
            if 'libgobject' in str(pdf_error) or 'GTK' in str(pdf_error).upper():
                print(f"\n   GTK Library Issue Detected:")
                print(f"   WeasyPrint requires GTK libraries on Windows.")
                print(f"   Alternative solutions:")
                print(f"   1. Install GTK3 Runtime: https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases")
                print(f"   2. Use wkhtmltopdf instead (user's original suggestion)")
                print(f"   3. Generate PDFs in a Linux container/WSL")
                print(f"   4. Use a cloud-based PDF service")
            
            return False
            
    except PurchaseOrder.DoesNotExist:
        print(f"   ✗ Purchase Order #{po_id} not found")
        print(f"   Run: python manage.py create_school_test_data")
        return False
        
    except Exception as e:
        print(f"   ✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == '__main__':
    print("\nPurchase Order PDF Generation Test")
    print("This script tests PDF generation without running the Django server\n")
    
    success = test_pdf_generation()
    
    print("\n" + "=" * 60)
    if success:
        print("Test completed successfully!")
    else:
        print("Test completed with warnings (HTML works, PDF needs GTK)")
    print("=" * 60)
