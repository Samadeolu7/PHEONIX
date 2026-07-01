# automations/executor.py
"""
Complete workflow executor combining all step handlers
"""
from typing import Dict, Any
from django.utils import timezone
import logging

from automations.models import WorkflowRun
from automations.workflow_steps import (
    TransactionStepHandler,
    NotificationStepHandler,
    ConditionStepHandler,
    ApprovalStepHandler,
    SubWorkflowStepHandler,
    HttpRequestStepHandler,
    DataTransformStepHandler,
    QueryStepHandler,
    CalculationStepHandler,
    UpdateStepHandler,
    # New comprehensive handlers
    DelayStepHandler,
    LoopStepHandler,
    VariableStepHandler,
    ValidationStepHandler,
    ScriptStepHandler,
    AggregateStepHandler,
    FilterStepHandler,
    MapStepHandler,
)

# Procurement-specific step handlers
from procurement.workflow_step_handlers import ThreeWayMatchingStepHandler, GRNCreationStepHandler

logger = logging.getLogger(__name__)


class WorkflowExecutor:
    """
    Main workflow execution engine
    Orchestrates step execution based on workflow definition
    """
    
    def __init__(self, run: WorkflowRun):
        self.run = run
        self.template = run.template
        self.context = dict(run.context)
        
        # Initialize all step handlers
        self.step_handlers = {
            # Core handlers
            'transaction': TransactionStepHandler(),
            'notification': NotificationStepHandler(),
            'condition': ConditionStepHandler(),
            'approval': ApprovalStepHandler(),
            'sub_workflow': SubWorkflowStepHandler(),
            'http_request': HttpRequestStepHandler(),
            'data_transform': DataTransformStepHandler(),
            'query': QueryStepHandler(),
            'calculation': CalculationStepHandler(),
            'calculate': CalculationStepHandler(),  # Alias
            'update': UpdateStepHandler(),
            # New comprehensive handlers
            'delay': DelayStepHandler(),
            'wait': DelayStepHandler(),  # Alias
            'loop': LoopStepHandler(),
            'iterate': LoopStepHandler(),  # Alias
            'variable': VariableStepHandler(),
            'set_variable': VariableStepHandler(),  # Alias
            'validation': ValidationStepHandler(),
            'validate': ValidationStepHandler(),  # Alias
            'script': ScriptStepHandler(),
            'execute_script': ScriptStepHandler(),  # Alias
            'aggregate': AggregateStepHandler(),
            'filter': FilterStepHandler(),
            'map': MapStepHandler(),
            'transform': MapStepHandler(),  # Alias
            # Procurement handlers
            'three_way_matching': ThreeWayMatchingStepHandler(),
            'create_grn': GRNCreationStepHandler(),
        }
        
        # Track execution
        self.trigger_type = run.template.trigger_type
        self.allowed_var_sources = self._get_allowed_sources()
    
    def _get_allowed_sources(self):
        """Determine which variable sources are allowed based on trigger type"""
        if self.trigger_type == 'event':
            return ['form', 'query_result', 'calculation', 'step']
        else:  # manual or schedule
            return ['query_result', 'calculation', 'step']
    
    def execute(self) -> bool:
        """
        Execute the entire workflow from start to finish
        
        Returns:
            True if workflow completed successfully, False otherwise
        """
        try:
            # Mark as running
            if self.run.status == 'queued':
                self.run.status = 'running'
                self.run.started_at = timezone.now()
                self.run.save()
                logger.info(f"Workflow {self.run.id} status set to: running")
            
            # Handle empty workflow (no initial step)
            if not self.template.workflow_definition.get('initial_step'):
                logger.info(f"Workflow {self.run.run_reference} has no initial step - completing immediately")
                self.run.status = 'completed'
                self.run.completed_at = timezone.now()
                if self.run.started_at:
                    duration = (self.run.completed_at - self.run.started_at).total_seconds() * 1000
                    self.run.duration_ms = int(duration)
                self.run.save()
                return True
            
            # Start with initial step
            if not self.run.current_step_id:
                self.run.current_step_id = self.template.workflow_definition['initial_step']
                self.run.save()
            
            # Execute steps until completion
            max_steps = self.template.max_steps or 50
            step_count = 0
            
            while self.run.current_step_id:
                # Check max steps BEFORE executing
                if step_count >= max_steps:
                    logger.error(f"Workflow {self.run.run_reference} exceeded max_steps limit: {max_steps}")
                    self.run.status = 'failed'
                    self.run.error_message = f'max_steps limit ({max_steps}) exceeded - possible infinite loop'
                    self.run.completed_at = timezone.now()
                    self.context['error'] = self.run.error_message
                    self.run.update_context('error', self.run.error_message)
                    self.run.save()
                    return False
                
                step_count += 1
                logger.info(f"Executing step {step_count}/{max_steps} for workflow {self.run.run_reference}")
                
                # Execute current step
                result = self.execute_current_step()
                
                if not result['success']:
                    # Step failed
                    self.run.status = 'failed'
                    self.run.error_message = result.get('error', 'Unknown error')
                    self.run.error_step_id = self.run.current_step_id
                    self.run.completed_at = timezone.now()
                    self.run.save()
                    return False
                
                # Check if workflow is paused (e.g., waiting for approval)
                if result.get('paused'):
                    # Refresh run to get status set by step handler
                    self.run.refresh_from_db()
                    # Workflow will resume when approval is granted
                    return True
                
                # Move to next step
                next_step = result.get('next_step')
                
                if next_step:
                    self.run.current_step_id = next_step
                    self.run.save()
                else:
                    # No next step - workflow complete
                    self.run.status = 'completed'
                    self.run.completed_at = timezone.now()
                    
                    # Calculate duration
                    if self.run.started_at:
                        duration = (self.run.completed_at - self.run.started_at).total_seconds() * 1000
                        self.run.duration_ms = int(duration)
                    
                    self.run.save()
                    return True
            
            return True
        
        except Exception as e:
            logger.exception(f"Workflow execution failed for run {self.run.id}")
            self.run.status = 'failed'
            self.run.error_message = str(e)
            self.run.completed_at = timezone.now()
            self.run.save()
            return False
    
    def execute_current_step(self) -> Dict[str, Any]:
        """Execute the current step and return result"""
        step = self.template.get_step_by_id(self.run.current_step_id)
        
        if not step:
            raise ValueError(f"Step {self.run.current_step_id} not found in workflow definition")
        
        step_type = step['type']
        step_id = step['id']
        
        logger.info(f"Executing step {step_id} (type: {step_type}) for workflow {self.run.run_reference}")
        
        try:
            # Get handler
            handler = self.step_handlers.get(step_type)
            
            if not handler:
                raise ValueError(f"No handler found for step type: {step_type}")
            
            # Execute step
            result = handler.execute(step, self.run, self.context)
            
            # Check if step handler returned an error (success=False)
            if not result.get('success', True):
                error_msg = result.get('error', 'Step execution failed')
                logger.error(f"Step {step_id} failed: {error_msg}")
                
                # Log failure
                self.run.log_step(
                    step_id=step_id,
                    status='failed',
                    error=error_msg
                )
                
                # Store error in context
                self.context['error'] = error_msg
                self.run.update_context('error', error_msg)
                
                # Check if there's an error handler
                error_handler = step.get('on_error')
                
                return {
                    'success': False,
                    'error': error_msg,
                    'next_step': error_handler  # Will go to error handler if defined, else None
                }
            
            # Log success
            self.run.log_step(
                step_id=step_id,
                status='completed',
                result=result
            )
            
            # Store result in context for subsequent steps
            step_key = f"step_{step_id}"
            self.context[step_key] = result
            self.run.update_context(step_key, result)
            
            # Determine next step with conditional routing (Phase 2B)
            next_step = self._determine_next_step(step, result)
            
            return {
                'success': True,
                'result': result,
                'next_step': next_step,
                'paused': result.get('paused', False)
            }
        
        except Exception as e:
            logger.exception(f"Step {step_id} execution failed")
            
            # Log failure
            self.run.log_step(
                step_id=step_id,
                status='failed',
                error=str(e)
            )
            
            # Store error in context
            error_msg = str(e)
            self.context['error'] = error_msg
            self.run.update_context('error', error_msg)
            
            # Check if there's an error handler
            error_handler = step.get('on_error')
            
            return {
                'success': False,
                'error': error_msg,
                'next_step': error_handler  # Will go to error handler if defined, else None
            }
    
    def _determine_next_step(self, step: Dict[str, Any], result: Dict[str, Any]) -> str:
        """
        Determine next step using conditional routing (Phase 2B feature)
        
        Checks transitions with condition_rules before falling back to default next step
        """
        from automations.models import WorkflowConditionEvaluator
        
        # First check if result explicitly specifies next_step
        if result.get('next_step'):
            return result['next_step']
        
        # Check for conditional transitions (Phase 2B)
        transitions = step.get('transitions', [])
        if transitions:
            for transition in transitions:
                condition_rules = transition.get('condition_rules')
                if condition_rules:
                    # Evaluate condition using Phase 2B evaluator
                    try:
                        if WorkflowConditionEvaluator.evaluate(condition_rules, self.context):
                            logger.info(f"Conditional routing: matched condition for transition to {transition.get('target_step')}")
                            return transition.get('target_step')
                    except Exception as e:
                        logger.error(f"Error evaluating condition: {str(e)}")
                        # Continue to next transition or default
                else:
                    # Transition without condition (default/fallback)
                    return transition.get('target_step')
        
        # Fallback to legacy 'next' field
        return step.get('next')
    
    def check_parallel_approval_complete(self, workflow_run, step_id: str) -> tuple:
        """
        Check if parallel approval step is complete (Phase 2B feature)
        
        Returns: (is_complete: bool, outcome: str)
        """
        from automations.models import WorkflowApproval
        
        step = self.template.get_step_by_id(step_id)
        approval_mode = step.get('approval_mode', 'sequential')
        
        if approval_mode != 'parallel':
            return True, 'approved'  # Single approval mode
        
        # Get all approvals for this step
        approvals = WorkflowApproval.objects.filter(
            workflow_run=workflow_run,
            step_id=step_id
        )
        
        total_count = approvals.count()
        approved_count = approvals.filter(status='approved').count()
        rejected_count = approvals.filter(status='rejected').count()
        
        # Get threshold configuration
        threshold = step.get('approval_threshold', {'type': 'all'})
        threshold_type = threshold.get('type', 'all')
        
        # Check threshold based on type
        if threshold_type == 'all':
            if approved_count == total_count:
                return True, 'approved'
            if rejected_count > 0:
                return True, 'rejected'
        elif threshold_type == 'any':
            if approved_count > 0:
                return True, 'approved'
            if rejected_count == total_count:
                return True, 'rejected'
        elif threshold_type == 'majority':
            if approved_count > (total_count / 2):
                return True, 'approved'
            if rejected_count > (total_count / 2):
                return True, 'rejected'
        elif threshold_type == 'count':
            required_count = threshold.get('count', total_count)
            if approved_count >= required_count:
                return True, 'approved'
            # Check if rejection makes approval impossible
            remaining = total_count - (approved_count + rejected_count)
            if (approved_count + remaining) < required_count:
                return True, 'rejected'
        
        return False, 'pending'
    
    def resume_from_approval(self, approval):
        """
        Resume workflow execution after approval (Phase 2B: supports parallel approvals)
        Called when approval is granted
        """
        # Refresh run
        self.run.refresh_from_db()
        
        # Get current step
        step = self.template.get_step_by_id(self.run.current_step_id)
        
        # Check if this is a parallel approval step (Phase 2B)
        approval_mode = step.get('approval_mode', 'sequential')
        
        if approval_mode == 'parallel':
            # Check if all parallel approvals are complete
            is_complete, outcome = self.check_parallel_approval_complete(self.run, step['id'])
            
            if not is_complete:
                # Still waiting for more approvals
                logger.info(f"Parallel approval not complete yet for run {self.run.run_reference}")
                return
            
            # Parallel approvals complete - determine next step based on outcome
            if outcome == 'approved':
                next_step = step.get('on_approve') or step.get('next')
            else:  # rejected
                next_step = step.get('on_reject')
                if not next_step:
                    # No rejection handler - fail workflow
                    self.run.status = 'failed'
                    self.run.error_message = 'Approval rejected with no rejection handler'
                    self.run.completed_at = timezone.now()
                    self.run.save()
                    return
        else:
            # Sequential or single approval - proceed to next step
            next_step = step.get('on_approve') or step.get('next')
        
        # Update status and move to next step
        self.run.status = 'running'
        if next_step:
            self.run.current_step_id = next_step
            self.run.save()
            
            # Continue execution
            self.execute()
        else:
            # No next step - complete workflow
            self.run.status = 'completed'
            self.run.completed_at = timezone.now()
            if self.run.started_at:
                duration = (self.run.completed_at - self.run.started_at).total_seconds() * 1000
                self.run.duration_ms = int(duration)
            self.run.save()


