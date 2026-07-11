# ============================================
# File: automations/models.py (UNIFIED WITH SUB-WORKFLOWS)
# Combines your existing structure + sub-workflow capabilities
# ============================================

from django.db import models, connection, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.dispatch import Signal
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
import json
from decimal import Decimal


def serialize_for_json(obj):
    """Convert objects to JSON-serializable format"""
    if isinstance(obj, Decimal):
        return str(obj)  # Preserve precision as string
    elif isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [serialize_for_json(item) for item in obj]
    return obj
# Use string references to avoid circular imports
from django.contrib.auth import get_user_model
import json
import logging
import uuid

logger = logging.getLogger(__name__)

# Domain event signal for triggering workflows
workflow_triggered = Signal()


# ============================================
# PART 1: FORMS & PRODUCTS (Your existing code)
# ============================================

class FormSchema(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines reusable forms that users fill out.
    When submitted, these trigger workflow events.
    """
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    schema = models.JSONField(
        help_text="Form field definitions and validation rules"
    )
    
    trigger_event_name = models.CharField(
        max_length=100,
        help_text="Event name triggered when form is submitted",
        default="form-submission"
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional metadata including calculated variables"
    )
    
    # Active flag to enable/disable form triggers and visibility
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = "Form Schema"
        verbose_name_plural = "Form Schemas"
        ordering = ['-created_at']

    
    def __str__(self):
        return self.name
    
    def validate_data(self, data: dict) -> dict:
        """Validates form data against the schema."""
        errors = {}
        for field in self.schema.get("fields", []):
            field_id = field["id"]
            value = data.get(field_id)
            validation = field.get("validation", {})
            
            if validation.get("required") and not value:
                errors[field_id] = f"{field.get('label', field_id)} is required"
                continue
            
            if value and field.get("type") in ("number", "money"):
                try:
                    Decimal(str(value))
                except (TypeError, ValueError, Exception):
                    errors[field_id] = f"{field.get('label', field_id)} must be a number"
        
        return errors

# automations/models.py - FIXED FormSubmission

class FormSubmission(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Records form submissions and triggers workflow events - FIXED"""
    form_schema = models.ForeignKey(
        FormSchema,
        on_delete=models.CASCADE,
        related_name='submissions'
    )
    
    submission_reference = models.CharField(
        max_length=100,
        unique=True,
        editable=False
    )
    
    data = models.JSONField(default=dict)
    user_agent = models.CharField(max_length=512, blank=True, null=True)
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    schema_snapshot = models.JSONField(default=dict)
    
    status = models.CharField(
        max_length=20,
        choices=[
            ('submitted', 'Submitted'),
            ('processing', 'Processing'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
        ],
        default='submitted'
    )
    
    submitted_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-submitted_at']
    
    def __str__(self):
        return f"{self.submission_reference} - {self.form_schema.name}"
    
    def save(self, *args, **kwargs):
        """Save submission and trigger workflows - FIXED"""
        is_new = self.pk is None

        if is_new:
            with transaction.atomic():
                super().save(*args, **kwargs)

                # Generate reference
                if not self.submission_reference:
                    date_str = timezone.now().strftime("%Y%m%d")
                    self.submission_reference = f"SUB-{date_str}-{self.pk:06d}"
                    super().save(update_fields=['submission_reference'])

                # Snapshot schema
                if not self.schema_snapshot:
                    try:
                        self.schema_snapshot = self.form_schema.schema or {}
                    except Exception:
                        self.schema_snapshot = {}
                    super().save(update_fields=['schema_snapshot'])

                # Trigger workflows AFTER commit
                self._trigger_workflows()
        else:
            super().save(*args, **kwargs)
    
    def _trigger_workflows(self):
        """Trigger workflows - FIXED to use bindings"""
        from automations.models import WorkflowBinding
        
        def _trigger():
            logger.info(f"Triggering workflows for form submission {self.submission_reference}")
            
            # Find active bindings for this form
            bindings = WorkflowBinding.objects.filter(
                form_schema=self.form_schema,
                is_active=True
            ).select_related('workflow_template').order_by('-priority')
            
            if not bindings.exists():
                logger.warning(f"No workflow bindings found for form {self.form_schema.name}")
                return
            
            # Execute each binding
            for binding in bindings:
                try:
                    logger.info(
                        f"Executing binding: {binding.form_schema.name} → "
                        f"{binding.workflow_template.name}"
                    )
                    
                    # Prepare context with form data and binding parameters
                    # IMPORTANT: Nest data and workflow parameters to match template variable paths
                    context = {
                        'data': self.data,  # Nest form data under 'data' key
                        'workflow': binding.parameters,  # Nest binding parameters under 'workflow' key
                        'form_submission_id': self.id,
                        'submission_reference': self.submission_reference,
                        'form_name': self.form_schema.name,
                        'submitted_by': self.created_by.id if getattr(self, 'created_by', None) else None,
                        'user_agent': self.user_agent,
                        'ip_address': self.ip_address,
                    }
                    
                    # Create workflow run
                    run = WorkflowRun.objects.create(
                        template=binding.workflow_template,
                        binding=binding,
                        context=context,
                        owner=self.owner,
                        branch=self.branch,
                        created_by=self.created_by,
                        tenant=self.tenant,
                        form_submission=self
                    )
                    
                    # Update binding usage stats
                    binding.execution_count += 1
                    binding.last_executed_at = timezone.now()
                    binding.save(update_fields=['execution_count', 'last_executed_at'])
                    
                    logger.info(f"Created workflow run: {run.run_reference}")
                    
                except Exception as e:
                    logger.exception(
                        f"Failed to execute binding {binding.id} "
                        f"for form {self.form_schema.name}: {e}"
                    )
        
        transaction.on_commit(_trigger)
    
    def _matches_filters(self, filters: dict) -> bool:
        """Check if submission data matches workflow filters."""
        for field, expected_value in filters.items():
            if self.data.get(field) != expected_value:
                return False
        return True


# ============================================
# PART 2: WORKFLOW TYPES & ACCESS LEVELS (NEW)
# ============================================

class WorkflowType(models.TextChoices):
    SYSTEM = 'system', 'System'
    TEMPLATE = 'template', 'Template'
    MASTER_TEMPLATE = 'master_template', 'Master Template'  # NEW: Reusable parameterized templates
    STANDARD = 'standard', 'Standard'
    CUSTOM = 'custom', 'Custom'


class WorkflowAccessLevel(models.TextChoices):
    PUBLIC = 'public', 'Public'
    INTERNAL = 'internal', 'Internal'
    RESTRICTED = 'restricted', 'Restricted'
    PRIVATE = 'private', 'Private'


# ============================================
# PART 3: WORKFLOWS (ENHANCED WITH SUB-WORKFLOW SUPPORT)
# ============================================

# automations/models.py - CLEANED UP WorkflowTemplate

class WorkflowTemplate(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Complete workflow definition - CLEANED UP VERSION
    """
    
    TRIGGER_TYPES = [
        ('event', 'Event Trigger'),
        ('schedule', 'Scheduled'),
        ('manual', 'Manual'),
    ]
    
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Workflow classification
    workflow_type = models.CharField(
        max_length=20,
        choices=WorkflowType.choices,
        default=WorkflowType.STANDARD
    )
    access_level = models.CharField(
        max_length=20,
        choices=WorkflowAccessLevel.choices,
        default=WorkflowAccessLevel.PRIVATE
    )
    category = models.CharField(max_length=50, blank=True)
    
    # Atomic and locked workflows
    is_atomic = models.BooleanField(default=False)
    is_locked = models.BooleanField(default=False)
    
    # Input/Output contract
    required_inputs = models.JSONField(default=list)
    outputs = models.JSONField(default=list)
    
    # Trigger configuration
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_TYPES)
    trigger_config = models.JSONField(default=dict)
    
    # Complete workflow definition
    workflow_definition = models.JSONField(default=dict)
    
    # Execution limits
    max_execution_time_seconds = models.IntegerField(default=300)
    max_depth = models.IntegerField(default=3)
    max_steps = models.IntegerField(default=15)
    
    # Approval settings
    requires_approval = models.BooleanField(default=False)
    approval_config = models.JSONField(null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    version = models.IntegerField(default=1)
    
    # Parent workflow
    parent_workflow = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sub_workflows'
    )
    
    # Usage metrics
    usage_count = models.IntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)
    average_duration_ms = models.IntegerField(null=True, blank=True)
    
    # UNIFIED IDENTIFIER: Use run_sequence for everything
    run_sequence = models.CharField(
        max_length=50, 
        editable=False, 
        blank=True,
        unique=True,  # Make it unique
        help_text="Unique identifier for this workflow template"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['trigger_type', 'is_active']),
            models.Index(fields=['workflow_type', 'access_level']),
            models.Index(fields=['category']),
            models.Index(fields=['run_sequence']),  # Index for lookups
        ]
    
    def __str__(self):
        return f"{self.name} (v{self.version})"
    
    def save(self, *args, **kwargs):
        # Auto-assign tenant using three-level fallback
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        is_new = self.pk is None
        
        # Generate run_sequence on first save
        if is_new and not self.run_sequence:
            # Create a slug from name for readability
            from django.utils.text import slugify
            base_slug = slugify(self.name)[:40]
            # Replace hyphens with underscores for PostgreSQL compatibility
            base_slug = base_slug.replace('-', '_')
            
            # For master templates, scope to owner + PK so two tenants (or two
            # manually-created templates of the same type) never collide.
            if self.workflow_type == 'master_template':
                account_type = self.category or 'general'
                has_approval = '_approval' if self.requires_approval else ''
                owner_scope = f"o{self.owner_id}_" if self.owner_id else ""
                # Save first to obtain a PK that guarantees global uniqueness.
                super().save(*args, **kwargs)
                self.run_sequence = f"{owner_scope}{account_type.lower()}_transaction{has_approval}_{self.pk}"
                super().save(update_fields=['run_sequence'])
                with connection.cursor() as c:
                    c.execute(f"CREATE SEQUENCE IF NOT EXISTS {self.run_sequence} START 1;")
                return
            else:
                # For regular workflows, use name-based slug with ID
                super().save(*args, **kwargs)  # Save first to get ID
                self.run_sequence = f"{base_slug}_{self.pk}"
                super().save(update_fields=['run_sequence'])
                
                # Create sequence for run reference generation
                with connection.cursor() as c:
                    c.execute(f"CREATE SEQUENCE IF NOT EXISTS {self.run_sequence} START 1;")
                return
        
        super().save(*args, **kwargs)
        
        # Create Postgres sequence for run reference generation
        if self.run_sequence:
            with connection.cursor() as c:
                c.execute(f"CREATE SEQUENCE IF NOT EXISTS {self.run_sequence} START 1;")

    @property
    def code(self):
        """Backwards-compatible property - always returns run_sequence"""
        return self.run_sequence
    
    def get_step_by_id(self, step_id: str):
        """Get step definition by ID."""
        for step in self.workflow_definition.get('steps', []):
            if step['id'] == step_id:
                return step
        return None  
      
    def validate_definition(self):
        """Validate workflow structure."""
        definition = self.workflow_definition
        
        if not definition.get('steps'):
            raise ValidationError("Workflow must have at least one step")
        
        if not definition.get('initial_step'):
            raise ValidationError("Workflow must define initial_step")
        
        step_ids = {step['id'] for step in definition['steps']}
        initial = definition['initial_step']
        
        if initial not in step_ids:
            raise ValidationError(f"Initial step '{initial}' not found")
        
        return True


class WorkflowBinding(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Lightweight binding that links a form to a master workflow template with specific parameters.
    
    Instead of creating hundreds of similar workflows, we create a few master templates
    and many bindings. Each binding says: "When THIS form is submitted, run THAT master
    template with THESE parameters."
    
    Example:
    - Master Template: "expense_transaction_approval" (generic, reusable)
    - Binding 1: Office Supplies → uses Cash as contra account
    - Binding 2: Travel Expenses → uses Corporate Card as contra account
    - Binding 3: Utilities → user selects payment method on form
    """
    
    # What triggers this workflow
    form_schema = models.ForeignKey(
        FormSchema,
        on_delete=models.CASCADE,
        related_name='workflow_bindings',
        help_text="Form that triggers this workflow"
    )
    
    # Which master template to execute
    workflow_template = models.ForeignKey(
        WorkflowTemplate,
        on_delete=models.CASCADE,
        related_name='bindings',
        limit_choices_to={'workflow_type': 'master_template'},
        help_text="Master template to execute"
    )
    
    # Account-specific parameters passed to the workflow
    parameters = models.JSONField(
        default=dict,
        help_text=(
            "Parameters passed to workflow execution. Examples: "
            "target_account_id, target_account_name, contra_account_id"
        )
    )
    
    # Priority for execution order if multiple bindings exist
    priority = models.IntegerField(
        default=0,
        help_text="Higher priority bindings execute first"
    )
    
    # Active flag
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this binding is active"
    )
    
    # Usage tracking
    execution_count = models.IntegerField(
        default=0,
        help_text="Number of times this binding has been executed"
    )
    last_executed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last execution timestamp"
    )
    
    class Meta:
        ordering = ['-priority', '-created_at']
        unique_together = [('form_schema', 'workflow_template')]
        indexes = [
            models.Index(fields=['form_schema', 'is_active']),
            models.Index(fields=['workflow_template', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.form_schema.name} → {self.workflow_template.name}"
    
    def execute(self, form_data: dict, user):
        """Execute the master template with this binding's parameters"""
        from .workflow_executor import WorkflowExecutor
        
        # Merge form data with binding parameters
        context = {
            'form': form_data,
            'workflow': self.parameters,  # Account IDs, names, etc.
            'user': {
                'id': user.id,
                'email': user.email,
                'name': str(user),
            }
        }
        
        # Create workflow run
        run = WorkflowRun.objects.create(
            template=self.workflow_template,
            binding=self,  # Link to binding
            context=context,
            owner=self.owner,
            branch=self.branch,
            created_by=user,
            tenant=self.tenant
        )
        
        # Update usage stats
        self.execution_count += 1
        self.last_executed_at = timezone.now()
        self.save(update_fields=['execution_count', 'last_executed_at'])
        
        # Execute workflow
        engine = WorkflowExecutor(run)
        return engine.execute()


class WorkflowVersion(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """*** NEW: Track workflow versions for safe deployments ***"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(
        WorkflowTemplate,
        on_delete=models.CASCADE,
        related_name='versions'
    )
    version = models.IntegerField()
    definition = models.JSONField()
    
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('testing', 'Testing'),
            ('active', 'Active'),
            ('deprecated', 'Deprecated'),
            ('archived', 'Archived'),
        ],
        default='draft'
    )
    
    deployed_at = models.DateTimeField(null=True, blank=True)
    deprecated_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'workflow_versions'
        unique_together = [('workflow', 'version')]
        ordering = ['-version']
    
    def __str__(self):
        return f"{self.workflow.name} v{self.version}"


class WorkflowRun(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Instance of a running workflow (ENHANCED with sub-workflow tracking).
    """
    
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('awaiting_approval', 'Awaiting Approval'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    
    template = models.ForeignKey(
        WorkflowTemplate,
        on_delete=models.CASCADE,
        related_name='runs'
    )
    
    # NEW: Link to workflow binding if executed via binding
    binding = models.ForeignKey(
        'WorkflowBinding',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='runs',
        help_text="Binding used to trigger this workflow run"
    )
    
    run_reference = models.CharField(max_length=100, unique=True, editable=False)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    
    # *** NEW: Execution tree tracking for sub-workflows ***
    root_execution = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='child_executions'
    )
    parent_execution = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='sub_executions'
    )
    depth = models.IntegerField(default=0)
    workflow_version = models.IntegerField(default=1)
    
    # Current execution state
    current_step_id = models.CharField(max_length=100, blank=True, null=True)
    
    # Complete execution context
    context = models.JSONField(default=dict)
    
    # Execution history
    execution_log = models.JSONField(default=list)
    
    # Timing
    scheduled_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    
    # Error tracking
    error_message = models.TextField(blank=True)
    error_step_id = models.CharField(max_length=100, blank=True)
    
    # Link to form submission
    form_submission = models.ForeignKey(
        FormSubmission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workflow_runs'
    )
    
    # Result data
    result = models.JSONField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'scheduled_at']),
            models.Index(fields=['template', 'status']),
            models.Index(fields=['root_execution']),
            models.Index(fields=['parent_execution']),
        ]
    
    def __str__(self):
        return f"{self.run_reference} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Auto-assign tenant using three-level fallback
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        is_new = self.pk is None
        
        # Set current_step_id before first save if it's a new object
        if is_new and not self.current_step_id:
            initial_step = self.template.workflow_definition.get('initial_step')
            # Use a placeholder for empty workflows (no initial_step)
            self.current_step_id = initial_step or '__completed__'
        
        super().save(*args, **kwargs)
        
        if is_new and not self.run_reference:
            with connection.cursor() as c:
                c.execute(f"SELECT nextval('{self.template.run_sequence}')")
                seq = c.fetchone()[0]
            
            date_str = timezone.now().strftime("%Y%m%d")
            code = self.template.name.lower().replace(" ", "_")[:20]
            self.run_reference = f"{code}_{date_str}_{seq:04d}"
            super().save(update_fields=['run_reference'])
            
            self._queue_execution()
    
    def _queue_execution(self):
        """Queue this workflow run for execution."""
        def _enqueue():
            from automations.tasks import execute_workflow_task
            execute_workflow_task.apply_async(args=[self.id], countdown=1)
        
        transaction.on_commit(_enqueue)
    
    def log_step(self, step_id: str, status: str, result: dict = None, error: str = None):
        """Add entry to execution log."""
        log_entry = {
            'timestamp': timezone.now().isoformat(),
            'step_id': step_id,
            'status': status,
            'result': serialize_for_json(result),
            'error': error
        }
        self.execution_log.append(log_entry)
        self.save(update_fields=['execution_log'])
    
    def update_context(self, key: str, value):
        """Update workflow context."""
        self.context[key] = serialize_for_json(value)
        self.save(update_fields=['context'])


