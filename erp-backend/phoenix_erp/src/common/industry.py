from django.db import models
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager

class Industry(TimeStampedModel):
    """
    Defines different industries that can be supported by the system.
    Each industry can have its own set of features, workflows, and required modules.
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    features = models.JSONField(
        default=list,
        help_text="List of features enabled for this industry"
    )
    default_workflows = models.JSONField(
        default=dict,
        help_text="Default workflow configurations for this industry"
    )
    required_modules = models.JSONField(
        default=list,
        help_text="List of modules required for this industry"
    )
    default_product_categories = models.JSONField(
        default=list,
        help_text="Default product categories for this industry"
    )
    metadata_schema = models.JSONField(
        default=dict,
        help_text="Schema for industry-specific metadata fields"
    )

    class Meta:
        verbose_name = "Industry"
        verbose_name_plural = "Industries"
        ordering = ['name']

    def __str__(self):
        return self.name

class IndustryConfiguration(TimeStampedModel, BranchScopedModel):
    """
    Tenant-specific configurations for an industry.
    Allows customization of industry settings per tenant.
    """
    industry = models.ForeignKey(Industry, on_delete=models.PROTECT)
    tenant = models.ForeignKey('users.Tenant', on_delete=models.CASCADE)
    settings = models.JSONField(
        default=dict,
        help_text="Custom settings for this industry-tenant combination"
    )
    workflows = models.JSONField(
        default=dict,
        help_text="Custom workflow configurations"
    )
    custom_fields = models.JSONField(
        default=dict,
        help_text="Custom field definitions"
    )
    active_modules = models.JSONField(
        default=list,
        help_text="List of activated modules"
    )
    approval_rules = models.JSONField(
        default=dict,
        help_text="Custom approval rules"
    )

    class Meta:
        unique_together = ['industry', 'tenant']
        ordering = ['tenant', 'industry']

    def __str__(self):
        return f"{self.tenant.name} - {self.industry.name} Configuration"
