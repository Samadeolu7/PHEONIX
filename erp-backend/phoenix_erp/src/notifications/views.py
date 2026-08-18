# notifications/api/views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Q, Count
from common.views import ScopedModelViewSet, resolve_effective_branch

from notifications.models import (
    Notification, NotificationTemplate, NotificationPreference
)
from .serializers import (
    NotificationSerializer, NotificationListSerializer,
    NotificationTemplateSerializer, NotificationPreferenceSerializer,
    SendNotificationSerializer
)
from .filters import NotificationFilter


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for user notifications
    
    list: Get all notifications for current user
    retrieve: Get specific notification
    mark_read: Mark notification as read
    mark_all_read: Mark all notifications as read
    unread_count: Get count of unread notifications
    """
    permission_module = 'notifications'
    permission_page = 'notifications'
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = NotificationFilter
    search_fields = ['subject', 'message']
    ordering_fields = ['created_at', 'priority', 'status']
    ordering = ['-created_at']
    queryset = Notification.objects.none()  # For schema generation
    
    def get_serializer_class(self):
        if self.action == 'list':
            return NotificationListSerializer
        return NotificationSerializer
    
    def get_queryset(self):
        """Get notifications for current user"""
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return Notification.objects.none()
        
        user = self.request.user
        
        # Get notifications addressed directly to this user
        queryset = Notification.objects.filter(
            recipient_user=user
        ).select_related(
            'template', 'channel', 'recipient_user', 'recipient_client'
        ).prefetch_related('batch')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter unread
        unread_only = self.request.query_params.get('unread_only')
        if unread_only == 'true':
            queryset = queryset.exclude(status='read')
        
        # Filter by channel
        channel = self.request.query_params.get('channel')
        if channel:
            queryset = queryset.filter(channel__code=channel)
        
        # Filter by priority
        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a notification as read"""
        notification = self.get_object()

        if notification.status != 'read':
            notification.mark_read()
            self._sync_thread_read_state([notification.object_id] if notification.object_id else [], request.user)

        return Response({
            'status': 'success',
            'message': 'Notification marked as read'
        })

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read"""
        queryset = self.get_queryset().exclude(status='read')
        thread_ids = list(
            queryset.filter(content_type__model='thread').values_list('object_id', flat=True)
        )
        count = queryset.update(
            status='read',
            read_at=timezone.now()
        )
        self._sync_thread_read_state(thread_ids, request.user)

        return Response({
            'status': 'success',
            'message': f'{count} notifications marked as read',
            'count': count
        })

    @staticmethod
    def _sync_thread_read_state(thread_object_ids, user):
        """
        A discussion thread's own unread badge (ThreadParticipant.last_read_at)
        and this bell's Notification.status are two independent read-states
        (see threads/signals.py) — clearing a thread notification here without
        this left the Discuss button showing a stale red badge even after the
        bell had been cleared for it.
        """
        if not thread_object_ids:
            return
        try:
            from threads.models import ThreadParticipant
            ThreadParticipant.objects.filter(
                thread_id__in=thread_object_ids, user=user, is_deleted=False,
            ).update(last_read_at=timezone.now())
        except Exception:
            pass
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        unread_qs = self.get_queryset().exclude(status='read')
        count = unread_qs.count()

        # Group by priority
        priority_counts = unread_qs.values(
            'priority'
        ).annotate(count=Count('id'))

        return Response({
            'total': count,
            'by_priority': {
                item['priority']: item['count'] 
                for item in priority_counts
            }
        })
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get notification statistics"""
        queryset = self.get_queryset()
        
        total = queryset.count()
        unread = queryset.exclude(status='read').count()
        by_status = queryset.values('status').annotate(count=Count('id'))
        by_channel = queryset.values('channel__name').annotate(count=Count('id'))
        by_priority = queryset.values('priority').annotate(count=Count('id'))
        
        return Response({
            'total': total,
            'unread': unread,
            'by_status': {item['status']: item['count'] for item in by_status},
            'by_channel': {item['channel__name']: item['count'] for item in by_channel},
            'by_priority': {item['priority']: item['count'] for item in by_priority},
        })
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a pending notification"""
        notification = self.get_object()
        
        if notification.status not in ['pending', 'scheduled']:
            return Response({
                'status': 'error',
                'message': 'Can only cancel pending or scheduled notifications'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        notification.cancel()
        
        return Response({
            'status': 'success',
            'message': 'Notification cancelled'
        })


class NotificationTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for notification templates
    
    list: Get available templates
    retrieve: Get template details
    send: Send notification using template
    """
    permission_module = 'notifications'
    permission_page = 'notification-templates'
    serializer_class = NotificationTemplateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'code', 'description']
    queryset = NotificationTemplate.objects.none()  # For schema generation
    
    def get_queryset(self):
        """Get templates for user's branch"""
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return NotificationTemplate.objects.none()
        
        qs = NotificationTemplate.objects.filter(is_active=True)
        branch = resolve_effective_branch(self.request)
        if branch:
            qs = qs.filter(branch=branch)
        return qs.select_related('branch').prefetch_related('channel_configs__channel')
    
    @action(detail=True, methods=['post'], serializer_class=SendNotificationSerializer)
    def send(self, request, pk=None):
        """
        Send a notification using this template
        
        Body:
        {
            "recipient_id": 123,  // client ID
            "recipient_type": "client",  // or "user"
            "context": {
                "client_name": "John Doe",
                "amount": 5000,
                ...
            },
            "channels": ["sms", "email"],  // optional
            "priority": "high",  // optional
            "scheduled_for": "2025-01-01T10:00:00Z"  // optional
        }
        """
        template = self.get_object()
        serializer = SendNotificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        
        # Get recipient
        from clients.models import Client
        from users.models import User
        
        recipient_type = data['recipient_type']
        recipient_id = data['recipient_id']
        
        if recipient_type == 'client':
            recipient = Client.objects.get(id=recipient_id, branch=request.user.branch)
        else:
            recipient = User.objects.get(id=recipient_id, tenant=request.user.tenant)
        
        # Send notification
        from notifications.services import NotificationService
        service = NotificationService()
        
        try:
            notifications = service.send_from_template(
                template_code=template.code,
                recipient=recipient,
                context=data['context'],
                owner=request.user,
                branch=request.user.branch,
                created_by=request.user,
                channels=data.get('channels'),
                priority=data.get('priority'),
                scheduled_for=data.get('scheduled_for')
            )
            
            return Response({
                'status': 'success',
                'message': f'Sent {len(notifications)} notification(s)',
                'notification_ids': [n.id for n in notifications]
            }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class NotificationPreferenceViewSet(ScopedModelViewSet):
    """
    API endpoints for notification preferences
    
    retrieve: Get user's notification preferences
    update: Update notification preferences
    """
    permission_module = 'notifications'
    permission_page = 'notification-preferences'
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'put', 'patch']
    queryset = NotificationPreference.objects.none()  # For schema generation
    
    def get_object(self):
        """Get or create preferences for current user"""
        # Protect against schema generation
        if getattr(self, 'swagger_fake_view', False):
            return NotificationPreference()
        
        user = self.request.user
        
        # Try to get existing preferences
        try:
            return NotificationPreference.objects.get(user=user)
        except NotificationPreference.DoesNotExist:
            # Create default preferences
            return NotificationPreference.objects.create(user=user)
    
    def list(self, request):
        """Get current user's preferences"""
        preferences = self.get_object()
        serializer = self.get_serializer(preferences)
        return Response(serializer.data)
    
    def update(self, request, *args, **kwargs):
        """Update user's preferences"""
        preferences = self.get_object()
        serializer = self.get_serializer(preferences, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            'status': 'success',
            'message': 'Preferences updated',
            'data': serializer.data
        })
    
    @action(detail=False, methods=['post'])
    def enable_channel(self, request):
        """Enable specific channel"""
        preferences = self.get_object()
        channel = request.data.get('channel')
        
        if channel:
            setattr(preferences, f'{channel}_enabled', True)
            preferences.save()
            
            return Response({
                'status': 'success',
                'message': f'{channel} enabled'
            })
        
        return Response({
            'status': 'error',
            'message': 'Channel not specified'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def disable_channel(self, request):
        """Disable specific channel"""
        preferences = self.get_object()
        channel = request.data.get('channel')
        
        if channel:
            setattr(preferences, f'{channel}_enabled', False)
            preferences.save()
            
            return Response({
                'status': 'success',
                'message': f'{channel} disabled'
            })
        
        return Response({
            'status': 'error',
            'message': 'Channel not specified'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def set_quiet_hours(self, request):
        """Set quiet hours"""
        preferences = self.get_object()
        
        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')
        
        if start_time and end_time:
            from django.utils.dateparse import parse_time
            
            preferences.quiet_hours_enabled = True
            preferences.quiet_hours_start = parse_time(start_time)
            preferences.quiet_hours_end = parse_time(end_time)
            preferences.save()
            
            return Response({
                'status': 'success',
                'message': 'Quiet hours set'
            })
        
        return Response({
            'status': 'error',
            'message': 'start_time and end_time required'
        }, status=status.HTTP_400_BAD_REQUEST)


# notifications/api/serializers.py
