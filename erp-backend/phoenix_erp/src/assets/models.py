
# assets/models.py
"""
Fixed assets and asset tracking
"""
from django.db import models
from django.utils import timezone
from decimal import Decimal
from dateutil.relativedelta import relativedelta

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account


class AssetCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Categories for fixed assets"""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    
    # Accounting
    asset_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='asset_categories_asset',
        help_text="Asset account (must be ASSET type)"
    )
    depreciation_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='asset_categories_depreciation',
        help_text="Depreciation expense account (must be EXPENSE type)"
    )
    accumulated_depreciation_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='asset_categories_accumulated',
        help_text="Accumulated depreciation account (must be ASSET type - contra-asset)"
    )
    maintenance_expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='asset_categories_maintenance',
        null=True,
        blank=True,
        help_text="Maintenance expense account (must be EXPENSE type)"
    )
    
    # Default depreciation settings
    DEPRECIATION_METHODS = [
        ('straight_line', 'Straight Line'),
        ('declining_balance', 'Declining Balance'),
        ('units_of_production', 'Units of Production'),
    ]
    default_depreciation_method = models.CharField(
        max_length=30,
        choices=DEPRECIATION_METHODS,
        default='straight_line'
    )
    default_useful_life_years = models.PositiveIntegerField(default=5)
    default_salvage_value_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('branch', 'code')]
        verbose_name_plural = 'Asset Categories'
    
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
        
        # Validate asset_account is actually an asset account
        if self.asset_account_id:
            if self.asset_account.account_type != 'ASSET':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'asset_account': f'Asset categories must use an ASSET account. '
                                   f'Selected account "{self.asset_account.name}" is '
                                   f'type "{self.asset_account.account_type}".'
                })
        
        # Validate depreciation_account is an expense account
        if self.depreciation_account_id:
            if self.depreciation_account.account_type != 'EXPENSE':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'depreciation_account': f'Depreciation expense accounts must be EXPENSE type. '
                                          f'Selected account "{self.depreciation_account.name}" is '
                                          f'type "{self.depreciation_account.account_type}".'
                })
        
        # Validate accumulated_depreciation_account is an asset account (contra-asset)
        if self.accumulated_depreciation_account_id:
            if self.accumulated_depreciation_account.account_type != 'ASSET':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'accumulated_depreciation_account': f'Accumulated depreciation accounts must be ASSET type (contra-asset). '
                                                      f'Selected account "{self.accumulated_depreciation_account.name}" is '
                                                      f'type "{self.accumulated_depreciation_account.account_type}".'
                })
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class FixedAsset(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Fixed asset (vehicle, equipment, building, etc.)
    """
    asset_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    category = models.ForeignKey(
        AssetCategory,
        on_delete=models.PROTECT,
        related_name='assets'
    )
    
    # Basic details
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Date the asset was registered in the system (asset register step)
    registered_at = models.DateField(
        default=timezone.now,
        help_text="Date the asset was registered in the system (before acquisition)"
    )

    # Identification
    serial_number = models.CharField(max_length=100, blank=True)
    registration_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="License plate, registration, etc."
    )
    make = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)

    # ── Financial (populated when the asset is ACQUIRED via requisition/acquisition) ──
    # purchase_date and purchase_price are 0/null until the asset is activated.
    purchase_date = models.DateField(
        null=True, blank=True,
        help_text="Date of actual purchase — set when asset is activated via acquisition"
    )
    purchase_price = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0'),
        help_text="Actual cost — 0 until activated via acquisition"
    )
    salvage_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # ── Depreciation (configured at registration; start date set at activation) ──
    depreciation_method = models.CharField(
        max_length=30,
        choices=AssetCategory.DEPRECIATION_METHODS,
        blank=True,
        help_text="Defaults to category setting; can be overridden per asset"
    )
    useful_life_years = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Defaults to category setting; can be overridden per asset"
    )
    depreciation_start_date = models.DateField(
        null=True, blank=True,
        help_text="Set automatically to purchase_date when the asset is activated"
    )
    accumulated_depreciation = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )

    # ── Depreciation batch ────────────────────────────────────────────────────
    # Assets bought in the same acquisition posting share this reference.
    # Each asset still depreciates individually (its own start_date / entries).
    depreciation_batch_id = models.CharField(
        max_length=60, blank=True,
        db_index=True,
        help_text="Reference linking assets acquired together (e.g. ACQ-20260401-0001). "
                  "Each asset still has its own depreciation schedule."
    )
    
    # Location and assignment
    current_location = models.CharField(max_length=200, blank=True)
    assigned_to = models.CharField(
        max_length=200,
        blank=True,
        help_text="Employee, department, etc."
    )
    # FK to the actual staff member the asset is assigned to.
    # Kept alongside the CharField for backward compatibility with free-text entries.
    assigned_to_staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_assets',
        help_text='Staff member this asset is currently assigned to'
    )

    # Status
    STATUS_CHOICES = [
        ('draft',       'Draft / Registered (Pending Acquisition)'),
        ('active',      'Active / In Use'),
        ('idle',        'Idle'),
        ('maintenance', 'Under Maintenance'),
        ('disposed',    'Disposed'),
        ('sold',        'Sold'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',   # Always starts as draft until activated via requisition/acquisition
        db_index=True
    )
    
    # Disposal
    disposal_date = models.DateField(null=True, blank=True)
    disposal_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True
    )
    disposal_notes = models.TextField(blank=True)
    # GL journal entry created when this asset was disposed/sold.
    # Stored so the disposal transaction is traceable from the asset record.
    disposal_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='disposed_assets',
        help_text='Journal entry recording the asset disposal / sale'
    )
    
    # Metadata
    metadata = models.JSONField(
        default=dict,
        help_text="Asset-specific data (mileage, hours, etc.)"
    )
    
    # Documents
    photo = models.ImageField(upload_to='assets/photos/', blank=True, null=True)

    # ── Supplier / Procurement linkage ───────────────────────────────────────
    # When an asset is purchased from a supplier on credit, these fields record
    # the procurement chain so the liability appears in the supplier's account.
    supplier = models.ForeignKey(
        'procurement.Supplier',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='assets',
        help_text="Supplier from whom this asset was purchased (optional)"
    )
    purchase_order = models.ForeignKey(
        'procurement.PurchaseOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='assets',
        help_text="PO auto-created for this asset acquisition (optional)"
    )
    accounts_payable = models.ForeignKey(
        'liabilities.AccountsPayable',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='assets',
        help_text="AP liability record auto-created when asset bought on credit"
    )

    # ── Acquisition batch linkage ────────────────────────────────────────────
    # When an asset is created as part of an AssetAcquisition batch (multi-line
    # PO), this FK back-links the asset to its source line item.
    acquisition_line = models.ForeignKey(
        'AssetAcquisitionLine',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='fixed_assets',
        help_text="Acquisition batch line that generated this asset (optional)"
    )

    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['asset_number']
    
    def __str__(self):
        return f"{self.asset_number} - {self.name}"
    
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

        # Apply category defaults for depreciation if not explicitly set
        if self.category_id and not self.depreciation_method:
            self.depreciation_method = self.category.default_depreciation_method
        if self.category_id and self.useful_life_years is None:
            self.useful_life_years = self.category.default_useful_life_years

        # Calculate current value — only meaningful when purchase_price > 0 (i.e. activated)
        if self.purchase_price:
            self.current_value = max(
                self.purchase_price - self.accumulated_depreciation,
                self.salvage_value
            )
        else:
            self.current_value = Decimal('0')
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.depreciation_start_date and self.purchase_date:
            if self.depreciation_start_date < self.purchase_date:
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'depreciation_start_date': (
                        'Depreciation cannot start before the purchase date. '
                        f'Purchase date: {self.purchase_date}, '
                        f'Depreciation start: {self.depreciation_start_date}.'
                    )
                })
    
    @property
    def depreciable_amount(self):
        """Amount subject to depreciation"""
        return self.purchase_price - self.salvage_value
    
    @property
    def book_value(self):
        """Current book value"""
        return self.purchase_price - self.accumulated_depreciation
    
    # ============ RESOURCE CONSUMPTION TRACKING ============
    
    @property
    def current_meter_reading(self):
        """
        Get latest meter reading (odometer, hours, etc.)
        Returns the most recent reading from resource consumptions
        """
        latest_consumption = self.resource_consumptions.filter(
            is_posted=True,
            current_reading__isnull=False
        ).order_by('-consumption_date', '-current_reading').first()
        
        if latest_consumption:
            return latest_consumption.current_reading
        
        # Return None if no consumptions exist
        return None
    
    def get_average_consumption_rate(self, resource_id=None, days=30):
        """
        Calculate historical average consumption rate for a specific resource
        
        Args:
            resource_id: Specific resource ID (if None, gets average across all resources)
            days: Number of days to look back for average
        
        Returns:
            Decimal: Average consumption rate (e.g., km/liter)
        """
        from django.db.models import Avg
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days)
        
        consumptions = self.resource_consumptions.filter(
            is_posted=True,
            is_irregular=False,  # Exclude flagged/irregular consumptions
            consumption_rate__isnull=False,
            consumption_date__gte=cutoff_date
        )
        
        if resource_id:
            consumptions = consumptions.filter(resource_id=resource_id)
        
        avg_result = consumptions.aggregate(avg_rate=Avg('consumption_rate'))
        
        return avg_result['avg_rate']
    
    def get_consumption_trend(self, resource_id=None, days=30):
        """
        Get consumption trend over specified period
        
        Args:
            resource_id: Specific resource ID (if None, gets all resources)
            days: Number of days to look back
        
        Returns:
            QuerySet: Ordered consumption records
        """
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days)
        
        consumptions = self.resource_consumptions.filter(
            is_posted=True,
            consumption_date__gte=cutoff_date
        )
        
        if resource_id:
            consumptions = consumptions.filter(resource_id=resource_id)
        
        return consumptions.order_by('consumption_date')
    
    def get_total_consumption(self, resource_id=None, days=30):
        """
        Get total consumption for a resource over period
        
        Args:
            resource_id: Specific resource ID (if None, gets all resources)
            days: Number of days (None for all time)
        
        Returns:
            dict: Total quantity and cost
        """
        from django.db.models import Sum
        from django.utils import timezone
        from datetime import timedelta
        
        consumptions = self.resource_consumptions.filter(is_posted=True)
        
        if resource_id:
            consumptions = consumptions.filter(resource_id=resource_id)
        
        if days:
            cutoff_date = timezone.now().date() - timedelta(days=days)
            consumptions = consumptions.filter(consumption_date__gte=cutoff_date)
        
        totals = consumptions.aggregate(
            total_quantity=Sum('quantity_consumed'),
            total_cost=Sum('total_cost'),
            total_usage=Sum('usage_since_last')
        )
        
        return {
            'total_quantity': totals['total_quantity'] or Decimal('0'),
            'total_cost': totals['total_cost'] or Decimal('0'),
            'total_usage': totals['total_usage'] or Decimal('0'),
        }
    
    def get_consumption_efficiency(self, resource_id=None):
        """
        Calculate consumption efficiency metrics
        
        Args:
            resource_id: Specific resource ID (if None, averages across all resources)
        
        Returns:
            dict: Current, average, best, and worst consumption rates
        """
        from django.db.models import Min, Max, Avg
        
        consumptions = self.resource_consumptions.filter(
            is_posted=True,
            is_irregular=False,
            consumption_rate__isnull=False
        )
        
        if resource_id:
            consumptions = consumptions.filter(resource_id=resource_id)
        
        stats = consumptions.aggregate(
            avg=Avg('consumption_rate'),
            best=Max('consumption_rate'),  # Higher is better (more km/liter)
            worst=Min('consumption_rate')
        )
        
        # Get most recent rate
        latest_query = self.resource_consumptions.filter(
            is_posted=True,
            consumption_rate__isnull=False
        )
        
        if resource_id:
            latest_query = latest_query.filter(resource_id=resource_id)
        
        latest = latest_query.order_by('-consumption_date').first()
        
        return {
            'current': latest.consumption_rate if latest else None,
            'average': stats['avg'],
            'best': stats['best'],
            'worst': stats['worst'],
        }
    
    def consumption_count(self, days=None):
        """
        Count consumptions for this asset
        
        Args:
            days: Number of days to look back (if None, returns all time)
        
        Returns:
            int: Number of consumptions
        """
        query = self.resource_consumptions.filter(is_posted=True)
        
        if days:
            from django.utils import timezone
            from datetime import timedelta
            cutoff_date = timezone.now().date() - timedelta(days=days)
            query = query.filter(consumption_date__gte=cutoff_date)
        
        return query.count()

    def has_irregular_consumptions(self, resource_id=None, days=30):
        """
        Check if asset has any flagged irregular consumptions
        
        Args:
            resource_id: Specific resource ID (if None, checks all resources)
            days: Number of days to look back
        
        Returns:
            bool: True if there are pending irregular consumptions
        """
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days)
        
        query = self.resource_consumptions.filter(
            is_irregular=True,
            is_posted=False,
            consumption_date__gte=cutoff_date
        )
        
        if resource_id:
            query = query.filter(resource_id=resource_id)
        
        return query.exists()


