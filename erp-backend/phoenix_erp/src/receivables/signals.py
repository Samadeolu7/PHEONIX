# receivables/signals.py
"""
Signals to automatically create/update CustomerReceivable records
when invoices, entitlements, or loans are created/updated
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType
import logging

from .models import CustomerReceivable

logger = logging.getLogger(__name__)


@receiver(post_save, sender='incomes.Invoice')
def create_or_update_receivable_for_income_invoice(sender, instance, created, **kwargs):
    """Auto-create/update CustomerReceivable when Income Invoice is saved"""
    from incomes.models import Invoice
    from decimal import Decimal
    
    logger.info(f"Signal fired for Income Invoice {instance.invoice_number} (id={instance.id}, created={created}, status={instance.status})")
    
    content_type = ContentType.objects.get_for_model(Invoice)
    
    # Use total_amount (the computed field); fall back to the legacy `amount`
    # field; default to 0 if both are None (invoice was just inserted, totals
    # haven't been calculated yet).
    _zero = Decimal('0')
    invoice_amount = (
        instance.total_amount
        if instance.total_amount is not None
        else (instance.amount if instance.amount is not None else _zero)
    )
    amount_paid = instance.amount_paid if instance.amount_paid is not None else _zero
    balance = invoice_amount - amount_paid
    
    try:
        # Get or create receivable
        receivable, rec_created = CustomerReceivable.objects.get_or_create(
            content_type=content_type,
            object_id=instance.id,
            defaults={
                'client': instance.client,
                'receivable_type': 'invoice',
                'reference_number': instance.invoice_number,
                'original_amount': invoice_amount,
                'amount_paid': amount_paid,
                'balance': balance,
                'due_date': instance.due_date,
                'status': _map_invoice_status(instance.status),
                'owner': instance.owner,
                'branch': instance.branch,
                'created_by': instance.created_by,
            }
        )
        
        if rec_created:
            logger.info(f"✓ Created CustomerReceivable {receivable.id} for Invoice {instance.invoice_number} (status={receivable.status})")
        else:
            logger.info(f"Found existing CustomerReceivable {receivable.id} for Invoice {instance.invoice_number}")
        
        # Update if already exists - sync cached values from source
        if not rec_created:
            receivable.original_amount = invoice_amount
            receivable.amount_paid = amount_paid
            # Balance is automatically recomputed from original_amount - amount_paid in save()
            receivable.status = _map_invoice_status(instance.status)
            receivable.save(update_fields=['original_amount', 'amount_paid', 'status'])  # Don't include 'balance' - it's computed
            receivable.update_aging()
            logger.info(f"✓ Updated CustomerReceivable {receivable.id} (balance={receivable.balance})")
            
    except Exception as e:
        logger.error(f"✗ Failed to create/update receivable for Invoice {instance.invoice_number}: {e}", exc_info=True)


@receiver(post_save, sender='inventory.Invoice')
def create_or_update_receivable_for_inventory_invoice(sender, instance, created, **kwargs):
    """Auto-create/update CustomerReceivable when Inventory Invoice is saved"""
    from inventory.models import Invoice as InventoryInvoice
    
    logger.info(f"Signal fired for Inventory Invoice {instance.invoice_number} (id={instance.id}, created={created}, status={instance.status})")
    
    content_type = ContentType.objects.get_for_model(InventoryInvoice)
    
    # Calculate balance from fields (balance is a @property, can't be set)
    balance = instance.total_amount - instance.amount_paid
    
    try:
        # Get or create receivable
        receivable, rec_created = CustomerReceivable.objects.get_or_create(
            content_type=content_type,
            object_id=instance.id,
            defaults={
                'client': instance.client,
                'receivable_type': 'invoice',
                'reference_number': instance.invoice_number,
                'original_amount': instance.total_amount,
                'amount_paid': instance.amount_paid,
                'balance': instance.total_amount - instance.amount_paid,  # Computed from source
                'due_date': instance.due_date,
                'status': _map_invoice_status(instance.status),
                'owner': instance.owner,
                'branch': instance.branch,
                'created_by': instance.created_by,
            }
        )
        
        if rec_created:
            logger.info(f"✓ Created CustomerReceivable {receivable.id} for Inventory Invoice {instance.invoice_number} (status={receivable.status})")
        else:
            logger.info(f"Found existing CustomerReceivable {receivable.id} for Inventory Invoice {instance.invoice_number}")
        
        # Update if already exists - sync cached values from source
        if not rec_created:
            receivable.original_amount = instance.total_amount
            receivable.amount_paid = instance.amount_paid
            # Balance is automatically recomputed from total_amount - amount_paid in save()
            receivable.status = _map_invoice_status(instance.status)
            receivable.save(update_fields=['original_amount', 'amount_paid', 'status'])  # Don't include 'balance' - it's computed
            receivable.update_aging()
            logger.info(f"✓ Updated CustomerReceivable {receivable.id} (balance={receivable.balance})")
            
    except Exception as e:
        logger.error(f"✗ Failed to create/update receivable for Inventory Invoice {instance.invoice_number}: {e}", exc_info=True)


@receiver(post_save, sender='incomes.FeeEntitlement')
def create_or_update_receivable_for_entitlement(sender, instance, created, **kwargs):
    """Auto-create/update CustomerReceivable when FeeEntitlement is saved"""
    from incomes.models import FeeEntitlement
    
    content_type = ContentType.objects.get_for_model(FeeEntitlement)
    
    # Determine reference number
    ref_num = f"ENT-{instance.id}"
    if instance.invoice:
        ref_num = instance.invoice.invoice_number
    
    # Determine due date
    due_date = instance.valid_until or instance.created_at.date()
    
    # Calculate balance from fields (balance is a @property, can't be set)
    balance = instance.total_amount - instance.amount_paid
    
    # Get or create receivable
    receivable, rec_created = CustomerReceivable.objects.get_or_create(
        content_type=content_type,
        object_id=instance.id,
        defaults={
            'client': instance.client,
            'receivable_type': 'entitlement',
            'reference_number': ref_num,
            'original_amount': instance.total_amount,
            'amount_paid': instance.amount_paid,
            'balance': instance.total_amount - instance.amount_paid,  # Computed from source
            'due_date': due_date,
            'status': _map_entitlement_status(instance.status),
            'owner': instance.owner,
            'branch': instance.branch,
            'created_by': instance.created_by,
        }
    )
    
    # Update if already exists - sync cached values from source
    if not rec_created:
        receivable.original_amount = instance.total_amount
        receivable.amount_paid = instance.amount_paid
        # Balance is automatically recomputed from total_amount - amount_paid in save()
        receivable.status = _map_entitlement_status(instance.status)
        receivable.save(update_fields=['original_amount', 'amount_paid', 'status'])  # Don't include 'balance' - it's computed
        receivable.update_aging()


@receiver(post_save, sender='loans.LoanAccount')
def create_or_update_receivable_for_loan(sender, instance, created, **kwargs):
    """Auto-create/update CustomerReceivable when LoanAccount is saved"""
    from loans.models import LoanAccount
    
    content_type = ContentType.objects.get_for_model(LoanAccount)
    
    # Loans have interest, so set interest rate
    interest_rate = instance.interest_rate if hasattr(instance, 'interest_rate') else 0
    
    # Get or create receivable
    receivable, rec_created = CustomerReceivable.objects.get_or_create(
        content_type=content_type,
        object_id=instance.id,
        defaults={
            'client': instance.client,
            'receivable_type': 'loan',
            'reference_number': instance.loan_number,
            'original_amount': instance.approved_amount or instance.requested_amount,
            'amount_paid': instance.total_paid if hasattr(instance, 'total_paid') else 0,
            'balance': instance.outstanding_principal if hasattr(instance, 'outstanding_principal') else (instance.approved_amount or instance.requested_amount),
            'due_date': instance.maturity_date,
            'status': _map_loan_status(instance.status),
            'overdue_interest_rate': interest_rate,
            'owner': instance.owner,
            'branch': instance.branch,
            'created_by': instance.created_by,
        }
    )
    
    # Update if already exists - sync cached values from source
    if not rec_created:
        receivable.original_amount = instance.approved_amount or instance.requested_amount
        receivable.amount_paid = instance.total_paid if hasattr(instance, 'total_paid') else 0
        # Balance is automatically recomputed from original_amount - amount_paid in save()
        receivable.status = _map_loan_status(instance.status)
        receivable.save(update_fields=['original_amount', 'amount_paid', 'status'])  # Don't include 'balance' - it's computed
        receivable.update_aging()


@receiver(post_delete, sender='incomes.Invoice')
@receiver(post_delete, sender='inventory.Invoice')
@receiver(post_delete, sender='incomes.FeeEntitlement')
@receiver(post_delete, sender='loans.LoanAccount')
def delete_receivable_on_source_delete(sender, instance, **kwargs):
    """Delete CustomerReceivable when source is deleted"""
    content_type = ContentType.objects.get_for_model(sender)
    
    try:
        receivable = CustomerReceivable.objects.get(
            content_type=content_type,
            object_id=instance.id
        )
        receivable.delete()
    except CustomerReceivable.DoesNotExist:
        pass


# Helper functions to map statuses
def _map_invoice_status(invoice_status):
    """Map invoice status to receivable status"""
    status_map = {
        'draft': 'pending',
        'sent': 'pending',
        'partial': 'partial',
        'paid': 'paid',
        'overdue': 'overdue',
        'cancelled': 'written_off',
    }
    return status_map.get(invoice_status, 'pending')


def _map_entitlement_status(entitlement_status):
    """Map entitlement status to receivable status"""
    status_map = {
        'pending': 'pending',
        'active': 'partial',  # Active usually means partially paid
        'suspended': 'overdue',
        'completed': 'paid',
        'cancelled': 'written_off',
    }
    return status_map.get(entitlement_status, 'pending')


def _map_loan_status(loan_status):
    """Map loan status to receivable status"""
    status_map = {
        'pending': 'pending',
        'approved': 'pending',
        'active': 'partial',
        'paid_off': 'paid',
        'written_off': 'written_off',
        'defaulted': 'overdue',
    }
    return status_map.get(loan_status, 'pending')
