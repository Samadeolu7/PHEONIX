"""Thin WebSocket broadcast helpers.

Deliberately push only identifying payloads (ids), not fully-serialized
objects — building an absolute-URI-bearing serialized ThreadMessage (for
attachment_url etc.) needs a DRF request context that isn't available from a
signal handler or a background task, and duplicating that serialization logic
here would drift from the real one. The frontend treats a push as "something
changed, go refetch" and calls the existing REST endpoints, the same way a
poll tick already does today — this just replaces the timer with a push.

Every call here is a broadcast to a channel layer group; if nobody is
connected to that group, channel_layer.group_send is a safe no-op. Never
let a broadcast failure break the request/signal that triggered it.
"""
import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def push_notification_event(recipient_user_id, **data):
    """Tell a user's open connection(s) a new/updated Notification exists.
    Call after the row is committed (inside transaction.on_commit) so a
    client that reacts by refetching actually sees it."""
    if not recipient_user_id:
        return
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f'notifications_user_{recipient_user_id}',
            {'type': 'notification.new', **data},
        )
    except Exception:
        logger.exception('Failed to push realtime notification event to user %s', recipient_user_id)


def push_thread_event(thread_id, event_type, **data):
    """Tell anyone with this thread's panel open that something changed.
    event_type is one of 'thread.message.new', 'thread.message.updated',
    'thread.message.deleted', 'thread.read_receipt' — dispatched by Channels
    to the matching underscored handler method on ThreadConsumer."""
    if not thread_id:
        return
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f'thread_{thread_id}',
            {'type': event_type, **data},
        )
    except Exception:
        logger.exception('Failed to push realtime thread event %s for thread %s', event_type, thread_id)
