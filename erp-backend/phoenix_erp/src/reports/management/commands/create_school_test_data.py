"""
Management command to create school-related test data for PDF generation testing
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

from users.models import Tenant, User
from branches.models import Branch
from procurement.models import (
    Supplier, PurchaseRequisition, PurchaseRequisitionItem,
    PurchaseOrder, PurchaseOrderItem, GoodsReceivedNote, GoodsReceivedNoteItem
)
from inventory.models import InventoryItem, Location, InventoryCategory as Category
from accounts.models import Account



class Command(BaseCommand):
    help = 'Create school-related test data for PDF generation testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clean',
            action='store_true',
            help='Clean existing test data before creating new',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Creating school test data...'))

        try:
            with transaction.atomic():
                # Create or get test tenant (School)
                tenant, created = Tenant.objects.get_or_create(
                    slug='greenwood-academy',
                    defaults={
                        'name': 'Greenwood Academy',
                        'domain_type': 'school',
                        'domain_config': {
                            'school_type': 'secondary',
                            'student_capacity': 1200,
                            'staff_count': 85,
                        },
                        'settings': {
                            'address': '123 Education Lane\nSpringfield, IL 62701\nUnited States',
                            'phone': '(555) 123-4567',
                            'email': 'admin@greenwoodacademy.edu',
                            'website': 'www.greenwoodacademy.edu',
                            'tax_id': 'SCH-2024-1234',
                        },
                        'enabled_features': [
                            'procurement',
                            'inventory',
                            'accounts',
                            'reports'
                        ],
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created tenant: {tenant.name}'))
                else:
                    self.stdout.write(self.style.SUCCESS(f'✓ Using existing tenant: {tenant.name}'))

                # Create or get test user (School Admin)
                user, created = User.objects.get_or_create(
                    username='schooladmin',
                    defaults={
                        'tenant': tenant,
                        'email': 'admin@greenwoodacademy.edu',
                        'first_name': 'Sarah',
                        'last_name': 'Johnson',
                        'is_staff': True,
                        'is_active': True,
                    }
                )
                
                if created:
                    user.set_password('testpass123')
                    user.save()
                    self.stdout.write(self.style.SUCCESS(f'✓ Created user: {user.username}'))
                else:
                    self.stdout.write(self.style.SUCCESS(f'✓ Using existing user: {user.username}'))

                # Set tenant owner
                if not tenant.owner:
                    tenant.owner = user
                    tenant.save()

                # Create or get branch (Main Campus)
                branch, created = Branch.objects.get_or_create(
                    code='MAIN',
                    owner=user,
                    defaults={
                        'name': 'Main Campus',
                        'address': '123 Education Lane, Springfield, IL 62701',
                        'is_active': True,
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created branch: {branch.name}'))
                else:
                    self.stdout.write(self.style.SUCCESS(f'✓ Using existing branch: {branch.name}'))

                # Set user branch
                if not user.branch:
                    user.branch = branch
                    user.save()

                # Create inventory location (School Warehouse)
                location, created = Location.objects.get_or_create(
                    code='SCH-WAREHOUSE',
                    owner=user,
                    branch=branch,
                    defaults={
                        'name': 'School Warehouse',
                        'location_type': 'warehouse',
                        'is_active': True,
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created location: {location.name}'))

                # Create GL Accounts (required for inventory category)
                self.stdout.write('Creating GL accounts...')
                
                # Try to find existing accounts by code first
                try:
                    inventory_asset_account = Account.objects.get(code='150')
                    self.stdout.write(self.style.WARNING('  Using existing Inventory Asset account (150)'))
                except Account.DoesNotExist:
                    inventory_asset_account = Account.objects.create(
                        code='150',
                        name='Inventory Asset',
                        account_type=Account.ASSET,
                        account_level=Account.LEVEL_PARENT,
                        owner=user,
                        branch=branch
                    )
                    self.stdout.write(self.style.SUCCESS('✓ Created account: Inventory Asset (150)'))
                
                try:
                    cogs_expense_account = Account.objects.get(code='500')
                    self.stdout.write(self.style.WARNING('  Using existing COGS account (500)'))
                except Account.DoesNotExist:
                    cogs_expense_account = Account.objects.create(
                        code='500',
                        name='Cost of Goods Sold',
                        account_type=Account.EXPENSE,
                        account_level=Account.LEVEL_PARENT,
                        owner=user,
                        branch=branch
                    )
                    self.stdout.write(self.style.SUCCESS('✓ Created account: COGS (500)'))
                
                try:
                    sales_income_account = Account.objects.get(code='400')
                    self.stdout.write(self.style.WARNING('  Using existing Sales Revenue account (400)'))
                except Account.DoesNotExist:
                    sales_income_account = Account.objects.create(
                        code='400',
                        name='Sales Revenue',
                        account_type=Account.INCOME,
                        account_level=Account.LEVEL_PARENT,
                        owner=user,
                        branch=branch
                    )
                    self.stdout.write(self.style.SUCCESS('✓ Created account: Sales Revenue (400)'))

                # Create inventory category with GL accounts
                category, created = Category.objects.get_or_create(
                    code='EDU',
                    owner=user,
                    branch=branch,
                    defaults={
                        'name': 'Educational Supplies',
                        'inventory_account': inventory_asset_account,
                        'cogs_account': cogs_expense_account,
                        'sales_account': sales_income_account,
                    }
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created category: {category.name}'))

                # Skip category creation to avoid account requirements
                # We'll create items without categories

                # Create suppliers
                suppliers_data = [
                    {
                        'supplier_code': 'EDU-SUP-001',
                        'name': 'Educational Supplies Inc.',
                        'contact_person': 'Michael Brown',
                        'email': 'sales@edusupplies.com',
                        'phone': '(555) 234-5678',
                        'address': '456 Commerce Street\nChicago, IL 60601',
                        'tax_id': 'EIN-45-6789012',
                        'payment_terms': 'net_30',
                    },
                    {
                        'supplier_code': 'TXTBOOK-W',
                        'name': 'Textbook World Publishers',
                        'contact_person': 'Jennifer Davis',
                        'email': 'orders@textbookworld.com',
                        'phone': '(555) 345-6789',
                        'address': '789 Publishing Ave\nNew York, NY 10001',
                        'tax_id': 'EIN-78-9012345',
                        'payment_terms': 'net_60',
                    },
                    {
                        'supplier_code': 'TECH-EDU',
                        'name': 'Tech Education Solutions',
                        'contact_person': 'Robert Wilson',
                        'email': 'contact@techedu.com',
                        'phone': '(555) 456-7890',
                        'address': '321 Innovation Blvd\nSan Francisco, CA 94102',
                        'tax_id': 'EIN-12-3456789',
                        'payment_terms': 'net_30',
                    },
                ]

                suppliers = []
                for supplier_data in suppliers_data:
                    supplier_code = supplier_data['supplier_code']
                    supplier, created = Supplier.objects.get_or_create(
                        supplier_code=supplier_code,
                        owner=user,
                        branch=branch,
                        defaults=supplier_data
                    )
                    suppliers.append(supplier)
                    
                    if created:
                        self.stdout.write(self.style.SUCCESS(f'✓ Created supplier: {supplier.name}'))

                # Create inventory items
                items_data = [
                    {
                        'sku': 'TXTBK-MATH-11',
                        'name': 'Mathematics Textbook - Grade 11',
                        'description': 'Comprehensive mathematics textbook for 11th grade students',
                        'unit_of_measure': 'EA',
                        'category': category,
                        'cost_price': Decimal('45.00'),
                        'selling_price': Decimal('55.00'),
                    },
                    {
                        'sku': 'TXTBK-SCI-10',
                        'name': 'Science Textbook - Grade 10',
                        'description': 'Integrated science textbook covering physics, chemistry, and biology',
                        'unit_of_measure': 'EA',
                        'category': category,
                        'cost_price': Decimal('42.00'),
                        'selling_price': Decimal('52.00'),
                    },
                    {
                        'sku': 'NB-A4-RULED',
                        'name': 'A4 Ruled Notebooks',
                        'description': '200-page ruled notebooks for student note-taking',
                        'unit_of_measure': 'BOX',
                        'category': category,
                        'cost_price': Decimal('35.00'),
                        'selling_price': Decimal('45.00'),
                    },
                    {
                        'sku': 'PEN-BLUE-50PK',
                        'name': 'Blue Ballpoint Pens (50 pack)',
                        'description': 'Quality ballpoint pens in blue ink',
                        'unit_of_measure': 'PK',
                        'category': category,
                        'cost_price': Decimal('28.50'),
                        'selling_price': Decimal('35.00'),
                    },
                    {
                        'sku': 'WB-MARKER-SET',
                        'name': 'Whiteboard Marker Set',
                        'description': 'Assorted color whiteboard markers (12 pack)',
                        'unit_of_measure': 'SET',
                        'category': category,
                        'cost_price': Decimal('18.75'),
                        'selling_price': Decimal('25.00'),
                    },
                    {
                        'sku': 'LAB-GLASSWARE',
                        'name': 'Laboratory Glassware Set',
                        'description': 'Complete glassware set for science laboratory',
                        'unit_of_measure': 'SET',
                        'category': category,
                        'cost_price': Decimal('85.00'),
                        'selling_price': Decimal('110.00'),
                    },
                ]

                items = []
                for item_data in items_data:
                    sku = item_data['sku']
                    item, created = InventoryItem.objects.get_or_create(
                        sku=sku,
                        owner=user,
                        branch=branch,
                        defaults=item_data
                    )
                    items.append(item)
                    
                    if created:
                        self.stdout.write(self.style.SUCCESS(f'✓ Created item: {item.name}'))

                # Create Purchase Requisition
                pr, created = PurchaseRequisition.objects.get_or_create(
                    pr_number='PR-2024-001',
                    owner=user,
                    branch=branch,
                    defaults={
                        'requested_by': user,
                        'department': 'Academic Affairs',
                        'request_date': timezone.now().date(),
                        'required_by_date': (timezone.now() + timedelta(days=30)).date(),
                        'purpose': 'Q2 2024 classroom supplies and textbooks for new semester',
                        'status': 'approved',
                        'approved_by': user,
                        'approved_at': timezone.now(),
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created purchase requisition: {pr.pr_number}'))

                    # Create PR items
                    pr_items_data = [
                        (items[0], Decimal('150'), Decimal('45.00')),  # Math textbooks
                        (items[1], Decimal('150'), Decimal('42.00')),  # Science textbooks
                        (items[2], Decimal('50'), Decimal('35.00')),   # Notebooks (boxes)
                        (items[3], Decimal('25'), Decimal('28.50')),   # Pens
                    ]

                    for item, qty, price in pr_items_data:
                        PurchaseRequisitionItem.objects.create(
                            requisition=pr,
                            item=item,
                            description=item.name,
                            quantity=qty,
                            estimated_unit_price=price,
                        )

                    self.stdout.write(self.style.SUCCESS('✓ Created PR items'))

                # Create Purchase Order
                po, created = PurchaseOrder.objects.get_or_create(
                    po_number='PO-2024-0156',
                    owner=user,
                    branch=branch,
                    defaults={
                        'requisition': pr,
                        'supplier': suppliers[0],  # Educational Supplies Inc.
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
                        'notes': 'Please ensure all textbooks are the latest edition. Delivery to school warehouse between 8 AM - 4 PM on weekdays.',
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created purchase order: {po.po_number}'))

                    # Create PO items
                    po_items_data = [
                        (items[0], Decimal('150'), Decimal('45.00'), 'Latest edition with online access codes'),
                        (items[1], Decimal('150'), Decimal('42.00'), 'Updated curriculum version'),
                        (items[2], Decimal('50'), Decimal('35.00'), 'Each box contains 24 notebooks'),
                        (items[3], Decimal('25'), Decimal('28.50'), 'Premium quality, non-smudge ink'),
                        (items[4], Decimal('30'), Decimal('18.75'), 'For classroom use'),
                    ]

                    for item, qty, price, notes in po_items_data:
                        PurchaseOrderItem.objects.create(
                            purchase_order=po,
                            item=item,
                            description=item.description,
                            quantity=qty,
                            unit_price=price,
                            total_price=qty * price,
                            notes=notes,
                        )

                    # Calculate totals
                    po.calculate_totals()
                    po.tax_amount = po.subtotal * Decimal('0.08')  # 8% tax
                    po.shipping_cost = Decimal('125.00')
                    po.discount = Decimal('0.00')
                    po.total_amount = po.subtotal + po.tax_amount + po.shipping_cost - po.discount
                    po.save()
                    
                    self.stdout.write(self.style.SUCCESS('✓ Created PO items and calculated totals'))

                # Create Goods Received Note
                grn, created = GoodsReceivedNote.objects.get_or_create(
                    grn_number='GRN-2024-0089',
                    owner=user,
                    branch=branch,
                    defaults={
                        'purchase_order': po,
                        'supplier': suppliers[0],  # Educational Supplies Inc.
                        'received_date': timezone.now().date(),
                        'received_location': location,
                        'received_by': user,
                        'quality_status': 'passed',
                        'inspection_notes': 'All items received in good condition. Minor packaging damage on 2 boxes of notebooks but contents intact.',
                    }
                )
                
                if created:
                    self.stdout.write(self.style.SUCCESS(f'✓ Created goods received note: {grn.grn_number}'))

                    # Create GRN items
                    for po_item in po.items.all():
                        # Simulate slight variance in received quantities
                        if po_item.item.sku == 'NB-A4-RULED':
                            qty_received = po_item.quantity - Decimal('2')  # 2 boxes damaged
                            qty_rejected = Decimal('2')
                            condition_note = 'Minor box damage'
                        else:
                            qty_received = po_item.quantity
                            qty_rejected = Decimal('0')
                            condition_note = 'Quality inspection passed'

                        GoodsReceivedNoteItem.objects.create(
                            grn=grn,
                            item=po_item.item,
                            po_item=po_item,
                            quantity_ordered=po_item.quantity,
                            quantity_received=qty_received,
                            quantity_accepted=qty_received,
                            quantity_rejected=qty_rejected,
                            unit_cost=po_item.unit_price,
                            total_cost=qty_received * po_item.unit_price,
                            condition_notes=condition_note,
                        )

                    self.stdout.write(self.style.SUCCESS('✓ Created GRN items'))

                # Summary
                self.stdout.write('\n' + '='*60)
                self.stdout.write(self.style.SUCCESS('✓ School test data created successfully!'))
                self.stdout.write('='*60)
                self.stdout.write(f'\nTenant: {tenant.name} (ID: {tenant.id})')
                self.stdout.write(f'User: {user.username} (Password: testpass123)')
                self.stdout.write(f'Branch: {branch.name}')
                self.stdout.write(f'Suppliers: {len(suppliers)}')
                self.stdout.write(f'Inventory Items: {len(items)}')
                self.stdout.write(f'\nPurchase Requisition: {pr.pr_number}')
                self.stdout.write(f'Purchase Order: {po.po_number} (ID: {po.id})')
                self.stdout.write(f'  - Subtotal: ${po.subtotal}')
                self.stdout.write(f'  - Tax: ${po.tax_amount}')
                self.stdout.write(f'  - Shipping: ${po.shipping_cost}')
                self.stdout.write(f'  - Total: ${po.total_amount}')
                self.stdout.write(f'Goods Received Note: {grn.grn_number} (ID: {grn.id})')
                self.stdout.write('\n' + '='*60)
                self.stdout.write(self.style.SUCCESS('\nTest the PDFs with:'))
                self.stdout.write(f'Purchase Order: GET /api/reports/pdf/purchase-order/{po.id}/')
                self.stdout.write(f'GRN: GET /api/reports/pdf/goods-received-note/{grn.id}/')
                self.stdout.write('='*60 + '\n')

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error creating test data: {str(e)}'))
            raise
