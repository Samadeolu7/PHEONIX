import re

from django.db import migrations

_BANK_REFERENCE_RE = re.compile(r'\|\s*Ref:\s*(.+)$')


def backfill(apps, schema_editor):
    """
    matched_erp_officer/matched_erp_had_reference/posting_lag_days (see
    0023) are only populated going forward by banks/tasks.py's
    _persist_outcome at match time. Existing matched rows predate that
    logic — backfill them here from the ERP Transaction each already
    points to via matched_erp_payment_id, so the Officer Reconciliation
    Risk report reflects full history rather than only matches made after
    this deploy.
    """
    ReconciliationBankTransaction = apps.get_model('banks', 'ReconciliationBankTransaction')
    Transaction = apps.get_model('transactions', 'Transaction')

    matched_rows = list(
        ReconciliationBankTransaction.objects
        .filter(matched=True, matched_erp_payment_id__isnull=False, posting_lag_days__isnull=True)
    )
    if not matched_rows:
        return

    erp_payment_ids = {row.matched_erp_payment_id for row in matched_rows}
    txns_by_id = {
        txn.id: txn for txn in
        Transaction.objects.filter(pk__in=erp_payment_ids).select_related('created_by')
    }

    updated = []
    for row in matched_rows:
        txn = txns_by_id.get(row.matched_erp_payment_id)
        if txn is None or txn.date is None:
            continue
        row.posting_lag_days = (row.value_date - txn.date).days
        row.matched_erp_had_reference = bool(_BANK_REFERENCE_RE.search(txn.description or ''))
        row.matched_erp_officer_id = txn.created_by_id
        updated.append(row)

    if updated:
        ReconciliationBankTransaction.objects.bulk_update(
            updated, ['posting_lag_days', 'matched_erp_had_reference', 'matched_erp_officer_id'],
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0023_add_match_time_officer_reference_lag_tracking'),
        ('transactions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
