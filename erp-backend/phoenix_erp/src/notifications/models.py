# notifications/models.py
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
import json


class NotificationChannel(models.Model):
    """
    Configuration for notification delivery channels (SMS, Email, etc.)
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    
    # Provider configuration
    provider = models.CharField(
        max_length=50,
        help_text="Provider name (e.g., 'twilio', 'sendgrid', 'termii')"
    )
    provider_config = models.JSONField(
        default=dict,
        help_text="""
        Provider-specific configuration:
        {
            'api_key': 'encrypted_key',
            'sender_id': 'YourBrand',
            'endpoint': 'https://api.provider.com',
            'rate_limit': 100  // per minute
        }
        """
    )
    
    # Cost tracking
    cost_per_unit = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=0,
        help_text="Cost per notification (for budgeting)"
    )
    
    # Rate limiting
    rate_limit_per_minute = models.IntegerField(default=60)
    rate_limit_per_hour = models.IntegerField(default=1000)
    
    # Fallback configuration
    fallback_channel = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Channel to use if this one fails"
    )
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class NotificationTemplate(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Reusable notification templates with variable substitution
    """
    # Identification
    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50, db_index=True)
    description = models.TextField(blank=True)
    category = models.CharField(
        max_length=50,
        blank=True,
        help_text="Category for organization (e.g., 'transactions', 'alerts')"
    )
    
    # Channel configuration
    channels = models.ManyToManyField(
        NotificationChannel,
        through='TemplateChannelConfig',
        related_name='templates'
    )
    
    # Priority
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    default_priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='normal'
    )
    
    # Conditional sending
    send_conditions = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Conditions that must be met to send:
        {
            'all_of': [
                {'field': 'amount', 'operator': '>', 'value': 1000},
                {'field': 'client.status', 'operator': '==', 'value': 'active'}
            ],
            'any_of': [
                {'field': 'client.communication_preference', 'operator': 'in', 'values': ['sms', 'email']}
            ]
        }
        """
    )
    
    # Scheduling options
    schedule_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        {
            'delay_seconds': 0,  // Immediate by default
            'send_at_time': '09:00',  // Specific time of day
            'business_hours_only': True,
            'timezone': 'Africa/Lagos'
        }
        """
    )
    
    # Retry configuration
    retry_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        {
            'max_attempts': 3,
            'retry_delays': [60, 300, 900],  // seconds
            'retry_on_failure_types': ['network_error', 'provider_error']
        }
        """
    )
    
    # Variable definitions
    template_variables = models.JSONField(
        default=list,
        help_text="""
        Variables available in templates:
        [
            {
                'name': 'client_name',
                'source': 'client.full_name',
                'required': True
            },
            {
                'name': 'amount',
                'source': 'transaction.amount',
                'format': 'currency',
                'required': True
            },
            {
                'name': 'balance',
                'source': 'account.balance',
                'format': 'currency',
                'default': '0.00'
            }
        ]
        """
    )
    
    # Usage tracking
    usage_count = models.IntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)
    success_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Percentage of successful deliveries"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        unique_together = [('branch', 'code')]
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['code', 'is_active']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def validate_variables(self, context: dict) -> tuple[bool, list]:
        """
        Validate that all required variables are present in context
        Returns: (is_valid, missing_variables)
        """
        missing = []
        for var in self.template_variables:
            if var.get('required', False):
                var_name = var['name']
                # Check nested paths like 'client.full_name'
                source = var['source']
                if not self._resolve_variable(source, context):
                    missing.append(var_name)
        
        return (len(missing) == 0, missing)
    
    def _resolve_variable(self, path: str, context: dict):
        """Resolve nested variable path"""
        parts = path.split('.')
        value = context
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return None
        return value
    
    def should_send(self, context: dict) -> tuple[bool, str]:
        """
        Check if notification should be sent based on conditions
        Returns: (should_send, reason)
        """
        if not self.send_conditions:
            return (True, '')
        
        # Check all_of conditions
        all_of = self.send_conditions.get('all_of', [])
        for condition in all_of:
            if not self._evaluate_condition(condition, context):
                return (False, f"Failed condition: {condition}")
        
        # Check any_of conditions
        any_of = self.send_conditions.get('any_of', [])
        if any_of:
            if not any(self._evaluate_condition(c, context) for c in any_of):
                return (False, "Failed all any_of conditions")
        
        return (True, '')
    
    def _evaluate_condition(self, condition: dict, context: dict) -> bool:
        """Evaluate a single condition"""
        field_path = condition['field']
        operator = condition['operator']
        expected = condition.get('value')
        
        actual = self._resolve_variable(field_path, context)
        
        if operator == '==':
            return actual == expected
        elif operator == '!=':
            return actual != expected
        elif operator == '>':
            return float(actual) > float(expected)
        elif operator == '>=':
            return float(actual) >= float(expected)
        elif operator == '<':
            return float(actual) < float(expected)
        elif operator == '<=':
            return float(actual) <= float(expected)
        elif operator == 'in':
            return actual in condition.get('values', [])
        elif operator == 'not_in':
            return actual not in condition.get('values', [])
        elif operator == 'contains':
            return expected in str(actual)
        elif operator == 'startswith':
            return str(actual).startswith(expected)
        
        return False


class TemplateChannelConfig(models.Model):
    """
    Configuration for a template on a specific channel
    """
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.CASCADE,
        related_name='channel_configs'
    )
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.CASCADE
    )
    
    # Channel-specific content
    subject_template = models.CharField(
        max_length=255,
        blank=True,
        help_text="Subject line (for email) or title (for push)"
    )
    body_template = models.TextField(
        help_text="Message body with {{variable}} placeholders"
    )
    
    # For rich content channels (email, in-app)
    html_template = models.TextField(
        blank=True,
        help_text="HTML version for email"
    )
    
    # Attachments configuration
    attachments_config = models.JSONField(
        default=list,
        blank=True,
        help_text="""
        [
            {
                'type': 'pdf',
                'source': 'generate_receipt',
                'filename': 'receipt_{{reference_number}}.pdf'
            }
        ]
        """
    )
    
    # Channel-specific settings
    channel_settings = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Channel-specific options:
        {
            'sms': {'sender_name': 'MyCompany'},
            'email': {'reply_to': 'support@company.com'},
            'whatsapp': {'template_id': 'welcome_template'}
        }
        """
    )
    
    # Priority for this channel
    priority = models.IntegerField(
        default=0,
        help_text="Send order (0 = first)"
    )
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        unique_together = [('template', 'channel')]
        ordering = ['priority']
    
    def __str__(self):
        return f"{self.template.code} -> {self.channel.code}"
    
    def render(self, context: dict) -> dict:
        """
        Render template with context variables
        Returns: {'subject': '...', 'body': '...', 'html': '...'}
        """
        from django.template import Template, Context
        
        # Prepare context with formatted values
        rendered_context = self._prepare_context(context)
        
        # Render subject
        subject = ''
        if self.subject_template:
            subject = Template(self.subject_template).render(Context(rendered_context))
        
        # Render body
        body = Template(self.body_template).render(Context(rendered_context))
        
        # Render HTML (if available)
        html = ''
        if self.html_template:
            html = Template(self.html_template).render(Context(rendered_context))
        
        return {
            'subject': subject,
            'body': body,
            'html': html,
            'context': rendered_context
        }
    
    def _prepare_context(self, context: dict) -> dict:
        """Prepare context with formatted values"""
        prepared = {}
        
        for var_def in self.template.template_variables:
            var_name = var_def['name']
            source_path = var_def['source']
            var_format = var_def.get('format', 'text')
            default = var_def.get('default', '')
            
            # Resolve value
            value = self.template._resolve_variable(source_path, context)
            if value is None:
                value = default
            
            # Format value
            if var_format == 'currency':
                value = self._format_currency(value)
            elif var_format == 'date':
                value = self._format_date(value)
            elif var_format == 'datetime':
                value = self._format_datetime(value)
            elif var_format == 'percentage':
                value = f"{float(value):.2f}%"
            
            prepared[var_name] = value
        
        # Add all context as-is for flexibility
        prepared.update(context)
        
        return prepared
    
    def _format_currency(self, value):
        """Format as currency"""
        try:
            from decimal import Decimal
            val = Decimal(str(value))
            return f"₦{val:,.2f}"
        except:
            return str(value)
    
    def _format_date(self, value):
        """Format date"""
        if hasattr(value, 'strftime'):
            return value.strftime('%d %b %Y')
        return str(value)
    
    def _format_datetime(self, value):
        """Format datetime"""
        if hasattr(value, 'strftime'):
            return value.strftime('%d %b %Y %I:%M %p')
        return str(value)


