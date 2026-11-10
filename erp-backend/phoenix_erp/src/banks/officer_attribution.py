"""
Who a payment belongs to, for reconciliation.

Normally that's the user who posted it (Transaction.created_by). Collection
sheet bank transfers are the exception: the supervisor confirms and posts
them, but the money was collected by the sheet's credit officer. Without this,
every confirmed transfer shows up as the supervisor's — the officer never
sees their own "recorded, not in bank" line, and the supervisor gets the blame.
"""


def collecting_officers(txn_ids):
    """{transaction id: User} for payments posted from a collection sheet item."""
    ids = [i for i in set(txn_ids or []) if i]
    if not ids:
        return {}
    from cash_management.models import CollectionSheetItem
    from django.contrib.auth import get_user_model

    manager = getattr(CollectionSheetItem, 'all_objects', CollectionSheetItem.objects)
    pairs = list(
        manager.filter(journal_entry_id__in=ids, is_deleted=False)
        .exclude(sheet__credit_officer__user__isnull=True)
        .values_list('journal_entry_id', 'sheet__credit_officer__user_id')
    )
    if not pairs:
        return {}
    User = get_user_model()
    users = {u.pk: u for u in User.objects.select_related('branch').filter(pk__in={u for _, u in pairs})}
    return {txn_id: users[user_id] for txn_id, user_id in pairs if user_id in users}


def payment_officers(txns):
    """{transaction pk: User or None} — collecting officer if any, else who posted it."""
    txns = [t for t in txns if t is not None]
    collected = collecting_officers([t.pk for t in txns])
    return {
        t.pk: collected.get(t.pk) or (t.created_by if t.created_by_id else None)
        for t in txns
    }


def payment_officer(txn):
    if txn is None:
        return None
    return payment_officers([txn]).get(txn.pk)
