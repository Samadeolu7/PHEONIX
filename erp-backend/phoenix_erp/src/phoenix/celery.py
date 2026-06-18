# celery.py - Configure Celery

from celery import Celery
from celery.schedules import crontab
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

app = Celery('phoenix')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


# Celery Beat schedule for periodic tasks
app.conf.beat_schedule = {
    # Automations tasks removed — Celery execution engine frozen.
    # WorkflowEngine is kept for data/config storage only;
    # execution is handled synchronously in owning-app ViewSets.

    # SaaS billing subscription tasks
    'check-subscription-reminders': {
        'task': 'accounts.tasks.check_subscription_reminders',
        'schedule': crontab(hour=8, minute=0),  # Daily at 8 AM
    },
    'check-overdue-subscriptions': {
        'task': 'accounts.tasks.check_overdue_subscriptions',
        'schedule': crontab(hour=1, minute=0),  # Daily at 1 AM
    },
    'generate-monthly-invoices': {
        'task': 'accounts.tasks.generate_monthly_invoices',
        'schedule': crontab(hour=0, minute=0),  # Daily at midnight
    },
    'track-subscription-usage': {
        'task': 'accounts.tasks.track_subscription_usage',
        'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
    },
    
    # HR payroll automation
    'auto-generate-monthly-payroll': {
        'task': 'hr.tasks.auto_generate_monthly_payroll',
        'schedule': crontab(hour=0, minute=0, day_of_month=27),  # 27th of every month at midnight
        'args': ()
    },

    # Loan arrears refresh — mark overdue installments, recalculate days_in_arrears
    # Runs at 00:05 UTC (01:05 WAT) so it finishes before the penalty task below.
    'update-all-loan-arrears': {
        'task': 'loans.tasks.update_all_loan_arrears',
        'schedule': crontab(hour=0, minute=5),
    },

    # Loan penalty — apply daily penalty charge AFTER arrears are refreshed
    'apply-daily-loan-penalties': {
        'task': 'loans.tasks.apply_daily_loan_penalties',
        'schedule': crontab(hour=0, minute=10),  # 00:10 UTC = 01:10 WAT (Africa/Lagos UTC+1)
    },

    # Daily collection workflow — 10 AM WAT grace-period notification
    # Fires after officers should have submitted and balanced their sheets.
    # Notifies supervisors of any unreconciled sheets where the officer's till
    # is still non-zero.
    'notify-unreconciled-collection-sheets': {
        'task': 'cash_management.tasks.notify_unreconciled_sheets',
        'schedule': crontab(hour=9, minute=0),  # 09:00 UTC = 10:00 WAT (Africa/Lagos UTC+1)
    },
}


# To start Celery worker (in production):
# celery -A your_project worker -l info

# To start Celery beat (for scheduled tasks):
# celery -A your_project beat -l info


# docker-compose.yml - Add Redis and Celery services (if using Docker)

"""
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  celery_worker:
    build: .
    command: celery -A your_project worker -l info
    volumes:
      - .:/app
    depends_on:
      - redis
      - db
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0

  celery_beat:
    build: .
    command: celery -A your_project beat -l info
    volumes:
      - .:/app
    depends_on:
      - redis
      - db
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0

volumes:
  redis_data:
"""
