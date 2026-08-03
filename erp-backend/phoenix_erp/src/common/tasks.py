"""
common/tasks.py

Celery tasks for cross-app operational/maintenance jobs.

Tasks:
    backup_database — Daily task: pg_dump + gzip the database and email it
                       off-box. See common/management/commands/backup_database.py
                       for the actual implementation (also runnable manually).
"""
import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task
def backup_database():
    try:
        call_command('backup_database')
    except Exception:
        logger.exception("Scheduled database backup failed")
        raise
