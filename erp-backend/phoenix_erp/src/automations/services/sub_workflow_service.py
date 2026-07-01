from typing import Dict, Any, Optional
from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from automations.models import WorkflowTemplate, WorkflowRun


class SubWorkflowExecutor:
    """Handles sub-workflow execution with proper context passing"""
    
    def __init__(self, parent_execution: WorkflowRun):
        self.parent_execution = parent_execution
    
    @db_transaction.atomic
    def execute_sub_workflow(
        self,
        workflow_id: str,
        input_mapping: Dict[str, str],
        parent_context: Dict[str, Any],
        workflow_version: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Execute a sub-workflow with mapped inputs
        
        Args:
            workflow_id: ID of workflow to execute
            input_mapping: Maps workflow inputs to parent context variables
            parent_context: Context from parent workflow
            workflow_version: Specific version to use (None = latest)
        
        Returns:
            Dict with sub-workflow outputs
        """
        # Validate depth limit
        if self.parent_execution.depth >= 3:
            raise ValueError("Maximum workflow depth exceeded")
        
        # Load workflow
        workflow = WorkflowTemplate.objects.get(id=workflow_id, is_active=True)
        
        # Validate workflow is callable
        if workflow.access_level == 'private':
            raise PermissionError(f"Workflow {workflow.name} is not callable")
        
        # Map inputs from parent context
        sub_workflow_inputs = self._map_inputs(
            input_mapping,
            parent_context,
            workflow.required_inputs
        )
        
        # Validate inputs
        self._validate_inputs(sub_workflow_inputs, workflow.required_inputs)
        
        # Create sub-workflow execution record
        sub_execution = WorkflowRun.objects.create(
            template=workflow,
            workflow_version=workflow_version or workflow.version,
            root_execution=self.parent_execution.root_execution or self.parent_execution,
            parent_execution=self.parent_execution,
            depth=self.parent_execution.depth + 1,
            status='running',
            context=sub_workflow_inputs,
            owner=self.parent_execution.owner,
            created_by=self.parent_execution.created_by
        )
        
        try:
            # Execute sub-workflow using your existing executor
            from automations.tasks import execute_workflow_task
            result = execute_workflow_task(sub_execution.id)
            
            # Update usage metrics
            workflow.usage_count += 1
            workflow.last_used_at = timezone.now()
            workflow.save(update_fields=['usage_count', 'last_used_at'])
            
            return result
            
        except Exception as e:
            sub_execution.status = 'failed'
            sub_execution.error_message = str(e)
            sub_execution.save()
            
            # Handle atomic rollback
            if workflow.is_atomic:
                # Rollback will happen automatically via @db_transaction.atomic
                raise
            else:
                # Non-atomic: let parent decide how to handle
                return {'error': str(e), 'success': False}
    
    def _map_inputs(
        self,
        input_mapping: Dict[str, str],
        parent_context: Dict[str, Any],
        required_inputs: list
    ) -> Dict[str, Any]:
        """Map parent context variables to sub-workflow inputs"""
        mapped = {}
        
        for input_def in required_inputs:
            input_name = input_def['name']
            variable_path = input_mapping.get(input_name)
            
            if not variable_path:
                if 'validation' in input_def and 'required' in input_def['validation']:
                    raise ValueError(f"Required input '{input_name}' not mapped")
                continue
            
            # Resolve variable path from parent context
            value = self._resolve_variable_path(variable_path, parent_context)
            mapped[input_name] = value
        
        return mapped
    
    def _resolve_variable_path(self, path: str, context: Dict[str, Any]) -> Any:
        """Resolve a dotted path like 'step_1.results.0.balance' from context"""
        # Remove ${} if present
        path = path.replace('${', '').replace('}', '')
        
        parts = path.split('.')
        value = context
        
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list):
                try:
                    index = int(part)
                    value = value[index]
                except (ValueError, IndexError):
                    return None
            else:
                return None
        
        return value
    
    def _validate_inputs(self, inputs: Dict[str, Any], required_inputs: list):
        """Validate inputs match requirements"""
        for input_def in required_inputs:
            name = input_def['name']
            expected_type = input_def['type']
            
            if name not in inputs:
                if 'validation' in input_def and 'required' in input_def['validation']:
                    raise ValueError(f"Required input '{name}' missing")
                continue
            
            value = inputs[name]
            
            # Type validation
            if expected_type == 'string' and not isinstance(value, str):
                raise TypeError(f"Input '{name}' must be string, got {type(value).__name__}")
            elif expected_type == 'number' and not isinstance(value, (int, float)):
                raise TypeError(f"Input '{name}' must be number, got {type(value).__name__}")
            elif expected_type == 'boolean' and not isinstance(value, bool):
                raise TypeError(f"Input '{name}' must be boolean, got {type(value).__name__}")
            
            # Custom validation
            if 'validation' in input_def:
                validation = input_def['validation']
                if validation == 'required' and not value:
                    raise ValueError(f"Input '{name}' cannot be empty")
                elif '>' in validation:
                    # e.g., "amount > 0"
                    try:
                        field, op, threshold = validation.split()
                        if field == name and op == '>' and Decimal(str(value)) <= Decimal(str(threshold)):
                            raise ValueError(f"Input '{name}' must be > {threshold}")
                    except:
                        pass
