# procurement/models.py (ENHANCEMENTS)
"""
Enhanced procurement models with approval workflows and better tracking
"""
from django.conf import settings
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from inventory.models import InventoryItem, Location
from liabilities.models import AccountsPayable


def get_current_date():
    """Helper function for default date (serializable for migrations)"""
    return timezone.now().date()


class Supplier(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Supplier/Vendor management
    """
    supplier_code = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Unique supplier code per tenant"
    )
    
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    
    # Contact details
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    
    # Tax information
    tax_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Tax identification number"
    )
    
    # Payment terms
    PAYMENT_TERMS_CHOICES = [
        ('cash', 'Cash on Delivery'),
        ('net_15', 'Net 15 Days'),
        ('net_30', 'Net 30 Days'),
        ('net_60', 'Net 60 Days'),
        ('net_90', 'Net 90 Days'),
        ('custom', 'Custom Terms'),
    ]
    payment_terms = models.CharField(
        max_length=20,
        choices=PAYMENT_TERMS_CHOICES,
        default='net_30'
    )
    
    # Credit management
    credit_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Maximum credit allowed"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    
    # Additional metadata
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional supplier information (bank details, certifications, etc.)"
    )

    # Dedicated subledger GL account — every AP invoice, on-account advance,
    # and applied payment for this supplier posts here, so the balance is
    # always correct and a vendor statement is just this account's ledger.
    # Nullable only until backfill_supplier_accounts has run for legacy rows.
    account = models.OneToOneField(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='supplier_detail',
        help_text="Dedicated LIABILITY subledger account for this supplier's payables/advances."
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
        ordering = ['name']
        unique_together = [('owner', 'branch', 'supplier_code')]
        indexes = [
            models.Index(fields=['supplier_code']),
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return f"{self.supplier_code} - {self.name}"
    
    def get_outstanding_balance(self):
        """Calculate total outstanding balance from accounts payable"""
        from django.db.models import Sum, F, ExpressionWrapper, DecimalField
        from liabilities.models import AccountsPayable

        payables = AccountsPayable.for_vendor(self).exclude(status='cancelled')
        result = payables.aggregate(
            total=Sum(
                ExpressionWrapper(
                    F('amount') - F('amount_paid'),
                    output_field=DecimalField(max_digits=18, decimal_places=2)
                )
            )
        )
        return result['total'] or Decimal('0')


class SupplierDocument(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Documents attached to a supplier (contracts, certificates, tax docs, etc.)
    """
    CATEGORY_CHOICES = [
        ('contract', 'Contract / Agreement'),
        ('certificate', 'Registration Certificate'),
        ('tax_document', 'Tax Registration (TIN)'),
        ('insurance', 'Insurance Certificate'),
        ('license', 'Business License'),
        ('bank_details', 'Bank Account Details'),
        ('nda', 'NDA / Confidentiality'),
        ('quality', 'Quality Certification'),
        ('other', 'Other'),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='documents',
    )
    title = models.CharField(max_length=200)
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default='other',
    )
    file = models.FileField(upload_to='supplier_documents/')
    description = models.TextField(blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='uploaded_supplier_documents',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_category_display()}) - {self.supplier.name}"

    @property
    def is_expired(self):
        if self.expiry_date:
            return self.expiry_date < timezone.now().date()
        return False


