from django.db import migrations


def backfill(apps, schema_editor):
    """
    DailyReconciliation.tenant only auto-fills from a thread-local set by
    middleware (TimeStampedModel.save()), which isn't reliably populated in
    time for a DRF-authenticated request (see common/managers.py's
    for_user() docstring). StatementUploadView.post() didn't pass tenant=
    explicitly, so rows created before that fix have tenant=NULL — which
    makes them permanently invisible to every tenant-scoped query (the list/
    detail views, both of which filter by tenant), even though they exist
    and were reconciled successfully. Backfill from owner.tenant, which
    every row created through the normal upload flow already has set
    correctly.
    """
    DailyReconciliation = apps.get_model('banks', 'DailyReconciliation')

    orphaned = DailyReconciliation.objects.filter(tenant__isnull=True, owner__isnull=False)
    fixed = 0
    for recon in orphaned.select_related('owner'):
        if recon.owner.tenant_id is not None:
            recon.tenant_id = recon.owner.tenant_id
            recon.save(update_fields=['tenant'])
            fixed += 1


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('banks', '0019_backfill_exception_accountability_fields'),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
