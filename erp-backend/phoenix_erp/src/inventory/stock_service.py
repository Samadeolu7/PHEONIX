# inventory/services.py
"""
Service layer for inventory operations
Handles stock movements, valuation, and accounting integration
"""
from django.db import transaction, models
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal
from typing import Optional, Dict, List, Tuple
import logging

from .models import (
    InventoryItem, InventoryStock, StockMovement, Location,
    InventoryAllocation, AllocationRedemption, RedemptionItem
)
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
from accounts.models import Account
from accounts.utils.account_creation import get_or_create_child_account

logger = logging.getLogger(__name__)


class InventoryService:
    """
    Core service for inventory operations
    """
    
    @staticmethod
    @transaction.atomic
    def receive_stock(
        item: InventoryItem,
        location: Location,
        quantity: Decimal,
        unit_cost: Decimal,
        reference_number: str,
        po_item=None,
        grn=None,
        batch_number: str = "",
        serial_number: str = "",
        expiry_date=None,
        user=None
    ) -> Tuple[InventoryStock, StockMovement]:
        """
        Receive stock into inventory (from GRN)
        Updates stock levels, average cost, and creates accounting entries
        """
        # Get or create stock record
        stock, created = InventoryStock.objects.get_or_create(
            item=item,
            location=location,
            defaults={
                'quantity_on_hand': Decimal('0'),
                'average_cost': unit_cost,
                'owner': item.owner,
                'branch': item.branch,
                'created_by': user
            }
        )
        
        # Calculate new average cost (Weighted Average)
        if item.valuation_method == 'average':
            total_value = (stock.quantity_on_hand * stock.average_cost) + (quantity * unit_cost)
            new_quantity = stock.quantity_on_hand + quantity
            stock.average_cost = total_value / new_quantity if new_quantity > 0 else unit_cost
        elif item.valuation_method == 'fifo':
            # For FIFO, we'll track in separate records (simplified here)
            stock.average_cost = unit_cost
        
        # Update quantities
        stock.quantity_on_hand += quantity
        stock.quantity_available = stock.quantity_on_hand - stock.quantity_reserved
        stock.total_value = stock.quantity_on_hand * stock.average_cost
        stock.save()
        
        # Create stock movement record
        movement = StockMovement.objects.create(
            item=item,
            movement_type='purchase',
            movement_date=timezone.now().date(),
            reference_number=reference_number,
            to_location=location,
            quantity=quantity,
            unit_cost=unit_cost,
            total_cost=quantity * unit_cost,
            batch_number=batch_number,
            serial_number=serial_number,
            expiry_date=expiry_date,
            source_document_type='GRN' if grn else 'PO',
            source_document_id=str(grn.id if grn else po_item.id if po_item else ''),
            tenant=item.tenant if hasattr(item, 'tenant') else None,
            owner=item.owner,
            branch=location.branch,
            created_by=user
        )
        
        # Note: Accounting entry for receipt is created at GRN level in post_grn()
        # Not at individual item level to avoid duplicate/unbalanced entries
        
        logger.info(
            f"Stock received: {item.sku} - {quantity} units @ {unit_cost} "
            f"to {location.code} (Ref: {reference_number})"
        )
        
        return stock, movement
    
    @staticmethod
    @transaction.atomic
    def reduce_stock(
        item: InventoryItem,
        location: Location,
        quantity: Decimal,
        movement_type: str,
        reference_number: str,
        unit_cost: Optional[Decimal] = None,
        batch_number: str = "",
        serial_number: str = "",
        user=None
    ) -> Tuple[InventoryStock, StockMovement]:
        """
        Reduce stock from inventory (for sales, redemptions, write-offs)
        """
        try:
            stock = InventoryStock.objects.get(item=item, location=location)
        except InventoryStock.DoesNotExist:
            raise ValidationError(f"No stock found for {item.sku} at {location.code}")
        
        # Validate sufficient stock
        if stock.quantity_available < quantity:
            raise ValidationError(
                f"Insufficient stock. Available: {stock.quantity_available}, "
                f"Requested: {quantity}"
            )
        
        # Use average cost if not provided
        if unit_cost is None:
            unit_cost = stock.average_cost
        
        # Update quantities
        stock.quantity_on_hand -= quantity
        stock.quantity_available = stock.quantity_on_hand - stock.quantity_reserved
        stock.total_value = stock.quantity_on_hand * stock.average_cost
        stock.save()
        
        # Create stock movement record
        movement = StockMovement.objects.create(
            item=item,
            movement_type=movement_type,
            movement_date=timezone.now().date(),
            reference_number=reference_number,
            from_location=location,
            quantity=quantity,
            unit_cost=unit_cost,
            total_cost=quantity * unit_cost,
            batch_number=batch_number,
            serial_number=serial_number,
            tenant=item.tenant if hasattr(item, 'tenant') else None,
            owner=item.owner,
            branch=location.branch,
            created_by=user
        )

        # Create accounting entry for COGS if sale/redemption
        if movement_type in ['sale', 'redemption']:
            InventoryService._create_cogs_journal_entry(
                item=item,
                quantity=quantity,
                unit_cost=unit_cost,
                reference_number=reference_number,
                user=user
            )
        
        logger.info(
            f"Stock reduced: {item.sku} - {quantity} units from {location.code} "
            f"(Ref: {reference_number})"
        )
        
        return stock, movement
    
    @staticmethod
    @transaction.atomic
    def transfer_stock(
        item: InventoryItem,
        from_location: Location,
        to_location: Location,
        quantity: Decimal,
        reference_number: str,
        user=None
    ) -> Tuple[StockMovement, InventoryStock, InventoryStock]:
        """
        Back-compat wrapper for callers expecting the old instant, single-
        step transfer. Prefer StockTransferRequest.dispatch()/.acknowledge()
        for the full dispatch -> in-transit -> acknowledge workflow with GL
        entries — this wrapper does NOT create a StockTransferRequest and
        does NOT post any inter-branch clearing entries even if
        from_location/to_location belong to different branches, since there
        is no transfer request to attach GL linkage to.
        """
        from_stock, out_movement = InventoryService.reduce_stock(
            item=item,
            location=from_location,
            quantity=quantity,
            movement_type='transfer',
            reference_number=reference_number,
            user=user
        )

        to_stock, in_movement = InventoryService.receive_stock(
            item=item,
            location=to_location,
            quantity=quantity,
            unit_cost=from_stock.average_cost,
            reference_number=reference_number,
            user=user
        )

        out_movement.to_location = to_location
        out_movement.save()

        in_movement.movement_type = 'transfer'
        in_movement.from_location = from_location
        in_movement.save()

        logger.info(
            f"Stock transferred: {item.sku} - {quantity} units "
            f"from {from_location.code} to {to_location.code}"
        )

        return out_movement, from_stock, to_stock

    @staticmethod
    @transaction.atomic
    def dispatch_transfer(transfer_request, user) -> StockMovement:
        """
        Phase 1 of a StockTransferRequest: reduce stock at the source
        location. For a cross-branch transfer, also posts the dispatch GL
        entry (Dr Due-from-<to_branch> / Cr source category.inventory_account).
        A same-branch transfer posts no GL entry here — nothing has left the
        branch's own inventory asset account yet, only stock quantity moved.
        """
        from_stock, movement = InventoryService.reduce_stock(
            item=transfer_request.item,
            location=transfer_request.from_location,
            quantity=transfer_request.quantity,
            movement_type='transfer',
            reference_number=transfer_request.request_number,
            user=user,
        )
        movement.to_location = transfer_request.to_location
        movement.save()

        # Capture the actual cost at dispatch time — acknowledge_transfer()
        # may run days later, once average_cost has moved on further
        # receipts/sales, so the value posted at both ends must be fixed now.
        transfer_request.unit_cost = from_stock.average_cost
        transfer_request.transfer_out_movement = movement

        if transfer_request.from_branch_id != transfer_request.to_branch_id:
            from .services.inter_branch_clearing import build_dispatch_entry
            transfer_request.dispatch_journal_entry = build_dispatch_entry(transfer_request, user)

        logger.info(
            f"Transfer dispatched: {transfer_request.item.sku} - {transfer_request.quantity} units "
            f"from {transfer_request.from_location.code} (Ref: {transfer_request.request_number})"
        )
        return movement

    @staticmethod
    @transaction.atomic
    def acknowledge_transfer(transfer_request, actual_quantity_received: Decimal, user) -> StockMovement:
        """
        Phase 2 of a StockTransferRequest: receive at the destination
        location for actual_quantity_received (may be less than the
        dispatched quantity). Resolves/creates the destination branch's own
        item record for this SKU if needed, then posts the acknowledgment
        (+ shrinkage, if short) GL entry.
        """
        from .services.item_linking import resolve_or_create_destination_item

        if transfer_request.destination_item_id is None:
            transfer_request.destination_item = resolve_or_create_destination_item(
                source_item=transfer_request.item,
                destination_branch=transfer_request.to_branch,
                owner=transfer_request.owner,
                user=user,
            )

        to_stock, movement = InventoryService.receive_stock(
            item=transfer_request.destination_item,
            location=transfer_request.to_location,
            quantity=actual_quantity_received,
            unit_cost=transfer_request.unit_cost,
            reference_number=transfer_request.request_number,
            user=user,
        )
        movement.movement_type = 'transfer'
        movement.from_location = transfer_request.from_location
        movement.save()
        transfer_request.transfer_in_movement = movement

        shortfall_qty = transfer_request.quantity - actual_quantity_received

        if transfer_request.from_branch_id != transfer_request.to_branch_id:
            from .services.inter_branch_clearing import build_acknowledgment_entry
            transfer_request.acknowledgment_journal_entry = build_acknowledgment_entry(
                transfer_request, actual_quantity_received, transfer_request.unit_cost, user
            )
        elif shortfall_qty > 0:
            from .services.inter_branch_clearing import build_same_branch_shrinkage_entry
            transfer_request.acknowledgment_journal_entry = build_same_branch_shrinkage_entry(
                transfer_request, shortfall_qty, transfer_request.unit_cost, user
            )

        logger.info(
            f"Transfer acknowledged: {transfer_request.destination_item.sku} - "
            f"{actual_quantity_received}/{transfer_request.quantity} units "
            f"at {transfer_request.to_location.code} (Ref: {transfer_request.request_number})"
        )
        return movement
    
    @staticmethod
    @transaction.atomic
    def adjust_stock(
        item: InventoryItem,
        location: Location,
        adjustment_quantity: Decimal,
        reason: str,
        reference_number: str,
        user=None
    ) -> Tuple[InventoryStock, StockMovement]:
        """
        Adjust stock levels (for physical counts, corrections, write-offs)
        Positive = add, Negative = reduce
        """
        try:
            stock = InventoryStock.objects.get(item=item, location=location)
        except InventoryStock.DoesNotExist:
            if adjustment_quantity > 0:
                # Create new stock record for positive adjustments
                stock = InventoryStock.objects.create(
                    item=item,
                    location=location,
                    quantity_on_hand=Decimal('0'),
                    average_cost=item.cost_price,
                    owner=item.owner,
                    branch=item.branch,
                    created_by=user
                )
            else:
                raise ValidationError(f"No stock found for {item.sku} at {location.code}")
        
        # Update stock
        old_quantity = stock.quantity_on_hand
        stock.quantity_on_hand += adjustment_quantity
        
        if stock.quantity_on_hand < 0:
            raise ValidationError(
                f"Adjustment would result in negative stock. "
                f"Current: {old_quantity}, Adjustment: {adjustment_quantity}"
            )
        
        stock.quantity_available = stock.quantity_on_hand - stock.quantity_reserved
        stock.total_value = stock.quantity_on_hand * stock.average_cost
        stock.save()
        
        # Create movement record
        movement = StockMovement.objects.create(
            item=item,
            movement_type='adjustment',
            movement_date=timezone.now().date(),
            reference_number=reference_number,
            from_location=location if adjustment_quantity < 0 else None,
            to_location=location if adjustment_quantity > 0 else None,
            quantity=abs(adjustment_quantity),
            unit_cost=stock.average_cost,
            total_cost=abs(adjustment_quantity) * stock.average_cost,
            notes=reason,
            tenant=item.tenant if hasattr(item, 'tenant') else None,
            owner=item.owner,
            branch=item.branch,
            created_by=user
        )
        
        # Create accounting entry
        InventoryService._create_adjustment_journal_entry(
            item=item,
            adjustment_quantity=adjustment_quantity,
            unit_cost=stock.average_cost,
            reference_number=reference_number,
            reason=reason,
            user=user
        )
        
        logger.info(
            f"Stock adjusted: {item.sku} - {adjustment_quantity} units at {location.code} "
            f"(Old: {old_quantity}, New: {stock.quantity_on_hand})"
        )
        
        return stock, movement
    
    @staticmethod
    @transaction.atomic
    def reserve_stock(
        item: InventoryItem,
        location: Location,
        quantity: Decimal,
        reference_number: str,
        user=None
    ) -> InventoryStock:
        """
        Reserve stock for orders/invoices
        """
        try:
            stock = InventoryStock.objects.get(item=item, location=location)
        except InventoryStock.DoesNotExist:
            raise ValidationError(f"No stock found for {item.sku} at {location.code}")
        
        if stock.quantity_available < quantity:
            raise ValidationError(
                f"Insufficient available stock. Available: {stock.quantity_available}, "
                f"Requested: {quantity}"
            )
        
        stock.quantity_reserved += quantity
        stock.quantity_available = stock.quantity_on_hand - stock.quantity_reserved
        stock.save()
        
        logger.info(
            f"Stock reserved: {item.sku} - {quantity} units at {location.code} "
            f"(Ref: {reference_number})"
        )
        
        return stock
    
    @staticmethod
    @transaction.atomic
    def release_reservation(
        item: InventoryItem,
        location: Location,
        quantity: Decimal,
        reference_number: str,
        user=None
    ) -> InventoryStock:
        """
        Release reserved stock
        """
        try:
            stock = InventoryStock.objects.get(item=item, location=location)
        except InventoryStock.DoesNotExist:
            raise ValidationError(f"No stock found for {item.sku} at {location.code}")
        
        if stock.quantity_reserved < quantity:
            raise ValidationError(
                f"Cannot release more than reserved. Reserved: {stock.quantity_reserved}, "
                f"Requested: {quantity}"
            )
        
        stock.quantity_reserved -= quantity
        stock.quantity_available = stock.quantity_on_hand - stock.quantity_reserved
        stock.save()
        
        logger.info(
            f"Reservation released: {item.sku} - {quantity} units at {location.code} "
            f"(Ref: {reference_number})"
        )
        
        return stock
    
    @staticmethod
    def _create_receipt_journal_entry(
        item: InventoryItem,
        quantity: Decimal,
        unit_cost: Decimal,
        reference_number: str,
        user=None
    ):
        """
        Create journal entry for stock receipt
        Dr: Inventory Asset
        Cr: Accounts Payable / Cash (handled separately)
        """
        total_cost = quantity * unit_cost
        
        # Get or create TransactionSeries for inventory
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Inventory Transactions'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Inventory receipt - {item.name}",
            workflow_reference=reference_number,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )

        # Dr: Inventory
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=item.category.inventory_account,
            side=JournalEntryLine.DEBIT,
            amount=total_cost
        )

        # Note: Cr: Accounts Payable is created when GRN is posted
        # DO NOT POST HERE - entry is incomplete until credit side is added
        
        return journal_entry
        
        return journal_entry
    
    @staticmethod
    def _create_cogs_journal_entry(
        item: InventoryItem,
        quantity: Decimal,
        unit_cost: Decimal,
        reference_number: str,
        user=None
    ):
        """
        Create journal entry for COGS
        Dr: COGS Expense
        Cr: Inventory Asset
        """
        total_cost = quantity * unit_cost
        
        # Get or create TransactionSeries for inventory
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Inventory Transactions'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"COGS - {item.name}",
            workflow_reference=reference_number,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )
        
        # Dr: COGS
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=item.category.cogs_account,
            side=JournalEntryLine.DEBIT,
            amount=total_cost
        )
        
        # Cr: Inventory
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=item.category.inventory_account,
            side=JournalEntryLine.CREDIT,
            amount=total_cost
        )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        return journal_entry
    
    @staticmethod
    def _create_adjustment_journal_entry(
        item: InventoryItem,
        adjustment_quantity: Decimal,
        unit_cost: Decimal,
        reference_number: str,
        reason: str,
        user=None
    ):
        """
        Create journal entry for stock adjustments
        Positive: Dr: Inventory, Cr: Adjustment Gain
        Negative: Dr: Adjustment Loss, Cr: Inventory
        """
        total_value = abs(adjustment_quantity) * unit_cost
        
        # Get or create TransactionSeries for inventory
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Inventory Transactions'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Stock adjustment - {item.name}: {reason}",
            workflow_reference=reference_number,
            owner=item.owner,
            branch=item.branch,
            created_by=user,
            tenant=item.tenant,
        )
        
        # Get adjustment accounts (should be configured in settings)
        try:
            adjustment_account, created = Account.objects.get_or_create(
                code='STOCK_ADJUSTMENT',
                owner=item.owner,
                defaults={
                    'name': 'Stock Adjustment Account',
                    'account_type': 'EXPENSE',
                    'account_level': 'PARENT',
                    'balance': Decimal('0.00'),
                    'is_system_account': True,
                    'allow_manual_entries': True
                }
            )
            if created:
                logger.info(f"Created stock adjustment account: {adjustment_account.code}")
        except Exception as e:
            logger.warning(f"Failed to get/create stock adjustment account, using COGS account: {str(e)}")
            # Fallback to COGS account
            try:
                adjustment_account = item.category.cogs_account
            except Exception as cogs_error:
                logger.error(f"Failed to get COGS account: {str(cogs_error)}")
                raise ValidationError(f"Failed to get adjustment or COGS account: {str(e)}, {str(cogs_error)}")
        
        if adjustment_quantity > 0:
            # Positive adjustment: increase inventory
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=item.category.inventory_account,
                side=JournalEntryLine.DEBIT,
                amount=total_value
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=adjustment_account,
                side=JournalEntryLine.CREDIT,
                amount=total_value
            )
        else:
            # Negative adjustment: decrease inventory
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=adjustment_account,
                side=JournalEntryLine.DEBIT,
                amount=total_value
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=item.category.inventory_account,
                side=JournalEntryLine.CREDIT,
                amount=total_value
            )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        return journal_entry
    
    @staticmethod
    def get_stock_valuation(owner, branch=None, as_of_date=None) -> Dict:
        """
        Calculate total inventory valuation
        """
        queryset = InventoryStock.objects.filter(owner=owner)
        
        if branch:
            queryset = queryset.filter(branch=branch)
        
        if as_of_date:
            # Would need to calculate historical values
            pass
        
        result = queryset.aggregate(
            total_quantity=models.Sum('quantity_on_hand'),
            total_value=models.Sum('total_value')
        )
        
        return {
            'total_quantity': result['total_quantity'] or Decimal('0'),
            'total_value': result['total_value'] or Decimal('0'),
            'as_of_date': as_of_date or timezone.now().date()
        }
    
    @staticmethod
    def get_items_below_reorder_level(owner, branch=None) -> List[Dict]:
        """
        Get items that need reordering
        """
        items = InventoryItem.objects.filter(
            owner=owner,
            is_active=True,
            is_purchasable=True
        )
        
        if branch:
            items = items.filter(branch=branch)
        
        items_to_reorder = []
        
        for item in items:
            total_stock = item.total_stock
            if total_stock <= item.reorder_level:
                items_to_reorder.append({
                    'item': item,
                    'current_stock': total_stock,
                    'reorder_level': item.reorder_level,
                    'reorder_quantity': item.reorder_quantity,
                    'shortage': item.reorder_level - total_stock
                })
        
        return items_to_reorder


