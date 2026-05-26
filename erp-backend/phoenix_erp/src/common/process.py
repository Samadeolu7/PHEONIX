from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from common.industry import Industry

class BusinessProcess(TimeStampedModel):
    """
    Defines configurable business processes for different industries
    """
    industry = models.ForeignKey(Industry, on_delete=models.PROTECT)
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    
    steps = models.JSONField(
        default=list,
        help_text="Ordered list of steps in the process"
    )
    validations = models.JSONField(
        default=list,
        help_text="Validation rules for the process"
    )
    automations = models.JSONField(
        default=list,
        help_text="Automated actions in the process"
    )
    roles = models.JSONField(
        default=list,
        help_text="Roles involved in the process"
    )

    class Meta:
        unique_together = ['industry', 'code']
        verbose_name_plural = 'Business Processes'

    def __str__(self):
        return f"{self.industry.code} - {self.name}"

class ProcessInstance(TimeStampedModel, BranchScopedModel):
    """
    An instance of a business process being executed
    """
    process = models.ForeignKey(BusinessProcess, on_delete=models.PROTECT)
    
    # Generic relation to the subject of the process
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    
    status = models.CharField(max_length=50)
    current_step = models.IntegerField(default=0)
    assigned_to = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    metadata = models.JSONField(default=dict)
    logs = models.JSONField(default=list)
    
    class Meta:
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
        ]

    def __str__(self):
        return f"{self.process.name} - {self.content_object}"

class ProcessStepResult(TimeStampedModel):
    """
    Records the result of each step in a process
    """
    instance = models.ForeignKey(ProcessInstance, on_delete=models.CASCADE, related_name='step_results')
    step_number = models.IntegerField()
    step_name = models.CharField(max_length=100)
    status = models.CharField(max_length=50)
    executed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True)
    result = models.JSONField(default=dict)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['instance', 'step_number']

    def __str__(self):
        return f"{self.instance.process.name} - Step {self.step_number}"
