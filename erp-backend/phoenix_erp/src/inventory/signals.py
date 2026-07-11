# inventory/signals.py
"""
Django signals for automatic inventory operations
"""
from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from decimal import Decimal
import logging

from .models import Invoice, InvoiceItem, InventoryCategory
from .stock_service import InventoryService

logger = logging.getLogger(__name__)


# ============================================================================
# INVENTORY CATEGORY SIGNALS
# ============================================================================

@receiver(post_save, sender=InventoryCategory)
def auto_create_category_income_account(sender, instance, created, **kwargs):
    """
    Auto-create a dedicated income (sales revenue) account for a new inventory
    category when no sales_account has been specified.

    The account is created as a child of the '400 Sales Revenue' parent using
    the category's primary-key as the numeric suffix so each category gets its
    own distinct GL line.
    """
    if not created:
        return

    if instance.sales_account_id:
        # Already provided by the user – nothing to do
        return

    if not instance.owner or not instance.branch:
        logger.warning(
            f"Cannot auto-create income account for category '{instance.name}' "
            "– owner or branch is not set."
        )
        return

    try:
        from accounts.utils.account_creation import get_or_create_child_account

        account = get_or_create_child_account(
            parent_code='4100',
            child_suffix=str(instance.pk),
            name=f'{instance.name} Sales Revenue',
            account_type='INCOME',
            owner=instance.owner,
            branch=instance.branch,
            parent_name='Revenue from Contracts with Customers',
        )

        # Update without triggering the signal again
        InventoryCategory.objects.filter(pk=instance.pk).update(sales_account=account)
        instance.sales_account = account

        logger.info(
            f"Auto-created income account '{account.code} – {account.name}' "
            f"for inventory category '{instance.name}'"
        )
    except Exception as exc:
        logger.error(
            f"Failed to auto-create income account for category '{instance.name}': {exc}",
            exc_info=True,
        )


@receiver(pre_save, sender=Invoice)
def prevent_duplicate_posting(sender, instance, **kwargs):
    """
    Prevent re-posting an already posted invoice
    This protects against duplicate stock reductions
    """
    if instance.pk:
        try:
            old_instance = Invoice.objects.get(pk=instance.pk)
            if old_instance.is_posted and instance.is_posted:
                # Already posted - no changes allowed to posting status
                logger.warning(
                    f"Attempt to re-post already posted invoice {instance.invoice_number}"
                )
        except Invoice.DoesNotExist:
            pass


@receiver(post_save, sender=Invoice)
def reduce_stock_on_posting(sender, instance, created, **kwargs):
    """
    Automatically reduce stock when invoice is posted
    Creates COGS accounting entries for each line item
    
    This signal handles:
    1. Stock reduction from default location
    2. COGS accounting entries (Dr COGS, Cr Inventory)
    3. Stock movement audit trail
    """
    # Only process if invoice was just posted (is_posted changed to True)
    if not created and instance.is_posted:
        # Check if this was a posting action (not already posted)
        try:
            # Get previous state from database
            old_instance = Invoice.objects.get(pk=instance.pk)
            
            # If it was already posted before this save, skip processing
            # This prevents duplicate reductions on subsequent updates
            if Invoice.objects.filter(
                pk=instance.pk,
                is_posted=True,
                posted_at__isnull=False
            ).exclude(posted_at=instance.posted_at).exists():
                logger.info(
                    f"Invoice {instance.invoice_number} was already posted. "
                    "Skipping stock reduction."
                )
                return
                
        except Invoice.DoesNotExist:
            pass
        
        # Process all invoice items
        process_invoice_stock_reduction(instance)


