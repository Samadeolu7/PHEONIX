# hr/models.py
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager

# Import config models
from hr.config_models import HRConfig  # noqa

class Staff(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Employee profile. May optionally link to a system User.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='staff_profile',
        help_text='Optional link to a login user'
    )
    # Auto-generated, branch-scoped ID (e.g. MML001)
    staff_id     = models.CharField(
        max_length=30,
        blank=True,
        db_index=True,
        help_text='Auto-generated staff ID based on branch prefix (e.g. MML001)'
    )
    first_name   = models.CharField(max_length=100)
    last_name    = models.CharField(max_length=100)
    email        = models.EmailField(blank=True)
    phone        = models.CharField(max_length=20, blank=True)
    photo        = models.ImageField(upload_to='staff_photos/', blank=True)
    position     = models.CharField(max_length=100, blank=True)
    department   = models.CharField(max_length=100, blank=True)

    # Pension
    pension_number = models.CharField(
        max_length=50,
        blank=True,
        help_text='Pension fund membership / registration number'
    )
    pension_provider = models.CharField(
        max_length=200,
        blank=True,
        help_text='Pension fund / provider name for this staff member'
    )

    # Tax
    paye_pin = models.CharField(
        max_length=50,
        blank=True,
        help_text='PAYE / Tax Identification Number (TIN) for FIRS filing'
    )

    # Bank payment details
    bank_name = models.CharField(
        max_length=100,
        blank=True,
        help_text='Bank name for salary disbursement'
    )
    bank_account_number = models.CharField(
        max_length=20,
        blank=True,
        help_text='Bank account number for salary disbursement'
    )

    # Pension exemption (e.g. contract staff)
    is_pension_exempt = models.BooleanField(
        default=False,
        help_text='If True, pension contributions are not calculated for this staff member (e.g. contract staff)'
    )

    # ── Organisational hierarchy & access control ─────────────────────────────

    ROLE_LEVEL_CHOICES = [
        ('credit_officer',  'Credit Officer'),       # frontline; sees only assigned clients
        ('supervisor',      'Supervisor'),            # sees own + direct-report clients
        ('branch_manager',  'Branch Manager'),        # sees all clients in branch
        ('director',        'Director'),              # sees all clients across branches
        ('operations',      'Operations'),            # back-office; full branch-level access
        ('admin',           'Admin'),                 # system admin; full access
    ]
    role_level = models.CharField(
        max_length=20,
        choices=ROLE_LEVEL_CHOICES,
        default='operations',
        db_index=True,
        help_text='Determines data-access tier for client/loan scoping.',
    )
    reports_to = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='direct_reports',
        help_text='Immediate supervisor. Used for hierarchical client-data access.',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        display_id = self.staff_id or str(self.pk)
        name = f"{self.first_name} {self.last_name}".strip()
        return f"{display_id} - {name}" if name else display_id

    @property
    def public_id(self):
        """Stable external identifier for the staff record.

        Prefer the branch-scoped `staff_id` when available; fall back to the
        numeric primary key as a string. This property is read-only and intended
        for display/API use so callers can adopt `staff.public_id` without
        changing the DB primary key.
        """
        return self.staff_id if self.staff_id else str(self.pk)

