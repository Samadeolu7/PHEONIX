from django.db import migrations


def backfill_tenant(apps, schema_editor):
    """
    Module/ModulePage previously forced tenant=None on every save (see the
    now-removed override in Module.save()/ModulePage.save()), intending
    them to be a shared catalog. That override was silently undone by
    TimeStampedModel.save()'s own tenant-stamping fallback whenever a real
    request context existed (which re-fills tenant from the thread-local
    the moment it's None), so rows created via a web request ended up
    tenant-stamped anyway while rows created via a management command
    (no request, no thread-local tenant) stayed genuinely NULL — and
    Module.objects/ModulePage.objects (OwnerBranchManager) filters by
    tenant, so those NULL rows were invisible to the admin-all catalog
    endpoint. This backfill only proceeds for a genuinely single-tenant
    deployment — with more than one tenant there's no way to know which
    one each row should belong to, and this must not guess.
    """
    Tenant = apps.get_model('users', 'Tenant')
    Module = apps.get_model('pages', 'Module')
    ModulePage = apps.get_model('pages', 'ModulePage')

    if Tenant.objects.count() != 1:
        return

    tenant = Tenant.objects.get()
    Module.objects.update(tenant=tenant)
    ModulePage.objects.update(tenant=tenant)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0004_initial'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_tenant, noop_reverse),
    ]
