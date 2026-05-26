"""
Standalone test script for GRN accounting debugging
Run with: python manage.py shell < test_grn_debug.py
"""

print("="*80)
print("GRN ACCOUNTING DEBUG TEST")
print("="*80)

from decimal import Decimal
from datetime import date
from django.contrib.auth import get_user_model
from django.db import transaction

from inventory.models import InventoryCategory, InventoryItem, Location
from inventory.stock_service import ProcurementService
from accounts.models import Account
from procurement.models import Supplier, GoodsReceivedNote, GoodsReceivedNoteItem
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine

User = get_user_model()

# Clean up any existing test data
print("\n1. Cleaning up existing test data...")
User.objects.filter(username='grn_test_user').delete()
Account.objects.filter(code__in=['120', '120-001', '200', '200-001', '500', '500-001']).delete()
Supplier.objects.filter(supplier_code='TEST-SUP').delete()
InventoryItem.objects.filter(sku='TEST-ITEM').delete()

# Create test user
print("\n2. Creating test user...")
user = User.objects.create_user(
    username='grn_test_user',
    email='grn@test.com',
    password='test123'
)
print(f"   Created user: {user.username}")

# Create accounts
print("\n3. Creating accounts...")
parent_inventory = Account.objects.create(
    code='120',
    name='Inventory',
    account_type='ASSET',
    account_level='PARENT',
    owner=user,
    created_by=user
)
print(f"   Created parent inventory: {parent_inventory.code}")

inventory_account = Account.objects.create(
    code='120-001',
    name='General Inventory',
    account_type='ASSET',
    account_level='CHILD',
    parent=parent_inventory,
    balance=Decimal('0.00'),
    owner=user,
    created_by=user
)
print(f"   Created inventory account: {inventory_account.code} - Balance: {inventory_account.balance}")

# Create parent income account and sales child account
parent_income = Account.objects.create(
    code='400',
    name='Sales (Parent)',
    account_type='INCOME',
    account_level='PARENT',
    owner=user,
    created_by=user
)
sales_account = Account.objects.create(
    code='400-001',
    name='General Sales',
    account_type='INCOME',
    account_level='CHILD',
    parent=parent_income,
    balance=Decimal('0.00'),
    owner=user,
    created_by=user
)
print(f"   Created Sales account: {sales_account.code}")
# Create parent accounts payable and child account
parent_ap = Account.objects.create(
    code='200',
    name='Accounts Payable',
    account_type='LIABILITY',
    account_level='PARENT',
    owner=user,
    created_by=user
)
ap_account = Account.objects.create(
    code='200-001',
    name='General Payables',
    account_type='LIABILITY',
    account_level='CHILD',
    parent=parent_ap,
    balance=Decimal('0.00'),
    owner=user,
    created_by=user
)
print(f"   Created AP account: {ap_account.code} - Balance: {ap_account.balance}")

parent_cogs = Account.objects.create(
    code='500',
    name='Cost of Goods Sold',
    account_type='EXPENSE',
    account_level='PARENT',
    owner=user,
    created_by=user
)

cogs_account = Account.objects.create(
    code='500-001',
    name='General COGS',
    account_type='EXPENSE',
    account_level='CHILD',
    parent=parent_cogs,
    balance=Decimal('0.00'),
    owner=user,
    created_by=user
)
print(f"   Created COGS account: {cogs_account.code}")

# Create inventory category
print("\n4. Creating inventory category...")
category = InventoryCategory.objects.create(
    code='TEST',
    name='Test Category',
    inventory_account=inventory_account,
    cogs_account=cogs_account,
    sales_account=sales_account,
    owner=user,
    created_by=user
)
print(f"   Created category: {category.code}")
# Create inventory item
print("\n5. Creating inventory item...")
item = InventoryItem.objects.create(
    sku='TEST-ITEM',
    name='Test Item',
    category=category,
    unit_of_measure='piece',
    cost_price=Decimal('500.00'),
    selling_price=Decimal('800.00'),
    is_purchasable=True,
    valuation_method='average',
    owner=user,
    created_by=user
)
print(f"   Created item: {item.sku}")

# Create location
print("\n6. Creating location...")
location = Location.objects.create(
    code='TEST-LOC',
    name='Test Location',
    location_type='warehouse',
    owner=user,
    created_by=user
)
print(f"   Created location: {location.code}")

# Create supplier
print("\n7. Creating supplier...")
supplier = Supplier.objects.create(
    name='Test Supplier',
    supplier_code='TEST-SUP',
    email='supplier@test.com',
    phone='1234567890',
    payment_terms='net_30',
    owner=user,
    created_by=user
)
print(f"   Created supplier: {supplier.supplier_code}")

