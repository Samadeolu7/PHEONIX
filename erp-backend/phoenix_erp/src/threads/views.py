import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied

from django.core.paginator import Paginator
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from common.views import ScopedModelViewSet
from .models import Thread, ThreadParticipant, ThreadMessage, MessageReadReceipt, ThreadMessageAttachment
from .serializers import (
    ThreadSerializer, ThreadCreateSerializer, ThreadUpdateSerializer,
    ThreadParticipantSerializer, ThreadMessageSerializer,
    ThreadMessageUpdateSerializer,
)
from .permissions import (
    is_director as _is_director,
    is_branch_manager as _is_branch_manager,
    directors_for_tenant as _directors_for_tenant,
    branch_managers_for_branch as _branch_managers_for_branch,
)

logger = logging.getLogger(__name__)


# ── Thread ViewSet ────────────────────────────────────────────────────────────

class ThreadViewSet(ScopedModelViewSet):
    permission_module = 'threads'
    permission_page = 'threads'
    queryset = Thread.objects.all()
    serializer_class = ThreadSerializer
    skip_action_permission = True
    PAGE_SIZE = 50

    def get_serializer_class(self):
        if self.action == 'create':
            return ThreadCreateSerializer
        if self.action in ('update', 'partial_update'):
            return ThreadUpdateSerializer
        return ThreadSerializer

    def create(self, request, *args, **kwargs):
        # ThreadCreateSerializer (used to validate the request) has no
        # `participants` field at all — write_only participant_ids only.
        # Returning its own .data left the frontend with participants
        # undefined on a just-created thread, crashing the panel's
        # avatar strip (selectedThread.participants.slice(...)). Re-serialize
        # the saved instance with the full ThreadSerializer instead, matching
        # what list()/retrieve() already return.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        output = ThreadSerializer(serializer.instance, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        """Only the initiator or a Director can edit thread metadata."""
        thread = self.get_object()
        user = self.request.user
        if thread.initiated_by != user and not _is_director(user):
            raise PermissionDenied('Only the initiator or a Director can edit this thread.')
        serializer.save()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', self.PAGE_SIZE)
        try:
            page = int(page)
            page_size = min(int(page_size), 100)
        except (ValueError, TypeError):
            page = 1
            page_size = self.PAGE_SIZE

        paginator = Paginator(queryset, page_size)
        try:
            page_obj = paginator.page(page)
        except Exception:
            return Response({'results': [], 'total': 0, 'page': 1, 'pages': 0})

        serializer = self.get_serializer(page_obj.object_list, many=True)
        return Response({
            'results': serializer.data,
            'total': paginator.count,
            'page': page,
            'pages': paginator.num_pages,
        })

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        qs = Thread.objects.filter(tenant=tenant, is_deleted=False).select_related(
            'page', 'page__module', 'initiated_by', 'closed_by', 'content_type'
        ).prefetch_related(
            'participants__user', 'participants__user__roles',
        )

        # Directors see all. Branch Managers additionally see every thread in
        # their own branch (read-only oversight) even when not tagged as a
        # participant — they're notified of every new thread on their branch
        # (see threads/signals.py) and need to actually be able to open it.
        # Everyone else sees only threads they're a participant in.
        if not _is_director(user):
            if _is_branch_manager(user) and getattr(user, 'branch', None):
                qs = qs.filter(
                    Q(participants__user=user, participants__is_deleted=False) |
                    Q(branch=user.branch)
                )
            else:
                qs = qs.filter(participants__user=user, participants__is_deleted=False)

        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('page_id'):
            qs = qs.filter(page_id=params['page_id'])
        # content_type is optional — the frontend never sends one today (no
        # UI currently resolves a ContentType id), so requiring it alongside
        # object_id meant this filter silently never activated and every
        # thread on the page leaked into every other record's discussion
        # list. object_id alone is enough scoping within a single page_id,
        # since page_id already narrows to one page/model; content_type is
        # only needed to disambiguate further when both are given.
        if params.get('object_id'):
            if params.get('content_type'):
                qs = qs.filter(object_id=params['object_id'], content_type_id=params['content_type'])
            else:
                qs = qs.filter(object_id=params['object_id'])
        if params.get('branch') and _is_director(user):
            qs = qs.filter(branch_id=params['branch'])

        if params.get('search'):
            qs = qs.filter(
                Q(title__icontains=params['search']) |
                Q(messages__body__icontains=params['search'], messages__is_deleted=False)
            ).distinct()

        if params.get('initiated_by') == 'me':
            qs = qs.filter(initiated_by=user)

        # Unread filter: pure DB subquery — no Python iteration.
        if params.get('unread'):
            my_last_read = Subquery(
                ThreadParticipant.objects.filter(
                    thread=OuterRef('pk'), user=user, is_deleted=False
                ).values('last_read_at')[:1]
            )
            # A message the requesting user wrote themselves never counts as
            # unread for them — see ThreadParticipant.has_unread.
            latest_non_sys_msg = Subquery(
                ThreadMessage.objects.filter(
                    thread=OuterRef('pk'), is_system_message=False, is_deleted=False,
                ).exclude(author=user).order_by('-created_at').values('created_at')[:1]
            )
            from django.db.models import F, Exists
            # Directors/Branch Managers can see a thread via oversight
            # without ever being a tagged ThreadParticipant (see the
            # get_queryset branch above) — for them _my_last_read is always
            # NULL (there's no row to hold a read timestamp on), which used
            # to make _my_last_read__isnull=True match unconditionally and
            # every oversight thread show as permanently unread no matter
            # how many times it was actually opened and read. Only apply
            # unread semantics to threads the user is genuinely a
            # participant of; there's no per-user read-state to track for a
            # non-participant (matches ThreadSerializer.get_unread_count's
            # ThreadParticipant.DoesNotExist -> 0 behavior for the same case).
            is_participant = Exists(
                ThreadParticipant.objects.filter(
                    thread=OuterRef('pk'), user=user, is_deleted=False,
                )
            )
            qs = qs.annotate(
                _my_last_read=my_last_read,
                _latest_msg=latest_non_sys_msg,
                _is_participant=is_participant,
            ).filter(
                Q(_is_participant=True) & (
                    Q(_my_last_read__isnull=True, _latest_msg__isnull=False) |
                    Q(_latest_msg__isnull=False, _latest_msg__gt=F('_my_last_read'))
                )
            )

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

        if thread.is_locked:
            return Response(
                {'detail': 'This thread is locked. Unlock it first before reopening.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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
    def lock(self, request, pk=None):
        """Director-only escape hatch for a thread that must actually stay
        closed — see Thread.lock and the auto-reopen-on-reply behavior in
        ThreadMessageViewSet.perform_create that this is meant to override."""
        thread = self.get_object()
        user = request.user

        if not _is_director(user):
            return Response({'detail': 'Only Directors can lock threads.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            thread.lock(user)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        ThreadMessage.objects.create(
            thread=thread,
            body=f"Thread locked by {user.get_full_name() or user.username}.",
            is_system_message=True,
            tenant=getattr(user, 'tenant', None),
        )
        return Response(ThreadSerializer(thread, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        thread = self.get_object()
        user = request.user

        if not _is_director(user):
            return Response({'detail': 'Only Directors can unlock threads.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            thread.unlock(user)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        ThreadMessage.objects.create(
            thread=thread,
            body=f"Thread unlocked by {user.get_full_name() or user.username}.",
            is_system_message=True,
            tenant=getattr(user, 'tenant', None),
        )
        return Response(ThreadSerializer(thread, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        """Any participant can pull all tenant Directors into a thread —
        the compensating oversight the Directors already get automatically
        for every new thread (see threads/signals.py) doesn't help once a
        thread is well underway and specifically needs their attention."""
        thread = self.get_object()
        user = request.user

        if not thread.participants.filter(user=user, is_deleted=False).exists() and not _is_director(user):
            raise PermissionDenied('Only a participant can escalate this thread.')

        tenant = getattr(user, 'tenant', None)
        directors = _directors_for_tenant(tenant).exclude(pk=user.pk)
        added_any = False
        for director in directors:
            _, created = ThreadParticipant.objects.get_or_create(
                thread=thread,
                user=director,
                defaults={'added_by': user, 'tenant': tenant},
            )
            added_any = added_any or created

        ThreadMessage.objects.create(
            thread=thread,
            body=f"Escalated to Director(s) by {user.get_full_name() or user.username}.",
            is_system_message=True,
            tenant=tenant,
        )
        return Response(ThreadSerializer(thread, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='request-join')
    def request_join(self, request, pk=None):
        """An observer (someone who can see the thread via Director/Branch
        Manager oversight but isn't a tagged participant) asks to be added,
        instead of hitting a dead end. Notifies the initiator and anyone who
        already has can_add_participants — the same audience authorized to
        actually add them (see ThreadParticipantViewSet.perform_create)."""
        thread = self.get_object()
        user = request.user

        already_participant = thread.participants.filter(user=user, is_deleted=False).exists()
        if already_participant:
            return Response({'detail': 'You are already a participant in this thread.'},
                             status=status.HTTP_400_BAD_REQUEST)

        self._notify_join_request(thread, user)

        return Response({'status': 'requested'})

    @staticmethod
    def _notify_join_request(thread, requester):
        try:
            from django.contrib.contenttypes.models import ContentType
            from notifications.models import Notification
            from notifications.services import get_in_app_channel
            from notifications.realtime import push_notification_event

            channel = get_in_app_channel()
            if not channel:
                return

            requester_name = requester.get_full_name() or requester.username
            adders = thread.participants.filter(
                Q(user=thread.initiated_by) | Q(can_add_participants=True),
                is_deleted=False,
            ).exclude(user=requester).select_related('user')

            thread_content_type = ContentType.objects.get_for_model(Thread)
            notifications = []
            notified_user_ids = []
            for p in adders:
                notifications.append(Notification(
                    channel=channel,
                    recipient_user=p.user,
                    recipient_name=p.user.get_full_name() or p.user.username,
                    recipient_contact='',
                    subject='Request to join a discussion',
                    message=f'{requester_name} asked to join: "{thread.title}"',
                    priority='normal',
                    status='pending',
                    owner=thread.owner,
                    branch=thread.branch,
                    created_by=requester,
                    tenant=thread.tenant,
                    content_type=thread_content_type,
                    object_id=str(thread.pk),
                ))
                notified_user_ids.append(p.user_id)
            if notifications:
                Notification.objects.bulk_create(notifications, ignore_conflicts=True)
                for user_id in notified_user_ids:
                    push_notification_event(user_id)
        except Exception:
            logger.exception('Failed to notify join request for thread %s', thread.pk)

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

        self._mark_related_notifications_read(thread, user)

        if receipts:
            from django.db import transaction
            from notifications.realtime import push_thread_event
            transaction.on_commit(
                lambda: push_thread_event(thread.pk, 'thread.read_receipt', user_id=user.pk)
            )

        return Response({'status': 'ok'})

    @staticmethod
    def _mark_related_notifications_read(thread, user):
        """
        Reading a thread here and the bell/notification center are two
        separate systems (see threads/signals.py) — without this, a user
        could fully read a discussion while the bell kept showing "New
        message in: ..." for it forever. Notifications are linked back to
        their thread via content_type/object_id, so clear any of this
        user's still-unread ones for this thread now.
        """
        try:
            from django.contrib.contenttypes.models import ContentType
            from notifications.models import Notification
            Notification.objects.filter(
                recipient_user=user,
                content_type=ContentType.objects.get_for_model(Thread),
                object_id=str(thread.pk),
            ).exclude(status='read').update(status='read', read_at=timezone.now())
        except Exception:
            logger.exception('Failed to mark related notifications read for thread %s', thread.pk)

    @action(detail=False, methods=['get'], url_path='page-config/(?P<page_id>[^/.]+)')
    def page_config(self, request, page_id=None):
        """
        GET /api/threads/threads/page-config/{page_id}/
        Returns thread configuration for the given page (is_threadable, auto_include_roles, etc.)
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
        from django.db.models import Max, Case, When, IntegerField, F, Value
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

        # Fetch only what we need via DB aggregation — no Python-level message iteration.
        thread_ids = list(base_qs.order_by('-updated_at').values_list('pk', flat=True)[:20])

        if not thread_ids:
            return Response({'unread_count': 0, 'recent_threads': []})

        threads = (
            Thread.objects.filter(pk__in=thread_ids)
            .select_related('page', 'page__module')
            .prefetch_related('participants__user')
            .annotate(
                last_msg_at=Max(
                    'messages__created_at',
                    filter=Q(messages__is_deleted=False),
                ),
            )
            .order_by('-updated_at')
        )

        # Build per-thread last_read map for the current user (single query)
        participant_map = {
            p.thread_id: p.last_read_at
            for p in ThreadParticipant.objects.filter(
                thread_id__in=thread_ids, user=user, is_deleted=False
            )
        }

        # Latest non-system message per thread (single query)
        latest_msgs = {
            row['thread_id']: row
            for row in ThreadMessage.objects.filter(
                thread_id__in=thread_ids, is_deleted=False
            ).order_by('thread_id', '-created_at').distinct('thread_id').values(
                'thread_id', 'body', 'is_system_message', 'created_at'
            )
        }

        # Unread message count per thread for current user (single aggregation query)
        from django.db.models import Count as DCount
        # We compute per-thread unread in one pass using participant_map
        unread_counts = {}
        for tid in thread_ids:
            if tid not in participant_map:
                # Oversight-only thread (Director/Branch Manager sees it via
                # the branch/tenant-wide base_qs above without being a
                # tagged ThreadParticipant) — there's no per-user
                # last_read_at to track for a non-participant, so
                # participant_map.get(tid) was always None here and every
                # such thread counted as fully unread forever, no matter how
                # many times it was actually opened. Matches
                # ThreadSerializer.get_unread_count's DoesNotExist -> 0.
                unread_counts[tid] = 0
                continue
            last_read = participant_map[tid]
            # A message the current user wrote themselves never counts as
            # unread for them — see ThreadParticipant.has_unread.
            q = ThreadMessage.objects.filter(
                thread_id=tid, is_system_message=False, is_deleted=False,
            ).exclude(author=user)
            if last_read:
                q = q.filter(created_at__gt=last_read)
            unread_counts[tid] = q.count()

        unread_count = sum(1 for c in unread_counts.values() if c > 0)

        recent = []
        for t in threads:
            last_msg_row = latest_msgs.get(t.pk)
            preview = ''
            if last_msg_row and not last_msg_row['is_system_message']:
                preview = last_msg_row['body'][:80]
            recent.append({
                'id': t.id,
                'page': t.page_id,
                'title': t.title,
                'last_message_preview': preview,
                'last_activity': t.updated_at,
                'unread_messages': unread_counts.get(t.pk, 0),
                'page_url': t.page.url_path if t.page_id else None,
                # See ThreadSerializer.get_page_module_code — page_url alone
                # can't represent a specific record's real frontend route.
                'page_module_code': t.page.module.code if t.page_id else None,
                'page_code': t.page.code if t.page_id else None,
                'object_id': t.object_id,
                'status': t.status,
            })

        recent = sorted(recent, key=lambda x: x['last_activity'], reverse=True)[:5]
        return Response({'unread_count': unread_count, 'recent_threads': recent})


# ── ThreadMessage ViewSet ─────────────────────────────────────────────────────

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_ATTACHMENT_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
]


def _validate_attachment(file):
    if file.size > MAX_ATTACHMENT_SIZE:
        raise ValidationError(
            {'attachment': f'File size exceeds {MAX_ATTACHMENT_SIZE // (1024*1024)} MB limit.'}
        )
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise ValidationError(
            {'attachment': f'File type "{file.content_type}" is not allowed.'}
        )


class ThreadMessageViewSet(ScopedModelViewSet):
    permission_module = 'threads'
    permission_page = 'thread-messages'
    queryset = ThreadMessage.objects.all()
    serializer_class = ThreadMessageSerializer
    skip_action_permission = True
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    PAGE_SIZE = 100

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return ThreadMessageUpdateSerializer
        return ThreadMessageSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', self.PAGE_SIZE)
        try:
            page = int(page)
            page_size = min(int(page_size), 200)
        except (ValueError, TypeError):
            page = 1
            page_size = self.PAGE_SIZE

        paginator = Paginator(queryset, page_size)
        try:
            page_obj = paginator.page(page)
        except Exception:
            return Response({'results': [], 'total': 0, 'page': 1, 'pages': 0})

        serializer = self.get_serializer(page_obj.object_list, many=True)
        return Response({
            'results': serializer.data,
            'total': paginator.count,
            'page': page,
            'pages': paginator.num_pages,
        })

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        qs = ThreadMessage.objects.filter(
            thread__tenant=tenant,
            is_deleted=False,
        ).select_related('author', 'reply_to', 'reply_to__author').prefetch_related(
            'read_receipts__participant',
            'attachments',
        )

        thread_id = self.request.query_params.get('thread')
        if thread_id:
            qs = qs.filter(thread_id=thread_id)
            if not _is_director(user):
                if _is_branch_manager(user) and getattr(user, 'branch', None):
                    # Same oversight carve-out as ThreadViewSet.get_queryset —
                    # a Branch Manager reading a thread in their own branch
                    # they were only notified about, not tagged into.
                    qs = qs.filter(
                        Q(thread__participants__user=user, thread__participants__is_deleted=False) |
                        Q(thread__branch=user.branch)
                    )
                else:
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

        is_director = _is_director(user)
        if not is_director:
            is_participant = thread.participants.filter(user=user, is_deleted=False).exists()
            if not is_participant:
                raise PermissionDenied('You are not a participant in this thread.')

        if thread.status == Thread.STATUS_CLOSED:
            if thread.is_locked:
                raise ValidationError({
                    'detail': 'This thread is locked and cannot receive new messages. '
                              'Ask a Director to unlock it first.',
                })
            # Closed-but-unlocked threads reopen automatically the moment a
            # participant (or Director) replies, instead of hitting a dead
            # end — Thread.lock/unlock (Director-only) is the explicit
            # escape hatch for threads that must actually stay closed.
            thread.reopen(user)
            ThreadMessage.objects.create(
                thread=thread,
                body=f"Thread reopened automatically — new message posted by "
                     f"{user.get_full_name() or user.username}.",
                is_system_message=True,
                tenant=tenant,
            )

        attachment = self.request.FILES.get('attachment')
        if attachment:
            _validate_attachment(attachment)

        new_attachments = self.request.FILES.getlist('attachments')
        for f in new_attachments:
            _validate_attachment(f)

        mentioned_ids = serializer.validated_data.pop('mentioned_user_ids', [])

        message = serializer.save(author=user, tenant=tenant)
        Thread.objects.filter(pk=thread.pk).update(updated_at=timezone.now())

        for f in new_attachments:
            ThreadMessageAttachment.objects.create(
                message=message,
                file=f,
                content_type=f.content_type or '',
                size=f.size,
                tenant=tenant,
            )

        self._auto_add_mentioned_participants(thread, mentioned_ids, user, tenant)

        from django.db import transaction
        from notifications.realtime import push_thread_event
        # Deferred past commit — this view runs inside ATOMIC_REQUESTS, so a
        # push fired immediately here could reach a client before the
        # transaction is visible to a subsequent GET.
        transaction.on_commit(
            lambda: push_thread_event(thread.pk, 'thread.message.new', message_id=message.pk, author_id=user.pk)
        )

    @staticmethod
    def _auto_add_mentioned_participants(thread, mentioned_ids, user, tenant):
        if not mentioned_ids:
            return
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        for uid in mentioned_ids:
            if uid == user.pk:
                continue
            try:
                tagged = UserModel.objects.get(pk=uid, tenant=tenant)
            except UserModel.DoesNotExist:
                continue
            ThreadParticipant.objects.get_or_create(
                thread=thread,
                user=tagged,
                defaults={'added_by': user, 'tenant': tenant},
            )

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user
        if instance.author != user and not _is_director(user):
            raise PermissionDenied('Only the author or a Director can edit this message.')
        if instance.is_system_message:
            raise ValidationError({'detail': 'System messages cannot be edited.'})
        message = serializer.save(edited_at=timezone.now())

        from django.db import transaction
        from notifications.realtime import push_thread_event
        transaction.on_commit(
            lambda: push_thread_event(message.thread_id, 'thread.message.updated', message_id=message.pk)
        )

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.author != user and not _is_director(user):
            raise PermissionDenied('Only the author or a Director can delete this message.')
        if instance.is_system_message:
            raise ValidationError({'detail': 'System messages cannot be deleted.'})
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])

        from django.db import transaction
        from notifications.realtime import push_thread_event
        transaction.on_commit(
            lambda: push_thread_event(instance.thread_id, 'thread.message.deleted', message_id=instance.pk)
        )


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

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 50)
        try:
            page = int(page)
            page_size = min(int(page_size), 100)
        except (ValueError, TypeError):
            page = 1
            page_size = 50

        paginator = Paginator(queryset, page_size)
        try:
            page_obj = paginator.page(page)
        except Exception:
            return Response({'results': [], 'total': 0, 'page': 1, 'pages': 0})

        # Compute has_unread in bulk — single query per thread batch, no per-thread DB hit.
        participants = list(page_obj.object_list)
        thread_ids = list({p.thread_id for p in participants})

        # One query: (created_at, author_id) for every candidate message,
        # grouped by thread. A shared per-thread Max(created_at) can't be
        # reused across participants here — each participant's own messages
        # must be excluded from THEIR OWN unread check (see
        # ThreadParticipant.has_unread), and different participant rows in
        # the same thread belong to different users.
        from collections import defaultdict
        messages_by_thread = defaultdict(list)
        for row in ThreadMessage.objects.filter(
            thread_id__in=thread_ids, is_system_message=False, is_deleted=False,
        ).values('thread_id', 'author_id', 'created_at'):
            messages_by_thread[row['thread_id']].append((row['created_at'], row['author_id']))

        for p in participants:
            others_created_at = [
                created_at for created_at, author_id in messages_by_thread.get(p.thread_id, [])
                if author_id != p.user_id
            ]
            latest = max(others_created_at, default=None)
            if latest is None:
                p._has_unread = False
            elif p.last_read_at is None:
                p._has_unread = True
            else:
                p._has_unread = latest > p.last_read_at

        serializer = self.get_serializer(participants, many=True)
        return Response({
            'results': serializer.data,
            'total': paginator.count,
            'page': page,
            'pages': paginator.num_pages,
        })

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