class AssetDepreciation(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Depreciation entries for assets
    """
    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='depreciation_entries'
    )
    
    period_start = models.DateField()
    period_end = models.DateField()
    depreciation_amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    # Staff member who triggered the posting (audit trail).
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_depreciations',
        help_text='User who posted this depreciation entry to the GL'
    )
    # GL journal entry created when this depreciation entry was posted.
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='depreciation_entries',
        help_text='Journal entry recording this depreciation charge'
    )

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-period_start']
        unique_together = [('asset', 'period_start')]
    
    def __str__(self):
        return f"{self.asset.asset_number} - {self.period_start} to {self.period_end}"


class AssetMaintenance(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Maintenance records for assets
    """
    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='maintenance_records'
    )
    
    maintenance_date = models.DateField(default=timezone.now)
    maintenance_type = models.CharField(
        max_length=20,
        choices=[
            ('routine',     'Routine Maintenance'),
            ('preventive',  'Preventive Maintenance'),
            ('corrective',  'Corrective Maintenance'),
            ('repair',      'Repair'),
            ('inspection',  'Inspection'),
            ('overhaul',    'Overhaul'),
            ('emergency',   'Emergency'),
            ('other',       'Other'),
        ]
    )
    
    description = models.TextField()
    cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    performed_by = models.CharField(max_length=200, blank=True)
    # FK to the staff member who performed the maintenance for full traceability.
    performed_by_staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='maintenance_performed',
        help_text='Staff member who performed or supervised the maintenance'
    )
    vendor = models.CharField(max_length=200, blank=True)
    
    next_maintenance_date = models.DateField(null=True, blank=True)
    
    # Meter reading (for vehicles, equipment)
    meter_reading = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Odometer, hour meter, etc."
    )
    
    notes = models.TextField(blank=True)
    
    # Payment method — determines what GL account is credited when posting.
    PAYMENT_METHOD_CHOICES = [
        ('cash',          'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('bank',          'Bank Transfer'),          # legacy — kept for existing records
        ('petty_cash',    'Petty Cash'),
        ('cheque',        'Cheque'),
        ('credit_card',   'Credit Card'),
        ('credit',        'Credit / Accounts Payable'),  # legacy — kept for existing records
    ]
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='credit',
        help_text="How this maintenance was/will be paid. Determines GL credit account."
    )

    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    # Staff member who triggered the posting (audit trail).
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_maintenances',
        help_text='User who posted this maintenance record to the GL'
    )
    # GL journal entry created when this maintenance record was posted.
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='maintenance_entries',
        help_text='Journal entry recording this maintenance expense'
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-maintenance_date']
    
    def __str__(self):
        return f"{self.asset.asset_number} - {self.maintenance_date}"


