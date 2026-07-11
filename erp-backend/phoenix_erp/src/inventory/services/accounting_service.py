# inventory/services/accounting_service.py
"""
Comprehensive accounting integration for inventory operations
Creates journal entries for ALL inventory transactions
Follows GAAP/IFRS principles for inventory accounting
"""
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal
from typing import Optional, Dict
import logging

from accounts.models import Account
from accounts.utils.account_creation import get_system_account, get_or_create_child_account
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
from inventory.models import InventoryItem, StockMovement, InventoryAllocation, AllocationRedemption

logger = logging.getLogger(__name__)


class InventoryAccountingService:
    """
    Service for creating accounting entries for inventory transactions
    All methods follow double-entry bookkeeping principles
    
    Inventory Accounting Rules:
    1. Purchase: Dr. Inventory Asset, Cr. Cash/Accounts Payable
    2. Sale: Two entries:
       a) Dr. Cost of Goods Sold, Cr. Inventory Asset (record cost)
       b) Dr. Cash/AR, Cr. Sales Revenue (record revenue - handled by sales invoice)
    3. Adjustment: Dr./Cr. Inventory Asset, Cr./Dr. Inventory Adjustment
    4. Transfer: No journal entry (just location change)
    5. Allocation: No journal entry (reservation only)
    6. Redemption: Dr. COGS, Cr. Inventory Asset (actual consumption)
    """
    
    @staticmethod
    @transaction.atomic
    def record_purchase(
        item: InventoryItem,
        quantity: Decimal,
        unit_cost: Decimal,
        supplier_name: str,
        reference_number: str,
        payment_method: str = 'credit',  # 'cash' or 'credit'
        cash_account: Optional[Account] = None,
        ap_account: Optional[Account] = None,
        user=None
    ) -> JournalEntry:
        """
        Record inventory purchase
        
        Cash Purchase:
        Dr. Inventory Asset
        Cr. Cash/Bank
        
        Credit Purchase:
        Dr. Inventory Asset
        Cr. Accounts Payable
        """
        total_cost = quantity * unit_cost
        
        # Get inventory account from item category
        inventory_account = item.category.inventory_account
        
        # Get credit account (Cash or AP)
        if payment_method == 'cash':
            if not cash_account:
                # Get cash account using centralized utility
                cash_account = get_system_account('cash', item.owner, item.branch)
            
            credit_account = cash_account
            entry_description = f"Cash purchase - {item.name} from {supplier_name}"
        else:
            if not ap_account:
                # Get accounts payable using centralized utility
                ap_account = get_system_account('accounts_payable', item.owner, item.branch)
            
            credit_account = ap_account
            entry_description = f"Credit purchase - {item.name} from {supplier_name}"
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
            reference_number=reference_number,
            description=entry_description,
            total_amount=total_cost,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )

        # Dr. Inventory Asset
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=inventory_account,
            side=JournalEntryLine.DEBIT,
            amount=total_cost,
        )

        # Cr. Cash/AP
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=credit_account,
            side=JournalEntryLine.CREDIT,
            amount=total_cost,
        )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        logger.info(f"Recorded purchase journal entry: {journal_entry.reference_number}")
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_sale_cogs(
        item: InventoryItem,
        quantity: Decimal,
        unit_cost: Decimal,
        reference_number: str,
        invoice_number: str = None,
        user=None
    ) -> JournalEntry:
        """
        Record Cost of Goods Sold when inventory is sold
        
        Dr. Cost of Goods Sold
        Cr. Inventory Asset
        
        Note: Revenue recognition (Dr. Cash/AR, Cr. Sales) is handled 
        separately by the sales invoice system
        """
        total_cost = quantity * unit_cost
        
        inventory_account = item.category.inventory_account
        cogs_account = item.category.cogs_account
        
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
            reference_number=reference_number,
            description=f"COGS - {item.name} (Invoice: {invoice_number or 'N/A'})",
            total_amount=total_cost,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )
        
        # Dr. COGS
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cogs_account,
            side=JournalEntryLine.DEBIT,
            amount=total_cost,
        )

        # Cr. Inventory Asset
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=inventory_account,
            side=JournalEntryLine.CREDIT,
            amount=total_cost,
        )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        logger.info(f"Recorded COGS journal entry: {journal_entry.reference_number}")
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_sale_revenue(
        total_amount: Decimal,
        customer_name: str,
        reference_number: str,
        payment_method: str = 'credit',  # 'cash' or 'credit'
        sales_account: Optional[Account] = None,
        cash_account: Optional[Account] = None,
        ar_account: Optional[Account] = None,
        owner=None,
        branch=None,
        user=None
    ) -> JournalEntry:
        """
        Record sales revenue
        
        Cash Sale:
        Dr. Cash/Bank
        Cr. Sales Revenue
        
        Credit Sale:
        Dr. Accounts Receivable
        Cr. Sales Revenue
        """
        if not sales_account:
            # Get sales revenue account using centralized utility
            sales_account = get_system_account('sales_revenue', owner, branch)
        
        if payment_method == 'cash':
            if not cash_account:
                cash_account = get_system_account('cash', owner, branch)
            
            debit_account = cash_account
            entry_description = f"Cash sale - {customer_name}"
        else:
            if not ar_account:
                ar_account = get_or_create_child_account(
                    parent_code='1110',
                    child_suffix='001',
                    name='Trade Debtors (Accounts Receivable)',
                    account_type='ASSET',
                    owner=owner,
                    branch=branch,
                    parent_name='Trade and Other Receivables'
                )
            
            debit_account = ar_account
            entry_description = f"Credit sale - {customer_name}"
        
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
            reference_number=reference_number,
            description=entry_description,
            total_amount=total_amount,
            owner=owner,
            branch=branch,
            created_by=user,
            tenant=getattr(owner, 'tenant', None),
        )
        
        # Dr. Cash/AR
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=debit_account,
            side=JournalEntryLine.DEBIT,
            amount=total_amount,
        )

        # Cr. Sales Revenue
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=sales_account,
            side=JournalEntryLine.CREDIT,
            amount=total_amount,
        )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        logger.info(f"Recorded sales revenue journal entry: {journal_entry.reference_number}")
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_adjustment(
        item: InventoryItem,
        adjustment_quantity: Decimal,
        unit_cost: Decimal,
        reason: str,
        reference_number: str,
        user=None
    ) -> JournalEntry:
        """
        Record inventory adjustment
        
        Positive adjustment (increase):
        Dr. Inventory Asset
        Cr. Inventory Adjustment (Gain)
        
        Negative adjustment (decrease):
        Dr. Inventory Adjustment (Loss)
        Cr. Inventory Asset
        """
        total_value = abs(adjustment_quantity) * unit_cost
        
        inventory_account = item.category.inventory_account
        
        # Get or create inventory adjustment account under Admin/General Expenses (5300)
        adjustment_account = get_or_create_child_account(
            parent_code='5300',
            child_suffix='001',
            name='Inventory Adjustment (Gain/Loss)',
            account_type='EXPENSE',
            owner=item.owner,
            branch=item.branch,
            parent_name='Administrative and General Expenses'
        )
        
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
            reference_number=reference_number,
            description=f"Stock adjustment - {item.name}: {reason}",
            total_amount=total_value,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )
        
        if adjustment_quantity > 0:
            # Positive adjustment: increase inventory
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=inventory_account,
                side=JournalEntryLine.DEBIT,
                amount=total_value,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=adjustment_account,
                side=JournalEntryLine.CREDIT,
                amount=total_value,
            )
        else:
            # Negative adjustment: decrease inventory
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=adjustment_account,
                side=JournalEntryLine.DEBIT,
                amount=total_value,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=inventory_account,
                side=JournalEntryLine.CREDIT,
                amount=total_value,
            )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        logger.info(f"Recorded adjustment journal entry: {journal_entry.reference_number}")
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_redemption_cogs(
        redemption: AllocationRedemption,
        items_with_costs: list,  # List of dicts: {'item': InventoryItem, 'quantity': Decimal, 'unit_cost': Decimal}
        user=None
    ) -> JournalEntry:
        """
        Record COGS for inventory redemption (e.g., student collecting uniform)
        
        Dr. Cost of Goods Sold
        Cr. Inventory Asset
        """
        total_cogs = sum(item_data['quantity'] * item_data['unit_cost'] for item_data in items_with_costs)
        
        if total_cogs == 0:
            return None
        
        # Assume all items from same category (or handle multi-category later)
        first_item = items_with_costs[0]['item']
        inventory_account = first_item.category.inventory_account
        cogs_account = first_item.category.cogs_account
        
        journal_entry = JournalEntry.objects.create(
            entry_date=timezone.now().date(),
            reference_number=redemption.redemption_number,
            description=f"COGS - Inventory redemption by {redemption.client.full_name}",
            total_amount=total_cogs,
            owner=redemption.owner,
            branch=redemption.branch,
            created_by=user,
            tenant=redemption.tenant,
        )
        
        # Dr. COGS
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cogs_account,
            side=JournalEntryLine.DEBIT,
            amount=total_cogs,
        )

        # Cr. Inventory Asset
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=inventory_account,
            side=JournalEntryLine.CREDIT,
            amount=total_cogs,
        )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        logger.info(f"Recorded redemption COGS journal entry: {journal_entry.reference_number}")
        return journal_entry
    
    @staticmethod
    def get_inventory_valuation_summary(owner, branch=None) -> Dict:
        """
        Get real-time inventory valuation for financial reporting
        """
        from django.db.models import Sum, F
        from inventory.models import InventoryStock
        
        queryset = InventoryStock.objects.filter(owner=owner, is_deleted=False)
        
        if branch:
            queryset = queryset.filter(branch=branch)
        
        result = queryset.aggregate(
            total_quantity=Sum('quantity_on_hand'),
            total_value=Sum(F('quantity_on_hand') * F('unit_cost'))
        )
        
        return {
            'total_quantity': result['total_quantity'] or Decimal('0'),
            'total_value': result['total_value'] or Decimal('0'),
            'as_of_date': timezone.now().date()
        }
