# hr/notifications.py
"""
In-app notifications for leave request lifecycle events.

hr doesn't use notifications.services.NotificationService.send_from_template
here because that requires a NotificationTemplate row pre-seeded per branch
for each template_code, and nothing seeds one for leave events. Instead this
mirrors threads/signals.py's approach of creating Notification rows directly
against the 'in_app' channel, which works without any seeding step.

Every public function here swallows its own exceptions and logs instead of
raising, so a notification failure never blocks the leave action that
triggered it (same non-blocking contract expenses/views.py uses around
NotificationService calls).
"""
import logging

logger = logging.getLogger(__name__)


def _staff_display_name(staff):
    if staff.user:
        full_name = staff.user.get_full_name()
        if full_name:
            return full_name
    return f"{staff.first_name} {staff.last_name}"


def _leave_approvers(branch, exclude_user=None, limit=5):
    """Users in *branch* who can approve leave requests, per PermissionResolver.

    Capped at *limit* to avoid notification spam on large branches, matching
    the pattern expenses/views.py uses for its own submission notifications.
    """
    from users.models import User
    from common.approval_permissions import can_user_approve

    if branch is None:
        return []

    candidates = User.objects.filter(branch=branch, is_active=True)
    if exclude_user is not None:
        candidates = candidates.exclude(pk=exclude_user.pk)

    approvers = []
    for user in candidates.order_by('id')[:50]:
        if can_user_approve(user, module='hr', page='leave-requests'):
            approvers.append(user)
            if len(approvers) >= limit:
                break
    return approvers


def _create_notification(recipient, subject, message, owner, branch, created_by,
                          related_object=None, priority='normal'):
    from notifications.models import Notification
    from notifications.services import get_in_app_channel

    channel = get_in_app_channel()
    if not channel:
        return None

    kwargs = dict(
        channel=channel,
        recipient_user=recipient,
        recipient_name=recipient.get_full_name() or recipient.username,
        recipient_contact='',
        subject=subject,
        message=message,
        priority=priority,
        status='pending',
        owner=owner,
        branch=branch,
        created_by=created_by,
        tenant=getattr(owner, 'tenant', None),
    )
    if related_object is not None:
        from django.contrib.contenttypes.models import ContentType
        kwargs['content_type'] = ContentType.objects.get_for_model(related_object.__class__)
        kwargs['object_id'] = str(related_object.pk)

    notification = Notification.objects.create(**kwargs)

    try:
        from notifications.realtime import push_notification_event
        push_notification_event(recipient.id, notification_id=notification.pk)
    except Exception:
        logger.debug('push_notification_event failed for notification %s', notification.pk, exc_info=True)

    return notification


def notify_leave_submitted(leave_request, actor):
    """Tell the branch's leave approvers a request needs their attention."""
    try:
        staff_name = _staff_display_name(leave_request.staff)
        for approver in _leave_approvers(leave_request.branch, exclude_user=actor):
            _create_notification(
                recipient=approver,
                subject='Leave request awaiting approval',
                message=(
                    f'{staff_name} requested {leave_request.num_days} day(s) of '
                    f'{leave_request.leave_type.name} leave '
                    f'({leave_request.start_date} to {leave_request.end_date}).'
                ),
                owner=leave_request.owner,
                branch=leave_request.branch,
                created_by=actor,
                related_object=leave_request,
            )
    except Exception:
        logger.exception('Failed to notify approvers for leave request %s', leave_request.pk)


def notify_leave_decision(leave_request, actor, decision, reason=''):
    """Tell the requester their leave was approved/rejected/cancelled.

    No-op when the request has no linked user account, or when the actor is
    the requester themselves (nothing to tell someone about their own action).
    """
    staff_user = leave_request.staff.user
    if not staff_user or staff_user.pk == actor.pk:
        return
    try:
        verb = {'approved': 'approved', 'rejected': 'rejected', 'cancelled': 'cancelled'}[decision]
        actor_name = actor.get_full_name() or actor.username
        message = (
            f'Your {leave_request.leave_type.name} leave request '
            f'({leave_request.start_date} to {leave_request.end_date}) was {verb} by {actor_name}.'
        )
        if reason:
            message += f' Reason: {reason}'
        _create_notification(
            recipient=staff_user,
            subject=f'Leave request {verb}',
            message=message,
            owner=leave_request.owner,
            branch=leave_request.branch,
            created_by=actor,
            related_object=leave_request,
            priority='high' if decision == 'rejected' else 'normal',
        )
    except Exception:
        logger.exception(
            'Failed to notify staff of leave %s decision for request %s', decision, leave_request.pk
        )
