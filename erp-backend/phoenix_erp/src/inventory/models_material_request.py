# inventory/models_material_request.py
"""
Material Request System for Inventory Items
Allows requesting inventory items linked to service invoices with approval workflow
"""
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import date
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from clients.models import Client
from .models import InventoryItem, Location


class MaterialRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Material Request for getting items from inventory
    Can be linked to a service invoice for special service items that allow inventory access
    """
    request_number = models.CharField(max_length=50, unique=True, db_index=True)
    request_date = models.DateField(default=date.today)
    
    # Requestor
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='material_requests',
        help_text="Client requesting the items"
    )
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='material_requests_created',
        help_text="Staff who created this material request"
    )
    
    # Link to the invoice that entitles this request
    # This should be a service invoice (incomes.Invoice) with special service items
    # that allow inventory access
    from incomes.models import Invoice as ServiceInvoice
    service_invoice = models.ForeignKey(
        'incomes.Invoice',
        on_delete=models.PROTECT,
        related_name='material_requests',
        null=True,
        blank=True,
        help_text="Service invoice that authorizes this material request"
    )
    
    # Delivery location
    delivery_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='material_requests',
        help_text="Location where items will be delivered/collected"
    )
    
    # Purpose and notes
    purpose = models.TextField(help_text="Purpose/reason for requesting these items")
    notes = models.TextField(blank=True)
    
    # Status and workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('fulfilled', 'Fulfilled'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Approval tracking
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='material_requests_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    rejected_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='material_requests_rejected'
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Fulfillment tracking
    fulfilled_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='material_requests_fulfilled'
    )
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    
    # Accounting tracking
    # When fulfilled, an inventory invoice is created
    inventory_invoice = models.ForeignKey(
        'inventory.Invoice',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='material_requests',
        help_text="Inventory invoice generated when request is fulfilled"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-request_date', '-created_at']
        indexes = [
            models.Index(fields=['request_number']),
            models.Index(fields=['status']),
            models.Index(fields=['client']),
        ]
    
    def __str__(self):
        return f"MR-{self.request_number} - {self.client}"
    
    def submit(self, user=None):
        """Submit request for approval"""
        if self.status != 'draft':
            raise ValidationError("Only draft requests can be submitted")
        
        if not self.items.exists():
            raise ValidationError("Cannot submit request without items")
        
        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.save()
        return True
    
    def approve(self, user, notes=''):
        """Approve the material request"""
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be approved")
        
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save()
        return True
    
    def reject(self, user, reason):
        """Reject the material request"""
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be rejected")
        
        if not reason:
            raise ValidationError("Rejection reason is required")
        
        self.status = 'rejected'
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save()
        return True
    
    def validate_stock_availability(self):
        """
        Validate that sufficient stock is available to fulfill this request.
        
        Returns:
            tuple: (is_valid, error_messages)
                is_valid (bool): True if all items have sufficient stock
                error_messages (list): List of error messages for items with insufficient stock
        
        Raises:
            ValidationError: If no items in request or other validation errors
        """
        if not self.items.exists():
            raise ValidationError("Cannot validate request without items")
        
        errors = []
        
        for mr_item in self.items.select_related('item').all():
            # Get stock at delivery location
            from .models import InventoryStock
            
            try:
                stock = InventoryStock.objects.get(
                    item=mr_item.item,
                    location=self.delivery_location
                )
                
                # Check if sufficient stock is available
                if stock.quantity_available < mr_item.quantity:
                    errors.append(
                        f"{mr_item.item.sku} - {mr_item.item.name}: "
                        f"Insufficient stock. Requested: {mr_item.quantity}, "
                        f"Available: {stock.quantity_available} at {self.delivery_location.name}"
                    )
            except InventoryStock.DoesNotExist:
                errors.append(
                    f"{mr_item.item.sku} - {mr_item.item.name}: "
                    f"No stock record found at {self.delivery_location.name}"
                )
        
        return (len(errors) == 0, errors)
    
    @transaction.atomic
    def fulfill(self, user):
        """
        Fulfill the material request by creating an inventory invoice
        and reducing stock.
        
        Validates stock availability BEFORE attempting fulfillment.
        
        Raises:
            ValidationError: If stock is insufficient or other validation errors
        """
        if self.status != 'approved':
            raise ValidationError("Only approved requests can be fulfilled")
        
        if not self.items.exists():
            raise ValidationError("Cannot fulfill request without items")
        
        # PRE-FULFILLMENT VALIDATION: Check stock availability
        is_valid, error_messages = self.validate_stock_availability()
        if not is_valid:
            error_detail = "\n".join(error_messages)
            raise ValidationError(
                f"Cannot fulfill material request - insufficient stock:\n{error_detail}"
            )
        
        # Import here to avoid circular dependency
        from .models import Invoice, InvoiceItem
        from .stock_service import InventoryService
        
        # Create inventory invoice
        invoice = Invoice.objects.create(
            invoice_number=f"MR-INV-{self.request_number}",
            client=self.client,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),  # Immediate since it's from material request
            status='draft',
            notes=f"Material Request: {self.request_number}",
            owner=self.owner,
            branch=self.branch,
            created_by=user
        )
        
        # Create invoice items from material request items
        subtotal = Decimal('0.00')
        for mr_item in self.items.all():
            invoice_item = InvoiceItem.objects.create(
                invoice=invoice,
                item=mr_item.item,
                description=f"{mr_item.item.name} - MR: {self.request_number}",
                quantity=mr_item.quantity,
                unit_price=mr_item.item.cost_price,  # Use cost price for material requests
                total_price=mr_item.quantity * mr_item.item.cost_price,
                reserved_from_location=self.delivery_location
            )
            subtotal += invoice_item.total_price
        
        # Update invoice totals
        invoice.subtotal = subtotal
        invoice.total_amount = subtotal
        invoice.save()
        
        # Link invoice to this request
        self.inventory_invoice = invoice
        self.status = 'fulfilled'
        self.fulfilled_by = user
        self.fulfilled_at = timezone.now()
        self.save()
        
        # Post the invoice to reduce inventory
        invoice.post(user=user)
        
        return invoice


class MaterialRequestItem(TimeStampedModel, SoftDeleteModel):
    """Line items in a material request"""
    material_request = models.ForeignKey(
        MaterialRequest,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='material_request_items'
    )
    
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity requested"
    )
    
    approved_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Quantity approved (may differ from requested)"
    )
    
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['created_at']
        unique_together = [('material_request', 'item')]
    
    def __str__(self):
        return f"{self.item.name} x {self.quantity}"
    
    def clean(self):
        """Validate quantities"""
        if self.quantity <= 0:
            raise ValidationError("Quantity must be greater than 0")
        
        if self.approved_quantity is not None and self.approved_quantity < 0:
            raise ValidationError("Approved quantity cannot be negative")
