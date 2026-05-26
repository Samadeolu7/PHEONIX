from typing import Dict, Any, Optional
from django.db import transaction
from django.utils import timezone

from .models import WorkflowAction, AutomationRun, ApprovalStep
from .handlers.transaction_handler import TransactionStepHandler as TransactionHandler

class WorkflowExecutionEngine:
    def __init__(self, run: AutomationRun):
        self.run = run
        self.template = run.template
        self.current_action = None
        self.execution_path = []

    def _get_next_action(self, current_result: Optional[Dict[str, Any]] = None) -> Optional[WorkflowAction]:
        if not self.current_action:
            return self.template.workflow.first()
        
        if current_result and current_result.get('next_action_id'):
            try:
                return WorkflowAction.objects.get(
                    id=current_result['next_action_id'],
                    template=self.template
                )
            except WorkflowAction.DoesNotExist:
                return None
        
        # Get next action based on current action's configuration
        if self.current_action.next_actions:
            if 'conditions' in self.current_action.next_actions:
                for condition in self.current_action.next_actions['conditions']:
                    if self._evaluate_condition(condition['condition']):
                        return WorkflowAction.objects.get(
                            id=condition['nextActionId'],
                            template=self.template
                        )
            
            # Check success/failure paths
            status = current_result.get('success', True)
            next_action_id = (
                self.current_action.next_actions.get('success')
                if status
                else self.current_action.next_actions.get('failure')
            )
            
            if next_action_id:
                try:
                    return WorkflowAction.objects.get(
                        id=next_action_id,
                        template=self.template
                    )
                except WorkflowAction.DoesNotExist:
                    return None
        
        # Default to next action by order
        return WorkflowAction.objects.filter(
            template=self.template,
            order__gt=self.current_action.order
        ).first()

    def _evaluate_condition(self, condition: str) -> bool:
        # Use safe_eval from your existing code
        from .models import safe_eval_expr
        context = {
            'form_data': self.run.form_data or {},
            'run': {
                'id': self.run.id,
                'status': self.run.status,
                'created_at': self.run.created_at
            }
        }
        return safe_eval_expr(condition, context)

    def _execute_action(self, action: WorkflowAction) -> Dict[str, Any]:
        handlers = {
            'transaction': TransactionHandler,
            # Add other handlers here
        }
        
        handler_class = handlers.get(action.type)
        if not handler_class:
            raise ValueError(f"No handler found for action type: {action.type}")
        
        handler = handler_class(action, self.run)
        result = handler.execute()
        
        # Record execution in path
        self.execution_path.append({
            'action_id': action.id,
            'type': action.type,
            'timestamp': timezone.now().isoformat(),
            'result': result
        })
        
        return result

    @transaction.atomic
    def execute(self) -> Dict[str, Any]:
        """Execute the workflow for this run."""
        if self.run.status not in ['pending', 'in_progress']:
            raise ValueError(f"Cannot execute run in status: {self.run.status}")
        
        self.run.status = 'in_progress'
        self.run.save()
        
        try:
            while True:
                next_action = self._get_next_action()
                if not next_action:
                    break
                
                self.current_action = next_action
                result = self._execute_action(next_action)
                
                # Update run with execution path
                self.run.execution_path = self.execution_path
                self.run.save()
                
                if not self._get_next_action(result):
                    break
            
            self.run.status = 'completed'
            self.run.completed_at = timezone.now()
            
        except Exception as e:
            self.run.status = 'failed'
            self.run.error_message = str(e)
            raise
        finally:
            self.run.save()
        
        return {
            'success': self.run.status == 'completed',
            'run_id': self.run.id,
            'execution_path': self.execution_path
        }