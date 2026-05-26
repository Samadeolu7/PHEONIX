# notifications/admin.py
from django.contrib import admin
from django.utils import timezone
from django.db import models
from django.utils.html import format_html
from .models import (
    NotificationChannel, NotificationTemplate, TemplateChannelConfig,
    Notification, NotificationBatch, NotificationPreference
)


@admin.register(NotificationChannel)
class NotificationChannelAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'provider', 'is_active', 'cost_per_unit', 'rate_limit_per_hour']
    list_filter = ['is_active', 'provider']
    search_fields = ['code', 'name', 'provider']
    
    fieldsets = [
        ('Basic Information', {
            'fields': ['code', 'name', 'is_active', 'provider']
        }),
        ('Provider Configuration', {
            'fields': ['provider_config'],
            'classes': ['collapse']
        }),
        ('Cost & Limits', {
            'fields': ['cost_per_unit', 'rate_limit_per_minute', 'rate_limit_per_hour']
        }),
        ('Fallback', {
            'fields': ['fallback_channel'],
            'classes': ['collapse']
        }),
    ]


class TemplateChannelConfigInline(admin.TabularInline):
    model = TemplateChannelConfig
    extra = 1
    fields = ['channel', 'subject_template', 'body_template', 'priority', 'is_active']


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = [
        'code', 'name', 'category', 'default_priority', 'is_active',
        'usage_count', 'success_rate', 'last_used_at'
    ]
    list_filter = ['is_active', 'category', 'default_priority', 'branch']
    search_fields = ['code', 'name', 'description']
    readonly_fields = ['usage_count', 'last_used_at', 'success_rate']
    inlines = [TemplateChannelConfigInline]
    
    fieldsets = [
        ('Basic Information', {
            'fields': ['name', 'code', 'description', 'category']
        }),
        ('Configuration', {
            'fields': ['default_priority', 'is_active']
        }),
        ('Template Variables', {
            'fields': ['template_variables'],
            'classes': ['collapse'],
            'description': 'Define variables available in this template'
        }),
        ('Conditional Sending', {
            'fields': ['send_conditions'],
            'classes': ['collapse'],
            'description': 'Define conditions for sending this notification'
        }),
        ('Scheduling', {
            'fields': ['schedule_config'],
            'classes': ['collapse']
        }),
        ('Retry Configuration', {
            'fields': ['retry_config'],
            'classes': ['collapse']
        }),
        ('Statistics', {
            'fields': ['usage_count', 'last_used_at', 'success_rate'],
            'classes': ['collapse']
        }),
    ]
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        # Filter by user's tenant/branch
        return qs.filter(owner=request.user)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'get_recipient', 'channel', 'template', 'status',
        'priority', 'scheduled_for', 'sent_at', 'retry_count'
    ]
    list_filter = [
        'status', 'priority', 'channel', 'template',
        'scheduled_for', 'sent_at'
    ]
    search_fields = [
        'recipient_name', 'recipient_contact', 'subject', 'message'
    ]
    readonly_fields = [
        'template', 'channel', 'subject', 'message', 'html_message',
        'context_data', 'provider_response', 'provider_message_id',
        'sent_at', 'delivered_at', 'read_at', 'cancelled_at'
    ]
    date_hierarchy = 'created_at'
    
    fieldsets = [
        ('Recipient', {
            'fields': [
                'recipient_user', 'recipient_client',
                'recipient_contact', 'recipient_name'
            ]
        }),
        ('Notification Details', {
            'fields': [
                'template', 'channel', 'priority',
                'subject', 'message', 'html_message'
            ]
        }),
        ('Status', {
            'fields': [
                'status', 'scheduled_for', 'sent_at',
                'delivered_at', 'read_at', 'cancelled_at'
            ]
        }),
        ('Error Tracking', {
            'fields': [
                'error_message', 'retry_count', 'max_retries', 'next_retry_at'
            ],
            'classes': ['collapse']
        }),
        ('Context & Provider Data', {
            'fields': [
                'context_data', 'provider_response', 'provider_message_id'
            ],
            'classes': ['collapse']
        }),
        ('Related Object', {
            'fields': ['content_type', 'object_id'],
            'classes': ['collapse']
        }),
        ('Batch', {
            'fields': ['batch'],
            'classes': ['collapse']
        }),
    ]
    
    def get_recipient(self, obj):
        if obj.recipient_user:
            return f"User: {obj.recipient_user.username}"
        elif obj.recipient_client:
            return f"Client: {obj.recipient_client.full_name}"
        return obj.recipient_contact
    get_recipient.short_description = 'Recipient'
    
    def has_add_permission(self, request):
        return False  # Notifications should be created programmatically
    
    def has_delete_permission(self, request, obj=None):
        # Only allow deleting failed/cancelled notifications
        if obj and obj.status in ['failed', 'cancelled']:
            return True
        return False
    
    actions = ['retry_failed', 'cancel_pending']
    
    def retry_failed(self, request, queryset):
        """Retry failed notifications"""
        from .tasks import send_notification_task
        
        failed = queryset.filter(status='failed', retry_count__lt=models.F('max_retries'))
        count = 0
        for notification in failed:
            notification.status = 'pending'
            notification.save(update_fields=['status'])
            send_notification_task.apply_async(args=[notification.id], countdown=1)
            count += 1
        
        self.message_user(request, f"Queued {count} notifications for retry")
    retry_failed.short_description = "Retry failed notifications"
    
    def cancel_pending(self, request, queryset):
        """Cancel pending notifications"""
        pending = queryset.filter(status__in=['pending', 'scheduled'])
        count = pending.update(
            status='cancelled',
            cancelled_at=timezone.now()
        )
        self.message_user(request, f"Cancelled {count} notifications")
    cancel_pending.short_description = "Cancel pending notifications"


