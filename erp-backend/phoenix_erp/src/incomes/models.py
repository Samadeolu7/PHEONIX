from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from decimal import Decimal
import logging

from common.base import BranchScopedModel, TimeStampedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from clients.models import Client
from accounts.models import Account

logger = logging.getLogger(__name__)


def get_current_date():
    """Helper function to get current date for model defaults"""
    return timezone.now().date()

# Import discount models
from .models_discount import (
    DiscountProgram, DiscountApplication, AppliedDiscount
)

# Import calendar models
from .models_calendar import AcademicYear, AcademicTerm


class IncomeCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Category/Classification for income streams - links to GL account and defines behavior
    Examples: 'Tuition Fees', 'Consultation Fees', 'Product Sales', 'Service Income'
    """
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, db_index=True)
    description = models.TextField(blank=True)
    
    # GL Account linkage - all incomes in this category post to this account
    income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_categories',
        help_text="GL account for this income category (must be INCOME type)"
    )
    
    # Category behavior configuration
    # Examples:
    # - Requires invoice: {"requires_invoice": true, "auto_create_invoice": true}
    # - Tax treatment: {"taxable": true, "default_tax_rate": "VAT_STANDARD"}
    # - Recognition rules: {"recognition_method": "upfront", "deferral_period": null}
    behavior_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Category-specific behavior and business rules"
    )
    
    # Organization
    parent_category = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subcategories'
    )
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Income Category'
        verbose_name_plural = 'Income Categories'
        ordering = ['name']
        unique_together = [('owner', 'branch', 'code')]
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]
    
    def save(self, *args, **kwargs):
        # Auto-set tenant if not set
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
    
    def clean(self):
        """Validate account types before saving"""
        super().clean()
        
        # Validate income_account is actually an income account
        if self.income_account_id:
            if self.income_account.account_type not in ['INCOME', 'income']:
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'income_account': f'Income categories must use an INCOME account. '
                                    f'Selected account "{self.income_account.name}" is '
                                    f'type "{self.income_account.account_type}".'
                })
            
            # Validate income_account is a child account (not a parent)
            # Parent accounts should never have transactions posted directly to them
            if self.income_account.account_level == 'PARENT':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'income_account': f'Cannot use parent account "{self.income_account.name}" '
                                    f'(code: {self.income_account.code}). '
                                    f'Income categories must use CHILD accounts. '
                                    f'Parent accounts are for grouping only and cannot have transactions.'
                })
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class ServiceItem(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Service catalog — the canonical list of services that can be sold/charged.
    This is to services what inventory.InventoryItem is to physical goods.

    Examples:
    - Education : 'Tuition Fee', 'Registration Fee', 'Exam Fee', 'Library Fee'
    - Healthcare : 'Consultation', 'X-Ray', 'Lab Test'
    - Gym/Spa   : 'Monthly Membership', 'Personal Training Session'
    - Hospitality: 'Meal Plan', 'Room Service'

    When a client pays for a ServiceItem via an invoice, a FeeEntitlement is
    automatically created (if creates_entitlement=True) to track their right
    to access that service — gating attendance, exam sittings, etc.
    """
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, db_index=True)
    description = models.TextField(blank=True)

    # GL account / revenue classification for this service
    category = models.ForeignKey(
        IncomeCategory,
        on_delete=models.PROTECT,
        related_name='service_items',
        help_text="Income category that determines the GL account for revenue recognition"
    )

    # Default selling price — can be overridden per FeeStructureComponent
    default_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Default selling price; can be overridden at the fee structure level"
    )
    
    # Service type differentiation for material requests and profit/loss tracking
    SERVICE_TYPES = [
        ('standard', 'Standard Service'),  # Regular services (tuition, consultation, etc.)
        ('inventory_access', 'Inventory Access Service'),  # Allows material requests (textbooks, supplies, etc.)
        ('hybrid', 'Hybrid Service'),  # Combination of both
    ]
    service_type = models.CharField(
        max_length=20,
        choices=SERVICE_TYPES,
        default='standard',
        db_index=True,
        help_text=(
            "Standard: Regular service without inventory access. "
            "Inventory Access: Allows client to request inventory items via material requests. "
            "Hybrid: Combination of both."
        )
    )
    
    # For inventory access services - controls material request behavior
    allows_material_requests = models.BooleanField(
        default=False,
        help_text="When True, paying for this service allows the client to make material requests"
    )
    material_request_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum value of inventory items that can be requested (null = unlimited)"
    )
    material_request_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Configuration for material requests:
        {
            "allowed_categories": ["CAT-001", "CAT-002"],  # Inventory categories allowed
            "requires_approval": true,
            "max_requests_per_term": 5,
            "cost_tracking_method": "actual_cost" | "standard_cost"
        }
        """
    )

    # Entitlement tracking configuration
    creates_entitlement = models.BooleanField(
        default=True,
        help_text=(
            "When True, paying for this service via an invoice automatically "
            "creates a FeeEntitlement giving the client trackable access to the service."
        )
    )
    entitlement_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Default entitlement rules for this service:
        {
            \"payment_term_type\": \"minimum_deposit\",
            \"minimum_required_percent\": 50,
            \"full_access_at_percent\": 100,
            \"grace_period_days\": 30,
            \"allowed_services\": [],
            \"restricted_services\": []
        }
        """
    )

    is_active = models.BooleanField(default=True)

    objects = OwnerBranchManager()

    class Meta:
        verbose_name = 'Service Item'
        verbose_name_plural = 'Service Items'
        ordering = ['name']
        unique_together = [('owner', 'branch', 'code')]
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Income(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Universal income/income tracking - works across all industries
    Simplified model for straightforward income transactions
    For complex scenarios with entitlements, use FeeEntitlement
    """
    # Category determines the GL account and behavior
    category = models.ForeignKey(
        IncomeCategory,
        on_delete=models.PROTECT,
        related_name='incomes',
        help_text="Income category (determines GL account)"
    )
    
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='incomes',
        null=True,
        blank=True,
        help_text="Client/Customer this income is from"
    )
    
    reference_number = models.CharField(max_length=50, unique=True)
    income_date = models.DateField()
    description = models.TextField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Link to invoice if applicable
    invoice = models.ForeignKey(
        'Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incomes'
    )
    
    # Optional link to inventory allocation (for vouchers/prepaid services)
    inventory_allocation = models.ForeignKey(
        'inventory.InventoryAllocation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='income_records',
        help_text="Link to inventory allocation if this income includes physical items/vouchers"
    )
    
    # Payment status
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        verbose_name = 'Income'
        verbose_name_plural = 'Incomes'
        ordering = ['-income_date', '-created_at']
        indexes = [
            models.Index(fields=['reference_number']),
            models.Index(fields=['income_date']),
            models.Index(fields=['client', 'income_date']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.reference_number} - {self.description}: {self.amount}"
    
    @property
    def balance(self):
        """Amount still owed"""
        return self.amount - self.amount_paid
    
    @property
    def is_fully_paid(self):
        return self.amount_paid >= self.amount


class FeeStructure(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    For industries with complex recurring fees (schools, hospitals, gyms, etc.)
    """
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, db_index=True)
    description = models.TextField(blank=True)
    
    # Category determines the GL account
    category = models.ForeignKey(
        IncomeCategory,
        on_delete=models.PROTECT,
        related_name='fee_structures',
        help_text="Income category for this fee structure"
    )
    
    # Pricing
    base_amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Recurrence
    is_recurring = models.BooleanField(default=True)
    frequency = models.CharField(
        max_length=20,
        choices=[
            ('daily', 'Daily'),
            ('weekly', 'Weekly'),
            ('monthly', 'Monthly'),
            ('quarterly', 'Quarterly'),
            ('termly', 'Termly/Semester'),
            ('annually', 'Annually'),
        ],
        blank=True,
        null=True
    )
    
    # Industry-specific configuration
    # Examples:
    # - Schools: {"grade_level": "10", "academic_year": "2024-2025", "term": "1"}
    # - Hospitals: {"department": "cardiology", "service_type": "consultation"}
    # - Gyms: {"membership_tier": "premium", "access_level": "full"}
    industry_config = models.JSONField(
        default=dict,
        help_text="Industry-specific metadata and rules"
    )
    
    # NOTE: Service and inventory components are stored in FeeStructureComponent
    # (a normalized join table) instead of a JSONField.
    # Use fee_structure.components.all() to retrieve them.

    # Status
    is_active = models.BooleanField(default=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    
    # Approval Workflow (for compliance with Principal/Board sign-off requirement)
    APPROVAL_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_approval', 'Pending Approval'),
        ('approved', 'Approved by Principal/Board'),
        ('rejected', 'Rejected'),
    ]
    approval_status = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default='draft',
        help_text="Approval status - fee structures must be approved before activation"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_fee_structures',
        help_text="Principal/Board member who approved this fee structure"
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this fee structure was approved"
    )
    approval_notes = models.TextField(
        blank=True,
        help_text="Notes from approver or reason for rejection"
    )
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """Auto-assign tenant if not provided and enforce approval requirement"""
        # Prevent activation without approval (compliance control)
        if self.is_active and self.approval_status != 'approved':
            from django.core.exceptions import ValidationError
            raise ValidationError(
                "Fee structure must be approved by Principal/Board before activation. "
                f"Current status: {self.get_approval_status_display()}"
            )
        
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
        verbose_name = 'Fee Structure'
        verbose_name_plural = 'Fee Structures'
        ordering = ['name']
        unique_together = [('owner', 'branch', 'code')]
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active', 'effective_from']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def computed_total(self):
        """Sum of (effective_unit_price × quantity) across all active components."""
        return sum(c.line_total for c in self.components.all())


