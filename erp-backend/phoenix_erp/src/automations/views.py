# ============================================
# File: automations/views.py (UNIFIED WITH SUB-WORKFLOWS)
# ============================================

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q, Count, Avg
from django.utils import timezone
import logging

from .models import (
    FormSchema, FormSubmission,
    WorkflowTemplate, WorkflowRun, WorkflowApproval,
    StepExecution
)
from .serializers import (
    FormSchemaSerializer, FormSubmissionSerializer, WorkflowSummarySerializer,
    WorkflowTemplateSerializer, WorkflowRunSerializer,
    WorkflowApprovalSerializer
)
from common.views import ScopedModelViewSet
from common.serializers import IsTenantUser

logger = logging.getLogger(__name__)


def _is_admin_user(user) -> bool:
    """Check if user is admin."""
    return getattr(user, 'role', None) in ('admin', 'sys_admin') or getattr(user, 'is_superuser', False)


# ============================================
# FORMS
# ============================================

class FormSchemaViewSet(ScopedModelViewSet):
    permission_module = 'automations'
    permission_page = 'forms'
    queryset = FormSchema.objects.all()
    serializer_class = FormSchemaSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    @action(detail=True, methods=['post'], url_path='create-variable')
    def create_variable(self, request, pk=None):
        """
        Create a calculated variable definition
        
        POST /api/form-schemas/{id}/create-variable/
        Body: {
            "name": "total_with_tax",
            "type": "number",
            "calculation_type": "formula",
            "formula": "amount * 1.1",
            "description": "Amount with 10% tax"
        }
        
        This stores the variable definition in workflow context
        for later use in workflow steps
        """
        try:
            form_schema = self.get_object()
            
            variable_data = {
                'name': request.data.get('name'),
                'type': request.data.get('type', 'string'),
                'calculation_type': request.data.get('calculation_type', 'formula'),
                'formula': request.data.get('formula'),
                'template': request.data.get('template'),
                'function': request.data.get('function'),
                'function_args': request.data.get('function_args'),
                'description': request.data.get('description', ''),
            }
            
            # Validate
            if not variable_data['name']:
                return Response(
                    {'error': 'Variable name is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Store in form schema metadata
            metadata = form_schema.metadata or {}
            variables = metadata.get('calculated_variables', [])
            
            # Check for duplicate
            existing = next((v for v in variables if v['name'] == variable_data['name']), None)
            if existing:
                return Response(
                    {'error': f"Variable '{variable_data['name']}' already exists"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Add variable
            variables.append(variable_data)
            metadata['calculated_variables'] = variables
            form_schema.metadata = metadata
            form_schema.save()
            
            return Response({
                'success': True,
                'variable': variable_data
            }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.exception("Failed to create calculated variable")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='variables')
    def get_variables(self, request, pk=None):
        """
        Get all variables available for this form
        
        GET /api/form-schemas/{id}/variables/
        
        Returns:
        {
            "form_fields": [...],  # Variables from form fields
            "calculated": [...],   # Calculated variables
            "all": [...]           # Combined list
        }
        """
        try:
            form_schema = self.get_object()
            
            # Form field variables
            form_fields = []
            for field in form_schema.schema.get('fields', []):
                form_fields.append({
                    'id': f"form_{field['id']}",
                    'name': field['label'],
                    'path': f"form.{field['id']}",
                    'type': self._map_field_type(field['type']),
                    'source': 'form',
                })
            
            # Calculated variables
            calculated = form_schema.metadata.get('calculated_variables', []) if form_schema.metadata else []
            calc_vars = []
            for calc in calculated:
                calc_vars.append({
                    'id': f"calc_{calc['name']}",
                    'name': calc['name'],
                    'path': f"calc.{calc['name']}",
                    'type': calc['type'],
                    'source': 'calculated',
                })
            
            return Response({
                'form_fields': form_fields,
                'calculated': calc_vars,
                'all': form_fields + calc_vars
            })
        
        except Exception as e:
            logger.exception("Failed to get variables")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _map_field_type(self, field_type: str) -> str:
        """Map form field type to variable type"""
        mapping = {
            'number': 'number',
            'text': 'string',
            'textarea': 'string',
            'email': 'string',
            'date': 'date',
            'select': 'string',
        }
        return mapping.get(field_type, 'string')


class FormSubmissionViewSet(ScopedModelViewSet):
    permission_module = 'automations'
    permission_page = 'form-submissions'
    queryset = FormSubmission.objects.select_related('form_schema').all()
    serializer_class = FormSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=['get'], url_path='my_submissions')
    def my_submissions(self, request):
        user = request.user
        qs = self.get_queryset().filter(owner=user) if user and user.is_authenticated else self.get_queryset().none()
        page = self.paginate_queryset(qs)
        if page is not None:
            ser = self.get_serializer(page, many=True)
            return self.get_paginated_response(ser.data)
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)
    
    @action(detail=True, methods=['get'], url_path='workflow-status')
    def workflow_status(self, request, pk=None):
        """
        Get workflow execution status for a form submission.
        Returns workflow run details, execution log, and any created transactions.
        """
        submission = self.get_object()
        
        # Get associated workflow runs
        workflow_runs = WorkflowRun.objects.filter(
            form_submission=submission
        ).order_by('-created_at')
        
        if not workflow_runs.exists():
            return Response({
                'status': 'no_workflow',
                'message': 'No workflow triggered for this submission',
                'submission_reference': submission.submission_reference,
            })
        
        workflow_run = workflow_runs.first()
        
        # Get execution details
        execution_data = {
            'status': workflow_run.status,
            'run_reference': workflow_run.run_reference,
            'started_at': workflow_run.started_at,
            'completed_at': workflow_run.completed_at,
            'duration_ms': workflow_run.duration_ms,
            'error_message': workflow_run.error_message,
            'error_step_id': workflow_run.error_step_id,
            'execution_log': workflow_run.execution_log,
            'context': workflow_run.context,
        }
        
        # Check for created transactions
        from transactions.models import Transaction
        transactions = Transaction.objects.filter(
            workflow_reference=workflow_run.run_reference
        )
        
        if transactions.exists():
            from transactions.serializers import TransactionSerializer
            execution_data['transactions'] = TransactionSerializer(
                transactions, many=True
            ).data
        else:
            execution_data['transactions'] = []
        
        return Response({
            'status': 'success',
            'submission_reference': submission.submission_reference,
            'workflow': execution_data,
        })




# ============================================
# WORKFLOWS (ENHANCED WITH SUB-WORKFLOW SUPPORT)
# ============================================

class WorkflowTemplateViewSet(ScopedModelViewSet):
    """Enhanced workflow viewset with sub-workflow support."""
    permission_module = 'automations'
    permission_page = 'workflow-templates'
    queryset = WorkflowTemplate.objects.all()
    serializer_class = WorkflowTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        obj = self.get_object()
        if not _is_admin_user(request.user):
            return Response({'detail': 'Not allowed'}, status=status.HTTP_403_FORBIDDEN)
        obj.is_active = True
        obj.save()
        return Response({'status': 'activated'})

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        obj = self.get_object()
        if not _is_admin_user(request.user):
            return Response({'detail': 'Not allowed'}, status=status.HTTP_403_FORBIDDEN)
        obj.is_active = False
        obj.save()
        return Response({'status': 'deactivated'})

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """Create a WorkflowRun for this template and queue execution."""
        template = self.get_object()
        payload = request.data.copy()
        context = payload.get('context', {})
        scheduled_at = payload.get('scheduled_at', None)
        
        with transaction.atomic():
            run = WorkflowRun.objects.create(
                template=template,
                context=context or {},
                scheduled_at=scheduled_at or None,
                owner=request.user,
                created_by=request.user
            )
        ser = WorkflowRunSerializer(run, context={'request': request})
        return Response(ser.data, status=status.HTTP_201_CREATED)

    # *** NEW: Get callable workflows for sub-workflow selection ***
    @action(detail=False, methods=['get'])
    def callable(self, request):
        """
        Get list of workflows that can be called by other workflows.
        Excludes private workflows and includes usage stats.
        """
        workflows = WorkflowTemplate.objects.filter(
            is_active=True,
            access_level__in=['public', 'internal']
        ).exclude(
            access_level='private'
        ).annotate(
            execution_count=Count('runs'),
            avg_duration=Avg('runs__duration_ms')
        ).order_by('category', 'name')
        
        # Group by category
        grouped = {}
        for workflow in workflows:
            category = workflow.category or 'Other'
            if category not in grouped:
                grouped[category] = []
            
            # derive required inputs and outputs dynamically
            required_inputs = self._extract_required_inputs(workflow)
            outputs = self._extract_outputs(workflow)

            grouped[category].append({
                'id': str(workflow.id),
                'name': workflow.name,
                'workflow_type': workflow.workflow_type,
                'access_level': workflow.access_level,
                'version': workflow.version,
                'is_atomic': workflow.is_atomic,
                'category': workflow.category,
                'description': workflow.description,
                'required_inputs': required_inputs,
                'outputs': outputs,
                'estimated_duration_ms': int(workflow.avg_duration or 0),
                'usage_count': workflow.usage_count,
            })
        
        return Response({
            'workflows': [
                item for category_items in grouped.values() 
                for item in category_items
            ]
        })

    # *** NEW: Get system workflows only ***
    @action(detail=False, methods=['get'])
    def system(self, request):
        """Get system workflows only."""
        workflows = WorkflowTemplate.objects.filter(
            workflow_type='system',
            is_active=True
        ).order_by('name')
        
        serializer = WorkflowSummarySerializer(workflows, many=True)
        return Response({'workflows': serializer.data})
    
    # *** NEW: Get master templates for subworkflow use ***
   # automations/views.py - FIXED master_templates endpoint

    @action(detail=False, methods=['get'], url_path='master-templates')
    def master_templates(self, request):
        """Get master templates - FIXED"""
        templates = WorkflowTemplate.objects.filter(
            workflow_type='master_template',
            is_active=True,
            branch=request.user.branch
        ).annotate(
            binding_count=Count('bindings'),
            execution_count=Count('runs')
        ).order_by('run_sequence')  # FIXED: Use run_sequence instead of 'code'
        
        # Group by account type
        grouped = {}
        for template in templates:
            # Extract account type from run_sequence
            account_type = template.run_sequence.split('_')[0].upper()
            
            if account_type not in grouped:
                grouped[account_type] = []
            
            # Determine required parameters
            required_params = {
                'target_account_id': {
                    'type': 'account',
                    'label': 'Target Account',
                    'required': True
                },
                'target_account_name': {
                    'type': 'string',
                    'label': 'Target Account Name',
                    'required': True
                },
            }
            
            # Add contra_account_id if not dynamic
            if '_dynamic' not in template.run_sequence:
                required_params['contra_account_id'] = {
                    'type': 'account',
                    'label': 'Contra Account',
                    'required': True
                }
            
            # Form inputs
            form_inputs = {
                'amount': {'type': 'number', 'required': True},
                'description': {'type': 'string', 'required': True},
                'transaction_date': {'type': 'date', 'required': True},
            }
            
            if '_dynamic' in template.run_sequence:
                form_inputs['contra_account_id'] = {
                    'type': 'account',
                    'required': True,
                    'label': 'Payment Method'
                }
            
            grouped[account_type].append({
                'id': template.id,
                'code': template.run_sequence,  # Use run_sequence as 'code'
                'name': template.name,
                'description': template.description,
                'account_type': account_type,
                'has_approval': '_approval' in template.run_sequence,
                'is_dynamic_contra': '_dynamic' in template.run_sequence,
                'required_parameters': required_params,
                'required_form_inputs': form_inputs,
                'binding_count': template.binding_count,
                'execution_count': template.execution_count,
                'usage_stats': {
                    'total_bindings': template.binding_count,
                    'total_executions': template.execution_count,
                    'last_used': template.last_used_at.isoformat() if template.last_used_at else None
                }
            })
        
        return Response({
            'master_templates': grouped,
            'total_templates': len(templates),
            'by_account_type': {k: len(v) for k, v in grouped.items()}
        })
        # *** NEW: Validate workflow complexity ***
    @action(detail=False, methods=['post'])
    def validate_complexity(self, request):
        """
        Validate workflow complexity before saving.
        Checks: max_steps, max_depth, max_branches, circular references
        """
        workflow_def = request.data.get('workflow_definition', {})
        workflow_type = request.data.get('workflow_type', 'standard')
        
        # Get limits based on workflow type
        if workflow_type == 'system':
            limits = {'max_steps': 10, 'max_depth': 2, 'max_branches': 3}
        elif workflow_type == 'custom':
            limits = {'max_steps': 30, 'max_depth': 5, 'max_branches': 10}
        else:
            limits = {'max_steps': 15, 'max_depth': 3, 'max_branches': 5}
        
        errors = []
        warnings = []
        
        steps = workflow_def.get('steps', [])
        
        # Check step count
        if len(steps) > limits['max_steps']:
            errors.append(f"Too many steps: {len(steps)}/{limits['max_steps']}")
        elif len(steps) > limits['max_steps'] * 0.8:
            warnings.append(f"Approaching step limit: {len(steps)}/{limits['max_steps']}")
        
        # Check depth (count sub-workflow calls)
        max_depth = self._calculate_max_depth(steps)
        if max_depth > limits['max_depth']:
            errors.append(f"Too many nested sub-workflows: {max_depth}/{limits['max_depth']}")
        
        # Check branches (count conditions)
        branch_count = sum(1 for step in steps if step.get('type') in ['condition', 'approval', 'terminal_condition'])
        if branch_count > limits['max_branches']:
            errors.append(f"Too many conditional branches: {branch_count}/{limits['max_branches']}")
        
        # Check circular references
        circular = self._detect_circular_references(steps)
        if circular:
            errors.append(f"Circular reference detected: {' -> '.join(circular)}")
        
        return Response({
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'complexity': {
                'steps': len(steps),
                'max_depth': max_depth,
                'branches': branch_count,
                'sub_workflows': sum(1 for s in steps if s.get('type') == 'sub_workflow'),
            }
        })
    
    def _calculate_max_depth(self, steps, current_depth=0):
        """Calculate maximum depth of sub-workflow nesting."""
        max_depth = current_depth
        
        for step in steps:
            if step.get('type') == 'sub_workflow':
                depth = current_depth + 1
                if depth > max_depth:
                    max_depth = depth
        
        return max_depth
    
    def _detect_circular_references(self, steps):
        """Detect circular references in workflow steps."""
        graph = {}
        for step in steps:
            step_id = step.get('id')
            next_steps = []
            
            if step.get('next'):
                next_steps.append(step['next'])
            if step.get('on_true'):
                next_steps.append(step['on_true'])
            if step.get('on_false'):
                next_steps.append(step['on_false'])
            
            graph[step_id] = next_steps
        
        # DFS to detect cycles
        visited = set()
        rec_stack = set()
        
        def has_cycle(node, path):
            visited.add(node)
            rec_stack.add(node)
            
            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    result = has_cycle(neighbor, path + [neighbor])
                    if result:
                        return result
                elif neighbor in rec_stack:
                    return path + [neighbor]
            
            rec_stack.remove(node)
            return None
        
        for node in graph:
            if node not in visited:
                cycle = has_cycle(node, [node])
                if cycle:
                    return cycle
        
        return None

    # -------------------------------
    # Test workflow endpoint (runs in-memory simulation)
    # -------------------------------
    @action(detail=False, methods=['post'], url_path='test')
    def test_workflow(self, request):
        """
        Test a workflow with sample data WITHOUT saving to database
        
        POST /api/workflows/test/
        Body: {
            "workflow": {
                "name": "Test Workflow",
                "steps": [...],
                "trigger": {...}
            },
            "test_data": {
                "form": {
                    "amount": 1000,
                    "transaction_date": "2024-01-15",
                    "description": "Test transaction"
                }
            }
        }
        
        Returns: {
            "success": true,
            "results": [
                {
                    "step_id": "step_1",
                    "step_name": "Validate Input",
                    "status": "success",
                    "output": {...},
                    "timestamp": "2024-01-15T10:30:00Z"
                }
            ],
            "final_context": {...}
        }
        """
        try:
            workflow_data = request.data.get('workflow', {})
            test_data = request.data.get('test_data', {})
            
            if not workflow_data.get('steps'):
                return Response(
                    {'error': 'No steps provided in workflow'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            from .workflow_executor import WorkflowTestExecutor
            # Initialize test executor
            executor = WorkflowTestExecutor(
                steps=workflow_data['steps'],
                context=test_data,
                user=request.user,
                branch=request.user.branch
            )
            
            # Run test execution
            results = executor.execute()
            
            return Response({
                'success': results['success'],
                'results': results['step_results'],
                'final_context': results['context'],
                'error': results.get('error')
            })
        
        except Exception as e:
            logger.exception("Workflow test failed")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='callable')
    def callable_workflows(self, request):
        """
        Get list of workflows that can be called as sub-workflows
        
        GET /api/workflows/callable/
        
        Returns: {
            "workflows": [
                {
                    "id": 123,
                    "name": "Send Transaction Notification",
                    "code": "notify_transaction",
                    "description": "Sends notification about transaction",
                    "required_inputs": ["transaction_id", "amount"],
                    "outputs": ["notification_sent", "notification_id"]
                }
            ]
        }
        """
        try:
            # Filter workflows that are marked as callable/reusable
            workflows = WorkflowTemplate.objects.filter(
                branch=request.user.branch,
                is_active=True,
                access_level__in=['internal', 'public'],  # Exclude private workflows
                workflow_type__in=['template', 'reusable']  # Only callable types
            ).order_by('name')
            
            callable_list = []
            for wf in workflows:
                # Extract required inputs from workflow definition
                required_inputs = self._extract_required_inputs(wf)
                outputs = self._extract_outputs(wf)
                
                callable_list.append({
                    'id': wf.id,
                    'name': wf.name,
                    'code': wf.code,
                    'description': wf.description,
                    'required_inputs': required_inputs,
                    'outputs': outputs,
                })
            
            return Response({'workflows': callable_list})
        
        except Exception as e:
            logger.exception("Failed to fetch callable workflows")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _extract_required_inputs(self, workflow: WorkflowTemplate) -> list:
        """
        Extract required input variables from workflow definition
        
        Analyzes all steps to find external variable references
        """
        required_inputs = set()
        steps = workflow.workflow_definition.get('steps', [])
        
        for step in steps:
            config = step.get('config', {})
            # Recursively find ${variable} patterns
            self._find_variables(config, required_inputs)
        
        # Filter to only include "external" variables (not step outputs)
        external_inputs = [v for v in required_inputs if not v.startswith('step_')]
        
        return sorted(external_inputs)
    
    def _find_variables(self, obj, variables: set):
        """Recursively find ${variable} patterns in config"""
        import re
        
        if isinstance(obj, str):
            matches = re.findall(r'\$\{([^}]+)\}', obj)
            variables.update(matches)
        elif isinstance(obj, dict):
            for value in obj.values():
                self._find_variables(value, variables)
        elif isinstance(obj, list):
            for item in obj:
                self._find_variables(item, variables)
    
    def _extract_outputs(self, workflow: WorkflowTemplate) -> list:
        """
        Extract output variables from workflow
        
        These are variables created by workflow steps that can be used by parent workflow
        """
        outputs = []
        steps = workflow.workflow_definition.get('steps', [])
        
        for step in steps:
            # Steps that create outputs
            if step['type'] in ['calculation', 'query', 'transaction']:
                outputs.append(f"step_{step['id']}")
        
        return outputs


# ============================================
# WORKFLOW RUNS (ENHANCED WITH EXECUTION TREE)
# ============================================

class WorkflowRunViewSet(ScopedModelViewSet):
    permission_module = 'automations'
    permission_page = 'workflow-runs'
    queryset = WorkflowRun.objects.select_related('template').all()
    serializer_class = WorkflowRunSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        template_id = self.request.query_params.get('template_id')
        
        if status_param:
            qs = qs.filter(status=status_param)
        if template_id:
            try:
                qs = qs.filter(template_id=int(template_id))
            except ValueError:
                pass
        return qs

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        run = self.get_object()
        if run.owner != request.user and not _is_admin_user(request.user):
            return Response({'detail': 'Not allowed'}, status=status.HTTP_403_FORBIDDEN)
        
        run.status = 'cancelled'
        run.save()
        return Response({'status': 'cancelled'})

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        run = self.get_object()
        if not _is_admin_user(request.user):
            return Response({'detail': 'Not allowed'}, status=status.HTTP_403_FORBIDDEN)
        
        new_run = WorkflowRun.objects.create(
            template=run.template,
            context=run.context or {},
            owner=request.user,
            created_by=request.user
        )
        ser = self.get_serializer(new_run)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    # *** NEW: Get execution tree for debugging ***
    @action(detail=True, methods=['get'])
    def execution_tree(self, request, pk=None):
        """
        Get execution tree for a workflow execution.
        Shows parent-child relationships and step details.
        """
        try:
            execution = WorkflowRun.objects.get(id=pk)
        except WorkflowRun.DoesNotExist:
            return Response(
                {'error': 'Execution not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        tree = self._build_execution_tree(execution)
        return Response(tree)
    
    def _build_execution_tree(self, execution):
        """Recursively build execution tree."""
        # Get all step executions for this workflow execution
        steps = StepExecution.objects.filter(
            execution=execution
        ).order_by('started_at')
        
        # Get sub-workflow executions
        sub_executions = WorkflowRun.objects.filter(
            parent_execution=execution
        ).order_by('started_at')
        
        return {
            'id': str(execution.id),
            'workflow_id': str(execution.template.id),
            'workflow_name': execution.template.name,
            'workflow_type': execution.template.workflow_type,
            'depth': execution.depth,
            'status': execution.status,
            'started_at': execution.started_at.isoformat() if execution.started_at else None,
            'completed_at': execution.completed_at.isoformat() if execution.completed_at else None,
            'duration_ms': execution.duration_ms,
            
            # Step details
            'steps': [{
                'id': str(step.id),
                'step_id': step.step_id,
                'step_name': step.step_name,
                'step_type': step.step_type,
                'status': step.status,
                'started_at': step.started_at.isoformat(),
                'completed_at': step.completed_at.isoformat() if step.completed_at else None,
                'duration_ms': step.duration_ms,
                'input_data': step.input_data,
                'output_data': step.output_data,
                'variables_snapshot': step.variables_snapshot,
                'error_message': step.error_message,
                'retry_count': step.retry_count,
            } for step in steps],
            
            # Recursive sub-executions
            'sub_workflows': [
                self._build_execution_tree(sub_exec)
                for sub_exec in sub_executions
            ],
            
            # Metrics
            'metrics': {
                'total_steps': steps.count(),
                'failed_steps': steps.filter(status='failed').count(),
                'sub_workflows_called': sub_executions.count(),
            }
        }


# ============================================
# APPROVALS
# ============================================


class WorkflowApprovalViewSet(ScopedModelViewSet):
    """
    ViewSet for managing workflow approvals
    """
    permission_module = 'automations'
    permission_page = 'workflow-approvals'
    queryset = WorkflowApproval.objects.all()
    serializer_class = WorkflowApprovalSerializer
    
    def get_queryset(self):
        """Filter to user's approvals"""
        return WorkflowApproval.objects.filter(
            approver=self.request.user
        ).order_by('-created_at')
    
    @action(detail=False, methods=['get'], url_path='pending')
    def pending_approvals(self, request):
        """
        Get all pending approvals for current user
        
        GET /api/approvals/pending/
        """
        approvals = WorkflowApproval.objects.filter(
            approver=request.user,
            status='pending'
        ).select_related('workflow_run', 'workflow_run__template')
        
        serializer = self.get_serializer(approvals, many=True)
        return Response({
            'count': approvals.count(),
            'approvals': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve an approval request
        
        POST /api/approvals/{id}/approve/
        Body: {
            "comment": "Approved - looks good"  # Optional
        }
        """
        approval = self.get_object()
        
        # Check if user is the approver
        if approval.approver != request.user:
            return Response(
                {'error': 'You are not authorized to approve this request'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already decided
        if approval.status != 'pending':
            return Response(
                {'error': f'Approval already {approval.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Approve
        approval.approve(request.user)
        
        return Response({
            'success': True,
            'message': 'Approval granted',
            'approval': self.get_serializer(approval).data
        })
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject an approval request
        
        POST /api/approvals/{id}/reject/
        Body: {
            "reason": "Amount too high"  # Required
        }
        """
        approval = self.get_object()
        
        # Check if user is the approver
        if approval.approver != request.user:
            return Response(
                {'error': 'You are not authorized to reject this request'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already decided
        if approval.status != 'pending':
            return Response(
                {'error': f'Approval already {approval.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get rejection reason
        reason = request.data.get('reason', '')
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Reject
        approval.reject(request.user, reason)
        
        return Response({
            'success': True,
            'message': 'Approval rejected',
            'approval': self.get_serializer(approval).data
        })
    
    @action(detail=False, methods=['post'], url_path='bulk-approve')
    def bulk_approve(self, request):
        """
        Bulk approve multiple approval requests
        
        POST /api/approvals/bulk-approve/
        Body: {
            "approval_ids": [1, 2, 3],
            "comment": "All approved"  # Optional
        }
        """
        approval_ids = request.data.get('approval_ids', [])
        comment = request.data.get('comment', '')
        
        if not approval_ids:
            return Response(
                {'error': 'approval_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get approvals
        approvals = WorkflowApproval.objects.filter(
            id__in=approval_ids,
            approver=request.user,
            status='pending'
        )
        
        results = []
        approved_count = 0
        
        for approval in approvals:
            try:
                approval.approve(request.user)
                approved_count += 1
                results.append({
                    'id': approval.id,
                    'success': True,
                    'message': 'Approved'
                })
            except Exception as e:
                results.append({
                    'id': approval.id,
                    'success': False,
                    'error': str(e)
                })
        
        return Response({
            'success': True,
            'approved_count': approved_count,
            'total_requested': len(approval_ids),
            'results': results
        })
    
    @action(detail=False, methods=['post'], url_path='bulk-reject')
    def bulk_reject(self, request):
        """
        Bulk reject multiple approval requests
        
        POST /api/approvals/bulk-reject/
        Body: {
            "approval_ids": [1, 2, 3],
            "reason": "Budget constraints"  # Required
        }
        """
        approval_ids = request.data.get('approval_ids', [])
        reason = request.data.get('reason', '')
        
        if not approval_ids:
            return Response(
                {'error': 'approval_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not reason:
            return Response(
                {'error': 'reason is required for bulk rejection'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get approvals
        approvals = WorkflowApproval.objects.filter(
            id__in=approval_ids,
            approver=request.user,
            status='pending'
        )
        
        results = []
        rejected_count = 0
        
        for approval in approvals:
            try:
                approval.reject(request.user, reason)
                rejected_count += 1
                results.append({
                    'id': approval.id,
                    'success': True,
                    'message': 'Rejected'
                })
            except Exception as e:
                results.append({
                    'id': approval.id,
                    'success': False,
                    'error': str(e)
                })
        
        return Response({
            'success': True,
            'rejected_count': rejected_count,
            'total_requested': len(approval_ids),
            'results': results
        })




# ============================================
# APPROVAL DELEGATION VIEWSET (PHASE 2B)
# ============================================

from automations.models import ApprovalDelegation
from automations.serializers import ApprovalDelegationSerializer

class ApprovalDelegationViewSet(ScopedModelViewSet):
    """
    Manage approval delegations
    """
    permission_module = 'automations'
    permission_page = 'approval-delegations'
    queryset = ApprovalDelegation.objects.all()
    serializer_class = ApprovalDelegationSerializer
    
    def get_queryset(self):
        """Filter to user's delegations"""
        return ApprovalDelegation.objects.filter(
            models.Q(delegator=self.request.user) |
            models.Q(delegate=self.request.user)
        ).order_by('-start_date')
    
    @action(detail=False, methods=['get'], url_path='my-active')
    def my_active(self, request):
        """
        Get all active delegations for current user
        
        GET /api/delegations/my-active/
        """
        today = timezone.now().date()
        
        # Delegations given by user
        given = ApprovalDelegation.objects.filter(
            delegator=request.user,
            is_active=True,
            is_deleted=False,
            start_date__lte=today,
            end_date__gte=today
        )
        
        # Delegations received by user
        received = ApprovalDelegation.objects.filter(
            delegate=request.user,
            is_active=True,
            is_deleted=False,
            start_date__lte=today,
            end_date__gte=today
        )
        
        return Response({
            'delegations_given': self.get_serializer(given, many=True).data,
            'delegations_received': self.get_serializer(received, many=True).data
        })




# ============================================
# ADDITIONAL API ENDPOINTS
# ============================================

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def validate_workflow(request):
    """
    Validate a workflow definition without saving.
    
    POST /api/automations/workflows/validate/
    """
    from automations.validators import WorkflowValidator
    
    workflow_def = request.data.get('workflow_definition', {})
    trigger_type = request.data.get('trigger_type', 'manual')
    trigger_config = request.data.get('trigger_config', {})
    
    validator = WorkflowValidator(workflow_def, trigger_type, trigger_config)
    result = validator.validate()
    
    return Response(result)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_whitelisted_functions(request):
    """
    Get list of whitelisted math functions for calculations.
    
    GET /api/automations/functions/
    """
    return Response({
        'functions': ['sum', 'avg', 'min', 'max', 'round', 'abs', 'floor', 'ceil']
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_notification_templates(request, notification_type):
    """
    Get notification templates for a specific type.
    
    GET /api/automations/notification-templates/{type}/
    """
    # Mock templates - replace with actual database query
    templates = {
        'email': [
            {
                'id': 'withdrawal_approved',
                'name': 'Withdrawal Approved',
                'required_vars': ['amount', 'account_number', 'timestamp']
            },
            {
                'id': 'withdrawal_rejected',
                'name': 'Withdrawal Rejected',
                'required_vars': ['amount', 'reason', 'timestamp']
            },
        ],
        'sms': [
            {
                'id': 'transaction_alert',
                'name': 'Transaction Alert',
                'required_vars': ['amount', 'type', 'balance']
            },
        ],
        'in_app': [
            {
                'id': 'account_verified',
                'name': 'Account Verified',
                'required_vars': ['account_number']
            },
        ],
    }
    
    return Response({
        'templates': templates.get(notification_type, [])
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_approval_roles(request):
    """
    Get available approval roles.
    
    GET /api/automations/approval-roles/
    """
    return Response({
        'roles': ['admin', 'manager', 'finance_director', 'cfo', 'compliance_officer']
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_allowed_transaction_types(request):
    """
    Get allowed transaction types.
    
    GET /api/automations/transaction-types/
    """
    return Response({
        'types': ['DEBIT', 'CREDIT', 'TRANSFER', 'FEE', 'REFUND', 'REVERSAL']
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def celery_health_check(request):
    """
    Check if Celery workers are running and responding.
    
    GET /api/automations/celery-health/
    
    Returns:
        - status: 'healthy', 'degraded', or 'offline'
        - active_workers: number of active workers
        - message: status description
    """
    from celery import current_app
    import socket
    
    try:
        # Check if Celery broker (Redis) is accessible
        inspect = current_app.control.inspect()
        
        # Get active workers
        active_workers = inspect.active()
        
        if active_workers is None:
            return Response({
                'status': 'offline',
                'active_workers': 0,
                'message': 'Cannot connect to Celery broker. Please ensure Redis and Celery workers are running.',
                'details': {
                    'broker_url': current_app.conf.broker_url,
                    'workers': []
                }
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        worker_count = len(active_workers)
        
        if worker_count == 0:
            return Response({
                'status': 'degraded',
                'active_workers': 0,
                'message': 'Celery broker is accessible but no workers are running. Workflows will be queued but not executed.',
                'details': {
                    'broker_url': current_app.conf.broker_url,
                    'workers': []
                }
            }, status=status.HTTP_200_OK)
        
        # Get worker details
        worker_stats = inspect.stats()
        worker_details = []
        
        for worker_name, tasks in active_workers.items():
            stats = worker_stats.get(worker_name, {}) if worker_stats else {}
            worker_details.append({
                'name': worker_name,
                'active_tasks': len(tasks),
                'total_tasks': stats.get('total', {}).get('automations.tasks.execute_workflow_task', 0)
            })
        
        return Response({
            'status': 'healthy',
            'active_workers': worker_count,
            'message': f'{worker_count} Celery worker(s) active and ready to process workflows.',
            'details': {
                'broker_url': current_app.conf.broker_url,
                'workers': worker_details
            }
        })
        
    except socket.error as e:
        return Response({
            'status': 'offline',
            'active_workers': 0,
            'message': f'Cannot connect to Celery broker: {str(e)}',
            'details': {
                'error': str(e)
            }
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    except Exception as e:
        logger.exception("Celery health check failed")
        return Response({
            'status': 'unknown',
            'active_workers': 0,
            'message': f'Health check error: {str(e)}',
            'details': {
                'error': str(e)
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.apps import apps


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_whitelisted_entities(request):
    """
    Get list of whitelisted entities for query steps.
    
    GET /api/automations/entities/
    """
    from automations.validators import WorkflowValidator
    
    entities = []
    for entity_name in WorkflowValidator.ALLOWED_MODELS.keys():
        entities.append({
            'name': entity_name,
            'label': entity_name,
            'supports_hierarchy': entity_name == 'Account'
        })
    
    return Response({'entities': entities})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_entity_fields(request, entity_name):
    """
    Get available fields for an entity with hierarchy support.
    
    GET /api/automations/entities/{entity_name}/fields/
    
    For Account entity, returns hierarchy-aware fields.
    """
    from automations.validators import WorkflowValidator
    
    if entity_name not in WorkflowValidator.ALLOWED_MODELS:
        return Response(
            {'error': f'Entity {entity_name} not allowed'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        model = apps.get_model(WorkflowValidator.ALLOWED_MODELS[entity_name])
        
        fields = []
        for field in model._meta.get_fields():
            if not field.many_to_many and not field.one_to_many:
                field_type = field.get_internal_type()
                
                # Determine operators based on field type
                if field_type in ('IntegerField', 'DecimalField', 'FloatField'):
                    operators = ['==', '!=', '>', '>=', '<', '<=']
                    field_data_type = 'number'
                elif field_type in ('CharField', 'TextField'):
                    operators = ['==', '!=', 'contains', 'starts_with', 'ends_with']
                    field_data_type = 'string'
                elif field_type in ('DateField', 'DateTimeField'):
                    operators = ['==', '!=', '>', '>=', '<', '<=']
                    field_data_type = 'date'
                elif field_type == 'BooleanField':
                    operators = ['==', '!=']
                    field_data_type = 'boolean'
                elif field_type == 'ForeignKey':
                    operators = ['==', '!=']
                    field_data_type = 'object'
                else:
                    operators = ['==', '!=']
                    field_data_type = 'string'
                
                field_info = {
                    'name': field.name,
                    'type': field_data_type,
                    'filterable': True,
                    'updatable': not field.primary_key and not field.name in ['created_at', 'updated_at', 'version'],
                    'operators': operators,
                    'is_relation': field_type == 'ForeignKey'
                }
                
                # Add special handling for Account parent field
                if entity_name == 'Account' and field.name == 'parent':
                    field_info['is_hierarchical'] = True
                    field_info['hierarchy_type'] = 'parent'
                
                fields.append(field_info)
        
        # Add computed fields for Account
        if entity_name == 'Account':
            fields.extend([
                {
                    'name': 'children_count',
                    'type': 'number',
                    'filterable': False,
                    'updatable': False,
                    'operators': [],
                    'computed': True,
                    'description': 'Number of child accounts'
                },
                {
                    'name': 'hierarchy_path',
                    'type': 'string',
                    'filterable': False,
                    'updatable': False,
                    'operators': [],
                    'computed': True,
                    'description': 'Full hierarchy path'
                },
                {
                    'name': 'total_children_balance',
                    'type': 'number',
                    'filterable': False,
                    'updatable': False,
                    'operators': [],
                    'computed': True,
                    'description': 'Sum of all child account balances'
                }
            ])
        
        return Response({
            'fields': fields,
            'supports_hierarchy': entity_name == 'Account'
        })
    
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def get_account_hierarchy(request):
    """
    Get parent accounts (general ledger) with optional child account listing.
    
    GET /api/automations/accounts/hierarchy/
    
    Query params:
    - parent_only: If true, return only parent accounts
    - parent_code: If provided, return children of this parent
    - account_type: Filter by account type (SAVINGS, LOAN, etc.)
    """
    from accounts.models import Account
    
    parent_only = request.query_params.get('parent_only', 'false').lower() == 'true'
    parent_code = request.query_params.get('parent_code')
    account_type = request.query_params.get('account_type')
    
    try:
        if parent_code:
            # Get specific parent and its children
            parent = Account.objects.get(
                code=parent_code,
                account_level=Account.LEVEL_PARENT
            )
            
            children = parent.children.filter(is_deleted=False)
            if account_type:
                children = children.filter(account_type=account_type)
            
            return Response({
                'parent': {
                    'id': parent.id,
                    'code': parent.code,
                    'name': parent.name,
                    'account_type': parent.account_type,
                    'balance': str(parent.balance),
                    'children_count': children.count()
                },
                'children': [
                    {
                        'id': child.id,
                        'code': child.code,
                        'name': child.name,
                        'account_type': child.account_type,
                        'balance': str(child.balance),
                        'parent_code': child.parent.code,
                        'hierarchy_path': child.get_hierarchy_path()
                    }
                    for child in children
                ]
            })
        
        else:
            # Get all parent accounts
            parents = Account.objects.filter(
                account_level=Account.LEVEL_PARENT,
                is_deleted=False
            )
            
            if account_type:
                parents = parents.filter(account_type=account_type)
            
            result = []
            for parent in parents:
                parent_data = {
                    'id': parent.id,
                    'code': parent.code,
                    'name': parent.name,
                    'account_type': parent.account_type,
                    'balance': str(parent.balance),
                    'children_count': parent.children.filter(is_deleted=False).count()
                }
                
                if not parent_only:
                    # Include children
                    parent_data['children'] = [
                        {
                            'id': child.id,
                            'code': child.code,
                            'name': child.name,
                            'balance': str(child.balance),
                            'hierarchy_path': child.get_hierarchy_path()
                        }
                        for child in parent.children.filter(is_deleted=False)
                    ]
                
                result.append(parent_data)
            
            return Response({
                'parents': result,
                'total_count': len(result)
            })
    
    except Account.DoesNotExist:
        return Response(
            {'error': 'Account not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

# automations/views.py - Add this action

@action(detail=False, methods=['post'], url_path='test')
def test_workflow(self, request):
    """
    Test a workflow with sample data WITHOUT saving to database
    
    POST /api/workflows/test/
    Body: {
        "steps": [...],
        "test_data": {"form": {"amount": 1000, ...}}
    }
    """
    try:
        steps = request.data.get('steps', [])
        test_data = request.data.get('test_data', {})
        
        # Simulate execution
        results = []
        context = test_data.copy()
        
        for step in steps:
            # Mock execution - don't actually run
            result = {
                'step_id': step['id'],
                'step_name': step['name'],
                'status': 'success',
                'output': f'Simulated: {step["type"]} completed',
                'timestamp': timezone.now().isoformat(),
            }
            results.append(result)
            
            # Update context with mock result
            context[f"step_{step['id']}"] = {'result': 'mocked'}
        
        return Response({
            'success': True,
            'results': results,
            'final_context': context
        })
    
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=400)