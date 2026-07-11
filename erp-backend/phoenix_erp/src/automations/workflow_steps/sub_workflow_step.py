# automations/workflow_steps/sub_workflow_step.py
from .base import BaseStepHandler


class SubWorkflowStepHandler(BaseStepHandler):
    """
    Execute another workflow as a sub-workflow
    
    Supports two modes:
    1. **Direct workflow execution** - Execute any workflow by ID/code
    2. **Master template execution** - Execute master templates with custom parameters
    
    Config example (Direct):
    {
        'workflow_code': 'send_welcome_email',
        'inputs': {
            'client_id': '${form.client_id}',
            'client_name': '${client.full_name}'
        },
        'wait_for_completion': True
    }
    
    Config example (Master Template with Parameters):
    {
        'workflow_code': 'expense_transaction_approval',
        'workflow_type': 'master_template',
        'parameters': {
            'target_account_id': '${expense_account_id}',
            'target_account_name': 'Travel Expenses',
            'contra_account_id': 15,  // Cash account
        },
        'inputs': {
            'form': {
                'amount': '${calculation.total_amount}',
                'description': 'Travel reimbursement for ${employee.name}',
                'transaction_date': '${today}'
            }
        },
        'wait_for_completion': True
    }
    """
    
    def execute(self, step_config, workflow_run, context):
        from automations.models import WorkflowTemplate, WorkflowRun
        
        config = step_config.get('config', {})
        
        workflow_code = config.get('workflow_code')
        workflow_id = config.get('workflow_id')
        workflow_type = config.get('workflow_type')  # 'master_template' or None
        
        # Support both 'inputs' and 'input_variables' for backward compatibility
        input_vars = config.get('inputs') or config.get('input_variables', {})
        inputs = self._resolve_variables(input_vars, context)
        
        # Master template parameters (account IDs, contra accounts, etc.)
        param_vars = config.get('parameters', {})
        parameters = self._resolve_variables(param_vars, context)
        
        result_name = config.get('result_name', 'sub_workflow_result')
        wait = config.get('wait_for_completion', True)
        
        # Get workflow template by ID or code
        if workflow_id:
            template = WorkflowTemplate.objects.get(id=workflow_id)
        elif workflow_code:
            # Filter for master templates if specified
            filters = {
                'code': workflow_code,
                'branch': workflow_run.branch,
                'is_active': True
            }
            if workflow_type == 'master_template':
                filters['workflow_type'] = 'master_template'
            
            template = WorkflowTemplate.objects.get(**filters)
        else:
            raise ValueError("Either workflow_id or workflow_code must be provided")
        
        # Build context for master template execution
        if template.workflow_type == 'master_template':
            # Master templates expect 'workflow' and 'form' in context
            sub_context = {
                'workflow': parameters,  # Account IDs, names, contra accounts
                'form': inputs.get('form', inputs),  # Form data
                'user': context.get('user', {}),  # User info
                'parent': context,  # Access to parent workflow context
            }
        else:
            # Regular workflows just get inputs
            sub_context = inputs
        
        # Create sub-workflow run
        sub_run = WorkflowRun.objects.create(
            template=template,
            context=sub_context,
            parent_execution=workflow_run,
            root_execution=workflow_run.root_execution or workflow_run,
            depth=workflow_run.depth + 1,
            owner=workflow_run.owner,
            branch=workflow_run.branch,
            created_by=workflow_run.created_by,
            tenant=workflow_run.tenant
        )
        
        if wait:
            # Execute synchronously (simplified - in production use task)
            from automations.workflow_executor import WorkflowExecutor
            executor = WorkflowExecutor(sub_run)
            executor.execute()
            
            # Refresh to get final status and context
            sub_run.refresh_from_db()
            
            # Store sub-workflow result in parent context
            result = {
                'status': sub_run.status,
                'context': sub_run.context,
                'workflow_run_id': sub_run.id
            }
            
            # Merge sub-workflow context into parent context with result_name
            context[result_name] = sub_run.context
            workflow_run.update_context(result_name, sub_run.context)
            # For now, just return the sub_run ID
            return {
                'success': True,
                'sub_workflow_id': sub_run.id,
                'sub_workflow_reference': sub_run.run_reference,
                'waiting': True
            }
        else:
            # Fire and forget
            return {
                'success': True,
                'sub_workflow_id': sub_run.id,
                'async': True
            }