class PurchaseRequisition(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Purchase requisition - request for purchase before PO
    """
    pr_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='purchase_requisitions'
    )
    
    department = models.CharField(max_length=100, blank=True)
    
    # Dates
    request_date = models.DateField(default=get_current_date)
    required_by_date = models.DateField(
        help_text="When items are needed"
    )
    
    # Justification
    purpose = models.TextField(help_text="Reason for purchase")
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('po_created', 'PO Created'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Vendor Invoice (Required before approval per control framework)
    vendor_invoice_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Vendor's invoice number (required for approval)"
    )
    vendor_invoice_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date on vendor's invoice"
    )
    vendor_invoice_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total amount on vendor's invoice"
    )
    vendor_invoice_file = models.FileField(
        upload_to='procurement/vendor_invoices/',
        null=True,
        blank=True,
        help_text="Upload vendor invoice (PDF/Image)"
    )
    invoice_verified_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='verified_pr_invoices',
        help_text="User who verified the invoice details"
    )
    invoice_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When invoice was verified"
    )
    
    # Approval
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_requisitions'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Estimated total
    estimated_total = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    notes = models.TextField(blank=True)
    
    # Workflow Integration (Phase 1)
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='purchase_requisitions'
    )
    
    origin_reference = models.CharField(
        max_length=50,        blank=True,        editable=False,
        db_index=True,
        help_text="Self-reference for tracking (same as pr_number)"
    )
    
    approval_chain = models.JSONField(
        default=list,
        blank=True,
        help_text="Track all approvers and decisions"
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
        ordering = ['-request_date']
        indexes = [
            models.Index(fields=['status', 'request_date']),
        ]
    
    def __str__(self):
        return f"PR-{self.pr_number}"
    
    def calculate_total(self):
        """Calculate estimated total from items"""
        from django.db.models import Sum, F
        
        result = self.items.aggregate(
            total=Sum(F('quantity') * F('estimated_unit_price'))
        )
        self.estimated_total = result['total'] or Decimal('0')
        self.save(update_fields=['estimated_total'])


class PurchaseRequisitionItem(TimeStampedModel, SoftDeleteModel):
    """Items in purchase requisition"""
    requisition = models.ForeignKey(
        PurchaseRequisition,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='requisition_items'
    )
    
    description = models.TextField()
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    estimated_unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Link to eventual PO item
    po_item = models.ForeignKey(
        'PurchaseOrderItem',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='requisition_items'
    )
    
    notes = models.TextField(blank=True)
    
    def save(self, *args, **kwargs):
        # Auto-assign tenant from requisition
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if not tenant and self.requisition:
                tenant = self.requisition.tenant
            if not tenant and self.owner:
                tenant = self.owner.tenant
            if not tenant and self.branch:
                tenant = self.branch.tenant
            self.tenant = tenant
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.requisition.pr_number} - {self.description}"


class SupplierQuote(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Supplier quotes for comparison before creating PO
    """
    quote_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    requisition = models.ForeignKey(
        PurchaseRequisition,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='quotes'
    )
    
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.PROTECT,
        related_name='quotes'
    )
    
    quote_date = models.DateField(default=get_current_date)
    valid_until = models.DateField()
    
    # Amounts
    subtotal = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Payment terms
    payment_terms = models.CharField(max_length=100, blank=True)
    delivery_terms = models.CharField(max_length=100, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('received', 'Received'),
        ('selected', 'Selected'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='received'
    )
    
    notes = models.TextField(blank=True)
    attachment = models.FileField(
        upload_to='procurement/quotes/',
        null=True,
        blank=True
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-quote_date']
    
    def __str__(self):
        return f"Quote-{self.quote_number} - {self.supplier.name}"


class SupplierQuoteItem(TimeStampedModel, SoftDeleteModel):
    """Items in supplier quote"""
    quote = models.ForeignKey(
        SupplierQuote,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT
    )
    
    description = models.TextField()
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    total_price = models.DecimalField(max_digits=18, decimal_places=2)
    
    lead_time_days = models.IntegerField(
        null=True,
        blank=True,
        help_text="Delivery lead time"
    )
    
    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)


# ENHANCED PURCHASE ORDER
class PurchaseOrder(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Enhanced Purchase Order with better tracking"""
    po_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Links
    requisition = models.ForeignKey(
        PurchaseRequisition,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='purchase_orders'
    )
    
    selected_quote = models.ForeignKey(
        SupplierQuote,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='purchase_orders'
    )
    
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.PROTECT,
        related_name='purchase_orders'
    )
    
    # Dates
    order_date = models.DateField(default=get_current_date)
    expected_delivery_date = models.DateField(null=True, blank=True)
    delivery_date = models.DateField(null=True, blank=True)
    
    # Destination
    delivery_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='purchase_orders'
    )
    
    # Contact
    contact_person = models.CharField(max_length=200, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    
    # Payment Terms
    payment_terms = models.CharField(
        max_length=50,
        default='net_30',
        choices=[
            ('cash', 'Cash on Delivery'),
            ('net_15', 'Net 15 Days'),
            ('net_30', 'Net 30 Days'),
            ('net_60', 'Net 60 Days'),
            ('net_90', 'Net 90 Days'),
            ('custom', 'Custom Terms'),
        ]
    )
    custom_payment_terms = models.CharField(max_length=200, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('sent', 'Sent to Supplier'),
        ('acknowledged', 'Acknowledged by Supplier'),
        ('partially_received', 'Partially Received'),
        ('received', 'Fully Received'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Amounts
    subtotal = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Workflow Integration (Phase 1)
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='purchase_orders'
    )
    
    pr_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="Parent PR reference number"
    )
    
    origin_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="Original PR number for tracking chain"
    )
    
    # Approval
    requires_approval = models.BooleanField(default=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_purchase_orders'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Supplier acknowledgment
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    supplier_po_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Supplier's PO reference"
    )
    
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(
        blank=True,
        help_text="Notes not visible to supplier"
    )
    
    # Attachments
    attachment = models.FileField(
        upload_to='procurement/pos/',
        null=True,
        blank=True
    )
    
    objects = OwnerBranchManager()
    
    def clean(self):
        """Defense in depth: delivery_location must belong to this PO's own branch."""
        if self.delivery_location_id and self.branch_id and \
                self.delivery_location.branch_id != self.branch_id:
            raise ValidationError("delivery_location must belong to this purchase order's branch.")

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
        # Only enforced on INSERT, not on later partial-field status updates —
        # mirrors TransactionEntry.save()'s rationale (transactions/models.py).
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-order_date']
        indexes = [
            models.Index(fields=['status', 'order_date']),
            models.Index(fields=['supplier', 'status']),
        ]

    def __str__(self):
        return f"PO-{self.po_number}"
    
    def calculate_totals(self):
        """Recalculate order totals"""
        from django.db.models import Sum, F
        
        result = self.items.aggregate(
            subtotal=Sum(F('quantity') * F('unit_price'))
        )
        
        self.subtotal = result['subtotal'] or Decimal('0')
        self.total_amount = (
            self.subtotal + 
            self.tax_amount + 
            self.shipping_cost - 
            self.discount
        )
        self.save(update_fields=['subtotal', 'total_amount'])
    
    @property
    def received_percentage(self):
        """Calculate percentage of items received"""
        total_qty = Decimal('0')
        received_qty = Decimal('0')
        
        for item in self.items.all():
            total_qty += item.quantity
            received_qty += item.quantity_received
        
        if total_qty == 0:
            return 0
        
        return (received_qty / total_qty) * 100


class PurchaseOrderItem(TimeStampedModel, SoftDeleteModel):
    """Enhanced PO line items"""
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='purchase_order_items'
    )
    
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=18, decimal_places=2)
    
    quantity_received = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Expected delivery for this item
    expected_delivery_date = models.DateField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    
    def save(self, *args, **kwargs):
        # Auto-set tenant if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.purchase_order and hasattr(self.purchase_order, 'tenant'):
                self.tenant = self.purchase_order.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
        
        subtotal = self.quantity * self.unit_price
        tax = subtotal * (self.tax_rate / Decimal('100'))
        self.total_price = subtotal + tax - self.discount
        super().save(*args, **kwargs)
    
    @property
    def quantity_pending(self):
        return self.quantity - self.quantity_received
    
    @property
    def is_fully_received(self):
        return self.quantity_received >= self.quantity
    
    def __str__(self):
        return f"{self.item.sku} x {self.quantity}"


