# Generated manually
#
# Registers the daily prepaid auto-amortization job (e.g. rent prepayment ->
# rent expense) as an explicit PeriodicTask row (see 0001_ensure_periodic_tasks.py
# for why CELERY_BEAT_SCHEDULE alone isn't relied on here).
# 02:30 UTC = 03:30 WAT.

from django.db import migrations

SCHEDULE = [
    ('post-due-prepaid-amortizations', 'expenses.tasks.post_due_prepaid_amortizations',
     '30', '2', '*', '*', '*'),
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
        ('jobs', '0003_add_liquidity_watch_cron'),
    ]

    operations = [
        migrations.RunPython(ensure_periodic_tasks, remove_periodic_tasks),
    ]