class FeeStructureComponent(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    A single line of a FeeStructure template.

    A FeeStructure is a reusable invoice template.  Each component is either:
      - SERVICE   → links to a ServiceItem  (creates a FeeEntitlement on payment)
      - INVENTORY → links to inventory.InventoryItem (reduces stock on delivery)

    Example — "Term 1 School Fees" fee structure components:
        1. Tuition Fee       (service,   qty=1, ₦50,000, mandatory)
        2. Registration Fee  (service,   qty=1, ₦5,000,  mandatory)
        3. English Textbook  (inventory, qty=1, ₦3,000,  mandatory)
        4. School Uniform    (inventory, qty=2, ₦2,500,  optional)

    When this template is instantiated into an Invoice:
      - Each SERVICE component → one InvoiceItem (service type) which may create
        a FeeEntitlement depending on ServiceItem.creates_entitlement.
      - Each INVENTORY component → one InvoiceItem (inventory type) which reserves
        / reduces stock.
    """
    fee_structure = models.ForeignKey(
        FeeStructure,
        on_delete=models.CASCADE,
        related_name='components',
        help_text="Parent fee structure template"
    )

    COMPONENT_TYPE_CHOICES = [
        ('service', 'Service'),
        ('inventory', 'Inventory Item'),
    ]
    component_type = models.CharField(
        max_length=20,
        choices=COMPONENT_TYPE_CHOICES,
        help_text="Whether this component is a service or a physical inventory item"
    )

    # --- Service component fields ---
    service_item = models.ForeignKey(
        ServiceItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='fee_structure_components',
        help_text="Required when component_type='service'"
    )

    # --- Inventory component fields ---
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='income_fee_structure_components',
        help_text="Required when component_type='inventory'"
    )

    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('1.00'),
        help_text="Quantity included in this component"
    )
    unit_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text=(
            "Price override for this fee structure. "
            "If 0, falls back to service_item.default_price or inventory_item.unit_price."
        )
    )
    is_mandatory = models.BooleanField(
        default=True,
        help_text="Mandatory components are always included; optional ones can be waived per client"
    )
    order = models.PositiveIntegerField(
        default=0,
        help_text="Display / processing order within the fee structure"
    )

    objects = OwnerBranchManager()

    class Meta:
        verbose_name = 'Fee Structure Component'
        verbose_name_plural = 'Fee Structure Components'
        ordering = ['order', 'id']
        indexes = [
            models.Index(fields=['fee_structure', 'component_type']),
            models.Index(fields=['service_item']),
            models.Index(fields=['inventory_item']),
        ]

    def clean(self):
        super().clean()
        if self.component_type == 'service' and not self.service_item_id:
            raise ValidationError(
                {'service_item': 'Service components must reference a ServiceItem.'}
            )
        if self.component_type == 'inventory' and not self.inventory_item_id:
            raise ValidationError(
                {'inventory_item': 'Inventory components must reference an InventoryItem.'}
            )

    @property
    def effective_unit_price(self):
        """Resolved price: component override → item default → 0."""
        if self.unit_price and self.unit_price > 0:
            return self.unit_price
        if self.component_type == 'service' and self.service_item_id:
            return self.service_item.default_price
        if self.component_type == 'inventory' and self.inventory_item_id:
            return getattr(self.inventory_item, 'unit_price', Decimal('0.00'))
        return Decimal('0.00')

    @property
    def line_total(self):
        """quantity × effective_unit_price"""
        return self.quantity * self.effective_unit_price

    def __str__(self):
        label = (
            self.service_item.name if self.service_item_id
            else (self.inventory_item.name if self.inventory_item_id else '?')
        )
        return f"{self.fee_structure.name} → {label} (×{self.quantity})"


class Invoice(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Unified Invoice for tracking amounts owed - supports both service fees and inventory items
    
    Can contain:
    - Multiple service/fee items (linked to FeeStructure)
    - Multiple inventory items (with stock tracking)
    - Or a combination of both on the same invoice
    
    The invoice_number can be used to claim entitlements for service items.
    """
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='invoices'
    )
    
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    due_date = models.DateField()
    
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True, help_text="Internal notes")
    
    # Amounts - calculated from line items
    subtotal = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Sum of all line items before discounts and tax"
    )
    discount_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Total invoice-level discount"
    )
    tax_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Total tax amount"
    )
    total_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Final amount after discounts and tax"
    )
    amount_paid = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Amount paid so far"
    )
    
    # Legacy amount field - kept for backward compatibility, will be deprecated
    amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="DEPRECATED: Use total_amount for new invoices"
    )
    
    # Optional link to primary fee structure (for bulk invoice generation from one fee structure)
    fee_structure = models.ForeignKey(
        FeeStructure,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        help_text="Primary fee structure (for bulk generation)"
    )
    
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
        default='draft'
    )
    
    # Accounting
    is_posted = models.BooleanField(
        default=False,
        help_text="Whether invoice has been posted to accounting"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_invoices',
        help_text="User who posted this invoice"
    )
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        help_text="Journal entry created when invoice was posted (Dr. AR / Cr. Income)"
    )
    
    # Metadata for additional context
    metadata = models.JSONField(
        default=dict,
        help_text="Additional invoice-specific data"
    )
    
    # Optional link to inventory allocation (for items that come with the service)
    inventory_allocation = models.ForeignKey(
        'inventory.InventoryAllocation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        help_text="Link to inventory allocation if invoice includes physical items"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        verbose_name = 'Invoice'
        verbose_name_plural = 'Invoices'
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['due_date', 'status']),
            models.Index(fields=['is_posted']),
        ]
    
    @property
    def balance(self):
        """Amount still owed"""
        total = self.total_amount if self.total_amount else (self.amount or Decimal('0'))
        return total - self.amount_paid
    
    @property
    def is_overdue(self):
        """Check if invoice is overdue"""
        return self.status not in ['paid', 'cancelled'] and self.due_date < timezone.now().date()
    
    def calculate_totals(self):
        """
        Calculate invoice totals from line items
        
        Returns:
            dict: Calculated amounts
        """
        items = list(self.items.all())

        _zero = Decimal('0')
        subtotal = sum(
            (item.line_total if item.line_total is not None else _zero)
            for item in items
        ) or _zero
        item_discounts = sum(
            (item.discount_amount if item.discount_amount is not None else _zero)
            for item in items
        ) or _zero
        total_tax = sum(
            (item.tax_amount if item.tax_amount is not None else _zero)
            for item in items
        ) or _zero
        invoice_discount = self.discount_amount if self.discount_amount is not None else _zero
        total_discount = item_discounts + invoice_discount

        return {
            'subtotal': subtotal,
            'discount_amount': total_discount,
            'tax_amount': total_tax,
            'total_amount': subtotal - invoice_discount + total_tax
        }
    
    def update_totals(self):
        """Update invoice totals from line items"""
        totals = self.calculate_totals()
        self.subtotal = totals['subtotal']
        self.tax_amount = totals['tax_amount']
        self.total_amount = totals['total_amount']
        # Update legacy amount field
        self.amount = self.total_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total_amount', 'amount'])
    
    def __str__(self):
        return f"{self.invoice_number} - {self.client.full_name}: {self.total_amount or self.amount}"
    
    def clean(self):
        """Model-level validation for Invoice"""
        super().clean()
        
        # Ensure due date not before invoice date
        if self.due_date and self.invoice_date and self.due_date < self.invoice_date:
            raise ValidationError({'due_date': 'Due date cannot be before invoice date.'})
    
    def post(self, user):
        """
        Post invoice to accounting - creates journal entry for revenue recognition.
        
        Journal Entry:
        Dr. Accounts Receivable (Asset)
        Cr. Income/Revenue (Income)
        
        This implements accrual basis accounting where revenue is recognized
        when earned (invoice created), not when cash is received.
        
        Args:
            user: User posting the invoice
            
        Returns:
            Transaction: Created journal entry
            
        Raises:
            ValidationError: If invoice is already posted or has validation errors
        """
        from django.db import transaction as db_transaction
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        from accounts.utils.account_creation import get_or_create_child_account
        from decimal import Decimal
        from collections import defaultdict

        # Validate invoice can be posted
        if self.is_posted:
            raise ValidationError("Invoice is already posted")

        if self.status == 'cancelled':
            raise ValidationError("Cannot post a cancelled invoice")

        total = self.total_amount if self.total_amount else (self.amount or Decimal('0'))
        if total <= 0:
            raise ValidationError("Cannot post invoice with zero or negative amount")

        with db_transaction.atomic():
            # ── Accounts Receivable ───────────────────────────────────────────────
            ar_account = get_or_create_child_account(
                parent_code='1110',
                child_suffix='001',
                name='Trade Debtors (Accounts Receivable)',
                account_type='ASSET',
                owner=self.owner,
                branch=self.branch,
                parent_name='Trade and Other Receivables'
            )

            # ── Build per-category revenue map ────────────────────────────────────
            # key: Account instance  →  value: total amount to credit
            revenue_map = defaultdict(Decimal)

            line_items = self.items.select_related(
                'service_item__category__income_account',
                'inventory_item__category__sales_account',
            ).all()

            for line in line_items:
                line_amount = Decimal(str(line.line_total or line.unit_price or '0'))
                if line_amount <= 0:
                    continue

                if line.item_type == 'service' and line.service_item_id:
                    # Service item → use the income category's GL account
                    account = getattr(
                        getattr(line.service_item, 'category', None),
                        'income_account', None
                    )
                elif line.item_type == 'inventory' and line.inventory_item_id:
                    # Inventory item → use the inventory category's sales account
                    account = getattr(
                        getattr(line.inventory_item, 'category', None),
                        'sales_account', None
                    )
                else:
                    account = None  # custom / unlinked → fallback below

                if account is None:
                    # Fallback: try fee_structure category first, then generic
                    if self.fee_structure and self.fee_structure.category_id:
                        account = self.fee_structure.category.income_account
                    else:
                        account = get_or_create_child_account(
                            parent_code='4100',
                            child_suffix='001',
                            name='Sales of Goods',
                            account_type='INCOME',
                            owner=self.owner,
                            branch=self.branch,
                            parent_name='Revenue from Contracts with Customers'
                        )

                revenue_map[account] += line_amount

            # If no line items exist yet, fall back to the full invoice total
            if not revenue_map:
                fallback = (
                    self.fee_structure.category.income_account
                    if self.fee_structure and self.fee_structure.category_id
                    else get_or_create_child_account(
                        parent_code='4100',
                        child_suffix='001',
                        name='Sales of Goods',
                        account_type='INCOME',
                        owner=self.owner,
                        branch=self.branch,
                        parent_name='Revenue from Contracts with Customers'
                    )
                )
                revenue_map[fallback] = total

            # ── Journal Entry ─────────────────────────────────────────────────────
            series, _ = TransactionSeries.objects.get_or_create(
                code='INV',
                defaults={'description': 'Invoice Transactions'}
            )

            # Prevent duplicates (e.g. retried requests)
            existing_entry = JournalEntry.objects.filter(
                owner=self.owner,
                workflow_reference=self.invoice_number
            ).first()

            if existing_entry:
                journal_entry = existing_entry
                logger.warning(
                    f"Journal entry already exists for invoice {self.invoice_number}, "
                    f"using existing entry {journal_entry.reference_number}"
                )
            else:
                _client_label = self.client.full_name if self.client_id else ''
                _inv_description = (
                    f"Invoice: {_client_label} - {self.description or self.invoice_number}"
                    if _client_label else
                    f"Invoice: {self.description or self.invoice_number}"
                )
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=self.invoice_date,
                    description=_inv_description,
                    workflow_reference=self.invoice_number,
                    owner=self.owner,
                    branch=self.branch,
                    created_by=user,
                    tenant=self.tenant,
                )

                revenue_total = sum(revenue_map.values())

                # Dr. Accounts Receivable (total invoice amount)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=ar_account,
                    side=JournalEntryLine.DEBIT,
                    amount=revenue_total
                )

                # Cr. one line per income category
                for income_account, amount in revenue_map.items():
                    JournalEntryLine.objects.create(
                        transaction=journal_entry,
                        account=income_account,
                        side=JournalEntryLine.CREDIT,
                        amount=amount
                    )

                journal_entry.post()

                logger.info(
                    f"Posted invoice {self.invoice_number} – "
                    f"{len(revenue_map)} income category line(s), "
                    f"total={revenue_total} – JE: {journal_entry.reference_number}"
                )

            # ── Mark invoice as posted ────────────────────────────────────────────
            self.is_posted = True
            self.posted_at = timezone.now()
            self.posted_by = user
            self.journal_entry = journal_entry

            if self.status == 'draft':
                self.status = 'sent'

            self.save(update_fields=['is_posted', 'posted_at', 'posted_by', 'journal_entry', 'status'])

            return journal_entry