class SalaryComponent(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines a pay component: earning or deduction.

    For EARNING components, `is_taxable` controls whether this component
    is included in the PAYE taxable-income calculation.
    Non-taxable earnings (e.g. transport, meal allowances) are still paid
    but excluded from the annual income that feeds the PAYE tax bands.
    Pension is always computed on TOTAL gross regardless of taxability.
    """
    EARNING   = 'EARNING'
    DEDUCTION = 'DEDUCTION'
    TYPE_CHOICES = [
        (EARNING, 'Earning'),
        (DEDUCTION, 'Deduction'),
    ]
    name           = models.CharField(max_length=100)
    component_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    default_amount = models.DecimalField(max_digits=18, decimal_places=2)
    is_taxable     = models.BooleanField(
        default=True,
        help_text=(
            'For EARNING components: include in PAYE taxable income. '
            'Set False for statutory non-taxable allowances (e.g. Leave Allowance). '
            'DEDUCTION components ignore this flag.'
        )
    )
    is_pensionable = models.BooleanField(
        default=False,
        help_text=(
            'Include this earning in the pension contribution base (Nigerian Pension Reform Act). '
            'Set True for Basic Salary, Housing Allowance, and Transport Allowance only.'
        )
    )
    description = models.TextField(
        blank=True,
        help_text='Optional description / notes about this component'
    )
    gl_account = models.ForeignKey(
        'accounts.Account',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='salary_components',
        help_text=(
            'For DEDUCTION components: the balance-sheet account that tracks this liability '
            '(e.g. "Staff Advances and Loans" 1112). '
            'When an advance is issued: Dr this account / Cr Bank. '
            'When deducted at payroll: Dr Salary Payable / Cr this account.'
        )
    )
    is_advance = models.BooleanField(
        default=False,
        help_text=(
            'For DEDUCTION components only. '
            'Set True when this deduction represents a cash advance physically disbursed to the staff member '
            '(e.g. Salary Advance, Staff Loan). '
            'On approval a journal entry is posted: Dr gl_account / Cr Cash/Bank. '
            'Set False for pure salary-reduction deductions (e.g. Development Levy, cooperative dues) '
            'where no cash leaves the organisation at the time of approval.'
        )
    )

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = [('branch','name')]
        ordering = ['component_type', 'name']

    def __str__(self):
        taxable_label = ' [Taxable]' if self.component_type == self.EARNING and self.is_taxable else ''
        return f"{self.name} ({self.get_component_type_display()}){taxable_label}"

class StaffPayInfo(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Assigned pay components for a staff member.
    """
    staff     = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='pay_info')
    component = models.ForeignKey(SalaryComponent, on_delete=models.PROTECT)
    amount    = models.DecimalField(max_digits=18, decimal_places=2,
                  help_text='Override default amount if needed')

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = [('staff','component')]

    def __str__(self):
        return f"{self.staff}: {self.component.name} = {self.amount}"


class BonusDeductionRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Request for one-time bonus or deduction for a staff member.
    Requires approval before inclusion in payroll.
    """
    PENDING  = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]

    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='bonus_deduction_requests')
    component = models.ForeignKey(SalaryComponent, on_delete=models.PROTECT,
                                help_text='Salary component (bonus or deduction)')
    amount = models.DecimalField(max_digits=18, decimal_places=2,
                                help_text='Amount for this one-time adjustment')
    reason = models.TextField(help_text='Justification for this bonus/deduction')
    
    # Payroll association
    for_month = models.DateField(help_text='Month and year this should be applied (YYYY-MM-01)')
    applied_in_payroll = models.ForeignKey(
        'Payroll',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bonus_deduction_requests',
        help_text='Payroll where this was applied (set after processing)'
    )
    
    # Approval workflow
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='bonus_deduction_requests_created'
    )
    requested_date = models.DateTimeField(auto_now_add=True)
    
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bonus_deduction_requests_approved'
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, help_text='Reason if rejected')

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_date']
        indexes = [
            models.Index(fields=['status', 'for_month']),
            models.Index(fields=['staff', 'status']),
        ]

    def __str__(self):
        return f"{self.reference_number}: {self.staff} - {self.component.name} ({self.amount})"

    @property
    def is_pending(self):
        return self.status == self.PENDING

    @property
    def is_approved(self):
        return self.status == self.APPROVED

    @property
    def is_rejected(self):
        return self.status == self.REJECTED


class PayComponentRemovalRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Approval-gated request to remove a salary component from a staff member's
    recurring pay structure.  When approved the linked StaffPayInfo record is
    deleted; when rejected it is left untouched.
    """
    PENDING  = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    STATUS_CHOICES = [
        (PENDING,  'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]

    reference_number = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text='Auto-generated reference number (e.g. PCR-0001)'
    )
    staff_pay_info = models.ForeignKey(
        StaffPayInfo,
        on_delete=models.PROTECT,
        related_name='removal_requests',
        help_text='The staff–component assignment to be removed upon approval'
    )
    reason = models.TextField(
        help_text='Justification for removing this component from the staff member'
    )

    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=PENDING
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='pay_component_removal_requests_created'
    )
    requested_date = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='pay_component_removal_requests_approved'
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, help_text='Reason if rejected')

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_date']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['staff_pay_info', 'status']),
        ]

    def __str__(self):
        return (
            f"{self.reference_number}: Remove {self.staff_pay_info.component.name}"
            f" from {self.staff_pay_info.staff}"
        )

    @property
    def is_pending(self):
        return self.status == self.PENDING

    @property
    def is_approved(self):
        return self.status == self.APPROVED

    @property
    def is_rejected(self):
        return self.status == self.REJECTED


