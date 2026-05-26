
from rest_framework import serializers
from .models import WorkflowApproval, WorkflowTemplate, WorkflowRun, FormSchema, FormSubmission


# automations/serializers.py - FIXED

class WorkflowTemplateSerializer(serializers.ModelSerializer):
    """Fixed to use run_sequence as code"""
    
    code = serializers.CharField(source='run_sequence', read_only=True)
    required_inputs = serializers.SerializerMethodField()
    outputs = serializers.SerializerMethodField()
    is_callable = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkflowTemplate
        fields = [
            'id', 'code', 'name', 'description',
            'trigger_type', 'trigger_config',
            'workflow_definition', 'workflow_type',
            'access_level', 'is_active',
            'required_inputs', 'outputs', 'is_callable',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'created_at', 'updated_at']
    
    def get_required_inputs(self, obj):
        """Extract required inputs from workflow definition"""
        return self._extract_required_inputs(obj)
    
    def get_outputs(self, obj):
        """Extract outputs from workflow definition"""
        return self._extract_outputs(obj)
    
    def get_is_callable(self, obj):
        """Check if workflow can be called as sub-workflow"""
        return (
            obj.is_active and
            obj.access_level in ['internal', 'public'] and
            obj.workflow_type in ['template', 'reusable']
        )
    
    def _extract_required_inputs(self, obj):
        """Find ${variable} patterns in workflow"""
        import re
        required = set()
        steps = obj.workflow_definition.get('steps', [])
        
        for step in steps:
            config = step.get('config', {})
            self._find_variables(config, required)
        
        # Filter external variables only
        return sorted([v for v in required if not v.startswith('step_')])
    
    def _find_variables(self, obj, variables: set):
        """Recursively find ${variable} patterns"""
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
    
    def _extract_outputs(self, obj):
        """Get step outputs"""
        outputs = []
        steps = obj.workflow_definition.get('steps', [])
        
        for step in steps:
            if step['type'] in ['calculation', 'query', 'transaction']:
                outputs.append(f"step_{step['id']}")
        
        return outputs


