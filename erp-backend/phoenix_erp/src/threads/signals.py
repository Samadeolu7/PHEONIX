import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction

logger = logging.getLogger(__name__)


@receiver(post_save, sender='threads.Thread')
def notify_oversight_of_new_thread(sender, instance, created, **kwargs):
    """Directors and the initiating branch's Branch Manager learn about every
    new thread as it starts, even when nobody tagged them in — see
    threads/views.py's user_can_initiate_thread (anyone can start a thread
    now) and the matching oversight carve-out in ThreadViewSet.get_queryset
    that lets them actually open what this notifies them about."""
    if not created or instance.is_deleted:
        return
    try:
        def _send():
            _fire_oversight_notifications(instance)
        transaction.on_commit(_send)
    except Exception:
        logger.exception('Failed to queue oversight notifications for thread %s', instance.pk)


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
        from notifications.models import Notification
        from notifications.services import get_in_app_channel
        added_by = participant.added_by
        adder_name = (added_by.get_full_name() or added_by.username) if added_by else 'Someone'
        channel = get_in_app_channel()
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
        from notifications.models import Notification
        from notifications.services import get_in_app_channel
        thread = message.thread
        channel = get_in_app_channel()
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


def _fire_oversight_notifications(thread):
    """Notify every director and the thread's own branch manager that a new
    discussion started — regardless of whether they were tagged as a
    participant. Skips anyone already notified via
    _fire_participant_notification (tagged participants) to avoid a
    duplicate ping for the same thread."""
    try:
        from django.contrib.contenttypes.models import ContentType
        from notifications.models import Notification
        from notifications.services import get_in_app_channel
        from threads.permissions import directors_for_tenant as _directors_for_tenant
        from threads.permissions import branch_managers_for_branch as _branch_managers_for_branch

        channel = get_in_app_channel()
        if not channel:
            return

        initiator = thread.initiated_by
        initiator_name = (initiator.get_full_name() or initiator.username) if initiator else 'Someone'

        oversight_users = (
            _directors_for_tenant(thread.tenant) | _branch_managers_for_branch(thread.tenant, thread.branch)
        ).exclude(pk=initiator.pk if initiator else 0).distinct()

        already_notified_ids = set(
            thread.participants.filter(is_deleted=False).values_list('user_id', flat=True)
        )

        thread_content_type = ContentType.objects.get_for_model(thread.__class__)
        notifications = []
        for u in oversight_users:
            if u.pk in already_notified_ids:
                continue
            notifications.append(Notification(
                channel=channel,
                recipient_user=u,
                recipient_name=u.get_full_name() or u.username,
                recipient_contact='',
                subject='New discussion started',
                message=f'{initiator_name} started a discussion: "{thread.title}"',
                priority='normal',
                status='pending',
                owner=thread.owner,
                branch=thread.branch,
                created_by=initiator,
                tenant=thread.tenant,
                content_type=thread_content_type,
                object_id=str(thread.pk),
            ))

        if notifications:
            Notification.objects.bulk_create(notifications, ignore_conflicts=True)
    except Exception:
        logger.exception('Failed to create oversight notifications for thread %s', thread.pk)
