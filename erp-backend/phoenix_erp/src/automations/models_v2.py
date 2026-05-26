# automations/models.py
import json
import re
import ast
import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Dict

from django.db import connection, transaction
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.conf import settings as project_settings

from transactions.models import TransactionSeries

# local app settings
from . import settings as app_settings

from django_cryptography.fields import encrypt

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from accounts.models import Account
from users.models import Tenant, User

logger = logging.getLogger(__name__)


# -------- Safe expression evaluator (very small, whitelist AST approach) --------
_ALLOWED_AST_NODES = (
    ast.Expression, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare,
    ast.Name, ast.Load, ast.Constant, ast.List, ast.Tuple,
    ast.And, ast.Or, ast.Not,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.USub, ast.UAdd
)

def safe_eval_expr(expr: str, context: Dict[str, Any]) -> Any:
    """
    Evaluate a simple boolean/numeric expression safely.
    Disallows names that are not present in context and forbids function calls,
    attribute access, imports, etc.
    """
    try:
        node = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression syntax: {exc}")

    for n in ast.walk(node):
        if not isinstance(n, _ALLOWED_AST_NODES):
            raise ValueError(f"Disallowed expression component: {type(n).__name__}")

    # Only allow names that appear in context
    names = {n.id for n in ast.walk(node) if isinstance(n, ast.Name)}
    for name in names:
        if name not in context:
            # If the name is a bare literal like True/False, ast.Constant will cover it.
            raise ValueError(f"Use of unknown name in expression: {name}")

    compiled = compile(node, "<safe_eval>", "eval")
    return eval(compiled, {"__builtins__": None}, dict(context))


# ---------------------- Models ----------------------