class Notification(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual notification instance
    """
    # Template reference
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='notifications'
    )
    
    # Recipient (multiple ways to identify)
    recipient_user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    recipient_client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    recipient_contact = models.CharField(
        max_length=255,
        blank=True,
        help_text="Email address or phone number"
    )
    recipient_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Recipient display name"
    )
    
    # Delivery channel
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.PROTECT,
        related_name='notifications'
    )
    
    # Content (rendered from template or custom)
    subject = models.CharField(max_length=255, blank=True)
    message = models.TextField()
    html_message = models.TextField(blank=True)
    
    # Priority
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='normal'
    )
    
    # Status tracking
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('read', 'Read'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    
    # Timing
    scheduled_for = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="When to send (null = immediate)"
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    
    # Error tracking
    error_message = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)
    max_retries = models.IntegerField(default=3)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    
    # Context data (for rendering and retry)
    context_data = models.JSONField(
        default=dict,
        help_text="Data used to render this notification"
    )
    
    # Provider response
    provider_response = models.JSONField(
        default=dict,
        blank=True,
        help_text="Response from the notification provider"
    )
    provider_message_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Provider's tracking ID"
    )
    
    # Related object (polymorphic)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    object_id = models.CharField(max_length=50, blank=True)
    related_object = GenericForeignKey('content_type', 'object_id')
    
    # Cost tracking
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=0,
        help_text="Actual cost of sending"
    )
    
    # Batching
    batch = models.ForeignKey(
        'NotificationBatch',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='notifications'
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'scheduled_for']),
            models.Index(fields=['recipient_user', 'status']),
            models.Index(fields=['recipient_client', 'status']),
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['batch']),
        ]
    
    def __str__(self):
        recipient = self.recipient_name or self.recipient_contact or 'Unknown'
        return f"{self.channel.code} to {recipient} - {self.status}"
    
    def mark_sent(self):
        """Mark notification as sent"""
        self.status = 'sent'
        self.sent_at = timezone.now()
        self.save(update_fields=['status', 'sent_at'])
    
    def mark_delivered(self):
        """Mark notification as delivered"""
        self.status = 'delivered'
        self.delivered_at = timezone.now()
        self.save(update_fields=['status', 'delivered_at'])
    
    def mark_read(self):
        """Mark notification as read (for in-app)"""
        self.status = 'read'
        self.read_at = timezone.now()
        self.save(update_fields=['status', 'read_at'])
    
    def mark_failed(self, error_message: str, should_retry: bool = True):
        """Mark notification as failed"""
        self.status = 'failed'
        self.error_message = error_message
        
        if should_retry and self.retry_count < self.max_retries:
            self.retry_count += 1
            # Exponential backoff
            delay = 60 * (2 ** (self.retry_count - 1))  # 60s, 120s, 240s, etc.
            self.next_retry_at = timezone.now() + timezone.timedelta(seconds=delay)
            self.status = 'pending'  # Reset to pending for retry
        
        self.save(update_fields=['status', 'error_message', 'retry_count', 'next_retry_at'])
    
    def cancel(self):
        """Cancel pending notification"""
        if self.status in ['pending', 'scheduled']:
            self.status = 'cancelled'
            self.cancelled_at = timezone.now()
            self.save(update_fields=['status', 'cancelled_at'])


class NotificationBatch(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Batch processing for bulk notifications
    """
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.PROTECT,
        related_name='batches'
    )
    
    # Batch configuration
    total_recipients = models.IntegerField(default=0)
    batch_size = models.IntegerField(
        default=100,
        help_text="Number to send per batch"
    )
    delay_between_batches = models.IntegerField(
        default=60,
        help_text="Seconds to wait between batches"
    )
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Progress tracking
    sent_count = models.IntegerField(default=0)
    delivered_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    
    # Timing
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Error summary
    error_summary = models.JSONField(default=dict, blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.sent_count}/{self.total_recipients})"
    
    @property
    def progress_percentage(self):
        """Calculate progress percentage"""
        if self.total_recipients == 0:
            return 0
        return (self.sent_count / self.total_recipients) * 100


