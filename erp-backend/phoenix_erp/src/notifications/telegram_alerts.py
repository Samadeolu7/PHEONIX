# notifications/telegram_alerts.py
"""Fire-and-forget Telegram alerts to the directors/branch-manager group
chat for director-level approvals and disbursement events.

Bypasses NotificationService.send_from_template (built around a single
named User/Client recipient) since a fixed group broadcast has no such
recipient — a Notification row is created directly against the 'telegram'
NotificationChannel and queued the same way _queue_notification does.
"""
from django.db import transaction
from django.contrib.contenttypes.models import ContentType
import logging

logger = logging.getLogger(__name__)


def notify_directors(event_code: str, subject: str, message: str, *, owner, branch, related_object=None):
    """Queue a Telegram alert to the directors/BM group chat.

    Never raises — a notification problem must not block the
    approval/disbursement action it's reporting on. Callers should still
    wrap the call in their own try/except as defence-in-depth on a
    financial code path, but this function guards itself regardless.
    """
    try:
        from .models import Notification, NotificationChannel

        channel = NotificationChannel.objects.filter(code='telegram', is_active=True).first()
        if not channel:
            logger.warning(
                "No active 'telegram' NotificationChannel found — skipping alert '%s' "
                "(see migration 0005_seed_telegram_channel).",
                event_code,
            )
            return None

        from django.conf import settings
        chat_id = channel.provider_config.get('chat_id') or settings.TELEGRAM_CHAT_ID
        if not chat_id:
            logger.warning(
                "No Telegram chat_id configured (TELEGRAM_CHAT_ID or channel.provider_config) "
                "— skipping alert '%s'.",
                event_code,
            )
            return None

        content_type = None
        object_id = ''
        if related_object is not None:
            content_type = ContentType.objects.get_for_model(related_object)
            object_id = str(related_object.pk)

        notification = Notification.objects.create(
            channel=channel,
            recipient_contact=str(chat_id),
            recipient_name='Directors & Branch Managers',
            subject=subject,
            message=message,
            context_data={'event_code': event_code},
            priority='high',
            status='pending',
            content_type=content_type,
            object_id=object_id,
            owner=owner,
            branch=branch,
            tenant=getattr(owner, 'tenant', None),
        )

        transaction.on_commit(lambda: _queue(notification.id))
        return notification

    except Exception:
        logger.exception("Failed to queue Telegram alert '%s'", event_code)
        return None


def _queue(notification_id: int):
    from .tasks import send_notification_task
    send_notification_task.apply_async(args=[notification_id], countdown=1)
