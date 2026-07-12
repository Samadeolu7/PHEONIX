# cash_management/tasks.py
"""
Celery tasks for the Cash Management / Daily Collection Workflow.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    name='cash_management.tasks.notify_unreconciled_sheets',
    bind=True,
    max_retries=3,
    default_retry_delay=300,
)
def notify_unreconciled_sheets(self):
    """
    10 AM daily grace-period task.

    Finds every DailyCollectionSheet for *yesterday* whose status is not
    'reconciled' and whose credit officer's CashierAccount still carries a
    non-zero balance.  Notifies the officer's direct-reports supervisor.

    Marks each sheet ``overdue_notified = True`` so the notification is sent
    only once per sheet.

    Beat schedule entry (phoenix/celery.py):
        'notify-unreconciled-collection-sheets': {
            'task': 'cash_management.tasks.notify_unreconciled_sheets',
            'schedule': crontab(hour=10, minute=0),
        },
    """
    from .models import DailyCollectionSheet, CashierAccount

    yesterday = timezone.now().date() - timedelta(days=1)

    sheets = (
        DailyCollectionSheet.objects
        .filter(
            collection_date=yesterday,
            status__in=['draft', 'active', 'submitted'],
            overdue_notified=False,
            is_deleted=False,
        )
        .select_related(
            'credit_officer__user',
            'credit_officer__reports_to__user',
        )
    )

    notified = 0
    for sheet in sheets:
        officer = sheet.credit_officer

        # Only escalate if the officer's till is still non-zero
        cashier_acct = CashierAccount.objects.filter(
            cashier=officer.user,
            branch=sheet.branch,
            is_active=True,
        ).first()

        if cashier_acct and cashier_acct.current_balance != 0:
            supervisor = officer.reports_to
            _send_unreconciled_notification(sheet, officer, supervisor, cashier_acct)
            notified += 1

        # Mark notified regardless, to avoid repeat noise
        sheet.overdue_notified = True
        sheet.save(update_fields=['overdue_notified'])

    logger.info(
        'notify_unreconciled_sheets: checked %d sheet(s), escalated %d.',
        sheets.count(), notified,
    )
    return {'sheets_checked': sheets.count(), 'escalated': notified}


def _send_unreconciled_notification(sheet, officer, supervisor, cashier_acct):
    """
    Deliver an in-app notification about an unreconciled sheet to the
    officer's supervisor.

    Uses the same direct Notification.objects.create() pattern already
    proven in threads/signals.py (_fire_participant_notification) rather
    than NotificationService.send_from_template, which requires a
    per-branch seeded NotificationTemplate that isn't guaranteed to exist.
    """
    balance = cashier_acct.current_balance
    msg = (
        f"[OVERDUE SHEET] Officer {officer} has an unreconciled collection sheet "
        f"for {sheet.collection_date}. "
        f"Till balance: ₦{balance:,.2f}. "
        f"Status: {sheet.get_status_display()}."
    )

    if supervisor and supervisor.user:
        logger.warning(
            'Escalating to supervisor %s: %s',
            supervisor.user.get_full_name() or supervisor.user.username,
            msg,
        )
        from notifications.models import Notification, NotificationChannel

        channel = NotificationChannel.objects.filter(code='in_app', is_active=True).first()
        if channel:
            Notification.objects.create(
                channel=channel,
                recipient_user=supervisor.user,
                recipient_name=supervisor.user.get_full_name() or supervisor.user.username,
                subject='Unreconciled Collection Sheet',
                message=msg,
                priority='high',
                status='pending',
                owner=getattr(sheet, 'owner', None),
                branch=sheet.branch,
                tenant=getattr(sheet, 'tenant', None),
                content_type=ContentType.objects.get_for_model(sheet),
                object_id=str(sheet.pk),
            )
        else:
            logger.warning('No in_app NotificationChannel configured — could not notify supervisor.')
    else:
        logger.warning('Unreconciled sheet — no supervisor found for %s: %s', officer, msg)
