# banks/signals.py
"""
Signals for the banks app.

Key signals:
  post_save on TransactionEntry → whenever a journal line is posted
  to an Account that has a linked BankAccount, sync
  BankAccount.current_balance from the GL balance immediately.

  post_save on BankAccount → when is_cashier_collection_account is True,
  auto-create a corresponding CashierAccount linked to the same GL account.

This ensures BankAccount.current_balance is always current after any
payment, transfer, or manual journal entry without requiring an explicit
BankAccount.save() call from every caller.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender='transactions.TransactionEntry')
def sync_bank_account_balance(sender, instance, **kwargs):
    """
    After any TransactionEntry is saved (posted), check whether the
    entry's account is linked to a BankAccount and, if so, refresh the
    cached current_balance from the GL account balance.
    """
    try:
        account = instance.account
        # The reverse OneToOne accessor is 'bank_account' (set in BankAccount.gl_account)
        if not hasattr(account, 'bank_account'):
            return

        bank_account = account.bank_account
        # Refresh GL balance from DB to get the latest value
        account.refresh_from_db(fields=['balance'])
        new_balance = account.balance

        if bank_account.current_balance != new_balance:
            bank_account.current_balance = new_balance
            bank_account.save(update_fields=['current_balance'])
            logger.debug(
                "Synced BankAccount %s balance → %s",
                bank_account.account_number,
                new_balance,
            )
    except Exception:
        # Never let a signal crash the originating transaction
        logger.exception(
            "Error syncing BankAccount balance after TransactionEntry save (pk=%s)",
            instance.pk,
        )


@receiver(post_save, sender='banks.BankAccount')
def auto_create_cashier_account_from_collection_bank(sender, instance, **kwargs):
    """
    When a BankAccount is saved with is_cashier_collection_account=True and
    has a linked GL account, auto-create a CashierAccount that points to the
    same GL account. This ensures cashier-based bank transfers can reference
    the CashierAccount in the source_cashier_account FK.

    If a CashierAccount already exists for that GL account (e.g. from a prior
    save), it is re-used. Soft-deleted accounts are restored.
    """
    if not instance.is_cashier_collection_account or not instance.gl_account_id:
        return

    from cash_management.models import CashierAccount

    try:
        cashier_account = CashierAccount.objects.get(account=instance.gl_account)
        if cashier_account.is_deleted:
            cashier_account.is_deleted = False
            cashier_account.is_active = True
            cashier_account.save(update_fields=['is_deleted', 'is_active'])
            logger.info(
                "Restored soft-deleted CashierAccount %s for BankAccount %s",
                cashier_account.account_number,
                instance.account_number,
            )
    except CashierAccount.DoesNotExist:
        display_name = instance.account_name or str(instance.bank)
        CashierAccount.objects.create(
            account=instance.gl_account,
            account_number=f"COL{instance.id}",
            name=f"Collection - {display_name} - {instance.account_number}",
            is_active=True,
            branch=instance.branch,
            owner=instance.owner,
        )
        logger.info(
            "Auto-created CashierAccount COL%s for BankAccount %s (collection account)",
            instance.id,
            instance.account_number,
        )
