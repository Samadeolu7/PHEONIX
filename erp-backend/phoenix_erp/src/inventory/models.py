# inventory/models.py
"""
Complete inventory, purchasing, and sales management
Integrates with accounting for proper double-entry
"""
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from clients.models import Client


# ================================================================
# INVENTORY MANAGEMENT
# ================================================================

class InventoryCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Categories for inventory items"""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)

    # Item type: a user-defined label grouping categories by what kind of physical
    # item they represent (e.g. "Book", "Uniform", "Stationery", "Equipment").
    # Used by ServiceItem.material_request_config["allowed_item_types"] to
    # authorise material requests without having to list every category code.
    item_type = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text=(
            "Broad item-type label for this category, e.g. 'Book', 'Uniform', "
            "'Stationery'. Used to authorise material requests by type rather than "
            "by individual category code."
        )
    )

    # Link to GL accounts
    inventory_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='inventory_categories',
        help_text="Asset account for inventory valuation"
    )
    cogs_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='cogs_categories',
        help_text="Expense account for cost of goods sold"
    )
    sales_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='sales_categories',
        null=True,
        blank=True,
        help_text="Income account for sales revenue (auto-created per category if not provided)"
    )
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Auto-set tenant if not provided"""
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
        verbose_name_plural = 'Inventory Categories'
        unique_together = [('branch', 'code')]
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class InventoryItem(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    **MASTER INVENTORY RECORD**
    
    This is the master data for products/items in your system.
    It defines WHAT the item is (name, SKU, pricing, category).
    
    For actual stock quantities, see InventoryStock model which tracks
    HOW MUCH of this item exists at EACH LOCATION.
    
    Relationship:
    - ONE InventoryItem (e.g., "iPhone 15 Pro")
    - MANY InventoryStock records (Warehouse A: 50 units, Store B: 20 units)
    
    Use Cases:
    - Product catalog management
    - Pricing and cost management
    - Reorder level settings
    - Item categorization
    
    For stock operations (receive, transfer, adjust), always work through
    InventoryStock and InventoryService - never modify quantities directly.
    """
    # Basic info
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=100, db_index=True)
    barcode = models.CharField(max_length=100, blank=True, db_index=True)
    description = models.TextField(blank=True)
    
    category = models.ForeignKey(
        InventoryCategory,
        on_delete=models.PROTECT,
        related_name='items'
    )
    
    # Pricing
    unit_of_measure = models.CharField(
        max_length=20,
        default='unit',
        help_text="unit, kg, liter, box, etc."
    )
    cost_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Cost price per unit"
    )
    selling_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Selling price per unit"
    )
    minimum_selling_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Minimum allowed selling price"
    )
    
    # Stock tracking
    VALUATION_METHODS = [
        ('fifo', 'First In First Out'),
        ('lifo', 'Last In First Out'),
        ('average', 'Weighted Average'),
    ]
    valuation_method = models.CharField(
        max_length=20,
        choices=VALUATION_METHODS,
        default='fifo'
    )
    
    # Reorder settings
    reorder_level = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Trigger reorder when stock reaches this level"
    )
    reorder_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Quantity to reorder"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    is_sellable = models.BooleanField(default=True)
    is_purchasable = models.BooleanField(default=True)
    
    # Tracking options
    track_serial_numbers = models.BooleanField(default=False)
    track_batch_numbers = models.BooleanField(default=False)
    track_expiry = models.BooleanField(default=False)
    
    # Metadata
    metadata = models.JSONField(
        default=dict,
        help_text="Additional item-specific data"
    )
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Auto-set tenant if not provided"""
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
        unique_together = [('branch', 'sku')]
        ordering = ['name']
        indexes = [
            models.Index(fields=['sku']),
            models.Index(fields=['barcode']),
        ]
    
    def __str__(self):
        return f"{self.sku} - {self.name}"
    
    @property
    def total_stock(self) -> Decimal:
        """Total quantity on hand across all locations"""
        from django.db.models import Sum
        result = self.stock_records.aggregate(total=Sum('quantity_on_hand'))
        return result['total'] or Decimal('0.00')
    
    @property
    def total_available(self) -> Decimal:
        """Total quantity available (on hand - reserved) across all locations"""
        from django.db.models import Sum
        result = self.stock_records.aggregate(total=Sum('quantity_available'))
        return result['total'] or Decimal('0.00')
    
    @property
    def total_reserved(self) -> Decimal:
        """Total quantity reserved across all locations"""
        from django.db.models import Sum
        result = self.stock_records.aggregate(total=Sum('quantity_reserved'))
        return result['total'] or Decimal('0.00')
    
    @property
    def total_value(self) -> Decimal:
        """Total inventory value across all locations"""
        from django.db.models import Sum
        result = self.stock_records.aggregate(total=Sum('total_value'))
        return result['total'] or Decimal('0.00')
    
    @property
    def needs_reorder(self) -> bool:
        """Check if item needs reordering (total stock <= reorder level)"""
        return self.total_stock <= self.reorder_level
    
    def get_stock_at_location(self, location) -> 'InventoryStock':
        """
        Get or create stock record for this item at a specific location.
        Returns the InventoryStock instance.
        """
        stock, created = self.stock_records.get_or_create(
            location=location,
            defaults={
                'quantity_on_hand': Decimal('0'),
                'quantity_reserved': Decimal('0'),
                'quantity_available': Decimal('0'),
                'average_cost': self.cost_price,
                'total_value': Decimal('0'),
            }
        )
        return stock
    
    def get_available_locations(self):
        """
        Get all locations where this item has stock (quantity_on_hand > 0).
        Returns queryset of Location objects.
        """
        from django.db.models import Q
        return Location.objects.filter(
            stock_records__item=self,
            stock_records__quantity_on_hand__gt=0
        ).distinct()


class Location(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Storage location/warehouse"""
    name = models.CharField(max_length=200)
    code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Optional location code. Must be unique per branch if provided."
    )
    location_type = models.CharField(
        max_length=20,
        choices=[
            ('warehouse', 'Warehouse'),
            ('store', 'Store'),
            ('vehicle', 'Vehicle'),
            ('other', 'Other'),
        ],
        default='warehouse'
    )
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('branch', 'code')]
        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'code'],
                condition=models.Q(code__isnull=False) & ~models.Q(code=''),
                name='unique_location_code_per_branch'
            )
        ]
    
    def clean(self):
        """Validate that code is unique or None"""
        super().clean()
        # Convert empty string to None to avoid unique constraint issues
        if self.code == '':
            self.code = None
    
    def save(self, *args, **kwargs):
        """Override save to ensure clean is called and auto-set tenant"""
        if self.code == '':
            self.code = None
        
        # Auto-set tenant if not provided
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
    
    def __str__(self):
        if self.code:
            return f"{self.code} - {self.name}"
        return self.name


class InventoryStock(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    **LOCATION-SPECIFIC STOCK TRACKING**
    
    This tracks actual quantities for an InventoryItem at a specific Location.
    It answers: HOW MUCH of an item exists WHERE.
    
    Relationship:
    - Each InventoryStock record = ONE item at ONE location
    - Multiple InventoryStock records can exist for the same item (different locations)
    
    Key Fields:
    - quantity_on_hand: Physical units available
    - quantity_reserved: Units reserved for orders/allocations
    - quantity_available: On hand - reserved (what can be sold)
    - average_cost: Weighted average cost per unit (for valuation)
    - total_value: quantity_on_hand * average_cost
    
    IMPORTANT: Never modify quantities directly!
    Always use InventoryService methods:
    - receive_stock() - Add stock from purchases
    - reduce_stock() - Remove stock for sales/consumption
    - transfer_stock() - Move between locations
    - adjust_stock() - Corrections/adjustments
    - reserve_stock() - Reserve for orders
    - release_reservation() - Cancel reservations
    
    All operations create StockMovement audit trail and accounting entries.
    """
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='stock_records'
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='stock_records'
    )
    
    # Quantities
    quantity_on_hand = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    quantity_reserved = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Reserved for orders/invoices"
    )
    quantity_available = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="On hand - reserved"
    )
    
    # Valuation
    average_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Weighted average cost"
    )
    total_value = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="quantity_on_hand * average_cost"
    )
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Auto-set tenant if not provided"""
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.item and hasattr(self.item, 'tenant'):
                self.tenant = self.item.tenant
            elif self.location and hasattr(self.location, 'tenant'):
                self.tenant = self.location.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        super().save(*args, **kwargs)
    
    class Meta:
        unique_together = [('item', 'location')]
        indexes = [
            models.Index(fields=['item', 'location']),
        ]
    
    def __str__(self):
        return f"{self.item.sku} @ {self.location.code}: {self.quantity_on_hand}"
    
    def update_available(self):
        """Recalculate available quantity"""
        self.quantity_available = self.quantity_on_hand - self.quantity_reserved
        self.save(update_fields=['quantity_available'])
    
    def update_valuation(self):
        """Recalculate total value"""
        self.total_value = self.quantity_on_hand * self.average_cost
        self.save(update_fields=['total_value'])


class StockMovement(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Record of all stock movements (in/out/transfer)
    """
    MOVEMENT_TYPES = [
        ('purchase', 'Purchase Receipt'),
        ('sale', 'Sales Delivery'),
        ('adjustment', 'Stock Adjustment'),
        ('transfer', 'Transfer'),
        ('return_in', 'Purchase Return'),
        ('return_out', 'Sales Return'),
        ('write_off', 'Write Off'),
        ('production_in', 'Production Receipt'),
        ('production_out', 'Production Issue'),
        ('office_use', 'Office Use Issue'),
    ]
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='movements'
    )
    
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    movement_date = models.DateField(default=timezone.now)
    reference_number = models.CharField(max_length=100, db_index=True)
    
    # Location details
    from_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='movements_out'
    )
    to_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='movements_in'
    )
    
    # Quantity and costing
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Tracking details
    batch_number = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    
    # Link to source document
    source_document_type = models.CharField(max_length=50, blank=True)
    source_document_id = models.CharField(max_length=50, blank=True)
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Compute total_cost and auto-set tenant if not provided"""
        self.total_cost = self.quantity * self.unit_cost
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.item and hasattr(self.item, 'tenant'):
                self.tenant = self.item.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-movement_date', '-created_at']
        indexes = [
            models.Index(fields=['item', 'movement_date']),
            models.Index(fields=['reference_number']),
        ]

    def __str__(self):
        return f"{self.movement_type}: {self.item.sku} ({self.quantity})"


# ================================================================
# SALES & INVOICING
# ================================================================

class SalesOrder(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Sales order with approval workflow support"""
    so_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='sales_orders'
    )
    
    # Dates
    order_date = models.DateField(default=timezone.now)
    expected_delivery_date = models.DateField(null=True, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('confirmed', 'Confirmed'),
        ('processing', 'Processing'),
        ('partially_delivered', 'Partially Delivered'),
        ('delivered', 'Delivered'),
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
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Approval tracking
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_sales_orders'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['status', 'order_date']),
            models.Index(fields=['client', 'status']),
        ]
    
    def __str__(self):
        return f"SO-{self.so_number}"
    
    def requires_approval(self):
        """Check if this sales order requires approval based on config"""
        from inventory.config_models import InventoryConfig
        try:
            config = InventoryConfig.objects.get(
                owner=self.owner,
                branch=self.branch
            )
            return config.requires_sales_order_approval(self.total_amount)
        except InventoryConfig.DoesNotExist:
            return False


