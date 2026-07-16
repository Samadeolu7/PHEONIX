# Generated manually
#
# Adds the escalate-aging-reconciliation-exceptions entry to
# CELERY_BEAT_SCHEDULE (phoenix/settings.py) as an explicit PeriodicTask row
# — see 0001_ensure_periodic_tasks.py's docstring for why relying on beat's
# own DatabaseScheduler sync alone isn't sufficient in this codebase (one
# incident already happened from that exact gap: Smart Savings interest
# silently stopped crediting). A new migration rather than editing 0001,
# since that one's already applied — additive entries live in their own
# migration going forward.

from django.db import migrations

SCHEDULE = [
    ('escalate-aging-reconciliation-exceptions', 'banks.tasks.escalate_aging_reconciliation_exceptions',
     '5', '9', '*', '*', '*'),
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
        ('jobs', '0001_ensure_periodic_tasks'),
    ]

    operations = [
        migrations.RunPython(ensure_periodic_tasks, remove_periodic_tasks),
    ]
