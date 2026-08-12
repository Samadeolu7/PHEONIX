import logging
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Pushes notification events to one connected user.

    One group per user (`notifications_user_{id}`) — sufficient since
    Notification.recipient_user already scopes everything per-user (see
    NotificationViewSet.get_queryset); no tenant-wide group is needed.
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        self.group_name = f'notifications_user_{user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Dispatched by Channels from the `type` field of the group_send payload
    # (dots become underscores) — see notifications/realtime.py.
    async def notification_new(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        await self.send_json({'type': 'notification.new', **payload})


class ThreadConsumer(AsyncJsonWebsocketConsumer):
    """Per-thread live updates.

    The client joins this only while that specific thread panel/tab is
    open (see the frontend's useThreadSocket), so a new message isn't
    broadcast to every connected user — only to whoever actually has that
    thread open right now.
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        self.thread_id = self.scope['url_route']['kwargs']['thread_id']
        allowed = await self._user_can_access_thread(user, self.thread_id)
        if not allowed:
            await self.close(code=4003)
            return
        self.group_name = f'thread_{self.thread_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @staticmethod
    @database_sync_to_async
    def _user_can_access_thread(user, thread_id):
        from threads.models import Thread
        from threads.permissions import is_director, is_branch_manager

        try:
            thread = Thread.objects.get(
                pk=thread_id, is_deleted=False, tenant=getattr(user, 'tenant', None),
            )
        except Thread.DoesNotExist:
            return False
        # Mirrors ThreadViewSet.get_queryset's oversight carve-out — a
        # Director/Branch Manager can open a thread they were only notified
        # about, not tagged into.
        if is_director(user):
            return True
        if is_branch_manager(user) and thread.branch_id == getattr(user, 'branch_id', None):
            return True
        return thread.participants.filter(user=user, is_deleted=False).exists()

    async def thread_message_new(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        await self.send_json({'type': 'thread.message.new', **payload})

    async def thread_message_updated(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        await self.send_json({'type': 'thread.message.updated', **payload})

    async def thread_message_deleted(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        await self.send_json({'type': 'thread.message.deleted', **payload})

    async def thread_read_receipt(self, event):
        payload = {k: v for k, v in event.items() if k != 'type'}
        await self.send_json({'type': 'thread.read_receipt', **payload})
