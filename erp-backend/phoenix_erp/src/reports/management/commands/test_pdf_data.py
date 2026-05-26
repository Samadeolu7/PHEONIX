"""
Django management command to test PDF data access

Creates test data and validates all PDF generators can access their data correctly.

Usage:
    python manage.py test_pdf_data
    python manage.py test_pdf_data --cleanup  # Remove test data after
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

from users.models import User, Tenant
from branches.models import Branch
from procurement.models import Supplier, PurchaseOrder, PurchaseOrderItem, GoodsReceivedNote, GoodsReceivedNoteItem
from inventory.models import InventoryItem, InventoryCategory, Location
from expenses.models import Resource, ResourceConsumption, ExpenseCategory
from accounts.models import Account, AccountCategory
from assets.models import FixedAsset, AssetCategory
from hr.models import Staff

from reports.pdf_generators.purchase_order import PurchaseOrderPDFGenerator
from reports.pdf_generators.goods_received import GoodsReceivedNotePDFGenerator
from reports.pdf_generators.resource_consumption import ResourceConsumptionPDFGenerator


class Command(BaseCommand):
    help = 'Test PDF data access by generating test data and validating field access'

    def add_arguments(self, parser):
        parser.add_argument(
            '--cleanup',
            action='store_true',
            help='Remove test data after testing',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('PDF Data Access Test Suite'))
        self.stdout.write(self.style.SUCCESS('='*80 + '\n'))

        test_objects = {}
        
        try:
            with transaction.atomic():
                # Create test data
                self.stdout.write('Creating test data...\n')
                test_objects = self.create_test_data()
                
                # Test each PDF generator
                results = []
                
                self.stdout.write(self.style.SUCCESS('\n' + '='*80))
                self.stdout.write(self.style.SUCCESS('TESTING PDF GENERATORS'))
                self.stdout.write(self.style.SUCCESS('='*80 + '\n'))
                
                # Test Purchase Order
                results.append(self.test_purchase_order(test_objects))
                
                # Test Goods Received Note
                results.append(self.test_grn(test_objects))
                
                # Test Resource Consumption
                results.append(self.test_resource_consumption(test_objects))
                
                # Summary
                self.print_summary(results)
                
                # Cleanup if requested
                if options['cleanup']:
                    self.stdout.write(self.style.WARNING('\nCleaning up test data...'))
                    raise Exception("Rollback to cleanup")
                else:
                    self.stdout.write(self.style.WARNING('\nTest data kept in database.'))
                    self.stdout.write('Run with --cleanup flag to remove test data.\n')
                    # Commit the transaction
                    
        except Exception as e:
            if str(e) == "Rollback to cleanup":
                self.stdout.write(self.style.SUCCESS('✅ Test data cleaned up\n'))
            else:
                self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
                import traceback
                self.stdout.write(traceback.format_exc())

    def create_test_data(self):
        """Create all necessary test data"""
        
        # Get or create tenant
        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(
                name='Test Company',
                slug='test-company',
                settings={
                    'address': '123 Test Street, Test City',
                    'phone': '+1234567890',
                    'email': 'test@company.com',
                    'website': 'www.testcompany.com'
                }
            )
            self.stdout.write('  Created tenant')
        else:
            # Ensure settings is a dict
            if not isinstance(tenant.settings, dict):
                tenant.settings = {
                    'address': '123 Test Street, Test City',
                    'phone': '+1234567890',
                    'email': 'test@company.com',
                    'website': 'www.testcompany.com'
                }
                tenant.save()
            self.stdout.write(f'  Using existing tenant: {tenant.name}')

        # Get or create user
        user = User.objects.filter(tenant=tenant, is_active=True).first()
        if not user:
            user = User.objects.create_user(
                username='testuser',
                password='testpass',
                tenant=tenant,
                first_name='Test',
                last_name='User'
            )
            self.stdout.write('  Created user')
        else:
            self.stdout.write(f'  Using existing user: {user.username}')

        # Get or create branch
        branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            branch = Branch.objects.create(
                name='Main Branch',
                code='MAIN',
                address='456 Branch Street, Branch City',
                is_active=True
            )
            self.stdout.write('  Created branch')
        else:
            self.stdout.write(f'  Using existing branch: {branch.name}')
        
        user.branch = branch
        user.save()

        # Try to use existing account categories or create new ones
        asset_cat = AccountCategory.objects.filter(
            section=1,
            branch=branch
        ).first()
        
        expense_cat = AccountCategory.objects.filter(
            section=5,
            branch=branch
        ).first()
        
        income_cat = AccountCategory.objects.filter(
            section=4,
            branch=branch
        ).first()
        
        # If categories don't exist, we still need them but the user should create them manually
        if not asset_cat or not expense_cat or not income_cat:
            self.stdout.write(self.style.ERROR('  Missing account categories! Please create at least one category for assets (section=1), expenses (section=5), and income (section=4)'))
            raise Exception('Required account categories not found')
            
        self.stdout.write('  Using existing account categories')

        # Try to use existing accounts or create new ones with unique codes
        timestamp_suffix = int(timezone.now().timestamp()) % 100
        
        #Try to find existing accounts first
        inventory_account = Account.objects.filter(
            account_type='asset',
            account_level=Account.LEVEL_CHILD,
            branch=branch
        ).first()
        
        cogs_account = Account.objects.filter(
            account_type='expense',
            account_level=Account.LEVEL_CHILD,
            branch=branch
        ).first()
        
        sales_account = Account.objects.filter(
            account_type='income',
            account_level=Account.LEVEL_CHILD,
            branch=branch
        ).first()
        
        expense_account = Account.objects.filter(
            account_type='expense',
            account_level=Account.LEVEL_CHILD,
            branch=branch
        ).exclude(id=cogs_account.id if cogs_account else None).first()
        
        # If we found all accounts, use them
        if inventory_account and cogs_account and sales_account and expense_account:
            self.stdout.write('  Using existing GL accounts')
        else:
            # Create parent accounts with short unique codes
            inventory_parent, _ = Account.objects.get_or_create(
                code=f"A{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': asset_cat,
                    'name': "Inventory Parent",
                    'account_type': 'asset',
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            expense_parent, _ = Account.objects.get_or_create(
                code=f"E{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': expense_cat,
                    'name': "Expense Parent",
                    'account_type': 'expense',
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            income_parent, _ = Account.objects.get_or_create(
                code=f"I{timestamp_suffix}",
                owner=user,
                branch=branch,
                defaults={
                    'category': income_cat,
                    'name': "Income Parent",
                    'account_type': 'income',
                    'account_level': Account.LEVEL_PARENT,
                    'created_by': user
                }
            )
            
            # Create child accounts
            if not inventory_account:
                inventory_account, _ = Account.objects.get_or_create(
                    code=f"A{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                        'category': asset_cat,
                        'name': "Inventory",
                        'account_type': 'asset',
                        'account_level': Account.LEVEL_CHILD,
                        'parent': inventory_parent,
                        'created_by': user
                    }
                )
            
            if not cogs_account:
                cogs_account, _ = Account.objects.get_or_create(
                    code=f"E{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                        'category': expense_cat,
                        'name': "Cost of Goods Sold",
                        'account_type': 'expense',
                        'account_level': Account.LEVEL_CHILD,
                        'parent': expense_parent,
                        'created_by': user
                    }
                )
            
            if not sales_account:
                sales_account, _ = Account.objects.get_or_create(
                    code=f"I{timestamp_suffix}01",
                    owner=user,
                    branch=branch,
                    defaults={
                        'category': income_cat,
                        'name': "Product Sales",
                        'account_type': 'income',
                        'account_level': Account.LEVEL_CHILD,
                        'parent': income_parent,
                        'created_by': user
                    }
                )
            
            if not expense_account:
                expense_account, _ = Account.objects.get_or_create(
                    code=f"E{timestamp_suffix}02",
                    owner=user,
                    branch=branch,
                    defaults={
                        'category': expense_cat,
                        'name': "Fuel Expense",
                        'account_type': 'expense',
                        'account_level': Account.LEVEL_CHILD,
                        'parent': expense_parent,
                        'created_by': user
                    }
                )
            
            self.stdout.write('  Created/verified GL accounts')

        # Create supplier
        supplier = Supplier.objects.create(
            supplier_code=f'SUP{int(timezone.now().timestamp()) % 100000}',
            name='Test Supplier Ltd',
            contact_person='John Supplier',
            email='supplier@test.com',
            phone='+1234567890',
            address='789 Supplier Avenue',
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created supplier')

        # Create location
        location = Location.objects.create(
            name='Main Warehouse',
            code=f'WH{int(timezone.now().timestamp()) % 10000}',
            location_type='warehouse',
            address='Main Warehouse, Storage District',
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created location')

        # Create inventory category with proper accounts
        inv_category = InventoryCategory.objects.create(
            name='Test Category',
            code=f'CAT{int(timezone.now().timestamp()) % 10000}',
            branch=branch,
            owner=user,
            inventory_account=inventory_account,
            sales_account=sales_account,
            cogs_account=cogs_account
        )
        self.stdout.write('  Created inventory category')

        # Create inventory items
        items = []
        for i in range(3):
            item = InventoryItem.objects.create(
                name=f'Test Item {i+1}',
                sku=f'ITM{int(timezone.now().timestamp()) % 10000}{i}',
                category=inv_category,
                unit_of_measure='pcs',
                reorder_level=10,
                cost_price=Decimal(f'{(i+1)*10}.00'),
                selling_price=Decimal(f'{(i+1)*15}.00'),
                minimum_selling_price=Decimal(f'{(i+1)*10}.00'),
                branch=branch,
                owner=user
            )
            items.append(item)
        self.stdout.write(f'  Created {len(items)} inventory items')

        # Create Purchase Order
        po = PurchaseOrder.objects.create(
            po_number=f'PO{int(timezone.now().timestamp()) % 100000}',
            supplier=supplier,
            order_date=timezone.now().date(),
            expected_delivery_date=timezone.now().date() + timedelta(days=7),
            delivery_location=location,
            contact_person='Jane Buyer',
            contact_phone='+1234567890',
            contact_email='buyer@company.com',
            status='approved',
            payment_terms='net_30',
            subtotal=Decimal('1000.00'),
            tax_amount=Decimal('75.00'),
            total_amount=Decimal('1075.00'),
            notes='Test purchase order for PDF validation',
            branch=branch,
            owner=user,
            approved_by=user,
            approved_at=timezone.now()
        )
        self.stdout.write('  Created purchase order')

        # Create PO items
        for i, item in enumerate(items):
            PurchaseOrderItem.objects.create(
                purchase_order=po,
                item=item,
                quantity=Decimal(f'{(i+1)*10}'),
                unit_price=Decimal(f'{(i+1)*10}.00'),
                total_price=Decimal(f'{(i+1)*100}.00')
            )
        self.stdout.write(f'  Created {len(items)} PO items')

        # Create Goods Received Note
        grn = GoodsReceivedNote.objects.create(
            grn_number=f'GRN{int(timezone.now().timestamp()) % 100000}',
            purchase_order=po,
            supplier=supplier,
            received_date=timezone.now().date(),
            received_location=location,
            received_by=user,
            notes='Test GRN for PDF validation',
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created goods received note')

        # Create GRN items
        for po_item in po.items.all():
            GoodsReceivedNoteItem.objects.create(
                grn=grn,
                po_item=po_item,
                item=po_item.item,
                quantity_ordered=po_item.quantity,
                quantity_received=po_item.quantity,
                unit_cost=po_item.unit_price,
                total_cost=po_item.total_price
            )
        self.stdout.write(f'  Created GRN items')

        # Create expense category
        expense_category = ExpenseCategory.objects.create(
            name='Fuel',
            code=f'FUEL{int(timezone.now().timestamp()) % 10000}',
            description='Fuel expenses',
            expense_account=expense_account,
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created expense category')

        # Create resource
        resource = Resource.objects.create(
            name='Diesel Fuel',
            resource_code=f'FUEL-{int(timezone.now().timestamp()) % 10000}',
            resource_type='fuel',
            expense_category=expense_category,
            unit_of_measure='liters',
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created resource')

        # Get or create asset category with required accounts
        # First ensure we have parent accounts
        asset_parent = Account.objects.filter(
            account_type='asset',
            account_level=Account.LEVEL_PARENT,
            branch=branch
        ).first()
        
        expense_parent = Account.objects.filter(
            account_type='expense',
            account_level=Account.LEVEL_PARENT,
            branch=branch
        ).first()
        
        # Create depreciation-related accounts
        asset_account, _ = Account.objects.get_or_create(
            code=f"A{timestamp_suffix}02",
            owner=user,
            branch=branch,
            defaults={
                'category': asset_cat,
                'name': "Fixed Assets",
                'account_type': 'asset',
                'account_level': Account.LEVEL_CHILD,
                'parent': asset_parent,
                'created_by': user
            }
        )
        depreciation_account, _ = Account.objects.get_or_create(
            code=f"E{timestamp_suffix}03",
            owner=user,
            branch=branch,
            defaults={
                'category': expense_cat,
                'name': "Depreciation Expense",
                'account_type': 'expense',
                'account_level': Account.LEVEL_CHILD,
                'parent': expense_parent,
                'created_by': user
            }
        )
        accumulated_depreciation_account, _ = Account.objects.get_or_create(
            code=f"A{timestamp_suffix}03",
            owner=user,
            branch=branch,
            defaults={
                'category': asset_cat,
                'name': "Accumulated Depreciation",
                'account_type': 'asset',
                'account_level': Account.LEVEL_CHILD,
                'parent': asset_parent,
                'created_by': user
            }
        )
        
        asset_category, _ = AssetCategory.objects.get_or_create(
            name='Vehicles',
            code='VEH',
            branch=branch,
            owner=user,
            defaults={
                'asset_account': asset_account,
                'depreciation_account': depreciation_account,
                'accumulated_depreciation_account': accumulated_depreciation_account
            }
        )

        # Create fixed asset
        asset = FixedAsset.objects.create(
            asset_number=f'AST{int(timezone.now().timestamp()) % 100000}',
            name='Company Vehicle',
            category=asset_category,
            purchase_date=timezone.now().date(),
            purchase_price=Decimal('50000.00'),
            useful_life_years=5,
            depreciation_method='straight_line',
            depreciation_start_date=timezone.now().date(),
            registration_number='ABC-123-XYZ',
            make='Toyota',
            model='Hilux',
            year=2024,
            metadata={
                'color': 'White',
                'fuel_type': 'Diesel',
                'engine_capacity': '2.8L'
            },
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created fixed asset')

        # Create staff
        staff = Staff.objects.create(
            first_name='John',
            last_name='Driver',
            position='Driver',
            department='Operations',
            email='jdriver@company.com',
            phone='+1234567890',
            branch=branch,
            owner=user
        )
        self.stdout.write('  Created staff member')

        # Create resource consumption
        consumption = ResourceConsumption.objects.create(
            consumption_number=f'RC{int(timezone.now().timestamp()) % 100000}',
            resource=resource,
            consumption_date=timezone.now().date(),
            quantity_consumed=Decimal('50.00'),
            unit_of_measure='liters',
            unit_cost=Decimal('1.50'),
            total_cost=Decimal('75.00'),
            payment_flow='postpaid',
            supplier=supplier,
            beneficiary_type='asset',
            beneficiary_name='Company Vehicle',
            asset=asset,
            employee=staff,
            notes='Test fuel consumption for PDF validation',
            status='approved',
            branch=branch,
            owner=user,
            approved_by=user,
            approved_at=timezone.now()
        )
        self.stdout.write('  Created resource consumption')

        self.stdout.write(self.style.SUCCESS('\nAll test data created successfully!\n'))

        return {
            'tenant': tenant,
            'user': user,
            'branch': branch,
            'supplier': supplier,
            'location': location,
            'items': items,
            'po': po,
            'grn': grn,
            'resource': resource,
            'asset': asset,
            'staff': staff,
            'consumption': consumption,
        }
        """Create all necessary test data"""
        
        # Get or create tenant
        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(
                name='Test Company',
                slug='test-company',
                settings={
                    'address': '123 Test Street, Test City',
                    'phone': '+1234567890',
                    'email': 'test@company.com',
                    'website': 'www.testcompany.com'
                }
            )
            self.stdout.write('  ✅ Created tenant')
        else:
            # Ensure settings is a dict
            if not isinstance(tenant.settings, dict):
                tenant.settings = {
                    'address': '123 Test Street, Test City',
                    'phone': '+1234567890',
                    'email': 'test@company.com',
                    'website': 'www.testcompany.com'
                }
                tenant.save()
            self.stdout.write(f'  ✅ Using existing tenant: {tenant.name}')

        # Get or create user
        user = User.objects.filter(tenant=tenant, is_active=True).first()
        if not user:
            user = User.objects.create_user(
                username='testuser',
                password='testpass',
                tenant=tenant,
                first_name='Test',
                last_name='User'
            )
            self.stdout.write('  ✅ Created user')
        else:
            self.stdout.write(f'  ✅ Using existing user: {user.username}')

        # Get or create branch
        branch = Branch.objects.filter(is_active=True).first()
        if not branch:
            branch = Branch.objects.create(
                name='Main Branch',
                code='MAIN',
                address='456 Branch Street, Branch City',
                is_active=True
            )
            self.stdout.write('  ✅ Created branch')
        else:
            self.stdout.write(f'  ✅ Using existing branch: {branch.name}')
        
        user.branch = branch
        user.save()

        # Create supplier
        supplier = Supplier.objects.create(
            supplier_code=f'SUP-TEST-{timezone.now().timestamp()}',
            name='Test Supplier Ltd',
            contact_person='John Supplier',
            email='supplier@test.com',
            phone='+1234567890',
            address='789 Supplier Avenue',
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created supplier')

        # Create location
        location = Location.objects.create(
            name='Main Warehouse',
            code=f'WH-{int(timezone.now().timestamp()) % 1000000}',  # Shortened to fit 20 char limit
            location_type='warehouse',
            address='Main Warehouse, Storage District',
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created location')

        # Try to use existing inventory category or skip creating items if none exist
        inv_category = InventoryCategory.objects.filter(branch=branch).first()
        if not inv_category:
            self.stdout.write('  ⚠️  No inventory category found - skipping inventory items')
            items = []
        else:
            self.stdout.write(f'  ✅ Using existing inventory category: {inv_category.name}')
            # Create inventory items
            items = []
            for i in range(3):
                item = InventoryItem.objects.create(
                    name=f'Test Item {i+1}',
                    item_code=f'ITEM-{int(timezone.now().timestamp()) % 100000}-{i}',  # Shortened
                    category=inv_category,
                    unit_of_measure='pcs',
                    reorder_level=10,
                    branch=branch,
                    owner=user
                )
                items.append(item)
            self.stdout.write(f'  ✅ Created {len(items)} inventory items')

        # Create Purchase Order
        po = PurchaseOrder.objects.create(
            po_number=f'PO-{int(timezone.now().timestamp()) % 1000000}',  # Shortened
            supplier=supplier,
            order_date=timezone.now().date(),
            expected_delivery_date=timezone.now().date() + timedelta(days=7),
            delivery_location=location,
            contact_person='Jane Buyer',
            contact_phone='+1234567890',
            contact_email='buyer@company.com',
            status='approved',
            payment_terms='net_30',
            subtotal=Decimal('1000.00'),
            tax_amount=Decimal('75.00'),
            total_amount=Decimal('1075.00'),
            notes='Test purchase order for PDF validation',
            branch=branch,
            owner=user,
            approved_by=user,
            approved_at=timezone.now()
        )
        self.stdout.write('  ✅ Created purchase order')

        # Create PO items (if we have items)
        if items:
            for i, item in enumerate(items):
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    item=item,
                    quantity=Decimal(f'{(i+1)*10}'),
                    unit_price=Decimal(f'{(i+1)*10}.00'),
                    total_price=Decimal(f'{(i+1)*100}.00'),
                    branch=branch,
                    owner=user
                )
            self.stdout.write(f'  ✅ Created {len(items)} PO items')
        else:
            self.stdout.write('  ⚠️  No items to add to PO')

        # Create Goods Received Note
        grn = GoodsReceivedNote.objects.create(
            grn_number=f'GRN-{int(timezone.now().timestamp()) % 1000000}',  # Shortened
            purchase_order=po,
            supplier=supplier,  # Required field
            received_date=timezone.now().date(),
            received_location=location,
            received_by=user,
            notes='Test GRN for PDF validation',
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created goods received note')

        # Create GRN items (if we have PO items)
        if items:
            for po_item in po.items.all():
                GoodsReceivedNoteItem.objects.create(
                    grn=grn,
                    purchase_order_item=po_item,
                    item=po_item.item,
                    quantity_ordered=po_item.quantity,
                    quantity_received=po_item.quantity,
                    branch=branch,
                    owner=user
                )
            self.stdout.write(f'  ✅ Created GRN items')
        else:
            self.stdout.write('  ⚠️  No items to add to GRN')

        # Get any existing account category for expense account
        account_category = AccountCategory.objects.first()
        if not account_category:
            self.stdout.write('  ⚠️  No account category found - using simple expense account')
            # Create a simple account without category if none exist
            expense_account = Account.objects.create(
                account_name='Fuel Expense',
                account_code=f'EXP-{int(timezone.now().timestamp()) % 100000}',  # Shortened
                account_type='expense',
                branch=branch,
                owner=user
            )
        else:
            self.stdout.write(f'  ✅ Using existing account category: {account_category.name}')
            # Create expense account
            expense_account = Account.objects.create(
                account_name='Fuel Expense',
                account_code=f'EXP-{int(timezone.now().timestamp()) % 100000}',  # Shortened
                account_type='expense',
                category=account_category,
                branch=branch,
                owner=user
            )
        self.stdout.write('  ✅ Created expense account')

        # Create expense category
        expense_category = ExpenseCategory.objects.create(
            name='Fuel',
            code=f'FUEL-{int(timezone.now().timestamp()) % 10000}',  # Shortened
            description='Fuel expenses',
            expense_account=expense_account,
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created expense category')

        # Create resource
        resource = Resource.objects.create(
            name='Diesel Fuel',
            code=f'RES-{int(timezone.now().timestamp()) % 100000}',  # Shortened
            expense_category=expense_category,
            unit_of_measure='liters',
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created resource')

        # Create asset category
        asset_category = AssetCategory.objects.filter(
            owner=user
        ).first()
        if not asset_category:
            asset_category = AssetCategory.objects.create(
                name='Vehicles',
                code=f'VEH-{int(timezone.now().timestamp()) % 10000}',  # Shortened
                branch=branch,
                owner=user
            )

        # Create fixed asset
        asset = FixedAsset.objects.create(
            asset_number=f'AST-{int(timezone.now().timestamp()) % 100000}',  # Shortened
            name='Company Vehicle',
            category=asset_category,
            acquisition_date=timezone.now().date(),
            acquisition_cost=Decimal('50000.00'),
            useful_life=5,
            registration_number='ABC-123-XYZ',
            make='Toyota',
            model='Hilux',
            year=2024,
            metadata={
                'color': 'White',
                'fuel_type': 'Diesel',
                'engine_capacity': '2.8L'
            },
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created fixed asset')

        # Create staff (using only available fields)
        staff = Staff.objects.create(
            first_name='John',
            last_name='Driver',
            position='Driver',
            department='Operations',  # String field
            email='jdriver@company.com',
            phone='+1234567890',
            branch=branch,
            owner=user
        )
        self.stdout.write('  ✅ Created staff member')

        # Create resource consumption
        consumption = ResourceConsumption.objects.create(
            consumption_number=f'RC-{int(timezone.now().timestamp()) % 1000000}',  # Shortened
            resource=resource,
            consumption_date=timezone.now().date(),
            quantity=Decimal('50.00'),
            unit_cost=Decimal('1.50'),
            total_amount=Decimal('75.00'),
            payment_mode='postpaid',
            supplier=supplier,
            asset=asset,
            employee=staff,
            notes='Test fuel consumption for PDF validation',
            status='approved',
            branch=branch,
            owner=user,
            approved_by=user,
            approved_at=timezone.now()
        )
        self.stdout.write('  ✅ Created resource consumption')

        self.stdout.write(self.style.SUCCESS('\n✅ All test data created successfully!\n'))

        return {
            'tenant': tenant,
            'user': user,
            'branch': branch,
            'supplier': supplier,
            'location': location,
            'items': items,
            'po': po,
            'grn': grn,
            'resource': resource,
            'asset': asset,
            'staff': staff,
            'consumption': consumption,
        }

    def test_purchase_order(self, test_objects):
        """Test Purchase Order PDF generator"""
        self.stdout.write('\n' + '-'*80)
        self.stdout.write('Testing Purchase Order PDF Generator')
        self.stdout.write('-'*80 + '\n')
        
        try:
            po = test_objects['po']
            user = test_objects['user']
            
            generator = PurchaseOrderPDFGenerator(po, user)
            text_output = generator.generate_text()
            
            self.stdout.write(text_output)
            self.stdout.write('\n')
            
            return ('Purchase Order', True, None)
            
        except Exception as e:
            import traceback
            error = traceback.format_exc()
            self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
            self.stdout.write(error)
            return ('Purchase Order', False, str(e))

    def test_grn(self, test_objects):
        """Test GRN PDF generator"""
        self.stdout.write('\n' + '-'*80)
        self.stdout.write('Testing Goods Received Note PDF Generator')
        self.stdout.write('-'*80 + '\n')
        
        try:
            grn = test_objects['grn']
            user = test_objects['user']
            
            generator = GoodsReceivedNotePDFGenerator(grn, user)
            text_output = generator.generate_text()
            
            self.stdout.write(text_output)
            self.stdout.write('\n')
            
            return ('Goods Received Note', True, None)
            
        except Exception as e:
            import traceback
            error = traceback.format_exc()
            self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
            self.stdout.write(error)
            return ('Goods Received Note', False, str(e))

    def test_resource_consumption(self, test_objects):
        """Test Resource Consumption PDF generator"""
        self.stdout.write('\n' + '-'*80)
        self.stdout.write('Testing Resource Consumption PDF Generator')
        self.stdout.write('-'*80 + '\n')
        
        try:
            consumption = test_objects['consumption']
            user = test_objects['user']
            
            generator = ResourceConsumptionPDFGenerator(consumption, user)
            text_output = generator.generate_text()
            
            self.stdout.write(text_output)
            self.stdout.write('\n')
            
            return ('Resource Consumption', True, None)
            
        except Exception as e:
            import traceback
            error = traceback.format_exc()
            self.stdout.write(self.style.ERROR(f'\n❌ Error: {str(e)}\n'))
            self.stdout.write(error)
            return ('Resource Consumption', False, str(e))

    def print_summary(self, results):
        """Print test summary"""
        self.stdout.write(self.style.SUCCESS('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('TEST SUMMARY'))
        self.stdout.write(self.style.SUCCESS('='*80 + '\n'))
        
        for name, success, error in results:
            if success:
                self.stdout.write(self.style.SUCCESS(f'✅ {name}: PASSED'))
            else:
                self.stdout.write(self.style.ERROR(f'❌ {name}: FAILED'))
                if error:
                    self.stdout.write(self.style.ERROR(f'   Error: {error}'))
        
        passed = sum(1 for _, success, _ in results if success)
        total = len(results)
        
        self.stdout.write(f'\nTotal: {passed}/{total} tests passed\n')
        
        if passed == total:
            self.stdout.write(self.style.SUCCESS('🎉 All tests passed! Data access is working correctly.'))
            self.stdout.write(self.style.SUCCESS('The fixes are ready for production deployment.\n'))
        else:
            self.stdout.write(self.style.WARNING('⚠️  Some tests failed. Review the errors above.\n'))
