# cash_management/signals.py
"""
Signals for the cash_management app.

post_save on TransactionEntry -> whenever a journal line is posted to an
Account that has a linked CashierAccount and/or PettyCashFund, sync their
cached current_balance from the GL balance immediately. This mirrors
banks/signals.py's sync_bank_account_balance for BankAccount.

Without this, CashierAccount.current_balance and PettyCashFund.current_balance
are denormalized caches that only stay correct if every code path that posts
against their GL account (BankTransfer.complete(), CashCollection.post(),
PettyCashVoucher.disburse(), PettyCashReplenishment.post(), ...) remembers to
update them too. Missing one is exactly what produced a CashierAccount whose
cached balance had drifted tens of thousands of naira from its real GL
balance. This signal makes the GL Account.balance the single source of truth
both caches always resync from, regardless of which code path changed it.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender='transactions.TransactionEntry')
def sync_cashier_and_petty_cash_balances(sender, instance, **kwargs):
    """
    After any TransactionEntry is saved (posted), refresh the cached
    current_balance on any CashierAccount / PettyCashFund linked to the
    entry's account from the GL account balance.

    Uses queryset.update() rather than instance.save() so this never trips
    CashierAccount.save()'s balance-write protection, which only allow-lists
    specific caller function names (post, _post_collection, refresh_from_db,
    bulk_update, _do_update, inner) - update() routes through _do_update,
    which is already on that list.

    Only acts on entries that are actually posted. CashCollection.post()
    (the older of two "post a collection" implementations in this app) creates
    TransactionEntry rows via .create() without ever calling .post() on them,
    and instead bumps CashierAccount.current_balance directly by arithmetic -
    for those rows the GL Account.balance never changes, so resyncing here
    would silently overwrite that correct, manually-tracked balance back down
    to the (unchanged) GL figure.
    """
    if not instance.posted:
        return
    try:
        account = instance.account
        account.refresh_from_db(fields=['balance'])
        new_balance = account.balance

        from cash_management.models import CashierAccount, PettyCashFund

        CashierAccount.objects.filter(account=account).exclude(
            current_balance=new_balance
        ).update(current_balance=new_balance)

        PettyCashFund.objects.filter(petty_cash_account=account).exclude(
            current_balance=new_balance
        ).update(current_balance=new_balance)
    except Exception:
        # Never let a signal crash the originating transaction
        logger.exception(
            "Error syncing CashierAccount/PettyCashFund balance after "
            "TransactionEntry save (pk=%s)", instance.pk,
        )