class NotificationPreference(TimeStampedModel, SoftDeleteModel):
    """
    User/Client notification preferences
    """
    # Who these preferences belong to
    user = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notification_preferences'
    )
    client = models.OneToOneField(
        'clients.Client',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notification_preferences'
    )
    
    # Global preferences
    enabled = models.BooleanField(default=True)
    
    # Channel preferences
    email_enabled = models.BooleanField(default=True)
    sms_enabled = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=False)
    push_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    
    # Category preferences
    category_preferences = models.JSONField(
        default=dict,
        help_text="""
        Per-category channel preferences:
        {
            'transactions': ['sms', 'email', 'in_app'],
            'marketing': ['email'],
            'alerts': ['sms', 'push', 'in_app']
        }
        """
    )
    
    # Quiet hours
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)
    
    # Frequency limits
    max_per_day = models.IntegerField(
        null=True,
        blank=True,
        help_text="Maximum notifications per day (null = unlimited)"
    )
    max_per_category_per_day = models.JSONField(
        default=dict,
        blank=True,
        help_text="{'transactions': 10, 'marketing': 2}"
    )
    
    def should_send(self, channel_code: str, category: str = None) -> tuple[bool, str]:
        """
        Check if notification should be sent based on preferences
        Returns: (should_send, reason)
        """
        if not self.enabled:
            return (False, "Notifications disabled")
        
        # Check channel
        channel_enabled = getattr(self, f'{channel_code}_enabled', True)
        if not channel_enabled:
            return (False, f"{channel_code} disabled")
        
        # Check category preferences
        if category and self.category_preferences:
            allowed_channels = self.category_preferences.get(category, [])
            if allowed_channels and channel_code not in allowed_channels:
                return (False, f"{channel_code} not allowed for {category}")
        
        # Check quiet hours
        if self.quiet_hours_enabled and self.is_quiet_hours():
            return (False, "Quiet hours")
        
        # Check daily limits (would need separate tracking)
        # TODO: Implement daily limit checking with Redis/Cache
        
        return (True, '')
    
    def is_quiet_hours(self) -> bool:
        """Check if currently in quiet hours"""
        if not self.quiet_hours_enabled:
            return False
        
        if not self.quiet_hours_start or not self.quiet_hours_end:
            return False
        
        now = timezone.localtime().time()
        
        if self.quiet_hours_start < self.quiet_hours_end:
            # Same day (e.g., 22:00 - 08:00)
            return self.quiet_hours_start <= now <= self.quiet_hours_end
        else:
            # Crosses midnight (e.g., 22:00 - 08:00)
            return now >= self.quiet_hours_start or now <= self.quiet_hours_end
    
    def __str__(self):
        if self.user:
            return f"Preferences for {self.user.username}"
        if self.client:
            return f"Preferences for {self.client.full_name}"
        return "Notification Preferences"