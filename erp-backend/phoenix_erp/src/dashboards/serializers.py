# dashboards/serializers.py
from rest_framework import serializers
from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from typing import Dict, Any
from .models import Dashboard, Widget, WidgetDataSource, DashboardTheme

class DashboardThemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DashboardTheme
        fields = [
            'id', 'name', 'primary_color', 'secondary_color',
            'accent_color', 'background_color', 'text_color'
        ]

class WidgetDataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = WidgetDataSource
        fields = ['id', 'name', 'identifier', 'source_type']

class WidgetSerializer(serializers.ModelSerializer):
    data_source = WidgetDataSourceSerializer(read_only=True)
    layout = serializers.SerializerMethodField()
    
    class Meta:
        model = Widget
        fields = [
            'id', 'instance_key', 'widget_type', 'title', 'description',
            'icon', 'data_source', 'config', 'click_action',
            'layout', 'background_color', 'border_color', 'text_color',
            'is_visible', 'display_order'
        ]
    
    @extend_schema_field({
        'type': 'object',
        'properties': {
            'x': {'type': 'integer', 'description': 'X position in grid'},
            'y': {'type': 'integer', 'description': 'Y position in grid'},
            'w': {'type': 'integer', 'description': 'Width in grid columns'},
            'h': {'type': 'integer', 'description': 'Height in grid rows'},
            'minW': {'type': 'integer', 'nullable': True, 'description': 'Minimum width'},
            'minH': {'type': 'integer', 'nullable': True, 'description': 'Minimum height'},
            'maxW': {'type': 'integer', 'nullable': True, 'description': 'Maximum width'},
            'maxH': {'type': 'integer', 'nullable': True, 'description': 'Maximum height'},
        },
        'description': 'Widget layout configuration for grid positioning'
    })
    def get_layout(self, obj: Widget) -> Dict[str, Any]:
        """Get the widget layout configuration"""
        return {
            'x': obj.layout_x,
            'y': obj.layout_y,
            'w': obj.layout_w,
            'h': obj.layout_h,
            'minW': obj.layout_min_w,
            'minH': obj.layout_min_h,
            'maxW': obj.layout_max_w,
            'maxH': obj.layout_max_h,
        }

class DashboardSerializer(serializers.ModelSerializer):
    theme = DashboardThemeSerializer(read_only=True)
    widgets = WidgetSerializer(many=True, read_only=True)
    
    class Meta:
        model = Dashboard
        fields = [
            'id', 'name', 'slug', 'description', 'is_default',
            'is_active', 'theme', 'grid_columns', 'layout_mode',
            'show_navigation', 'navigation_config', 'auto_refresh',
            'refresh_interval', 'widgets', 'created_at', 'updated_at'
        ]
    
    def create(self, validated_data):
        """Create dashboard and handle widgets"""
        widgets_data = self.context.get('request').data.get('widgets', [])
        dashboard = Dashboard.objects.create(**validated_data)
        
        # Create widgets
        for widget_data in widgets_data:
            layout = widget_data.get('layout', {})
            Widget.objects.create(
                dashboard=dashboard,
                instance_key=widget_data.get('instance_key') or widget_data.get('id'),
                widget_type=widget_data.get('widget_type'),
                title=widget_data.get('title', ''),
                config=widget_data.get('config', {}),
                layout_x=layout.get('x', 0),
                layout_y=layout.get('y', 0),
                layout_w=layout.get('w', 4),
                layout_h=layout.get('h', 4),
                layout_min_w=layout.get('minW'),
                layout_min_h=layout.get('minH'),
                layout_max_w=layout.get('maxW'),
                layout_max_h=layout.get('maxH'),
            )
        
        return dashboard
    
    def update(self, instance, validated_data):
        """Update dashboard and handle widgets"""
        widgets_data = self.context.get('request').data.get('widgets', [])
        
        with transaction.atomic():
            # Update dashboard fields
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            
            # Hard delete existing widgets to avoid unique constraint violations
            Widget.objects.filter(dashboard=instance).hard_delete()
            
            # Create new widgets
            for widget_data in widgets_data:
                layout = widget_data.get('layout', {})
                Widget.objects.create(
                    dashboard=instance,
                    instance_key=widget_data.get('instance_key') or widget_data.get('id'),
                    widget_type=widget_data.get('widget_type'),
                    title=widget_data.get('title', ''),
                    config=widget_data.get('config', {}),
                    layout_x=layout.get('x', 0),
                    layout_y=layout.get('y', 0),
                    layout_w=layout.get('w', 4),
                    layout_h=layout.get('h', 4),
                    layout_min_w=layout.get('minW', 2),
                    layout_min_h=layout.get('minH', 2),
                    layout_max_w=layout.get('maxW'),
                    layout_max_h=layout.get('maxH'),
                )
        
        return instance