# Create GRN
print("\n8. Creating GRN...")
grn = GoodsReceivedNote.objects.create(
    grn_number='GRN-TEST-001',
    supplier=supplier,
    received_location=location,
    received_date=date.today(),
    received_by=user,
    is_posted=False,
    owner=user,
    created_by=user
)
print(f"   Created GRN: {grn.grn_number}")

# Create GRN item
print("\n9. Creating GRN item...")
grn_item = GoodsReceivedNoteItem.objects.create(
    grn=grn,
    item=item,
    quantity_ordered=Decimal('10.00'),
    quantity_received=Decimal('10.00'),
    unit_cost=Decimal('500.00'),
    total_cost=Decimal('5000.00'),
    owner=user,
    created_by=user
)
print(f"   Created GRN item: {grn_item.item.sku} x {grn_item.quantity_received}")

print("\n" + "="*80)
print("INITIAL STATE")
print("="*80)

inventory_account.refresh_from_db()
ap_account.refresh_from_db()

print(f"\nAccount Balances BEFORE posting:")
print(f"  Inventory ({inventory_account.code}): {inventory_account.balance}")
print(f"  AP ({ap_account.code}): {ap_account.balance}")

print("\n" + "="*80)
print("POSTING GRN")
print("="*80)

try:
    with transaction.atomic():
        posted_grn, payable = ProcurementService.post_grn(grn, user=user)
        print(f"\n✓ GRN Posted successfully!")
        print(f"  GRN Number: {posted_grn.grn_number}")
        print(f"  Is Posted: {posted_grn.is_posted}")
        print(f"  Total Amount: {posted_grn.total_amount}")
except Exception as e:
    print(f"\n✗ Error posting GRN: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "="*80)
print("JOURNAL ENTRIES")
print("="*80)

journal_entries = JournalEntry.objects.filter(workflow_reference=grn.grn_number)
print(f"\nJournal Entries found: {journal_entries.count()}")

for je in journal_entries:
    print(f"\nJournal Entry:")
    print(f"  Reference: {je.reference_number if hasattr(je, 'reference_number') else 'N/A'}")
    print(f"  Date: {je.date}")
    print(f"  Description: {je.description}")
    print(f"  Is Posted: {je.is_posted}")
    
    entries = je.entries.all()
    print(f"  Entry Lines: {entries.count()}")
    
    total_debits = Decimal('0')
    total_credits = Decimal('0')
    
    for entry in entries:
        side_str = "Dr" if entry.side == JournalEntryLine.DEBIT else "Cr"
        print(f"    {side_str}: {entry.account.code} - {entry.account.name} = ${entry.amount}")
        print(f"       Entry ID: {entry.id}, Is Posted: {entry.is_posted}")
        
        if entry.side == JournalEntryLine.DEBIT:
            total_debits += entry.amount
        else:
            total_credits += entry.amount
    
    print(f"  Total Debits: ${total_debits}")
    print(f"  Total Credits: ${total_credits}")
    print(f"  Balanced: {'✓' if total_debits == total_credits else '✗'}")

print("\n" + "="*80)
print("FINAL ACCOUNT BALANCES")
print("="*80)

# Refresh from database
inventory_account.refresh_from_db()
ap_account.refresh_from_db()

print(f"\nAccount Balances AFTER posting:")
print(f"  Inventory ({inventory_account.code}): {inventory_account.balance}")
print(f"  AP ({ap_account.code}): {ap_account.balance}")

print(f"\nExpected Balances:")
print(f"  Inventory: $5000.00 (Dr increases asset)")
print(f"  AP: $-5000.00 (Cr increases liability, shown as negative balance)")

print("\n" + "="*80)
print("VERIFICATION")
print("="*80)

if inventory_account.balance == Decimal('5000.00'):
    print("✓ Inventory balance is correct!")
else:
    print(f"✗ Inventory balance is WRONG! Expected: 5000.00, Got: {inventory_account.balance}")

if ap_account.balance == Decimal('-5000.00'):
    print("✓ AP balance is correct!")
else:
    print(f"✗ AP balance is WRONG! Expected: -5000.00, Got: {ap_account.balance}")

# Check if entries were actually marked as posted
posted_entries = JournalEntryLine.objects.filter(
    transaction__workflow_reference=grn.grn_number,
    is_posted=True
)

print(f"\nPosted entry lines: {posted_entries.count()}")
for entry in posted_entries:
    print(f"  Entry {entry.id}: {entry.account.code} - ${entry.amount}")

print("\n" + "="*80)
print("TEST COMPLETE")
print("="*80)
