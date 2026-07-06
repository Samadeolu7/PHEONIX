# celery.py - Configure Celery

from celery import Celery
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

app = Celery('phoenix')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Beat schedule lives in phoenix/settings.py as CELERY_BEAT_SCHEDULE — picked
# up automatically by config_from_object(namespace='CELERY') above. Do NOT
# also assign app.conf.beat_schedule here: a plain assignment replaces the
# whole schedule rather than merging, which previously caused the
# settings.py schedule (including update_loan_status_task and
# post_monthly_savings_interest) to be silently discarded.


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