class SalesOrderItem(TimeStampedModel, SoftDeleteModel):
    """Line items in sales order"""
    sales_order = models.ForeignKey(
        SalesOrder,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='sales_order_items'
    )
    
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=18, decimal_places=2)
    
    quantity_delivered = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    def save(self, *args, **kwargs):
        self.total_price = (self.quantity * self.unit_price) - self.discount
        super().save(*args, **kwargs)


class Invoice(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Sales invoice - can be linked to sales order or standalone
    """
    invoice_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Override inherited fields to avoid conflicts with incomes.Invoice
    branch = models.ForeignKey(
        'branches.Branch',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inventory_invoices_branch',
        help_text="Branch this invoice belongs to"
    )
    owner = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='inventory_invoices_owned',
        help_text="Invoice owner (tenant)",
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='inventory_invoices_created',
        help_text="User who created this invoice",
        null=True,
        blank=True
    )
    
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='inventory_invoices'
    )
    
    sales_order = models.ForeignKey(
        SalesOrder,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='invoices'
    )
    
    # Dates
    invoice_date = models.DateField(default=timezone.now)
    due_date = models.DateField()
    
    # Amounts
    subtotal = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_inventory_invoices',
        help_text="User who posted this invoice"
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-invoice_date']
    
    def __str__(self):
        return f"INV-{self.invoice_number}"
    
    @property
    def balance(self):
        return self.total_amount - self.amount_paid
    
    def post(self, user=None):
        """
        Post the invoice to accounting and reduce inventory
        
        This method:
        1. Marks the invoice as posted
        2. Records who posted it and when
        3. Triggers the signal that reduces stock and creates COGS entries
        
        Args:
            user: User posting the invoice (optional)
            
        Returns:
            bool: True if posted successfully, False if already posted
            
        Raises:
            ValidationError: If invoice cannot be posted
        """
        from django.core.exceptions import ValidationError
        from django.utils import timezone
        
        # Prevent double posting
        if self.is_posted:
            logger = __import__('logging').getLogger(__name__)
            logger.warning(f"Invoice {self.invoice_number} is already posted")
            return False
        
        # Validate invoice has items
        if not self.items.exists():
            raise ValidationError("Cannot post invoice with no items")
        
        # Mark as posted
        self.is_posted = True
        self.posted_at = timezone.now()
        self.posted_by = user
        
        # Save - this will trigger the post_save signal that reduces stock
        self.save()
        
        return True


class InvoiceItem(TimeStampedModel, SoftDeleteModel):
    """Line items in invoice"""
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        InventoryItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='invoice_items'
    )
    
    description = models.TextField()
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Stock reservation tracking
    reserved_from_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reserved_invoice_items',
        help_text="Location where stock is reserved from"
    )
    reserved_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Quantity of stock reserved for this invoice item"
    )
    is_reservation_released = models.BooleanField(
        default=False,
        help_text="True if reservation has been released (posted or cancelled)"
    )
    
    def save(self, *args, **kwargs):
        self.total_price = (self.quantity * self.unit_price) - self.discount
        super().save(*args, **kwargs)


# inventory/models.py (ADDITIONS)
"""
Enhanced inventory management with voucher/allocation support
"""

class InventoryAllocation(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Prepaid allocation for inventory items - links invoice payment to item entitlements
    Used for: school supplies, fuel vouchers, meal plans, etc.
    """
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='inventory_allocations'
    )
    
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='inventory_allocations',
        help_text="Invoice that funded this allocation"
    )
    
    allocation_number = models.CharField(max_length=50, unique=True, db_index=True)
    allocation_date = models.DateField(default=timezone.now)
    
    # Allocation type determines behavior
    ALLOCATION_TYPES = [
        ('monetary', 'Monetary Value'),  # Track by amount (fuel)
        ('item_specific', 'Specific Items'),  # Track by item quantities
        ('item_category', 'Item Category'),  # Any item in category
    ]
    allocation_type = models.CharField(max_length=20, choices=ALLOCATION_TYPES)
    
    # For monetary allocations
    allocated_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Total monetary value allocated"
    )
    consumed_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Amount already used"
    )
    
    # Validity period
    valid_from = models.DateField(default=timezone.now)
    valid_until = models.DateField(null=True, blank=True)
    
    # Usage rules (stored as JSON for flexibility)
    usage_rules = models.JSONField(
        default=dict,
        help_text="""
        {
            "max_per_transaction": 500.00,
            "max_daily": 1000.00,
            "allowed_days": ["monday", "tuesday"],
            "require_approval_above": 1000.00
        }
        """
    )
    
    # Status
    STATUS_CHOICES = [
        ('pending_payment', 'Pending Payment'),  # Created but minimum payment not yet received
        ('partial_access', 'Partial Access'),    # Minimum paid, can redeem
        ('active', 'Active'),                     # Full access, can redeem freely
        ('partially_used', 'Partially Used'),
        ('exhausted', 'Exhausted'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True
    )
    
    # Linked asset (for asset-specific allocations like vehicle fuel)
    linked_asset = models.ForeignKey(
        'assets.FixedAsset',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='allocations'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-allocation_date']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['allocation_number']),
            models.Index(fields=['linked_asset', 'status']),
        ]
    
    def __str__(self):
        return f"{self.allocation_number} - {self.client.full_name}"
    
    @property
    def remaining_amount(self):
        """Calculate remaining allocation"""
        return self.allocated_amount - self.consumed_amount
    
    @property
    def is_valid(self):
        """Check if allocation is currently valid"""
        today = timezone.now().date()
        if self.status not in ['active', 'partially_used']:
            return False
        if self.valid_until and today > self.valid_until:
            return False
        return True
    
    def can_redeem(self, amount: Decimal) -> tuple[bool, str]:
        """
        Check if redemption is allowed
        Returns: (is_allowed, reason_if_not)
        """
        if not self.is_valid:
            return False, "Allocation is not valid"
        
        if amount > self.remaining_amount:
            return False, f"Insufficient balance. Available: {self.remaining_amount}"
        
        # Check usage rules
        rules = self.usage_rules
        if rules.get('max_per_transaction') and amount > Decimal(str(rules['max_per_transaction'])):
            return False, f"Exceeds maximum per transaction: {rules['max_per_transaction']}"
        
        # Check daily limit
        if rules.get('max_daily'):
            today_usage = self.redemptions.filter(
                redemption_date=timezone.now().date(),
                status='completed'
            ).aggregate(
                total=models.Sum('amount_redeemed')
            )['total'] or Decimal('0')
            
            if today_usage + amount > Decimal(str(rules['max_daily'])):
                return False, f"Would exceed daily limit: {rules['max_daily']}"
        
        return True, ""
    
    def update_status(self):
        """Update status based on consumption"""
        if self.remaining_amount <= 0:
            self.status = 'exhausted'
        elif self.consumed_amount > 0:
            self.status = 'partially_used'
        else:
            self.status = 'active'
        
        # Check expiry
        if self.valid_until and timezone.now().date() > self.valid_until:
            self.status = 'expired'
        
        self.save(update_fields=['status'])


class AllocationItem(TimeStampedModel, SoftDeleteModel):
    """
    Specific items included in an allocation
    For item_specific and item_category allocations
    """
    allocation = models.ForeignKey(
        InventoryAllocation,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='allocation_items'
    )
    
    # Quantity entitlements
    allocated_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity entitled to"
    )
    redeemed_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Quantity already taken"
    )
    
    # Item-specific rules
    max_per_redemption = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum quantity per single redemption"
    )
    
    is_one_time_only = models.BooleanField(
        default=False,
        help_text="Can only be redeemed once (e.g., uniform)"
    )
    
    has_been_redeemed = models.BooleanField(
        default=False,
        help_text="For one-time items"
    )
    
    class Meta:
        unique_together = [('allocation', 'item')]
    
    def __str__(self):
        return f"{self.allocation.allocation_number} - {self.item.name}"
    
    @property
    def remaining_quantity(self):
        return self.allocated_quantity - self.redeemed_quantity
    
    def can_redeem(self, quantity: Decimal) -> tuple[bool, str]:
        """Check if item redemption is allowed"""
        if self.is_one_time_only and self.has_been_redeemed:
            return False, "Item can only be redeemed once and has already been taken"
        
        if quantity > self.remaining_quantity:
            return False, f"Insufficient quantity. Available: {self.remaining_quantity}"
        
        if self.max_per_redemption and quantity > self.max_per_redemption:
            return False, f"Exceeds maximum per redemption: {self.max_per_redemption}"
        
        return True, ""


