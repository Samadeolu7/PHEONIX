# inventory/config_models.py
"""
Inventory configuration model for branch-level settings
"""
from django.db import models
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class InventoryConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Branch-level inventory configuration.
    Controls approval requirements and business rules.
    """
    
    # Stock Adjustment Settings
    require_adjustment_approval = models.BooleanField(
        default=True,
        help_text="Require approval for stock adjustments"
    )
    
    adjustment_approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Adjustments above this value (in cost) require approval. Leave blank for all adjustments."
    )
    
    # Stock Transfer Settings
    require_transfer_approval = models.BooleanField(
        default=True,
        help_text="Require approval for stock transfers between locations"
    )
    
    transfer_approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Transfers above this value (in cost) require approval. Leave blank for all transfers."
    )
    
    # Sales Order Settings
    require_sales_order_approval = models.BooleanField(
        default=False,
        help_text="Require approval for sales orders before processing"
    )
    
    sales_order_approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Sales orders above this amount require approval"
    )
    
    # Delivery Settings
    require_delivery_approval = models.BooleanField(
        default=False,
        help_text="Require approval before releasing goods for delivery"
    )
    
    # Write-off Settings
    require_writeoff_approval = models.BooleanField(
        default=True,
        help_text="Require approval for inventory write-offs"
    )
    
    writeoff_approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Write-offs above this value require approval"
    )
    
    # Document Numbering
    adjustment_prefix = models.CharField(
        max_length=10,
        default='ADJ',
        help_text="Stock Adjustment number prefix"
    )
    
    transfer_prefix = models.CharField(
        max_length=10,
        default='TRF',
        help_text="Stock Transfer number prefix"
    )
    
    so_prefix = models.CharField(
        max_length=10,
        default='SO',
        help_text="Sales Order number prefix"
    )
    
    dn_prefix = models.CharField(
        max_length=10,
        default='DN',
        help_text="Delivery Note number prefix"
    )
    
    # Workflow Templates
    default_adjustment_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='adjustment_configs',
        help_text="Default workflow for stock adjustments"
    )
    
    default_transfer_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='transfer_configs',
        help_text="Default workflow for stock transfers"
    )
    
    default_sales_order_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sales_order_configs',
        help_text="Default workflow for sales orders"
    )
    
    default_delivery_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='delivery_configs',
        help_text="Default workflow for deliveries"
    )
    
    # Low Stock Alerts
    enable_low_stock_alerts = models.BooleanField(
        default=True,
        help_text="Enable automatic low stock notifications"
    )
    
    # Valuation Method
    VALUATION_METHODS = [
        ('fifo', 'First In First Out'),
        ('lifo', 'Last In First Out'),
        ('avg', 'Weighted Average'),
    ]
    valuation_method = models.CharField(
        max_length=10,
        choices=VALUATION_METHODS,
        default='fifo',
        help_text="Inventory valuation method"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        verbose_name = 'Inventory Configuration'
        verbose_name_plural = 'Inventory Configurations'
        unique_together = [('owner', 'branch')]
    
    def __str__(self):
        return f"Inventory Config - {self.branch.name if self.branch else 'Default'}"
    
    def requires_adjustment_approval(self, estimated_cost=None):
        """Check if adjustment requires approval based on threshold"""
        if not self.require_adjustment_approval:
            return False
        
        if self.adjustment_approval_threshold is None:
            return True  # All adjustments require approval
        
        if estimated_cost is None:
            return True  # If cost unknown, require approval
        
        return estimated_cost >= self.adjustment_approval_threshold
    
    def requires_transfer_approval(self, estimated_cost=None):
        """Check if transfer requires approval based on threshold"""
        if not self.require_transfer_approval:
            return False
        
        if self.transfer_approval_threshold is None:
            return True  # All transfers require approval
        
        if estimated_cost is None:
            return True  # If cost unknown, require approval
        
        return estimated_cost >= self.transfer_approval_threshold
    
    def requires_sales_order_approval(self, order_amount=None):
        """Check if sales order requires approval based on threshold"""
        if not self.require_sales_order_approval:
            return False
        
        if self.sales_order_approval_threshold is None:
            return True  # All orders require approval
        
        if order_amount is None:
            return True  # If amount unknown, require approval
        
        return order_amount >= self.sales_order_approval_threshold
    
    def requires_writeoff_approval(self, estimated_cost=None):
        """Check if write-off requires approval based on threshold"""
        if not self.require_writeoff_approval:
            return False
        
        if self.writeoff_approval_threshold is None:
            return True  # All write-offs require approval
        
        if estimated_cost is None:
            return True  # If cost unknown, require approval
        
        return estimated_cost >= self.writeoff_approval_threshold
