from django.db import migrations


def disable_pension_and_levy(apps, schema_editor):
    # apps.get_model() returns the historical model with only the plain,
    # unfiltered default manager (custom managers aren't reconstructed here
    # unless they set use_in_migrations=True), so .objects already reaches
    # every row, including soft-deleted ones.
    HRConfig = apps.get_model('hr', 'HRConfig')
    HRConfig.objects.filter(enable_pension=True).update(enable_pension=False)
    HRConfig.objects.filter(enable_development_levy=True).update(enable_development_levy=False)


def reenable_pension_and_levy(apps, schema_editor):
    HRConfig = apps.get_model('hr', 'HRConfig')
    HRConfig.objects.all().update(enable_pension=True, enable_development_levy=True)


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0025_alter_hrconfig_enable_development_levy_and_more'),
    ]

    operations = [
        migrations.RunPython(disable_pension_and_levy, reenable_pension_and_levy),
    ]