class AllocationRedemption(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Record of allocation redemptions (picking up items or using fuel voucher)
    """
    allocation = models.ForeignKey(
        InventoryAllocation,
        on_delete=models.PROTECT,
        related_name='redemptions'
    )
    
    redemption_number = models.CharField(max_length=50, unique=True, db_index=True)
    redemption_date = models.DateField(default=timezone.now)
    redemption_time = models.DateTimeField(auto_now_add=True)
    
    # For monetary allocations
    amount_redeemed = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Location where redemption occurred
    location = models.ForeignKey(
        'inventory.Location',
        on_delete=models.PROTECT,
        related_name='redemptions'
    )
    
    # Who authorized the redemption
    authorized_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='authorized_redemptions'
    )
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # For asset tracking (fuel/mileage)
    asset = models.ForeignKey(
        'assets.FixedAsset',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='redemptions'
    )
    meter_reading = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Odometer or hour meter reading"
    )
    
    # Accounting linkage
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    transaction_entry = models.ForeignKey(
        'transactions.TransactionEntry',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='redemptions'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-redemption_date', '-redemption_time']
        indexes = [
            models.Index(fields=['allocation', 'redemption_date']),
            models.Index(fields=['asset', 'redemption_date']),
        ]
    
    def __str__(self):
        return f"{self.redemption_number} - {self.allocation.client.full_name}"
    
    @transaction.atomic
    def complete(self):
        """Complete the redemption and update accounting"""
        if self.status == 'completed':
            raise ValidationError("Redemption already completed")
        
        # Update allocation consumed amount
        self.allocation.consumed_amount += self.amount_redeemed
        self.allocation.update_status()
        
        # Update item quantities if applicable
        for item in self.items.all():
            allocation_item = AllocationItem.objects.get(
                allocation=self.allocation,
                item=item.item
            )
            allocation_item.redeemed_quantity += item.quantity
            if allocation_item.is_one_time_only:
                allocation_item.has_been_redeemed = True
            allocation_item.save()
            
            # Update inventory stock
            from inventory.stock_service import InventoryService
            InventoryService.reduce_stock(
                item=item.item,
                location=self.location,
                quantity=item.quantity,
                movement_type='sale',
                reference_number=self.redemption_number
            )
        
        # Create accounting entry (will be handled by workflow)
        self.status = 'completed'
        self.save()


class RedemptionItem(TimeStampedModel, SoftDeleteModel):
    """Items included in a redemption"""
    redemption = models.ForeignKey(
        AllocationRedemption,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='redemption_items'
    )
    
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    total_cost = models.DecimalField(max_digits=18, decimal_places=2)
    
    def save(self, *args, **kwargs):
        self.total_cost = self.quantity * self.unit_cost
        super().save(*args, **kwargs)


class AssetUsageLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track asset usage for monitoring consumption patterns
    Links redemptions to actual usage
    """
    asset = models.ForeignKey(
        'assets.FixedAsset',
        on_delete=models.CASCADE,
        related_name='usage_logs'
    )
    
    log_date = models.DateField(default=timezone.now)
    
    # Meter readings
    meter_reading_start = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True
    )
    meter_reading_end = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True
    )
    distance_traveled = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Calculated or manual"
    )
    
    # Resource consumption (fuel, etc.)
    resource_consumed = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True
    )
    resource_unit = models.CharField(
        max_length=20,
        default='liters',
        help_text="liters, kWh, etc."
    )
    
    # Efficiency metrics
    consumption_rate = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="e.g., km/liter or hours/liter"
    )
    
    # Link to redemption if applicable
    redemption = models.ForeignKey(
        AllocationRedemption,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='usage_logs'
    )
    
    # Variance tracking
    expected_consumption = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Based on historical averages"
    )
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Actual - Expected"
    )
    variance_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Flags for anomaly detection
    is_anomaly = models.BooleanField(
        default=False,
        help_text="Auto-flagged based on deviation thresholds"
    )
    anomaly_reason = models.TextField(blank=True)
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-log_date']
        indexes = [
            models.Index(fields=['asset', 'log_date']),
            models.Index(fields=['is_anomaly']),
        ]
    
    def calculate_metrics(self):
        """Calculate efficiency and variance metrics"""
        if self.distance_traveled and self.resource_consumed:
            self.consumption_rate = self.distance_traveled / self.resource_consumed
        
        if self.expected_consumption and self.resource_consumed:
            self.variance = self.resource_consumed - self.expected_consumption
            self.variance_percentage = (self.variance / self.expected_consumption) * 100
            
            # Flag anomalies (>20% deviation)
            if abs(self.variance_percentage) > 20:
                self.is_anomaly = True
                self.anomaly_reason = f"Consumption deviates by {self.variance_percentage:.1f}%"
        
        self.save()