# ═══════════════════════════════════════════════════════════════════════════════
#  Asset Acquisition (multi-line bulk purchase)
# ═══════════════════════════════════════════════════════════════════════════════

class AssetAcquisition(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Header record for a bulk asset purchase.

    Replaces the single-asset PO flow for cases where one supplier invoice
    covers multiple asset types / quantities.  The posting action creates:
      * One PurchaseOrder
      * One AccountsPayable
      * One GL journal entry  (DR each asset account / CR Accounts Payable)
      * N FixedAsset records  (one per line × quantity)
    """

    STATUS_DRAFT      = 'draft'
    STATUS_SUBMITTED   = 'submitted'
    STATUS_APPROVED    = 'approved'
    STATUS_REJECTED    = 'rejected'
    STATUS_POSTED      = 'posted'
    STATUS_CHOICES = [
        (STATUS_DRAFT,     'Draft'),
        (STATUS_SUBMITTED, 'Submitted for Approval'),
        (STATUS_APPROVED,  'Approved'),
        (STATUS_REJECTED,  'Rejected'),
        (STATUS_POSTED,    'Posted'),
    ]

    reference_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Auto-generated reference, e.g. ACQ-20260401-0001"
    )

    supplier = models.ForeignKey(
        'procurement.Supplier',
        on_delete=models.PROTECT,
        related_name='asset_acquisitions',
        null=True,
        blank=True,
        help_text="Supplier from whom the assets are being purchased"
    )

    purchase_date = models.DateField(help_text="Date of purchase / invoice date")
    payment_terms = models.CharField(
        max_length=20,
        blank=True,
        help_text="e.g. net_30 – overrides supplier default when set"
    )
    notes = models.TextField(blank=True)

    # Computed total (updated automatically)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        db_index=True,
    )

    # ── Set on submission ─────────────────────────────────────────────────────
    submitted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='submitted_asset_acquisitions',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    # ── Set on approval / rejection ───────────────────────────────────────────
    approved_by_acquisition = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_asset_acquisitions',
    )
    approved_at_acquisition = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # ── Set on posting ───────────────────────────────────────────────────────
    purchase_order = models.OneToOneField(
        'procurement.PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_acquisition',
        help_text="PO auto-created when this acquisition is posted"
    )
    accounts_payable = models.OneToOneField(
        'liabilities.AccountsPayable',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_acquisition',
        help_text="AP record auto-created when this acquisition is posted"
    )
    journal_entry = models.OneToOneField(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_acquisition_journal',
        help_text="GL journal entry auto-created when this acquisition is posted"
    )
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_asset_acquisitions',
    )
    posted_at = models.DateTimeField(null=True, blank=True)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-purchase_date', '-reference_number']

    def __str__(self):
        return f"{self.reference_number} ({self.supplier.name}) – {self.status}"

    def recalculate_total(self):
        """Recompute total_amount from live line items and save."""
        from django.db.models import Sum
        # Use all_objects with explicit is_deleted filter so that this calculation
        # is not affected by OwnerBranchManager's automatic tenant scoping (which
        # can exclude lines that lack a tenant_id when middleware sets the tenant).
        total = (
            AssetAcquisitionLine.all_objects
            .filter(acquisition_id=self.pk, is_deleted=False)
            .aggregate(t=Sum('total_price'))['t'] or Decimal('0')
        )
        self.total_amount = total
        self.save(update_fields=['total_amount'])


class AssetAcquisitionLine(TimeStampedModel, SoftDeleteModel):
    """
    One line item within an AssetAcquisition.

    Each line represents N identical assets of the same category.

    When `asset` is set (linked to a registered shell), posting ACTIVATES that
    shell (sets purchase_price, supplier, status → active).
    If quantity > 1, additional FixedAsset clones are auto-created from the
    same template on posting.

    When `asset` is None (backward-compat / direct acquisitions without a
    prior register step), new FixedAsset records are created on posting.
    """

    acquisition = models.ForeignKey(
        AssetAcquisition,
        on_delete=models.CASCADE,
        related_name='lines',
    )
    asset_category = models.ForeignKey(
        AssetCategory,
        on_delete=models.PROTECT,
        related_name='acquisition_lines',
        help_text="Asset category – determines the GL debit account"
    )

    # Optional: link to a registered FixedAsset shell (the preferred path).
    # When set, posting activates this existing asset record.
    # When null, posting creates a brand-new FixedAsset record.
    registered_asset = models.ForeignKey(
        'FixedAsset',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='acquisition_line_links',
        help_text="Registered asset shell to activate on posting (preferred). "
                  "If blank, a new FixedAsset record is created."
    )

    name = models.CharField(max_length=200, help_text="Asset name / description")
    description = models.TextField(blank=True)

    # Quantity creates that many FixedAsset records on posting.
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    total_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Computed: quantity × unit_price"
    )

    # Optional depreciation overrides (fall back to category defaults when blank)
    depreciation_method = models.CharField(
        max_length=30,
        choices=AssetCategory.DEPRECIATION_METHODS,
        blank=True,
        help_text="Leave blank to inherit from category default"
    )
    useful_life_years = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Leave blank to inherit from category default"
    )
    salvage_value_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Salvage % of unit price – leave blank to inherit from category"
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        return (
            f"{self.acquisition.reference_number} / {self.name} "
            f"(qty {self.quantity} × {self.unit_price})"
        )

    def save(self, *args, **kwargs):
        # Always keep total_price in sync
        from decimal import Decimal
        self.total_price = Decimal(str(self.unit_price)) * self.quantity
        # Auto-sync category from linked registered asset
        if self.registered_asset_id and not self.asset_category_id:
            self.asset_category_id = self.registered_asset.category_id
        # Inherit tenant from the parent acquisition when not explicitly provided
        if not self.tenant_id and self.acquisition_id:
            acq_tenant = getattr(self.acquisition, 'tenant', None)
            if acq_tenant is not None:
                self.tenant = acq_tenant
        super().save(*args, **kwargs)
        # Propagate to acquisition header
        self.acquisition.recalculate_total()


# ═══════════════════════════════════════════════════════════════════════════════
#  Asset Requisition  (approval-gated request before purchase)
# ═══════════════════════════════════════════════════════════════════════════════

class AssetRequisition(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Internal request to acquire one or more assets.

    Workflow:
      draft → submitted → approved/rejected → (converted to AssetAcquisition)

    The approved requisition becomes an AssetAcquisition draft.  Finance then
    attaches a supplier, confirms prices, and posts it to create PO / AP / GL /
    FixedAsset records.
    """

    STATUS_DRAFT     = 'draft'
    STATUS_SUBMITTED = 'submitted'
    STATUS_APPROVED  = 'approved'
    STATUS_REJECTED  = 'rejected'
    STATUS_CONVERTED = 'converted'   # Turned into an AssetAcquisition
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_DRAFT,     'Draft'),
        (STATUS_SUBMITTED, 'Submitted for Approval'),
        (STATUS_APPROVED,  'Approved'),
        (STATUS_REJECTED,  'Rejected'),
        (STATUS_CONVERTED, 'Converted to Acquisition'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    ar_number = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Auto-generated reference, e.g. AR-20260401-0001"
    )

    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='asset_requisitions',
    )

    department = models.CharField(max_length=100, blank=True)
    request_date = models.DateField(default=timezone.now)
    required_by_date = models.DateField(
        null=True, blank=True,
        help_text="When the assets are needed"
    )

    purpose = models.TextField(help_text="Business justification for the asset purchase")
    notes = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        db_index=True,
    )

    # Approval
    approved_by = models.ForeignKey(
        'users.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_asset_requisitions',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Estimated totals (kept in sync from line items)
    estimated_total = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0')
    )

    # If converted → points to the resulting AssetAcquisition
    acquisition = models.OneToOneField(
        AssetAcquisition,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='requisition',
        help_text="AssetAcquisition created when this requisition was approved and converted"
    )

    # Full audit trail of approver decisions (mirrors procurement PR pattern)
    approval_chain = models.JSONField(default=list, blank=True)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-request_date', '-created_at']
        indexes = [
            models.Index(fields=['status', 'request_date']),
        ]

    def __str__(self):
        return f"AR-{self.ar_number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
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

    def recalculate_total(self):
        """Recompute estimated_total from live line items and save."""
        from django.db.models import Sum, F
        from decimal import Decimal
        total = sum(
            Decimal(str(item.actual_unit_price)) * item.quantity
            for item in self.items.filter(is_deleted=False)
        ) if self.pk else Decimal('0')
        self.estimated_total = total
        self.save(update_fields=['estimated_total'])