class WorkflowOrchestrator:
    """
    High-level orchestrator for workflow management
    Handles workflow creation, execution, and monitoring
    """
    
    @classmethod
    def trigger_workflow(
        cls,
        template_code: str,
        context: dict,
        owner,
        branch,
        created_by=None,
        related_object=None
    ) -> WorkflowRun:
        """
        Trigger a workflow execution
        
        Args:
            template_code: Code of workflow template to execute
            context: Initial context data
            owner: Owner user
            branch: Branch
            created_by: User triggering the workflow
            related_object: Related model instance (e.g., FormSubmission)
        
        Returns:
            Created WorkflowRun instance
        """
        from automations.models import WorkflowTemplate
        from django.contrib.contenttypes.models import ContentType
        
        # Get template
        template = WorkflowTemplate.objects.get(
            run_sequence=template_code,
            branch=branch,
            is_active=True
        )
        
        # Create run
        run_data = {
            'template': template,
            'context': context,
            'owner': owner,
            'branch': branch,
            'created_by': created_by or owner,
        }
        
        # Link related object if provided
        if related_object:
            run_data['content_type'] = ContentType.objects.get_for_model(related_object)
            run_data['object_id'] = str(related_object.pk)
        
        run = WorkflowRun.objects.create(**run_data)
        
        # Execute workflow (async via Celery in production)
        from django.db import transaction
        transaction.on_commit(
            lambda: cls._execute_async(run.id)
        )
        
        return run
    
    @classmethod
    def _execute_async(cls, run_id: int):
        """Queue workflow execution (Celery task)"""
        from automations.tasks import execute_workflow_task
        execute_workflow_task.apply_async(args=[run_id], countdown=1)
    
    @classmethod
    def retry_failed_workflow(cls, run_id: int):
        """Retry a failed workflow"""
        run = WorkflowRun.objects.get(id=run_id)
        
        if run.status != 'failed':
            raise ValueError("Can only retry failed workflows")
        
        # Reset status
        run.status = 'queued'
        run.error_message = ''
        run.error_step_id = ''
        run.save()
        
        # Re-execute
        cls._execute_async(run_id)
    
    @classmethod
    def cancel_workflow(cls, run_id: int, reason: str = ''):
        """Cancel a running workflow"""
        run = WorkflowRun.objects.get(id=run_id)
        
        if run.status not in ['queued', 'running', 'awaiting_approval']:
            raise ValueError("Can only cancel queued/running/pending workflows")
        
        run.status = 'cancelled'
        run.error_message = f"Cancelled: {reason}"
        run.completed_at = timezone.now()
        run.save()