class PayrollSchedule(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Schedule definition for automated payroll runs.
    """
    MONTHLY = 'MONTHLY'
    WEEKLY  = 'WEEKLY'
    FREQUENCY_CHOICES = [
        (MONTHLY, 'Monthly'),
        (WEEKLY,  'Weekly'),
    ]
    name       = models.CharField(max_length=100)
    frequency  = models.CharField(max_length=10, choices=FREQUENCY_CHOICES)
    day_of_month = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='For monthly freq: day (1–28)'
    )
    day_of_week  = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='For weekly freq: 0=Monday–6=Sunday'
    )
    next_run   = models.DateTimeField(null=True, blank=True)

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = [('branch','name')]
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.frequency})"


class LeaveType(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Types of leave (Annual, Sick, Unpaid, etc.)"""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    
    # Configuration
    is_paid = models.BooleanField(default=True)
    requires_approval = models.BooleanField(default=True)
    requires_medical_certificate = models.BooleanField(
        default=False,
        help_text="Requires medical certificate (for sick leave)"
    )
    
    # Default annual entitlement
    default_days_per_year = models.PositiveIntegerField(
        default=0,
        help_text="Default number of days per year (0 = unlimited)"
    )
    
    # Carryover settings
    allow_carryover = models.BooleanField(
        default=False,
        help_text="Allow unused days to carry over to next year"
    )
    max_carryover_days = models.PositiveIntegerField(
        default=0,
        help_text="Maximum days that can be carried over"
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        unique_together = [('branch', 'code')]
        ordering = ['name']
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class LeaveBalance(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Track leave balance for each staff member"""
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='leave_balances')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT)
    year = models.PositiveIntegerField(help_text="Year for this balance")
    
    # Balance tracking
    entitled_days = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        help_text="Total days entitled for this year"
    )
    used_days = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        help_text="Days already used"
    )
    pending_days = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        help_text="Days in pending requests"
    )
    carried_over_days = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        help_text="Days carried over from previous year"
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        unique_together = [('staff', 'leave_type', 'year')]
        ordering = ['-year', 'staff']
    
    def __str__(self):
        return f"{self.staff} - {self.leave_type.code} {self.year}"
    
    @property
    def available_days(self):
        """Calculate available days"""
        return self.entitled_days + self.carried_over_days - self.used_days - self.pending_days
    
    def has_sufficient_balance(self, requested_days):
        """Check if staff has sufficient leave balance"""
        return self.available_days >= requested_days


class LeaveRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Leave request submitted by staff"""
    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT)
    
    # Leave details
    start_date = models.DateField()
    end_date = models.DateField()
    num_days = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        help_text="Number of leave days (can be fractional for half-days)"
    )
    reason = models.TextField()
    
    # Supporting documents
    medical_certificate = models.FileField(
        upload_to='hr/medical_certificates/',
        null=True,
        blank=True,
        help_text="Medical certificate (for sick leave)"
    )
    supporting_documents = models.FileField(
        upload_to='hr/leave_documents/',
        null=True,
        blank=True
    )
    
    # Contact during leave
    contact_number = models.CharField(max_length=20, blank=True)
    contact_address = models.TextField(blank=True)
    
    # Relief/replacement
    relief_officer = models.ForeignKey(
        Staff,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='relief_assignments',
        help_text="Staff member covering duties"
    )
    
    # Status tracking
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
        ('taken', 'Taken'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_leave_requests'
    )
    rejection_reason = models.TextField(blank=True)
    
    # Workflow integration
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='leave_requests'
    )
    
    approval_chain = models.JSONField(
        default=list,
        blank=True,
        help_text="Track all approvers and decisions"
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['staff', 'status']),
            models.Index(fields=['start_date', 'end_date']),
        ]
    
    def __str__(self):
        return f"{self.reference_number} - {self.staff} ({self.leave_type.code})"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        from datetime import datetime
        
        # Validate dates
        if self.end_date < self.start_date:
            raise ValidationError("End date cannot be before start date")
        
        # CRITICAL: Check if leave balance exists before allowing leave request
        if self.start_date and self.leave_type and self.staff:
            year = self.start_date.year
            balance_exists = LeaveBalance.objects.filter(
                staff=self.staff,
                leave_type=self.leave_type,
                year=year,
                is_deleted=False
            ).exists()
            
            if not balance_exists:
                raise ValidationError(
                    f"Cannot create leave request: No leave balance found for "
                    f"{self.staff.first_name} {self.staff.last_name} for {self.leave_type.name} in {year}. "
                    f"Leave balances must be initialized first."
                )
        
        # Check for overlapping requests
        overlapping = LeaveRequest.objects.filter(
            staff=self.staff,
            status__in=['submitted', 'approved', 'taken'],
            start_date__lte=self.end_date,
            end_date__gte=self.start_date
        ).exclude(id=self.id)
        
        if overlapping.exists():
            raise ValidationError("Leave dates overlap with existing request")
    
    def calculate_num_days(self):
        """Calculate number of leave days (excluding weekends/holidays)"""
        from datetime import timedelta
        
        if not self.start_date or not self.end_date:
            return 0
        
        delta = self.end_date - self.start_date
        days = 0
        
        for i in range(delta.days + 1):
            day = self.start_date + timedelta(days=i)
            # Skip weekends (Saturday=5, Sunday=6)
            if day.weekday() < 5:
                days += 1
        
        return days
    
    def save(self, *args, **kwargs):
        """Auto-calculate num_days when dates change"""
        # Recalculate num_days if dates are set
        if self.start_date and self.end_date:
            self.num_days = self.calculate_num_days()
        super().save(*args, **kwargs)


