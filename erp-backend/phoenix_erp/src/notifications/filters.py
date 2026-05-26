# notifications/api/filters.py
import django_filters
from notifications.models import Notification


class NotificationFilter(django_filters.FilterSet):
    """Filters for notifications"""
    status = django_filters.CharFilter(field_name='status')
    priority = django_filters.CharFilter(field_name='priority')
    channel = django_filters.CharFilter(field_name='channel__code')
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = Notification
        fields = ['status', 'priority', 'channel', 'created_after', 'created_before']