class StepExecution(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """*** NEW: Track individual step executions for debugging ***"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    execution = models.ForeignKey(
        WorkflowRun,
        on_delete=models.CASCADE,
        related_name='step_executions'
    )
    
    step_id = models.CharField(max_length=100)
    step_type = models.CharField(max_length=50)
    step_name = models.CharField(max_length=255)
    
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    
    input_data = models.JSONField(default=dict)
    output_data = models.JSONField(null=True, blank=True)
    variables_snapshot = models.JSONField(default=dict)
    
    status = models.CharField(max_length=50)
    error_message = models.TextField(null=True, blank=True)
    retry_count = models.IntegerField(default=0)
    
    class Meta:
        db_table = 'step_executions'
        ordering = ['started_at']
        indexes = [
            models.Index(fields=['execution', 'step_id']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.step_name} ({self.status})"

User = get_user_model()


class WorkflowDefaults(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    System-level default workflows for entity types
    Fallback when no category-level configuration exists
    """
    entity_type = models.CharField(
        max_length=50,
        help_text="Entity type: INCOME, EXPENSE, ASSET, LIABILITY, LOAN, SAVINGS, etc."
    )
    entity_model = models.CharField(
        max_length=100,
        help_text="Django model path: accounts.Account, products.Product, etc."
    )
    
    default_form_schema = models.ForeignKey(
        'FormSchema',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='system_defaults_form'
    )
    default_workflow = models.ForeignKey(
        'WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='system_defaults_workflow'
    )
    default_report = models.ForeignKey(
        'reports.ReportTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='system_defaults_report'
    )
    
    class Meta:
        unique_together = [['owner', 'branch', 'entity_type', 'entity_model']]
        verbose_name = 'Workflow Default'
        verbose_name_plural = 'Workflow Defaults'
    
    def __str__(self):
        return f"{self.entity_type} defaults ({self.entity_model})"
    
    @classmethod
    def get_default_form(cls, owner, branch, entity_type, entity_model='accounts.Account'):
        """Get default form schema for entity type"""
        default = cls.objects.filter(
            owner=owner,
            branch=branch,
            entity_type=entity_type,
            entity_model=entity_model
        ).first()
        return default.default_form_schema if default else None
    
    @classmethod
    def get_default_workflow(cls, owner, branch, entity_type, entity_model='accounts.Account'):
        """Get default workflow template for entity type"""
        default = cls.objects.filter(
            owner=owner,
            branch=branch,
            entity_type=entity_type,
            entity_model=entity_model
        ).first()
        return default.default_workflow if default else None
    
    @classmethod
    def get_default_report(cls, owner, branch, entity_type, entity_model='accounts.Account'):
        """Get default report template for entity type"""
        default = cls.objects.filter(
            owner=owner,
            branch=branch,
            entity_type=entity_type,
            entity_model=entity_model
        ).first()
        return default.default_report if default else None


class WorkflowApproval(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Approval requests for workflow steps
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('timeout', 'Timeout'),
    ]
    
    workflow_run = models.ForeignKey(
        'WorkflowRun',
        on_delete=models.CASCADE,
        related_name='approvals'
    )
    step_id = models.CharField(max_length=100)
    
    approver = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='workflow_approvals'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    approval_message = models.TextField()
    context_data = models.JSONField(default=dict)
    
    # Approval decision
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approvals_given'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Timeout
    timeout_at = models.DateTimeField(null=True, blank=True)
    
    # Phase 2B: Escalation fields
    escalation_level = models.IntegerField(
        default=0,
        help_text='How many times this approval has been escalated'
    )
    escalated_from = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='escalations_from',
        help_text='Original approver if this approval was escalated'
    )
    escalated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this approval was escalated'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'approver']),
            models.Index(fields=['workflow_run', 'step_id']),
        ]
    
    def __str__(self):
        return f"Approval for {self.workflow_run.run_reference} - {self.status}"
    
    def approve(self, user):
        """Approve this request"""
        from automations.workflow_executor import WorkflowExecutor
        
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save()
        
        # For parallel approvals, don't change status to 'running' yet
        # Let resume_from_approval determine the correct status based on threshold
        step = self.workflow_run.template.get_step_by_id(self.step_id)
        approval_mode = step.get('approval_mode', 'sequential') if step else 'sequential'
        
        if approval_mode != 'parallel':
            # Sequential approval - resume workflow immediately
            self.workflow_run.status = 'running'
            self.workflow_run.save()
        
        # Continue execution (will check if parallel approval is complete)
        executor = WorkflowExecutor(self.workflow_run)
        executor.resume_from_approval(self)
    
    def reject(self, user, reason: str):
        """Reject this request"""
        self.status = 'rejected'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.rejection_reason = reason
        self.save()
        
        # Mark workflow as failed
        self.workflow_run.status = 'failed'
        self.workflow_run.error_message = f"Approval rejected: {reason}"
        self.workflow_run.completed_at = timezone.now()
        self.workflow_run.save()


