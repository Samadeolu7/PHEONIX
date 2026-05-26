"""
Quick test script for PDF generation with school data
Run this after creating test data with: python manage.py create_school_test_data

Or use this script to create data programmatically if Django environment is available
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.db import transaction

from users.models import Tenant, User
from branches.models import Branch
from procurement.models import Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceivedNote, GoodsReceivedNoteItem
from inventory.models import InventoryItem, Location, Category


def create_school_test_data():
    """Create minimal school test data for PDF testing"""
    print("=" * 60)
    print("Creating School Test Data for PDF Generation")
    print("=" * 60)
    
    with transaction.atomic():
        # Get or create tenant
        tenant, _ = Tenant.objects.get_or_create(
            slug='greenwood-academy',
            defaults={
                'name': 'Greenwood Academy',
                'domain_type': 'school',
                'settings': {
                    'address': '123 Education Lane\nSpringfield, IL 62701',
                    'phone': '(555) 123-4567',
                    'email': 'admin@greenwoodacademy.edu',
                    'website': 'www.greenwoodacademy.edu',
                },
            }
        )
        print(f"✓ Tenant: {tenant.name}")
        
        # Get or create user
        user, created = User.objects.get_or_create(
            username='schooladmin',
            defaults={
                'tenant': tenant,
                'email': 'admin@greenwoodacademy.edu',
                'first_name': 'Sarah',
                'last_name': 'Johnson',
            }
        )
        if created:
            user.set_password('testpass123')
            user.save()
        print(f"✓ User: {user.username}")
        
        # Get or create branch
        branch, _ = Branch.objects.get_or_create(
            code='MAIN-CAMPUS',
            owner=tenant,
            defaults={
                'name': 'Main Campus',
                'address': '123 Education Lane, Springfield, IL 62701',
            }
        )
        print(f"✓ Branch: {branch.name}")
        
        user.branch = branch
        user.save()
        
        # Get or create location
        location, _ = Location.objects.get_or_create(
            code='SCH-WAREHOUSE',
            owner=tenant,
            branch=branch,
            defaults={'name': 'School Warehouse', 'location_type': 'warehouse'}
        )
        print(f"✓ Location: {location.name}")
        
        # Get or create supplier
        supplier, _ = Supplier.objects.get_or_create(
            supplier_code='EDU-SUPPLIES-001',
            owner=tenant,
            branch=branch,
            defaults={
                'name': 'Educational Supplies Inc.',
                'contact_person': 'Michael Brown',
                'email': 'sales@edusupplies.com',
                'phone': '(555) 234-5678',
                'address': '456 Commerce Street\nChicago, IL 60601',
                'payment_terms': 'net_30',
            }
        )
        print(f"✓ Supplier: {supplier.name}")
        
        # Create category
        category, _ = Category.objects.get_or_create(
            code='SCHOOL-SUPPLIES',
            owner=tenant,
            branch=branch,
            defaults={'name': 'School Supplies'}
        )
        
        # Create inventory items
        items_data = [
            ('TXTBK-MATH-11', 'Mathematics Textbook - Grade 11'),
            ('TXTBK-SCI-10', 'Science Textbook - Grade 10'),
            ('NB-A4-RULED', 'A4 Ruled Notebooks'),
            ('PEN-BLUE-50PK', 'Blue Ballpoint Pens (50 pack)'),
        ]
        
        items = []
        for code, name in items_data:
            item, _ = InventoryItem.objects.get_or_create(
                item_code=code,
                owner=tenant,
                branch=branch,
                defaults={
                    'sku': code,
                    'name': name,
                    'description': f'{name} for educational use',
                    'category': category,
                }
            )
            items.append(item)
        print(f"✓ Created {len(items)} inventory items")
        
        # Create Purchase Order
        po, created = PurchaseOrder.objects.get_or_create(
            po_number='PO-2024-0156',
            owner=tenant,
            branch=branch,
            defaults={
                'supplier': supplier,
                'order_date': timezone.now().date(),
                'expected_delivery_date': (timezone.now() + timedelta(days=21)).date(),
                'delivery_location': location,
                'contact_person': 'Sarah Johnson',
                'contact_phone': '(555) 123-4567',
                'contact_email': 'admin@greenwoodacademy.edu',
                'payment_terms': 'net_30',
                'status': 'approved',
                'approved_by': user,
                'approved_at': timezone.now(),
                'notes': 'Please ensure all textbooks are the latest edition.',
            }
        )
        
        if created:
            # Create PO items
            po_items_data = [
                (items[0], 150, 45.00, 'Latest edition'),
                (items[1], 150, 42.00, 'Updated curriculum'),
                (items[2], 50, 35.00, '24 notebooks per box'),
                (items[3], 25, 28.50, 'Premium quality'),
            ]
            
            for item, qty, price, notes in po_items_data:
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    item=item,
                    description=item.description,
                    quantity=Decimal(str(qty)),
                    unit_price=Decimal(str(price)),
                    total_price=Decimal(str(qty * price)),
                    notes=notes,
                )
            
            po.calculate_totals()
            po.tax_amount = po.subtotal * Decimal('0.08')
            po.shipping_cost = Decimal('125.00')
            po.total_amount = po.subtotal + po.tax_amount + po.shipping_cost
            po.save()
            
        print(f"✓ Purchase Order: {po.po_number} (ID: {po.id})")
        print(f"  Total: ${po.total_amount}")
        
        # Create GRN
        grn, created = GoodsReceivedNote.objects.get_or_create(
            grn_number='GRN-2024-0089',
            owner=tenant,
            branch=branch,
            defaults={
                'purchase_order': po,
                'received_date': timezone.now().date(),
                'location': location,
                'received_by': user,
                'status': 'completed',
                'notes': 'All items received in good condition.',
            }
        )
        
        if created:
            for po_item in po.items.all():
                GoodsReceivedNoteItem.objects.create(
                    grn=grn,
                    po_item=po_item,
                    quantity_received=po_item.quantity,
                    quantity_accepted=po_item.quantity,
                    quantity_rejected=Decimal('0'),
                )
        
        print(f"✓ Goods Received Note: {grn.grn_number} (ID: {grn.id})")
        
        print("\n" + "=" * 60)
        print("TEST DATA CREATED SUCCESSFULLY!")
        print("=" * 60)
        print("\nTest the PDFs with:")
        print(f"  Purchase Order: /api/reports/pdf/purchase-order/{po.id}/")
        print(f"  GRN: /api/reports/pdf/goods-received-note/{grn.id}/")
        print("\nOr in browser (after authentication):")
        print(f"  http://localhost:8000/api/reports/pdf/purchase-order/{po.id}/?download=true")
        print(f"  http://localhost:8000/api/reports/pdf/goods-received-note/{grn.id}/?download=true")
        print("=" * 60)


if __name__ == '__main__':
    create_school_test_data()
