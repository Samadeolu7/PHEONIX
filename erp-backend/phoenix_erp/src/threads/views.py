import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied

from common.views import ScopedModelViewSet
from .models import Thread, ThreadParticipant, ThreadMessage, MessageReadReceipt
from .serializers import (
    ThreadSerializer, ThreadCreateSerializer,
    ThreadParticipantSerializer, ThreadMessageSerializer,
)

logger = logging.getLogger(__name__)


# ── Role helpers ──────────────────────────────────────────────────────────────

def _is_director(user):
    """True if the user has global scope (director / owner / system admin)."""
    if getattr(user, 'is_system_admin', False):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        return user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        return False


def _is_branch_manager(user):
    """True if the user is a branch manager (or any higher role)."""
    if _is_director(user):
        return True
    try:
        return user.roles.filter(is_active=True, name__icontains='manager').exists()
    except Exception:
        return False


# ── Thread ViewSet ────────────────────────────────────────────────────────────

class ThreadViewSet(ScopedModelViewSet):
    permission_module = 'threads'
    permission_page = 'threads'
    queryset = Thread.objects.all()
    serializer_class = ThreadSerializer
    skip_action_permission = True

    def get_serializer_class(self):
        if self.action == 'create':
            return ThreadCreateSerializer
        return ThreadSerializer

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        qs = Thread.objects.filter(tenant=tenant, is_deleted=False).select_related(
            'page', 'initiated_by', 'closed_by', 'content_type'
        ).prefetch_related('participants__user', 'messages')

        # Directors see all; everyone else sees only threads they're in
        if not _is_director(user):
            qs = qs.filter(participants__user=user, participants__is_deleted=False)

        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('page_id'):
            qs = qs.filter(page_id=params['page_id'])
        if params.get('object_id') and params.get('content_type'):
            qs = qs.filter(object_id=params['object_id'], content_type_id=params['content_type'])
        if params.get('branch') and _is_director(user):
            qs = qs.filter(branch_id=params['branch'])
        if params.get('search'):
            qs = qs.filter(messages__body__icontains=params['search'], messages__is_deleted=False).distinct()

        return qs.order_by('-updated_at').distinct()

    def perform_create(self, serializer):
        user = self.request.user
        branch = getattr(user, 'branch', None)
        tenant = getattr(user, 'tenant', None)
        page = serializer.validated_data.get('page')

        if not page.is_threadable:
            raise ValidationError({'page': 'This page does not support threads.'})
        if not page.user_can_initiate_thread(user):
            raise ValidationError({'page': 'You do not have permission to start a thread on this page.'})

        # Enforce max_open_threads per record if configured
        max_open = page.get_thread_config().get('max_open_threads', 0)
        if max_open:
            content_type = serializer.validated_data.get('content_type')
            object_id = serializer.validated_data.get('object_id')
            if content_type and object_id:
                open_count = Thread.objects.filter(
                    page=page, content_type=content_type, object_id=object_id,
                    status=Thread.STATUS_OPEN, is_deleted=False, tenant=tenant,
                ).count()
                if open_count >= max_open:
                    raise ValidationError(
                        {'detail': f'Maximum of {max_open} open thread(s) allowed on this record.'}
                    )

        participant_ids = serializer.validated_data.pop('participant_ids', [])

        thread = serializer.save(
            initiated_by=user,
            owner=user,
            branch=branch,
            tenant=tenant,
        )

        # Initiator is always a participant with can_add_participants=True
        ThreadParticipant.objects.create(
            thread=thread,
            user=user,
            added_by=user,
            can_add_participants=True,
            tenant=tenant,
        )

        # Auto-add users matching auto_include_roles from page config
        self._auto_add_role_participants(thread, page, user)

        # Add explicitly tagged participants
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        for uid in participant_ids:
            if uid == user.pk:
                continue
            try:
                tagged = UserModel.objects.get(pk=uid, tenant=tenant)
                ThreadParticipant.objects.get_or_create(
                    thread=thread,
                    user=tagged,
                    defaults={'added_by': user, 'tenant': tenant},
                )
            except UserModel.DoesNotExist:
                pass

    def _auto_add_role_participants(self, thread, page, initiator):
        try:
            auto_roles = page.get_thread_config().get('auto_include_roles', [])
            if not auto_roles:
                return
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()
            users = UserModel.objects.filter(
                tenant=initiator.tenant,
                roles__name__in=auto_roles,
                is_active=True,
            ).distinct()
            tenant = getattr(initiator, 'tenant', None)
            for u in users:
                if u.pk == initiator.pk:
                    continue
                ThreadParticipant.objects.get_or_create(
                    thread=thread,
                    user=u,
                    defaults={'added_by': initiator, 'tenant': tenant},
                )
        except Exception:
            logger.exception('Failed to auto-add role participants for thread %s', thread.pk)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        thread = self.get_object()
        user = request.user
        if thread.initiated_by != user and not _is_director(user):
            return Response(
                {'detail': 'Only the initiator or a Director can close this thread.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            thread.close(user)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        ThreadMessage.objects.create(
            thread=thread,
            body=f"Thread closed by {user.get_full_name() or user.username}.",
            is_system_message=True,
            tenant=getattr(user, 'tenant', None),
        )
        return Response(ThreadSerializer(thread, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        thread = self.get_object()
        user = request.user

        can_reopen = _is_director(user)
        if not can_reopen and _is_branch_manager(user):
            can_reopen = (thread.branch == getattr(user, 'branch', None))

        if not can_reopen:
            return Response(
                {'detail': 'Only Directors or Branch Managers (within their branch) can reopen threads.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            thread.reopen(user)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        ThreadMessage.objects.create(
            thread=thread,
            body=f"Thread reopened by {user.get_full_name() or user.username}.",
            is_system_message=True,
            tenant=getattr(user, 'tenant', None),
        )
        return Response(ThreadSerializer(thread, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        """Mark all messages in this thread as read for the current user."""
        thread = self.get_object()
        user = request.user

        ThreadParticipant.objects.filter(thread=thread, user=user, is_deleted=False).update(
            last_read_at=timezone.now()
        )

        already_read_ids = MessageReadReceipt.objects.filter(
            participant=user,
            message__thread=thread,
        ).values_list('message_id', flat=True)

        unread = thread.messages.filter(
            is_deleted=False, is_system_message=False
        ).exclude(pk__in=already_read_ids)

        receipts = [MessageReadReceipt(message=msg, participant=user) for msg in unread]
        if receipts:
            MessageReadReceipt.objects.bulk_create(receipts, ignore_conflicts=True)

        return Response({'status': 'ok'})

    @action(detail=False, methods=['get'], url_path='page-config/(?P<page_id>[^/.]+)')
    def page_config(self, request, page_id=None):
        """
        GET /api/threads/threads/page-config/{page_id}/
        Returns thread configuration for the given page (is_threadable, who_can_initiate, etc.)
        Used by the frontend to decide whether to show the thread icon on a page.
        """
        from pages.models import ModulePage
        try:
            page = ModulePage.objects.get(pk=page_id, is_deleted=False)
        except ModulePage.DoesNotExist:
            return Response({'detail': 'Page not found.'}, status=status.HTTP_404_NOT_FOUND)

        config = page.get_thread_config()
        user = request.user
        return Response({
            'page_id': page.pk,
            'title': page.title,
            'page_type': page.page_type,
            'is_threadable': page.is_threadable,
            'can_initiate': page.user_can_initiate_thread(user),
            'thread': config,
        })

    @action(detail=False, methods=['get'], url_path='widget-summary')
    def widget_summary(self, request):
        user = request.user
        tenant = getattr(user, 'tenant', None)

        if _is_director(user):
            base_qs = Thread.objects.filter(tenant=tenant, is_deleted=False, status=Thread.STATUS_OPEN)
        elif _is_branch_manager(user):
            base_qs = Thread.objects.filter(
                tenant=tenant, branch=getattr(user, 'branch', None),
                is_deleted=False, status=Thread.STATUS_OPEN,
            )
        else:
            base_qs = Thread.objects.filter(
                tenant=tenant, is_deleted=False, status=Thread.STATUS_OPEN,
                participants__user=user, participants__is_deleted=False,
            ).distinct()

        threads = base_qs.select_related('page').prefetch_related(
            'participants', 'messages'
        ).order_by('-updated_at')[:20]

        unread_count = 0
        recent = []

        for t in threads:
            try:
                participant = t.participants.get(user=user, is_deleted=False)
                last_read = participant.last_read_at
            except ThreadParticipant.DoesNotExist:
                last_read = None

            unread_filter = {'is_system_message': False, 'is_deleted': False}
            if last_read:
                unread_filter['created_at__gt'] = last_read
            unread = t.messages.filter(**unread_filter).count()

            if unread > 0:
                unread_count += 1

            last_msg = t.messages.filter(is_deleted=False).order_by('-created_at').first()
            recent.append({
                'id': t.id,
                'title': t.title,
                'last_message_preview': (
                    last_msg.body[:80]
                    if last_msg and not last_msg.is_system_message
                    else ''
                ),
                'last_activity': t.updated_at,
                'unread_messages': unread,
                'page_url': t.page.url_path if t.page_id else None,
                'status': t.status,
            })

        recent = sorted(recent, key=lambda x: x['last_activity'], reverse=True)[:5]
        return Response({'unread_count': unread_count, 'recent_threads': recent})


# ── ThreadMessage ViewSet ─────────────────────────────────────────────────────

class ThreadMessageViewSet(ScopedModelViewSet):
    permission_module = 'threads'
    permission_page = 'thread-messages'
    queryset = ThreadMessage.objects.all()
    serializer_class = ThreadMessageSerializer
    skip_action_permission = True
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        qs = ThreadMessage.objects.filter(
            thread__tenant=tenant,
            is_deleted=False,
        ).select_related('author').prefetch_related('read_receipts__participant')

        thread_id = self.request.query_params.get('thread')
        if thread_id:
            qs = qs.filter(thread_id=thread_id)
            if not _is_director(user):
                qs = qs.filter(
                    thread__participants__user=user,
                    thread__participants__is_deleted=False,
                )

        # Polling support: ?after=<message_id>
        after_id = self.request.query_params.get('after')
        if after_id:
            qs = qs.filter(pk__gt=after_id)

        return qs.order_by('created_at').distinct()

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        thread = serializer.validated_data.get('thread')

        if thread.tenant != tenant:
            raise PermissionDenied('Thread not found.')

        if thread.status == Thread.STATUS_CLOSED:
            raise ValidationError({'detail': 'Cannot post to a closed thread.'})

        if not _is_director(user):
            is_participant = thread.participants.filter(user=user, is_deleted=False).exists()
            if not is_participant:
                raise PermissionDenied('You are not a participant in this thread.')

        serializer.save(author=user, tenant=tenant)
        # Touch thread updated_at so ordering stays correct
        Thread.objects.filter(pk=thread.pk).update(updated_at=timezone.now())


# ── ThreadParticipant ViewSet ─────────────────────────────────────────────────

class ThreadParticipantViewSet(ScopedModelViewSet):
    permission_module = 'threads'
    permission_page = 'thread-participants'
    queryset = ThreadParticipant.objects.all()
    serializer_class = ThreadParticipantSerializer
    skip_action_permission = True
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        qs = ThreadParticipant.objects.filter(
            thread__tenant=tenant,
            is_deleted=False,
        ).select_related('user', 'added_by', 'thread')

        thread_id = self.request.query_params.get('thread')
        if thread_id:
            qs = qs.filter(thread_id=thread_id)

        if not _is_director(user):
            qs = qs.filter(
                thread__participants__user=user,
                thread__participants__is_deleted=False,
            )

        return qs.distinct()

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        thread = serializer.validated_data.get('thread')

        if thread.tenant != tenant:
            raise PermissionDenied('Thread not found.')

        is_initiator = thread.initiated_by == user
        has_add_perm = thread.participants.filter(
            user=user, can_add_participants=True, is_deleted=False
        ).exists()

        if not is_initiator and not has_add_perm and not _is_director(user):
            raise PermissionDenied('You do not have permission to add participants to this thread.')

        serializer.save(added_by=user, tenant=tenant)

    def perform_destroy(self, instance):
        user = self.request.user
        thread = instance.thread

        is_initiator = thread.initiated_by == user
        has_add_perm = thread.participants.filter(
            user=user, can_add_participants=True, is_deleted=False
        ).exists()

        if not is_initiator and not has_add_perm and not _is_director(user):
            raise PermissionDenied('You do not have permission to remove participants from this thread.')

        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