# ================================================================
# INVENTORY VALUATION & COST TRACKING
# ================================================================

class InventoryCostLayer(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track cost layers for FIFO/LIFO inventory valuation
    Each purchase or stock adjustment creates a new layer
    Layers are depleted on sales based on valuation method
    """
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='cost_layers'
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='cost_layers'
    )
    
    # Transaction details
    transaction_type = models.CharField(
        max_length=20,
        choices=[
            ('purchase', 'Purchase Receipt'),
            ('adjustment', 'Stock Adjustment'),
            ('return', 'Sales Return'),
            ('transfer_in', 'Transfer In'),
            ('production', 'Production Receipt'),
        ],
        help_text="Type of transaction that created this layer"
    )
    transaction_reference = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Reference number of source transaction"
    )
    transaction_date = models.DateField(help_text="Date of transaction")
    
    # Quantity tracking
    original_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Initial quantity in this layer"
    )
    quantity_remaining = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity left in this layer"
    )
    
    # Costing
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Cost per unit for this layer"
    )
    total_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="original_quantity * unit_cost"
    )
    remaining_value = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="quantity_remaining * unit_cost"
    )
    
    # Status
    is_depleted = models.BooleanField(
        default=False,
        help_text="True when quantity_remaining = 0"
    )
    depleted_date = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    metadata = models.JSONField(
        default=dict,
        help_text="Additional layer-specific data"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['transaction_date', 'created_at']
        indexes = [
            models.Index(fields=['item', 'location', 'is_depleted']),
            models.Index(fields=['transaction_reference']),
            models.Index(fields=['transaction_date']),
        ]
    
    def __str__(self):
        return f"{self.item.sku} @ {self.location.code}: {self.quantity_remaining} @ {self.unit_cost}"
    
    def save(self, *args, **kwargs):
        """Auto-calculate derived fields"""
        self.total_cost = self.original_quantity * self.unit_cost
        self.remaining_value = self.quantity_remaining * self.unit_cost
        
        # Check if depleted
        if self.quantity_remaining <= 0 and not self.is_depleted:
            self.is_depleted = True
            self.depleted_date = timezone.now()
        
        super().save(*args, **kwargs)
    
    def consume(self, quantity: Decimal) -> Decimal:
        """
        Consume quantity from this layer
        Returns the actual quantity consumed (may be less if layer insufficient)
        """
        if self.is_depleted:
            return Decimal('0.00')
        
        consumed = min(quantity, self.quantity_remaining)
        self.quantity_remaining -= consumed
        
        if self.quantity_remaining <= 0:
            self.is_depleted = True
            self.depleted_date = timezone.now()
        
        self.save()
        return consumed


class CostLayerConsumption(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track which cost layers were consumed for each sale/issue
    Provides audit trail for COGS calculations
    """
    # Source transaction
    movement = models.ForeignKey(
        StockMovement,
        on_delete=models.PROTECT,
        related_name='cost_consumptions',
        help_text="The stock movement (sale/issue) that consumed this layer"
    )
    
    # Layer consumed
    cost_layer = models.ForeignKey(
        InventoryCostLayer,
        on_delete=models.PROTECT,
        related_name='consumptions'
    )
    
    # Consumption details
    quantity_consumed = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity taken from this layer"
    )
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Cost per unit from the layer"
    )
    total_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="quantity_consumed * unit_cost (COGS for this portion)"
    )
    
    consumption_date = models.DateTimeField(default=timezone.now)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-consumption_date']
        indexes = [
            models.Index(fields=['movement']),
            models.Index(fields=['cost_layer']),
        ]
    
    def __str__(self):
        return f"Consumed {self.quantity_consumed} from layer {self.cost_layer.id} @ {self.unit_cost}"
    
    def save(self, *args, **kwargs):
        self.total_cost = self.quantity_consumed * self.unit_cost
        super().save(*args, **kwargs)