class AssetRequisitionLine(TimeStampedModel, SoftDeleteModel):
    """
    One line item within an AssetRequisition.

    Each line references a specific FixedAsset that was already registered in
    the asset register (status='draft').  The requisition records:
      - WHO will supply it (supplier)
      - HOW MUCH it will cost (actual_unit_price)
      - HOW MANY are being acquired (quantity)

    When the requisition is approved and converted/posted, the linked
    FixedAsset records are ACTIVATED (purchase_price set, status → 'active',
    depreciation_start_date set, GL entry posted).

    If quantity > 1 the first FixedAsset is the 'primary' and additional
    copies are auto-cloned from the same registered template during activation.
    """

    requisition = models.ForeignKey(
        AssetRequisition,
        on_delete=models.CASCADE,
        related_name='items',
    )

    # The specific asset already in the register (status='draft').
    # Nullable only for backward-compat with existing rows in the DB;
    # new requisition lines should always supply this FK.
    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='requisition_lines',
        help_text="Registered asset (from the asset register) being requisitioned"
    )

    # Derived from asset.category; stored directly for efficient querying.
    # Also nullable for backward-compat with existing rows.
    asset_category = models.ForeignKey(
        AssetCategory,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='requisition_lines',
        help_text="Category derived from the linked asset (auto-set on save)"
    )

    # Supplier from whom this asset will be sourced
    supplier = models.ForeignKey(
        'procurement.Supplier',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='asset_requisition_lines',
        help_text="Supplier for this specific asset line item"
    )

    description = models.TextField(
        blank=True,
        help_text="Additional details / justification for this specific asset"
    )

    # Number of identical units being acquired.
    # If quantity > 1, additional FixedAsset clones are created on activation.
    quantity = models.PositiveIntegerField(default=1)

    # Actual quoted / negotiated price (replaces 'estimated_unit_price')
    actual_unit_price = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0'),
        help_text="Actual (or best-estimate) unit cost from the supplier"
    )

    notes = models.TextField(blank=True)

    # Set to True once the activation GL entry has been posted for this line
    is_activated = models.BooleanField(
        default=False,
        help_text="True once the linked FixedAsset has been activated (value set, GL posted)"
    )

    @property
    def line_total(self):
        return Decimal(str(self.actual_unit_price)) * self.quantity

    class Meta:
        ordering = ['id']

    def __str__(self):
        return (
            f"{self.requisition.ar_number} / {self.asset.name} "
            f"× {self.quantity} @ {self.actual_unit_price}"
        )

    def save(self, *args, **kwargs):
        # Auto-sync asset_category from the linked asset
        if self.asset_id and not self.asset_category_id:
            self.asset_category_id = self.asset.category_id
        elif self.asset_id:
            self.asset_category_id = self.asset.category_id  # always keep in sync

        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if not tenant and self.requisition_id:
                try:
                    tenant = self.requisition.tenant
                except Exception:
                    pass
            if tenant:
                self.tenant = tenant
        super().save(*args, **kwargs)
        # Keep header total in sync
        try:
            self.requisition.recalculate_total()
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
#  Asset Transfer – custody chain audit trail
# ─────────────────────────────────────────────────────────────────────────────