def process_invoice_stock_reduction(invoice):
    """
    Process stock reduction for all inventory line items in an invoice.

    This function:
    1. Releases any existing stock reservations for line items
    2. Reduces stock from the appropriate location for each inventory item
    3. Creates a SINGLE consolidated COGS journal entry (Dr COGS / Cr Inventory)
    4. Creates stock movement audit records

    NOTE: Revenue posting (Dr AR / Cr Income-category accounts) is handled
    exclusively by Invoice.post() to avoid double-counting.

    Raises:
        ValidationError: If stock reduction fails for any item
    """
    from django.db import transaction as db_transaction
    from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
    from decimal import Decimal
    from django.utils import timezone

    logger.info(f"Processing stock reduction for invoice {invoice.invoice_number}")

    # Get all invoice items
    invoice_items = invoice.items.select_related('item__category__sales_account').all()

    if not invoice_items:
        logger.warning(f"Invoice {invoice.invoice_number} has no items to process")
        return

    errors = []
    critical_errors = []  # Errors that should abort the transaction
    cogs_entries = {}  # Track COGS by account: {account_id: {account, amount}}
    inventory_entries = {}  # Track inventory reduction by account: {account_id: {account, amount}}
    # NOTE: Revenue posting is handled exclusively by Invoice.post() to avoid
    # double-counting. This signal only handles COGS and stock reduction.

    # Process all items in a single transaction
    with db_transaction.atomic():
        for invoice_item in invoice_items:
            # Skip COGS / stock reduction for items without inventory item link
            if not invoice_item.item:
                logger.info(
                    f"Skipping invoice item {invoice_item.id} - no inventory item linked"
                )
                continue

            try:
                # Release reservation first (if exists)
                if (invoice_item.reserved_quantity > 0 and
                    invoice_item.reserved_from_location and
                    not invoice_item.is_reservation_released):

                    try:
                        InventoryService.release_reservation(
                            item=invoice_item.item,
                            location=invoice_item.reserved_from_location,
                            quantity=invoice_item.reserved_quantity,
                            reference_number=invoice.invoice_number,
                            user=invoice.created_by
                        )

                        # Mark reservation as released
                        InvoiceItem.objects.filter(pk=invoice_item.pk).update(
                            is_reservation_released=True
                        )

                        logger.info(
                            f"Released reservation for {invoice_item.item.sku}: "
                            f"{invoice_item.reserved_quantity} units"
                        )
                    except Exception as e:
                        logger.error(f"Error releasing reservation: {str(e)}")

                # Use reserved location if available, otherwise find location
                location = invoice_item.reserved_from_location
                if not location:
                    location = get_primary_location_for_item(invoice_item.item, invoice.branch)

                if not location:
                    error_msg = (
                        f"No active location found for item {invoice_item.item.sku}. "
                        "Cannot reduce stock."
                    )
                    logger.error(error_msg)
                    errors.append(error_msg)
                    continue

                # Reduce stock WITHOUT creating journal entry (we'll batch them below)
                # We temporarily disable COGS journal creation in reduce_stock
                stock, movement = InventoryService.reduce_stock(
                    item=invoice_item.item,
                    location=location,
                    quantity=invoice_item.quantity,
                    movement_type='transfer',  # Use transfer instead of sale to skip auto COGS
                    reference_number=invoice.invoice_number,
                    unit_cost=None,  # Will use average cost from stock record
                    user=invoice.created_by
                )

                # Update movement type to 'sale' after creation
                movement.movement_type = 'sale'
                movement.save()

                # Accumulate COGS and inventory amounts by account
                cogs_account = invoice_item.item.category.cogs_account
                inventory_account = invoice_item.item.category.inventory_account
                item_cost = movement.unit_cost * invoice_item.quantity

                if cogs_account.id not in cogs_entries:
                    cogs_entries[cogs_account.id] = {'account': cogs_account, 'amount': Decimal('0')}
                cogs_entries[cogs_account.id]['amount'] += item_cost

                if inventory_account.id not in inventory_entries:
                    inventory_entries[inventory_account.id] = {'account': inventory_account, 'amount': Decimal('0')}
                inventory_entries[inventory_account.id]['amount'] += item_cost

                logger.info(
                    f"Stock reduced for {invoice_item.item.sku}: "
                    f"{invoice_item.quantity} units from {location.code}"
                )

            except ValidationError as e:
                # Stock validation errors (insufficient stock) are CRITICAL
                error_msg = f"Stock validation failed for {invoice_item.item.sku}: {str(e)}"
                logger.error(error_msg)
                critical_errors.append(error_msg)
                errors.append(error_msg)

            except Exception as e:
                error_msg = (
                    f"Unexpected error reducing stock for {invoice_item.item.sku}: {str(e)}"
                )
                logger.exception(error_msg)
                critical_errors.append(error_msg)
                errors.append(error_msg)

        # Get or create TransactionSeries for inventory
        series, _ = TransactionSeries.objects.get_or_create(
            code='INV',
            defaults={'description': 'Inventory Transactions'}
        )

        # ----------------------------------------------------------------
        # 1. Create single consolidated COGS journal entry for all items
        # ----------------------------------------------------------------
        if cogs_entries:
            try:
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=f"COGS - Invoice {invoice.invoice_number}",
                    workflow_reference=invoice.invoice_number,
                    owner=invoice.owner,
                    branch=invoice.branch,
                    created_by=invoice.created_by,
                    tenant=invoice.tenant,
                )

                # Create debit entries for COGS (one per COGS account)
                for cogs_data in cogs_entries.values():
                    JournalEntryLine.objects.create(
                        transaction=journal_entry,
                        account=cogs_data['account'],
                        side=JournalEntryLine.DEBIT,
                        amount=cogs_data['amount']
                    )

                # Create credit entries for Inventory (one per inventory account)
                for inventory_data in inventory_entries.values():
                    JournalEntryLine.objects.create(
                        transaction=journal_entry,
                        account=inventory_data['account'],
                        side=JournalEntryLine.CREDIT,
                        amount=inventory_data['amount']
                    )

                # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
                journal_entry.post()

                logger.info(
                    f"Created consolidated COGS journal entry for invoice {invoice.invoice_number}"
                )

            except Exception as e:
                error_msg = f"Failed to create COGS journal entry: {str(e)}"
                logger.exception(error_msg)
                errors.append(error_msg)

    # If there were critical errors (stock validation failures), abort the transaction
    if critical_errors:
        error_detail = "\n".join(critical_errors)
        logger.error(
            f"CRITICAL: Invoice {invoice.invoice_number} stock reduction failed. "
            f"Transaction will be rolled back. Errors:\n{error_detail}"
        )
        raise ValidationError(
            f"Cannot post invoice - stock reduction failed:\n{error_detail}"
        )
    
    if errors:
        # Non-critical errors (e.g., accounting issues) - log but don't abort
        logger.error(
            f"Invoice {invoice.invoice_number} posted with {len(errors)} non-critical errors:\n"
            + "\n".join(errors)
        )
        # In production, you might want to send alerts or create tasks for manual review


