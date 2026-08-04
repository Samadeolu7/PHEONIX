# expenses/models.py
"""
Expense and prepaid expense management
"""
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from common.mixins import MakerCheckerMixin
from accounts.models import Account
from accounts.utils.account_creation import get_system_account


class ExpenseCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Categories for expenses
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    
    # Link to expense account
    expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='expense_categories_main',
        help_text="Expense account (must be EXPENSE type)"
    )
    
    # Link to product for expense limits and validation
    product = models.ForeignKey(
        'products.Product',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='expense_categories',
        limit_choices_to={'product_type': 'EXPENSE'},
        help_text="Product configuration for expense limits and validation"
    )
    
    # For prepaid expenses
    prepaid_account = models.ForeignKey(
        Account,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='expense_categories_prepaid',
        help_text="Asset account for prepaid expenses (must be ASSET type)"
    )
    
    # Configuration
    requires_approval = models.BooleanField(default=False)
    approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Expenses above this require approval"
    )
    
    # Budget tracking
    budget_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Budget allocation for this category (per fiscal year)"
    )
    budget_period = models.CharField(
        max_length=10,
        choices=[('monthly', 'Monthly'), ('quarterly', 'Quarterly'), ('yearly', 'Yearly')],
        default='yearly',
        help_text="Budget period for tracking"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('branch', 'code')]
        verbose_name_plural = 'Expense Categories'
    
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
        
        # Validate expense_account is actually an expense account
        if self.expense_account_id:
            if self.expense_account.account_type != 'EXPENSE':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'expense_account': f'Expense categories must use an EXPENSE account. '
                                     f'Selected account "{self.expense_account.name}" is '
                                     f'type "{self.expense_account.account_type}".'
                })
        
        # Validate prepaid_account is an asset account
        if self.prepaid_account_id:
            if self.prepaid_account.account_type != 'ASSET':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'prepaid_account': f'Prepaid expense accounts must be ASSET type. '
                                     f'Selected account "{self.prepaid_account.name}" is '
                                     f'type "{self.prepaid_account.account_type}".'
                })
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class Expense(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual expense record
    """
    reference_number = models.CharField(max_length=50, db_index=True, null=True, blank=True)
    
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='expenses'
    )
    
    # Details
    expense_date = models.DateField(default=timezone.now)
    description = models.TextField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Payee
    payee_name = models.CharField(max_length=200, blank=True)
    payee_type = models.CharField(
        max_length=20,
        choices=[
            ('supplier', 'Supplier'),
            ('employee', 'Employee'),
            ('other', 'Other'),
        ],
        default='other'
    )
    
    # Payment details
    payment_method = models.CharField(
        max_length=20,
        choices=[
            ('cash', 'Cash'),
            ('bank_transfer', 'Bank Transfer'),
            ('cheque', 'Cheque'),
            ('card', 'Card'),
        ],
        default='cash'
    )
    payment_reference = models.CharField(max_length=100, blank=True)

    # Bank account used for payment (for bank_transfer / cheque / card methods)
    bank_account = models.ForeignKey(
        'banks.BankAccount',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='expenses',
        help_text=(
            "Bank account used for this payment. Required when payment_method is "
            "bank_transfer, cheque, or card. The GL account linked to this bank account "
            "will be credited when the expense is posted."
        )
    )
    
    # Approval
    requires_approval = models.BooleanField(default=False)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_expenses'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    
    # Attachments/receipts
    receipt_file = models.FileField(upload_to='expenses/receipts/', blank=True, null=True)
    
    # Workflow Integration (Phase 1)
    expense_type = models.CharField(
        max_length=20,
        choices=[
            ('procurement', 'Procurement-Initiated'),
            ('direct_cash', 'Direct Cash Request'),
            ('reimbursement', 'Employee Reimbursement'),
        ],
        default='direct_cash',
        help_text="Type determines workflow and tracking"
    )
    
    origin_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="Original document reference (PR/PO number if from procurement)"
    )
    
    parent_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="Immediate parent document reference (GRN/PO number)"
    )
    
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='expenses'
    )
    
    approval_chain = models.JSONField(
        default=list,
        blank=True,
        help_text="Track all approvers and decisions"
    )
    
    # Link to procurement
    purchase_order = models.ForeignKey(
        'procurement.PurchaseOrder',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='expenses'
    )
    
    # Financial breakdown
    subtotal = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    tax_amount_field = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Tax amount for this expense"
    )
    
    total_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Metadata
    metadata = models.JSONField(default=dict)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-expense_date']
    
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
        
        # Generate reference number if not set
        if not self.reference_number:
            from datetime import datetime
            year = datetime.now().year
            # Lock for concurrent safety
            with transaction.atomic():
                last_expense = Expense.objects.filter(
                    branch=self.branch,
                    reference_number__startswith=f'EXP-{year}'
                ).select_for_update().order_by('-reference_number').first()
                
                if last_expense and last_expense.reference_number:
                    try:
                        last_num = int(last_expense.reference_number.split('-')[-1])
                        next_num = last_num + 1
                    except (ValueError, IndexError):
                        next_num = 1
                else:
                    next_num = 1
                
                self.reference_number = f'EXP-{year}-{next_num:06d}'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.reference_number} - {self.description[:50]}"

    def clean(self):
        super().clean()
        bank_methods = {'bank_transfer', 'cheque', 'card'}
        if self.payment_method in bank_methods and not self.bank_account_id:
            raise ValidationError({
                'bank_account': (
                    f'A bank account is required when payment method is "{self.payment_method}". '
                    'Link a bank account to identify which GL account will be credited.'
                )
            })


class PrepaidExpense(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Prepaid expenses (like bulk fuel purchase)
    Amortized over time or consumed as used
    """
    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='prepaid_expenses'
    )
    
    # Details
    purchase_date = models.DateField(default=timezone.now)
    description = models.TextField()
    
    # Amounts
    total_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total prepaid amount"
    )
    consumed_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Amount already consumed/expensed"
    )
    remaining_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Amount still prepaid"
    )
    
    # For measurable items (like fuel)
    measurable = models.BooleanField(
        default=False,
        help_text="Can be measured in units (liters, kg, etc.)"
    )
    unit_of_measure = models.CharField(max_length=20, blank=True)
    total_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    consumed_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    remaining_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Cost per unit"
    )
    
    # Supplier
    supplier = models.ForeignKey(
        'procurement.Supplier',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='prepaid_expenses',
        help_text="Supplier for this prepaid expense"
    )
    supplier_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Supplier name (for reference or if supplier not in system)"
    )
    supplier_invoice = models.CharField(max_length=100, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('partially_consumed', 'Partially Consumed'),
        ('fully_consumed', 'Fully Consumed'),
        ('expired', 'Expired'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True
    )
    
    # Accounting
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)

    # When the prepaid is backed by a supplier, the initial journal entry
    # creates an AP record (Dr Prepaid Asset / Cr Accounts Payable).
    # This FK links back to that AP so the payment status can be tracked.
    accounts_payable = models.ForeignKey(
        'liabilities.AccountsPayable',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='prepaid_expenses',
        help_text="AP record created when this prepaid is backed by a supplier payable"
    )
    # GL journal entry created when this prepaid was first posted (Gap 9 traceability).
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='prepaid_postings',
        help_text='Initial GL journal entry (Dr Prepaid / Cr AP or Cash)'
    )

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-purchase_date']

    def __str__(self):
        return f"{self.reference_number} - {self.description[:50]}"
    
    def save(self, *args, **kwargs):
        # Auto-set tenant from thread-local if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        # Calculate remaining
        self.remaining_amount = self.total_amount - self.consumed_amount
        if self.measurable:
            self.remaining_units = self.total_units - self.consumed_units
        
        # Update status
        if self.remaining_amount <= 0:
            self.status = 'fully_consumed'
        elif self.consumed_amount > 0:
            self.status = 'partially_consumed'
        else:
            self.status = 'active'
        
        super().save(*args, **kwargs)