class FormSchemaSerializer(serializers.ModelSerializer):
    """Enhanced with variables support"""
    
    available_variables = serializers.SerializerMethodField()
    calculated_variables = serializers.SerializerMethodField()
    
    class Meta:
        model = FormSchema
        fields = [
            'id', 'name', 'description',
            'schema', 'trigger_event_name',
            'metadata', 'is_active',
            'available_variables', 'calculated_variables',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_available_variables(self, obj):
        """Get all variables from form fields"""
        variables = []
        
        # Handle both model instances and validated_data dicts
        if isinstance(obj, dict):
            schema = obj.get('schema', {})
        else:
            schema = obj.schema if hasattr(obj, 'schema') else {}
        
        for field in schema.get('fields', []):
            variables.append({
                'id': f"form_{field['id']}",
                'name': field.get('label', field['id']),
                'path': f"form.{field['id']}",
                'type': self._map_field_type(field.get('type', 'text')),
                'source': 'form',
            })
        
        return variables
    
    def get_calculated_variables(self, obj):
        """Get calculated variables if metadata exists"""
        # Handle both model instances and validated_data dicts
        if isinstance(obj, dict):
            metadata = obj.get('metadata', {})
        else:
            metadata = obj.metadata if hasattr(obj, 'metadata') else {}
        
        if not metadata:
            return []
        
        calc_vars = metadata.get('calculated_variables', [])
        return [
            {
                'id': f"calc_{var['name']}",
                'name': var['name'],
                'path': f"calc.{var['name']}",
                'type': var['type'],
                'source': 'calculated',
                'calculation_type': var.get('calculation_type'),
            }
            for var in calc_vars
        ]
    
    def _map_field_type(self, field_type: str) -> str:
        """Map form field type to variable type"""
        mapping = {
            'number': 'number',
            'text': 'string',
            'textarea': 'string',
            'email': 'string',
            'date': 'date',
            'select': 'string',
            'checkbox': 'boolean',
        }
        return mapping.get(field_type, 'string')


class WorkflowRunSerializer(serializers.ModelSerializer):
    """Enhanced run serializer with step results"""
    
    step_logs = serializers.SerializerMethodField()
    template_name = serializers.CharField(source='template.name', read_only=True)
    
    class Meta:
        model = WorkflowRun
        fields = [
            'id', 'run_reference', 'template', 'template_name',
            'status', 'context', 'current_step_id',
            'started_at', 'completed_at', 'duration_ms',
            'error_message', 'error_step_id',
            'step_logs',
            'created_at'
        ]
        read_only_fields = [
            'id', 'run_reference', 'status',
            'started_at', 'completed_at', 'duration_ms',
            'error_message', 'error_step_id',
            'created_at'
        ]
    
    def get_step_logs(self, obj):
        """Get execution logs for all steps"""
        if not obj.execution_log:
            return []
        
        # execution_log is a list of step executions
        return obj.execution_log if isinstance(obj.execution_log, list) else []


class FormSubmissionSerializer(serializers.ModelSerializer):
    """Form submission with workflow trigger"""
    
    workflow_run = serializers.PrimaryKeyRelatedField(read_only=True)
    form_schema_name = serializers.CharField(source='form_schema.name', read_only=True)
    submitted_by = serializers.SerializerMethodField()
    submitted_at = serializers.DateTimeField(source='created_at', read_only=True)
    
    class Meta:
        model = FormSubmission
        fields = [
            'id', 'form_schema', 'form_schema_name',
            'data', 'workflow_run',
            'submitted_by', 'submitted_at'
        ]
        read_only_fields = ['id', 'workflow_run', 'submitted_at', 'submitted_by']
    
    def get_submitted_by(self, obj):
        """Get the user who submitted the form"""
        return obj.created_by.id if obj.created_by else None
    
    def create(self, validated_data):
        """Create form submission and trigger workflow"""
        request = self.context.get('request')
        form_schema = validated_data.get('form_schema')
        
        # Extract metadata from request for audit
        if request:
            validated_data['user_agent'] = request.META.get('HTTP_USER_AGENT', '')
            validated_data['ip_address'] = request.META.get('REMOTE_ADDR', '')
        
        # CRITICAL: Set owner/branch/created_by BEFORE super().create() so they're available
        # during FormSubmission.save() when _trigger_workflows() runs
        if form_schema:
            validated_data['owner'] = form_schema.owner
            validated_data['branch'] = form_schema.branch
        
        # Set created_by from request user if not already set
        if request and request.user and not validated_data.get('created_by'):
            validated_data['created_by'] = request.user
        
        # Create submission - this will call FormSubmission.save() which triggers workflows
        submission = super().create(validated_data)
        
        return submission


class WorkflowApprovalSerializer(serializers.ModelSerializer):
    """Serializer for workflow approvals"""
    
    workflow_name = serializers.CharField(source='workflow_run.template.name', read_only=True)
    workflow_run_reference = serializers.CharField(source='workflow_run.run_reference', read_only=True)
    approver_email = serializers.CharField(source='approver.email', read_only=True)
    approved_by_email = serializers.CharField(source='approved_by.email', read_only=True)
    
    # Include context data for approval UI
    form_data = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkflowApproval
        fields = [
            'id',
            'workflow_run',
            'workflow_name',
            'workflow_run_reference',
            'step_id',
            'approver',
            'approver_email',
            'status',
            'approval_message',
            'context_data',
            'form_data',
            'approved_by',
            'approved_by_email',
            'approved_at',
            'rejection_reason',
            'timeout_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'workflow_run',
            'step_id',
            'status',
            'approved_by',
            'approved_at',
            'created_at',
            'updated_at',
        ]
    
    def get_form_data(self, obj):
        """Extract form data for display"""
        return obj.context_data.get('form_data', {})


# ============================================
# PHASE 2B SERIALIZERS
# ============================================

class ApprovalDelegationSerializer(serializers.ModelSerializer):
    """Serializer for approval delegations"""
    
    delegator_name = serializers.CharField(source='delegator.get_full_name', read_only=True)
    delegator_username = serializers.CharField(source='delegator.username', read_only=True)
    delegate_name = serializers.CharField(source='delegate.get_full_name', read_only=True)
    delegate_username = serializers.CharField(source='delegate.username', read_only=True)
    is_currently_active = serializers.SerializerMethodField()
    
    class Meta:
        from automations.models import ApprovalDelegation
        model = ApprovalDelegation
        fields = [
            'id',
            'delegator',
            'delegator_name',
            'delegator_username',
            'delegate',
            'delegate_name',
            'delegate_username',
            'start_date',
            'end_date',
            'is_active',
            'is_currently_active',
            'reason',
            'workflow_types',
            'approval_limit',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_is_currently_active(self, obj):
        """Check if delegation is active right now"""
        return obj.is_currently_active()
    
    def validate(self, data):
        """Validate delegation data"""
        if data.get('delegator') == data.get('delegate'):
            raise serializers.ValidationError("Cannot delegate to yourself")
        
        if data.get('end_date') < data.get('start_date'):
            raise serializers.ValidationError("End date must be after start date")
        
        return data


class WorkflowSummarySerializer:
    def __init__(self):
        pass

    def __getattr__(self, name):
        raise NotImplementedError

    def __setattr__(self, name, value):
        if name == '__init__':
            super().__setattr__(name, value)
        else:
            raise NotImplementedError

    def __call__(self, *args, **kwargs):
        raise NotImplementedError