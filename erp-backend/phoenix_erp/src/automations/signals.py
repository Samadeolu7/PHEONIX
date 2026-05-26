from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def trigger_workflow_from_event(event_name: str, event_data: dict, tenant):
    """
    Helper function to trigger workflows from domain events.
    Call this from your transaction/account views or other places where events occur.
    
    Example usage:
        trigger_workflow_from_event(
            event_name='withdrawal',
            event_data={
                'account_id': account.id,
                'amount': amount,
                'transaction_id': transaction.id,
                'product_type': account.product_type,
            },
            tenant=request.user.tenant
        )
    """
    from automations.models import EventTrigger
    
    # Find all active event triggers for this event
    triggers = EventTrigger.objects.filter(
        event_name=event_name,
        active=True,
        owner=tenant
    )
    
    runs_created = []
    for trigger in triggers:
        try:
            run = trigger.trigger_automation(event_data)
            if run:
                runs_created.append(run)
                logger.info(f"Triggered workflow {trigger.template.name} from event {event_name}")
        except Exception as e:
            logger.exception(f"Failed to trigger workflow from event {event_name}: {e}")
    
    return runs_created


# Example: Auto-trigger workflows on transaction creation
@receiver(post_save, sender='transactions.Transaction')
def handle_transaction_created(sender, instance, created, **kwargs):
    """
    Example signal handler that triggers workflows when transactions are created.
    Customize this based on your Transaction model.
    """
    if not created:
        return
    
    # Build event data from transaction
    event_data = {
        'transaction_id': instance.id,
        'account_id': instance.account_id if hasattr(instance, 'account_id') else None,
        'amount': float(instance.amount) if hasattr(instance, 'amount') else 0,
        'transaction_type': instance.transaction_type if hasattr(instance, 'transaction_type') else 'unknown',
        'timestamp': instance.created_at.isoformat(),
    }
    
    # Determine event name based on transaction type
    event_name = event_data.get('transaction_type', 'transaction_created')
    
    # Trigger any matching workflows
    trigger_workflow_from_event(
        event_name=event_name,
        event_data=event_data,
        tenant=instance.owner
    )
