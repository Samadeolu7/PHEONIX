# banks/signals.py
"""
Signals for the banks app.

Key signal:
  post_save on TransactionEntry → whenever a journal line is posted
  to an Account that has a linked BankAccount, sync
  BankAccount.current_balance from the GL balance immediately.

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