class GoodsReceivedNote(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Enhanced GRN with quality control"""
    grn_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='goods_received_notes'
    )
    
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.PROTECT,
        related_name='goods_received_notes'
    )
    
    received_date = models.DateField(default=get_current_date)
    received_time = models.TimeField(default=timezone.now)
    received_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='goods_received'
    )
    
    # Receiving personnel
    received_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='received_goods'
    )
    
    # Supplier delivery info
    delivery_note_number = models.CharField(max_length=100, blank=True)
    vehicle_number = models.CharField(max_length=50, blank=True)
    driver_name = models.CharField(max_length=200, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)
    
    # Invoice details
    supplier_invoice_number = models.CharField(max_length=100, blank=True)
    supplier_invoice_date = models.DateField(null=True, blank=True)
    supplier_invoice_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Quality Control
    QUALITY_STATUS = [
        ('pending', 'Pending Inspection'),
        ('passed', 'Passed'),
        ('failed', 'Failed'),
        ('partial', 'Partial Pass'),
    ]
    quality_status = models.CharField(
        max_length=20,
        choices=QUALITY_STATUS,
        default='pending'
    )
    inspected_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inspected_goods'
    )
    inspection_notes = models.TextField(blank=True)
    
    # Amounts
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Status
    is_posted = models.BooleanField(
        default=False,
        help_text="Posted to inventory and accounting"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_grns'
    )
    
    # Link to accounts payable
    accounts_payable = models.ForeignKey(
        'liabilities.AccountsPayable',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='grns'
    )
    
    notes = models.TextField(blank=True)
    
    # Attachments
    delivery_note_attachment = models.FileField(
        upload_to='procurement/delivery_notes/',
        null=True,
        blank=True
    )
    photos = models.JSONField(
        default=list,
        help_text="List of photo URLs"
    )
    
    objects = OwnerBranchManager()
    
    def clean(self):
        """Defense in depth: received_location must belong to this GRN's own branch."""
        if self.received_location_id and self.branch_id and \
                self.received_location.branch_id != self.branch_id:
            raise ValidationError("received_location must belong to this GRN's branch.")

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
        # Only enforced on INSERT, not on later partial-field status updates —
        # mirrors TransactionEntry.save()'s rationale (transactions/models.py).
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-received_date']
        indexes = [
            models.Index(fields=['received_date', 'is_posted']),
            models.Index(fields=['supplier', 'received_date']),
        ]

    def __str__(self):
        return f"GRN-{self.grn_number}"
    
    def calculate_total(self):
        """Calculate total from items"""
        from django.db.models import Sum
        
        result = self.items.aggregate(
            total=Sum('total_cost')
        )
        self.total_amount = result['total'] or Decimal('0')
        self.save(update_fields=['total_amount'])


class GoodsReceivedNoteItem(TimeStampedModel, SoftDeleteModel):
    """Items in GRN with quality tracking"""
    grn = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='grn_items'
    )
    
    po_item = models.ForeignKey(
        PurchaseOrderItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='received_items'
    )
    
    # Quantities
    quantity_ordered = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="From PO"
    )
    quantity_received = models.DecimalField(max_digits=18, decimal_places=2)
    quantity_accepted = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="After quality check"
    )
    quantity_rejected = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Failed quality check"
    )
    
    # Costing
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    total_cost = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Tracking
    batch_number = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    
    # Quality notes
    condition_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    # Extended quality inspection data (JSON)
    quality_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Extended quality inspection fields: condition_rating, visual_inspection, "
                  "packaging_condition, expiry_check, batch_verification, temperature_check"
    )
    
    def save(self, *args, **kwargs):
        # Auto-set tenant if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.grn and hasattr(self.grn, 'tenant'):
                self.tenant = self.grn.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
        
        self.total_cost = self.quantity_received * self.unit_cost
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.grn.grn_number} - {self.item.sku}"