class PrepaidVoucher(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Voucher issued against prepaid expense
    Example: Fuel voucher for a vehicle
    """
    voucher_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    prepaid_expense = models.ForeignKey(
        PrepaidExpense,
        on_delete=models.PROTECT,
        related_name='vouchers'
    )
    
    # Issue details
    issue_date = models.DateField(default=timezone.now)
    expiry_date = models.DateField(null=True, blank=True)
    
    # Beneficiary (e.g., vehicle, employee, department)
    beneficiary_type = models.CharField(
        max_length=20,
        choices=[
            ('asset', 'Asset/Vehicle'),
            ('employee', 'Employee'),
            ('department', 'Department'),
            ('other', 'Other'),
        ]
    )
    beneficiary_name = models.CharField(max_length=200)
    beneficiary_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Asset ID, Employee ID, etc."
    )

    # When beneficiary_type='employee', link directly to the hr.Staff record so
    # the person is traceable and deductions can reach their payslip.
    beneficiary_staff = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='prepaid_vouchers',
        help_text='Staff beneficiary for employee-type vouchers'
    )

    # Allocation
    allocated_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Units allocated (e.g., liters of fuel)"
    )
    allocated_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Monetary value of allocation"
    )
    
    # Consumption
    consumed_units = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    consumed_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Status
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('partially_used', 'Partially Used'),
        ('fully_used', 'Fully Used'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        db_index=True
    )
    
    # Redemption tracking
    is_redeemed = models.BooleanField(default=False)
    redemption_date = models.DateField(null=True, blank=True)
    redemption_location = models.CharField(max_length=200, blank=True)

    # Vehicle / asset tracking
    odometer_reading = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Odometer reading at time of voucher issue (for vehicle assets)"
    )

    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-issue_date']
        indexes = [
            models.Index(fields=['voucher_number']),
            models.Index(fields=['status']),
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
    
    def __str__(self):
        return f"{self.voucher_number} - {self.beneficiary_name}"
    
    @property
    def remaining_units(self):
        return self.allocated_units - self.consumed_units
    
    @property
    def remaining_amount(self):
        return self.allocated_amount - self.consumed_amount


class Resource(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Define resources that can be consumed/tracked
    
    Examples:
    - Fuel types: Premium Gasoline, Diesel, Kerosene
    - Utilities: Electricity (kWh), Water (m³), Natural Gas
    - Telecommunications: Mobile Data (GB), Voice Minutes, SMS
    - Contracted Services: Cleaning Service, Security Service, Maintenance
    - Consumables: Office Supplies, Raw Materials
    
    This allows easy reporting and analytics per resource
    """
    resource_code = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Unique code for this resource (e.g., FUEL-PREM, ELEC-PREPAID)"
    )
    
    name = models.CharField(
        max_length=200,
        help_text="Resource name (e.g., Premium Gasoline, Cleaning Service)"
    )
    
    description = models.TextField(blank=True)
    
    # Resource Type/Category
    RESOURCE_TYPE_CHOICES = [
        ('fuel', 'Fuel/Gasoline'),
        ('electricity', 'Electricity'),
        ('water', 'Water'),
        ('gas', 'Natural Gas'),
        ('telecom', 'Telecommunications'),
        ('service', 'Contracted Service'),
        ('consumable', 'Consumable Item'),
        ('other', 'Other Resource'),
    ]
    resource_type = models.CharField(
        max_length=20,
        choices=RESOURCE_TYPE_CHOICES,
        db_index=True,
        help_text="General category of resource"
    )
    
    # Measurement
    unit_of_measure = models.CharField(
        max_length=20,
        help_text="Unit of measurement (liters, kWh, m³, hours, pieces)"
    )
    
    # Tracking method for consumption
    TRACKING_METHOD_CHOICES = [
        ('odometer', 'Odometer Reading (km/miles)'),
        ('meter', 'Meter Reading (kWh, m³, etc.)'),
        ('hours', 'Runtime/Service Hours'),
        ('cycles', 'Operating Cycles/Count'),
        ('quantity', 'Direct Quantity Only'),
        ('none', 'No Usage Tracking'),
    ]
    default_tracking_method = models.CharField(
        max_length=20,
        choices=TRACKING_METHOD_CHOICES,
        default='quantity',
        help_text="How consumption is typically measured for this resource"
    )
    
    # Cost and pricing
    default_unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        default=0,
        help_text="Default cost per unit (can be overridden per consumption)"
    )
    
    # Supplier (for postpaid or service contracts)
    default_supplier = models.ForeignKey(
        'procurement.Supplier',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='resources',
        help_text="Default supplier for this resource"
    )
    
    # Expense category for accounting
    expense_category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='resources',
        help_text="Expense category for this resource"
    )
    
    # For services: contract details
    is_service = models.BooleanField(
        default=False,
        help_text="Is this a contracted service (cleaners, security, etc.)"
    )
    
    service_contract_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Contract reference number for services"
    )
    
    service_frequency = models.CharField(
        max_length=50,
        blank=True,
        help_text="Service frequency (daily, weekly, monthly, etc.)"
    )
    
    # Consumption thresholds and alerts
    enable_irregularity_detection = models.BooleanField(
        default=True,
        help_text="Enable automatic irregularity detection"
    )
    
    variance_threshold_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=25,
        help_text="Variance % to flag as irregular"
    )
    
    min_efficiency = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Minimum acceptable efficiency (e.g., 2 km/liter)"
    )
    
    max_efficiency = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Maximum acceptable efficiency (e.g., 30 km/liter)"
    )
    
    max_daily_usage = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum acceptable daily usage (e.g., 500 km/day)"
    )
    
    # Status
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Is this resource currently available"
    )
    
    # Metadata for resource-specific configurations
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional resource-specific data"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['resource_type', 'name']
        unique_together = [('branch', 'resource_code')]
        indexes = [
            models.Index(fields=['resource_code']),
            models.Index(fields=['resource_type', 'is_active']),
            models.Index(fields=['is_service']),
        ]
        verbose_name = 'Resource'
        verbose_name_plural = 'Resources'
    
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
    
    def __str__(self):
        return f"{self.resource_code} - {self.name}"
    
    def get_total_consumption(self, days=30):
        """Get total consumption for this resource over period"""
        from django.db.models import Sum
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days) if days else None
        
        consumptions = self.consumptions.filter(is_posted=True)
        if cutoff_date:
            consumptions = consumptions.filter(consumption_date__gte=cutoff_date)
        
        totals = consumptions.aggregate(
            total_quantity=Sum('quantity_consumed'),
            total_cost=Sum('total_cost')
        )
        
        return {
            'total_quantity': totals['total_quantity'] or Decimal('0'),
            'total_cost': totals['total_cost'] or Decimal('0'),
        }
    
    def get_consumption_count(self, days=30):
        """Get number of consumption records"""
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days) if days else None
        
        consumptions = self.consumptions.filter(is_posted=True)
        if cutoff_date:
            consumptions = consumptions.filter(consumption_date__gte=cutoff_date)
        
        return consumptions.count()