@admin.register(NotificationBatch)
class NotificationBatchAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'template', 'status', 'progress_display',
        'total_recipients', 'sent_count', 'failed_count',
        'started_at', 'completed_at'
    ]
    list_filter = ['status', 'template', 'started_at']
    search_fields = ['name', 'description']
    readonly_fields = [
        'template', 'total_recipients', 'sent_count',
        'delivered_count', 'failed_count', 'started_at', 'completed_at'
    ]
    
    fieldsets = [
        ('Batch Information', {
            'fields': ['name', 'description', 'template']
        }),
        ('Configuration', {
            'fields': ['batch_size', 'delay_between_batches']
        }),
        ('Progress', {
            'fields': [
                'status', 'total_recipients', 'sent_count',
                'delivered_count', 'failed_count'
            ]
        }),
        ('Timing', {
            'fields': ['started_at', 'completed_at']
        }),
        ('Errors', {
            'fields': ['error_summary'],
            'classes': ['collapse']
        }),
    ]
    
    def progress_display(self, obj):
        """Display progress bar"""
        percentage = obj.progress_percentage
        color = 'green' if percentage == 100 else 'orange' if percentage > 50 else 'red'
        
        return format_html(
            '<div style="width:100px; background:#eee;">'
            '<div style="width:{}px; background:{}; height:20px;"></div>'
            '</div> {}%',
            int(percentage),
            color,
            int(percentage)
        )
    progress_display.short_description = 'Progress'
    
    def has_add_permission(self, request):
        return False  # Batches should be created programmatically


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = [
        'get_owner', 'enabled', 'email_enabled', 'sms_enabled',
        'whatsapp_enabled', 'push_enabled', 'in_app_enabled',
        'quiet_hours_enabled'
    ]
    list_filter = ['enabled', 'quiet_hours_enabled']
    search_fields = ['user__username', 'client__first_name', 'client__last_name']
    
    fieldsets = [
        ('Owner', {
            'fields': ['user', 'client']
        }),
        ('Global Settings', {
            'fields': ['enabled']
        }),
        ('Channel Preferences', {
            'fields': [
                'email_enabled', 'sms_enabled', 'whatsapp_enabled',
                'push_enabled', 'in_app_enabled'
            ]
        }),
        ('Category Preferences', {
            'fields': ['category_preferences'],
            'classes': ['collapse']
        }),
        ('Quiet Hours', {
            'fields': [
                'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end'
            ]
        }),
        ('Limits', {
            'fields': ['max_per_day', 'max_per_category_per_day'],
            'classes': ['collapse']
        }),
    ]
    
    def get_owner(self, obj):
        if obj.user:
            return f"User: {obj.user.username}"
        if obj.client:
            return f"Client: {obj.client.full_name}"
        return "Unknown"
    get_owner.short_description = 'Owner'