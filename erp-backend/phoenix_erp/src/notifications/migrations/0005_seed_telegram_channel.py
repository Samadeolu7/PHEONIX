from django.db import migrations


def seed_telegram_channel(apps, schema_editor):
    NotificationChannel = apps.get_model('notifications', 'NotificationChannel')
    NotificationChannel.objects.get_or_create(
        code='telegram',
        defaults={
            'name': 'Telegram',
            'provider': 'telegram',
            'provider_config': {},
            'cost_per_unit': 0,
            'rate_limit_per_minute': 20,
            'rate_limit_per_hour': 500,
        },
    )


def noop_reverse(apps, schema_editor):
    # Intentionally not deleted on reverse — other code may depend on it
    # existing and it's harmless to leave behind.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0004_seed_in_app_channel'),
    ]

    operations = [
        migrations.RunPython(seed_telegram_channel, noop_reverse),
    ]