# ============================================
# PHASE 2B: ADVANCED WORKFLOW FEATURES
# ============================================

class ApprovalDelegation(TimeStampedModel, SoftDeleteModel):
    """
    Allows users to delegate their approval responsibilities to others.
    Useful for vacation coverage, sick leave, or temporary role changes.
    Note: Does not use BranchScopedModel as delegations are user-to-user relationships.
    """
    delegator = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delegations_given',
        help_text='User delegating their approvals'
    )
    
    delegate = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='delegations_received',
        help_text='User receiving delegated approvals'
    )
    
    start_date = models.DateField(
        help_text='When delegation becomes active'
    )
    
    end_date = models.DateField(
        help_text='When delegation ends'
    )
    
    is_active = models.BooleanField(default=True)
    
    reason = models.TextField(
        blank=True,
        help_text='Reason for delegation (e.g., vacation, sick leave)'
    )
    
    workflow_types = models.JSONField(
        default=list,
        blank=True,
        help_text='Specific workflow types to delegate. Empty means all workflows'
    )
    
    approval_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Maximum amount delegate can approve. Null means no limit'
    )
    
    class Meta:
        verbose_name = 'Approval Delegation'
        verbose_name_plural = 'Approval Delegations'
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['delegator', 'is_active', 'start_date', 'end_date']),
            models.Index(fields=['delegate', 'is_active']),
        ]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(delegator=models.F('delegate')),
                name='no_self_delegation'
            ),
        ]
    
    def __str__(self):
        return f"{self.delegator.username} → {self.delegate.username} ({self.start_date} to {self.end_date})"
    
    def clean(self):
        """Validate delegation"""
        if self.delegator == self.delegate:
            raise ValidationError("Cannot delegate to yourself")
        
        if self.end_date < self.start_date:
            raise ValidationError("End date must be after start date")
    
    def is_currently_active(self):
        """Check if delegation is active right now"""
        if not self.is_active:
            return False
        
        today = timezone.now().date()
        return self.start_date <= today <= self.end_date
    
    @classmethod
    def get_active_delegate(cls, delegator, workflow_type=None, amount=None):
        """
        Find active delegate for a delegator
        
        Args:
            delegator: User who delegated
            workflow_type: Optional workflow type filter
            amount: Optional amount to check against approval_limit
        
        Returns:
            User object of delegate or None
        """
        today = timezone.now().date()
        
        delegations = cls.objects.filter(
            delegator=delegator,
            is_active=True,
            is_deleted=False,
            start_date__lte=today,
            end_date__gte=today
        )
        
        # Filter by workflow type if specified
        if workflow_type:
            # Either no workflow_types specified (applies to all) or includes this type
            delegations = delegations.filter(
                models.Q(workflow_types=[]) | 
                models.Q(workflow_types__contains=[workflow_type])
            )
        
        # Check approval limit
        if amount is not None:
            delegations = delegations.filter(
                models.Q(approval_limit__isnull=True) |
                models.Q(approval_limit__gte=amount)
            )
        
        delegation = delegations.first()
        return delegation.delegate if delegation else None


