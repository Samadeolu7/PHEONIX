from rest_framework import serializers
from common.serializers import TenantResourceSerializer
from .models import WidgetDefinition, WidgetInstance
from pages.serializers import PageSerializer

class WidgetDefinitionSerializer(TenantResourceSerializer):
    """Serializer for WidgetDefinition model."""
    owner_name = serializers.ReadOnlyField(source='owner.get_full_name')
    instance_count = serializers.SerializerMethodField()
    
    class Meta:
        model = WidgetDefinition
        fields = [
            'id', 'tenant', 'code', 'name', 'description',
            'schema', 'default_config', 'refresh_interval',
            'owner', 'owner_name', 'created_by', 
            'created_at', 'updated_at', 'is_deleted',
            'instance_count'
        ]
        read_only_fields = [
            'tenant', 'owner', 'created_by', 
            'created_at', 'updated_at', 'instance_count'
        ]
    
    def get_instance_count(self, obj):
        """Get count of non-deleted instances of this widget type."""
        return obj.widgetinstance_set.filter(is_deleted=False).count()

class WidgetInstanceSerializer(TenantResourceSerializer):
    """Serializer for WidgetInstance model."""
    owner_name = serializers.ReadOnlyField(source='owner.get_full_name')
    page_title = serializers.ReadOnlyField(source='page.title')
    definition_name = serializers.ReadOnlyField(source='definition.name')
    definition_code = serializers.ReadOnlyField(source='definition.code')
    
    class Meta:
        model = WidgetInstance
        fields = [
            'id', 'tenant', 'definition', 'definition_name', 
            'definition_code', 'page', 'page_title', 'title',
            'position', 'configuration', 'refresh_interval',
            'last_refresh', 'owner', 'owner_name',
            'created_by', 'created_at', 'updated_at',
            'is_deleted'
        ]
        read_only_fields = [
            'tenant', 'owner', 'created_by', 
            'created_at', 'updated_at', 'last_refresh'
        ]

class WidgetInstanceDetailSerializer(WidgetInstanceSerializer):
    """Detailed serializer including page and definition details."""
    page = PageSerializer(read_only=True)
    definition = WidgetDefinitionSerializer(read_only=True)