class ResourceConsumption(MakerCheckerMixin, TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track consumption of resources by assets/departments/employees
    Supports both PREPAID (voucher-based) and POSTPAID (direct billing) flows
    
    Examples:
    - Fuel consumption by vehicles (with mileage tracking)
    - Electricity by generators (with runtime hours)
    - Cleaning service hours by facility
    - Security guard hours by location
    
    Accounting:
    - PREPAID: Dr Expense Account / Cr Prepaid Asset (amortization)
    - POSTPAID: Dr Expense Account / Cr Accounts Payable (accrual)
    """
    consumption_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Auto-generated: RC-YYYYMMDD-XXXX"
    )
    
    # ============ PAYMENT FLOW ============
    PAYMENT_FLOW_CHOICES = [
        ('prepaid', 'Prepaid (Voucher-based)'),
        ('postpaid', 'Postpaid (Direct Billing)'),
    ]
    payment_flow = models.CharField(
        max_length=20,
        choices=PAYMENT_FLOW_CHOICES,
        default='prepaid',
        db_index=True,
        help_text="Determines accounting treatment"
    )
    
    # Optional - only for prepaid flow
    prepaid_voucher = models.ForeignKey(
        PrepaidVoucher,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='consumptions',
        help_text="Required for prepaid flow"
    )
    
    # For postpaid - link to supplier for billing
    supplier = models.ForeignKey(
        'procurement.Supplier',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='resource_consumptions',
        help_text="Required for postpaid flow (can be overridden from Resource default)"
    )
    
    # ============ RESOURCE DETAILS ============
    resource = models.ForeignKey(
        Resource,
        on_delete=models.PROTECT,
        related_name='consumptions',
        help_text="The resource being consumed"
    )
    
    # ============ BENEFICIARY (Who consumed) ============
    BENEFICIARY_TYPE_CHOICES = [
        ('asset', 'Fixed Asset (Vehicle/Equipment)'),
        ('employee', 'Employee'),
        ('department', 'Department'),
        ('location', 'Location/Facility'),
        ('other', 'Other'),
    ]
    beneficiary_type = models.CharField(
        max_length=20,
        choices=BENEFICIARY_TYPE_CHOICES
    )
    
    beneficiary_name = models.CharField(max_length=200)
    
    # Links to actual objects
    asset = models.ForeignKey(
        'assets.FixedAsset',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='resource_consumptions',
        help_text="If beneficiary is an asset"
    )
    
    employee = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='resource_consumptions',
        help_text="If beneficiary is a staff member (from HR)"
    )
    
    # Generic reference for departments/locations
    beneficiary_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Department code, Location ID, etc."
    )
    
    # ============ CONSUMPTION DETAILS ============
    consumption_date = models.DateField(default=timezone.now)
    
    # Quantity consumed
    quantity_consumed = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Units consumed (liters, kWh, cubic meters, etc.)"
    )
    
    unit_of_measure = models.CharField(
        max_length=20,
        help_text="liters, kWh, m³, GB, etc."
    )
    
    # Cost (can override resource default)
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Cost per unit (if null, uses resource default_unit_cost)"
    )
    
    total_cost = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total cost of consumption"
    )
    
    # ============ USAGE METRICS (for irregularity detection) ============
    # Reading type comes from resource.default_tracking_method but can be overridden
    reading_type = models.CharField(
        max_length=20,
        choices=[
            ('odometer', 'Odometer (km/miles)'),
            ('meter', 'Meter Reading'),
            ('hours', 'Runtime/Service Hours'),
            ('cycles', 'Operating Cycles'),
            ('quantity', 'Direct Quantity Only'),
            ('none', 'No Reading Required'),
        ],
        null=True,
        blank=True,
        help_text="How consumption was measured (defaults from Resource)"
    )
    
    previous_reading = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Previous meter/odometer reading"
    )
    
    current_reading = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Current meter/odometer reading"
    )
    
    usage_since_last = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Distance/hours/cycles since last consumption"
    )
    
    # Efficiency metrics
    consumption_rate = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="e.g., km/liter, hours/kWh (calculated)"
    )
    
    expected_consumption = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Expected consumption based on historical average"
    )
    
    # ============ IRREGULARITY DETECTION ============
    is_irregular = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Flagged for unusual consumption pattern"
    )
    
    IRREGULARITY_TYPE_CHOICES = [
        ('excessive_consumption', 'Excessive Resource Usage'),
        ('low_usage', 'Unusually Low Usage'),
        ('high_usage', 'Unusually High Usage'),
        ('duplicate_reading', 'Duplicate or Similar Reading'),
        ('reading_rollback', 'Reading Decreased (Rollback)'),
        ('impossible_rate', 'Impossible Consumption Rate'),
        ('no_usage', 'Consumption Without Usage'),
        ('frequency_anomaly', 'Too Frequent Consumption'),
    ]
    irregularity_type = models.CharField(
        max_length=30,
        blank=True,
        choices=IRREGULARITY_TYPE_CHOICES
    )
    
    variance_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="% deviation from expected"
    )
    
    irregularity_notes = models.TextField(blank=True)
    
    # Approval for irregularities
    requires_explanation = models.BooleanField(default=False)
    explanation_provided = models.TextField(blank=True)
    
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_consumptions'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # ============ OPERATOR/DRIVER INFO ============
    operator_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Driver, technician, user who consumed resource"
    )

    # FK to the actual staff member who operated/consumed the resource.
    # Populated alongside operator_name so the person is fully traceable.
    # When set, deductions can be raised directly against their payslip.
    operator = models.ForeignKey(
        'hr.Staff',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='resource_consumptions_operated',
        help_text='Staff member who operated/consumed the resource (driver, technician)'
    )

    operator_signature = models.ImageField(
        upload_to='consumptions/signatures/',
        blank=True,
        null=True
    )
    
    # ============ TRANSACTION LOCATION ============
    consumption_location = models.CharField(
        max_length=200,
        blank=True,
        help_text="Filling station, facility, etc."
    )
    
    # ============ RECEIPT/DOCUMENTATION ============
    receipt_number = models.CharField(max_length=100, blank=True)
    receipt_photo = models.ImageField(
        upload_to='consumptions/receipts/',
        blank=True,
        null=True
    )
    
    invoice_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Supplier invoice number (for postpaid)"
    )
    
    # ============ STATUS & POSTING ============
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('flagged', 'Flagged for Review'),
        ('approved', 'Approved'),
        ('posted', 'Posted'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    is_posted = models.BooleanField(default=False, db_index=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_consumptions'
    )
    # GL journal entry created when this consumption was posted (Gap 8 traceability).
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='consumption_postings',
        help_text='Journal entry created when this consumption was posted to GL'
    )
    
    # Link to accounts payable (for postpaid)
    accounts_payable = models.ForeignKey(
        'liabilities.AccountsPayable',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='resource_consumptions'
    )
    
    # ============ WORKFLOW INTEGRATION ============
    # Automatic approval workflows (like procurement)
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='resource_consumptions',
        help_text="Linked workflow run for approval automation"
    )
    
    origin_reference = models.CharField(
        max_length=50,
        blank=True,
        editable=False,
        db_index=True,
        help_text="Self-reference for tracking (same as consumption_number)"
    )
    
    approval_chain = models.JSONField(
        default=list,
        blank=True,
        help_text="Track all approvers and decisions in approval workflow"
    )
    
    # Manual approval override (for irregular consumptions)
    requires_manual_approval = models.BooleanField(
        default=False,
        help_text="Set to True if consumption needs manual manager approval"
    )
    
    # ============ METADATA ============
    notes = models.TextField(blank=True)
    
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional consumption-specific data"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-consumption_date', '-created_at']
        indexes = [
            models.Index(fields=['consumption_number']),
            models.Index(fields=['payment_flow', 'status']),
            models.Index(fields=['resource', 'consumption_date']),
            models.Index(fields=['asset', 'consumption_date']),
            models.Index(fields=['is_irregular', 'status']),
            models.Index(fields=['beneficiary_type', 'consumption_date']),
        ]
        verbose_name = 'Resource Consumption'
        verbose_name_plural = 'Resource Consumptions'
    
    def __str__(self):
        return f"{self.consumption_number} - {self.beneficiary_name} ({self.quantity_consumed} {self.resource.unit_of_measure})"
    
    def clean(self):
        """Validate before saving"""
        super().clean()
        
        # Validate prepaid requires voucher
        if self.payment_flow == 'prepaid' and not self.prepaid_voucher_id:
            raise ValidationError({
                'prepaid_voucher': 'Prepaid flow requires a voucher'
            })
        
        # Validate postpaid requires supplier (or use resource default)
        if self.payment_flow == 'postpaid':
            if not self.supplier_id and not (self.resource_id and self.resource.default_supplier_id):
                raise ValidationError({
                    'supplier': 'Postpaid flow requires a supplier (set on Resource or Consumption)'
                })
        
        # Validate voucher has sufficient balance
        if self.prepaid_voucher_id and self.resource_id:
            if self.quantity_consumed > self.prepaid_voucher.remaining_units:
                raise ValidationError({
                    'quantity_consumed': f'Insufficient voucher balance. Available: {self.prepaid_voucher.remaining_units} {self.resource.unit_of_measure}'
                })
        
        # Validate reading rollback
        if self.current_reading and self.previous_reading:
            if self.current_reading < self.previous_reading:
                # Allow if explicitly approved
                if not self.approved_by_id:
                    raise ValidationError({
                        'current_reading': 'Current reading cannot be less than previous reading (odometer rollback)'
                    })
    
    def save(self, *args, **kwargs):
        # Auto-set tenant from thread-local if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        # Auto-generate consumption number with race condition protection
        if not self.consumption_number:
            from django.utils import timezone
            from django.db import transaction
            
            with transaction.atomic():
                date_str = timezone.now().strftime('%Y%m%d')
                # Gap 15: include branch code so numbers are scoped per branch.
                branch_code = getattr(self.branch, 'code', None) or 'GEN'
                prefix = f'{branch_code}-RC-{date_str}'
                
                # Lock the latest record to prevent race conditions
                last_consumption = ResourceConsumption.objects.filter(
                    consumption_number__startswith=prefix
                ).select_for_update().order_by('-consumption_number').first()
                
                if last_consumption:
                    last_num = int(last_consumption.consumption_number.split('-')[-1])
                    new_num = last_num + 1
                else:
                    new_num = 1
                
                self.consumption_number = f'{prefix}-{new_num:04d}'
        
        # Set defaults from Resource if not provided
        if self.resource_id:
            if not self.unit_cost:
                self.unit_cost = self.resource.default_unit_cost
            
            if not self.reading_type:
                self.reading_type = self.resource.default_tracking_method
            
            # Use resource supplier if not provided (for postpaid)
            if self.payment_flow == 'postpaid' and not self.supplier_id:
                self.supplier_id = self.resource.default_supplier_id
        
        # Calculate total cost
        if self.quantity_consumed and self.unit_cost:
            self.total_cost = self.quantity_consumed * self.unit_cost
        
        # Calculate usage metrics
        if self.current_reading and self.previous_reading:
            self.usage_since_last = self.current_reading - self.previous_reading
            
            # Calculate consumption rate
            if self.quantity_consumed > 0:
                self.consumption_rate = self.usage_since_last / self.quantity_consumed
        
        # Check for irregularities (only if enabled on resource)
        if (self.resource_id and self.resource.enable_irregularity_detection and 
            not self.is_posted and not self.approved_by_id and 
            self.status not in ['cancelled', 'posted']):  # Skip cancelled and posted consumptions
            self.check_irregularities()
        
        super().save(*args, **kwargs)
    
    def check_irregularities(self):
        """
        Detect unusual consumption patterns using Resource-defined thresholds
        This runs automatically on save before posting
        """
        
        # Skip if already flagged and explained
        if self.is_irregular and self.explanation_provided:
            return
        
        if not self.resource_id:
            return
        
        # 1. Check for reading rollback
        if self.current_reading and self.previous_reading:
            if self.current_reading < self.previous_reading:
                self.is_irregular = True
                self.irregularity_type = 'reading_rollback'
                self.irregularity_notes = f"Current reading ({self.current_reading}) is less than previous ({self.previous_reading})"
                self.requires_explanation = True
                self.status = 'flagged'
                return
        
        # 2. Check for no usage but consumption
        if self.reading_type not in ['none', 'quantity']:
            if self.usage_since_last == 0 and self.quantity_consumed > 0:
                self.is_irregular = True
                self.irregularity_type = 'no_usage'
                self.irregularity_notes = "Resource consumed but no usage recorded"
                self.requires_explanation = True
                self.status = 'flagged'
                return
        
        # 3. Get historical average for this beneficiary
        if self.asset_id:
            historical_avg = self._get_asset_average_consumption_rate()
            
            if historical_avg and self.consumption_rate:
                # Use resource-defined threshold
                variance_threshold = self.resource.variance_threshold_percentage
                
                # Calculate variance
                variance = abs(self.consumption_rate - historical_avg) / historical_avg * 100
                self.variance_percentage = variance
                
                # Flag if variance exceeds threshold
                if variance > variance_threshold:
                    self.is_irregular = True
                    
                    if self.consumption_rate < historical_avg:
                        self.irregularity_type = 'excessive_consumption'
                        self.irregularity_notes = f"Consumption rate {variance:.1f}% worse than average ({historical_avg:.2f} {self.resource.unit_of_measure}/unit)"
                    else:
                        self.irregularity_type = 'high_usage'
                        self.irregularity_notes = f"Consumption rate {variance:.1f}% better than average (verify accuracy)"
                    
                    self.requires_explanation = True
                    self.status = 'flagged'
                    return
        
        # 4. Check for unusually high daily usage (if resource has max_daily_usage set)
        if self.asset_id and self.resource.max_daily_usage:
            last_consumption = ResourceConsumption.objects.filter(
                asset=self.asset,
                resource=self.resource,
                is_posted=True,
                consumption_date__lt=self.consumption_date
            ).order_by('-consumption_date').first()
            
            if last_consumption:
                days_between = (self.consumption_date - last_consumption.consumption_date).days
                if days_between > 0:
                    daily_usage = self.usage_since_last / days_between
                    
                    # Use resource-defined threshold
                    if daily_usage > self.resource.max_daily_usage:
                        self.is_irregular = True
                        self.irregularity_type = 'high_usage'
                        self.irregularity_notes = f"Unusually high daily usage: {daily_usage:.0f} (max: {self.resource.max_daily_usage})"
                        self.requires_explanation = True
                        self.status = 'flagged'
                        return
        
        # 5. Check for impossible consumption rates (using resource-defined thresholds)
        if self.consumption_rate and self.resource.min_efficiency and self.resource.max_efficiency:
            if self.consumption_rate < self.resource.min_efficiency or self.consumption_rate > self.resource.max_efficiency:
                self.is_irregular = True
                self.irregularity_type = 'impossible_rate'
                self.irregularity_notes = f"Consumption rate {self.consumption_rate:.2f} is outside acceptable range ({self.resource.min_efficiency}-{self.resource.max_efficiency})"
                self.requires_explanation = True
                self.status = 'flagged'
                return
        
        # 6. Check consumption frequency (too frequent consumptions)
        if self.asset_id:
            recent_consumptions = ResourceConsumption.objects.filter(
                asset=self.asset,
                resource=self.resource,
                is_posted=True,
                consumption_date__gte=self.consumption_date - timezone.timedelta(days=1),
                consumption_date__lt=self.consumption_date
            ).count()
            
            # More than 3 consumptions in 24 hours is suspicious (configurable)
            if recent_consumptions >= 3:
                self.is_irregular = True
                self.irregularity_type = 'frequency_anomaly'
                self.irregularity_notes = f"Too many consumptions: {recent_consumptions + 1} in 24 hours"
                self.requires_explanation = True
                self.status = 'flagged'
                return
    
    def _get_asset_average_consumption_rate(self):
        """Get historical average consumption rate for the asset with this resource"""
        if not self.asset_id or not self.resource_id:
            return None
        
        from django.db.models import Avg
        
        # Get average from last 30 days, excluding irregular ones
        cutoff_date = self.consumption_date - timezone.timedelta(days=30)
        
        avg = ResourceConsumption.objects.filter(
            asset=self.asset,
            resource=self.resource,
            is_posted=True,
            is_irregular=False,
            consumption_rate__isnull=False,
            consumption_date__gte=cutoff_date
        ).aggregate(avg_rate=Avg('consumption_rate'))
        
        return avg['avg_rate']
    
    @transaction.atomic
    def post(self):
        """
        Post the consumption to accounting
        Creates journal entries and updates voucher/creates accounts payable
        """
        if self.is_posted:
            raise ValidationError("Consumption already posted")
        
        # Resource consumption records document what has already happened.
        # They do NOT require an approval step before posting — the prepaid
        # voucher (or purchase order) already provided the authorisation.
        # Irregularities are flagged for visibility but must NOT block posting.
        
        # Get expense category from Resource if not directly set
        expense_category = self.resource.expense_category
        
        # Determine expense account from Resource
        expense_account = expense_category.expense_account
        
        if self.payment_flow == 'prepaid':
            # PREPAID FLOW: Amortize from prepaid asset
            self._post_prepaid_consumption(expense_account)
        else:
            # POSTPAID FLOW: Create accounts payable
            self._post_postpaid_consumption(expense_account)
        
        # Update status
        self.is_posted = True
        self.posted_at = timezone.now()
        self.status = 'posted'
        self.save()
        
        return True

    def create_deduction_request(self, deduction_component, for_month, reason=None, requested_by=None):
        """
        Raise a BonusDeductionRequest (DEDUCTION type) against the linked operator's payslip.

        Typically called when a flagged irregularity is confirmed and management decides
        to recover the cost from the responsible staff member.

        Args:
            deduction_component: hr.SalaryComponent (must be DEDUCTION type)
            for_month:            date (YYYY-MM-01) — which payroll month to apply it in
            reason:               optional override for the reason text
            requested_by:         User who is raising the deduction request

        Returns:
            hr.BonusDeductionRequest instance

        Raises:
            ValidationError if no operator FK is set on this consumption record
        """
        from hr.models import BonusDeductionRequest
        from common.services.reference_service import ReferenceService

        if not self.operator_id:
            raise ValidationError(
                "Cannot raise a deduction: this consumption record has no linked staff operator. "
                "Set the operator FK before raising a deduction."
            )

        reason_text = reason or (
            f"Resource consumption irregularity ({self.consumption_number}): "
            f"{self.irregularity_type.replace('_', ' ')} on {self.consumption_date}. "
            f"Quantity consumed: {self.quantity_consumed} {self.unit_of_measure}. "
            f"Total cost: {self.total_cost}."
        )

        ref = ReferenceService.generate_reference(
            module='hr',
            model_name='bonus_deduction_request',
            tenant=getattr(self.owner, 'tenant', None),
            branch=self.branch,
        )

        return BonusDeductionRequest.objects.create(
            reference_number=ref,
            staff=self.operator,
            component=deduction_component,
            amount=self.total_cost,
            reason=reason_text,
            for_month=for_month,
            status=BonusDeductionRequest.PENDING,
            requested_by=requested_by or self.owner,
            branch=self.branch,
            owner=self.owner,
            tenant=getattr(self.owner, 'tenant', None),
        )

    def _post_prepaid_consumption(self, expense_account):
        """
        Post prepaid consumption
        Dr: Expense Account (fuel expense, electricity expense, etc.)
        Cr: Prepaid Asset Account (reduces prepaid balance)
        
        Voucher/PrepaidExpense balances are already updated at creation time (reservation pattern).
        This method only creates the GL journal entry.
        """
        if not self.prepaid_voucher_id:
            raise ValidationError("Prepaid voucher required for prepaid flow")
        
        voucher = self.prepaid_voucher
        prepaid_expense = voucher.prepaid_expense
        
        # Get (or auto-create) prepaid account for this category.
        # Gap 13: use the system-wide prepaid_expense account as fallback rather
        # than counting existing children under 1130 (which had a race condition).
        if not prepaid_expense.category.prepaid_account:
            from accounts.utils.account_creation import get_system_account
            prepaid_account = get_system_account(
                'prepaid_expense',
                self.owner,
                self.branch,
            )
            # Persist so future consumptions for this category reuse the same account
            prepaid_expense.category.prepaid_account = prepaid_account
            prepaid_expense.category.save(update_fields=['prepaid_account'])
        
        prepaid_account = prepaid_expense.category.prepaid_account
        
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        
        # Get or create transaction series for resource consumption
        series, _ = TransactionSeries.objects.get_or_create(
            code='RC',
            defaults={
                'description': 'Resource Consumption'
            }
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.consumption_date,
            description=f"Resource consumption: {self.beneficiary_name} - {self.quantity_consumed} {self.resource.unit_of_measure}",
            workflow_reference=f"resource_consumption_{self.id}",
            branch=self.branch,
            owner=self.owner,
            created_by=self.posted_by,
            tenant=self.tenant,
        )

        # Debit: Expense Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=expense_account,
            side=JournalEntryLine.DEBIT,
            amount=self.total_cost
        )

        # Credit: Prepaid Asset Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=prepaid_account,
            side=JournalEntryLine.CREDIT,
            amount=self.total_cost
        )
        
        # Post journal entry
        journal_entry.post()
        
        # Gap 8: store GL link on this consumption record
        self.journal_entry = journal_entry
        
        # NOTE: Voucher and PrepaidExpense balances are NOT updated here.
        # They are already decremented at consumption-creation time (serializer.create()),
        # which acts as a reservation. Updating balances again here would cause double-deduction.
        # The GL journal entry above is the only additional action needed at posting time.
    
    def _post_postpaid_consumption(self, expense_account):
        """
        Post postpaid consumption
        Dr: Expense Account
        Cr: Accounts Payable (creates liability to supplier)
        """
        if not self.supplier_id:
            raise ValidationError("Supplier required for postpaid flow")
        
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
        from accounts.models import Account
        from liabilities.models import AccountsPayable

        # Resolve the supplier's own dedicated payable account (or the shared
        # system account for legacy Client vendors) — see resolve_vendor_account.
        ap_account = AccountsPayable.resolve_vendor_account(self.supplier, self.owner, self.branch)
        
        # Get or create transaction series for resource consumption
        from transactions.models import TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(
            code='RC',
            defaults={
                'description': 'Resource Consumption'
            }
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.consumption_date,
            description=f"Resource consumption (postpaid): {self.beneficiary_name} - {self.quantity_consumed} {self.unit_of_measure}",
            workflow_reference=f"resource_consumption_{self.id}",
            branch=self.branch,
            owner=self.owner,
            created_by=self.posted_by,
            tenant=self.tenant,
        )

        # Debit: Expense Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=expense_account,
            side=JournalEntryLine.DEBIT,
            amount=self.total_cost
        )

        # Credit: Accounts Payable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=ap_account,
            side=JournalEntryLine.CREDIT,
            amount=self.total_cost
        )
        
        # Post journal entry
        journal_entry.post()
        
        # Create Accounts Payable record
        from liabilities.models import AccountsPayable
        from django.utils import timezone
        
        # Gap 12: respect supplier payment terms instead of hardcoding 30 days.
        PAYMENT_TERMS_DAYS = {
            'cash': 0, 'net_15': 15, 'net_30': 30, 'net_60': 60, 'net_90': 90,
        }
        payment_terms_str = getattr(self.supplier, 'payment_terms', 'net_30') or 'net_30'
        payment_days = PAYMENT_TERMS_DAYS.get(payment_terms_str, 30)
        due_date = self.consumption_date + timezone.timedelta(days=payment_days)

        accounts_payable = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=ap_account,
            invoice_number=self.invoice_number or f"RC-{self.consumption_number}",
            invoice_date=self.consumption_date,
            due_date=due_date,
            amount=self.total_cost,
            description=f"Resource consumption: {self.resource.name} for {self.beneficiary_name}",
            branch=self.branch,
            owner=self.owner
        )
        self.accounts_payable = accounts_payable
        # Gap 8: store GL link on this consumption record
        self.journal_entry = journal_entry
    # ============ WORKFLOW METHODS (like procurement) ============
    
    def submit_for_approval(self):
        """
        Submit consumption for approval workflow
        Similar to PurchaseRequisition.submit()
        
        Used when:
        - High-value consumptions need approval
        - Irregular consumptions flagged by system
        - Manual approval required per resource configuration
        """
        if self.status not in ['draft', 'flagged']:
            raise ValidationError("Can only submit draft or flagged consumptions for approval")
        
        # Set origin reference for tracking
        if not self.origin_reference:
            self.origin_reference = self.consumption_number
        
        # Determine if workflow is needed
        should_trigger_workflow = (
            self.is_irregular or 
            self.requires_manual_approval or
            self.total_cost > getattr(self.resource.expense_category, 'approval_threshold', 0)
        )
        
        if should_trigger_workflow:
            self.status = 'submitted'
            # Workflow will be triggered by signal or view
        else:
            # Auto-approve if no workflow needed
            self.status = 'approved'
            self.approved_by = self.created_by
            self.approved_at = timezone.now()
        
        self.save()
        return self.status == 'submitted'
    
    def approve(self, approved_by, notes=''):
        """
        Approve the consumption
        Similar to PurchaseRequisition.approve()
        """
        if self.status not in ['submitted', 'flagged']:
            raise ValidationError("Can only approve submitted or flagged consumptions")

        self.assert_not_maker(approved_by, action='approve')
        
        self.approved_by = approved_by
        self.approved_at = timezone.now()
        self.status = 'approved'
        
        # Add to approval chain
        approval_entry = {
            'approver_id': approved_by.id,
            'approver_name': approved_by.get_full_name(),
            'action': 'approved',
            'timestamp': timezone.now().isoformat(),
            'notes': notes
        }
        
        if not isinstance(self.approval_chain, list):
            self.approval_chain = []
        self.approval_chain.append(approval_entry)
        
        self.save()
        return True
    
    def reject(self, rejected_by, reason):
        """
        Reject the consumption
        Similar to PurchaseRequisition.reject()
        """
        if self.status not in ['submitted', 'flagged']:
            raise ValidationError("Can only reject submitted or flagged consumptions")
        
        self.status = 'cancelled'
        self.notes += f"\n\nRejected by {rejected_by.get_full_name()}: {reason}"
        
        # Add to approval chain
        rejection_entry = {
            'approver_id': rejected_by.id,
            'approver_name': rejected_by.get_full_name(),
            'action': 'rejected',
            'timestamp': timezone.now().isoformat(),
            'notes': reason
        }
        
        if not isinstance(self.approval_chain, list):
            self.approval_chain = []
        self.approval_chain.append(rejection_entry)
        
        self.save()
        return True