class Attendance(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Daily attendance record"""
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField(db_index=True)
    
    # Time tracking
    clock_in = models.TimeField(null=True, blank=True)
    clock_out = models.TimeField(null=True, blank=True)
    
    # Status
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('half_day', 'Half Day'),
        ('on_leave', 'On Leave'),
        ('public_holiday', 'Public Holiday'),
        ('weekend', 'Weekend'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='present')
    
    # Hours calculation
    hours_worked = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Actual hours worked"
    )
    overtime_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Overtime hours"
    )
    
    # Linked leave request (if on leave)
    leave_request = models.ForeignKey(
        LeaveRequest,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='attendance_records'
    )
    
    # Notes
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        unique_together = [('staff', 'date')]
        ordering = ['-date', 'staff']
        indexes = [
            models.Index(fields=['date', 'status']),
        ]
    
    def __str__(self):
        return f"{self.staff} - {self.date} ({self.status})"
    
    def calculate_hours_worked(self):
        """Calculate hours worked from clock in/out"""
        if not self.clock_in or not self.clock_out:
            return 0
        
        from datetime import datetime, timedelta
        
        # Combine date with time
        clock_in_dt = datetime.combine(self.date, self.clock_in)
        clock_out_dt = datetime.combine(self.date, self.clock_out)
        
        # Handle overnight shifts
        if clock_out_dt < clock_in_dt:
            clock_out_dt += timedelta(days=1)
        
        # Calculate hours
        delta = clock_out_dt - clock_in_dt
        hours = delta.total_seconds() / 3600
        
        return round(hours, 2)


class Payroll(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Payroll run for a period"""
    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Period
    period_start = models.DateField()
    period_end = models.DateField()
    pay_date = models.DateField(help_text="Date when payment will be made")
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('calculated', 'Calculated'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Totals
    total_gross_pay = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_net_pay = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # Pension totals
    total_employee_pension = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Sum of all employee pension contributions (8% per payslip)'
    )
    total_employer_pension = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Sum of all employer pension contributions (10% per payslip)'
    )

    # NHF / NSITF payroll totals
    total_nhf = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Sum of all NHF deductions for this payroll run (employee 2.5% of basic)'
    )
    total_nsitf = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Sum of all NSITF contributions for this payroll run (employer 1% of emolument)'
    )

    # Pension employer expense journal entry (created at approval)
    pension_expense_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_pension_expense_entries',
        help_text='Journal entry: DR Pension Expense, CR Employer Pension Payable'
    )
    
    # Workflow integration
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payrolls'
    )
    
    # Dual-signature approval tracking
    first_approved_at = models.DateTimeField(null=True, blank=True)
    first_approver = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_first_approvals',
        help_text='First approver (e.g., Finance Manager)'
    )
    
    second_approved_at = models.DateTimeField(null=True, blank=True)
    second_approver = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_second_approvals',
        help_text='Second approver (e.g., Principal)'
    )
    
    # Legacy fields for backward compatibility
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_payrolls'
    )
    
    # Payment processing info
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='paid_payrolls'
    )
    payment_account = models.ForeignKey(
        'accounts.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_payments',
        help_text='Bank/Cash account used for payment'
    )
    
    # Two-stage accounting entries
    liabilities_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_liability_entries',
        help_text='Journal entry created on approval: DR Salary Expense, CR Salary Payable'
    )
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='payroll_payment_entries',
        help_text='Journal entry created on disbursement: DR Salary Payable, CR Cash/Bank'
    )
    
    # Processing info
    calculated_at = models.DateTimeField(null=True, blank=True)
    calculated_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='calculated_payrolls'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['-period_end']
        indexes = [
            models.Index(fields=['period_start', 'period_end']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.reference_number} ({self.period_start} to {self.period_end})"

    @property
    def paye_filing_deadline(self):
        """
        PAYE remittance deadline: 10th of the month following ``period_end``.
        Compliant with Nigeria Tax Act 2025 (NTA 2025, effective 1 Jan 2026).
        Returns a ``datetime.date`` object.
        """
        from dateutil.relativedelta import relativedelta
        return (self.period_end.replace(day=1) + relativedelta(months=1)).replace(day=10)

    @property
    def pension_filing_deadline(self):
        """
        Pension remittance deadline: 7th calendar day of the month following ``period_end``.
        Compliant with Pension Reform Act 2014, s.11(5).
        Returns a ``datetime.date`` object.
        """
        from dateutil.relativedelta import relativedelta
        return (self.period_end.replace(day=1) + relativedelta(months=1)).replace(day=7)


class Payslip(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Individual payslip for a staff member"""
    payslip_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    payroll = models.ForeignKey(Payroll, on_delete=models.CASCADE, related_name='payslips')
    staff = models.ForeignKey(Staff, on_delete=models.PROTECT, related_name='payslips')
    
    # Earnings
    basic_salary = models.DecimalField(max_digits=18, decimal_places=2)
    overtime_pay = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    allowances = models.JSONField(
        default=dict,
        encoder=DjangoJSONEncoder,
        help_text=(
            'Dict of allowance_name: {amount, is_taxable}. '
            'Example: {"Housing Allowance": {"amount": 50000, "is_taxable": true}}'
        )
    )
    bonuses = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    gross_pay = models.DecimalField(max_digits=18, decimal_places=2)

    # PAYE / Tax computation audit trail
    taxable_income = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Monthly taxable income = sum of all taxable earnings (basic + taxable allowances + overtime)'
    )
    annual_taxable_income = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Annual taxable income = monthly_taxable_income * 12'
    )
    paye_breakdown = models.JSONField(
        default=list,
        encoder=DjangoJSONEncoder,
        help_text=(
            'List of PAYE band details for audit. '
            'Each item: {band, rate, amount_in_band, tax_in_band, cumulative_balance}'
        )
    )

    # Deductions
    tax = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    employee_pension = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Employee pension contribution deducted from salary (8% of gross)'
    )
    deductions = models.JSONField(
        default=dict,
        encoder=DjangoJSONEncoder,
        help_text="Dict of deduction_name: amount"
    )

    total_deductions = models.DecimalField(max_digits=18, decimal_places=2)
    net_pay = models.DecimalField(max_digits=18, decimal_places=2)

    # Employer-side pension (not a deduction from employee; recorded on payroll)
    employer_pension = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='Employer pension contribution (e.g. 10% of gross) — expensed separately'
    )

    # NHF — National Housing Fund (2.5% of basic salary, deducted from employee)
    nhf = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='National Housing Fund deduction: 2.5% of basic salary'
    )

    # NSITF — Nigeria Social Insurance Trust Fund (1% of total emolument, employer cost)
    nsitf = models.DecimalField(
        max_digits=18, decimal_places=2, default=0,
        help_text='NSITF contribution: 1% of total emolument (employer cost, not deducted from employee)'
    )

    # Attendance summary
    days_worked = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    days_absent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    days_on_leave = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    
    # PDF generation
    pdf_file = models.FileField(
        upload_to='hr/payslips/',
        null=True,
        blank=True,
        help_text="Generated PDF payslip"
    )
    
    # Email tracking
    emailed_at = models.DateTimeField(null=True, blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        unique_together = [('payroll', 'staff')]
        ordering = ['-payroll__period_end', 'staff']
        indexes = [
            models.Index(fields=['staff', 'payroll']),
        ]
    
    def __str__(self):
        return f"{self.payslip_number} - {self.staff}"
    
    def calculate_totals(self):
        """
        Re-derive gross, total_deductions, and net_pay from stored components.
        Supports both the new allowances format {name: {amount, is_taxable}}
        and the legacy flat format {name: amount}.

        NOTE: self.bonuses is a reporting-only subtotal for payslip display.
        One-time bonus amounts are already stored inside self.allowances under
        "<Name> (One-time)" keys, so they are included in total_allowances.
        Adding self.bonuses here would double-count every one-time bonus.
        """
        # Allowances total — handles both dict-of-dicts and flat dict
        total_allowances = Decimal('0.00')
        if self.allowances:
            for v in self.allowances.values():
                if isinstance(v, dict):
                    total_allowances += Decimal(str(v.get('amount', 0)))
                else:
                    total_allowances += Decimal(str(v))

        self.gross_pay = (
            self.basic_salary
            + self.overtime_pay
            + total_allowances
            # self.bonuses intentionally NOT added — already captured in allowances
        )

        total_other_deductions = sum(
            Decimal(str(v)) for v in self.deductions.values()
        ) if self.deductions else Decimal('0.00')

        self.total_deductions = self.tax + self.employee_pension + self.nhf + total_other_deductions
        self.net_pay = self.gross_pay - self.total_deductions
        return self.net_pay


class PensionRemittance(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Tracks remittance of pooled pension contributions to the pension fund.

    When pension is remitted the accounting entry is:
        DR  Employee Pension Payable  (employee 8% portions)
        DR  Employer Pension Payable  (employer 10% portions)
        CR  Cash / Bank               (total paid out)
    """
    reference_number = models.CharField(max_length=50, unique=True, db_index=True)

    # Date range covered
    period_start = models.DateField()
    period_end   = models.DateField()
    remittance_date = models.DateField(help_text="Date pension was actually transferred to the fund")

    # Amounts
    total_employee_pension = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text="Sum of employee pension contributions remitted"
    )
    total_employer_pension = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text="Sum of employer pension contributions remitted"
    )
    total_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text="Grand total remitted (employee + employer)"
    )

    # Pension provider info
    pension_provider = models.CharField(max_length=200, blank=True)

    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('remitted',   'Remitted'),
        ('cancelled',  'Cancelled'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # Payrolls covered by this remittance
    payrolls = models.ManyToManyField(
        Payroll,
        blank=True,
        related_name='pension_remittances',
        help_text="Payrolls whose pension has been included in this remittance"
    )

    # Accounting entry
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='pension_remittance_entries',
        help_text='Journal entry: DR Employee+Employer Pension Payable, CR Cash/Bank'
    )

    # Payment account
    payment_account = models.ForeignKey(
        'accounts.Account',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='pension_remittance_payments',
        help_text='Bank/Cash account used for remittance'
    )

    # Audit
    remitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='pension_remittances_processed'
    )
    notes = models.TextField(blank=True)

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-remittance_date']
        indexes = [
            models.Index(fields=['status', 'remittance_date']),
        ]

    def __str__(self):
        return f"{self.reference_number} ({self.remittance_date})"