class WorkflowTestExecutor:
    """
    Test executor for workflows - simulates execution without database changes
    """
    
    def __init__(self, steps: list, context: dict, user, branch):
        self.steps = steps
        self.context = context.copy()
        self.user = user
        self.branch = branch
        self.step_results = []
    
    def execute(self) -> dict:
        """
        Execute workflow steps in test mode
        
        Returns:
            {
                "success": bool,
                "step_results": [...],
                "context": {...},
                "error": str (optional)
            }
        """
        try:
            for idx, step in enumerate(self.steps):
                step_id = step['id']
                step_type = step['type']
                step_name = step.get('name', f'Step {idx + 1}')
                
                logger.info(f"Testing step {step_id}: {step_name} ({step_type})")
                
                # Execute step based on type
                result = self._execute_step(step)
                
                # Store result
                self.step_results.append({
                    'step_id': step_id,
                    'step_name': step_name,
                    'step_type': step_type,
                    'status': result['status'],
                    'output': result.get('output', {}),
                    'error': result.get('error'),
                    'timestamp': timezone.now().isoformat(),
                })
                
                # If step failed, stop execution
                if result['status'] == 'error':
                    return {
                        'success': False,
                        'step_results': self.step_results,
                        'context': self.context,
                        'error': f"Step {step_name} failed: {result.get('error')}"
                    }
                
                # Update context with step output
                self.context[f"step_{step_id}"] = result.get('output', {})
            
            return {
                'success': True,
                'step_results': self.step_results,
                'context': self.context,
            }
        
        except Exception as e:
            logger.exception("Test execution failed")
            return {
                'success': False,
                'step_results': self.step_results,
                'context': self.context,
                'error': str(e)
            }
    
    def _execute_step(self, step: dict) -> dict:
        """Execute a single step in test mode"""
        step_type = step['type']
        config = step.get('config', {})
        
        try:
            # Resolve variables in config
            resolved_config = self._resolve_variables(config)
            
            # Simulate execution based on step type
            if step_type == 'query':
                return self._test_query(resolved_config)
            elif step_type == 'condition':
                return self._test_condition(resolved_config)
            elif step_type == 'calculation':
                return self._test_calculation(resolved_config)
            elif step_type == 'transaction':
                return self._test_transaction(resolved_config)
            elif step_type == 'notification':
                return self._test_notification(resolved_config)
            elif step_type == 'sub_workflow':
                return self._test_sub_workflow(resolved_config)
            else:
                return {
                    'status': 'error',
                    'error': f'Unknown step type: {step_type}'
                }
        
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def _resolve_variables(self, config: dict) -> dict:
        """Resolve ${variable} references from context"""
        import re
        
        def resolve_value(value):
            if isinstance(value, str) and '${' in value:
                match = re.search(r'\$\{([^}]+)\}', value)
                if match:
                    var_path = match.group(1)
                    parts = var_path.split('.')
                    
                    result = self.context
                    for part in parts:
                        if isinstance(result, dict):
                            result = result.get(part)
                        else:
                            result = getattr(result, part, None)
                        
                        if result is None:
                            logger.warning(f"Variable '{var_path}' not found in test context")
                            return f"[UNDEFINED: {var_path}]"
                    
                    return result
            elif isinstance(value, dict):
                return {k: resolve_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [resolve_value(item) for item in value]
            
            return value
        
        return {k: resolve_value(v) for k, v in config.items()}
    
    def _test_query(self, config: dict) -> dict:
        """Test query step"""
        entity = config.get('entity')
        filters = config.get('filters', [])
        
        return {
            'status': 'success',
            'output': {
                'message': f'Query simulation: Would fetch {entity} with {len(filters)} filters',
                'entity': entity,
                'filters': filters,
                'result_count': 1,  # Simulated
                'results': [{'id': 999, 'simulated': True}]
            }
        }
    
    def _test_condition(self, config: dict) -> dict:
        """Test condition step"""
        conditions = config.get('conditions', [])
        logic = config.get('logic', 'AND')
        
        # Simulate evaluation
        evaluations = []
        for cond in conditions:
            field = cond.get('field')
            operator = cond.get('operator')
            value = cond.get('value')
            evaluations.append({
                'condition': f"{field} {operator} {value}",
                'result': True  # Simulated as true
            })
        
        return {
            'status': 'success',
            'output': {
                'message': f'Condition evaluation ({logic}): All conditions passed (simulated)',
                'conditions_evaluated': len(conditions),
                'evaluations': evaluations,
                'final_result': True
            }
        }
    
    def _test_calculation(self, config: dict) -> dict:
        """Test calculation step"""
        formula = config.get('formula')
        result_name = config.get('result_name')
        
        # Try to evaluate formula safely
        try:
            # Simple evaluation for test (be careful in production!)
            # This is just for testing - real implementation needs safer eval
            import ast
            import operator as op
            
            # Allowed operations
            operators = {
                ast.Add: op.add,
                ast.Sub: op.sub,
                ast.Mult: op.mul,
                ast.Div: op.truediv,
            }
            
            # For demo, just return simulated result
            result_value = 0  # Simulated calculation result
            
            return {
                'status': 'success',
                'output': {
                    'message': f'Calculation: {result_name} = {formula}',
                    'formula': formula,
                    'result_name': result_name,
                    'calculated_value': result_value
                }
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': f'Formula evaluation failed: {str(e)}'
            }
    
    def _test_transaction(self, config: dict) -> dict:
        """Test transaction step"""
        entries = config.get('entries', [])
        
        # Validate entries
        if len(entries) < 2:
            return {
                'status': 'error',
                'error': 'Transaction requires at least 2 entries'
            }
        
        # Calculate totals
        dr_total = sum(Decimal(str(e.get('amount', 0))) for e in entries if e.get('side') == 'DR')
        cr_total = sum(Decimal(str(e.get('amount', 0))) for e in entries if e.get('side') == 'CR')
        
        if abs(dr_total - cr_total) > Decimal('0.01'):
            return {
                'status': 'error',
                'error': f'Transaction not balanced: DR={dr_total}, CR={cr_total}'
            }
        
        return {
            'status': 'success',
            'output': {
                'message': 'Transaction validated successfully (not saved in test mode)',
                'transaction_id': 'TEST_TXN_999',
                'reference_number': 'TXN-TEST-001',
                'entries_count': len(entries),
                'dr_total': dr_total,
                'cr_total': cr_total,
                'balanced': True
            }
        }
    
    def _test_notification(self, config: dict) -> dict:
        """Test notification step"""
        notif_type = config.get('type')
        recipient = config.get('recipient')
        message = config.get('message')
        
        return {
            'status': 'success',
            'output': {
                'message': f'Notification simulation: Would send {notif_type} to {recipient}',
                'type': notif_type,
                'recipient': recipient,
                'message_preview': message[:100] if message else '',
                'sent': False,  # Not actually sent in test mode
            }
        }
    
    def _test_sub_workflow(self, config: dict) -> dict:
        """Test sub-workflow step"""
        workflow_id = config.get('workflow_id')
        
        return {
            'status': 'success',
            'output': {
                'message': f'Sub-workflow simulation: Would call workflow {workflow_id}',
                'workflow_id': workflow_id,
                'executed': False,  # Not actually executed in test mode
            }
        }
