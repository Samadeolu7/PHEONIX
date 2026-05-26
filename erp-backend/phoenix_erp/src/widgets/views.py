from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema
from common.views import ScopedModelViewSet
from common.serializers import IsTenantUser
from .models import WidgetDefinition, WidgetInstance
from .serializers import (
    WidgetDefinitionSerializer, 
    WidgetInstanceSerializer,
    WidgetInstanceDetailSerializer
)
from .services import refresh_widget_data
from .tasks import refresh_widget

class WidgetDefinitionViewSet(ScopedModelViewSet):
    """
    API endpoint for managing widget definitions.
    Definitions determine available widget types and their schemas.
    """
    permission_module = 'widgets'
    permission_page = 'widget-definitions'
    queryset = WidgetDefinition.objects.all()
    serializer_class = WidgetDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    @extend_schema(description="Preview widget with test data")
    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Generate preview data for this widget type."""
        definition = self.get_object()
        # TODO: Generate preview data based on definition schema
        return Response({
            'preview_data': {},
            'configuration': definition.default_config
        })

class WidgetInstanceViewSet(ScopedModelViewSet):
    """
    API endpoint for managing widget instances on pages.
    Instances are concrete widgets placed on pages with specific configurations.
    """
    permission_module = 'widgets'
    permission_page = 'widget-instances'
    queryset = WidgetInstance.objects.all()
    serializer_class = WidgetInstanceSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_serializer_class(self):
        """Use detailed serializer for retrieve action."""
        if self.action == 'retrieve':
            return WidgetInstanceDetailSerializer
        return super().get_serializer_class()

    def perform_create(self, serializer):
        """Set initial configuration from definition defaults."""
        definition = serializer.validated_data['definition']
        if not serializer.validated_data.get('configuration'):
            serializer.validated_data['configuration'] = definition.default_config
        if not serializer.validated_data.get('refresh_interval'):
            serializer.validated_data['refresh_interval'] = definition.refresh_interval
        super().perform_create(serializer)

    @extend_schema(description="Refresh widget instance data")
    @action(detail=True, methods=['post'])
    def refresh(self, request, pk=None):
        """Manually refresh widget instance data."""
        instance = self.get_object()
        refresh_widget.delay(instance.id)  # Celery task
        return Response({'status': 'refresh scheduled'})
