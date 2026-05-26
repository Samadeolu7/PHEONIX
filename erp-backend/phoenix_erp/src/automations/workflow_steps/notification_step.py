# automations/steps/notification_step.py
"""
Notification step handler for workflows
"""
from typing import Dict, Any
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


class NotificationStepHandler:
    """
    Handles notification steps in workflows
    
    Step configuration example:
    {
        'id': 'send_confirmation',
        'name': 'Send Transaction Confirmation',
        'type': 'notification',
        'config': {
            'template_code': 'transaction_receipt',
            'recipient_source': 'client',  // or 'user', 'custom'
            'recipient_field': 'form.client_id',  // if recipient_source is custom
            'channels': ['sms', 'email'],  // optional, uses template default if not specified
            'priority': 'high',  // optional
            'schedule': {
                'type': 'immediate',  // or 'delayed', 'scheduled'
                'delay_seconds': 300,  // if type is 'delayed'
                'send_at': '${form.scheduled_time}'  // if type is 'scheduled'
            },
            'context_mapping': {
                'client_name': '${client.full_name}',
                'transaction_ref': '${step_create_transaction.reference_number}',
                'amount': '${form.amount}',
                'balance': '${step_create_transaction.account_balance}',
                'transaction_date': '${form.transaction_date}'
            },
            'conditional': {  // optional
                'field': 'form.amount',
                'operator': '>',
                'value': 1000
            }
        },
        'next': 'update_client_status',
        'on_error': 'log_error'
    }
    """
    
    def execute(
        self,
        step_config: Dict[str, Any],
        workflow_run,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute notification step
        
        Returns:
            {
                'success': bool,
                'notification_ids': [list of created notification IDs],
                'error': str (if failed)
            }
        """
        from notifications.services import NotificationService
        from clients.models import Client
        from users.models import User
        
        config = step_config.get('config', {})
        
        # Check conditional (if specified)
        if 'conditional' in config:
            if not self._evaluate_conditional(config['conditional'], context):
                logger.info(f"Notification step {step_config['id']} skipped due to conditional")
                return {
                    'success': True,
                    'skipped': True,
                    'reason': 'Conditional not met'
                }
        
        # Get template code
        template_code = config.get('template_code')
        if not template_code:
            return {
                'success': False,
                'error': 'template_code is required'
            }
        
        # Resolve recipient
        recipient = self._resolve_recipient(config, context, workflow_run)
        if not recipient:
            return {
                'success': False,
                'error': 'Could not resolve recipient'
            }
        
        # Build notification context from mapping
        notification_context = self._build_context(
            config.get('context_mapping', {}),
            context
        )
        
        # Determine scheduling
        scheduled_for = self._resolve_schedule(config.get('schedule', {}), context)
        
        # Get channels (optional)
        channels = config.get('channels')
        
        # Get priority (optional)
        priority = config.get('priority')
        
        # Send notification
        try:
            service = NotificationService()
            notifications = service.send_from_template(
                template_code=template_code,
                recipient=recipient,
                context=notification_context,
                owner=workflow_run.owner,
                branch=workflow_run.branch,
                created_by=workflow_run.created_by,
                related_object=workflow_run,
                priority=priority,
                scheduled_for=scheduled_for,
                channels=channels
            )
            
            return {
                'success': True,
                'notification_ids': [n.id for n in notifications],
                'notification_count': len(notifications),
                'scheduled_for': scheduled_for.isoformat() if scheduled_for else None
            }
        
        except Exception as e:
            logger.exception(f"Error sending notification in workflow step {step_config['id']}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _resolve_recipient(self, config: Dict, context: Dict, workflow_run) -> Any:
        """Resolve the notification recipient"""
        from clients.models import Client
        from users.models import User
        
        recipient_source = config.get('recipient_source', 'client')
        
        if recipient_source == 'client':
            # Try to get client from context
            client_id = context.get('client_id') or context.get('form', {}).get('client_id')
            if client_id:
                try:
                    return Client.objects.get(id=client_id, branch=workflow_run.branch)
                except Client.DoesNotExist:
                    pass
            
            # Try form submission's related data
            if hasattr(workflow_run, 'form_submission') and workflow_run.form_submission:
                client_id = workflow_run.form_submission.data.get('client_id')
                if client_id:
                    try:
                        return Client.objects.get(id=client_id, branch=workflow_run.branch)
                    except Client.DoesNotExist:
                        pass
        
        elif recipient_source == 'user':
            # Send to the workflow creator
            return workflow_run.created_by
        
        elif recipient_source == 'custom':
            # Resolve from custom field path
            recipient_field = config.get('recipient_field')
            if recipient_field:
                value = self._resolve_variable(recipient_field, context)
                if value:
                    # Could be ID, email, or phone
                    if isinstance(value, (int, str)) and str(value).isdigit():
                        # Assume it's a client ID
                        try:
                            return Client.objects.get(id=value, branch=workflow_run.branch)
                        except Client.DoesNotExist:
                            pass
                    else:
                        # Return as contact info dict
                        return {
                            'contact': value,
                            'name': config.get('recipient_name', 'User')
                        }
        
        return None
    
    def _build_context(self, mapping: Dict, context: Dict) -> Dict:
        """Build notification context from mapping"""
        notification_context = {}
        
        for key, value_expression in mapping.items():
            # Resolve variable expression
            resolved_value = self._resolve_variable(value_expression, context)
            notification_context[key] = resolved_value
        
        return notification_context
    
    def _resolve_variable(self, expression: str, context: Dict) -> Any:
        """
        Resolve variable expression like ${form.amount} or ${step_xyz.result}
        """
        if not isinstance(expression, str) or not expression.startswith('${'):
            return expression
        
        # Extract variable path
        path = expression[2:-1]  # Remove ${ and }
        
        # Split path and navigate context
        parts = path.split('.')
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return expression  # Return original if can't resolve
            
            if value is None:
                return None
        
        # Handle callables
        if callable(value):
            try:
                value = value()
            except:
                pass
        
        return value
    
    def _resolve_schedule(self, schedule_config: Dict, context: Dict) -> Any:
        """Resolve scheduling from config"""
        schedule_type = schedule_config.get('type', 'immediate')
        
        if schedule_type == 'immediate':
            return timezone.now()
        
        elif schedule_type == 'delayed':
            delay_seconds = schedule_config.get('delay_seconds', 0)
            return timezone.now() + timezone.timedelta(seconds=delay_seconds)
        
        elif schedule_type == 'scheduled':
            send_at = schedule_config.get('send_at')
            if send_at:
                resolved = self._resolve_variable(send_at, context)
                if isinstance(resolved, str):
                    # Parse datetime string
                    from django.utils.dateparse import parse_datetime
                    return parse_datetime(resolved)
                return resolved
        
        return timezone.now()
    
    def _evaluate_conditional(self, conditional: Dict, context: Dict) -> bool:
        """Evaluate conditional expression"""
        field = conditional.get('field')
        operator = conditional.get('operator')
        expected_value = conditional.get('value')
        
        actual_value = self._resolve_variable(f"${{{field}}}", context)
        
        if operator == '>':
            return float(actual_value) > float(expected_value)
        elif operator == '>=':
            return float(actual_value) >= float(expected_value)
        elif operator == '<':
            return float(actual_value) < float(expected_value)
        elif operator == '<=':
            return float(actual_value) <= float(expected_value)
        elif operator == '==':
            return actual_value == expected_value
        elif operator == '!=':
            return actual_value != expected_value
        elif operator == 'in':
            return actual_value in expected_value
        
        return False
