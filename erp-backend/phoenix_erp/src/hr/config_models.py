# hr/config_models.py
"""
HR Configuration - Simple branch-level settings
Leverages existing WorkflowTemplate system
"""
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class HRConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Branch-level HR configuration
    
    Instead of complex approval configs, this simply links to WorkflowTemplate.
    The workflow engine handles all the logic!
    """
    
    # Leave Management Settings
    enable_leave_approval = models.BooleanField(
        default=True,
        help_text="Require approval for leave requests"
    )
    
    max_consecutive_leave_days = models.PositiveIntegerField(
        default=14,
        help_text="Maximum consecutive days of leave without special approval"
    )
    
    annual_leave_days = models.PositiveIntegerField(
        default=20,
        help_text="Default annual leave entitlement in days"
    )
    
    sick_leave_days = models.PositiveIntegerField(
        default=10,
        help_text="Default sick leave entitlement in days"
    )
    
    # Attendance Settings
    enable_attendance_tracking = models.BooleanField(
        default=True,
        help_text="Track employee attendance"
    )
    
    working_hours_per_day = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('8.00'),
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="Standard working hours per day"
    )
    
    late_arrival_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Grace period for late arrivals in minutes"
    )
    
    # Payroll Settings
    payroll_currency = models.CharField(
        max_length=3,
        default='USD',
        help_text="Currency code for payroll (e.g., USD, NGN, GBP)"
    )
    
    payroll_frequency = models.CharField(
        max_length=20,
        choices=[
            ('monthly', 'Monthly'),
            ('bi_weekly', 'Bi-Weekly'),
            ('weekly', 'Weekly'),
        ],
        default='monthly',
        help_text="Default payroll frequency"
    )
    
    tax_rate_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Default tax rate percentage"
    )
    
    enable_overtime_calculation = models.BooleanField(
        default=True,
        help_text="Calculate overtime pay"
    )
    
    overtime_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('1.50'),
        validators=[MinValueValidator(Decimal('1.00'))],
        help_text="Overtime pay multiplier (e.g., 1.5 for time-and-a-half)"
    )
    
    # Workflow References (linking to existing WorkflowTemplate system)
    default_leave_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hr_leave_configs',
        help_text="Default workflow for leave requests"
    )
    
    extended_leave_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hr_extended_leave_configs',
        help_text="Workflow for extended leave requests (> max_consecutive_leave_days)"
    )
    
    payroll_approval_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hr_payroll_configs',
        help_text="Workflow for payroll approval"
    )
    
    # Payslip Settings
    payslip_prefix = models.CharField(
        max_length=10,
        default='PAY',
        help_text="Prefix for payslip numbers"
    )
    
    payslip_current_number = models.PositiveIntegerField(
        default=1,
        help_text="Current payslip number for auto-generation"
    )

    # ── Staff ID Settings ─────────────────────────────────────────────────────
    staff_id_prefix = models.CharField(
        max_length=10,
        default='STF',
        help_text="Branch-specific prefix for staff IDs (e.g. MML → MML001)"
    )

    staff_id_padding = models.PositiveSmallIntegerField(
        default=3,
        help_text="Zero-pad width for the numeric part (3 → 001, 4 → 0001)"
    )

    staff_id_current_number = models.PositiveIntegerField(
        default=1,
        help_text="Next sequential number to issue; incremented on each staff creation"
    )

    # ── Pension Settings ──────────────────────────────────────────────────────
    enable_pension = models.BooleanField(
        default=True,
        help_text="Enable pension deduction and employer contribution for this branch"
    )

    employee_pension_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('8.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Employee pension contribution rate as % of gross salary (standard: 8%)"
    )

    employer_pension_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('10.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Employer pension contribution rate as % of gross salary (standard: 10%)"
    )

    pension_provider_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of the pension fund / provider"
    )

    # ── PAYE / Tax Settings ───────────────────────────────────────────────────
    enable_paye = models.BooleanField(
        default=True,
        help_text="Enable automatic PAYE tax calculation using the Nigerian Tax Act 2024 bands"
    )

    # ── Development Levy (Nigeria Tax Act 2024 — Third Schedule, Part II) ─────
    enable_development_levy = models.BooleanField(
        default=True,
        help_text="Deduct the annual Development Levy per employee (NTA 2024)"
    )

    development_levy_annual_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('1000.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Annual Development Levy per employee in local currency (standard: ₦1,000/year)"
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        verbose_name = 'HR Configuration'
        verbose_name_plural = 'HR Configurations'
        unique_together = [('tenant', 'owner', 'branch')]  # One config per tenant/owner/branch combination
    
    def __str__(self):
        return f"HR Config - {self.branch.name if self.branch else 'Unknown'}"
    
    @classmethod
    def get_for_branch(cls, branch):
        """
        Get or create HR config for a specific branch.
        Handles duplicate rows gracefully by keeping the oldest record
        and deleting any extras.

        Args:
            branch: Branch instance

        Returns:
            HRConfig instance
        """
        defaults = {
            'enable_leave_approval': True,
            'max_consecutive_leave_days': 14,
            'annual_leave_days': 20,
            'sick_leave_days': 10,
            'enable_attendance_tracking': True,
            'working_hours_per_day': Decimal('8.00'),
            'late_arrival_grace_minutes': 15,
            'payroll_currency': 'USD',
            'payroll_frequency': 'monthly',
            'tax_rate_percentage': Decimal('0.00'),
            'enable_overtime_calculation': True,
            'overtime_multiplier': Decimal('1.50'),
            'payslip_prefix': 'PAY',
            'payslip_current_number': 1,
            'staff_id_prefix': 'STF',
            'staff_id_padding': 3,
            'staff_id_current_number': 1,
            'enable_pension': True,
            'employee_pension_rate': Decimal('8.00'),
            'employer_pension_rate': Decimal('10.00'),
            'enable_paye': True,
            'enable_development_levy': True,
            'development_levy_annual_amount': Decimal('1000.00'),
        }

        qs = cls.objects.filter(branch=branch).order_by('id')
        count = qs.count()

        if count == 0:
            # No config yet — create one
            return cls.objects.create(branch=branch, **defaults)

        config = qs.first()

        if count > 1:
            # Deduplicate: keep the oldest (lowest pk), delete the rest
            qs.exclude(pk=config.pk).delete()

        return config
    
    def get_workflow_for_leave(self, num_days):
        """
        Smart routing: Return appropriate workflow based on leave duration
        
        Args:
            num_days: Number of leave days requested
            
        Returns:
            WorkflowTemplate or None
        """
        if num_days > self.max_consecutive_leave_days and self.extended_leave_workflow:
            return self.extended_leave_workflow
        return self.default_leave_workflow
    
    def get_next_payslip_number(self):
        """Generate next payslip number"""
        number = f"{self.payslip_prefix}{str(self.payslip_current_number).zfill(6)}"
        self.payslip_current_number += 1
        self.save(update_fields=['payslip_current_number'])
        return number

    def get_next_staff_id(self):
        """
        Generate next staff ID using branch-configured prefix and sequential counter.
        Thread-safe via select_for_update pattern.

        Example: prefix=MML, padding=3, current=1  →  MML001
        """
        from django.db import transaction as db_transaction
        with db_transaction.atomic():
            # Re-fetch with a row lock to avoid race conditions
            config = HRConfig.objects.select_for_update().get(pk=self.pk)
            staff_id = f"{config.staff_id_prefix}{str(config.staff_id_current_number).zfill(config.staff_id_padding)}"
            config.staff_id_current_number += 1
            config.save(update_fields=['staff_id_current_number'])
        return staff_id

    def calculate_employee_pension(self, gross_amount):
        """Calculate employee pension contribution (default 8% of gross)"""
        if not self.enable_pension:
            return Decimal('0.00')
        return (gross_amount * self.employee_pension_rate / Decimal('100.00')).quantize(
            Decimal('0.01')
        )

    def calculate_employer_pension(self, gross_amount):
        """Calculate employer pension contribution (default 10% of gross)"""
        if not self.enable_pension:
            return Decimal('0.00')
        return (gross_amount * self.employer_pension_rate / Decimal('100.00')).quantize(
            Decimal('0.01')
        )

    def calculate_development_levy(self):
        """
        Monthly Development Levy deduction per employee.

        Nigeria Tax Act 2024 (Third Schedule, Part II) prescribes a flat
        annual Development Levy (₦1,000/year by default).  Monthly slice = annual ÷ 12.

        Returns Decimal('0.00') when the feature is disabled.
        """
        if not self.enable_development_levy:
            return Decimal('0.00')
        return (self.development_levy_annual_amount / Decimal('12')).quantize(Decimal('0.01'))

    # ── Nigerian PAYE Tax Bands (Personal Income Tax Act as amended) ──────────
    # The bands apply to ANNUAL taxable income.
    # Monthly PAYE = annual_paye / 12
    PAYE_BANDS = [
        # (upper_limit_inclusive,  rate_percent,  label)
        (Decimal('800000'),    Decimal('0'),   'First ₦800,000'),
        (Decimal('3000000'),   Decimal('15'),  'Next ₦2,200,000 @ 15%'),
        (Decimal('12000000'),  Decimal('18'),  'Next ₦9,000,000 @ 18%'),
        (Decimal('25000000'),  Decimal('21'),  'Next ₦13,000,000 @ 21%'),
        (Decimal('50000000'),  Decimal('23'),  'Next ₦25,000,000 @ 23%'),
        (None,                 Decimal('25'),  'Balance @ 25%'),
    ]

    @classmethod
    def compute_annual_paye(cls, annual_taxable_income: Decimal):
        """
        Compute annual PAYE tax using Nigerian tiered tax bands.

        Args:
            annual_taxable_income: Annual taxable income in Naira

        Returns:
            Tuple(annual_tax: Decimal, breakdown: list[dict])
            breakdown contains one dict per band:
              {band, rate, amount_in_band, tax_in_band, cumulative_balance}
        """
        income = max(Decimal('0.00'), annual_taxable_income)
        remaining = income
        total_tax = Decimal('0.00')
        prev_limit = Decimal('0.00')
        breakdown = []

        for (upper, rate, label) in cls.PAYE_BANDS:
            if remaining <= 0:
                breakdown.append({
                    'band': label,
                    'rate': rate,
                    'amount_in_band': Decimal('0'),
                    'tax_in_band': Decimal('0'),
                    'cumulative_balance': (income - prev_limit) if upper is None else max(Decimal('0'), income - upper),
                })
                continue

            if upper is None:
                # Final band: everything remaining
                band_size = remaining
            else:
                band_limit = upper - prev_limit
                band_size = min(remaining, band_limit)

            tax_in_band = (band_size * rate / Decimal('100')).quantize(Decimal('0.01'))
            total_tax += tax_in_band
            remaining -= band_size

            breakdown.append({
                'band': label,
                'rate': rate,
                'amount_in_band': band_size,
                'tax_in_band': tax_in_band,
                'cumulative_balance': remaining,
            })

            if upper is not None:
                prev_limit = upper

            if upper is None or remaining <= 0:
                break

        return total_tax.quantize(Decimal('0.01')), breakdown

    def calculate_tax(self, taxable_monthly_income: Decimal, employee_pension: Decimal = Decimal('0.00')):
        """
        Calculate monthly PAYE deduction using the tiered tax-band system with CRA.
        Returns Decimal('0.00') if PAYE is disabled for this branch.
        """
        if not self.enable_paye:
            return Decimal('0.00')
        monthly_paye, _, _ = self.calculate_paye_with_breakdown(taxable_monthly_income, employee_pension)
        return monthly_paye

    def calculate_paye_with_breakdown(
        self,
        taxable_monthly_income: Decimal,
        employee_pension: Decimal = Decimal('0.00'),
    ):
        """
        Calculate monthly PAYE per the Nigeria Tax Act 2025 (effective Jan 2026).

        Steps:
          1. Monthly chargeable = taxable_monthly_income − employee_pension
             (pension contribution is deducted from chargeable income)
          2. Annualise: annual_income = monthly_chargeable × 12
          3. Apply fixed ₦200,000 annual rent/personal relief
          4. Apply progressive tax bands to the remaining annual taxable income
          5. Divide by 12 for the monthly PAYE deduction

        Returns:
            Tuple(monthly_paye: Decimal, annual_taxable_gross: Decimal, breakdown: list[dict])
        """
        if not self.enable_paye:
            return Decimal('0.00'), taxable_monthly_income * Decimal('12'), []

        # Step 1 — deduct pension from monthly chargeable income
        monthly_chargeable = taxable_monthly_income - employee_pension

        # Step 2 — annualise
        annual_income = monthly_chargeable * Decimal('12')

        # Step 3 — fixed ₦200,000 annual rent / personal relief
        FIXED_RELIEF = Decimal('200000.00')
        annual_taxable = max(Decimal('0.00'), annual_income - FIXED_RELIEF)

        annual_paye, breakdown = self.compute_annual_paye(annual_taxable)
        monthly_paye = (annual_paye / Decimal('12')).quantize(Decimal('0.01'))
        return monthly_paye, annual_income, breakdown

    
    def calculate_overtime_pay(self, regular_hourly_rate, overtime_hours):
        """Calculate overtime pay"""
        if not self.enable_overtime_calculation:
            return Decimal('0.00')
        return (regular_hourly_rate * self.overtime_multiplier * overtime_hours).quantize(
            Decimal('0.01')
        )
