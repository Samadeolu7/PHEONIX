# notifications/services.py
from django.db import transaction
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType
from typing import Dict, List, Optional, Union
import logging

from .models import (
    Notification, NotificationTemplate, NotificationChannel,
    NotificationBatch, NotificationPreference
)

logger = logging.getLogger(__name__)


def get_in_app_channel():
    """Single lookup point for the 'in_app' NotificationChannel row, used by
    any code path (e.g. threads/signals.py) that creates in-app notifications
    directly rather than through NotificationService.send_from_template.

    The row is now deploy-guaranteed by migration 0004_seed_in_app_channel,
    but callers used to do this lookup independently and silently no-op on a
    miss with no log trace at all — logging a warning here means a
    misconfigured/deactivated channel is at least visible in logs instead of
    notifications just silently never arriving.
    """
    channel = NotificationChannel.objects.filter(code='in_app', is_active=True).first()
    if not channel:
        logger.warning(
            "No active 'in_app' NotificationChannel found — in-app notifications "
            "will not be created until one exists (see migration 0004_seed_in_app_channel)."
        )
    return channel


class NotificationService:
    """
    Main service for creating and sending notifications
    """
    
    @transaction.atomic
    def send_from_template(
        self,
        template_code: str,
        recipient,
        context: dict,
        owner,
        branch,
        created_by=None,
        related_object=None,
        priority: str = None,
        scheduled_for=None,
        channels: List[str] = None
    ) -> List[Notification]:
        """
        Send notification(s) from a template
        
        Args:
            template_code: Template code to use
            recipient: User, Client, or dict with contact info
            context: Variables for template rendering
            owner: Owner user
            branch: Branch
            created_by: User creating the notification
            related_object: Related model instance
            priority: Override default priority
            scheduled_for: Schedule for future sending
            channels: Specific channels to use (overrides template default)
        
        Returns:
            List of created Notification instances
        """
        # Get template
        try:
            template = NotificationTemplate.objects.get(
                code=template_code,
                branch=branch,
                is_active=True
            )
        except NotificationTemplate.DoesNotExist:
            logger.error(f"Template {template_code} not found")
            return []
        
        # Validate template variables
        is_valid, missing = template.validate_variables(context)
        if not is_valid:
            logger.error(f"Missing required variables: {missing}")
            raise ValueError(f"Missing required variables: {missing}")
        
        # Check if should send based on conditions
        should_send, reason = template.should_send(context)
        if not should_send:
            logger.info(f"Notification not sent: {reason}")
            return []
        
        # Extract recipient info
        recipient_data = self._extract_recipient_data(recipient)
        
        # Check recipient preferences
        if recipient_data.get('user') or recipient_data.get('client'):
            prefs = self._get_preferences(
                recipient_data.get('user'),
                recipient_data.get('client')
            )
            if prefs:
                # Will check per-channel when creating notifications
                pass
        
        # Determine channels to use
        if channels:
            channel_configs = template.channel_configs.filter(
                channel__code__in=channels,
                is_active=True
            )
        else:
            channel_configs = template.channel_configs.filter(is_active=True)
        
        # Create notifications for each channel
        notifications = []
        for config in channel_configs:
            # Check preferences for this channel
            if prefs:
                should_send_channel, pref_reason = prefs.should_send(
                    config.channel.code,
                    template.category
                )
                if not should_send_channel:
                    logger.info(
                        f"Skipping {config.channel.code} for {recipient_data.get('name')}: {pref_reason}"
                    )
                    continue
            
            # Render content
            rendered = config.render(context)
            
            # Create notification
            notification = self._create_notification(
                template=template,
                channel=config.channel,
                recipient_data=recipient_data,
                subject=rendered['subject'],
                message=rendered['body'],
                html_message=rendered.get('html', ''),
                context_data=context,
                owner=owner,
                branch=branch,
                created_by=created_by,
                related_object=related_object,
                priority=priority or template.default_priority,
                scheduled_for=scheduled_for,
                tenant=getattr(owner, 'tenant', None)
            )
            
            notifications.append(notification)
        
        # Update template usage
        template.usage_count += len(notifications)
        template.last_used_at = timezone.now()
        template.save(update_fields=['usage_count', 'last_used_at'])
        
        # Queue for sending
        for notification in notifications:
            self._queue_notification(notification)
        
        return notifications
    
    def _extract_recipient_data(self, recipient) -> dict:
        """Extract recipient information from various input types"""
        from users.models import User
        from clients.models import Client
        
        data = {
            'user': None,
            'client': None,
            'contact': '',
            'name': ''
        }
        
        if isinstance(recipient, User):
            data['user'] = recipient
            data['contact'] = recipient.email or ''
            data['name'] = recipient.get_full_name() or recipient.username
        elif isinstance(recipient, Client):
            data['client'] = recipient
            data['contact'] = recipient.email or recipient.phone_primary or ''
            data['name'] = recipient.full_name
        elif isinstance(recipient, dict):
            data['contact'] = recipient.get('email') or recipient.get('phone', '')
            data['name'] = recipient.get('name', '')
        
        return data
    
    def _get_preferences(self, user=None, client=None) -> Optional[NotificationPreference]:
        """Get notification preferences for user or client"""
        try:
            if user:
                return NotificationPreference.objects.get(user=user)
            elif client:
                return NotificationPreference.objects.get(client=client)
        except NotificationPreference.DoesNotExist:
            return None
    
    def _create_notification(
        self,
        template,
        channel,
        recipient_data,
        subject,
        message,
        html_message,
        context_data,
        owner,
        branch,
        created_by,
        related_object,
        priority,
        scheduled_for,
        tenant=None
    ) -> Notification:
        """Create a notification instance"""
        # Set related object
        content_type = None
        object_id = None
        if related_object:
            content_type = ContentType.objects.get_for_model(related_object)
            object_id = str(related_object.pk)
        
        notification = Notification.objects.create(
            template=template,
            channel=channel,
            recipient_user=recipient_data.get('user'),
            recipient_client=recipient_data.get('client'),
            recipient_contact=recipient_data.get('contact'),
            recipient_name=recipient_data.get('name'),
            subject=subject,
            message=message,
            html_message=html_message,
            context_data=context_data,
            priority=priority,
            scheduled_for=scheduled_for or timezone.now(),
            status='scheduled' if scheduled_for and scheduled_for > timezone.now() else 'pending',
            content_type=content_type,
            object_id=object_id,
            cost=channel.cost_per_unit,
            owner=owner,
            branch=branch,
            created_by=created_by,
            tenant=tenant
        )
        
        return notification
    
    def _queue_notification(self, notification: Notification):
        """Queue notification for sending"""
        # If immediate, send now
        if notification.status == 'pending':
            transaction.on_commit(
                lambda: self._send_notification_async(notification.id)
            )
        # If scheduled, will be picked up by scheduler
    
    def _send_notification_async(self, notification_id: int):
        """Queue notification for async sending (Celery task)"""
        from .tasks import send_notification_task
        send_notification_task.apply_async(args=[notification_id], countdown=1)
    
    def send_bulk(
        self,
        template_code: str,
        recipients: List,
        context_generator,
        owner,
        branch,
        created_by=None,
        batch_name: str = None,
        batch_size: int = 100,
        delay_between_batches: int = 60,
        tenant=None
    ) -> NotificationBatch:
        """
        Send notifications to multiple recipients
        
        Args:
            template_code: Template to use
            recipients: List of recipients (Users, Clients, or dicts)
            context_generator: Function that takes recipient and returns context dict
            owner: Owner user
            branch: Branch
            created_by: User creating notifications
            batch_name: Name for the batch
            batch_size: Number per batch
            delay_between_batches: Seconds between batches
        
        Returns:
            NotificationBatch instance
        """
        # Get template
        template = NotificationTemplate.objects.get(
            code=template_code,
            branch=branch,
            is_active=True
        )
        
        # Create batch
        batch = NotificationBatch.objects.create(
            name=batch_name or f"Bulk {template.name}",
            template=template,
            total_recipients=len(recipients),
            batch_size=batch_size,
            delay_between_batches=delay_between_batches,
            owner=owner,
            branch=branch,
            created_by=created_by,
            tenant=tenant
        )
        
        # Queue batch processing
        transaction.on_commit(
            lambda: self._process_batch_async(batch.id, recipients, context_generator)
        )
        
        return batch
    
    def _process_batch_async(self, batch_id: int, recipients: List, context_generator):
        """Queue batch processing (Celery task)"""
        from .tasks import process_notification_batch_task
        process_notification_batch_task.apply_async(
            args=[batch_id, recipients, context_generator],
            countdown=5
        )


