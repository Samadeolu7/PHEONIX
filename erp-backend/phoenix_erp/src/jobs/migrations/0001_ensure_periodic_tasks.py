# Generated manually on 2026-07-12
#
# django_celery_beat's DatabaseScheduler only fires tasks that exist as
# enabled PeriodicTask rows in the DB — it re-syncs CELERY_BEAT_SCHEDULE
# into those rows every time the beat process starts, but nothing
# guarantees beat has ever started cleanly, or that a row hasn't been
# disabled by hand. This creates/enables the PeriodicTask + CrontabSchedule
# rows explicitly for every entry currently in CELERY_BEAT_SCHEDULE
# (phoenix/settings.py), named identically to the settings dict keys so
# beat's own sync treats them as the same rows rather than duplicates.
#
# One incident already happened from this exact gap: Smart Savings
# interest silently stopped crediting automatically and had to be paid
# out via a manual journal voucher.

from django.db import migrations

# (name, task, minute, hour, day_of_month, month_of_year, day_of_week)
# '*' means "every"; matches phoenix/settings.py CELERY_BEAT_SCHEDULE exactly.
SCHEDULE = [
    ('check-approval-timeouts', 'automations.tasks.check_approval_timeouts',
     '0', '*', '*', '*', '*'),
    ('process-expired-permission-overrides', 'permissions.tasks.process_expired_permission_overrides',
     '0', '*', '*', '*', '*'),
    ('send-permission-expiry-warnings', 'permissions.tasks.send_expiry_warning_notifications',
     '0', '*', '*', '*', '*'),
    ('post-monthly-savings-interest', 'savings.tasks.post_monthly_savings_interest',
     '0', '1', '1', '*', '*'),
    ('apply-smart-savings-interest', 'savings.tasks.apply_smart_savings_interest',
     '0', '3', '*', '*', '*'),
    ('post-monthly-asset-depreciation', 'assets.tasks.post_monthly_depreciation',
     '0', '2', '1', '*', '*'),
    ('update-loan-status-daily', 'loans.tasks.update_loan_status_task',
     '0', '1', '*', '*', '*'),
    ('check-subscription-reminders', 'accounts.tasks.check_subscription_reminders',
     '0', '8', '*', '*', '*'),
    ('check-overdue-subscriptions', 'accounts.tasks.check_overdue_subscriptions',
     '0', '1', '*', '*', '*'),
    ('generate-monthly-invoices', 'accounts.tasks.generate_monthly_invoices',
     '0', '0', '*', '*', '*'),
    ('track-subscription-usage', 'accounts.tasks.track_subscription_usage',
     '0', '*/6', '*', '*', '*'),
    ('auto-generate-monthly-payroll', 'hr.tasks.auto_generate_monthly_payroll',
     '0', '0', '27', '*', '*'),
    ('notify-unreconciled-collection-sheets', 'cash_management.tasks.notify_unreconciled_sheets',
     '0', '9', '*', '*', '*'),
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

    initial = True

    dependencies = [
        ('django_celery_beat', '0019_alter_periodictasks_options'),
    ]

    operations = [
        migrations.RunPython(ensure_periodic_tasks, remove_periodic_tasks),
    ]
