import logging
from typing import Any, Dict, List, Optional
from django.db import models
from django.dispatch import Signal, receiver
from django.utils import timezone
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel

from .models import AutomationTemplate, AutomationRun

logger = logging.getLogger(__name__)

# Define domain events as signals
workflow_event = Signal()  # Generic workflow event signal


class EventTrigger(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines event-based triggers for automation templates.
    Examples: withdrawal, deposit, account_created, payment_received
    """
    EVENT_TYPES = [
        ('transaction', 'Transaction Event'),
        ('account', 'Account Event'),
        ('user', 'User Event'),
        ('custom', 'Custom Event'),
    ]
    
    template = models.ForeignKey(
        'AutomationTemplate',
        on_delete=models.CASCADE,
        related_name='event_triggers'
    )
    event_type = models.CharField(max_length=50, choices=EVENT_TYPES)
    event_name = models.CharField(
        max_length=100,
        help_text="Specific event name, e.g., 'withdrawal', 'deposit'"
    )
    entity_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Model name to listen to, e.g., 'Transaction', 'Account'"
    )
    
    # Filtering conditions
    filter_conditions = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        JSON conditions to filter which events trigger this automation.
        Example: {"product_type": "premium_savings", "amount__gt": 1000}
        """
    )
    
    # Field mapping - maps event data to workflow context
    field_mappings = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Maps event data fields to workflow context variables.
        Example: {"transaction.amount": "withdrawal_amount", "account.id": "account_id"}
        """
    )
    
    active = models.BooleanField(default=True)
    
    class Meta:
        unique_together = [('template', 'event_name')]
        indexes = [
            models.Index(fields=['event_type', 'event_name', 'active']),
        ]
    
    def __str__(self):
        return f"{self.template.name} - {self.event_name}"
    
    def matches_event(self, event_data: Dict[str, Any]) -> bool:
        """
        Check if event data matches this trigger's filter conditions.
        """
        if not self.active:
            return False
        
        for field_path, expected_value in self.filter_conditions.items():
            # Support Django-style lookups like "amount__gt"
            actual_value = self._get_nested_value(event_data, field_path)
            
            if '__' in field_path:
                field, lookup = field_path.rsplit('__', 1)
                actual_value = self._get_nested_value(event_data, field)
                
                if not self._apply_lookup(actual_value, lookup, expected_value):
                    return False
            else:
                if actual_value != expected_value:
                    return False
        
        return True
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """Get value from nested dict using dot notation."""
        parts = path.split('.')
        value = data
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return None
        return value
    
    def _apply_lookup(self, value: Any, lookup: str, expected: Any) -> bool:
        """Apply Django-style field lookups."""
        lookups = {
            'gt': lambda v, e: v > e,
            'gte': lambda v, e: v >= e,
            'lt': lambda v, e: v < e,
            'lte': lambda v, e: v <= e,
            'in': lambda v, e: v in e,
            'contains': lambda v, e: e in str(v),
            'icontains': lambda v, e: e.lower() in str(v).lower(),
            'startswith': lambda v, e: str(v).startswith(e),
            'endswith': lambda v, e: str(v).endswith(e),
        }
        
        lookup_fn = lookups.get(lookup)
        if lookup_fn:
            try:
                return lookup_fn(value, expected)
            except (TypeError, AttributeError):
                return False
        return value == expected
    
    def map_event_to_context(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform event data into workflow context using field mappings.
        """
        context = {}
        for source_path, target_key in self.field_mappings.items():
            value = self._get_nested_value(event_data, source_path)
            if value is not None:
                context[target_key] = value
        
        # Include all event data under 'trigger' key
        context['trigger'] = event_data
        context['trigger_type'] = 'event'
        context['event_name'] = self.event_name
        
        return context
    
    def trigger_automation(self, event_data: Dict[str, Any]) -> Optional['AutomationRun']:
        """
        Create and start an automation run from this event.
        """
        if not self.matches_event(event_data):
            logger.debug(f"Event does not match trigger conditions: {self.event_name}")
            return None
        
        from automations.models import AutomationRun
        
        context = self.map_event_to_context(event_data)
        
        try:
            run = AutomationRun.objects.create(
                template=self.template,
                current_step=self.template.initial_step,
                parameters=context,
                scheduled_at=timezone.now(),
                owner=self.owner,
                created_by=self.created_by
            )
            logger.info(f"Created automation run {run.run_reference} from event {self.event_name}")
            return run
        except Exception as e:
            logger.exception(f"Failed to create automation run from event: {e}")
            return None