class NotificationSender:
    """
    Handles actual sending of notifications to providers
    """
    
    def __init__(self):
        self.providers = {}
        self._load_providers()
    
    def _load_providers(self):
        """Load and initialize providers"""
        from .providers import (
            EmailProvider, SMSProvider, WhatsAppProvider,
            PushProvider, InAppProvider
        )
        
        self.providers = {
            'email': EmailProvider(),
            'sms': SMSProvider(),
            'whatsapp': WhatsAppProvider(),
            'push': PushProvider(),
            'in_app': InAppProvider(),
        }
    
    def send(self, notification: Notification) -> bool:
        """
        Send a notification
        
        Returns:
            True if sent successfully, False otherwise
        """
        channel_code = notification.channel.code
        
        # Get provider
        provider = self.providers.get(channel_code)
        if not provider:
            notification.mark_failed(f"No provider for channel {channel_code}", should_retry=False)
            return False
        
        try:
            # Mark as sending
            notification.status = 'sending'
            notification.save(update_fields=['status'])
            
            # Send via provider
            result = provider.send(
                recipient=notification.recipient_contact,
                subject=notification.subject,
                message=notification.message,
                html_message=notification.html_message,
                channel_config=notification.channel.provider_config
            )
            
            # Update notification with result
            if result['success']:
                notification.provider_message_id = result.get('message_id', '')
                notification.provider_response = result
                notification.mark_sent()
                
                # If provider confirms delivery immediately
                if result.get('delivered'):
                    notification.mark_delivered()
                
                return True
            else:
                notification.mark_failed(
                    result.get('error', 'Unknown error'),
                    should_retry=result.get('retryable', True)
                )
                return False
        
        except Exception as e:
            logger.exception(f"Error sending notification {notification.id}")
            notification.mark_failed(str(e), should_retry=True)
            return False
    
    def check_delivery_status(self, notification: Notification):
        """Check delivery status with provider"""
        channel_code = notification.channel.code
        provider = self.providers.get(channel_code)
        
        if not provider or not notification.provider_message_id:
            return
        
        try:
            status = provider.check_status(
                message_id=notification.provider_message_id,
                channel_config=notification.channel.provider_config
            )
            
            if status.get('delivered'):
                notification.mark_delivered()
            elif status.get('failed'):
                notification.mark_failed(status.get('error', 'Delivery failed'), should_retry=False)
        
        except Exception as e:
            logger.exception(f"Error checking delivery status for {notification.id}")


class NotificationRetryService:
    """
    Handles retry logic for failed notifications
    """
    
    def retry_failed(self, max_age_hours: int = 24):
        """
        Retry failed notifications within age limit
        
        Args:
            max_age_hours: Maximum age of notifications to retry
        """
        cutoff = timezone.now() - timezone.timedelta(hours=max_age_hours)
        
        failed_notifications = Notification.objects.filter(
            status='pending',
            next_retry_at__lte=timezone.now(),
            created_at__gte=cutoff
        ).select_related('channel')
        
        sender = NotificationSender()
        
        for notification in failed_notifications:
            logger.info(f"Retrying notification {notification.id} (attempt {notification.retry_count + 1})")
            sender.send(notification)
    
    def cleanup_old(self, days: int = 90):
        """
        Clean up old notifications
        
        Args:
            days: Age threshold for cleanup
        """
        cutoff = timezone.now() - timezone.timedelta(days=days)
        
        # Soft delete old notifications
        old_notifications = Notification.objects.filter(
            created_at__lt=cutoff,
            status__in=['sent', 'delivered', 'read', 'failed', 'cancelled']
        )
        
        count = old_notifications.update(is_deleted=True)
        logger.info(f"Cleaned up {count} old notifications")