class InvoiceItem(models.Model):
    """
    Line items in invoice - supports service items, inventory items, and custom entries.

    Can be:
    - A service item (linked to ServiceItem — may create a FeeEntitlement on payment)
    - An inventory item (linked to inventory.InventoryItem — reduces stock on delivery)
    - A custom item (free-text, no catalog link, no entitlement)

    Service items and inventory items are drawn from FeeStructureComponent when an
    invoice is generated from a FeeStructure template, or selected manually.

    Note: Does not inherit TimeStampedModel to avoid reverse accessor clashes with inventory.InvoiceItem
    """
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items',
        help_text="Parent invoice"
    )
    
    # Item type - determines which FK is used
    ITEM_TYPE_CHOICES = [
        ('service', 'Service/Fee'),
        ('inventory', 'Inventory Item'),
        ('custom', 'Custom Item'),
    ]
    item_type = models.CharField(
        max_length=20,
        choices=ITEM_TYPE_CHOICES,
        default='custom',
        help_text="Type of line item"
    )
    
    # Foreign keys - one will be populated based on item_type
    service_item = models.ForeignKey(
        ServiceItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_items',
        help_text="Service item from the service catalog (required for item_type='service')"
    )

    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='income_invoice_items',
        help_text="Inventory item (for physical goods)"
    )
    
    # Item details
    description = models.TextField(help_text="Item description")
    quantity = models.DecimalField(
        max_digits=18, 
        decimal_places=2,
        default=1,
        help_text="Quantity of items"
    )
    unit_price = models.DecimalField(
        max_digits=18, 
        decimal_places=2,
        help_text="Price per unit"
    )
    discount_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Discount for this line item"
    )
    tax_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Tax for this line item"
    )
    line_total = models.DecimalField(
        max_digits=18, 
        decimal_places=2,
        help_text="Total for this line (calculated)"
    )
    
    # For inventory items - stock tracking
    reserved_from_location = models.ForeignKey(
        'inventory.Location',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='income_invoice_reserved_items',
        help_text="Location where stock is reserved from"
    )
    reserved_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Quantity of stock reserved for this invoice item"
    )
    is_stock_reduced = models.BooleanField(
        default=False,
        help_text="Whether stock has been reduced for this item"
    )
    
    # Payment tracking per line item
    amount_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Amount paid specifically against this line item"
    )

    # For service items - entitlement tracking
    creates_entitlement = models.BooleanField(
        default=False,
        help_text="Whether this item creates a FeeEntitlement"
    )
    entitlement = models.ForeignKey(
        'FeeEntitlement',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_invoice_items',
        help_text="Entitlement created by this invoice item (if applicable)"
    )
    
    # Metadata for item-specific data
    metadata = models.JSONField(
        default=dict,
        help_text="Item-specific metadata"
    )
    
    # Timestamp fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Soft delete
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['invoice', 'item_type']),
            models.Index(fields=['service_item']),
            models.Index(fields=['inventory_item']),
            models.Index(fields=['is_deleted']),
        ]
    
    def calculate_line_total(self):
        """Calculate line total: (quantity * unit_price) - discount + tax"""
        quantity = self.quantity if self.quantity is not None else Decimal('0')
        unit_price = self.unit_price if self.unit_price is not None else Decimal('0')
        discount = self.discount_amount if self.discount_amount is not None else Decimal('0')
        tax = self.tax_amount if self.tax_amount is not None else Decimal('0')
        subtotal = quantity * unit_price
        return subtotal - discount + tax

    @property
    def line_balance(self):
        """Amount still owed on this line item"""
        return max(Decimal('0'), (self.line_total or Decimal('0')) - self.amount_paid)

    @property
    def payment_percentage(self):
        """Percentage of this line item that has been paid"""
        total = self.line_total or Decimal('0')
        if total == 0:
            return Decimal('100')
        return (self.amount_paid / total * 100).quantize(Decimal('0.01'))
    
    def save(self, *args, **kwargs):
        """Auto-calculate line total on save"""
        self.line_total = self.calculate_line_total()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.description[:50]}"
    
    def clean(self):
        """Validate line item"""
        super().clean()
        
        # Validate item_type matches FK
        if self.item_type == 'service' and not self.service_item_id:
            raise ValidationError(
                {'service_item': 'Service items must reference a ServiceItem from the service catalog. '
                                 'Use item_type="custom" for free-text lines with no catalog entry.'}
            )

        if self.item_type == 'inventory' and not self.inventory_item:
            raise ValidationError({'inventory_item': 'Inventory items must have an inventory item selected'})
        
        # Validate positive amounts
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be greater than zero'})
        
        if self.unit_price < 0:
            raise ValidationError({'unit_price': 'Unit price cannot be negative'})
    

