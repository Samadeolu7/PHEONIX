from rest_framework import serializers
from notifications.models import (
    Notification, NotificationTemplate, NotificationPreference,
    NotificationChannel, TemplateChannelConfig
)


class NotificationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for notification list"""
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    is_read = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'subject', 'message', 'status', 'priority',
            'channel_name', 'is_read', 'created_at', 'sent_at'
        ]
    
    def get_is_read(self, obj):
        return obj.status == 'read'


class NotificationSerializer(serializers.ModelSerializer):
    """Full notification serializer"""
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)
    is_read = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'template_name', 'channel_name', 'subject', 'message',
            'html_message', 'status', 'priority', 'is_read',
            'scheduled_for', 'sent_at', 'delivered_at', 'read_at',
            'error_message', 'retry_count', 'created_at'
        ]
        read_only_fields = fields
    
    def get_is_read(self, obj):
        return obj.status == 'read'


class ChannelConfigSerializer(serializers.ModelSerializer):
    """Serializer for template channel configuration"""
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)
    
    class Meta:
        model = TemplateChannelConfig
        fields = [
            'channel_name', 'channel_code', 'subject_template',
            'body_template', 'priority', 'is_active'
        ]


class NotificationTemplateSerializer(serializers.ModelSerializer):
    """Serializer for notification templates"""
    channels = ChannelConfigSerializer(source='channel_configs', many=True, read_only=True)
    
    class Meta:
        model = NotificationTemplate
        fields = [
            'id', 'code', 'name', 'description', 'category',
            'default_priority', 'template_variables', 'send_conditions',
            'schedule_config', 'channels', 'usage_count', 'success_rate',
            'is_active'
        ]
        read_only_fields = fields


class SendNotificationSerializer(serializers.Serializer):
    """Serializer for sending notifications"""
    recipient_id = serializers.IntegerField(required=True)
    recipient_type = serializers.ChoiceField(choices=['client', 'user'], required=True)
    context = serializers.JSONField(required=True)
    channels = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_null=True
    )
    priority = serializers.ChoiceField(
        choices=['low', 'normal', 'high', 'urgent'],
        required=False,
        allow_null=True
    )
    scheduled_for = serializers.DateTimeField(required=False, allow_null=True)


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for notification preferences"""
    
    class Meta:
        model = NotificationPreference
        fields = [
            'enabled', 'email_enabled', 'sms_enabled', 'whatsapp_enabled',
            'push_enabled', 'in_app_enabled', 'category_preferences',
            'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
            'max_per_day', 'max_per_category_per_day'
        ]
