# Generated manually
#
# Registers the treasury daily liquidity watch as an explicit PeriodicTask row (see
# 0001_ensure_periodic_tasks.py for why CELERY_BEAT_SCHEDULE alone isn't relied on here).
# 07:00 UTC = 08:00 WAT.

from django.db import migrations

SCHEDULE = [
    ('daily-liquidity-watch', 'treasury.tasks.daily_liquidity_watch', '0', '7', '*', '*', '*'),
]


def ensure_periodic_tasks(apps, schema_editor):
    CrontabSchedule = apps.get_model('django_celery_beat', 'CrontabSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')

    for name, task, minute, hour, day_of_month, month_of_year, day_of_week in SCHEDULE:
        schedule, _ = CrontabSchedule.objects.get_or_create(
            minute=minute, hour=hour,
            day_of_month=day_of_month, month_of_year=month_of_year, day_of_week=day_of_week,
            defaults={'timezone': 'UTC'},
        )
        PeriodicTask.objects.update_or_create(
            name=name,
            defaults={'task': task, 'crontab': schedule, 'enabled': True},
        )


def remove_periodic_tasks(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name__in=[name for name, *_ in SCHEDULE]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0002_add_reconciliation_aging_escalation_cron'),
    ]

    operations = [
        migrations.RunPython(ensure_periodic_tasks, remove_periodic_tasks),
    ]
