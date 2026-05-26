"""
Expense signals for auto-generation
"""
from django.db.models.signals import pre_save
from django.dispatch import receiver

from expenses.models import Expense, PrepaidExpense
from common.services.reference_service import ReferenceService


@receiver(pre_save, sender=Expense)
def generate_expense_reference(sender, instance, **kwargs):
    """Auto-generate reference number for expense if not set"""
    if not instance.reference_number and instance.owner and instance.branch:
        # Use ReferenceService for proper reference tracking
        tenant = instance.owner.tenant if hasattr(instance.owner, 'tenant') else instance.owner
        instance.reference_number = ReferenceService.generate_reference(
            module='expenses',
            model_name='expense',
            tenant=tenant,
            branch=instance.branch
        )


@receiver(pre_save, sender=PrepaidExpense)
def generate_prepaid_reference(sender, instance, **kwargs):
    """Auto-generate reference number for prepaid expense if not set"""
    if not instance.reference_number and instance.owner and instance.branch:
        # Use ReferenceService for proper reference tracking
        tenant = instance.owner.tenant if hasattr(instance.owner, 'tenant') else instance.owner
        instance.reference_number = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_expense',
            tenant=tenant,
            branch=instance.branch
        )
