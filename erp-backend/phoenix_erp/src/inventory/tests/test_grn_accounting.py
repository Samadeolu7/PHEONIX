"""
Test GRN posting and accounting integration
Reproduces the issue where account balances remain zero after posting
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date

from inventory.models import InventoryCategory, InventoryItem, Location
from inventory.stock_service import ProcurementService
from accounts.models import Account
from procurement.models import Supplier, GoodsReceivedNote, GoodsReceivedNoteItem
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine

User = get_user_model()


class GRNAccountingTest(TestCase):
    """
    Test that GRN posting correctly updates account balances
    """
    
    def verify_trial_balance(self, error_message="Trial balance is not balanced"):
        """
        Verify that the trial balance is balanced (total debits = total credits)
        This catches any double-entry accounting errors
        """
        from django.db.models import Sum
        
        # Calculate total debits and credits across all transaction entries
        total_debits = JournalEntryLine.objects.filter(
            side=JournalEntryLine.DEBIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_credits = JournalEntryLine.objects.filter(
            side=JournalEntryLine.CREDIT
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Verify they match
        self.assertEqual(
            total_debits,
            total_credits,
            f"{error_message}: Debits={total_debits}, Credits={total_credits}, Difference={total_debits - total_credits}"
        )
    
    def setUp(self):
        """Set up test data"""
        from users.models import Tenant
        from common.managers import set_current_tenant
        
        # Create tenant
        self.tenant = Tenant.objects.create(name='Test Company', slug='testgrn')
        set_current_tenant(self.tenant)
        
        # Create user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            tenant=self.tenant
        )
        
        # Create accounts following parent-child structure
        # Parent accounts (should not have transactions)
        self.parent_inventory = Account.objects.create(
            code='120',
            name='Inventory',
            account_type='ASSET',
            account_level='PARENT',
            owner=self.user,
            created_by=self.user
        )
        
        self.parent_ap = Account.objects.create(
            code='200',
            name='Accounts Payable',
            account_type='LIABILITY',
            account_level='PARENT',
            owner=self.user,
            created_by=self.user
        )
        
        self.parent_cogs = Account.objects.create(
            code='500',
            name='Cost of Goods Sold',
            account_type='EXPENSE',
            account_level='PARENT',
            owner=self.user,
            created_by=self.user
        )
        
        # Child accounts (should receive transactions)
        self.inventory_account = Account.objects.create(
            code='120-001',
            name='General Inventory',
            account_type='ASSET',
            account_level='CHILD',
            parent=self.parent_inventory,
            balance=Decimal('0.00'),
            owner=self.user,
            created_by=self.user
        )
        
        self.ap_account = Account.objects.create(
            code='200-001',
            name='General Payables',
            account_type='LIABILITY',
            account_level='CHILD',
            parent=self.parent_ap,
            balance=Decimal('0.00'),
            owner=self.user,
            created_by=self.user
        )
        
        self.cogs_account = Account.objects.create(
            code='500-001',
            name='General COGS',
            account_type='EXPENSE',
            account_level='CHILD',
            parent=self.parent_cogs,
            balance=Decimal('0.00'),
            owner=self.user,
            created_by=self.user
        )
        
        # Sales account (income)
        # Create parent income account and child sales account
        self.parent_income = Account.objects.create(
            code='400',
            name='Sales (Parent)',
            account_type='INCOME',
            account_level='PARENT',
            owner=self.user,
            created_by=self.user
        )

        self.sales_account = Account.objects.create(
            code='400-001',
            name='General Sales',
            account_type='INCOME',
            account_level='CHILD',
            parent=self.parent_income,
            balance=Decimal('0.00'),
            owner=self.user,
            created_by=self.user
        )
        
        print(f"Created accounts:")
        print(f"  Inventory: {self.inventory_account.code} - Balance: {self.inventory_account.balance}")
        print(f"  AP: {self.ap_account.code} - Balance: {self.ap_account.balance}")
        print(f"  COGS: {self.cogs_account.code} - Balance: {self.cogs_account.balance}")
        
        # Create inventory category
        self.category = InventoryCategory.objects.create(
            code='UNIFORM',
            name='School Uniforms',
            inventory_account=self.inventory_account,
            cogs_account=self.cogs_account,
            sales_account=self.sales_account,
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create inventory item
        self.item = InventoryItem.objects.create(
            sku='SHIRT-001',
            name='School Shirt',
            category=self.category,
            unit_of_measure='piece',
            cost_price=Decimal('500.00'),
            selling_price=Decimal('800.00'),
            is_purchasable=True,
            valuation_method='average',
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create location
        self.location = Location.objects.create(
            code='MAIN',
            name='Main Warehouse',
            location_type='warehouse',
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create supplier
        self.supplier = Supplier.objects.create(
            name='Test Supplier Ltd',
            supplier_code='SUP-001',
            email='supplier@example.com',
            phone='1234567890',
            payment_terms='net_30',
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create GRN
        self.grn = GoodsReceivedNote.objects.create(
            grn_number='GRN-2026-001',
            supplier=self.supplier,
            received_location=self.location,
            received_date=date.today(),
            received_by=self.user,
            is_posted=False,
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        # Create GRN item
        self.grn_item = GoodsReceivedNoteItem.objects.create(
            grn=self.grn,
            item=self.item,
            quantity_ordered=Decimal('10.00'),
            quantity_received=Decimal('10.00'),
            unit_cost=Decimal('500.00'),
            total_cost=Decimal('5000.00'),
            owner=self.user,
            created_by=self.user,
            tenant=self.tenant
        )
        
        print(f"\nCreated GRN: {self.grn.grn_number}")
        print(f"  Item: {self.item.sku}")
        print(f"  Quantity: {self.grn_item.quantity_received}")
        print(f"  Unit Cost: {self.grn_item.unit_cost}")
        print(f"  Total: {self.grn_item.total_cost}")
    
    def test_grn_posting_updates_account_balances(self):
        """
        Test that posting a GRN creates journal entries and updates account balances
        """
        print("\n" + "="*80)
        print("STARTING GRN POSTING TEST")
        print("="*80)
        
        # Get initial balances
        initial_inventory_balance = self.inventory_account.balance
        initial_ap_balance = self.ap_account.balance
        
        print(f"\nInitial Account Balances:")
        print(f"  Inventory ({self.inventory_account.code}): {initial_inventory_balance}")
        print(f"  AP ({self.ap_account.code}): {initial_ap_balance}")
        
        # Post the GRN
        print(f"\nPosting GRN: {self.grn.grn_number}...")
        posted_grn, payable = ProcurementService.post_grn(self.grn, user=self.user)
        
        print(f"GRN Posted: {posted_grn.is_posted}")
        print(f"Total Amount: {posted_grn.total_amount}")
        
        # Check that journal entry was created
        journal_entries = JournalEntry.objects.filter(
            workflow_reference=self.grn.grn_number
        )
        
        print(f"\nJournal Entries Created: {journal_entries.count()}")
        
        for je in journal_entries:
            print(f"\n  Journal Entry: {je.reference_number}")
            print(f"    Date: {je.date}")
            print(f"    Description: {je.description}")
            print(f"    Is Posted: {je.approved}")
            
            entries = je.entries.all()
            print(f"    Entry Lines: {entries.count()}")
            
            total_debits = Decimal('0')
            total_credits = Decimal('0')
            
            for entry in entries:
                print(f"      {entry.side}: {entry.account.code} - {entry.account.name} = {entry.amount}")
                if entry.side == JournalEntryLine.DEBIT:
                    total_debits += entry.amount
                else:
                    total_credits += entry.amount
                print(f"        Entry posted: {entry.posted}")
            
            print(f"    Total Debits: {total_debits}")
            print(f"    Total Credits: {total_credits}")
            print(f"    Balanced: {total_debits == total_credits}")
        
        # Refresh accounts from database
        self.inventory_account.refresh_from_db()
        self.ap_account.refresh_from_db()
        
        final_inventory_balance = self.inventory_account.balance
        final_ap_balance = self.ap_account.balance
        
        print(f"\nFinal Account Balances (from DB):")
        print(f"  Inventory ({self.inventory_account.code}): {final_inventory_balance}")
        print(f"  AP ({self.ap_account.code}): {final_ap_balance}")
        
        print(f"\nBalance Changes:")
        print(f"  Inventory: {initial_inventory_balance} -> {final_inventory_balance} (change: {final_inventory_balance - initial_inventory_balance})")
        print(f"  AP: {initial_ap_balance} -> {final_ap_balance} (change: {final_ap_balance - initial_ap_balance})")
        
        # Expected results:
        # - Inventory should increase by 5000 (Dr)
        # - AP should increase by 5000 (Cr, so negative balance for liability)
        expected_inventory = initial_inventory_balance + Decimal('5000.00')
        expected_ap = initial_ap_balance - Decimal('5000.00')  # Liability increases decrease balance
        
        print(f"\nExpected Balances:")
        print(f"  Inventory: {expected_inventory}")
        print(f"  AP: {expected_ap}")
        
        print("\n" + "="*80)
        print("ASSERTIONS")
        print("="*80)
        
        # Assertions
        self.assertTrue(
            posted_grn.is_posted,
            "GRN should be marked as posted"
        )
        
        self.assertEqual(
            journal_entries.count(),
            1,
            "Should create exactly one journal entry for GRN"
        )
        
        journal_entry = journal_entries.first()
        self.assertTrue(
            journal_entry.approved,
            "Journal entry should be posted (approved=True)"
        )
        
        # Check that entry lines exist and are posted
        debit_entries = journal_entry.entries.filter(side=JournalEntryLine.DEBIT)
        credit_entries = journal_entry.entries.filter(side=JournalEntryLine.CREDIT)
        
        self.assertGreater(
            debit_entries.count(),
            0,
            "Should have at least one debit entry"
        )
        
        self.assertEqual(
            credit_entries.count(),
            1,
            "Should have exactly one credit entry (AP)"
        )
        
        # Check all entries are posted
        for entry in journal_entry.entries.all():
            self.assertTrue(
                entry.posted,
                f"Entry line {entry.id} should be posted"
            )
        
        # THE CRITICAL TEST: Check account balances updated
        self.assertEqual(
            final_inventory_balance,
            expected_inventory,
            f"Inventory balance should increase by 5000. "
            f"Expected: {expected_inventory}, Got: {final_inventory_balance}"
        )
        
        self.assertEqual(
            final_ap_balance,
            expected_ap,
            f"AP balance should decrease by 5000 (liability increase). "
            f"Expected: {expected_ap}, Got: {final_ap_balance}"
        )
        
        print("\n✓ All assertions passed!")
        print("="*80)
        
        # Verify trial balance
        self.verify_trial_balance("Trial balance failed after GRN posting")
    
    def test_transaction_entry_post_method(self):
        """
        Test the TransactionEntry.post() method directly to verify it updates balances
        """
        print("\n" + "="*80)
        print("TESTING TransactionEntry.post() DIRECTLY")
        print("="*80)
        
        # Create a simple journal entry manually
        from transactions.models import TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='TEST',
            defaults={'description': 'Test Transactions'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=date.today(),
            description="Test entry for balance update",
            owner=self.user,
            created_by=self.user
        )
        
        # Create entries
        debit_entry = JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.inventory_account,
            side=JournalEntryLine.DEBIT,
            amount=Decimal('1000.00')
        )
        
        credit_entry = JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.ap_account,
            side=JournalEntryLine.CREDIT,
            amount=Decimal('1000.00')
        )
        
        print(f"\nCreated test journal entry:")
        print(f"  Dr: {debit_entry.account.code} - {debit_entry.amount}")
        print(f"  Cr: {credit_entry.account.code} - {credit_entry.amount}")
        
        # Get initial balances
        self.inventory_account.refresh_from_db()
        self.ap_account.refresh_from_db()
        
        initial_inventory = self.inventory_account.balance
        initial_ap = self.ap_account.balance
        
        print(f"\nInitial balances:")
        print(f"  Inventory: {initial_inventory}")
        print(f"  AP: {initial_ap}")
        
        # Post the entry
        print(f"\nPosting journal entry...")
        journal_entry.post()
        
        # Refresh and check
        self.inventory_account.refresh_from_db()
        self.ap_account.refresh_from_db()
        
        final_inventory = self.inventory_account.balance
        final_ap = self.ap_account.balance
        
        print(f"\nFinal balances:")
        print(f"  Inventory: {final_inventory}")
        print(f"  AP: {final_ap}")
        
        print(f"\nChanges:")
        print(f"  Inventory: {initial_inventory} -> {final_inventory} (change: {final_inventory - initial_inventory})")
        print(f"  AP: {initial_ap} -> {final_ap} (change: {final_ap - initial_ap})")
        
        # Assertions
        self.assertEqual(
            final_inventory,
            initial_inventory + Decimal('1000.00'),
            "Inventory should increase by 1000"
        )
        
        self.assertEqual(
            final_ap,
            initial_ap - Decimal('1000.00'),
            "AP should decrease by 1000 (liability increase)"
        )
        
        print("\n✓ TransactionEntry.post() works correctly!")
        print("="*80)