class WorkflowConditionEvaluator:
    """
    Evaluates conditional routing rules for workflow steps.
    Supports complex expressions like:
    - amount > 10000
    - department == 'IT'
    - category in ['equipment', 'software']
    - (amount > 5000 AND priority == 'high') OR department == 'Finance'
    """
    
    @staticmethod
    def evaluate(condition_rules: dict, context: dict) -> bool:
        """
        Evaluate condition rules against context data
        
        Args:
            condition_rules: Dict with 'operator' and 'conditions' or 'rules'
            context: Dict with workflow context data
        
        Returns:
            Boolean result of evaluation
        """
        if not condition_rules:
            return True
        
        # Check if this is a single condition (has 'field') or a compound condition (has 'operator' and 'conditions')
        if 'field' in condition_rules:
            # This is a single condition
            return WorkflowConditionEvaluator._evaluate_single(condition_rules, context)
        
        operator = condition_rules.get('operator', 'AND')
        conditions = condition_rules.get('conditions', [])
        
        if operator == 'AND':
            # Recursively evaluate each condition (which might be nested)
            return all(
                WorkflowConditionEvaluator.evaluate(cond, context)
                for cond in conditions
            )
        elif operator == 'OR':
            # Recursively evaluate each condition (which might be nested)
            return any(
                WorkflowConditionEvaluator.evaluate(cond, context)
                for cond in conditions
            )
        else:
            # Unknown operator, treat as single condition
            return WorkflowConditionEvaluator._evaluate_single(condition_rules, context)
    
    @staticmethod
    def _evaluate_single(condition: dict, context: dict) -> bool:
        """Evaluate a single condition"""
        field = condition.get('field')
        op = condition.get('operator')
        value = condition.get('value')
        
        if not field or not op:
            return True
        
        # Get actual value from context
        actual_value = context.get(field)
        
        # Handle nested fields (e.g., 'metadata.department')
        if '.' in field:
            parts = field.split('.')
            actual_value = context
            for part in parts:
                if isinstance(actual_value, dict):
                    actual_value = actual_value.get(part)
                else:
                    actual_value = None
                    break
        
        # Evaluate based on operator
        if op == 'equals' or op == '==':
            return actual_value == value
        elif op == 'not_equals' or op == '!=':
            return actual_value != value
        elif op == 'greater_than' or op == '>':
            return Decimal(str(actual_value or 0)) > Decimal(str(value))
        elif op == 'less_than' or op == '<':
            return Decimal(str(actual_value or 0)) < Decimal(str(value))
        elif op == 'greater_equal' or op == '>=':
            return Decimal(str(actual_value or 0)) >= Decimal(str(value))
        elif op == 'less_equal' or op == '<=':
            return Decimal(str(actual_value or 0)) <= Decimal(str(value))
        elif op == 'in':
            return actual_value in value if isinstance(value, list) else False
        elif op == 'not_in':
            return actual_value not in value if isinstance(value, list) else True
        elif op == 'contains':
            return value in str(actual_value) if actual_value else False
        elif op == 'starts_with':
            return str(actual_value).startswith(str(value)) if actual_value else False
        elif op == 'ends_with':
            return str(actual_value).endswith(str(value)) if actual_value else False
        elif op == 'is_null':
            return actual_value is None
        elif op == 'is_not_null':
            return actual_value is not None
        else:
            logger.warning(f"Unknown operator: {op}")
            return True

