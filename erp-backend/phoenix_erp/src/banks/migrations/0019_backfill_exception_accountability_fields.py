from django.db import migrations


def backfill(apps, schema_editor):
    """
    Populate is_high_priority/officer/erp_branch on exceptions that existed
    before these fields did — fully derivable from data already on hand
    (Transaction.created_by via loan_payment_id). Deliberately does not
    touch resolved/resolved_by/resolved_at/resolution_notes on any row.
    """
    ReconciliationException = apps.get_model('banks', 'ReconciliationException')
    Transaction = apps.get_model('transactions', 'Transaction')

    ReconciliationException.objects.filter(exception_type='bank_only').update(is_high_priority=True)

    erp_side = ReconciliationException.objects.filter(
        loan_payment_id__isnull=False, officer__isnull=True,
    ).values_list('id', 'loan_payment_id')
    txn_ids = {loan_payment_id for _, loan_payment_id in erp_side}
    txns_by_id = {
        t.id: t for t in Transaction.objects.filter(id__in=txn_ids).select_related('created_by', 'created_by__branch')
    }

    for exc_id, loan_payment_id in erp_side:
        txn = txns_by_id.get(loan_payment_id)
        if txn is None or txn.created_by_id is None:
            continue
        ReconciliationException.objects.filter(id=exc_id).update(
            officer_id=txn.created_by_id,
            erp_branch_id=getattr(txn.created_by, 'branch_id', None),
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0018_dailyreconciliation_rerun_count_and_more'),
        ('transactions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
