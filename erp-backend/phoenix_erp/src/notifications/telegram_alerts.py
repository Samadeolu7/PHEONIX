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

        # Deliberately NOT resolving/requiring TELEGRAM_CHAT_ID here: this
        # function runs wherever the approval/disbursement call site runs
        # (the web/backend process), but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
        # are only set on the celery_worker container (see docker-compose.yml)
        # since that's the only process that actually calls the Telegram API
        # (TelegramProvider.send(), via send_notification_task). Resolution
        # happens there instead — recipient_contact is left to
        # channel.provider_config['chat_id'] if set, otherwise blank, and
        # TelegramProvider.send() falls back to settings.TELEGRAM_CHAT_ID at
        # send time. A genuinely missing config surfaces as a failed
        # Notification (visible via admin/audit trail) instead of silently
        # never being created.
        chat_id = channel.provider_config.get('chat_id', '')

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