class ProcurementService:
    """
    Service for procurement operations
    """
    
    @staticmethod
    @transaction.atomic
    def post_grn(grn, user=None):
        """
        Post Goods Received Note to inventory and accounting
        """
        if grn.is_posted:
            raise ValidationError("GRN already posted")
        
        total_amount = Decimal('0')
        
        # Process each item
        for grn_item in grn.items.all():
            # Add to inventory
            stock, movement = InventoryService.receive_stock(
                item=grn_item.item,
                location=grn.received_location,
                quantity=grn_item.quantity_received,
                unit_cost=grn_item.unit_cost,  # Fixed: was cost_price, should be unit_cost
                reference_number=grn.grn_number,
                grn=grn,
                po_item=grn_item.po_item,
                batch_number=grn_item.batch_number,
                serial_number=grn_item.serial_number,
                expiry_date=grn_item.expiry_date,
                user=user
            )
            
            total_amount += grn_item.total_cost
            
            # Update PO item received quantity
            if grn_item.po_item:
                grn_item.po_item.quantity_received += grn_item.quantity_received
                grn_item.po_item.save()
        
        # Create AccountsPayable for the GRN
        from liabilities.models import AccountsPayable
        from accounts.models import Account
        
        # Get or create child accounts payable account (2101 under parent 2100)
        # Parent 2100 is auto-seeded on tenant creation; we only need the posting child.
        try:
            liability_account = get_or_create_child_account(
                parent_code='2100',
                child_suffix='001',
                name='Trade Creditors (Accounts Payable)',
                account_type='LIABILITY',
                owner=user,
                branch=grn.branch if hasattr(grn, 'branch') else None,
                parent_name='Trade and Other Payables'
            )
            logger.info(f"GRN Posting: Liability account retrieved/created: {liability_account.code} - {liability_account.name}")
        except Exception as e:
            logger.error(f"GRN Posting: Failed to create child Accounts Payable account (2101): {str(e)}")
            raise ValidationError(f"Failed to create child Accounts Payable account (2101): {str(e)}")
        
        # Calculate payment due date based on supplier payment terms
        payment_terms_days = 30  # Default
        if grn.supplier.payment_terms == 'net_15':
            payment_terms_days = 15
        elif grn.supplier.payment_terms == 'net_30':
            payment_terms_days = 30
        elif grn.supplier.payment_terms == 'net_60':
            payment_terms_days = 60
        elif grn.supplier.payment_terms == 'net_90':
            payment_terms_days = 90
        elif grn.supplier.payment_terms == 'cash':
            payment_terms_days = 0
        
        due_date = timezone.now().date() + timezone.timedelta(days=payment_terms_days)
        
        payable = AccountsPayable.create_for_vendor(
            vendor=grn.supplier,
            account=liability_account,
            invoice_number=f"GRN-{grn.grn_number}",
            invoice_date=timezone.now().date(),
            due_date=due_date,
            amount=total_amount,
            description=f"Goods received note: {grn.grn_number}",
            branch=grn.branch if hasattr(grn, 'branch') else None,
            owner=user
        )
        
        # Create journal entry for GRN:
        # Dr. Inventory Asset (per item category)
        # Cr. Accounts Payable
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        
        try:
            series, _ = TransactionSeries.objects.get_or_create(
                code='INV',
                defaults={'description': 'Inventory Transactions'}
            )
            logger.info(f"GRN Posting: Transaction series retrieved/created: {series.code}")
        except Exception as e:
            logger.error(f"GRN Posting: Failed to create transaction series (INV): {str(e)}")
            raise ValidationError(f"Failed to create transaction series (INV): {str(e)}")
        
        try:
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=timezone.now().date(),
                description=f"GRN: {grn.grn_number} - {grn.supplier.name}",
                workflow_reference=grn.grn_number,
                tenant=getattr(user, 'tenant', None) if user else getattr(grn, 'tenant', None),
                owner=user,
                branch=grn.branch if hasattr(grn, 'branch') else None,
                created_by=user
            )
            logger.info(f"GRN Posting: Journal entry created: {journal_entry.id} for GRN {grn.grn_number}")
        except Exception as e:
            logger.error(f"GRN Posting: Failed to create journal entry for GRN {grn.grn_number}: {str(e)}")
            raise ValidationError(f"Failed to create journal entry for GRN {grn.grn_number}: {str(e)}")
        
        # Group items by inventory account to consolidate entries
        inventory_totals = {}
        for grn_item in grn.items.all():
            # Get inventory account - create default if missing or not configured
            inv_account = None
            item_identifier = f"Item ID: {grn_item.item.id if grn_item.item else 'N/A'}, SKU: {grn_item.item.sku if grn_item.item else 'N/A'}"
            
            # Safely try to get the inventory account from item category
            try:
                if grn_item.item and grn_item.item.category:
                    category_info = f"{grn_item.item.category.code} - {grn_item.item.category.name}"
                    # Try to access inventory_account, but catch if FK is broken
                    inv_account = grn_item.item.category.inventory_account
                    # Verify the account actually exists and hasn't been soft-deleted
                    if inv_account and (not hasattr(inv_account, 'is_deleted') or inv_account.is_deleted):
                        logger.warning(f"GRN Posting: Inventory account for category {category_info} is soft-deleted, using fallback")
                        inv_account = None
                    elif inv_account:
                        logger.info(f"GRN Posting: Using inventory account {inv_account.code} - {inv_account.name} for {item_identifier}")
                else:
                    logger.warning(f"GRN Posting: Item or category missing for {item_identifier}")
            except (AttributeError, Account.DoesNotExist) as e:
                # Category exists but inventory_account is null or deleted
                logger.warning(f"GRN Posting: Failed to access inventory account for {item_identifier}: {str(e)}")
                inv_account = None
            
            # If not configured or error occurred, use default child inventory account
            # Use 1124 (Trading Stock / Merchandise) — a CHILD of parent 1120 (Inventories).
            # Never post directly to PARENT 1120; parents are summary-only headers.
            if not inv_account:
                try:
                    logger.info(f"GRN Posting: Getting fallback inventory child account (1124) for {item_identifier}")
                    inv_account = get_or_create_child_account(
                        parent_code='1120',
                        child_suffix='004',
                        name='Trading Stock / Merchandise',
                        account_type='ASSET',
                        owner=user,
                        branch=grn.branch if hasattr(grn, 'branch') else None,
                        parent_name='Inventories',
                    )
                    logger.info(f"GRN Posting: Fallback inventory account retrieved: {inv_account.code} - {inv_account.name}")
                except Exception as e:
                    logger.error(f"GRN Posting: Failed to get fallback inventory account for {item_identifier}: {str(e)}")
                    raise ValidationError(f"Failed to get fallback inventory account (1124) for {item_identifier}: {str(e)}")
                
            if inv_account not in inventory_totals:
                inventory_totals[inv_account] = Decimal('0')
            inventory_totals[inv_account] += grn_item.total_cost
        
        # Create debit entries for each inventory account
        for inv_account, amount in inventory_totals.items():
            try:
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=inv_account,
                    side=JournalEntryLine.DEBIT,
                    amount=amount
                )
                logger.info(f"GRN Posting: Created DEBIT entry - Account: {inv_account.code} ({inv_account.name}), Amount: {amount}")
            except Exception as e:
                logger.error(f"GRN Posting: Failed to create DEBIT journal entry line for account {inv_account.code}: {str(e)}")
                raise ValidationError(f"Failed to create DEBIT journal entry for account {inv_account.code} - {inv_account.name}: {str(e)}")
        
        # Create credit entry for accounts payable
        try:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=liability_account,
                side=JournalEntryLine.CREDIT,
                amount=total_amount
            )
            logger.info(f"GRN Posting: Created CREDIT entry - Account: {liability_account.code} ({liability_account.name}), Amount: {total_amount}")
        except Exception as e:
            logger.error(f"GRN Posting: Failed to create CREDIT journal entry line for account {liability_account.code}: {str(e)}")
            raise ValidationError(f"Failed to create CREDIT journal entry for account {liability_account.code} - {liability_account.name}: {str(e)}")
        
        # Capture pre-post balances for involved accounts so we can verify updates
        involved_account_ids = set([acct.pk for acct in inventory_totals.keys()])
        involved_account_ids.add(liability_account.pk)
        prev_balances_qs = Account.objects.filter(pk__in=involved_account_ids).values('id', 'balance')
        prev_balances = {row['id']: row['balance'] for row in prev_balances_qs}

        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        try:
            logger.info(f"GRN Posting: Posting journal entry {journal_entry.id} to update account balances")
            journal_entry.post()
            logger.info(f"GRN Posting: Journal entry {journal_entry.id} posted successfully")
        except Exception as e:
            logger.error(f"GRN Posting: Failed to post journal entry {journal_entry.id}: {str(e)}")
            raise ValidationError(f"Failed to post journal entry to update account balances: {str(e)}")

        # Verify posting: each entry must be marked posted and account balances must change correctly
        errors = []

        for entry in journal_entry.entries.select_related('account').all():
            # Ensure entry flagged as posted (field name is `posted`)
            entry.refresh_from_db()
            if not getattr(entry, 'posted', False):
                errors.append(f"Entry {entry.id} for account {entry.account.code} was not marked as posted (posted=False).")

            # Verify account balance delta - use get_balance_effect() which handles account type sign rules
            try:
                acct = Account.objects.select_for_update().get(pk=entry.account_id)
            except Account.DoesNotExist:
                logger.error(f"GRN Posting Verification: Account ID {entry.account_id} not found during verification")
                errors.append(f"Account ID {entry.account_id} not found for entry {entry.id}")
                continue
                
            prev = prev_balances.get(acct.id)
            if prev is None:
                # Unexpected: account not captured earlier
                errors.append(f"Account {acct.code} was not included in pre-post snapshot.")
                continue

            # Use get_balance_effect() which applies correct sign convention based on account type
            expected_delta = entry.get_balance_effect()
            actual_delta = acct.balance - prev
            if actual_delta != expected_delta:
                errors.append(
                    f"Account {acct.code} (Type: {acct.account_type}) balance changed by {actual_delta} "
                    f"but expected {expected_delta} for entry id={entry.id} (side={entry.side}, amount={entry.amount})."
                )

        if errors:
            # Log details and raise ValidationError to rollback the GRN posting transaction
            logger.error(
                "GRN posting failed integrity checks: %s",
                "; ".join(errors)
            )
            raise ValidationError({
                'journal_post': 'GRN posting failed integrity checks — see details',
                'details': errors
            })

        logger.info(f"GRN accounting entry posted: {journal_entry.reference_number}")
        
        # Mark GRN as posted
        grn.is_posted = True
        grn.posted_at = timezone.now()
        grn.total_amount = total_amount
        grn.save()
        
        # Update PO status if applicable
        if grn.purchase_order:
            ProcurementService._update_po_status(grn.purchase_order)
        
        logger.info(f"GRN posted: {grn.grn_number} - Total: {total_amount}")
        
        return grn, payable
    
    @staticmethod
    def _update_po_status(purchase_order):
        """
        Update PO status based on received quantities
        """
        all_received = True
        any_received = False
        
        for item in purchase_order.items.all():
            if item.quantity_received < item.quantity:
                all_received = False
            if item.quantity_received > 0:
                any_received = True
        
        if all_received:
            purchase_order.status = 'received'
        elif any_received:
            purchase_order.status = 'partially_received'
        
        purchase_order.save()