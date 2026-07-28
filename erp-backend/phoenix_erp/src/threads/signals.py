import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction

logger = logging.getLogger(__name__)


@receiver(post_save, sender='threads.ThreadParticipant')
def notify_participant_added(sender, instance, created, **kwargs):
    """Send in-app notification when a user is tagged into a thread."""
    if not created or instance.is_deleted:
        return
    thread = instance.thread
    # Skip self-add (initiator adding themselves on thread creation)
    if instance.user == thread.initiated_by and instance.added_by == thread.initiated_by:
        return
    try:
        def _send():
            _fire_participant_notification(instance, thread)
        transaction.on_commit(_send)
    except Exception:
        logger.exception('Failed to queue participant notification for thread %s', thread.pk)


@receiver(post_save, sender='threads.ThreadMessage')
def notify_new_message(sender, instance, created, **kwargs):
    """Send in-app notifications to all participants when a new message is posted."""
    if not created or instance.is_system_message or instance.is_deleted:
        return
    try:
        def _send():
            _fire_message_notifications(instance)
        transaction.on_commit(_send)
    except Exception:
        logger.exception('Failed to queue message notifications for thread message %s', instance.pk)


def _fire_participant_notification(participant, thread):
    """Create an in-app Notification for a newly tagged participant."""
    try:
        from django.contrib.contenttypes.models import ContentType
        from notifications.models import Notification, NotificationChannel
        added_by = participant.added_by
        adder_name = (added_by.get_full_name() or added_by.username) if added_by else 'Someone'
        channel = NotificationChannel.objects.filter(code='in_app', is_active=True).first()
        if not channel:
            return
        Notification.objects.create(
            channel=channel,
            recipient_user=participant.user,
            recipient_name=participant.user.get_full_name() or participant.user.username,
            recipient_contact='',
            subject='You were added to a discussion',
            message=f'{adder_name} added you to a discussion: "{thread.title}"',
            priority='normal',
            status='pending',
            owner=thread.owner,
            branch=thread.branch,
            created_by=added_by,
            tenant=thread.tenant,
            # Links this Notification back to the Thread so reading the
            # thread can also clear the notification (see ThreadViewSet.read)
            # and so the bell UI can deep-link to it.
            content_type=ContentType.objects.get_for_model(thread.__class__),
            object_id=str(thread.pk),
        )
    except Exception:
        logger.exception('Failed to create participant notification for thread %s', thread.pk)


def _fire_message_notifications(message):
    """Create in-app Notifications for all participants except the message author."""
    try:
        from django.contrib.contenttypes.models import ContentType
        from notifications.models import Notification, NotificationChannel
        thread = message.thread
        channel = NotificationChannel.objects.filter(code='in_app', is_active=True).first()
        if not channel:
            return

        author = message.author
        author_name = (author.get_full_name() or author.username) if author else 'Someone'
        participants = thread.participants.filter(
            is_deleted=False
        ).exclude(user=author).select_related('user')
        thread_content_type = ContentType.objects.get_for_model(thread.__class__)

        notifications = []
        for p in participants:
            # Only notify if they haven't read recent messages (simple unread check)
            if p.last_read_at and p.last_read_at >= message.created_at:
                continue
            notifications.append(Notification(
                channel=channel,
                recipient_user=p.user,
                recipient_name=p.user.get_full_name() or p.user.username,
                recipient_contact='',
                subject=f'New message in: {thread.title}',
                message=f'{author_name}: {message.body[:120]}',
                priority='normal',
                status='pending',
                owner=thread.owner,
                branch=thread.branch,
                created_by=author,
                tenant=thread.tenant,
                # See note in _fire_participant_notification above.
                content_type=thread_content_type,
                object_id=str(thread.pk),
            ))

        if notifications:
            Notification.objects.bulk_create(notifications, ignore_conflicts=True)
    except Exception:
        logger.exception('Failed to create message notifications for message %s', message.pk)