class FeeEntitlement(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Domain-agnostic entitlement to services/products based on payment status
    Works for any industry with complex payment-to-service relationships
    
    Examples:
    - Education: Tuition fees → access to classes, exams, resources
    - Healthcare: Treatment packages → access to specific services
    - Gym/Spa: Membership → access to facilities and services
    - Hospitality: Meal plans → prepaid meals
    - Any service with: prepayment, partial payment terms, or usage-based allocation
    """
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.PROTECT,
        related_name='fee_entitlements'
    )
    
    invoice = models.ForeignKey(
        'Invoice',
        on_delete=models.PROTECT,
        related_name='entitlements',
        help_text="Invoice that created this entitlement"
    )
    
    # The specific service this entitlement grants access to.
    # A single invoice may create multiple entitlements — one per ServiceItem.
    # nullable=True for safe migration; enforce NOT NULL via application logic
    # until a data migration backfills legacy rows.
    service_item = models.ForeignKey(
        'ServiceItem',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='entitlements',
        help_text="The specific service this entitlement grants access to"
    )

    # The fee structure template this entitlement originated from.
    # Nullable — entitlements created outside a template still work.
    fee_structure = models.ForeignKey(
        'FeeStructure',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='entitlements',
        help_text="Fee structure template this entitlement was generated from (for reporting)"
    )

    # Academic context (for schools)
    academic_period = models.JSONField(
        default=dict,
        help_text='{"year": "2024-2025", "term": "1", "semester": "Fall"}'
    )
    
    # Payment terms configuration
    PAYMENT_TERM_TYPES = [
        ('full_upfront', 'Must Pay in Full'),
        ('minimum_deposit', 'Minimum Deposit Required'),
        ('installments', 'Installment Plan'),
        ('prepaid_allocation', 'Prepaid Allocation (like meal plans)'),
    ]
    payment_term_type = models.CharField(
        max_length=30,
        choices=PAYMENT_TERM_TYPES,
        default='minimum_deposit'
    )
    
    # Payment tracking
    total_amount = models.DecimalField(max_digits=18, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    minimum_required = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Minimum amount required to activate entitlement"
    )
    
    # Service access control
    SERVICE_ACCESS_LEVELS = [
        ('none', 'No Access'),
        ('partial', 'Partial Access'),
        ('full', 'Full Access'),
    ]
    current_access_level = models.CharField(
        max_length=20,
        choices=SERVICE_ACCESS_LEVELS,
        default='none'
    )
    
    access_rules = models.JSONField(
        default=dict,
        help_text="""
        Rules determining service access based on payment:
        {
            "requires_minimum": true,
            "full_access_at_percent": 50,  // Full access after 50% paid
            "grace_period_days": 30,
            "restrict_on_overdue": true,
            "allowed_services": ["classes", "library"],
            "restricted_services": ["exams", "graduation"]
        }
        """
    )
    
    # Entitlement status
    STATUS_CHOICES = [
        ('pending', 'Pending Payment'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Dates
    valid_from = models.DateField(default=get_current_date)
    valid_until = models.DateField(null=True, blank=True)
    suspended_at = models.DateField(null=True, blank=True)
    completed_at = models.DateField(null=True, blank=True)
    
    # For prepaid allocations (meals, printing, etc.)
    allocated_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="For unit-based entitlements (e.g., 100 meals)"
    )
    consumed_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Link to inventory allocation (for physical items like uniforms, books, equipment)
    inventory_allocation = models.ForeignKey(
        'inventory.InventoryAllocation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='fee_entitlements',
        help_text="Link to inventory allocation for physical items included with this entitlement"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['invoice']),
            models.Index(fields=['service_item', 'status']),
            models.Index(fields=['fee_structure', 'status']),
        ]
    
    def __str__(self):
        service_label = (
            self.service_item.name if self.service_item_id
            else (self.fee_structure.name if self.fee_structure_id else 'Unknown service')
        )
        return f"{self.client.full_name} - {service_label} ({self.status})"
    
    @property
    def balance(self):
        """Amount still owed"""
        return self.total_amount - self.amount_paid
    
    @property
    def payment_percentage(self):
        """Percentage of total amount paid"""
        if self.total_amount == 0:
            return Decimal('100.00')
        return (self.amount_paid / self.total_amount) * 100
    
    @property
    def meets_minimum_requirement(self):
        """Check if minimum payment requirement is met"""
        return self.amount_paid >= self.minimum_required
    
    @property
    def remaining_units(self):
        """For unit-based entitlements"""
        return self.allocated_units - self.consumed_units
    
    def can_access_service(self, service_code: str = None) -> tuple[bool, str]:
        """
        Check if student can access a service based on payment status
        
        Returns: (can_access, reason_if_not)
        """
        # Check if entitlement is active
        if self.status not in ['active', 'pending']:
            return False, f"Entitlement is {self.status}"
        
        # Check validity period
        today = timezone.now().date()
        if self.valid_until and today > self.valid_until:
            return False, "Entitlement has expired"
        
        rules = self.access_rules
        
        # Check minimum payment requirement
        if rules.get('requires_minimum', True):
            if not self.meets_minimum_requirement:
                return False, f"Minimum payment of {self.minimum_required} required"
        
        # Check payment percentage for full access
        full_access_threshold = rules.get('full_access_at_percent', 100)
        if self.payment_percentage < full_access_threshold:
            # Check if service is in allowed list for partial access
            allowed_services = rules.get('allowed_services', [])
            if service_code and allowed_services:
                if service_code not in allowed_services:
                    return False, f"Service requires {full_access_threshold}% payment"
        
        # Check if service is explicitly restricted
        restricted_services = rules.get('restricted_services', [])
        if service_code and service_code in restricted_services:
            if self.payment_percentage < 100:
                return False, "This service requires full payment"
        
        # Check for overdue restrictions
        if rules.get('restrict_on_overdue', False):
            if hasattr(self, 'invoice') and self.invoice.is_overdue:
                grace_days = rules.get('grace_period_days', 0)
                days_overdue = (today - self.invoice.due_date).days
                if days_overdue > grace_days:
                    return False, f"Payment overdue by {days_overdue} days"
        
        return True, "Access granted"
    
    @transaction.atomic
    def record_payment(self, amount: Decimal, payment_date=None):
        """
        Record a payment and update access level
        
        Called by payment workflow after successful payment posting
        """
        if amount <= 0:
            raise ValidationError("Payment amount must be positive")
        
        if self.amount_paid + amount > self.total_amount:
            raise ValidationError("Payment exceeds total amount due")
        
        # Update paid amount
        self.amount_paid += amount
        
        # Update status and access level
        self._update_status_and_access()
        
        # Update the related invoice's paid amount and status
        if self.invoice:
            self.invoice.amount_paid += amount
            
            # Update invoice status based on payment
            if self.invoice.amount_paid >= self.invoice.amount:
                self.invoice.status = 'paid'
            elif self.invoice.amount_paid > 0:
                self.invoice.status = 'partial'
            else:
                # Check if overdue
                if self.invoice.is_overdue:
                    self.invoice.status = 'overdue'
                elif self.invoice.status == 'draft':
                    self.invoice.status = 'sent'
            
            self.invoice.save()
        
        # Update linked inventory allocation status if exists
        if self.inventory_allocation:
            self._update_allocation_status()
        
        # Log payment
        EntitlementPaymentLog.objects.create(
            entitlement=self,
            amount=amount,
            payment_date=payment_date or timezone.now().date(),
            balance_after=self.balance,
            owner=self.owner,
            branch=self.branch,
            created_by=self.created_by
        )
        
        self.save()
    
    def _update_status_and_access(self):
        """Update status and access level based on payment"""
        rules = self.access_rules
        
        # Check if minimum requirement met
        if not self.meets_minimum_requirement:
            self.status = 'pending'
            self.current_access_level = 'none'
            return
        
        # Check if fully paid
        if self.balance <= 0:
            self.status = 'completed'
            self.current_access_level = 'full'
            self.completed_at = timezone.now().date()
            return
        
        # Active with partial/full access based on payment percentage
        self.status = 'active'
        full_access_threshold = rules.get('full_access_at_percent', 100)
        
        if self.payment_percentage >= full_access_threshold:
            self.current_access_level = 'full'
        else:
            self.current_access_level = 'partial'
    
    def _update_allocation_status(self):
        """
        Update linked inventory allocation status based on payment
        
        Status progression:
        - pending_payment → partial_access (when minimum paid)
        - partial_access → active (when 100% paid or full access threshold met)
        """
        if not self.inventory_allocation:
            return
        
        allocation = self.inventory_allocation
        
        # If meets minimum requirement, allow partial access
        if self.meets_minimum_requirement and allocation.status == 'pending_payment':
            allocation.status = 'partial_access'
            allocation.save(update_fields=['status'])
        
        # If fully paid or full access threshold met, activate
        rules = self.access_rules
        full_access_threshold = rules.get('full_access_at_percent', 100)
        
        if self.payment_percentage >= full_access_threshold:
            allocation.status = 'active'
            allocation.save(update_fields=['status'])
    
    @transaction.atomic
    def consume_units(self, units: Decimal, service_code: str = None):
        """
        Consume units from prepaid allocation (e.g., redeem a meal)
        
        Used for prepaid services like meal plans, printing credits
        """
        if self.payment_term_type != 'prepaid_allocation':
            raise ValidationError("This entitlement is not a prepaid allocation")
        
        # Check access
        can_access, reason = self.can_access_service(service_code)
        if not can_access:
            raise ValidationError(f"Cannot consume units: {reason}")
        
        if units > self.remaining_units:
            raise ValidationError(
                f"Insufficient units. Available: {self.remaining_units}"
            )
        
        # Consume units
        self.consumed_units += units
        
        # Check if exhausted
        if self.remaining_units <= 0:
            self.status = 'completed'
        
        self.save()
        
        # Log consumption
        EntitlementUsageLog.objects.create(
            entitlement=self,
            units_consumed=units,
            remaining_units=self.remaining_units,
            service_code=service_code,
            owner=self.owner,
            branch=self.branch,
            created_by=self.created_by
        )
    
    @transaction.atomic
    def suspend(self, reason: str):
        """Suspend entitlement (e.g., due to non-payment)"""
        self.status = 'suspended'
        self.suspended_at = timezone.now().date()
        self.current_access_level = 'none'
        self.save()
        
        # Log suspension
        EntitlementStatusLog.objects.create(
            entitlement=self,
            old_status=self.status,
            new_status='suspended',
            reason=reason,
            owner=self.owner,
            branch=self.branch,
            created_by=self.created_by
        )
    
    @transaction.atomic
    def reactivate(self):
        """Reactivate suspended entitlement"""
        if self.status != 'suspended':
            raise ValidationError("Can only reactivate suspended entitlements")
        
        old_status = self.status
        self._update_status_and_access()
        self.save()
        
        # Log reactivation
        EntitlementStatusLog.objects.create(
            entitlement=self,
            old_status=old_status,
            new_status=self.status,
            reason="Reactivated",
            owner=self.owner,
            branch=self.branch,
            created_by=self.created_by
        )
    
    def trigger_inventory_redemption(self, items_to_redeem: list, user=None):
        """
        Trigger redemption of inventory items linked to this entitlement
        
        Args:
            items_to_redeem: List of dicts with 'item_id' and 'quantity'
            user: User performing the redemption
            
        Example:
            items_to_redeem = [
                {'item_id': 1, 'quantity': 2},  # 2 uniforms
                {'item_id': 5, 'quantity': 1},  # 1 textbook set
            ]
        """
        if not self.inventory_allocation:
            raise ValidationError("No inventory allocation linked to this entitlement")
        
        # Check if entitlement allows redemption
        can_access, reason = self.can_access_service('inventory_redemption')
        if not can_access:
            raise ValidationError(f"Cannot redeem items: {reason}")
        
        # Import here to avoid circular imports
        from inventory.models import AllocationRedemption, RedemptionItem
        from .services.accounting_integration import IncomeAccountingService
        
        # Create redemption record
        redemption = AllocationRedemption.objects.create(
            allocation=self.inventory_allocation,
            client=self.client,
            redemption_type='entitlement',
            notes=f"Redeemed via FeeEntitlement #{self.id}",
            owner=self.owner,
            branch=self.branch,
            created_by=user or self.created_by
        )
        
        # Track total COGS
        total_cogs = Decimal('0.00')
        
        # Add redemption items and calculate COGS
        for item_data in items_to_redeem:
            # Get the allocation item
            alloc_item = self.inventory_allocation.items.get(
                item_id=item_data['item_id']
            )
            
            # Get item details for COGS calculation
            inventory_item = alloc_item.item
            quantity = Decimal(str(item_data['quantity']))
            unit_cost = inventory_item.cost_price or Decimal('0.00')
            item_cogs = quantity * unit_cost
            total_cogs += item_cogs
            
            # Redeem the item
            alloc_item.redeem_quantity(
                quantity=item_data['quantity'],
                redemption=redemption
            )
        
        # Record COGS in accounting system
        if total_cogs > 0:
            IncomeAccountingService.record_inventory_redemption_cogs(
                entitlement=self,
                redemption=redemption,
                total_cogs=total_cogs,
                user=user or self.created_by
            )
        
        # Mark entitlement as used if fully redeemed
        if self.inventory_allocation.is_fully_redeemed:
            self.status = 'completed'
            self.save()
        
        return redemption


class EntitlementPaymentLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Track payment history for entitlements"""
    entitlement = models.ForeignKey(
        FeeEntitlement,
        on_delete=models.CASCADE,
        related_name='payment_logs'
    )
    
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    payment_date = models.DateField()
    balance_after = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Link to accounting entry
    transaction_entry = models.ForeignKey(
        'transactions.TransactionEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='entitlement_payments'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['entitlement', 'payment_date']),
        ]
    
    def __str__(self):
        return f"Payment: {self.amount} on {self.payment_date}"


class EntitlementUsageLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Track usage of prepaid allocations (meals, printing, etc.)"""
    entitlement = models.ForeignKey(
        FeeEntitlement,
        on_delete=models.CASCADE,
        related_name='usage_logs'
    )
    
    units_consumed = models.DecimalField(max_digits=18, decimal_places=2)
    remaining_units = models.DecimalField(max_digits=18, decimal_places=2)
    service_code = models.CharField(max_length=50, blank=True)
    usage_date = models.DateField(default=timezone.now)
    
    # Location/context
    location = models.CharField(max_length=100, blank=True)
    metadata = models.JSONField(default=dict)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-usage_date', '-created_at']
        indexes = [
            models.Index(fields=['entitlement', 'usage_date']),
            models.Index(fields=['service_code']),
        ]
    
    def __str__(self):
        return f"{self.units_consumed} units consumed on {self.usage_date}"


class EntitlementStatusLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Track status changes for entitlements"""
    entitlement = models.ForeignKey(
        FeeEntitlement,
        on_delete=models.CASCADE,
        related_name='status_logs'
    )
    
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    reason = models.TextField()
    changed_at = models.DateTimeField(auto_now_add=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['entitlement', 'changed_at']),
        ]
    
    def __str__(self):
        return f"{self.old_status} → {self.new_status}"


