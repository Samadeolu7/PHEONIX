# Generated manually
#
# Root cause of the "penalty charged despite configured grace period" bug:
# loans.tasks.apply_daily_loan_penalties (and its companion
# update_all_loan_arrears) is old code that is NOT in CELERY_BEAT_SCHEDULE
# and NOT seeded by 0001_ensure_periodic_tasks.py — see loans/tasks.py's
# module docstring, which explicitly says it's "intentionally NOT
# scheduled" because it charges a flat daily penalty the moment a loan has
# any arrears, with zero awareness of LoanProduct.grace_period_days (unlike
# the real scheduled job, update_loan_status_task, which correctly
# suppresses the penalty until days late exceeds the configured grace
# period).
#
# django_celery_beat's DatabaseScheduler fires whatever PeriodicTask rows
# exist and are enabled in the DB, independent of CELERY_BEAT_SCHEDULE —
# 0001_ensure_periodic_tasks.py's own docstring documents an earlier
# incident caused by exactly this kind of drift (Smart Savings interest).
# If a PeriodicTask row for either legacy task was ever created by hand
# (admin UI, a one-off shell command, a stale row from before this task was
# removed from the schedule), it would silently reintroduce this bug in
# production regardless of what CELERY_BEAT_SCHEDULE says. This migration
# disables any such row so the legacy flat-rate/no-grace-period path can
# never run unattended again.
from django.db import migrations

LEGACY_TASKS = [
    'loans.tasks.apply_daily_loan_penalties',
    'loans.tasks.update_all_loan_arrears',
]


def disable_legacy_penalty_tasks(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(task__in=LEGACY_TASKS, enabled=True).update(enabled=False)


def noop_reverse(apps, schema_editor):
    # Not reversible — we don't know which rows (if any) were enabled
    # before this migration ran, and re-enabling a penalty task that
    # ignores grace_period_days on reverse would be actively harmful.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0002_add_reconciliation_aging_escalation_cron'),
    ]

    operations = [
        migrations.RunPython(disable_legacy_penalty_tasks, noop_reverse),
    ]