class AssetTransfer(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Records the movement of an asset from one custodian / location to another.

    Whenever an asset changes hands the originating officer creates this record
    (status = pending).  The receiving officer then acknowledges it (status =
    acknowledged).  FixedAsset.assigned_to_staff is updated atomically when
    the transfer is acknowledged so that the current custody record is always
    consistent with the latest acknowledged transfer.
    """

    STATUS_PENDING      = 'pending'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_CHOICES = [
        (STATUS_PENDING,      'Pending Acknowledgement'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
    ]

    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='transfers',
    )

    # ── Sender ────────────────────────────────────────────────────────────────
    from_staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assets_transferred_out',
    )
    from_location = models.CharField(max_length=200, blank=True)

    # ── Receiver ──────────────────────────────────────────────────────────────
    to_staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assets_transferred_in',
    )
    to_location = models.CharField(max_length=200, blank=True)

    transfer_date = models.DateField(default=timezone.now)
    reason        = models.TextField(blank=True)
    notes         = models.TextField(blank=True)

    transferred_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='asset_transfers_initiated',
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )

    acknowledged_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='asset_transfers_acknowledged',
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-transfer_date', '-created_at']

    def __str__(self):
        return (
            f"Transfer {self.asset.asset_number} "
            f"→ {self.to_staff_id or self.to_location} on {self.transfer_date}"
        )

    def save(self, *args, **kwargs):
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


# ─────────────────────────────────────────────────────────────────────────────
#  Asset Assignment – historical custody log
# ─────────────────────────────────────────────────────────────────────────────

class AssetAssignment(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Immutable history of who held each asset and when.

    A new record is written every time custody changes (via AssetTransfer or
    direct assignment).  The active assignment has is_current=True; all prior
    assignments have is_current=False and a non-null unassigned_date.
    """

    asset = models.ForeignKey(
        FixedAsset,
        on_delete=models.CASCADE,
        related_name='assignment_history',
    )

    staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='asset_assignments',
    )
    # Snapshot of the staff name at time of assignment
    staff_name = models.CharField(max_length=200, blank=True)
    location   = models.CharField(max_length=200, blank=True)

    assigned_date   = models.DateField(default=timezone.now)
    unassigned_date = models.DateField(
        null=True, blank=True,
        help_text="Null means this assignment is still active."
    )

    assigned_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='asset_assignments_made',
    )
    notes      = models.TextField(blank=True)
    is_current = models.BooleanField(default=True, db_index=True)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-assigned_date', '-created_at']

    def __str__(self):
        return (
            f"Assignment of {self.asset.asset_number} "
            f"to {self.staff_name or 'unknown'} on {self.assigned_date}"
        )

    def save(self, *args, **kwargs):
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