# ================================================================
# CREDIT NOTES
# ================================================================

from .models_credit_note import CreditNote, CreditNoteItem


# ================================================================
# APPROVAL REQUESTS
# ================================================================

class StockAdjustmentRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Stock adjustment approval request.
    Created when adjustment requires approval before execution.
    """
    request_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Requested by
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='stock_adjustment_requests'
    )
    
    # Adjustment details
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='adjustment_requests'
    )
    
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='adjustment_requests'
    )
    
    ADJUSTMENT_TYPES = [
        ('increase', 'Increase Stock'),
        ('decrease', 'Decrease Stock'),
    ]
    adjustment_type = models.CharField(max_length=10, choices=ADJUSTMENT_TYPES)
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated unit cost for approval decision"
    )
    estimated_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Total estimated cost (quantity × unit_cost)"
    )
    
    reason = models.TextField(help_text="Reason for adjustment")
    notes = models.TextField(blank=True)
    
    # Status and approval
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('executed', 'Executed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='approved_adjustment_requests'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    # Link to executed movement
    stock_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='adjustment_request'
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['requested_by']),
        ]
    
    def __str__(self):
        return f"{self.request_number} - {self.item.sku} ({self.status})"

    def clean(self):
        """Defense in depth: location must belong to this request's own branch."""
        if self.location_id and self.branch_id and self.location.branch_id != self.branch_id:
            raise ValidationError("location must belong to this request's branch.")

    def save(self, *args, **kwargs):
        if self.unit_cost:
            self.estimated_cost = self.quantity * self.unit_cost
        # Only enforced on INSERT, not on later partial-field status updates —
        # mirrors TransactionEntry.save()'s rationale (transactions/models.py).
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)


class StockTransferRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Stock transfer request — moves inventory between two locations, which may
    belong to the same branch or to different branches of the same tenant.

    Workflow: pending → approved/rejected → dispatched → acknowledged/short_received
              (or dispatched → disputed, a terminal state requiring manual/offline
              resolution for now).

    Same-branch transfers post no GL entries (nothing left the branch's own
    inventory asset account). Cross-branch transfers post through a pair of
    reciprocal "Due from/Due to" clearing accounts (see
    inventory/services/inter_branch_clearing.py), because TransactionEntry.clean()
    forbids a single journal entry from mixing accounts across branches — see
    interbranch.services for the account-pairing helper this reuses.
    """
    request_number = models.CharField(max_length=50, unique=True, db_index=True)

    # Requested by
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='stock_transfer_requests'
    )

    # Transfer details
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='transfer_requests',
        help_text="The source branch's item record being sent"
    )

    from_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='transfer_requests_out'
    )

    to_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='transfer_requests_in'
    )

    # Denormalized from from_location.branch / to_location.branch at save()
    # time — lets from_branch != to_branch (cross-branch transfer) while
    # self.branch (from BranchScopedModel) continues to mean "the branch
    # that owns/initiated this request", matching from_branch.
    from_branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='transfers_out',
        null=True,
        blank=True,
        help_text="Denormalized from from_location.branch"
    )
    to_branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.PROTECT,
        related_name='transfers_in',
        null=True,
        blank=True,
        help_text="Denormalized from to_location.branch"
    )

    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated unit cost for approval decision"
    )
    estimated_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Total estimated cost (quantity × unit_cost)"
    )

    reason = models.TextField(help_text="Reason for transfer")
    notes = models.TextField(blank=True)
    reference_number = models.CharField(max_length=100, blank=True)

    # Status and approval
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('dispatched', 'Dispatched / In Transit'),
        ('acknowledged', 'Acknowledged / Completed'),
        ('short_received', 'Short Received (Variance)'),
        ('disputed', 'Disputed'),
        # Legacy terminal state from before the dispatch/acknowledge split.
        # New code never produces this again — old rows have no dispatch/
        # acknowledge audit trail, so they are not force-remapped.
        ('executed', 'Executed (Legacy)'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='approved_transfer_requests'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)

    dispatched_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.PROTECT,
        related_name='dispatched_transfer_requests'
    )
    dispatched_at = models.DateTimeField(null=True, blank=True)
    dispatch_notes = models.TextField(blank=True)

    acknowledged_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.PROTECT,
        related_name='acknowledged_transfer_requests'
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledgment_notes = models.TextField(blank=True)

    actual_quantity_received = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    variance_quantity = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text="quantity - actual_quantity_received; positive = shortfall"
    )
    variance_notes = models.TextField(blank=True)

    disputed_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.PROTECT,
        related_name='disputed_transfer_requests'
    )
    disputed_at = models.DateTimeField(null=True, blank=True)
    dispute_reason = models.TextField(blank=True)

    # The destination branch's own item record for this SKU — may differ
    # from `item` (the source branch's record) when auto-linked/created at
    # acknowledge time. See inventory/services/item_linking.py.
    destination_item = models.ForeignKey(
        InventoryItem,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='transfer_requests_received'
    )

    # GL linkage for cross-branch transfers (null for same-branch transfers,
    # which post no GL entries on a full transfer).
    dispatch_journal_entry = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='transfer_dispatches'
    )
    acknowledgment_journal_entry = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='transfer_acknowledgments'
    )

    # Link to executed movements
    transfer_out_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='transfer_out_request'
    )
    transfer_in_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='transfer_in_request'
    )

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['requested_by']),
            models.Index(fields=['from_branch', 'status']),
            models.Index(fields=['to_branch', 'status']),
        ]

    def __str__(self):
        return f"{self.request_number} - {self.item.sku} ({self.from_location} → {self.to_location})"

    def clean(self):
        """Defense in depth: from_branch/to_branch must actually match the
        branches of from_location/to_location. This model legitimately spans
        two branches by design, so this is NOT a same-branch check."""
        if self.from_location_id and self.from_branch_id:
            if self.from_location.branch_id != self.from_branch_id:
                raise ValidationError(
                    "from_branch must match from_location's branch."
                )
        if self.to_location_id and self.to_branch_id:
            if self.to_location.branch_id != self.to_branch_id:
                raise ValidationError(
                    "to_branch must match to_location's branch."
                )

    def save(self, *args, **kwargs):
        if self.unit_cost:
            self.estimated_cost = self.quantity * self.unit_cost
        if self.from_location_id and not self.from_branch_id:
            self.from_branch_id = self.from_location.branch_id
        if self.to_location_id and not self.to_branch_id:
            self.to_branch_id = self.to_location.branch_id
        # Only enforced on INSERT, not on later partial-field status updates —
        # mirrors TransactionEntry.save()'s rationale (transactions/models.py).
        # Runs after the auto-population above so a first-time create that
        # doesn't specify from_branch/to_branch still passes; an explicit
        # mismatch is still caught.
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)

    # ── Workflow actions ─────────────────────────────────────────────────

    def approve(self, user, notes=''):
        if self.status != 'pending':
            raise ValidationError("Only pending requests can be approved")
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save()
        return True

    def reject(self, user, notes=''):
        if self.status != 'pending':
            raise ValidationError("Only pending requests can be rejected")
        self.status = 'rejected'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes or 'Rejected'
        self.save()
        return True

    @transaction.atomic
    def dispatch(self, user, notes=''):
        """Approved → dispatched. Reduces stock at from_location and, for a
        cross-branch transfer, posts the Dr Due-from / Cr inventory entry."""
        if self.status != 'approved':
            raise ValidationError("Only approved requests can be dispatched")

        from .stock_service import InventoryService
        InventoryService.dispatch_transfer(self, user)

        self.status = 'dispatched'
        self.dispatched_by = user
        self.dispatched_at = timezone.now()
        self.dispatch_notes = notes
        self.save()
        return True

    @transaction.atomic
    def acknowledge(self, user, actual_quantity_received=None, notes=''):
        """Dispatched → acknowledged (full) or short_received (partial).
        Receives stock at to_location and posts the acknowledgment (+
        shrinkage, if short) GL entry."""
        if self.status != 'dispatched':
            raise ValidationError("Only dispatched requests can be acknowledged")

        if actual_quantity_received is None:
            actual_quantity_received = self.quantity
        if actual_quantity_received < 0 or actual_quantity_received > self.quantity:
            raise ValidationError(
                f"actual_quantity_received must be between 0 and {self.quantity}"
            )

        from .stock_service import InventoryService
        InventoryService.acknowledge_transfer(self, actual_quantity_received, user)

        self.actual_quantity_received = actual_quantity_received
        self.variance_quantity = self.quantity - actual_quantity_received
        self.status = 'short_received' if self.variance_quantity > 0 else 'acknowledged'
        self.acknowledged_by = user
        self.acknowledged_at = timezone.now()
        self.acknowledgment_notes = notes
        self.save()
        return True

    def dispute(self, user, reason):
        """Dispatched → disputed. Terminal for now — no stock/GL effect;
        resolution (correcting transfer, write-off, etc.) happens manually."""
        if self.status != 'dispatched':
            raise ValidationError("Only dispatched requests can be disputed")
        if not reason:
            raise ValidationError("A dispute reason is required")
        self.status = 'disputed'
        self.disputed_by = user
        self.disputed_at = timezone.now()
        self.dispute_reason = reason
        self.save()
        return True


class WriteOffRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Write-off approval request
    
    Workflow: pending → approved/rejected → executed
    
    When executed, creates a StockMovement with movement_type='write_off'
    """
    request_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique write-off request number (e.g., WO-20260124-0001)"
    )
    
    # Requester
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='writeoff_requests'
    )
    
    # Write-off Details
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='writeoff_requests'
    )
    
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='writeoff_requests'
    )
    
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity to write off"
    )
    
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Cost per unit"
    )
    
    estimated_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Auto-calculated: quantity × unit_cost"
    )
    
    reason = models.TextField(help_text="Reason for write-off (damaged, expired, etc.)")
    notes = models.TextField(blank=True)
    
    # Status workflow
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('executed', 'Executed'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    
    # Approval tracking
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_writeoff_requests'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    # Execution link
    stock_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='writeoff_request',
        help_text="Link to executed stock movement"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['requested_by']),
        ]
    
    def __str__(self):
        return f"{self.request_number} - {self.item.sku} ({self.quantity} {self.item.unit_of_measure})"

    def clean(self):
        """Defense in depth: location must belong to this request's own branch."""
        if self.location_id and self.branch_id and self.location.branch_id != self.branch_id:
            raise ValidationError("location must belong to this request's branch.")

    def save(self, *args, **kwargs):
        if self.unit_cost:
            self.estimated_cost = self.quantity * self.unit_cost
        # Only enforced on INSERT, not on later partial-field status updates —
        # mirrors TransactionEntry.save()'s rationale (transactions/models.py).
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)


