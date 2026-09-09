from django.db import migrations

from pages.migration_helpers import seed_catalog


def add_staff_guarantors_page(apps, schema_editor):
    Module = apps.get_model('pages', 'Module')
    ModulePage = apps.get_model('pages', 'ModulePage')
    PageAction = apps.get_model('pages', 'PageAction')

    seed_catalog(
        Module, ModulePage, PageAction,
        modules=[
            ('hr', 'HR', 'UserCheck', 8),
        ],
        pages=[
            ('hr', 'staff-guarantors', 'Staff Guarantors', 'list', 18),
        ],
        actions=[
            ('hr', 'staff-guarantors', 'staff-guarantors-list', 'List Staff Guarantors', 'view'),
            ('hr', 'staff-guarantors', 'staff-guarantors-create', 'Create Staff Guarantor', 'create'),
            ('hr', 'staff-guarantors', 'staff-guarantors-edit', 'Edit Staff Guarantor', 'edit'),
            ('hr', 'staff-guarantors', 'staff-guarantors-delete', 'Delete Staff Guarantor', 'delete'),
        ],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0005_backfill_module_page_tenant'),
        ('hr', '0029_staffguarantor_guarantordocument'),
    ]

    operations = [
        migrations.RunPython(add_staff_guarantors_page, migrations.RunPython.noop),
    ]