class PurchaseReturn(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Return goods to supplier
    """
    return_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    grn = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.PROTECT,
        related_name='returns'
    )
    
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.PROTECT,
        related_name='purchase_returns'
    )
    
    return_date = models.DateField(default=get_current_date)
    
    RETURN_REASONS = [
        ('damaged', 'Damaged'),
        ('wrong_item', 'Wrong Item'),
        ('defective', 'Defective'),
        ('excess', 'Excess Quantity'),
        ('quality', 'Quality Issues'),
        ('other', 'Other'),
    ]
    return_reason = models.CharField(max_length=20, choices=RETURN_REASONS)
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('shipped', 'Shipped to Supplier'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Amounts
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Refund tracking
    refund_method = models.CharField(
        max_length=20,
        choices=[
            ('credit_note', 'Credit Note'),
            ('cash', 'Cash Refund'),
            ('replacement', 'Replacement'),
        ],
        default='credit_note'
    )
    refund_received = models.BooleanField(default=False)
    refund_date = models.DateField(null=True, blank=True)
    
    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='purchase_returns',
        help_text="Journal entry created when return is posted"
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-return_date']
    
    def __str__(self):
        return f"RET-{self.return_number}"
    
    def calculate_total(self):
        """Calculate total from items"""
        from django.db.models import Sum
        
        result = self.items.aggregate(
            total=Sum('total_cost')
        )
        self.total_amount = result['total'] or Decimal('0')
        self.save(update_fields=['total_amount'])


class PurchaseReturnItem(TimeStampedModel, SoftDeleteModel):
    """Items in purchase return"""
    purchase_return = models.ForeignKey(
        PurchaseReturn,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    grn_item = models.ForeignKey(
        GoodsReceivedNoteItem,
        on_delete=models.PROTECT,
        related_name='return_items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT
    )
    
    quantity_returned = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    total_cost = models.DecimalField(max_digits=18, decimal_places=2)
    
    reason = models.TextField()
    
    def save(self, *args, **kwargs):
        self.total_cost = self.quantity_returned * self.unit_cost
        super().save(*args, **kwargs)


# Import ProcurementConfig from config_models
from procurement.config_models import ProcurementConfig

__all__ = [
    'Supplier',
    'SupplierDocument',
    'PurchaseRequisition',
    'PurchaseRequisitionItem',
    'SupplierQuote',
    'SupplierQuoteItem',
    'PurchaseOrder',
    'PurchaseOrderItem',
    'GoodsReceivedNote',
    'GoodsReceivedNoteItem',
    'PurchaseReturn',
    'PurchaseReturnItem',
    'ProcurementConfig',
]