class PaymentPlan(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Installment payment plan for entitlements
    Alternative to using loans for payment terms
    """
    entitlement = models.OneToOneField(
        FeeEntitlement,
        on_delete=models.CASCADE,
        related_name='payment_plan'
    )
    
    plan_name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    
    # Plan structure
    total_amount = models.DecimalField(max_digits=18, decimal_places=2)
    down_payment = models.DecimalField(max_digits=18, decimal_places=2)
    number_of_installments = models.IntegerField()
    installment_amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    FREQUENCY_CHOICES = [
        ('weekly', 'Weekly'),
        ('biweekly', 'Bi-weekly'),
        ('monthly', 'Monthly'),
    ]
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES)
    
    # Dates
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Status
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('defaulted', 'Defaulted'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    # Penalty configuration
    late_payment_penalty = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    grace_period_days = models.IntegerField(default=7)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"Payment Plan: {self.plan_name}"
    
    @transaction.atomic
    def generate_schedule(self):
        """Generate installment schedule"""
        from dateutil.relativedelta import relativedelta
        
        # Clear existing schedule
        self.installments.all().delete()
        
        # Determine date increment
        if self.frequency == 'weekly':
            date_increment = relativedelta(weeks=1)
        elif self.frequency == 'biweekly':
            date_increment = relativedelta(weeks=2)
        else:  # monthly
            date_increment = relativedelta(months=1)
        
        # Generate installments
        current_date = self.start_date
        for i in range(1, self.number_of_installments + 1):
            current_date = current_date + date_increment
            
            PaymentPlanInstallment.objects.create(
                payment_plan=self,
                installment_number=i,
                due_date=current_date,
                amount_due=self.installment_amount,
                owner=self.owner,
                branch=self.branch,
                created_by=self.created_by
            )


class PaymentPlanInstallment(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Individual installment in a payment plan"""
    payment_plan = models.ForeignKey(
        PaymentPlan,
        on_delete=models.CASCADE,
        related_name='installments'
    )
    
    installment_number = models.IntegerField()
    due_date = models.DateField()
    
    amount_due = models.DecimalField(max_digits=18, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    penalty_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('overdue', 'Overdue'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    payment_date = models.DateField(null=True, blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['due_date']
        unique_together = [('payment_plan', 'installment_number')]
        indexes = [
            models.Index(fields=['payment_plan', 'status']),
            models.Index(fields=['due_date', 'status']),
        ]
    
    def __str__(self):
        return f"Installment {self.installment_number} - Due: {self.due_date}"
    
    @property
    def is_overdue(self):
        today = timezone.now().date()
        return self.status != 'paid' and today > self.due_date
    
    @property
    def balance(self):
        return self.amount_due + self.penalty_amount - self.amount_paid
    
    @transaction.atomic
    def record_payment(self, amount: Decimal):
        """Record payment for this installment"""
        if amount <= 0:
            raise ValidationError("Payment amount must be positive")
        
        remaining = min(amount, self.balance)
        self.amount_paid += remaining
        
        if self.amount_paid >= (self.amount_due + self.penalty_amount):
            self.status = 'paid'
            self.payment_date = timezone.now().date()
        else:
            self.status = 'partial'
        
        self.save()
        
        # Update entitlement
        self.payment_plan.entitlement.record_payment(remaining)
        
        return remaining


class InvoiceItemPayment(TimeStampedModel):
    """
    Tracks how much of a specific invoice line item was covered by each payment.

    When a payment is recorded against an invoice, the payer can allocate the payment
    across one or more line items. This model persists those per-item allocations so that:
    - We know exactly which services/goods have been paid for
    - Entitlements or inventory releases can be triggered per line item
    - Partial payments at the item level are visible to staff
    """
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='item_payments',
        help_text="The invoice this allocation belongs to"
    )
    invoice_item = models.ForeignKey(
        InvoiceItem,
        on_delete=models.CASCADE,
        related_name='payment_allocations',
        help_text="The specific line item being paid for"
    )
    # Reference back to the GL journal entry so we can audit and reverse
    journal_entry_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Payment journal entry reference number"
    )
    payment_date = models.DateField()
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount of the payment allocated to this line item"
    )
    notes = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['payment_date', 'id']
        indexes = [
            models.Index(fields=['invoice', 'payment_date']),
            models.Index(fields=['invoice_item']),
        ]

    def __str__(self):
        return (
            f"Payment {self.amount} on {self.invoice_item.description[:40]} "
            f"(Invoice {self.invoice.invoice_number})"
        )


class PaymentReversalRequest(TimeStampedModel, BranchScopedModel):
    """
    Tracks a request to reverse a recorded invoice payment.

    Workflow:
        1. Any authorised user submits a request (status=pending).
           A draft (unapproved) GL journal entry is created at this point so
           the accounting team can review the offsetting entries before approving.
        2. An approver (IsApprover permission) approves the request:
           - The draft GL entry is posted.
           - The original payment journal entry is marked as reversed.
           - The invoice's amount_paid and status are corrected.
           - Per-line-item and entitlement allocations are rolled back.
        3. The approver may also reject the request (status=rejected), in which
           case the draft GL entry is deleted / voided.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='reversal_requests',
        help_text="Invoice whose payment is being reversed",
    )
    payment_reference = models.CharField(
        max_length=100,
        help_text="journal_entry_reference of the payment transaction to reverse",
        db_index=True,
    )
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total amount being reversed",
    )
    reason = models.TextField(
        help_text="Reason for the reversal request",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )

    # Audit
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='payment_reversal_requests_made',
        help_text="User who submitted the reversal request",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payment_reversal_requests_approved',
        help_text="User who approved or rejected the request",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # The draft (unapproved) GL reversal journal entry created when the
    # request is submitted — gives the approver something to review.
    draft_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payment_reversal_request',
        help_text="Draft GL reversal entry pending approval",
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['invoice', 'status']),
            models.Index(fields=['payment_reference', 'status']),
        ]
        verbose_name = 'Payment Reversal Request'
        verbose_name_plural = 'Payment Reversal Requests'

    def __str__(self):
        return (
            f"Reversal request for {self.payment_reference} "
            f"on Invoice {self.invoice.invoice_number} [{self.status}]"
        )


# Import configuration model to ensure it's registered
from .models_config import IncomeAccountingConfig  # noqa

# Import discount models to ensure they're registered
from .models_discount import DiscountProgram, DiscountApplication, AppliedDiscount  # noqa