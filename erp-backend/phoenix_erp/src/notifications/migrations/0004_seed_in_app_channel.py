from django.db import migrations


def seed_in_app_channel(apps, schema_editor):
    NotificationChannel = apps.get_model('notifications', 'NotificationChannel')
    NotificationChannel.objects.get_or_create(
        code='in_app',
        defaults={
            'name': 'In-App Notification',
            'provider': 'internal',
            'cost_per_unit': 0,
            'rate_limit_per_minute': 1000,
            'rate_limit_per_hour': 50000,
        },
    )


def noop_reverse(apps, schema_editor):
    # Intentionally not deleted on reverse — other code may depend on it
    # existing and it's harmless to leave behind.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0003_update_bank_recon_exception_template'),
    ]

    operations = [
        migrations.RunPython(seed_in_app_channel, noop_reverse),
    ]