class FormSchema(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines a reusable form structure that can be connected to automation templates.
    """
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    schema = models.JSONField(help_text="Form field definitions and validation rules")

    def __str__(self):
        return self.name

    def validate_data(self, data: Dict[str, Any]) -> Dict[str, str]:
        """
        Validates form data against the schema.
        Returns a dict of field_id -> error_message if validation fails.
        Handles "0" and numeric strings properly.
        """
        errors = {}

        for field in self.schema.get("fields", []):
            field_id = field["id"]
            raw_value = data.get(field_id, None)
            validation = field.get("validation", {})

            # Required: treat '' and None as missing, but allow 0
            if validation.get("required") and (raw_value is None or raw_value == ""):
                errors[field_id] = f"{field.get('label', field_id)} is required"
                continue

            # If value omitted and not required, skip
            if raw_value is None or raw_value == "":
                continue

            # Numeric coercion for 'number' and 'money'
            if field.get("type") in ("number", "money"):
                try:
                    if field.get("type") == "money":
                        value = Decimal(str(raw_value))
                    else:
                        value = float(raw_value)
                except (TypeError, ValueError, InvalidOperation):
                    errors[field_id] = f"{field.get('label', field_id)} must be a number"
                    continue
            else:
                value = raw_value

            # min / max checks (coerce to float for comparisons)
            if validation.get("min") is not None:
                if float(value) < float(validation["min"]):
                    errors[field_id] = f"{field.get('label', field_id)} must be at least {validation['min']}"
            if validation.get("max") is not None:
                if float(value) > float(validation["max"]):
                    errors[field_id] = f"{field.get('label', field_id)} must be at most {validation['max']}"

            # pattern validation
            if validation.get("pattern"):
                if not re.match(validation["pattern"], str(raw_value)):
                    errors[field_id] = validation.get("message") or f"{field.get('label', field_id)} is invalid"

        return errors


class BusinessFunction(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines a business function that can be used in automation steps.
    """
    FUNCTION_TYPES = [
        ("api_call", "External Integration"),
        ("internal_process", "Internal Process"),
        ("notification", "Send Notification"),
        ("approval", "Request Approval"),
        ("condition", "Check Condition"),
        ("database", "Database Operation"),
        ("file", "File Operation"),
        ("email", "Send Email"),
        ("sms", "Send SMS"),
        ("webhook", "Webhook"),
        ("calculation", "Calculation"),
        ("validation", "Data Validation"),
    ]

    name = models.CharField(max_length=150)
    friendly_name = models.CharField(max_length=150)
    function_type = models.CharField(max_length=20, choices=FUNCTION_TYPES)
    config = models.JSONField(help_text="Configuration for this business function")

    class Meta:
        unique_together = (("owner", "name"),)

    def __str__(self):
        return self.friendly_name

    def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the business function with the given context.
        For heavy/remote actions prefer to call via Celery tasks (see automations.tasks).
        """
        executors = {
            "api_call": self._execute_api_call,
            "notification": self._execute_notification,
            "approval": self._execute_approval,
            "condition": self._execute_condition,
            "database": self._execute_database_operation,
            "file": self._execute_file_operation,
            "email": self._execute_email,
            "sms": self._execute_sms,
            "webhook": self._execute_webhook,
            "calculation": self._execute_calculation,
            "validation": self._execute_validation,
            "internal_process": self._execute_internal_process,
        }

        executor = executors.get(self.function_type)
        if not executor:
            raise ValueError(f"Unknown function type: {self.function_type}")

        try:
            return executor(context)
        except Exception as exc:
            logger.exception("BusinessFunction.execute failed")
            return {"error": str(exc)}

    def _execute_api_call(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Minimal synchronous wrapper. Prefer executing heavy calls via the Celery task.
        Adds timeout and basic error capture.
        """
        import requests

        endpoint = self.config.get("apiEndpoint", "")
        method = self.config.get("method", "POST").upper()
        headers = self.config.get("headers", {})
        timeout = int(self.config.get("timeout", app_settings.EXTERNAL_API_TIMEOUT))

        # Replace simple template variables
        for key, value in context.items():
            endpoint = endpoint.replace(f"{{{key}}}", str(value))

        try:
            resp = requests.request(method=method, url=endpoint, headers=headers, json=context, timeout=timeout)
            resp.raise_for_status()
            try:
                body = resp.json() if resp.content else None
            except ValueError:
                body = resp.text
            return {"status_code": resp.status_code, "response": body}
        except Exception as exc:
            logger.exception("BusinessFunction._execute_api_call failed")
            return {"status_code": getattr(exc, "response", None) and getattr(exc.response, "status_code", None), "error": str(exc)}

    def _execute_notification(self, context: Dict[str, Any]) -> Dict[str, Any]:
        template = self.config.get("template", "")
        channels = self.config.get("channels", [])

        # Process template with context (simple replacement)
        for key, value in context.items():
            template = template.replace(f"{{{key}}}", str(value))

        results = {}

        if "email" in channels:
            # Implement email sending via task (not done here)
            results["email"] = "queued"

        if "sms" in channels:
            results["sms"] = "queued"

        return results

    def _execute_approval(self, context: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "pending",
            "required_roles": self.config.get("requiredRoles", []),
            "message": self.config.get("message", "").format(**context) if self.config.get("message") else "",
        }

    def _execute_condition(self, context: Dict[str, Any]) -> Dict[str, Any]:
        condition = self.config.get("condition", "")
        try:
            result = safe_eval_expr(condition, context)
        except Exception as exc:
            logger.exception("Condition evaluation failed")
            raise ValueError(f"Condition evaluation error: {exc}")

        return {"result": bool(result), "next_step": self.config.get("trueStep") if result else self.config.get("falseStep")}

    def _execute_database_operation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute database operations like CRUD (be careful)."""
        from django.db import connection

        operation = self.config.get("operation", "query")
        query = self.config.get("query", "")
        parameters = {k: context.get(v) for k, v in self.config.get("parameters", {}).items()}

        with connection.cursor() as cursor:
            cursor.execute(query, parameters)
            if operation.lower() == "query":
                columns = [col[0] for col in cursor.description]
                return {"results": [dict(zip(columns, row)) for row in cursor.fetchall()]}
            else:
                return {"affected_rows": cursor.rowcount}

    def _execute_file_operation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        import os
        from django.core.files.storage import default_storage

        operation = self.config.get("operation", "read")
        path = self.config.get("path", "").format(**context)

        if operation == "read":
            if default_storage.exists(path):
                with default_storage.open(path, "rb") as f:
                    content = f.read()
                return {"content": content}
            return {"error": "File not found"}

        if operation == "write":
            content = context.get("content", "")
            path = default_storage.save(path, content)
            return {"path": path}

        if operation == "delete":
            if default_storage.exists(path):
                default_storage.delete(path)
                return {"status": "deleted"}
            return {"error": "File not found"}

    def _execute_email(self, context: Dict[str, Any]) -> Dict[str, Any]:
        from django.core.mail import send_mail
        from django.template import Template, Context

        template = Template(self.config.get("template", ""))
        rendered_content = template.render(Context(context))

        send_mail(
            subject=self.config.get("subject", "").format(**context),
            message=rendered_content,
            from_email=self.config.get("from_email"),
            recipient_list=self.config.get("recipients", []),
            html_message=rendered_content if self.config.get("html", False) else None,
        )

        return {"status": "sent"}

    def _execute_sms(self, context: Dict[str, Any]) -> Dict[str, Any]:
        # SMS implementation removed for brevity — prefer to use a Celery task/PSP
        return {"status": "queued"}

    def _execute_webhook(self, context: Dict[str, Any]) -> Dict[str, Any]:
        import requests

        url = self.config.get("url", "").format(**context)
        method = self.config.get("method", "POST").upper()
        headers = self.config.get("headers", {})
        timeout = int(self.config.get("timeout", app_settings.EXTERNAL_API_TIMEOUT))

        try:
            resp = requests.request(method=method, url=url, json=context, headers=headers, timeout=timeout)
            resp.raise_for_status()
            return {"status_code": resp.status_code, "response": resp.json() if resp.content else None}
        except Exception as exc:
            logger.exception("Webhook call failed")
            return {"error": str(exc)}

    def _execute_calculation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        import operator

        operations = {
            "+": operator.add,
            "-": operator.sub,
            "*": operator.mul,
            "/": operator.truediv,
        }

        formula = self.config.get("formula", "")
        variables = {
            k: Decimal(str(context.get(v, 0))) for k, v in self.config.get("variables", {}).items()
        }

        parts = formula.split()
        if len(parts) != 3:
            raise ValueError("Formula must be in format: 'variable1 operator variable2'")

        var1, op, var2 = parts
        result = operations[op](variables.get(var1, Decimal(0)), variables.get(var2, Decimal(0)))
        return {"result": str(result)}

    def _execute_validation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        rules = self.config.get("rules", [])
        errors = []

        for rule in rules:
            field = rule.get("field")
            value = context.get(field)

            if rule.get("required") and not value:
                errors.append(f"{field} is required")
                continue

            if not value:
                continue

            expected_type = rule.get("type")
            if expected_type == "number":
                try:
                    float(value)
                except (TypeError, ValueError):
                    errors.append(f"{field} must be a number")

            if "min" in rule and float(value) < rule["min"]:
                errors.append(f"{field} must be at least {rule['min']}")
            if "max" in rule and float(value) > rule["max"]:
                errors.append(f"{field} must be at most {rule['max']}")

            if "pattern" in rule:
                if not re.match(rule["pattern"], str(value)):
                    errors.append(f"{field} is invalid")

        return {"valid": len(errors) == 0, "errors": errors}

    def _execute_internal_process(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute allowed internal processes. See app settings to define the allow-list.
        """
        process_name = self.config.get("process")
        if not process_name:
            return {"error": "No process specified", "status": "failed"}

        allowed = app_settings.ALLOWED_INTERNAL_ACTIONS or {}
        allow_unsafe = app_settings.ALLOW_UNSAFE_INTERNAL_ACTIONS

        if process_name not in allowed and not allow_unsafe:
            raise ValueError("Requested process is not in allowed internal actions.")

        dotted = allowed.get(process_name, process_name)  # if mapping provided, use it; else direct dotted path (only when allowed)
        try:
            module_path, function_name = dotted.rsplit(".", 1)
            module = __import__(module_path, fromlist=[function_name])
            process = getattr(module, function_name)
            return process(context)
        except Exception as e:
            logger.exception("Internal process execution failed")
            return {"error": str(e), "status": "failed"}


class ExternalAPIConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Stores external API configuration securely for a owner.
    """
    name = models.CharField(max_length=100, help_text="Identifier, e.g. Paystack")
    base_url = models.URLField(help_text="Base URL for the API")
    api_key = encrypt(models.CharField(max_length=200, help_text="Secret API key"))
    default_headers = models.JSONField(default=dict, blank=True, help_text='Headers applied to every request')

    class Meta:
        unique_together = (("owner", "name"),)

    def __str__(self):
        return f"{self.owner.name} / {self.name}"


class WorkflowStep(TimeStampedModel, SoftDeleteModel):
    """
    A step in an automation workflow, e.g. "Awaiting Approval", "Disbursed".
    """
    code = models.SlugField(max_length=50, unique=True)
    label = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    business_function = models.ForeignKey(
        BusinessFunction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_steps"
    )
    approval_required = models.BooleanField(default=False)
    approval_roles = models.JSONField(default=list, help_text="List of role IDs required for approval")
    config = models.JSONField(default=dict, help_text="Additional configuration for this step")

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.label

    def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        if not self.business_function:
            return {"status": "completed"}
        return self.business_function.execute({
            **context,
            "step_code": self.code,
            "step_label": self.label,
            **self.config
        })


class AutomationTemplate(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines a reusable automation, e.g. "Salary Payment" or "Loan Disbursement".
    """
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    form_schema = models.ForeignKey(FormSchema, on_delete=models.SET_NULL, null=True, blank=True, related_name="automation_templates")
    requires_approval = models.BooleanField(default=True)
    approval_step = models.ForeignKey(WorkflowStep, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", help_text="Step at which approval occurs")
    initial_step = models.ForeignKey(WorkflowStep, on_delete=models.PROTECT, related_name="+", help_text="Starting workflow step")
    final_step = models.ForeignKey(WorkflowStep, on_delete=models.PROTECT, related_name="+", help_text="Terminal step")
    scheduling_enabled = models.BooleanField(default=False)
    scheduling_config = models.JSONField(null=True, blank=True, help_text="Cron pattern or scheduling rules")

    # series is used by Transaction creation; keep it free-form to match your project's Transaction series semantics
    series = models.ForeignKey(TransactionSeries, on_delete=models.PROTECT, null=True, blank=True)

    run_sequence = models.CharField(max_length=50, editable=False, help_text="Postgres sequence name for run refs")

    class Meta:
        ordering = ["-created_at"]
        unique_together = (("owner", "name"), ("owner", "run_sequence"))

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            # derive a unique sequence name per-template and create it
            self.run_sequence = f"seq_run_{self.pk}"
            super().save(update_fields=["run_sequence"])
            with connection.cursor() as c:
                c.execute(f"CREATE SEQUENCE IF NOT EXISTS {self.run_sequence} START 1;")
            logger.info("Created run sequence %s for template %s", self.run_sequence, self.pk)

    def clean(self):
        super().clean()
        # Ensure mappings exist for steps between initial and final
        steps = WorkflowStep.objects.filter(order__gte=self.initial_step.order, order__lte=self.final_step.order)
        mapped = set(self.mappings.values_list("step_id", flat=True))
        missing = [step.code for step in steps if step.id not in mapped]
        if missing:
            raise ValidationError(f"Missing AutomationMapping for steps: {', '.join(missing)}")

    def __str__(self):
        return f"{self.name} ({self.owner})"


class AutomationMapping(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Maps one workflow step to ledger accounts or an external API call.
    """
    template = models.ForeignKey(AutomationTemplate, on_delete=models.CASCADE, related_name="mappings")
    step = models.ForeignKey(WorkflowStep, on_delete=models.CASCADE)
    debit_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="+", null=True, blank=True)
    credit_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="+", null=True, blank=True)
    api_action = models.CharField(max_length=200, blank=True, help_text="Key or dotted path to a function for side-effects (allow-list recommended)")
    external_api = models.ForeignKey(ExternalAPIConfig, on_delete=models.PROTECT, null=True, blank=True)
    endpoint_path = models.CharField(max_length=200, blank=True, help_text='Path appended to base_url, e.g. "/transfer"')
    http_method = models.CharField(max_length=6, choices=[("GET", "GET"), ("POST", "POST")], default="POST")
    payload_template = models.JSONField(default=dict, blank=True, help_text="Template for JSON payload; use jinja2 syntax to inject parameters")
    response_mappings = models.JSONField(default=dict, blank=True, help_text='Mapping from response fields to ledger entries')

    class Meta:
        unique_together = (("template", "step"),)
        ordering = ["step__order"]

    def clean(self):
        if not (self.template.initial_step.order <= self.step.order <= self.template.final_step.order):
            raise ValidationError("Mapping step must lie between initial and final steps.")

    def __str__(self):
        return f"{self.template.name} @ {self.step.code}"


class AutomationRun(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    An instance of a running automation, e.g. a salary batch for a month.
    Note: TimeStampedModel already provides owner and created_by — do not
    redeclare them here to avoid duplicate fields.
    """
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('failed', 'Failed'),
        ('awaiting_response', 'Awaiting Response'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')

    template = models.ForeignKey('AutomationTemplate', on_delete=models.CASCADE, related_name="runs")
    current_step = models.ForeignKey('WorkflowStep', on_delete=models.SET_NULL, null=True, related_name="runs")
    scheduled_at = models.DateTimeField(default=timezone.now)
    executed_at = models.DateTimeField(null=True, blank=True)
    parameters = models.JSONField(default=dict, blank=True,
                                  help_text="Parameters for API actions or transaction amounts")
    error_message = models.TextField(blank=True, null=True,
                                     help_text="Holds error details if the run fails")
    run_reference = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Auto‑filled grouping code for this run"
    )

    class Meta:
        ordering = ["-scheduled_at"]

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            # get seq value from template.run_sequence (Postgres sequence emulation)
            with connection.cursor() as c:
                c.execute("SELECT nextval(%s)", [self.template.run_sequence])
                seq = c.fetchone()[0]
            ymd = timezone.now().strftime("%Y%m%d")
            code = self.template.name.lower().replace(" ", "_")
            self.run_reference = f"{code}-{ymd}-{seq:04d}"
            super().save(update_fields=["run_reference"])

            # schedule the celery beat entry & optionally auto-run (use on_commit to avoid half-committed state)
            def _post_commit_schedule():
                try:
                    from django_celery_beat.models import ClockedSchedule, PeriodicTask
                    clocked, _ = ClockedSchedule.objects.get_or_create(clocked_time=self.scheduled_at)
                    name = f"automation_run_{self.pk}"
                    if not PeriodicTask.objects.filter(name=name).exists():
                        PeriodicTask.objects.create(
                            clocked=clocked,
                            name=name,
                            task="automations.tasks.execute_single_run",
                            args=json.dumps([self.pk]),
                            one_off=True
                        )
                    # if no approval required and at initial step, queue immediate worker run
                    if not self.template.requires_approval and self.current_step == self.template.initial_step:
                        from .tasks import execute_single_run
                        execute_single_run.apply_async(args=[self.pk], countdown=1)
                except Exception:
                    logger.exception("Failed to schedule automation periodic task")

            transaction.on_commit(_post_commit_schedule)

    def advance(self):
        """
        Request that this run advance to the next step (schedules the Celery task).
        """
        if not self.current_step:
            raise ValidationError("Automation run has no current_step set.")

        def _enqueue():
            try:
                from .tasks import execute_single_run
                execute_single_run.apply_async(args=[self.pk], countdown=1)
            except Exception:
                logger.exception("Failed to enqueue execute_single_run")

        transaction.on_commit(_enqueue)

    def __str__(self):
        return f"{self.run_reference} ({self.template.name})"


class ExternalRequestLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Record of external HTTP calls attempted or made for an AutomationRun.
    This is intentionally simple and JSON-friendly so it is easy to search and
    attach to runs for auditing and reconciliation.
    """
    run = models.ForeignKey(AutomationRun, on_delete=models.CASCADE, related_name='external_logs')
    url = models.URLField()
    request_headers = models.JSONField(blank=True, default=dict)
    request_body = models.JSONField(blank=True, default=dict)
    response_status = models.IntegerField(null=True, blank=True)
    # if response_body cannot be parsed, store as simple string in a key on the JSON (e.g. {"text": "..."}).
    response_body = models.JSONField(blank=True, default=dict)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"ExternalRequestLog(run={self.run_id}, status={self.response_status})"
    
# Add this to your automations/models.py file

class ApprovalRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Tracks approval requests for automation runs
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    run = models.ForeignKey(
        AutomationRun,
        on_delete=models.CASCADE,
        related_name='approval_requests'
    )
    step = models.ForeignKey(
        WorkflowStep,
        on_delete=models.CASCADE
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    responded_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approval_responses'
    )
    comments = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['run', 'step']),
        ]
    
    def __str__(self):
        return f"{self.run.run_reference} - {self.step.label} ({self.status})"
    
    def approve(self, user, comments=''):
        """Approve the request"""
        self.status = 'approved'
        self.responded_by = user
        self.responded_at = timezone.now()
        self.comments = comments
        self.save()
        
        # Trigger run to advance
        self.run.advance()
    
    def reject(self, user, comments=''):
        """Reject the request"""
        self.status = 'rejected'
        self.responded_by = user
        self.responded_at = timezone.now()
        self.comments = comments
        self.save()
        
        # Mark run as failed
        self.run.status = 'failed'
        self.run.error_message = f"Rejected at {self.step.label}: {comments}"
        self.run.save()


class EventTrigger(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines event-based triggers for automation runs.
    """
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=100, help_text="Type of event to listen for")
    conditions = models.JSONField(default=dict, blank=True, help_text="Conditions to match the event")
    template = models.ForeignKey(AutomationTemplate, on_delete=models.CASCADE, related_name="event_triggers")

    class Meta:
        unique_together = (("owner", "name"),)

    def __str__(self):
        return f"{self.name} ({self.event_type})"
    