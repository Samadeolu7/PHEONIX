# notifications/tasks.py
from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_notification_task(self, notification_id: int):
    """
    Send a single notification
    """
    from .models import Notification
    from .services import NotificationSender
    
    try:
        notification = Notification.objects.select_related('channel').get(id=notification_id)
        
        # Check if already sent
        if notification.status not in ['pending', 'failed']:
            logger.info(f"Notification {notification_id} already {notification.status}")
            return
        
        # Send
        sender = NotificationSender()
        success = sender.send(notification)
        
        if not success and notification.retry_count < notification.max_retries:
            # Retry with exponential backoff
            retry_delay = 60 * (2 ** notification.retry_count)
            raise self.retry(countdown=retry_delay)
        
        return success
    
    except Notification.DoesNotExist:
        logger.error(f"Notification {notification_id} not found")
        return False
    
    except Exception as e:
        logger.exception(f"Error sending notification {notification_id}")
        raise self.retry(exc=e, countdown=60)


@shared_task
def process_scheduled_notifications():
    """
    Process notifications scheduled for sending
    Run this task every minute via Celery Beat
    """
    from .models import Notification
    
    # Get scheduled notifications due for sending
    due_notifications = Notification.objects.filter(
        status='scheduled',
        scheduled_for__lte=timezone.now()
    ).select_related('channel')[:100]  # Limit batch size
    
    count = 0
    for notification in due_notifications:
        # Update status to pending
        notification.status = 'pending'
        notification.save(update_fields=['status'])
        
        # Queue for sending
        send_notification_task.apply_async(args=[notification.id], countdown=1)
        count += 1
    
    logger.info(f"Queued {count} scheduled notifications for sending")
    return count


@shared_task
def process_notification_batch_task(batch_id: int, recipients: list, context_generator):
    """
    Process a batch of notifications
    
    Args:
        batch_id: NotificationBatch ID
        recipients: List of recipients
        context_generator: Function to generate context for each recipient
    """
    from .models import NotificationBatch, Notification
    from .services import NotificationService
    
    try:
        batch = NotificationBatch.objects.select_related('template').get(id=batch_id)
        
        # Mark as processing
        batch.status = 'processing'
        batch.started_at = timezone.now()
        batch.save(update_fields=['status', 'started_at'])
        
        service = NotificationService()
        batch_size = batch.batch_size
        delay = batch.delay_between_batches
        
        # Process in batches
        for i in range(0, len(recipients), batch_size):
            batch_recipients = recipients[i:i + batch_size]
            
            for recipient in batch_recipients:
                try:
                    # Generate context for this recipient
                    context = context_generator(recipient)
                    
                    # Send notification
                    notifications = service.send_from_template(
                        template_code=batch.template.code,
                        recipient=recipient,
                        context=context,
                        owner=batch.owner,
                        branch=batch.branch,
                        created_by=batch.created_by
                    )
                    
                    # Link to batch
                    for notification in notifications:
                        notification.batch = batch
                        notification.save(update_fields=['batch'])
                    
                    # Update counts
                    batch.sent_count += len(notifications)
                    batch.save(update_fields=['sent_count'])
                
                except Exception as e:
                    logger.exception(f"Error sending to recipient in batch {batch_id}")
                    batch.failed_count += 1
                    batch.save(update_fields=['failed_count'])
            
            # Delay between batches (except last batch)
            if i + batch_size < len(recipients):
                import time
                time.sleep(delay)
        
        # Mark as completed
        batch.status = 'completed'
        batch.completed_at = timezone.now()
        batch.save(update_fields=['status', 'completed_at'])
        
        logger.info(f"Completed batch {batch_id}: {batch.sent_count} sent, {batch.failed_count} failed")
        return True
    
    except NotificationBatch.DoesNotExist:
        logger.error(f"Batch {batch_id} not found")
        return False
    
    except Exception as e:
        logger.exception(f"Error processing batch {batch_id}")
        
        # Mark batch as failed
        try:
            batch = NotificationBatch.objects.get(id=batch_id)
            batch.status = 'failed'
            batch.error_summary = {'error': str(e)}
            batch.save(update_fields=['status', 'error_summary'])
        except:
            pass
        
        return False


@shared_task
def retry_failed_notifications():
    """
    Retry failed notifications
    Run this task every 5 minutes via Celery Beat
    """
    from .services import NotificationRetryService
    
    service = NotificationRetryService()
    service.retry_failed(max_age_hours=24)


@shared_task
def check_delivery_statuses():
    """
    Check delivery status for sent notifications
    Run this task every 10 minutes via Celery Beat
    """
    from .models import Notification
    from .services import NotificationSender
    
    # Get notifications sent but not yet delivered
    pending_notifications = Notification.objects.filter(
        status='sent',
        sent_at__gte=timezone.now() - timezone.timedelta(hours=24)
    ).select_related('channel')[:100]
    
    sender = NotificationSender()
    
    for notification in pending_notifications:
        try:
            sender.check_delivery_status(notification)
        except Exception as e:
            logger.exception(f"Error checking delivery status for {notification.id}")
    
    logger.info(f"Checked delivery status for {len(pending_notifications)} notifications")


@shared_task
def cleanup_old_notifications():
    """
    Clean up old notifications
    Run this task daily via Celery Beat
    """
    from .services import NotificationRetryService
    
    service = NotificationRetryService()
    service.cleanup_old(days=90)


@shared_task
def update_template_success_rates():
    """
    Update success rates for notification templates
    Run this task daily via Celery Beat
    """
    from .models import NotificationTemplate
    from django.db.models import Count, Q
    
    templates = NotificationTemplate.objects.filter(is_active=True)
    
    for template in templates:
        total = template.notifications.count()
        if total > 0:
            successful = template.notifications.filter(
                Q(status='delivered') | Q(status='read')
            ).count()
            
            success_rate = (successful / total) * 100
            template.success_rate = success_rate
            template.save(update_fields=['success_rate'])
    
    logger.info(f"Updated success rates for {templates.count()} templates")