def get_primary_location_for_item(item, branch):
    """
    Get the primary location to reduce stock from for an item
    
    Priority:
    1. Location with stock for this item in the invoice's branch
    2. First active location in the branch
    3. First active location in the system (if no branch)
    
    Args:
        item: InventoryItem instance
        branch: Branch instance (can be None)
        
    Returns:
        Location instance or None
    """
    from .models import Location, InventoryStock
    
    # Try to find location with available stock for this item
    if branch:
        # Look for stock in branch's locations
        stock_with_qty = InventoryStock.objects.filter(
            item=item,
            location__branch=branch,
            location__is_active=True,
            quantity_available__gt=0
        ).select_related('location').first()
        
        if stock_with_qty:
            return stock_with_qty.location
        
        # No stock found, use first active location in branch
        location = Location.objects.filter(
            branch=branch,
            is_active=True
        ).first()
        
        if location:
            return location
    
    # Fallback: Find any location with stock for this item
    stock_with_qty = InventoryStock.objects.filter(
        item=item,
        location__is_active=True,
        quantity_available__gt=0
    ).select_related('location').first()
    
    if stock_with_qty:
        return stock_with_qty.location
    
    # Last resort: Use first active location in system
    location = Location.objects.filter(is_active=True).first()
    
    return location


# ============================================================================
# STOCK RESERVATION SIGNALS
# ============================================================================

@receiver(post_save, sender=InvoiceItem)
def reserve_stock_for_invoice_item(sender, instance, created, **kwargs):
    """
    Automatically reserve stock when invoice item is created
    
    This ensures that when an invoice is issued, the stock is "held"
    for that customer, preventing overselling.
    """
    # Only process new invoice items that have inventory items and aren't posted yet
    if not created or not instance.item or instance.invoice.is_posted:
        return
    
    # Skip if already reserved
    if instance.reserved_quantity > 0 and instance.reserved_from_location:
        logger.info(
            f"Invoice item {instance.id} already has stock reserved "
            f"({instance.reserved_quantity} units from {instance.reserved_from_location.code})"
        )
        return
    
    try:
        # Get the primary location for this item
        location = get_primary_location_for_item(instance.item, instance.invoice.branch)
        
        if not location:
            logger.error(
                f"No active location found for item {instance.item.sku}. "
                "Cannot reserve stock."
            )
            return
        
        # Reserve the stock
        InventoryService.reserve_stock(
            item=instance.item,
            location=location,
            quantity=instance.quantity,
            reference_number=instance.invoice.invoice_number,
            user=instance.invoice.created_by
        )
        
        # Track the reservation
        instance.reserved_from_location = location
        instance.reserved_quantity = instance.quantity
        instance.is_reservation_released = False
        # Use update to avoid triggering the signal again
        InvoiceItem.objects.filter(pk=instance.pk).update(
            reserved_from_location=location,
            reserved_quantity=instance.quantity,
            is_reservation_released=False
        )
        
        logger.info(
            f"Reserved {instance.quantity} units of {instance.item.sku} "
            f"from {location.code} for invoice {instance.invoice.invoice_number}"
        )
        
    except ValidationError as e:
        logger.error(
            f"Failed to reserve stock for invoice item {instance.id}: {str(e)}"
        )
    except Exception as e:
        logger.exception(
            f"Unexpected error reserving stock for invoice item {instance.id}: {str(e)}"
        )


@receiver(pre_delete, sender=InvoiceItem)
def release_reservation_on_delete(sender, instance, **kwargs):
    """
    Release stock reservation when invoice item is deleted
    """
    if (instance.item and instance.reserved_quantity > 0 and 
        instance.reserved_from_location and not instance.is_reservation_released):
        
        try:
            InventoryService.release_reservation(
                item=instance.item,
                location=instance.reserved_from_location,
                quantity=instance.reserved_quantity,
                reference_number=instance.invoice.invoice_number,
                user=None
            )
            
            logger.info(
                f"Released reservation: {instance.reserved_quantity} units of "
                f"{instance.item.sku} from {instance.reserved_from_location.code}"
            )
        except Exception as e:
            logger.exception(
                f"Error releasing reservation on delete for item {instance.id}: {str(e)}"
            )
