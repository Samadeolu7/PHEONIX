from django.db import migrations


def backfill(apps, schema_editor):
    """
    unmatched_bank_count/unmatched_erp_count/total_bank_transactions are now
    computed from unresolved exceptions and the live transaction pool (see
    banks/tasks.py's recompute at the end of run_reconciliation_match), not
    the stale creation-time snapshot / raw matched=False row count. Existing
    rows only get the corrected values the next time their own task runs —
    recompute them here too so a reconciliation that's already 'completed'
    doesn't keep showing a stale, possibly-wrong summary until someone
    manually re-runs it.
    """
    DailyReconciliation = apps.get_model('banks', 'DailyReconciliation')
    ReconciliationBankTransaction = apps.get_model('banks', 'ReconciliationBankTransaction')

    for recon in DailyReconciliation.objects.all():
        matched_count = ReconciliationBankTransaction.objects.filter(
            bank_account_id=recon.bank_account_id, value_date=recon.reconciliation_date, matched=True,
        ).count()
        total = ReconciliationBankTransaction.objects.filter(
            bank_account_id=recon.bank_account_id, value_date=recon.reconciliation_date,
        ).count()
        unmatched_bank = recon.exceptions.filter(exception_type='bank_only', resolved=False).count()
        unmatched_erp = recon.exceptions.filter(exception_type='erp_only', resolved=False).count()

        recon.matched_count = matched_count
        recon.unmatched_bank_count = unmatched_bank
        recon.unmatched_erp_count = unmatched_erp
        recon.total_bank_transactions = total
        recon.save(update_fields=[
            'matched_count', 'unmatched_bank_count', 'unmatched_erp_count', 'total_bank_transactions',
        ])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0020_backfill_reconciliation_tenant'),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
