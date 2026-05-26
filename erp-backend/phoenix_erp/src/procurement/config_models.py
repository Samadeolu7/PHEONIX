# procurement/config_models.py
"""
Simple procurement configuration model.
Works with existing WorkflowTemplate system - no need for complex parallel config!
"""
from django.db import models
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class ProcurementConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Simple branch-level procurement configuration.
    Workflow logic lives in WorkflowTemplate - this is just for business rules.
    """
    
    # 3-Way Matching Settings
    enable_three_way_matching = models.BooleanField(
        default=True,
        help_text="Require PO → GRN → Invoice matching before payment"
    )
    
    matching_tolerance_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('5.00'),
        help_text="Acceptable variance % for price/quantity (e.g., 5.00 = ±5%)"
    )
    
    auto_approve_within_tolerance = models.BooleanField(
        default=False,
        help_text="Auto-approve if variances within tolerance (vs requiring manual approval)"
    )
    
    # Document Numbering
    pr_prefix = models.CharField(
        max_length=10,
        default='PR',
        help_text="Purchase Requisition number prefix"
    )
    
    po_prefix = models.CharField(
        max_length=10,
        default='PO',
        help_text="Purchase Order number prefix"
    )
    
    grn_prefix = models.CharField(
        max_length=10,
        default='GRN',
        help_text="Goods Received Note number prefix"
    )
    
    # Default Workflows (link to existing WorkflowTemplate system)
    default_pr_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pr_configs',
        help_text="Default workflow for Purchase Requisitions"
    )
    
    default_po_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='po_configs',
        help_text="Default workflow for Purchase Orders"
    )
    
    default_grn_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='grn_configs',
        help_text="Default workflow for GRN processing"
    )
    
    # Optional: Amount-based workflow routing
    high_value_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="POs above this amount use high_value_po_workflow"
    )
    
    high_value_po_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='high_value_po_configs',
        help_text="Workflow for high-value POs (if threshold exceeded)"
    )
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Auto-assign tenant if not provided"""
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        super().save(*args, **kwargs)
    
    class Meta:
        verbose_name = "Procurement Configuration"
        verbose_name_plural = "Procurement Configurations"
    
    def __str__(self):
        return f"Procurement Config - {self.branch.name}"
    
    def get_workflow_for_pr(self):
        """Get appropriate workflow for PR"""
        return self.default_pr_workflow
    
    def get_workflow_for_po(self, amount=None):
        """Get appropriate workflow for PO based on amount"""
        if amount and self.high_value_threshold and amount >= self.high_value_threshold:
            return self.high_value_po_workflow or self.default_po_workflow
        return self.default_po_workflow
    
    def get_workflow_for_grn(self):
        """Get appropriate workflow for GRN"""
        return self.default_grn_workflow
    
    @classmethod
    def get_for_branch(cls, branch):
        """Get or create config for branch"""
        # Try to find existing config for this branch (any owner)
        existing = cls.objects.filter(branch=branch).first()
        if existing:
            return existing
        
        # Create new config if none exists
        config = cls.objects.create(
            branch=branch,
            owner=getattr(branch, 'owner', None) or branch.users.first(),  # Use branch owner or first user
            enable_three_way_matching=True,
            matching_tolerance_percentage=Decimal('5.00'),
            auto_approve_within_tolerance=False,  # Explicit default
        )
        return config