# ================================================================
# PHYSICAL COUNT / INVENTORY VARIANCE
# ================================================================

class PhysicalCount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Physical inventory count session for variance tracking
    
    This model tracks physical inventory counts performed at specific
    locations to identify variances between system quantities and
    actual physical quantities.
    
    Typical workflow:
    1. Create PhysicalCount (status=draft)
    2. Add PhysicalCountLine records for each item counted
    3. Submit count (status=pending_review)
    4. Review and approve/adjust (status=approved)
    5. Post adjustments to reconcile system with physical count
    """
    count_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique count reference number"
    )
    count_date = models.DateField(
        help_text="Date when physical count was performed"
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='physical_counts',
        help_text="Location where count was performed"
    )
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in_progress', 'In Progress'),
        ('pending_review', 'Pending Review'),
        ('approved', 'Approved'),
        ('posted', 'Posted'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Personnel
    counted_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='physical_counts_performed',
        help_text="User who performed the count"
    )
    reviewed_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='physical_counts_reviewed',
        help_text="User who reviewed and approved the count"
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the count was reviewed"
    )
    
    # Summary fields (calculated)
    total_lines = models.IntegerField(
        default=0,
        help_text="Total number of items counted"
    )
    total_variance_value = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Total value of all variances"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        help_text="General notes about the count"
    )
    review_notes = models.TextField(
        blank=True,
        help_text="Notes from reviewer"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-count_date', '-created_at']
        indexes = [
            models.Index(fields=['count_date', 'location']),
            models.Index(fields=['status', 'count_date']),
            models.Index(fields=['counted_by']),
        ]
    
    def __str__(self):
        return f"{self.count_number} - {self.location} ({self.count_date})"
    
    def save(self, *args, **kwargs):
        """Auto-set tenant and generate count number"""
        if not self.count_number:
            # Generate count number: PC-YYYYMMDD-XXX
            from django.db.models import Max
            today = timezone.now().date()
            prefix = f"PC-{today.strftime('%Y%m%d')}"
            
            last_count = PhysicalCount.objects.filter(
                count_number__startswith=prefix
            ).aggregate(Max('count_number'))
            
            if last_count['count_number__max']:
                last_num = int(last_count['count_number__max'].split('-')[-1])
                new_num = last_num + 1
            else:
                new_num = 1
            
            self.count_number = f"{prefix}-{new_num:03d}"
        
        # Auto-set tenant if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.location and hasattr(self.location, 'tenant'):
                self.tenant = self.location.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        super().save(*args, **kwargs)
    
    def calculate_summary(self):
        """Recalculate summary fields from count lines"""
        lines = self.count_lines.all()
        self.total_lines = lines.count()
        self.total_variance_value = sum(
            line.variance_value for line in lines
        )
        self.save(update_fields=['total_lines', 'total_variance_value'])


class PhysicalCountLine(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual item count line in a physical count
    
    Stores both system quantity and actual counted quantity,
    automatically calculating variance and variance value.
    """
    physical_count = models.ForeignKey(
        PhysicalCount,
        on_delete=models.CASCADE,
        related_name='count_lines'
    )
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='physical_count_lines'
    )
    
    # Quantities
    system_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity per system at count date"
    )
    counted_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Actual physical count"
    )
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Counted - System (positive = surplus, negative = shortage)"
    )
    variance_percent = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Variance as percentage of system quantity"
    )
    
    # Valuation
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Cost per unit at count date"
    )
    variance_value = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Variance quantity * unit cost"
    )
    
    # Variance classification
    VARIANCE_REASON_CHOICES = [
        ('shrinkage', 'Shrinkage/Loss'),
        ('damage', 'Damage'),
        ('obsolete', 'Obsolete'),
        ('theft', 'Theft'),
        ('counting_error', 'Counting Error'),
        ('system_error', 'System Error'),
        ('surplus', 'Surplus/Found'),
        ('other', 'Other'),
    ]
    variance_reason = models.CharField(
        max_length=20,
        choices=VARIANCE_REASON_CHOICES,
        blank=True,
        help_text="Reason for variance"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        help_text="Notes about this count line"
    )
    
    # Adjustment tracking
    adjustment_posted = models.BooleanField(
        default=False,
        help_text="Whether variance adjustment has been posted"
    )
    stock_movement = models.ForeignKey(
        StockMovement,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='physical_count_line',
        help_text="Link to stock adjustment if posted"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('physical_count', 'item')]
        indexes = [
            models.Index(fields=['physical_count', 'item']),
            models.Index(fields=['variance_reason']),
        ]
    
    def __str__(self):
        return f"{self.physical_count.count_number} - {self.item.sku}"
    
    def save(self, *args, **kwargs):
        """Auto-calculate variance and variance value"""
        # Calculate variance
        self.variance = self.counted_quantity - self.system_quantity
        
        # Calculate variance percentage
        if self.system_quantity != 0:
            self.variance_percent = (self.variance / abs(self.system_quantity)) * 100
        else:
            self.variance_percent = 100 if self.counted_quantity != 0 else 0
        
        # Calculate variance value
        self.variance_value = self.variance * self.unit_cost
        
        # Auto-set tenant if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.physical_count and hasattr(self.physical_count, 'tenant'):
                self.tenant = self.physical_count.tenant
            elif self.item and hasattr(self.item, 'tenant'):
                self.tenant = self.item.tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        super().save(*args, **kwargs)


# ================================================================
# MATERIAL REQUESTS
# ================================================================

# Import material request models
from .models_material_request import MaterialRequest, MaterialRequestItem

