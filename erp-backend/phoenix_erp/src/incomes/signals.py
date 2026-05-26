# incomes/signals.py
"""
Signal handlers for automatic workflow triggers related to income/fees
Integrates with the automation system for workflow execution
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import transaction
from decimal import Decimal
import logging

from .models import (
    Income, Invoice, FeeEntitlement, 
    PaymentPlanInstallment, EntitlementPaymentLog
)
from automations.models import WorkflowRun, WorkflowBinding

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Invoice)
def trigger_invoice_workflow(sender, instance, created, **kwargs):
    """
    Trigger workflow when invoice is created or status changes
    
    Workflows triggered:
    - invoice_created: New invoice generated
    - invoice_sent: Invoice sent to client
    - invoice_paid: Invoice fully paid
    - invoice_overdue: Invoice becomes overdue
    """
    if created:
        # Trigger invoice_created workflow
        trigger_workflow_for_event(
            event_name='invoice_created',
            entity=instance,
            context_data={
                'invoice_id': instance.id,
                'invoice_number': instance.invoice_number,
                'client_id': instance.client_id,
                'amount': str(instance.amount),
                'due_date': instance.due_date.isoformat(),
                'has_fee_structure': bool(instance.fee_structure_id),
                'has_inventory_allocation': bool(instance.inventory_allocation_id),
            }
        )
    else:
        # Check for status changes (we'll track previous status manually in the future)
        # For now, just trigger on specific statuses
        if instance.status == 'sent':
            trigger_workflow_for_event(
                event_name='invoice_sent',
                entity=instance,
                context_data={
                    'invoice_id': instance.id,
                    'invoice_number': instance.invoice_number,
                    'client_id': instance.client_id,
                }
            )
        
        elif instance.status == 'paid':
            trigger_workflow_for_event(
                event_name='invoice_paid',
                entity=instance,
                context_data={
                    'invoice_id': instance.id,
                    'invoice_number': instance.invoice_number,
                    'client_id': instance.client_id,
                    'amount_paid': str(instance.amount_paid),
                }
            )


@receiver(post_save, sender=FeeEntitlement)
def trigger_entitlement_workflow(sender, instance, created, **kwargs):
    """
    Trigger workflow when entitlement is created or status changes
    
    Workflows triggered:
    - entitlement_created: New entitlement created
    - entitlement_activated: Entitlement becomes active (minimum payment met)
    - entitlement_suspended: Entitlement suspended
    - entitlement_completed: Entitlement fully paid/completed
    - inventory_redemption_ready: Inventory items ready for redemption
    """
    if created:
        # Trigger entitlement_created workflow
        trigger_workflow_for_event(
            event_name='entitlement_created',
            entity=instance,
            context_data={
                'entitlement_id': instance.id,
                'client_id': instance.client_id,
                'fee_structure_id': instance.fee_structure_id,
                'payment_term_type': instance.payment_term_type,
                'total_amount': str(instance.total_amount),
                'minimum_required': str(instance.minimum_required),
                'has_inventory_allocation': bool(instance.inventory_allocation_id),
                'academic_period': instance.academic_period,
            }
        )
        
        # If inventory allocation exists, trigger inventory setup workflow
        if instance.inventory_allocation_id:
            trigger_workflow_for_event(
                event_name='inventory_allocation_linked',
                entity=instance,
                context_data={
                    'entitlement_id': instance.id,
                    'allocation_id': instance.inventory_allocation_id,
                    'client_id': instance.client_id,
                }
            )
    
    else:
        # Check for status changes (simplified without field tracker)
        # In production, consider adding django-model-utils FieldTracker
        
        if instance.status == 'active':
            # Minimum payment requirement met
            trigger_workflow_for_event(
                event_name='entitlement_activated',
                entity=instance,
                context_data={
                    'entitlement_id': instance.id,
                    'client_id': instance.client_id,
                    'amount_paid': str(instance.amount_paid),
                    'access_level': instance.current_access_level,
                    'can_redeem_inventory': bool(instance.inventory_allocation_id),
                }
            )
            
            # If inventory allocation exists and payment threshold met, notify
            if instance.inventory_allocation_id and instance.meets_minimum_requirement:
                trigger_workflow_for_event(
                    event_name='inventory_redemption_ready',
                    entity=instance,
                    context_data={
                        'entitlement_id': instance.id,
                        'allocation_id': instance.inventory_allocation_id,
                        'client_id': instance.client_id,
                        'client_name': instance.client.full_name,
                    }
                )
        
        elif instance.status == 'suspended':
            trigger_workflow_for_event(
                event_name='entitlement_suspended',
                entity=instance,
                context_data={
                    'entitlement_id': instance.id,
                    'client_id': instance.client_id,
                    'reason': 'Payment overdue or insufficient',
                }
            )
        
        elif instance.status == 'completed':
            trigger_workflow_for_event(
                event_name='entitlement_completed',
                entity=instance,
                context_data={
                    'entitlement_id': instance.id,
                    'client_id': instance.client_id,
                    'final_amount_paid': str(instance.amount_paid),
                }
            )


@receiver(post_save, sender=EntitlementPaymentLog)
def trigger_payment_received_workflow(sender, instance, created, **kwargs):
    """
    Trigger workflow when payment is recorded
    
    Workflows triggered:
    - payment_received: Payment recorded for entitlement
    - payment_milestone_reached: Payment reaches certain threshold (25%, 50%, 75%, 100%)
    """
    if created:
        entitlement = instance.entitlement
        
        # Trigger payment_received workflow
        trigger_workflow_for_event(
            event_name='payment_received',
            entity=entitlement,
            context_data={
                'entitlement_id': entitlement.id,
                'payment_id': instance.id,
                'client_id': entitlement.client_id,
                'amount': str(instance.amount),
                'balance_after': str(instance.balance_after),
                'payment_percentage': str(entitlement.payment_percentage),
                'payment_date': instance.payment_date.isoformat(),
            }
        )
        
        # Check for milestone thresholds
        payment_pct = entitlement.payment_percentage
        milestones = [25, 50, 75, 100]
        
        for milestone in milestones:
            # Check if we just crossed this milestone
            previous_pct = ((entitlement.amount_paid - instance.amount) / entitlement.total_amount * 100) if entitlement.total_amount > 0 else 0
            
            if payment_pct >= milestone and previous_pct < milestone:
                trigger_workflow_for_event(
                    event_name='payment_milestone_reached',
                    entity=entitlement,
                    context_data={
                        'entitlement_id': entitlement.id,
                        'client_id': entitlement.client_id,
                        'milestone': milestone,
                        'amount_paid': str(entitlement.amount_paid),
                        'total_amount': str(entitlement.total_amount),
                    }
                )
                break


@receiver(post_save, sender=PaymentPlanInstallment)
def trigger_installment_workflow(sender, instance, created, **kwargs):
    """
    Trigger workflow for installment events
    
    Workflows triggered:
    - installment_paid: Installment marked as paid
    - installment_overdue: Installment becomes overdue
    """
    if not created:
        # Check if installment just became paid or overdue
        if instance.status == 'paid':
            trigger_workflow_for_event(
                event_name='installment_paid',
                entity=instance.payment_plan.entitlement,
                context_data={
                    'installment_id': instance.id,
                    'installment_number': instance.installment_number,
                    'payment_plan_id': instance.payment_plan_id,
                    'entitlement_id': instance.payment_plan.entitlement_id,
                    'client_id': instance.payment_plan.entitlement.client_id,
                    'amount_paid': str(instance.amount_paid),
                }
            )
        
        # Check if installment became overdue
        if instance.status == 'overdue':
            trigger_workflow_for_event(
                event_name='installment_overdue',
                entity=instance.payment_plan.entitlement,
                context_data={
                    'installment_id': instance.id,
                    'installment_number': instance.installment_number,
                    'payment_plan_id': instance.payment_plan_id,
                    'entitlement_id': instance.payment_plan.entitlement_id,
                    'client_id': instance.payment_plan.entitlement.client_id,
                    'amount_due': str(instance.amount_due),
                    'due_date': instance.due_date.isoformat(),
                }
            )


@receiver(post_save, sender=Income)
def trigger_income_workflow(sender, instance, created, **kwargs):
    """
    Trigger workflow when income is recorded
    
    Workflows triggered:
    - income_recorded: New income transaction recorded
    - income_paid: Income marked as paid
    """
    if created:
        trigger_workflow_for_event(
            event_name='income_recorded',
            entity=instance,
            context_data={
                'income_id': instance.id,
                'reference_number': instance.reference_number,
                'client_id': instance.client_id,
                'category_id': instance.category_id,
                'amount': str(instance.amount),
                'income_date': instance.income_date.isoformat(),
                'has_inventory_allocation': bool(instance.inventory_allocation_id),
            }
        )
    else:
        # Check if income became fully paid
        if instance.status == 'paid':
            trigger_workflow_for_event(
                event_name='income_paid',
                entity=instance,
                context_data={
                    'income_id': instance.id,
                    'reference_number': instance.reference_number,
                    'client_id': instance.client_id,
                    'amount_paid': str(instance.amount_paid),
                }
            )


def trigger_workflow_for_event(event_name: str, entity, context_data: dict):
    """
    Helper function to trigger workflows for a given event
    
    Args:
        event_name: Name of the event to trigger
        entity: The model instance that triggered the event
        context_data: Additional context data for the workflow
    """
    try:
        # Find active workflow bindings for this event
        bindings = WorkflowBinding.objects.filter(
            form_schema__trigger_event_name=event_name,
            is_active=True,
            owner=entity.owner,
            branch=entity.branch
        ).select_related('workflow_template', 'form_schema')
        
        for binding in bindings:
            # Check if conditions match (if any)
            if hasattr(binding, 'conditions') and binding.conditions:
                # Note: evaluate_binding_conditions needs to be implemented
                # For now, we'll skip condition checking
                pass
            
            # Create workflow run
            try:
                workflow_run = WorkflowRun.objects.create(
                    template=binding.workflow_template,
                    binding=binding,
                    form_submission=None,  # Not from form submission
                    context={
                        'event_name': event_name,
                        'entity_type': entity.__class__.__name__,
                        'entity_id': entity.id,
                        **context_data
                    },
                    status='queued',
                    owner=entity.owner,
                    branch=entity.branch,
                    created_by=getattr(entity, 'created_by', entity.owner)
                )
                
                logger.info(
                    f"Workflow triggered: {binding.workflow_template.name} "
                    f"for event {event_name} (Run ID: {workflow_run.id})"
                )
                
                # Execute workflow asynchronously (if celery is available)
                # Otherwise execute synchronously
                try:
                    from .tasks import execute_workflow_async
                    execute_workflow_async.delay(workflow_run.id)
                except ImportError:
                    # Execute synchronously if celery not available
                    from automations.workflow_engine import WorkflowExecutionEngine
                    engine = WorkflowExecutionEngine(workflow_run)
                    engine.execute()
                    
            except Exception as e:
                logger.error(
                    f"Failed to create/execute workflow run for {event_name}: {str(e)}",
                    exc_info=True
                )
    
    except Exception as e:
        logger.error(
            f"Error in trigger_workflow_for_event for {event_name}: {str(e)}",
            exc_info=True
        )


def evaluate_binding_conditions(conditions: dict, entity, context_data: dict) -> bool:
    """
    Evaluate binding conditions to determine if workflow should run
    
    Args:
        conditions: Conditions from WorkflowBinding
        entity: The entity that triggered the event
        context_data: Context data for evaluation
        
    Returns:
        True if conditions are met, False otherwise
    """
    try:
        # Simple condition evaluation
        # Can be extended for more complex logic
        
        for key, expected_value in conditions.items():
            # Check entity attributes
            if hasattr(entity, key):
                actual_value = getattr(entity, key)
                if actual_value != expected_value:
                    return False
            
            # Check context data
            elif key in context_data:
                if context_data[key] != expected_value:
                    return False
            
            else:
                # Condition key not found
                return False
        
        return True
        
    except Exception as e:
        logger.error(f"Error evaluating binding conditions: {str(e)}")
        return False