class PayrollStatutoryFiling(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Tracks NHF and NSITF statutory filings to the relevant government agencies.

    NHF  — National Housing Fund (Federal Mortgage Bank of Nigeria)
    NSITF — Nigeria Social Insurance Trust Fund

    Java App 2 (StatutoryComplianceService) reads this model via the internal
    API to generate e-filing documents and track submission status.

    Accounting entries are posted when status moves to 'remitted':
        NHF:   DR NHF Payable  CR Cash/Bank
        NSITF: DR NSITF Expense Payable  CR Cash/Bank
    """
    FILING_TYPE_CHOICES = [
        ('nhf',   'NHF (National Housing Fund)'),
        ('nsitf', 'NSITF (Social Insurance Trust Fund)'),
    ]
    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('submitted',  'Submitted to Agency'),
        ('remitted',   'Remitted / Paid'),
        ('rejected',   'Rejected by Agency'),
        ('cancelled',  'Cancelled'),
    ]

    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    filing_type = models.CharField(max_length=10, choices=FILING_TYPE_CHOICES, db_index=True)

    # Period covered
    period_start = models.DateField()
    period_end   = models.DateField()
    filing_date  = models.DateField(null=True, blank=True, help_text='Date submitted to the agency')
    remittance_date = models.DateField(null=True, blank=True, help_text='Date payment was made')

    # Amounts
    total_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Total NHF or NSITF amount for this filing period'
    )

    # Payrolls covered
    payrolls = models.ManyToManyField(
        Payroll,
        blank=True,
        related_name='statutory_filings',
        help_text='Payrolls included in this filing'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # Agency reference returned after e-filing
    agency_reference = models.CharField(
        max_length=100, blank=True,
        help_text='Transaction/acknowledgement reference from FMBN or NSITF portal'
    )

    # Accounting entry for remittance
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='statutory_filing_entries',
        help_text='Journal entry created on remittance'
    )
    payment_account = models.ForeignKey(
        'accounts.Account',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='statutory_filing_payments',
    )

    # Java App 2 integration — stores the last payload sent / response received
    last_submission_payload = models.JSONField(
        null=True, blank=True,
        help_text='Last JSON payload submitted by Java App 2 (StatutoryComplianceService)'
    )
    last_submission_response = models.JSONField(
        null=True, blank=True,
        help_text='Last response body received from the agency API'
    )
    last_submitted_at = models.DateTimeField(null=True, blank=True)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='statutory_filings_submitted',
    )
    notes = models.TextField(blank=True)

    objects     = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-period_end', 'filing_type']
        indexes = [
            models.Index(fields=['filing_type', 'status']),
            models.Index(fields=['period_start', 'period_end']),
        ]

    def __str__(self):
        return f"{self.reference_number} — {self.get_filing_type_display()} ({self.period_start} to {self.period_end})"


class StaffIOU(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Tracks a cash advance / IOU given to a staff member that is to be
    recovered via fixed monthly payroll deductions.

    Accounting flow
    ---------------
    When cash is disbursed (on approval):
        Dr  Staff IOU Receivable   (asset account — staff owes the company)
        Cr  Cash / Bank            (money leaves the organisation)

    Each month at payroll time the recovery entry is posted as part of the
    payroll liability journal:
        Dr  Salary Payable (Payroll Clearance)   [net pay reduced]
        Cr  Staff IOU Receivable                 [receivable reduced]

    The deduction appears in the payslip under the key "Staff IOU".
    When balance_remaining reaches zero the IOU is automatically marked
    COMPLETED and no further deduction is made.
    """

    PENDING   = 'PENDING'
    APPROVED  = 'APPROVED'
    ACTIVE    = 'ACTIVE'
    COMPLETED = 'COMPLETED'
    CANCELLED = 'CANCELLED'
    STATUS_CHOICES = [
        (PENDING,   'Pending Approval'),
        (APPROVED,  'Approved'),
        (ACTIVE,    'Active'),
        (COMPLETED, 'Completed'),
        (CANCELLED, 'Cancelled'),
    ]

    reference_number = models.CharField(max_length=50, unique=True, db_index=True)
    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name='ious'
    )
    total_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Total cash advance given to the staff member'
    )
    monthly_installment = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Fixed amount deducted from salary each month until repaid'
    )
    balance_remaining = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Outstanding balance to be recovered'
    )
    start_month = models.DateField(
        help_text='First payroll month the deduction should be applied (YYYY-MM-01)'
    )
    reason = models.TextField(
        help_text='Reason / purpose of the IOU'
    )
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=PENDING
    )

    # Whether cash was physically disbursed (set during the disburse action)
    # True  = cash given from bank/petty cash (GL posted: Dr Staff Loan Acct / Cr Cash)
    # False = payroll-deduction only, no immediate cash outflow
    # None  = decision not yet made (IOU is PENDING or APPROVED)
    cash_disbursed = models.BooleanField(
        null=True, blank=True,
        help_text='True if cash was disbursed; False if payroll-deduction only; None until decided'
    )

    DEDUCTION_ADVANCE = 'advance'
    DEDUCTION_RECONCILIATION = 'reconciliation'
    DEDUCTION_TYPE_CHOICES = [
        (DEDUCTION_ADVANCE, 'Cash Advance / IOU'),
        (DEDUCTION_RECONCILIATION, 'Cashier Reconciliation Shortfall'),
    ]
    deduction_type = models.CharField(
        max_length=20,
        choices=DEDUCTION_TYPE_CHOICES,
        default=DEDUCTION_ADVANCE,
        db_index=True,
        help_text='advance = normal cash advance; reconciliation = salary deduction for cashier shortfall'
    )

    # Optional link to the CashReconciliation that triggered this deduction
    cashier_reconciliation = models.ForeignKey(
        'cash_management.CashReconciliation',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='salary_deductions',
        help_text='Reconciliation record that created this deduction (for shortfall type)'
    )

    # Approval
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='ious_created'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='ious_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    # Disbursement journal entry (Dr Staff IOU / Cr Bank)
    disbursement_journal = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='iou_disbursements'
    )

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['staff', 'status']),
            models.Index(fields=['status', 'start_month']),
        ]

    def __str__(self):
        return f"IOU {self.reference_number} – {self.staff} (₦{self.balance_remaining} remaining)"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            import uuid
            self.reference_number = f"IOU-{uuid.uuid4().hex[:8].upper()}"
        if not self.pk:
            # On first save, initialise balance_remaining from total_amount
            self.balance_remaining = self.total_amount
        super().save(*args, **kwargs)

    def apply_installment(self, amount=None):
        """
        Reduce balance_remaining by one installment (or a custom amount).
        Marks the IOU COMPLETED when fully repaid.
        Returns the actual amount deducted (capped at remaining balance).
        """
        deduct = min(amount or self.monthly_installment, self.balance_remaining)
        self.balance_remaining -= deduct
        if self.balance_remaining <= 0:
            self.balance_remaining = Decimal('0.00')
            self.status = self.COMPLETED
        self.save(update_fields=['balance_remaining', 'status'])
        return deduct


class EmployeeDocument(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Stores documents associated with an employee (contracts, IDs,
    certificates, disciplinary records, etc.).
    """
    CATEGORY_CHOICES = [
        ('contract', 'Employment Contract'),
        ('id_document', 'ID / Passport'),
        ('certificate', 'Certificate / Qualification'),
        ('medical', 'Medical Record'),
        ('disciplinary', 'Disciplinary Record'),
        ('tax', 'Tax Document'),
        ('pension', 'Pension Document'),
        ('other', 'Other'),
    ]

    staff = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name='documents',
    )
    title = models.CharField(max_length=200)
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default='other',
    )
    file = models.FileField(upload_to='employee_documents/')
    description = models.TextField(blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='uploaded_employee_docs',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} - {self.staff}"
