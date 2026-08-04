"""
procurement/signals.py

Django signals for the Procurement module.

Handlers:
    _create_supplier_payable_account
        When a new Supplier is created, automatically provision its own
        dedicated GL child account (under the shared "Trade and Other
        Payables" parent) so invoices, on-account advances, and applied
        payments all post to one account per vendor — a real subledger.
        Failures are logged but never propagate — supplier creation is
        never blocked; get_or_create_supplier_payable_account() is also
        called lazily wherever a supplier's account is needed, so a failed
        signal here is self-healing on first use.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='procurement.Supplier')
def _create_supplier_payable_account(sender, instance, created, **kwargs):
    if not created or instance.account_id:
        return

    from accounts.utils.account_creation import get_or_create_supplier_payable_account

    try:
        get_or_create_supplier_payable_account(
            supplier=instance,
            owner=instance.owner,
            branch=instance.branch,
        )
    except Exception:
        logger.exception(
            "Failed to auto-provision GL account for supplier %s (id=%s)",
            instance.supplier_code, instance.pk,
        )
