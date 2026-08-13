# loans/models.py
"""
Complete loan management system
Integrates with Account hierarchy for proper double-entry bookkeeping
"""
from django.db import models, transaction
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Sum, Q
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from products.models import Product
from clients.models import Client, Guarantor


class LoanProduct(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Loan product configuration
    Links to Product model for general product info
    """
    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name='loan_product_detail',
        limit_choices_to={'product_type': 'LOAN'}
    )
    
    # Parent GL account for this loan product
    parent_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='loan_products',
        limit_choices_to={
            'account_type': Account.LOAN,
            'account_level': Account.LEVEL_PARENT
        },
        help_text="Parent account for all loans of this type"
    )

    # ── GL accounts for journal entries ─────────────────────────────────────
    disbursement_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_disbursed_from',
        limit_choices_to={'account_type': Account.ASSET},
        help_text="Cash/Bank GL account from which loan funds are disbursed"
    )
    interest_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_interest_income',
        limit_choices_to={'account_type': Account.INCOME},
        help_text="Income GL account for interest earned on this loan product"
    )
    fee_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_fee_income',
        limit_choices_to={'account_type': Account.INCOME},
        help_text="Income GL account for processing/admin fees on this loan product"
    )
    penalty_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_penalty_income',
        limit_choices_to={'account_type': Account.INCOME},
        help_text="Income GL account for late payment penalties on this loan product"
    )
    insurance_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_insurance_income',
        limit_choices_to={'account_type': Account.INCOME},
        help_text="Income GL account for insurance premiums collected on this loan product"
    )
    restructure_interest_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_products_restructure_interest_income',
        limit_choices_to={'account_type': Account.INCOME},
        help_text=(
            "Separate income GL account for the incremental interest charged on "
            "term-extension restructures (kept apart from interest_income_account "
            "so restructure revenue can be monitored on its own). Required before "
            "any restructure on this product can be approved."
        )
    )

    # Interest calculation
    INTEREST_CALCULATION_METHODS = [
        ('straight_line', 'Straight Line'),      # primary — equal principal + flat interest each period
        ('flat', 'Flat Rate'),                   # legacy alias for straight_line
        ('reducing_balance', 'Reducing Balance'),
        ('compound', 'Compound Interest'),
    ]
    interest_calculation_method = models.CharField(
        max_length=20,
        choices=INTEREST_CALCULATION_METHODS,
        default='straight_line'
    )
    
    default_interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Annual interest rate percentage"
    )
    
    # Term configuration
    TERM_UNIT_CHOICES = [
        ('days',   'Days'),
        ('weeks',  'Weeks'),
        ('months', 'Months'),
    ]
    term_unit = models.CharField(
        max_length=10,
        choices=TERM_UNIT_CHOICES,
        default='months',
        help_text="Unit in which min/max terms and loan terms are expressed.",
    )
    min_term_months = models.PositiveIntegerField(
        default=1,
        help_text="Minimum term value (in the product's term_unit).",
    )
    max_term_months = models.PositiveIntegerField(
        default=60,
        help_text="Maximum term value (in the product's term_unit).",
    )
    first_repayment_buffer_days = models.PositiveIntegerField(
        default=0,
        help_text=(
            "Extra calendar days added on top of the first naturally-occurring repayment date. "
            "0 = follows normal cadence. E.g. for a weekly loan, a buffer of 7 pushes the first "
            "repayment from day 7 to day 14."
        ),
    )
    
    # Amount limits
    min_loan_amount = models.DecimalField(max_digits=18, decimal_places=2)
    max_loan_amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Repayment configuration
    REPAYMENT_FREQUENCIES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('biweekly', 'Bi-weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
    ]
    allowed_repayment_frequencies = models.JSONField(
        default=list,
        help_text="['monthly', 'weekly']"
    )
    
    # Fees configuration
    processing_fee_type = models.CharField(
        max_length=20,
        choices=[('fixed', 'Fixed Amount'), ('percentage', 'Percentage')],
        default='percentage'
    )
    processing_fee_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    processing_fee_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0
    )

    # Insurance configuration
    insurance_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Insurance premium as percentage of approved loan amount"
    )

    # Late payment penalties
    late_payment_penalty_type = models.CharField(
        max_length=20,
        choices=[('fixed', 'Fixed Amount'), ('percentage', 'Percentage')],
        default='percentage'
    )
    late_payment_penalty = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    grace_period_days = models.PositiveIntegerField(
        default=0,
        help_text="Days after due date before penalty applies"
    )
    
    # Collateral requirements
    requires_collateral = models.BooleanField(default=False)
    collateral_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Percentage of loan amount required as collateral"
    )
    
    # Guarantor requirements
    requires_guarantor = models.BooleanField(default=False)
    min_guarantors = models.PositiveIntegerField(default=0)
    
    # Approval workflow
    requires_approval = models.BooleanField(default=True)
    approval_workflow_code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Code of workflow template for approval process"
    )
    
    # Additional configuration (flexible JSON)
    additional_config = models.JSONField(
        default=dict,
        help_text="Additional product-specific configuration"
    )
    
    # ── CBN provisioning & accrual GL accounts ───────────────────────────
    provision_expense_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_provision_expense',
        help_text='P&L account debited when monthly provision is posted (EXPENSE type).',
    )
    allowance_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_allowance',
        help_text='Balance-sheet contra-asset credited when monthly provision is posted.',
    )
    interest_suspense_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_interest_suspense',
        help_text='Account used to park suspended interest on NPL loans.',
    )
    accrued_interest_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_accrued_interest',
        help_text=(
            'ASSET account for interest receivable — debited when an installment\'s '
            'interest is recognized as earned (due date reached), credited when that '
            'interest is actually collected. Only used when unearned_interest_income_account '
            'is also configured.'
        ),
    )
    unearned_interest_income_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_unearned_interest',
        help_text=(
            'LIABILITY account for deferred/unearned interest income. Credited at '
            'disbursement for the full scheduled interest (Interest Income is credited '
            'in full at the same time and stays permanent); debited as each installment '
            'is recognized as earned. Carries a debit (negative) balance between '
            'disbursement and full recognition — this is expected. Leave blank to keep '
            'the legacy behavior of crediting interest_income_account only at payment time.'
        ),
    )
    interest_writeoff_expense_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='loan_products_interest_writeoff_expense',
        help_text=(
            'EXPENSE account debited when a loan is written off with remaining '
            'unrecognized unearned interest — recognizes that permanently-booked '
            'income will never be collected.'
        ),
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['product__name']

    def __str__(self):
        return f"{self.product.name}"
    
    def calculate_processing_fee(self, loan_amount: Decimal) -> Decimal:
        """Calculate processing fee for given loan amount"""
        if self.processing_fee_type == 'fixed':
            return self.processing_fee_amount
        else:  # percentage
            return (loan_amount * self.processing_fee_percentage) / 100

    def calculate_insurance(self, loan_amount: Decimal) -> Decimal:
        """Calculate insurance premium for given loan amount."""
        return (loan_amount * self.insurance_rate) / 100

    # Days per repayment period, used to convert days-late into periods-late
    # for penalty assessment — a percentage penalty is charged once per missed
    # repayment period (e.g. once per week for a weekly loan, once per month
    # for a monthly loan), not once per calendar day.
    _PERIOD_DAYS = {
        'daily': 1,
        'weekly': 7,
        'biweekly': 14,
        'monthly': 30,
        'quarterly': 90,
    }

    def calculate_late_penalty(
        self, outstanding_amount: Decimal, days_late: int, repayment_frequency: str = None
    ) -> Decimal:
        """Calculate late payment penalty"""
        if days_late <= self.grace_period_days:
            return Decimal('0.00')

        if self.late_payment_penalty_type == 'fixed':
            return self.late_payment_penalty
        else:  # percentage, charged once per missed repayment period
            period_days = self._PERIOD_DAYS.get(repayment_frequency or 'monthly', 30)
            periods_late = max(1, days_late // period_days)
            # Quantized here so identical inputs (same periods_late, same
            # outstanding_amount) always yield an identical, already-rounded
            # result — otherwise comparing this fresh unrounded value against
            # the previously-stored 2dp penalty_due produces a phantom ±0.01
            # "delta" purely from rounding, on every day between period
            # boundaries where nothing actually changed.
            return (
                (outstanding_amount * self.late_payment_penalty * periods_late) / 100
            ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class LoanAccount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual loan account
    Each loan gets its own child Account under the product's parent account
    """
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='loan_accounts'
    )
    
    product = models.ForeignKey(
        LoanProduct,
        on_delete=models.PROTECT,
        related_name='loan_accounts'
    )
    
    # Link to child account in Account hierarchy
    account = models.OneToOneField(
        Account,
        on_delete=models.PROTECT,
        limit_choices_to={
            'account_type': Account.LOAN,
            'account_level': Account.LEVEL_CHILD
        },
        related_name='loan_account_detail'
    )
    
    # Loan identification
    loan_number = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Application details
    application_date = models.DateField(default=timezone.now)
    application_notes = models.TextField(blank=True)
    
    # Loan amounts
    requested_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount requested by client"
    )
    approved_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount approved (may differ from requested)"
    )
    disbursed_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Actual amount disbursed"
    )
    
    # Interest and fees
    interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Annual interest rate percentage"
    )
    processing_fee = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    insurance_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Insurance premium charged at approval (% of approved amount)"
    )

    # Term
    term_months = models.PositiveIntegerField(
        help_text="Term value — interpret using term_unit (e.g. 23 weeks, 6 months, 50 days)."
    )
    term_unit = models.CharField(
        max_length=10,
        choices=LoanProduct.TERM_UNIT_CHOICES,
        default='months',
        help_text="Unit in which term_months is expressed.",
    )
    repayment_frequency = models.CharField(
        max_length=20,
        choices=LoanProduct.REPAYMENT_FREQUENCIES,
        default='monthly'
    )
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('disbursed', 'Disbursed'),
        ('active', 'Active'),
        ('paid_off', 'Fully Paid'),
        ('defaulted', 'Defaulted'),
        ('written_off', 'Written Off'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    rejection_reason = models.TextField(blank=True)

    # Important dates
    approval_date = models.DateField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_loans'
    )
    
    disbursement_date = models.DateField(null=True, blank=True)
    original_disbursement_date = models.DateField(
        null=True, blank=True,
        help_text=(
            "Set once, at the loan's first disburse() and never touched again. "
            "disbursement_date itself gets overwritten on restructure() (it marks "
            "the current repayment cycle's start), so vintage/cohort reporting "
            "should key off this field instead."
        ),
    )
    first_payment_date = models.DateField(null=True, blank=True)
    maturity_date = models.DateField(null=True, blank=True)
    closed_date = models.DateField(null=True, blank=True)
    
    # Outstanding balances (calculated fields)
    outstanding_principal = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    outstanding_interest = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    outstanding_fees = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    outstanding_penalties = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Payment tracking
    total_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    principal_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    interest_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    fees_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    penalties_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Schedule information
    installment_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Regular installment amount"
    )
    number_of_installments = models.PositiveIntegerField(default=0)
    installments_paid = models.PositiveIntegerField(default=0)
    
    # Arrears tracking
    days_in_arrears = models.PositiveIntegerField(default=0)
    arrears_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    
    # Risk classification
    RISK_CLASSIFICATION = [
        ('performing', 'Performing'),
        ('watch', 'Watch'),
        ('substandard', 'Substandard'),
        ('doubtful', 'Doubtful'),
        ('loss', 'Loss'),
    ]
    risk_classification = models.CharField(
        max_length=20,
        choices=RISK_CLASSIFICATION,
        default='performing'
    )
    
    # GL journal entry for the disbursement (one per loan)
    disbursement_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='loan_disbursements',
        help_text="Journal entry created when this loan was disbursed"
    )
    
    # Metadata
    metadata = models.JSONField(
        default=dict,
        help_text="Additional loan-specific data"
    )

    # ── Java App 1 (Loan Portfolio Batch Processor) integration ───────────────
    last_batch_processed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last accrual/arrears batch run by the Java batch processor"
    )
    batch_accrual_posted = models.BooleanField(
        default=False,
        help_text="True when the current period's accrual journal entry has been posted by the batch processor"
    )

    # ── CBN compliance fields (migration 0012) ────────────────────────────
    interest_suspended = models.BooleanField(
        default=False,
        help_text='True when interest accrual is suspended per CBN NPL rules (90+ DPD).',
    )
    interest_suspended_at = models.DateField(
        null=True, blank=True,
        help_text='Date interest was first suspended on this loan.',
    )
    provision_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('1.00'),
        help_text='CBN provision rate currently applied (%), updated by daily batch.',
    )
    provision_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Required provision in Naira (provision_pct × outstanding_principal).',
    )

    # ── Deferred/unearned interest income (set once at disbursement) ──────
    # NOTE: not the default going-forward behavior (see interest_recognized_at_disbursement
    # below) — kept available but unused as of this field's introduction.
    interest_deferral_active = models.BooleanField(
        default=False,
        help_text=(
            'True if this loan was disbursed while its product had the deferred/unearned '
            'interest income accounts configured — permanently locks this loan onto the '
            'new GL flow regardless of later product reconfiguration.'
        ),
    )

    # ── Interest recognized in full at disbursement (default behavior) ─────
    # Matches how the legacy system recognized interest: fully and permanently at
    # disbursement, with repayments afterward being a pure Bank <-> Loan Receivable
    # transaction that never touches Interest Income again. Set once inside disburse()
    # and never re-evaluated from live product config afterward, so reconfiguring a
    # product never retroactively changes how an already-disbursed loan's payments post.
    interest_recognized_at_disbursement = models.BooleanField(
        default=False,
        help_text=(
            'True if this loan\'s full interest was credited to Interest Income at '
            'disbursement (the default when the product has interest_income_account '
            'configured and is not using the deferred/unearned compromise). '
            'record_payment() then collects the interest portion straight against the '
            'Loan Receivable instead of crediting Income again.'
        ),
    )

    # ── Penalty accrued on assessment, not on payment (set the first time an ──
    # accrual entry is posted for this loan — see update_loan_status.py). Once
    # True, permanently locks this loan onto the accrual GL flow regardless of
    # later product reconfiguration, same reasoning as interest_deferral_active.
    penalty_accrual_active = models.BooleanField(
        default=False,
        help_text=(
            'True once this loan has had at least one late-payment penalty '
            'recognized as income at assessment time (Dr. Loan Receivable / '
            'Cr. Penalty Income — see update_loan_status.py), instead of at '
            'payment time. record_payment() then collects the penalty portion '
            'straight against the Loan Receivable instead of crediting Income '
            'again, since it was already booked when the penalty accrued.'
        ),
    )

    # ── Origin (audit/reporting only — does not gate any GL/posting logic) ─
    ORIGIN_NATIVE = 'native'
    ORIGIN_LEGACY_IMPORT = 'legacy_import'
    ORIGIN_CHOICES = [
        (ORIGIN_NATIVE, 'Originated in Phoenix'),
        (ORIGIN_LEGACY_IMPORT, 'Imported from legacy system'),
    ]
    origin = models.CharField(
        max_length=20,
        choices=ORIGIN_CHOICES,
        default=ORIGIN_NATIVE,
        help_text=(
            'Where this loan record came from. Purely informational for portfolio '
            'reporting/audits — does not affect GL posting behavior, which is already '
            'determined by interest_deferral_active and by whether the loan ever goes '
            'through disburse().'
        ),
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['-application_date']
        indexes = [
            models.Index(fields=['loan_number']),
            models.Index(fields=['status']),
            models.Index(fields=['client', 'status']),
        ]
    
    def __str__(self):
        return f"{self.loan_number} - {self.client.full_name}"
    
    @property
    def total_outstanding(self) -> Decimal:
        """Total amount outstanding"""
        return (
            self.outstanding_principal +
            self.outstanding_interest +
            self.outstanding_fees +
            self.outstanding_penalties
        )

    @property
    def total_charges(self) -> Decimal:
        """Total upfront charges at approval: processing fee + insurance."""
        return self.processing_fee + self.insurance_amount

    @property
    def is_in_arrears(self) -> bool:
        """Check if loan is in arrears"""
        return self.days_in_arrears > 0
    
    def clean(self):
        """Validate loan data"""
        if self.approved_amount and self.requested_amount:
            if self.approved_amount > self.product.max_loan_amount:
                raise ValidationError('Approved amount exceeds product maximum')
            if self.approved_amount < self.product.min_loan_amount:
                raise ValidationError('Approved amount below product minimum')
        
        if self.term_months and self.product_id:
            # Both the loan and the product express their term in the same unit
            # (product.term_unit). Validate the raw value directly.
            prod_term_unit = getattr(self.product, 'term_unit', 'months')
            loan_term_unit = getattr(self, 'term_unit', 'months')
            if loan_term_unit == prod_term_unit:
                if self.term_months > self.product.max_term_months:
                    raise ValidationError(
                        f'Term exceeds product maximum ({self.product.max_term_months} {prod_term_unit})'
                    )
                if self.term_months < self.product.min_term_months:
                    raise ValidationError(
                        f'Term is below product minimum ({self.product.min_term_months} {prod_term_unit})'
                    )
            # If units differ, skip validation (uncommon — product admin misconfiguration)

        # Prevent duplicate active loans for the same client + product
        _TERMINAL = {'paid_off', 'written_off', 'rejected', 'cancelled'}
        current_status = getattr(self, 'status', None) or 'pending'
        if self.client_id and self.product_id and not self.is_deleted and current_status not in _TERMINAL:
            dup_qs = LoanAccount.objects.filter(
                client_id=self.client_id,
                product_id=self.product_id,
            ).exclude(status__in=list(_TERMINAL)).exclude(pk=self.pk)
            if dup_qs.exists():
                raise ValidationError(
                    {'product': 'This client already has an active loan account for this product.'}
                )
    
    @transaction.atomic
    def approve(self, user, approved_amount: Decimal = None):
        """Approve loan application"""
        if self.status != 'pending':
            raise ValidationError("Only pending loans can be approved")

        # Guarantor requirement: block approval if product requires guarantors
        if self.product.requires_guarantor:
            min_required = self.product.min_guarantors or 1
            linked = self.guarantors.filter(status__in=['pending', 'approved']).count()
            if linked < min_required:
                raise ValidationError(
                    f"This loan product requires at least {min_required} guarantor(s) before approval. "
                    f"{linked} guarantor(s) are currently linked. "
                    "Please add the required guarantors first."
                )

        # Maker-checker: the person who created the loan cannot approve it
        if self.created_by_id and user.pk == self.created_by_id:
            raise ValidationError(
                "The person who submitted this loan application cannot also approve it "
                "(maker-checker violation)."
            )
        if self.owner_id and user.pk == self.owner_id and not self.created_by_id:
            raise ValidationError(
                "The person who owns/submitted this loan application cannot also approve it "
                "(maker-checker violation)."
            )

        self.status = 'approved'
        self.approval_date = timezone.now().date()
        self.approved_by = user

        if approved_amount:
            self.approved_amount = approved_amount
        else:
            self.approved_amount = self.requested_amount

        # Only use old-style product-level fee fields when no LoanProductFee rows
        # are configured for this product.  If the new per-line fee system is in
        # use, those rows post their own GL entries via apply_loan_fees() in the
        # view, so computing processing_fee/insurance_amount here would double-count.
        has_new_fee_lines = self.product.fee_lines.filter(is_active=True).exists()
        if has_new_fee_lines:
            self.processing_fee = Decimal('0.00')
            self.insurance_amount = Decimal('0.00')
            self.outstanding_fees = Decimal('0.00')
        else:
            self.processing_fee = self.product.calculate_processing_fee(self.approved_amount)
            self.insurance_amount = self.product.calculate_insurance(self.approved_amount)
            self.outstanding_fees = self.processing_fee + self.insurance_amount

        self.save()

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_APPROVE,
            acted_by=user,
            record_type='LoanAccount',
            record_id=str(self.pk),
            amount=self.approved_amount,
            description=f'Loan {self.loan_number} approved',
            extra={'loan_number': self.loan_number, 'client_id': str(self.client_id)},
        )
    
    @transaction.atomic
    def disburse(self, disbursement_date=None, disbursement_account=None, disbursed_by=None):
        """
        Disburse loan and create the corresponding GL journal entry.

        GL entry (LN-DISB series):
            Dr. Loan Receivable (self.account)   — ASSET goes up, we are owed money
            Cr. Cash / Bank (disbursement_account) — ASSET goes down, cash leaves

            If the product has interest_income_account configured (the default, and
            how the legacy system recognized interest), two more lines book the full
            scheduled interest permanently into Interest Income, added onto the Loan
            Receivable debit so it totals principal+interest:
            Dr. Loan Receivable (interest portion, in addition to the principal above)
            Cr. Interest Income (permanent — see interest_recognized_at_disbursement)

            If the product ALSO has unearned_interest_income_account and
            accrued_interest_account configured, the deferred/unearned compromise is
            used instead (see LoanProduct.unearned_interest_income_account) — not the
            default, kept available but unused unless deliberately configured:
            Dr. Unearned Interest Income (liability, goes negative until earned)
            Cr. Interest Income (permanent, client-visible from day one)

        Args:
            disbursement_date: Date of disbursement (defaults to today).
            disbursement_account: The Cash/Bank GL Account the funds come from.
                Falls back to self.product.disbursement_account when not supplied.
            disbursed_by: The User performing the disbursement (used as created_by
                on the journal entry; falls back to self.approved_by).
        """
        if self.status != 'approved':
            raise ValidationError("Only approved loans can be disbursed")

        # ── Resolve disbursement account ─────────────────────────────────
        cash_account = disbursement_account or self.product.disbursement_account
        if not cash_account:
            raise ValidationError(
                "A disbursement_account is required. Either pass one directly or "
                "configure disbursement_account on the Loan Product."
            )

        # Accept a BankAccount instance — unwrap to its linked GL Account.
        from banks.models import BankAccount as _BankAccount
        if isinstance(cash_account, _BankAccount):
            try:
                cash_account = cash_account.gl_account
            except Exception:
                raise ValidationError(
                    "The selected bank account has no linked GL account. "
                    "Please link a GL account to the bank account first."
                )
        if not cash_account:
            raise ValidationError(
                "The selected bank account has no linked GL account."
            )

        self.status = 'disbursed'
        self.disbursement_date = disbursement_date or timezone.now().date()
        self.original_disbursement_date = self.disbursement_date
        self.disbursed_amount = self.approved_amount

        # Set outstanding principal
        self.outstanding_principal = self.disbursed_amount

        # Calculate repayment schedule (calls self.save() internally)
        self._generate_repayment_schedule()

        # Set outstanding interest from schedule totals
        total_interest = self.repayment_schedule.aggregate(
            total=Sum('interest_due')
        )['total'] or Decimal('0')
        self.outstanding_interest = total_interest

        # Set first payment and maturity dates
        if self.repayment_schedule.exists():
            first_schedule = self.repayment_schedule.first()
            last_schedule = self.repayment_schedule.last()
            self.first_payment_date = first_schedule.due_date
            self.maturity_date = last_schedule.due_date

        # ── GL Journal Entry ─────────────────────────────────────────────
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='LNDIS',
            defaults={'description': 'Loan Disbursements'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.disbursement_date,
            description=f"Loan disbursement – {self.loan_number}",
            workflow_reference=f"DISB-{self.loan_number}",
            owner=self.owner,
            branch=self.branch,
            created_by=disbursed_by or self.approved_by,
            tenant=self.tenant,
        )

        # Debit: Loan Receivable (LOAN/ASSET type) — balance INCREASES
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.account,
            side=JournalEntryLine.DEBIT,
            amount=self.disbursed_amount,
        )

        # Credit: Cash / Bank account (ASSET type) — balance DECREASES
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cash_account,
            side=JournalEntryLine.CREDIT,
            amount=self.disbursed_amount,
        )

        # ── Interest recognition at disbursement ────────────────────────────
        # Two mutually exclusive options, both opt-in via product GL config:
        #
        # 1. Deferred/unearned compromise (see LoanProduct.unearned_interest_income_account
        #    help_text) — books the full interest into Income immediately and
        #    permanently, offset by a liability that carries a debit (negative)
        #    balance until recognized. Not the default; kept available but unused
        #    unless a product has all three deferral accounts configured.
        #
        # 2. Default — recognizes the full interest in Income immediately and
        #    permanently too, but with NO deferral: it's added straight onto the
        #    Loan Receivable debit (so the receivable totals principal+interest),
        #    matching how the legacy system recognized interest at disbursement.
        #    record_payment() then treats the interest portion as a plain
        #    receivable reduction (see record_payment()'s interest_account branch).
        unearned_account = self.product.unearned_interest_income_account
        interest_income_account = self.product.interest_income_account
        interest_receivable_account = self.product.accrued_interest_account
        if unearned_account and interest_income_account and interest_receivable_account and total_interest > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=unearned_account,
                side=JournalEntryLine.DEBIT,
                amount=total_interest,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=interest_income_account,
                side=JournalEntryLine.CREDIT,
                amount=total_interest,
            )
            self.interest_deferral_active = True
        elif interest_income_account and total_interest > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.account,
                side=JournalEntryLine.DEBIT,
                amount=total_interest,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=interest_income_account,
                side=JournalEntryLine.CREDIT,
                amount=total_interest,
            )
            self.interest_recognized_at_disbursement = True

        journal_entry.post()

        self.disbursement_journal_entry = journal_entry
        self.status = 'active'
        self.save()

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_DISBURSE,
            acted_by=disbursed_by or self.approved_by,
            record_type='LoanAccount',
            record_id=str(self.pk),
            amount=self.disbursed_amount,
            description=f'Loan {self.loan_number} disbursed',
            extra={'loan_number': self.loan_number, 'client_id': str(self.client_id),
                   'journal_entry_id': str(journal_entry.pk)},
        )

    def _generate_repayment_schedule(self, principal_override=None):
        """Delegate schedule generation to RepaymentScheduleService."""
        from .schedule_service import RepaymentScheduleService
        RepaymentScheduleService.generate(self, principal_override=principal_override)
    
    @transaction.atomic
    def record_payment(self, amount: Decimal, payment_date=None,
                       payment_account=None, received_by=None,
                       spillover_savings_account=None, spillover_amount=None,
                       bank_reference=None):
        """
        Record a loan repayment and create the corresponding GL journal entry.

        When spillover_savings_account and spillover_amount are provided the excess
        is included in the SAME journal entry as a third credit line so that the
        cashier's cash account is debited only once for the total amount received:

            Dr. Cash / Bank (payment_account)         — total received (amount + spillover)
            Cr. Loan Receivable / Income accounts     — loan portion
            Cr. Member Savings (spillover GL account) — excess credited to savings

        The penalty balance is no longer collected in full before anything
        else. Instead, each payment is split between the penalty balance and
        the principal/interest/fees balance in proportion to each one's
        share of total_outstanding — so a client behind on penalties isn't
        forced to clear 100% of the penalty before a cent goes toward their
        loan balance. A full payoff still clears both in full (the ratio
        collapses to exactly outstanding_penalties : everything else).
        Within the non-penalty share, installments are applied in due-date
        order, interest → fees → principal (see below for the NPL override).

        GL entry (LN-PMT series):
            Dr. Cash / Bank (payment_account)         — ASSET goes up, money received
            Cr. Loan Receivable (self.account)         — LOAN/ASSET goes down (principal)
            Cr. Interest Income (interest_income_acct) — INCOME goes up
            Cr. Fee Income (fee_income_acct)           — INCOME goes up
            Cr. Penalty Income (penalty_income_acct)   — INCOME goes up (only when
                penalty_accrual_active is False — see below)

        When an income account is not configured on the Loan Product the
        corresponding amount is credited to the Loan Receivable account instead
        (conservative fallback that keeps the transaction balanced).

        When interest_recognized_at_disbursement is True (the default — see
        disburse()), the interest portion of this payment is folded into the
        Loan Receivable credit instead of touching Income at all — Income was
        already booked in full and permanently at disbursement, so this is a
        plain Bank <-> Loan Receivable reduction, matching the legacy system.
        Penalty is treated the same way whenever penalty_accrual_active is True:
        income was already recognized when the penalty was assessed (accrual
        basis — see update_loan_status.py's LNPEN entries), so the penalty
        portion here folds into the Loan Receivable credit instead of
        re-crediting Penalty Income. Loans that have never had a penalty
        accrued to GL keep the legacy cash-basis behavior below.

        When interest_deferral_active is True instead (see disburse()), the interest
        credit line above targets accrued_interest_account (Interest Receivable)
        instead of interest_income_account — Income was already booked in full
        at disbursement. If this payment fully closes the loan before every
        installment's due date has passed, any remaining unrecognized interest
        is caught up and recognized in a companion journal entry (LNACC series).

        Args:
            amount: Total payment amount received.
            payment_date: Date of payment (defaults to today).
            payment_account: The Cash/Bank GL Account that received the payment.
            received_by: The User recording the payment (used as created_by on
                the journal entry).
            bank_reference: Optional cashier-entered bank transfer / mobile money
                reference, appended to the journal description for reconciliation.

        Raises:
            ValidationError: if the loan is not active/disbursed, if no
                payment_account is provided, or if amount exceeds total outstanding.
        """
        # Lock this loan row for the duration of the transaction so two
        # overlapping repayment postings (double-submit, retried request,
        # concurrent collection-sheet items) can never race: without this,
        # both could read the same "next pending" schedule row and the same
        # starting balances, each independently believe they filled it, and
        # the loan's aggregate totals (self.total_paid, outstanding_*) would
        # advance correctly while one schedule installment is silently
        # skipped — the underlying cause of the paid/pending drift this
        # lock closes.
        type(self).objects.select_for_update().get(pk=self.pk)
        self.refresh_from_db()

        if self.status not in ['active', 'disbursed', 'defaulted']:
            raise ValidationError("Cannot record payment for inactive loan")

        if not payment_account:
            raise ValidationError(
                "payment_account is required. Pass the Cash/Bank GL account "
                "that received this payment."
            )

        total_outstanding = self.total_outstanding
        if amount > total_outstanding:
            raise ValidationError(
                f"Payment amount ({amount}) exceeds total outstanding ({total_outstanding}). "
                "Record an exact amount or contact the loan officer."
            )

        payment_date = payment_date or timezone.now().date()

        # ── Split the penalty out of the payment proportionally ───────────
        # CBN NPL rule: when interest is suspended (90+ DPD), apply cash to
        # principal first so the loan balance reduces before income is recognised.
        #
        # Penalty used to be taken off the top in full before anything else,
        # which meant a partial payment smaller than the penalty balance
        # posted entirely to Penalty Income with zero principal/interest
        # reduction — confusing on statements and unfair to a client trying
        # to bring a loan current. Instead, share the payment between the
        # penalty balance and everything else (principal+interest+fees) in
        # proportion to their share of total_outstanding. This is exact —
        # not an estimate — because it's derived from the same
        # total_outstanding figure already validated against `amount` above,
        # so a full payoff (amount == total_outstanding) still clears the
        # penalty balance in full, it just isn't privileged over the rest.
        if total_outstanding > 0:
            penalty_payment = (
                amount * self.outstanding_penalties / total_outstanding
            ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        else:
            penalty_payment = Decimal('0.00')
        # Rounding must never manufacture a penalty payment bigger than what's
        # actually owed or bigger than the cash actually received.
        penalty_payment = min(penalty_payment, self.outstanding_penalties, amount)
        self.outstanding_penalties -= penalty_payment
        self.penalties_paid += penalty_payment
        remaining = amount - penalty_payment

        # Interest/fees/principal are allocated against unpaid installments in
        # due-date order — NOT the loan's whole-term aggregate outstanding_*
        # balances. Using the aggregate meant outstanding_interest started as
        # the sum of EVERY future installment's interest, so a single payment
        # got fully absorbed as "interest" for several installments running
        # before any of it was ever recognized as principal collected — real
        # cash sat entirely in Income while outstanding_principal never moved.
        # (Found on LN-20260702-B91A43, 2026-07-15 — confirmed across 6 loans.)
        interest_payment = Decimal('0.00')
        fee_payment = Decimal('0.00')
        principal_payment = Decimal('0.00')

        unpaid_installments = self.repayment_schedule.filter(
            status__in=['pending', 'partial', 'overdue']
        ).order_by('due_date')

        for installment in unpaid_installments:
            if remaining <= 0:
                break
            installment_remaining = installment.total_due - installment.total_paid
            if installment_remaining <= 0:
                continue
            to_apply = min(remaining, installment_remaining)

            if self.interest_suspended:
                # NPL priority: principal → fees → interest
                p = min(to_apply, installment.principal_due - installment.principal_paid)
                f = min(to_apply - p, installment.fees_due - installment.fees_paid)
                i = min(to_apply - p - f, installment.interest_due - installment.interest_paid)
            else:
                # Normal priority: interest → fees → principal
                i = min(to_apply, installment.interest_due - installment.interest_paid)
                f = min(to_apply - i, installment.fees_due - installment.fees_paid)
                p = min(to_apply - i - f, installment.principal_due - installment.principal_paid)

            interest_payment += i
            fee_payment += f
            principal_payment += p
            remaining -= to_apply

        # Defensive fallback: if unpaid installments don't fully absorb the
        # remainder (e.g. schedule/aggregate drift), put it toward principal
        # rather than inventing income.
        principal_payment += remaining
        remaining = Decimal('0.00')

        self.outstanding_interest -= interest_payment
        self.interest_paid += interest_payment
        self.outstanding_fees -= fee_payment
        self.fees_paid += fee_payment
        self.outstanding_principal -= principal_payment
        self.principal_paid += principal_payment

        self.total_paid += amount

        # Restore defaulted loan to active if still has outstanding balance
        if self.status == 'defaulted' and self.total_outstanding > 0:
            self.status = 'active'

        # Check if fully paid
        if self.outstanding_principal == 0 and self.total_outstanding == 0:
            self.status = 'paid_off'
            self.closed_date = payment_date

        # ── GL Journal Entry ─────────────────────────────────────────────
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='LNPMT',
            defaults={'description': 'Loan Repayments'},
        )

        journal_description = f"Loan repayment – {self.loan_number}"
        if bank_reference:
            journal_description += f" | Ref: {bank_reference}"
        journal_description = journal_description[:255]

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=payment_date,
            description=journal_description,
            # workflow_reference is intentionally left None so multiple payments
            # per loan don't violate the unique_together constraint.
            owner=self.owner,
            branch=self.branch,
            created_by=received_by,
            tenant=self.tenant,
        )

        # Debit: Cash received — total collected from client (loan portion + any spillover)
        _spillover_amount = spillover_amount or Decimal('0.00')
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.DEBIT,
            amount=amount + _spillover_amount,
        )

        # ── Credit entries (must collectively equal the debit) ────────────
        # Amounts that lack a dedicated income account are credited to the
        # Loan Receivable account (fallback keeps the transaction balanced).
        # Three ways the interest portion of this payment can be treated,
        # depending on how (or whether) Income was already recognized at
        # disbursement:
        if self.interest_deferral_active and self.product.accrued_interest_account:
            # Deferred/unearned compromise: Income was booked in full at disbursement
            # (net to zero via the liability) — this payment collects against the
            # Interest Receivable account instead of re-crediting Income.
            interest_account = self.product.accrued_interest_account
        elif self.interest_recognized_at_disbursement:
            # Default: Income was already booked in full and permanently at
            # disbursement (see disburse()) — this payment is a plain Bank <-> Loan
            # Receivable reduction, matching the legacy system. `None` here falls
            # through to the "no dedicated income account" fallback below, which
            # folds the amount into loan_account_credit instead of crediting Income.
            interest_account = None
        else:
            # Legacy cash-basis fallback: Income was never recognized at
            # disbursement (e.g. an older loan disbursed before interest_income_account
            # was configured on its product) — recognize it now, as it's collected.
            interest_account = self.product.interest_income_account
        fee_account       = self.product.fee_income_account
        if self.penalty_accrual_active:
            # Income was already booked when the penalty was assessed (see
            # update_loan_status.py) — this payment is a plain Bank <-> Loan
            # Receivable reduction, matching how interest_recognized_at_disbursement
            # is handled above. `None` falls through to the "no dedicated income
            # account" fallback below, folding the amount into loan_account_credit
            # instead of crediting Income again.
            penalty_account = None
        else:
            # Legacy cash-basis fallback: this loan has never had a penalty
            # accrued to GL (e.g. product never had penalty_income_account
            # configured while a penalty was outstanding) — recognize it now,
            # as it's collected.
            penalty_account = self.product.penalty_income_account

        # Principal → always goes to Loan Receivable
        loan_account_credit = principal_payment
        # Unrouted income → fall back to Loan Receivable
        if not interest_account:
            loan_account_credit += interest_payment
        if not fee_account:
            loan_account_credit += fee_payment
        if not penalty_account:
            loan_account_credit += penalty_payment

        if loan_account_credit > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.account,
                side=JournalEntryLine.CREDIT,
                amount=loan_account_credit,
            )

        if interest_account and interest_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=interest_account,
                side=JournalEntryLine.CREDIT,
                amount=interest_payment,
            )

        if fee_account and fee_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=fee_account,
                side=JournalEntryLine.CREDIT,
                amount=fee_payment,
            )

        if penalty_account and penalty_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=penalty_account,
                side=JournalEntryLine.CREDIT,
                amount=penalty_payment,
            )

        # Spillover credit — excess goes straight to the client's savings GL account
        if spillover_savings_account and _spillover_amount > Decimal('0.00'):
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=spillover_savings_account.account,
                side=JournalEntryLine.CREDIT,
                amount=_spillover_amount,
            )

        journal_entry.post()

        self.save()

        # Update schedule and arrears — pass the per-component breakdown so each
        # installment row records the correct principal/interest/fee/penalty split.
        # journal_entry is passed through so each installment touched gets a
        # LoanRepaymentAllocation row - the only record of exactly what this
        # specific payment did, which a future reversal needs to undo it
        # precisely instead of guessing from the aggregate totals.
        self._update_schedule_with_payment(
            amount, payment_date,
            penalty=penalty_payment,
            interest=interest_payment,
            fees=fee_payment,
            principal=principal_payment,
            journal_entry=journal_entry,
        )

        # ── Early-payoff catch-up: recognize any remaining unearned interest ──
        # If this payment closed the loan out before every installment's due
        # date had passed, real cash was still received for all of it — recognize
        # the remainder as earned now instead of leaving it stuck in the
        # liability forever.
        if self.interest_deferral_active and self.status == 'paid_off':
            unrecognized_rows = self.repayment_schedule.filter(
                interest_recognized=False, interest_written_off=False, interest_due__gt=0,
            )
            remaining_unrecognized = unrecognized_rows.aggregate(
                total=Sum('interest_due')
            )['total'] or Decimal('0.00')
            if (remaining_unrecognized > 0
                    and self.product.accrued_interest_account
                    and self.product.unearned_interest_income_account):
                catchup_series, _ = TransactionSeries.objects.get_or_create(
                    code='LNACC',
                    defaults={'description': 'Loan Interest Recognition (earned)'},
                )
                catchup_journal = JournalEntry.objects.create(
                    series=catchup_series,
                    date=payment_date,
                    description=f"Early payoff interest recognition – {self.loan_number}",
                    owner=self.owner,
                    branch=self.branch,
                    created_by=received_by,
                    tenant=self.tenant,
                )
                JournalEntryLine.objects.create(
                    transaction=catchup_journal,
                    account=self.product.accrued_interest_account,
                    side=JournalEntryLine.DEBIT,
                    amount=remaining_unrecognized,
                )
                JournalEntryLine.objects.create(
                    transaction=catchup_journal,
                    account=self.product.unearned_interest_income_account,
                    side=JournalEntryLine.CREDIT,
                    amount=remaining_unrecognized,
                )
                catchup_journal.post()
                unrecognized_rows.update(
                    interest_recognized=True,
                    interest_recognized_at=timezone.now(),
                )

        self._calculate_arrears()

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_REPAY,
            acted_by=received_by or self.approved_by,
            record_type='LoanAccount',
            record_id=str(self.pk),
            amount=amount,
            description=f'Loan repayment on {self.loan_number}',
            extra={
                'loan_number': self.loan_number,
                'client_id': str(self.client_id),
                'principal': str(principal_payment),
                'interest': str(interest_payment),
                'fees': str(fee_payment),
                'penalty': str(penalty_payment),
                'journal_entry_id': str(journal_entry.pk),
                'bank_reference': bank_reference or '',
            },
        )

        # Update savings metadata and audit log for the spillover credit
        if spillover_savings_account and _spillover_amount > Decimal('0.00'):
            spillover_savings_account.last_transaction_date = payment_date or timezone.now().date()
            spillover_savings_account.save(update_fields=['last_transaction_date'])
            log_financial_event(
                FinancialAuditLog.SAVINGS_DEPOSIT,
                acted_by=received_by,
                record_type='SavingsAccount',
                record_id=str(spillover_savings_account.pk),
                amount=_spillover_amount,
                description=f'Loan overpayment credit from {self.loan_number}',
                extra={
                    'savings_account_number': spillover_savings_account.account_number,
                    'loan_number': self.loan_number,
                    'journal_entry_id': str(journal_entry.pk),
                },
            )

        return journal_entry

    def _update_schedule_with_payment(
        self, amount: Decimal, payment_date,
        penalty: Decimal = Decimal('0'),
        interest: Decimal = Decimal('0'),
        fees: Decimal = Decimal('0'),
        principal: Decimal = Decimal('0'),
        journal_entry=None,
    ):
        """
        Apply a payment across schedule installments in due-date order.
        Updates per-component paid fields (principal, interest, fees, penalty)
        using the actual penalty/interest/fees/principal split the caller
        computed (record_payment()'s priority-order allocation against the
        loan's aggregate outstanding_* balances) and records payment_date /
        days_late on fully settled rows.
        """
        remaining = amount
        remaining_penalty = penalty
        remaining_interest = interest
        remaining_fees = fees
        remaining_principal = principal

        schedules = self.repayment_schedule.filter(
            status__in=['pending', 'partial', 'overdue']
        ).order_by('due_date')

        for schedule in schedules:
            if remaining <= 0:
                break

            installment_remaining = schedule.total_due - schedule.total_paid
            payment_to_schedule = min(remaining, installment_remaining)

            # Apply the actual component split against each installment's own
            # remaining due amounts, in the same priority order record_payment()
            # used against the loan's aggregate balances (penalty, interest,
            # fees, principal) — not a proportional-to-due estimate.
            if payment_to_schedule > 0:
                penalty_remaining_due = schedule.penalty_due - schedule.penalty_paid
                penalty_applied = min(remaining_penalty, penalty_remaining_due, payment_to_schedule)
                schedule.penalty_paid = (schedule.penalty_paid + penalty_applied).quantize(Decimal('0.01'))
                remaining_penalty -= penalty_applied

                interest_remaining_due = schedule.interest_due - schedule.interest_paid
                interest_applied = min(remaining_interest, interest_remaining_due, payment_to_schedule - penalty_applied)
                schedule.interest_paid = (schedule.interest_paid + interest_applied).quantize(Decimal('0.01'))
                remaining_interest -= interest_applied

                fees_remaining_due = schedule.fees_due - schedule.fees_paid
                fees_applied = min(remaining_fees, fees_remaining_due, payment_to_schedule - penalty_applied - interest_applied)
                schedule.fees_paid = (schedule.fees_paid + fees_applied).quantize(Decimal('0.01'))
                remaining_fees -= fees_applied

                principal_remaining_due = schedule.principal_due - schedule.principal_paid
                principal_applied = min(
                    remaining_principal, principal_remaining_due,
                    payment_to_schedule - penalty_applied - interest_applied - fees_applied,
                )
                schedule.principal_paid = (schedule.principal_paid + principal_applied).quantize(Decimal('0.01'))
                remaining_principal -= principal_applied

            schedule.total_paid += payment_to_schedule

            if schedule.total_paid >= schedule.total_due:
                schedule.status = 'paid'
                schedule.payment_date = payment_date
                if payment_date and schedule.due_date and payment_date > schedule.due_date:
                    schedule.days_late = (payment_date - schedule.due_date).days
                self.installments_paid += 1
            else:
                schedule.status = 'partial'

            schedule.save()

            if journal_entry is not None and payment_to_schedule > 0:
                LoanRepaymentAllocation.objects.create(
                    loan=self,
                    schedule=schedule,
                    journal_entry=journal_entry,
                    principal_applied=principal_applied,
                    interest_applied=interest_applied,
                    fees_applied=fees_applied,
                    penalty_applied=penalty_applied,
                )

            remaining -= payment_to_schedule

        # Leftover: record_payment()'s aggregate penalty/interest/fees/principal
        # split always lands in full on the loan's outstanding_*/*_paid fields,
        # but the loop above can only mirror it onto installments still in
        # pending/partial/overdue. If the schedule was already exhausted, or
        # a row's own due amounts couldn't absorb its full proportional share
        # (schedule/aggregate drift — see record_payment()'s docstring), some
        # of the split has no installment to land on. Record it against no
        # schedule row rather than letting it vanish untracked, so a reversal
        # can still find it and undo the aggregate-level effect.
        if journal_entry is not None:
            leftover_penalty = max(Decimal('0.00'), remaining_penalty)
            leftover_interest = max(Decimal('0.00'), remaining_interest)
            leftover_fees = max(Decimal('0.00'), remaining_fees)
            leftover_principal = max(Decimal('0.00'), remaining_principal)
            if leftover_penalty or leftover_interest or leftover_fees or leftover_principal:
                LoanRepaymentAllocation.objects.create(
                    loan=self,
                    schedule=None,
                    journal_entry=journal_entry,
                    principal_applied=leftover_principal,
                    interest_applied=leftover_interest,
                    fees_applied=leftover_fees,
                    penalty_applied=leftover_penalty,
                )

    def mark_overdue_installments(self):
        """
        Bulk-update past-due pending/partial installments to 'overdue'.
        Safe to call multiple times — idempotent.
        """
        today = timezone.now().date()
        self.repayment_schedule.filter(
            due_date__lt=today,
            status__in=['pending', 'partial'],
        ).update(status='overdue')

    def _calculate_arrears(self):
        """
        Mark overdue installments then recalculate days_in_arrears and arrears_amount.
        Calls mark_overdue_installments() first so the status filter always includes
        newly-late items even if no payment has been recorded since they fell due.
        """
        self.mark_overdue_installments()

        today = timezone.now().date()
        overdue = self.repayment_schedule.filter(
            due_date__lt=today,
            status__in=['pending', 'partial', 'overdue'],
        )

        if overdue.exists():
            self.arrears_amount = sum(
                s.total_due - s.total_paid for s in overdue
            )
            earliest_overdue = overdue.order_by('due_date').first()
            self.days_in_arrears = (today - earliest_overdue.due_date).days
        else:
            self.arrears_amount = Decimal('0.00')
            self.days_in_arrears = 0

        self.last_batch_processed_at = timezone.now()
        self.save(update_fields=[
            'arrears_amount', 'days_in_arrears', 'last_batch_processed_at', 'updated_at',
        ])

    @transaction.atomic
    def write_off(
        self,
        written_off_by=None,
        provision_account=None,
        notes: str = '',
    ):
        """
        Write off a defaulted or loss-classified loan and post the GL entry.

        GL (LN-WO series):
            Dr. Loan Loss Provision / Bad Debt Expense   (provision_account)
            Cr. Loan Receivable                          (self.account)

            If interest_deferral_active and any schedule interest remains
            unrecognized, a companion pair of lines flushes it out of the
            Unearned Interest Income liability into a real expense (Interest
            Income was already booked permanently at disbursement and can't be
            un-booked):
            Dr. Interest Write-off Expense (interest_writeoff_expense_account)
            Cr. Unearned Interest Income

        Args:
            written_off_by:    The User authorising the write-off.
            provision_account: An Account (usually an EXPENSE type GL account)
                               to debit.  Required.
            notes:             Optional description appended to the journal entry.

        Raises:
            ValidationError: if the loan is not in a write-off-eligible status,
                             if provision_account is not supplied, or if the
                             outstanding principal is already zero.
        """
        if self.status not in ('active', 'defaulted', 'disbursed'):
            raise ValidationError(
                f"Cannot write off a loan with status '{self.status}'. "
                "Only active, disbursed, or defaulted loans can be written off."
            )
        if not provision_account:
            raise ValidationError(
                "A provision/expense account is required for the write-off debit entry."
            )
        write_off_amount = self.outstanding_principal
        if write_off_amount <= 0:
            raise ValidationError(
                "Nothing to write off — outstanding principal is already zero."
            )

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='LNWO',
            defaults={'description': 'Loan Write-offs'},
        )

        description = f"Write-off: {self.loan_number} — {self.client.full_name}"
        if notes:
            description += f" | {notes}"

        journal = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=description,
            workflow_reference=f"WO-{self.loan_number}",
            owner=self.owner,
            branch=self.branch,
            created_by=written_off_by,
            tenant=self.tenant,
        )

        # Dr. Loan Loss Provision / Expense — cost recognised
        JournalEntryLine.objects.create(
            transaction=journal,
            account=provision_account,
            side=JournalEntryLine.DEBIT,
            amount=write_off_amount,
        )
        # Cr. Loan Receivable — asset removed from the books
        JournalEntryLine.objects.create(
            transaction=journal,
            account=self.account,
            side=JournalEntryLine.CREDIT,
            amount=write_off_amount,
        )

        # ── Deferred/unearned interest write-off (opt-in per product) ──────
        # Interest Income was already booked in full and permanently at
        # disbursement — it can't be un-booked. Any interest not yet recognized
        # as earned will never be collected now, so flush it out of the
        # liability into a real expense instead.
        if self.interest_deferral_active:
            unrecognized_rows = self.repayment_schedule.filter(
                interest_recognized=False, interest_written_off=False, interest_due__gt=0,
            )
            remaining_unrecognized = unrecognized_rows.aggregate(
                total=Sum('interest_due')
            )['total'] or Decimal('0.00')
            if (remaining_unrecognized > 0
                    and self.product.interest_writeoff_expense_account
                    and self.product.unearned_interest_income_account):
                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=self.product.interest_writeoff_expense_account,
                    side=JournalEntryLine.DEBIT,
                    amount=remaining_unrecognized,
                )
                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=self.product.unearned_interest_income_account,
                    side=JournalEntryLine.CREDIT,
                    amount=remaining_unrecognized,
                )
                unrecognized_rows.update(interest_written_off=True)

        journal.post()

        # Zero out outstanding balances and move to written_off
        self.status = 'written_off'
        self.closed_date = timezone.now().date()
        self.outstanding_principal = Decimal('0.00')
        self.outstanding_interest  = Decimal('0.00')
        self.outstanding_fees      = Decimal('0.00')
        self.outstanding_penalties = Decimal('0.00')
        self.save()

        return journal

    # ── CBN Compliance helpers ────────────────────────────────────────────

    # CBN Prudential Guidelines: DPD → classification → provision rate
    _CBN_BUCKETS = [
        (0,   0,   'performing',  Decimal('1.00')),
        (1,   29,  'watch',       Decimal('5.00')),
        (30,  89,  'substandard', Decimal('25.00')),
        (90,  179, 'doubtful',    Decimal('50.00')),
        (180, None,'loss',        Decimal('100.00')),
    ]

    def update_risk_classification(self) -> bool:
        """
        Set risk_classification, provision_pct, and provision_amount from
        days_in_arrears using CBN Prudential Guidelines buckets.
        Returns True if classification changed (caller can decide to save).
        """
        dpd = self.days_in_arrears
        classification = 'performing'
        pct = Decimal('1.00')

        for low, high, label, rate in self._CBN_BUCKETS:
            if high is None:
                if dpd >= low:
                    classification, pct = label, rate
                    break
            elif low <= dpd <= high:
                classification, pct = label, rate
                break

        changed = (
            self.risk_classification != classification
            or self.provision_pct != pct
        )
        self.risk_classification = classification
        self.provision_pct = pct
        self.provision_amount = (
            self.outstanding_principal * pct / Decimal('100')
        ).quantize(Decimal('0.01'))
        return changed

    def suspend_interest(self, today=None):
        """
        Suspend interest accrual on this NPL loan (CBN: 90+ DPD).
        Sets the flag; does NOT post a journal entry because under Option A
        (net receivable) no interest has been pre-recognised in the P&L.
        """
        if self.interest_suspended:
            return
        from django.utils import timezone as _tz
        self.interest_suspended = True
        self.interest_suspended_at = today or _tz.now().date()
        self.save(update_fields=['interest_suspended', 'interest_suspended_at', 'updated_at'])

    def reinstate_interest(self):
        """Remove interest suspension when loan cures (drops below 90 DPD)."""
        if not self.interest_suspended:
            return
        self.interest_suspended = False
        self.save(update_fields=['interest_suspended', 'updated_at'])

    @transaction.atomic
    def restructure(
        self,
        new_term: int,
        new_term_unit: str = None,
        effective_date=None,
        restructured_by=None,
        reason: str = '',
        notes: str = '',
    ):
        """
        Restructure a loan onto a new term for its current outstanding
        principal. Same LoanAccount row throughout — no new loan is created.

        The new interest rate is DERIVED, not supplied: it scales
        proportionally from the loan's current contracted rate/term to the
        new term. E.g. 12% over 6 months implies 2%/month; extending to 10
        months implies 20%. That derived total interest, charged on
        outstanding_principal, splits into two GL postings on approval:
          - the portion at the loan's CURRENT rate (12% in the example)
            books to the product's ordinary interest_income_account.
          - the incremental portion caused purely by the term extension (8%
            in the example) books separately to
            LoanProduct.restructure_interest_income_account, so restructure
            revenue can be monitored on its own. Both accounts must be
            configured on the product for any amount they'd need to carry.

        This can be repeated indefinitely: each restructure derives its
        ratio from the loan's CURRENT rate/term — i.e. wherever the last
        restructure (or original disbursement) left it — not the original
        product configuration.

        Any unpaid interest/penalties already on the loan
        (self.outstanding_interest, self.outstanding_penalties) are not
        collected separately — they're folded into the new schedule, spread
        evenly across its installments' interest_due/penalty_due (last row
        absorbs rounding), so the client repays them through the normal
        restructured repayment schedule rather than as a standing side
        balance. The totals themselves are untouched, only where they're
        tracked changes.

        Old pending/overdue installments are cancelled ('restructured').
        A LoanRestructure audit record is created.
        The loan status is set to 'active' and interest suspension cleared.

        Args:
            new_term: New term value (interpreted in new_term_unit).
            new_term_unit: 'days' | 'weeks' | 'months'. Defaults to the
                loan's current term_unit — the rate-derivation ratio assumes
                old and new term are in the same unit, so changing units
                mid-restructure is not supported.
            effective_date: Date the new schedule starts (defaults to today).
            restructured_by: User authorising the restructure.
            reason: Short reason code/label.
            notes: Free-text notes.
        """
        if self.status not in ('active', 'disbursed', 'defaulted', 'overdue'):
            raise ValidationError(
                f"Cannot restructure a loan with status '{self.status}'."
            )
        if self.outstanding_principal <= 0:
            raise ValidationError("Cannot restructure a fully repaid loan.")
        if not self.term_months or self.term_months <= 0:
            raise ValidationError("Loan has no current term to derive a rate from.")

        new_term_unit = new_term_unit or self.term_unit
        if new_term_unit != self.term_unit:
            raise ValidationError(
                f"Cannot change term unit on restructure (loan is in '{self.term_unit}', "
                f"got '{new_term_unit}')."
            )

        from django.utils import timezone as _tz
        effective_date = effective_date or _tz.now().date()

        # ── Derive the new rate proportionally from the CURRENT rate/term ──
        old_rate = self.interest_rate
        old_term = Decimal(str(self.term_months))
        rate_per_unit = old_rate / old_term
        new_rate = (rate_per_unit * Decimal(str(new_term))).quantize(Decimal('0.01'))

        balance = self.outstanding_principal
        total_new_interest = (balance * new_rate / Decimal('100')).quantize(Decimal('0.01'))
        normal_interest_amount = (balance * old_rate / Decimal('100')).quantize(Decimal('0.01'))
        restructure_interest_amount = total_new_interest - normal_interest_amount

        if normal_interest_amount != 0 and not self.product.interest_income_account:
            raise ValidationError(
                "This product has no interest_income_account configured — "
                "required before restructuring loans under it."
            )
        if restructure_interest_amount != 0 and not self.product.restructure_interest_income_account:
            raise ValidationError(
                "This product has no restructure_interest_income_account configured — "
                "required before restructuring loans under it, so restructure "
                "revenue can be monitored separately from ordinary interest."
            )

        carried_interest = self.outstanding_interest
        carried_penalties = self.outstanding_penalties

        # ── Snapshot old terms ────────────────────────────────────────────
        restructure = LoanRestructure(
            loan=self,
            effective_date=effective_date,
            restructured_by=restructured_by,
            reason=reason,
            notes=notes,
            old_term=self.term_months,
            old_term_unit=self.term_unit,
            old_interest_rate=old_rate,
            old_repayment_frequency=self.repayment_frequency,
            old_outstanding_principal=balance,
            old_installment_amount=self.installment_amount,
            old_maturity_date=self.maturity_date,
            carried_interest=carried_interest,
            carried_penalties=carried_penalties,
            normal_interest_amount=normal_interest_amount,
            restructure_interest_amount=restructure_interest_amount,
        )

        # ── Cancel remaining installments ─────────────────────────────────
        # outstanding_penalties' TOTAL is left untouched below (self.outstanding_penalties
        # is never reassigned) — its value carries forward unchanged, but it now
        # also gets broken out across the new schedule's penalty_due fields below.
        self.repayment_schedule.filter(
            status__in=['pending', 'partial', 'overdue']
        ).update(status='restructured')

        # ── Apply new terms (same repayment_frequency, same term_unit) ────
        self.term_months = new_term
        self.interest_rate = new_rate
        self.disbursement_date = effective_date   # marks this new repayment cycle's start

        # Reset arrears — restructure is a fresh start on the new schedule
        self.days_in_arrears = 0
        self.arrears_amount = Decimal('0.00')
        self.status = 'active'
        self.interest_suspended = False

        # Regenerate schedule for the OUTSTANDING balance, not the original
        # disbursed_amount (which stays fixed as the historical disbursement figure).
        self._generate_repayment_schedule(principal_override=balance)

        new_schedules = list(self.repayment_schedule.filter(status='pending').order_by('due_date'))
        if new_schedules:
            self.first_payment_date = new_schedules[0].due_date
            self.maturity_date = new_schedules[-1].due_date

            # ── Fold carried-forward interest/penalties into the new schedule ──
            # The client doesn't pay these separately — they're spread evenly
            # across the new installments (last row absorbs rounding), same as
            # how the new restructure interest itself is spread by flat_schedule().
            n = len(new_schedules)
            if carried_interest > 0:
                share = (carried_interest / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                allocated = Decimal('0.00')
                for i, sched in enumerate(new_schedules):
                    portion = (carried_interest - allocated) if i == n - 1 else share
                    sched.interest_due += portion
                    sched.total_due += portion
                    allocated += portion
                    sched.save(update_fields=['interest_due', 'total_due'])
            if carried_penalties > 0:
                share = (carried_penalties / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                allocated = Decimal('0.00')
                for i, sched in enumerate(new_schedules):
                    portion = (carried_penalties - allocated) if i == n - 1 else share
                    sched.penalty_due += portion
                    sched.total_due += portion
                    allocated += portion
                    sched.save(update_fields=['penalty_due', 'total_due'])

            self.installment_amount = new_schedules[0].total_due

        # Carried-forward interest plus this restructure's new interest — now
        # matches the sum of interest_due across the new pending schedule rows.
        self.outstanding_interest = carried_interest + total_new_interest
        # outstanding_penalties is unchanged (still carried_penalties) — it's
        # the same total, now also broken out across the new schedule's
        # penalty_due so payments apply against it installment by installment.

        self.save()

        # ── GL Journal Entry — books only the NEW interest. Whatever was
        # already owed (carried_interest/carried_penalties) was already
        # recognized (or remains unrecognized) exactly as it was — untouched.
        if total_new_interest != 0:
            from transactions.models import (
                Transaction as JournalEntry,
                TransactionEntry as JournalEntryLine,
                TransactionSeries,
            )
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNRST',
                defaults={'description': 'Loan Restructures'},
            )
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=effective_date,
                description=f"Loan restructure – {self.loan_number}",
                owner=self.owner,
                branch=self.branch,
                created_by=restructured_by,
                tenant=self.tenant,
            )
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.account,
                side=JournalEntryLine.DEBIT,
                amount=total_new_interest,
            )
            if normal_interest_amount > 0:
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=self.product.interest_income_account,
                    side=JournalEntryLine.CREDIT,
                    amount=normal_interest_amount,
                )
            if restructure_interest_amount > 0:
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=self.product.restructure_interest_income_account,
                    side=JournalEntryLine.CREDIT,
                    amount=restructure_interest_amount,
                )
            elif restructure_interest_amount < 0:
                # Term was shortened relative to the current rate/term ratio,
                # so the term-extension premium is negative — debit the
                # monitoring account (contra) instead of crediting it.
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=self.product.restructure_interest_income_account,
                    side=JournalEntryLine.DEBIT,
                    amount=-restructure_interest_amount,
                )
            journal_entry.post()
            restructure.journal_entry = journal_entry

        # ── Save restructure record with new installment amount ───────────
        restructure.new_term = new_term
        restructure.new_term_unit = new_term_unit
        restructure.new_interest_rate = new_rate
        restructure.new_repayment_frequency = self.repayment_frequency
        restructure.new_maturity_date = self.maturity_date
        restructure.new_installment_amount = self.installment_amount
        restructure.save()

        # Update risk classification now that arrears are cleared
        self.update_risk_classification()
        self.save(update_fields=[
            'risk_classification', 'provision_pct', 'provision_amount', 'updated_at'
        ])

        return restructure


class LoanRestructure(models.Model):
    """Audit record of every loan restructure event."""

    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='restructures',
    )
    effective_date = models.DateField()
    restructured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='loan_restructures_authorised',
    )
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # Old terms snapshot
    old_term = models.PositiveIntegerField()
    old_term_unit = models.CharField(max_length=10)
    old_interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    old_repayment_frequency = models.CharField(max_length=20)
    old_outstanding_principal = models.DecimalField(max_digits=18, decimal_places=2)
    old_installment_amount = models.DecimalField(max_digits=18, decimal_places=2)
    old_maturity_date = models.DateField(blank=True, null=True)

    # New terms
    new_term = models.PositiveIntegerField()
    new_term_unit = models.CharField(max_length=10)
    new_interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    new_repayment_frequency = models.CharField(max_length=20)
    new_installment_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    new_maturity_date = models.DateField(blank=True, null=True)

    # Unpaid balances from before this restructure, carried forward unchanged
    # onto the new schedule (restructuring never alters what was already owed).
    carried_interest = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    carried_penalties = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    # New interest split: the portion at the pre-restructure rate (ordinary
    # Interest Income) vs. the incremental portion caused by the term
    # extension (LoanProduct.restructure_interest_income_account).
    normal_interest_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    restructure_interest_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_restructure_journals',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_date']

    def __str__(self):
        return f"Restructure #{self.pk} — {self.loan.loan_number} on {self.effective_date}"


class LoanRestructureRequest(TimeStampedModel, BranchScopedModel):
    """
    Loan restructure proposal pending director approval.

    Workflow:
      1. Officer submits a proposed new_term (status='pending') — no schedule
         or GL change yet. The rate is never typed in; it's derived from the
         loan's current rate/term by LoanAccount.restructure() at approval
         time (see that method's docstring for the formula).
      2. Director approves: LoanAccount.restructure() runs, the new schedule
         is generated, and the resulting LoanRestructure audit record is
         linked here. status='approved'.
      3. Director rejects: status='rejected', the loan is untouched and
         continues exactly as it was — rejection is a no-op on the loan.
    """

    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING,  'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='restructure_requests',
    )
    new_term = models.PositiveIntegerField(help_text="Proposed new term value, in the loan's current term_unit.")
    effective_date = models.DateField(null=True, blank=True, help_text='Defaults to today at approval time if left blank.')
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='submitted_loan_restructure_requests',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_loan_restructure_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    restructure = models.ForeignKey(
        LoanRestructure,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='requests',
        help_text='Set once approved — the audit record the approval produced.',
    )

    objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"RestructureRequest #{self.pk} — {self.loan.loan_number} ({self.status})"


class LoanRepaymentSchedule(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual repayment installment
    """
    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='repayment_schedule'
    )
    
    installment_number = models.PositiveIntegerField()
    due_date = models.DateField(db_index=True)
    
    # Amounts due
    principal_due = models.DecimalField(max_digits=18, decimal_places=2)
    interest_due = models.DecimalField(max_digits=18, decimal_places=2)
    fees_due = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    penalty_due = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_due = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Amounts paid
    principal_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    interest_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    fees_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    penalty_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('overdue', 'Overdue'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    
    # Payment tracking
    payment_date = models.DateField(null=True, blank=True)
    days_late = models.PositiveIntegerField(default=0)

    # ── Deferred/unearned interest recognition (only meaningful when the
    # loan's interest_deferral_active flag is True) ───────────────────────
    interest_recognized = models.BooleanField(
        default=False,
        help_text='True once this installment\'s interest has moved from Unearned '
                   'Interest Income into Interest Receivable (earned).',
    )
    interest_recognized_at = models.DateTimeField(null=True, blank=True)
    interest_written_off = models.BooleanField(
        default=False,
        help_text='True if this installment\'s interest was flushed to expense on '
                   'loan write-off rather than genuinely recognized as earned.',
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    class Meta:
        ordering = ['due_date']
        unique_together = [('loan', 'installment_number')]
        indexes = [
            models.Index(fields=['loan', 'status']),
            models.Index(fields=['due_date', 'status']),
        ]
    
    def __str__(self):
        return f"{self.loan.loan_number} - Installment {self.installment_number}"
    
    @property
    def is_overdue(self) -> bool:
        """Check if installment is overdue"""
        if self.status == 'paid':
            return False
        return timezone.now().date() > self.due_date
    
    @property
    def amount_remaining(self) -> Decimal:
        """Amount remaining to be paid"""
        return self.total_due - self.total_paid


class LoanRepaymentAllocation(TimeStampedModel):
    """
    Exactly how one repayment (one LNPMT journal entry) was split across
    principal/interest/fees/penalty on one schedule installment it touched.

    record_payment() only mutates running totals on LoanAccount and
    LoanRepaymentSchedule - nothing else remembers which installments a
    specific historical payment affected or by how much. Without this row,
    reversing one payment out of a loan's history isn't just imprecise, it's
    not mechanically possible. One row per (payment, installment) pair - see
    LoanAccount._update_schedule_with_payment, and LoanRepaymentReversal for
    the reversal that reads these back.

    schedule may be null: record_payment()'s aggregate split (penalty/interest/
    fees/principal) always applies in full to the loan's outstanding_*/*_paid
    fields regardless of schedule state, but _update_schedule_with_payment()
    can only mirror that onto installments still in pending/partial/overdue —
    if the schedule was already exhausted (or drifted out of sync with the
    aggregates, e.g. legacy-imported loans) some of that amount has nowhere on
    the schedule to land. A null-schedule row records that leftover so it's
    still visible to a reversal instead of silently vanishing untracked.
    """
    loan = models.ForeignKey(
        'LoanAccount', on_delete=models.CASCADE, related_name='repayment_allocations'
    )
    schedule = models.ForeignKey(
        'LoanRepaymentSchedule', on_delete=models.CASCADE, related_name='payment_allocations',
        null=True, blank=True,
    )
    journal_entry = models.ForeignKey(
        'transactions.Transaction', on_delete=models.PROTECT,
        related_name='loan_repayment_allocations',
    )
    principal_applied = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    interest_applied = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    fees_applied = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    penalty_applied = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    class Meta:
        indexes = [models.Index(fields=['journal_entry'])]

    def __str__(self):
        return f"Allocation of {self.journal_entry_id} to {self.schedule}"


class LoanCollateral(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Collateral for loan
    """
    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='collateral'
    )
    
    collateral_type = models.CharField(
        max_length=100,
        help_text="Type of collateral (property, vehicle, etc.)"
    )
    description = models.TextField()
    estimated_value = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Documentation
    document_reference = models.CharField(max_length=200, blank=True)
    valuation_date = models.DateField(null=True, blank=True)
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('pledged', 'Pledged'),
            ('verified', 'Verified'),
            ('released', 'Released'),
        ],
        default='pledged'
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)
    
    def __str__(self):
        return f"{self.collateral_type} for {self.loan.loan_number}"


class LoanGuarantor(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Guarantor for loan — links to either a Client (legacy) or a Guarantor profile.
    """
    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='guarantors'
    )

    # Legacy FK — existing records point here (a Client record created for the guarantor).
    guarantor = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='guaranteed_loans',
        null=True,  # ← made nullable so new records can use guarantor_person instead
        blank=True,
    )

    # New FK — standalone Guarantor profile (does NOT inflate client numbers).
    guarantor_person = models.ForeignKey(
        Guarantor,
        on_delete=models.PROTECT,
        related_name='loan_guarantees',
        null=True,
        blank=True,
    )

    guaranteed_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Maximum amount guaranteed"
    )

    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending Approval'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        default='pending'
    )

    approval_date = models.DateField(null=True, blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    # Loan statuses that count as "active" for guarantor blocking purposes
    ACTIVE_LOAN_STATUSES = ['pending', 'approved', 'disbursed', 'active']

    class Meta:
        unique_together = [('loan', 'guarantor'), ('loan', 'guarantor_person')]
        indexes = [
            models.Index(fields=['guarantor_person']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        # Exactly one of guarantor / guarantor_person must be set
        if not self.guarantor_id and not self.guarantor_person_id:
            raise ValidationError(
                "Either a Client (guarantor) or a Guarantor profile (guarantor_person) must be set."
            )

        g = self.effective_guarantor
        if g and self.loan_id:
            if hasattr(g, 'pk') and self.loan.client_id == g.pk and self.guarantor_id:
                raise ValidationError(
                    "A borrower cannot be their own guarantor."
                )
            # Block guarantor already serving on another active loan
            if self.guarantor_id:
                conflict = LoanGuarantor.objects.filter(
                    guarantor_id=self.guarantor_id,
                    loan__status__in=self.ACTIVE_LOAN_STATUSES,
                ).exclude(pk=self.pk).exists()
            elif self.guarantor_person_id:
                conflict = LoanGuarantor.objects.filter(
                    guarantor_person_id=self.guarantor_person_id,
                    loan__status__in=self.ACTIVE_LOAN_STATUSES,
                ).exclude(pk=self.pk).exists()
            else:
                conflict = False
            if conflict:
                name = self.guarantor.full_name if self.guarantor_id else self.guarantor_person.full_name
                raise ValidationError(
                    f"{name} is already an active guarantor "
                    "on another loan and cannot be used until that loan is closed."
                )

    @property
    def effective_guarantor(self):
        """Return the linked person — either the Client or the Guarantor."""
        return self.guarantor or self.guarantor_person

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        name = self.guarantor.full_name if self.guarantor_id else (
            self.guarantor_person.full_name if self.guarantor_person_id else 'N/A'
        )
        return f"{name} for {self.loan.loan_number}"


class LoanVerificationRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Cross-branch verification check run before a loan is approved.
    Aggregates the applicant's credit history across all branches using NIN.
    Auto-created when a LoanAccount is created (via signal or override).
    """
    VERDICT_CHOICES = [
        ('pending',  'Pending review'),
        ('pass',     'Pass — proceed to approval'),
        ('refer',    'Refer — proceed with caution'),
        ('decline',  'Decline — credit risk too high'),
    ]

    loan = models.OneToOneField(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='verification_request',
    )
    # Snapshot of the NIN used for this check (in case NIN is updated later)
    nin_used = models.CharField(max_length=11, blank=True, db_index=True)

    # Metrics computed by LoanVerifier
    active_loans_elsewhere = models.PositiveIntegerField(default=0)
    total_active_exposure = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text="Sum of outstanding principal across all branches"
    )
    default_rate_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        help_text="Percentage of closed loans that defaulted/written-off"
    )
    flags = models.JSONField(
        default=list,
        help_text="List of flag strings, e.g. ['loan_hopping', 'prior_default']"
    )

    recommended_amount = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )
    verdict = models.CharField(
        max_length=10, choices=VERDICT_CHOICES, default='pending', db_index=True
    )
    notes = models.TextField(blank=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_verification_reviews',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Verification for {self.loan.loan_number} — {self.verdict}"


class LoanDisbursement(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Separate disbursement approval record. Enforces maker-checker:
    the person who approved the loan cannot also disburse it.

    Flow:
      LoanAccount approved → LoanDisbursement auto-created (pending_approval)
      BM/supervisor approves disbursement → status=approved
      Finance disburses → status=disbursed, GL posted via LoanAccount.disburse()
    """
    STATUS_CHOICES = [
        ('pending_approval', 'Pending Approval'),
        ('approved',         'Approved for Disbursement'),
        ('rejected',         'Rejected'),
        ('disbursed',        'Disbursed'),
        ('cancelled',        'Cancelled'),
    ]

    loan = models.OneToOneField(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='disbursement_request',
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='requested_disbursements',
        help_text="User who requested disbursement (must differ from approver)",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='pending_approval', db_index=True
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_disbursements',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    disbursement_account = models.ForeignKey(
        'accounts.Account',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='disbursement_requests',
        help_text="Cash/Bank GL account to disburse from. Falls back to product default.",
    )
    disbursement_date = models.DateField(null=True, blank=True)
    disbursed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='executed_disbursements',
    )

    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"Disbursement for {self.loan.loan_number} [{self.status}]"

    @transaction.atomic
    def approve_disbursement(self, approving_user):
        """BM/supervisor approves the disbursement request."""
        if self.status != 'pending_approval':
            raise ValidationError("Only pending_approval disbursements can be approved.")
        # Maker-checker: approver cannot be the same as requester
        if approving_user.pk == self.requested_by_id:
            raise ValidationError(
                "The person who requested disbursement cannot approve it "
                "(maker-checker violation)."
            )
        from django.utils import timezone as tz
        self.status = 'approved'
        self.approved_by = approving_user
        self.approved_at = tz.now()
        self.save(update_fields=['status', 'approved_by', 'approved_at'])

    @transaction.atomic
    def execute_disbursement(self, disbursed_by_user, disbursement_account=None, disbursement_date=None):
        """Finance officer executes the actual fund disbursement."""
        if self.status != 'approved':
            raise ValidationError("Disbursement must be approved before it can be executed.")
        if disbursed_by_user.pk == self.approved_by_id:
            raise ValidationError(
                "The person who approved disbursement cannot also execute it "
                "(maker-checker violation)."
            )
        if disbursed_by_user.pk == self.requested_by_id:
            raise ValidationError(
                "The person who created the disbursement request cannot also execute it "
                "(maker-checker violation)."
            )
        acct = disbursement_account or self.disbursement_account
        self.loan.disburse(
            disbursement_date=disbursement_date,
            disbursement_account=acct,
            disbursed_by=disbursed_by_user,
        )
        from django.utils import timezone as tz
        # Resolve to the GL Account FK so the record stores which account was used.
        # acct may be a BankAccount (has .gl_account) or already a GL Account.
        gl_acct = getattr(acct, 'gl_account', acct)
        self.status = 'disbursed'
        self.disbursed_by = disbursed_by_user
        self.disbursement_account = gl_acct
        self.disbursement_date = disbursement_date or tz.now().date()
        self.save(update_fields=['status', 'disbursed_by', 'disbursement_account', 'disbursement_date'])


# ── Loan Write-Off ────────────────────────────────────────────────────────────

class LoanWriteOff(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Approval-gated request to write off an irrecoverable loan balance.

    Approval workflow:
        PENDING   → credit officer submits request
        APPROVED  → supervisor approves; execute() is called
        REJECTED  → supervisor rejects; loan is unchanged

    GL entry posted on execute():
        Dr. Provision for Loan Losses (reduces the provision balance)
        Cr. Loan Receivable (removes the loan asset from books)

    After execution:
        - LoanAccount.status is set to 'written_off'
        - The outstanding_principal / interest / fees are zeroed

    A written-off loan may still be pursued for recovery off-balance-sheet.
    If partial or full recovery occurs later, a reversal transaction is posted
    manually against this write-off.
    """
    PENDING  = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    STATUS_CHOICES = [
        (PENDING,  'Pending Approval'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]

    reference_number = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text='Auto-generated reference (e.g. WO-2026-0001)',
    )
    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.PROTECT,
        related_name='write_offs',
        help_text='Loan account to be written off',
    )

    # Amounts captured at the time of submission (snapshot of outstanding balances)
    principal_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Outstanding principal at the time of write-off request',
    )
    interest_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Outstanding interest at the time of write-off request',
    )
    fees_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Outstanding fees/penalties at the time of write-off request',
    )
    total_write_off_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Total amount written off (principal + interest + fees)',
    )

    reason = models.TextField(help_text='Justification for the write-off')
    write_off_date = models.DateField(
        null=True, blank=True,
        help_text='Date the write-off was executed (set on approval + execution)',
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)

    # Requester
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='loan_write_offs_requested',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    # Approver
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_write_offs_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # GL journal entry created on execute()
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_write_off_entries',
        help_text='Journal entry: Dr Provision for Loan Losses / Cr Loan Receivable',
    )

    notes = models.TextField(blank=True)

    objects    = OwnerBranchManager()
    all_objects= OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['loan', 'status']),
            models.Index(fields=['status', 'requested_at']),
        ]
        verbose_name = 'Loan Write-Off'
        verbose_name_plural = 'Loan Write-Offs'

    def __str__(self):
        return f"{self.reference_number} — {self.loan.loan_number} ₦{self.total_write_off_amount} [{self.status}]"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            import uuid
            self.reference_number = f"WO-{uuid.uuid4().hex[:8].upper()}"
        if not self.pk:
            # Snapshot totals at request time
            self.total_write_off_amount = (
                self.principal_amount + self.interest_amount + self.fees_amount
            )
        super().save(*args, **kwargs)

    @transaction.atomic
    def execute(self, approving_user):
        """
        Approve and execute the write-off.

        1. Validates maker-checker: approver != requester.
        2. Posts GL entry: Dr Provision for Loan Losses / Cr Loan Receivable.
        3. Zeros the loan's outstanding balances and marks it 'written_off'.
        4. Updates this record's status, approved_by, approved_at, write_off_date.

        Raises ValidationError on any violation.
        """
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        if self.status != self.PENDING:
            raise ValidationError("Only PENDING write-offs can be executed.")

        if approving_user.pk == self.requested_by_id:
            raise ValidationError(
                "The officer who requested the write-off cannot approve it "
                "(maker-checker violation)."
            )

        loan = LoanAccount.objects.select_for_update().get(pk=self.loan_id)

        if loan.status in ('written_off', 'closed'):
            raise ValidationError(
                f"Loan {loan.loan_number} is already {loan.status}."
            )

        write_off_date = timezone.localdate()

        # ── GL Entry ─────────────────────────────────────────────────────────
        wo_series, _ = TransactionSeries.objects.get_or_create(
            code='LNWO',
            defaults={'description': 'Loan Write-Offs'},
        )

        journal = JournalEntry.objects.create(
            series=wo_series,
            date=write_off_date,
            description=f"Write-off — {loan.loan_number} ({self.reference_number})",
            workflow_reference=self.reference_number,
            owner=loan.owner,
            branch=loan.branch,
            created_by=approving_user,
            tenant=loan.tenant,
        )

        # Dr. Provision for Loan Losses (reduces provision asset on books)
        # The provision account is set on the LoanProduct; fall back to the
        # loan's own GL account if not configured.
        provision_account = getattr(loan.product, 'provision_account', None) or loan.account
        JournalEntryLine.objects.create(
            transaction=journal,
            account=provision_account,
            side=JournalEntryLine.DEBIT,
            amount=self.total_write_off_amount,
        )

        # Cr. Loan Receivable (removes the asset from the balance sheet)
        JournalEntryLine.objects.create(
            transaction=journal,
            account=loan.account,
            side=JournalEntryLine.CREDIT,
            amount=self.total_write_off_amount,
        )

        journal.post()

        # ── Zero outstanding balances & mark loan written off ──────────────
        loan.outstanding_principal = Decimal('0.00')
        loan.outstanding_interest  = Decimal('0.00')
        loan.outstanding_fees      = Decimal('0.00')
        if hasattr(loan, 'outstanding_penalties'):
            loan.outstanding_penalties = Decimal('0.00')
        loan.status = 'written_off'
        loan.save(update_fields=[
            'outstanding_principal', 'outstanding_interest',
            'outstanding_fees', 'status', 'updated_at',
        ])

        # ── Update this write-off record ────────────────────────────────────
        self.status       = self.APPROVED
        self.approved_by  = approving_user
        self.approved_at  = timezone.now()
        self.write_off_date = write_off_date
        self.journal_entry  = journal
        self.save(update_fields=[
            'status', 'approved_by', 'approved_at',
            'write_off_date', 'journal_entry', 'updated_at',
        ])

    def reject(self, rejecting_user, reason=''):
        """Mark this write-off request as rejected."""
        if self.status != self.PENDING:
            raise ValidationError("Only PENDING write-offs can be rejected.")
        self.status           = self.REJECTED
        self.approved_by      = rejecting_user
        self.approved_at      = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=[
            'status', 'approved_by', 'approved_at',
            'rejection_reason', 'updated_at',
        ])


# ---------------------------------------------------------------------------
# Product-driven fee configuration
# ---------------------------------------------------------------------------

class LoanProductFee(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Dynamic fee lines attached to a LoanProduct.

    Each fee line has its own GL income account so that e.g. "Admin Fee",
    "Registration Fee" and "Risk Premium" can post to separate GL codes.

    posting_trigger controls WHEN the fee becomes income:
      - 'approval'     → posted when the loan moves to 'approved' status
      - 'disbursement' → posted when the loan moves to 'disbursed' status
    """
    POSTING_TRIGGER_CHOICES = [
        ('registration', 'At Loan Registration'),
        ('approval', 'At Loan Approval'),
        ('disbursement', 'At Disbursement'),
    ]
    FEE_TYPE_CHOICES = [
        ('fixed', 'Fixed Amount'),
        ('percentage', 'Percentage of Loan Amount'),
    ]
    DEBIT_DESTINATION_CHOICES = [
        ('cashier', 'Cashier Account'),
        ('savings', 'Client Savings Account'),
        ('user_choice', 'User Chooses at Registration'),
    ]

    loan_product = models.ForeignKey(
        LoanProduct,
        on_delete=models.CASCADE,
        related_name='fee_lines',
    )
    name = models.CharField(
        max_length=100,
        help_text="e.g. Admin Fee, Registration Fee, Risk Premium",
    )
    fee_type = models.CharField(max_length=20, choices=FEE_TYPE_CHOICES, default='fixed')
    fixed_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text="Used when fee_type = fixed",
    )
    percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        help_text="Percentage of approved loan amount. Used when fee_type = percentage.",
    )
    gl_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        limit_choices_to={'account_type__in': [Account.INCOME, Account.LIABILITY]},
        related_name='loan_product_fee_lines',
        help_text=(
            "GL account where this fee is posted. Use an Income account for fees "
            "recognized as revenue, or a Liability account for pass-through "
            "collections held on behalf of a third party (e.g. Union Purse)."
        ),
    )
    posting_trigger = models.CharField(
        max_length=20,
        choices=POSTING_TRIGGER_CHOICES,
        default='registration',
    )
    debit_destination = models.CharField(
        max_length=20,
        choices=DEBIT_DESTINATION_CHOICES,
        default='cashier',
        help_text=(
            'Where the debit (cash collected) side of the fee GL entry goes. '
            'cashier = teller cash account; '
            'savings = deducted from the client\'s savings account; '
            'user_choice = staff decides at registration time.'
        ),
    )
    default_savings_product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'product_type': 'SAVINGS'},
        related_name='loan_fee_default_savings',
        help_text=(
            'Default savings product to debit when debit_destination=savings or '
            'when the user picks savings and a specific product is pre-selected. '
            'Leave blank to use the client\'s first active savings account.'
        ),
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(
        default=0,
        help_text="Display order on forms and reports.",
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['loan_product', 'order', 'name']
        unique_together = [['loan_product', 'name']]

    def __str__(self):
        return f"{self.loan_product} — {self.name}"

    def calculate(self, loan_amount: Decimal) -> Decimal:
        """Return the fee amount for the given loan principal."""
        if self.fee_type == 'fixed':
            return self.fixed_amount
        return (loan_amount * self.percentage / Decimal('100')).quantize(Decimal('0.01'))


class LoanProductSavingsRequirement(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Configures a minimum savings balance a client must hold before a loan
    of this product can be created.

    requirement_type:
      - 'percentage' → client must hold at least (value % of requested_amount)
      - 'fixed'      → client must hold at least value naira

    savings_product: the specific savings Product to check (e.g. 'Normal Savings').
    """
    REQUIREMENT_TYPE_CHOICES = [
        ('percentage', 'Percentage of Loan Amount'),
        ('fixed', 'Fixed Amount'),
    ]

    loan_product = models.ForeignKey(
        LoanProduct,
        on_delete=models.CASCADE,
        related_name='savings_requirements',
    )
    savings_product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        limit_choices_to={'product_type': 'SAVINGS'},
        related_name='loan_savings_requirements',
        help_text="The savings product whose balance is checked.",
    )
    requirement_type = models.CharField(
        max_length=20,
        choices=REQUIREMENT_TYPE_CHOICES,
        default='percentage',
    )
    value = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="10 = 10% of loan amount (percentage) or ₦10,000 (fixed).",
    )
    is_active = models.BooleanField(default=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['loan_product', 'savings_product']

    def __str__(self):
        return (
            f"{self.loan_product} requires "
            f"{'%' if self.requirement_type == 'percentage' else '₦'}{self.value} in "
            f"{self.savings_product}"
        )

    def required_amount(self, loan_amount: Decimal) -> Decimal:
        """Compute the minimum savings balance needed for the given loan amount."""
        if self.requirement_type == 'percentage':
            return (loan_amount * self.value / Decimal('100')).quantize(Decimal('0.01'))
        return self.value


class LoanFeeApplication(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Audit record: one row per fee line per loan account.
    Created when fees are calculated at approval/disbursement.
    The journal_entry FK is set when the GL posting actually happens.
    """
    loan_account = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='fee_applications',
    )
    fee_config = models.ForeignKey(
        LoanProductFee,
        on_delete=models.PROTECT,
        related_name='applications',
    )
    calculated_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text="Amount computed at the time the fee was applied.",
    )
    posted = models.BooleanField(default=False)
    posting_date = models.DateField(null=True, blank=True)
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_fee_applications',
    )
    # Audit: record the actual destination and account used at posting time
    debit_destination_used = models.CharField(
        max_length=20, blank=True, default='',
        help_text="Actual debit destination: 'cashier' or 'savings'.",
    )
    savings_account_debited = models.ForeignKey(
        'savings.SavingsAccount',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='fee_debits',
        help_text="The savings account debited when debit_destination_used='savings'.",
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [['loan_account', 'fee_config']]

    def __str__(self):
        status = "posted" if self.posted else "pending"
        return (
            f"{self.fee_config.name} on {self.loan_account.loan_number} "
            f"— ₦{self.calculated_amount} ({status})"
        )


class LoanRepaymentRequest(TimeStampedModel, BranchScopedModel):
    """
    Savings-debit loan repayment request pending director approval.

    Workflow:
      1. Officer submits request (status='pending') — no GL movement yet.
      2. Director approves: GL posts (savings.withdraw + loan.record_payment), status='posted'.
      3. Director rejects: status='rejected', no GL movement.
    """

    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_POSTED   = 'posted'

    STATUS_CHOICES = [
        (STATUS_PENDING,  'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_POSTED,   'Posted'),
    ]

    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='repayment_requests',
    )
    savings_account = models.ForeignKey(
        'savings.SavingsAccount',
        on_delete=models.PROTECT,
        related_name='loan_repayment_requests',
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    payment_date = models.DateField()
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='submitted_loan_repayment_requests',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_loan_repayment_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_repayment_request_journals',
    )
    notes = models.TextField(blank=True)
    covered_installments = models.ManyToManyField(
        'LoanRepaymentSchedule',
        blank=True,
        related_name='repayment_requests',
        help_text='Schedule rows this request is intended to settle, oldest-due-first.',
    )

    objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"RepayRequest #{self.pk} — {self.loan.loan_number} "
            f"₦{self.amount} ({self.status})"
        )


class OfflinePaymentRecord(TimeStampedModel, BranchScopedModel):
    """
    Cash / mobile-money payment collected by a credit officer in the field.
    Location is captured at the time of recording. The GL only posts after a
    supervisor or director approves.

    Workflow:
      1. Credit officer records payment on their device (status='pending').
         No GL movement.  Lat/lon captured by browser geolocation.
      2. Supervisor/Director approves → supplies a payment GL account and
         calls approve/; loan.record_payment() posts the journal entry.
      3. Supervisor/Director rejects  → status='rejected', no GL movement.
    """

    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_POSTED   = 'posted'

    STATUS_CHOICES = [
        (STATUS_PENDING,  'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_POSTED,   'Posted'),
    ]

    PAYMENT_MODE_CASH   = 'cash'
    PAYMENT_MODE_MOBILE = 'mobile_money'
    PAYMENT_MODE_BANK   = 'bank_transfer'

    PAYMENT_MODE_CHOICES = [
        (PAYMENT_MODE_CASH,   'Cash'),
        (PAYMENT_MODE_MOBILE, 'Mobile Money'),
        (PAYMENT_MODE_BANK,   'Bank Transfer'),
    ]

    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='offline_payment_records',
    )
    # Snapshot fields so approvers see the same info even if the loan changes
    client_name = models.CharField(max_length=200)
    loan_number = models.CharField(max_length=50)

    amount = models.DecimalField(max_digits=18, decimal_places=2)
    payment_date = models.DateField()
    payment_mode = models.CharField(
        max_length=20, choices=PAYMENT_MODE_CHOICES, default=PAYMENT_MODE_CASH
    )
    bank_reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    # ── Location capture ──────────────────────────────────────────────────
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    location_accuracy = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text='GPS accuracy radius in metres',
    )
    location_address = models.CharField(
        max_length=500, blank=True,
        help_text='Reverse-geocoded human-readable address (optional)',
    )

    # ── Workflow ──────────────────────────────────────────────────────────
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='offline_payment_records',
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_offline_payment_records',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='offline_payment_record_journals',
    )

    objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"OfflinePmt #{self.pk} — {self.loan_number} "
            f"₦{self.amount} ({self.status})"
        )


class LoanDisbursementCorrection(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Approval-gated correction for a loan disbursed to the wrong customer.

    Standard accounting treatment (there is no shortcut — the loan's GL account
    is client-specific by construction and a client cannot hold two active loans
    on the same product, so the client FK can't just be edited in place):
        1. Reverse the original loan's disbursement journal entry
           (Transaction.reverse() — creates a mirror-image entry, never mutates
           the original).
        2. Cancel the original LoanAccount and zero its balances/schedule.
        3. Create a brand-new LoanAccount (+ GL account) for the correct client
           with the same terms, and disburse it through the normal disburse()
           flow.

    Always requires two different, authorized approvers — regardless of amount.
    A misdirected disbursement is rare and high-stakes (real money already
    moved), unlike routine reconciliation exceptions, so there's no threshold
    to tune: the maker who requests the correction can never be either
    approver, and the two approvers must be different people. This is the
    control that keeps the feature from being usable to quietly redirect
    an already-disbursed loan.

    Workflow:
        PENDING -> (first approve)  -> AWAITING_SECOND_APPROVAL
                -> (second approve) -> COMPLETED  (executes the reversal + re-disbursement)
        PENDING | AWAITING_SECOND_APPROVAL -> (reject) -> REJECTED
    """
    PENDING = 'pending'
    AWAITING_SECOND = 'awaiting_second_approval'
    COMPLETED = 'completed'
    REJECTED = 'rejected'
    STATUS_CHOICES = [
        (PENDING, 'Pending First Approval'),
        (AWAITING_SECOND, 'Awaiting Second Approval'),
        (COMPLETED, 'Completed'),
        (REJECTED, 'Rejected'),
    ]

    reference_number = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text='Auto-generated reference (e.g. LCOR-A1B2C3D4)',
    )

    original_loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.PROTECT,
        related_name='disbursement_corrections',
        help_text='The loan that was disbursed to the wrong customer',
    )
    correct_client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='loan_disbursement_corrections',
        help_text='The customer the loan should have been disbursed to',
    )

    reason = models.TextField(help_text='Why the original loan was disbursed to the wrong customer')

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=PENDING, db_index=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='loan_corrections_requested',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    first_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_corrections_first_approved',
    )
    first_approved_at = models.DateTimeField(null=True, blank=True)
    first_approval_notes = models.TextField(blank=True)

    second_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_corrections_second_approved',
    )
    second_approved_at = models.DateTimeField(null=True, blank=True)
    second_approval_notes = models.TextField(blank=True)

    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_corrections_rejected',
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Results — set by _execute() on second approval
    reversal_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_correction_reversals',
        help_text='The reversal of the original loan\'s disbursement journal entry',
    )
    new_loan = models.ForeignKey(
        LoanAccount,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        help_text='The replacement loan created and disbursed for the correct client',
    )

    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['original_loan', 'status']),
        ]
        verbose_name = 'Loan Disbursement Correction'
        verbose_name_plural = 'Loan Disbursement Corrections'

    def __str__(self):
        return f"{self.reference_number} — {self.original_loan.loan_number} [{self.status}]"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            import uuid
            self.reference_number = f"LCOR-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    def clean(self):
        if self.original_loan_id and self.correct_client_id:
            if self.original_loan.client_id == self.correct_client_id:
                raise ValidationError(
                    {'correct_client': "The correct client must be different from the loan's current client — "
                                        "that's not a wrong-customer error."}
                )
        if self.original_loan_id and not self.pk and not self.is_within_correction_window:
            raise ValidationError(
                {'original_loan': (
                    f"This correction can only be requested within "
                    f"{settings.LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS} days of the original "
                    f"disbursement ({self.original_loan.original_disbursement_date}). For an older "
                    f"loan, use write-off or restructure instead."
                )}
            )

    @property
    def is_within_correction_window(self):
        """
        True while the original loan's disbursement is still within
        LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS of today. Anchored on
        original_disbursement_date (set once at first disburse() and never
        touched again — unlike disbursement_date, which restructure()
        overwrites) so the window can't be reset by an unrelated later event.
        """
        anchor = self.original_loan.original_disbursement_date
        if not anchor:
            return False
        deadline = anchor + timedelta(days=settings.LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS)
        return timezone.localdate() <= deadline

    MIN_REASON_LENGTH = 10

    @classmethod
    def _reason_too_short(cls, text):
        return not text or len(text.strip()) < cls.MIN_REASON_LENGTH

    @transaction.atomic
    def first_approve(self, user, notes=''):
        """First of two required approvals. Requester cannot approve their own request."""
        if self.status != self.PENDING:
            raise ValidationError('Only pending corrections can be first-approved.')
        if user.pk == self.requested_by_id:
            raise ValidationError(
                'The person who requested this correction cannot also approve it (maker-checker violation).'
            )
        if self._reason_too_short(notes):
            raise ValidationError(f'Approval notes (at least {self.MIN_REASON_LENGTH} characters) are required.')

        self.first_approved_by = user
        self.first_approved_at = timezone.now()
        self.first_approval_notes = notes
        self.status = self.AWAITING_SECOND
        self.save(update_fields=[
            'first_approved_by', 'first_approved_at', 'first_approval_notes', 'status', 'updated_at',
        ])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_BALANCE_CORRECTION,
            acted_by=user,
            record_type='LoanDisbursementCorrection',
            record_id=str(self.pk),
            description=f'Correction {self.reference_number} for loan {self.original_loan.loan_number} — first approval',
            extra={'reference_number': self.reference_number, 'original_loan': self.original_loan.loan_number},
        )

    @transaction.atomic
    def second_approve(self, user, notes=''):
        """
        Second, different approver confirms — this is what actually executes the
        reversal + re-disbursement. Neither the requester nor the first approver
        may act here.
        """
        if self.status != self.AWAITING_SECOND:
            raise ValidationError('This correction has not been through a first approval yet.')
        if user.pk == self.requested_by_id:
            raise ValidationError(
                'The person who requested this correction cannot also approve it (maker-checker violation).'
            )
        if user.pk == self.first_approved_by_id:
            raise ValidationError('The second approver must be a different person from the first approver.')
        if self._reason_too_short(notes):
            raise ValidationError(f'Approval notes (at least {self.MIN_REASON_LENGTH} characters) are required.')

        self.second_approved_by = user
        self.second_approved_at = timezone.now()
        self.second_approval_notes = notes

        self._execute(user)

        self.status = self.COMPLETED
        self.save(update_fields=[
            'second_approved_by', 'second_approved_at', 'second_approval_notes',
            'status', 'reversal_journal_entry', 'new_loan', 'updated_at',
        ])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_BALANCE_CORRECTION,
            acted_by=user,
            record_type='LoanDisbursementCorrection',
            record_id=str(self.pk),
            amount=self.original_loan.disbursed_amount,
            description=(
                f'Correction {self.reference_number}: reversed {self.original_loan.loan_number} '
                f'and re-disbursed as {self.new_loan.loan_number} for the correct client'
            ),
            extra={
                'reference_number': self.reference_number,
                'original_loan': self.original_loan.loan_number,
                'wrong_client_id': str(self.original_loan.client_id),
                'new_loan': self.new_loan.loan_number,
                'correct_client_id': str(self.correct_client_id),
                'reversal_journal_entry_id': str(self.reversal_journal_entry_id),
                'requested_by': str(self.requested_by_id),
                'first_approved_by': str(self.first_approved_by_id),
                'second_approved_by': str(self.second_approved_by_id),
            },
        )

    def reject(self, user, reason=''):
        if self.status not in (self.PENDING, self.AWAITING_SECOND):
            raise ValidationError('Only pending or awaiting-second-approval corrections can be rejected.')
        if self._reason_too_short(reason):
            raise ValidationError(f'A rejection reason (at least {self.MIN_REASON_LENGTH} characters) is required.')

        self.status = self.REJECTED
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'])

    def _execute(self, executing_user):
        """
        Reverse the original disbursement and re-disburse a brand-new loan to
        the correct client. Called only from second_approve(), inside its
        atomic block.
        """
        loan = LoanAccount.objects.select_for_update().get(pk=self.original_loan_id)

        if loan.status not in ('disbursed', 'active'):
            raise ValidationError(
                f"Loan {loan.loan_number} is {loan.status} — only a disbursed/active loan's "
                "disbursement can be corrected this way."
            )
        if loan.total_paid and loan.total_paid > Decimal('0.00'):
            raise ValidationError(
                f"Loan {loan.loan_number} already has repayments recorded (₦{loan.total_paid}). "
                "This automated correction only handles loans with no repayment history yet — "
                "contact accounting for a manual adjustment."
            )
        # Re-check the window at execute time too, not just at request time —
        # approvals can take days, and the window setting itself could change
        # in between. Money only actually moves here.
        if not self.is_within_correction_window:
            raise ValidationError(
                f"The {settings.LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS}-day correction window for "
                f"loan {loan.loan_number} (disbursed {loan.original_disbursement_date}) has passed. "
                "This request can no longer be executed — reject it and use write-off/restructure instead."
            )
        if not loan.disbursement_journal_entry_id:
            raise ValidationError(f"Loan {loan.loan_number} has no disbursement journal entry to reverse.")
        if loan.disbursement_journal_entry.is_reversed:
            raise ValidationError(f"Loan {loan.loan_number}'s disbursement has already been reversed.")

        original_journal = loan.disbursement_journal_entry

        # ── 1. Reverse the original disbursement's GL entry ────────────────
        reversal_journal = original_journal.reverse(
            executing_user,
            reason=f"Loan correction {self.reference_number}: disbursed to wrong customer ({self.reason})",
        )

        # ── 2. Cancel the original loan and zero its balances/schedule ─────
        loan.repayment_schedule.all().delete()
        loan.outstanding_principal = Decimal('0.00')
        loan.outstanding_interest = Decimal('0.00')
        loan.outstanding_fees = Decimal('0.00')
        loan.outstanding_penalties = Decimal('0.00')
        loan.status = 'cancelled'
        loan.save(update_fields=[
            'outstanding_principal', 'outstanding_interest', 'outstanding_fees',
            'outstanding_penalties', 'status', 'updated_at',
        ])

        # ── 3. Create and disburse a brand-new loan for the correct client ─
        _TERMINAL = {'paid_off', 'written_off', 'rejected', 'cancelled'}
        if LoanAccount.objects.filter(
            client_id=self.correct_client_id, product_id=loan.product_id,
        ).exclude(status__in=_TERMINAL).exists():
            raise ValidationError(
                f"{self.correct_client.full_name} already has an active loan account for "
                f"{loan.product.product.name} — resolve or close it before correcting this loan into it."
            )

        from .services import create_loan_account_shell

        new_loan_number, gl_account = create_loan_account_shell(
            client=self.correct_client,
            product=loan.product,
            user=executing_user,
            branch=loan.branch,
            tenant=loan.tenant,
        )

        new_loan = LoanAccount.objects.create(
            client=self.correct_client,
            product=loan.product,
            account=gl_account,
            loan_number=new_loan_number,
            application_date=timezone.localdate(),
            application_notes=f"Replacement for {loan.loan_number} — {self.reference_number} (wrong-customer correction)",
            requested_amount=loan.requested_amount,
            approved_amount=loan.approved_amount,
            interest_rate=loan.interest_rate,
            processing_fee=loan.processing_fee,
            insurance_amount=loan.insurance_amount,
            term_months=loan.term_months,
            term_unit=loan.term_unit,
            repayment_frequency=loan.repayment_frequency,
            status='approved',
            approval_date=loan.approval_date or timezone.localdate(),
            approved_by=loan.approved_by,
            branch=loan.branch,
            tenant=loan.tenant,
            owner=loan.owner,
            metadata={'corrected_from_loan': loan.loan_number, 'correction_reference': self.reference_number},
        )

        # Disburse from the exact same cash/bank account the original
        # disbursement came from (which may differ from the product's default
        # disbursement_account if the officer picked a specific bank account
        # at the time) — the reversal above already put that cash back there.
        # disburse() posts a CREDIT to the cash account and, when the product
        # recognizes interest at disbursement, an additional CREDIT to its
        # interest-income account(s); exclude those so only the genuine
        # cash/bank leg remains.
        from transactions.models import TransactionEntry as _JournalEntryLine

        income_account_ids = {
            loan.product.interest_income_account_id,
            loan.product.unearned_interest_income_account_id,
        }
        income_account_ids.discard(None)
        cash_entry = original_journal.entries.filter(
            side=_JournalEntryLine.CREDIT,
        ).exclude(account_id__in=income_account_ids).first()
        if cash_entry is None:
            raise ValidationError(
                f"Could not determine the original disbursement's cash/bank account for {loan.loan_number}."
            )
        new_loan.disburse(
            disbursement_account=cash_entry.account,
            disbursed_by=executing_user,
        )

        self.reversal_journal_entry = reversal_journal
        self.new_loan = new_loan


class LoanRepaymentReversal(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Approval-gated reversal of a single loan repayment (LNPMT) transaction.

    record_payment() only mutates running totals on LoanAccount and
    LoanRepaymentSchedule - see LoanRepaymentAllocation for why precisely
    undoing one historical payment depends on allocation rows recorded at
    payment time. A payment made before LoanRepaymentAllocation existed has
    no allocation rows and can't be reversed through this flow.

    Always requires two different, authorized approvers, matching
    LoanDisbursementCorrection - reversing a repayment moves real GL,
    schedule, and balance state, exactly the kind of action a single
    mistaken or compromised approval shouldn't be able to trigger alone.

    Workflow:
        PENDING -> (first approve)  -> AWAITING_SECOND_APPROVAL
                -> (second approve) -> COMPLETED  (executes the reversal)
        PENDING | AWAITING_SECOND_APPROVAL -> (reject) -> REJECTED
    """
    PENDING = 'pending'
    AWAITING_SECOND = 'awaiting_second_approval'
    COMPLETED = 'completed'
    REJECTED = 'rejected'
    STATUS_CHOICES = [
        (PENDING, 'Pending First Approval'),
        (AWAITING_SECOND, 'Awaiting Second Approval'),
        (COMPLETED, 'Completed'),
        (REJECTED, 'Rejected'),
    ]

    reference_number = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text='Auto-generated reference (e.g. LREV-A1B2C3D4)',
    )

    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.PROTECT,
        related_name='repayment_reversals',
    )
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        related_name='loan_repayment_reversal_requests',
        help_text='The LNPMT payment transaction being reversed',
    )
    amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Total amount of the payment being reversed (for display/audit)',
    )
    reason = models.TextField(help_text='Why this repayment is being reversed')

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=PENDING, db_index=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='loan_repayment_reversals_requested',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    first_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_repayment_reversals_first_approved',
    )
    first_approved_at = models.DateTimeField(null=True, blank=True)
    first_approval_notes = models.TextField(blank=True)

    second_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_repayment_reversals_second_approved',
    )
    second_approved_at = models.DateTimeField(null=True, blank=True)
    second_approval_notes = models.TextField(blank=True)

    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_repayment_reversals_rejected',
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Result — set by _execute() on second approval
    reversal_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan_repayment_reversal_results',
        help_text="The reversal of the original payment's journal entry",
    )

    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['loan', 'status']),
            models.Index(fields=['journal_entry', 'status']),
        ]
        verbose_name = 'Loan Repayment Reversal'
        verbose_name_plural = 'Loan Repayment Reversals'

    def __str__(self):
        return f"{self.reference_number} — {self.loan.loan_number} [{self.status}]"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            import uuid
            self.reference_number = f"LREV-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)

    MIN_REASON_LENGTH = 10

    @classmethod
    def _reason_too_short(cls, text):
        return not text or len(text.strip()) < cls.MIN_REASON_LENGTH

    @staticmethod
    def _latest_active_payment(loan, journal_entry):
        """The loan's most recent LNPMT payment still in effect (not itself a
        reversal, not already reversed) — the only payment a no-allocation
        reversal can safely target, since without allocation rows there's no
        way to know which installment(s) an older payment touched versus
        what a later payment has since built on top of."""
        return journal_entry.__class__.objects.filter(
            series__code='LNPMT',
            branch=loan.branch,
            description__icontains=loan.loan_number,
            is_reversal=False,
            is_reversed=False,
        ).order_by('-date', '-id').first()

    @staticmethod
    def _amount_that_hit_loan(journal_entry):
        """
        Sum of this payment's credit lines that reduced the loan itself
        (Loan Receivable + any income accounts) — excludes any credit line to
        a client's savings account (spillover). journal_entry.reverse()
        reverses every line of the entry symmetrically, so the savings side
        corrects itself automatically; this is only the amount the fallback
        no-allocation path needs to unwind from the schedule/loan aggregates.
        """
        from transactions.models import TransactionEntry
        from savings.models import SavingsAccount

        savings_account_ids = set(SavingsAccount.objects.values_list('account_id', flat=True))
        return TransactionEntry.objects.filter(
            transaction=journal_entry, side=TransactionEntry.CREDIT,
        ).exclude(account_id__in=savings_account_ids).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

    @classmethod
    @transaction.atomic
    def submit(cls, loan, journal_entry, reason, user):
        """
        Create a pending reversal request for one of `loan`'s repayment
        transactions. Validates that the transaction is actually a repayment
        on this loan, hasn't already been reversed, and isn't already
        awaiting approval.

        Prefers LoanRepaymentAllocation rows (see that model) for an exact,
        per-installment reversal. When none exist — the payment predates
        allocation tracking, or hit the pre-migration-0027 leftover gap —
        falls back to a less precise path that's only safe when this is the
        loan's most recent still-applied payment (see _latest_active_payment);
        _execute() does the actual unwind either way.
        """
        if cls._reason_too_short(reason):
            raise ValidationError(f'A reason (at least {cls.MIN_REASON_LENGTH} characters) is required.')

        if getattr(journal_entry.series, 'code', None) != 'LNPMT':
            raise ValidationError('This transaction is not a loan repayment.')

        if journal_entry.is_reversed:
            raise ValidationError('This payment has already been reversed.')

        allocations = LoanRepaymentAllocation.objects.filter(
            journal_entry=journal_entry, loan=loan,
        )
        has_allocations = allocations.exists()
        if not has_allocations:
            latest = cls._latest_active_payment(loan, journal_entry)
            if not latest or latest.pk != journal_entry.pk:
                raise ValidationError(
                    'No allocation records exist for this payment, and it isn\'t the loan\'s '
                    'most recent payment, so which installment(s) it touched can\'t be '
                    'determined safely (a later payment may have built on top of it). '
                    'Contact accounting for a manual adjustment.'
                )

        if cls.objects.filter(
            journal_entry=journal_entry, status__in=[cls.PENDING, cls.AWAITING_SECOND],
        ).exists():
            raise ValidationError('A reversal request for this payment is already pending approval.')

        if has_allocations:
            total = allocations.aggregate(
                total=Sum('principal_applied') + Sum('interest_applied')
                + Sum('fees_applied') + Sum('penalty_applied')
            )['total'] or Decimal('0.00')
        else:
            total = cls._amount_that_hit_loan(journal_entry)

        return cls.objects.create(
            loan=loan,
            journal_entry=journal_entry,
            amount=total,
            reason=reason,
            requested_by=user,
            owner=loan.owner,
            branch=loan.branch,
            tenant=loan.tenant,
        )

    @transaction.atomic
    def first_approve(self, user, notes=''):
        """First of two required approvals. Requester cannot approve their own request."""
        if self.status != self.PENDING:
            raise ValidationError('Only pending reversals can be first-approved.')
        if user.pk == self.requested_by_id:
            raise ValidationError(
                'The person who requested this reversal cannot also approve it (maker-checker violation).'
            )
        if self._reason_too_short(notes):
            raise ValidationError(f'Approval notes (at least {self.MIN_REASON_LENGTH} characters) are required.')

        self.first_approved_by = user
        self.first_approved_at = timezone.now()
        self.first_approval_notes = notes
        self.status = self.AWAITING_SECOND
        self.save(update_fields=[
            'first_approved_by', 'first_approved_at', 'first_approval_notes', 'status', 'updated_at',
        ])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_BALANCE_CORRECTION,
            acted_by=user,
            record_type='LoanRepaymentReversal',
            record_id=str(self.pk),
            description=f'Reversal {self.reference_number} for loan {self.loan.loan_number} — first approval',
            extra={'reference_number': self.reference_number, 'loan': self.loan.loan_number},
        )

    @transaction.atomic
    def second_approve(self, user, notes=''):
        """
        Second, different approver confirms — this is what actually executes
        the reversal. Neither the requester nor the first approver may act here.
        """
        if self.status != self.AWAITING_SECOND:
            raise ValidationError('This reversal has not been through a first approval yet.')
        if user.pk == self.requested_by_id:
            raise ValidationError(
                'The person who requested this reversal cannot also approve it (maker-checker violation).'
            )
        if user.pk == self.first_approved_by_id:
            raise ValidationError('The second approver must be a different person from the first approver.')
        if self._reason_too_short(notes):
            raise ValidationError(f'Approval notes (at least {self.MIN_REASON_LENGTH} characters) are required.')

        self.second_approved_by = user
        self.second_approved_at = timezone.now()
        self.second_approval_notes = notes

        self._execute(user)

        self.status = self.COMPLETED
        self.save(update_fields=[
            'second_approved_by', 'second_approved_at', 'second_approval_notes',
            'status', 'reversal_journal_entry', 'updated_at',
        ])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.LOAN_BALANCE_CORRECTION,
            acted_by=user,
            record_type='LoanRepaymentReversal',
            record_id=str(self.pk),
            amount=self.amount,
            description=f'Reversal {self.reference_number}: reversed a ₦{self.amount} payment on {self.loan.loan_number}',
            extra={
                'reference_number': self.reference_number,
                'loan': self.loan.loan_number,
                'original_journal_entry_id': str(self.journal_entry_id),
                'reversal_journal_entry_id': str(self.reversal_journal_entry_id),
                'requested_by': str(self.requested_by_id),
                'first_approved_by': str(self.first_approved_by_id),
                'second_approved_by': str(self.second_approved_by_id),
            },
        )

    def reject(self, user, reason=''):
        if self.status not in (self.PENDING, self.AWAITING_SECOND):
            raise ValidationError('Only pending or awaiting-second-approval reversals can be rejected.')
        if self._reason_too_short(reason):
            raise ValidationError(f'A rejection reason (at least {self.MIN_REASON_LENGTH} characters) is required.')

        self.status = self.REJECTED
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason', 'updated_at'])

    def _execute(self, executing_user):
        """
        Reverse the payment's GL entry and unwind what it did to the loan's
        schedule and balances. Called only from second_approve(), inside its
        atomic block.

        Two paths, chosen by whether LoanRepaymentAllocation rows exist:
          - Precise: unwind exactly the installments this payment's
            allocation rows recorded, by exactly the amounts recorded.
          - Fallback (no allocation rows — submit() already confirmed this is
            the loan's most recent still-applied payment): unwind the
            schedule's tail, most-recent-due-date-first, by the amount that
            actually hit the loan (GL-derived, excludes savings spillover —
            journal_entry.reverse() corrects that side on its own). Exact on
            the total; the principal/interest/fees/penalty split per
            installment is a best-effort peel-off (principal, then fees,
            then interest, then penalty) rather than a recorded fact.
        """
        loan = LoanAccount.objects.select_for_update().get(pk=self.loan_id)
        journal_entry = self.journal_entry

        if journal_entry.is_reversed:
            raise ValidationError('This payment has already been reversed.')

        allocations = list(
            LoanRepaymentAllocation.objects.select_related('schedule').filter(
                journal_entry=journal_entry, loan=loan,
            )
        )
        if not allocations:
            latest = self._latest_active_payment(loan, journal_entry)
            if not latest or latest.pk != journal_entry.pk:
                raise ValidationError(
                    'No allocation records exist for this payment, and it is no longer the '
                    'loan\'s most recent payment (one may have been recorded since this '
                    'reversal was requested). Contact accounting for a manual adjustment.'
                )

        # Guard: an early-payoff interest catch-up (LNACC) may have run inside
        # the same record_payment() call that posted this LNPMT entry — it
        # isn't linked back to it by FK, so detect it by the same date +
        # description record_payment() used and refuse rather than silently
        # leaving its Interest Receivable / Unearned Income entries stale.
        catchup_exists = journal_entry.__class__.objects.filter(
            series__code='LNACC',
            branch=loan.branch,
            date=journal_entry.date,
            description__icontains=loan.loan_number,
        ).exists()
        if catchup_exists:
            raise ValidationError(
                'This payment triggered an early-payoff interest recognition entry, which this '
                'automated flow cannot unwind. Contact accounting for a manual adjustment.'
            )

        # ── 1. Reverse the payment's GL entry ───────────────────────────────
        reversal_journal = journal_entry.reverse(
            executing_user,
            reason=f"Loan repayment reversal {self.reference_number}: {self.reason}",
        )

        # ── 2. Unwind each touched installment by exactly what this payment
        #      applied to it ────────────────────────────────────────────────
        today = timezone.now().date()
        total_principal = Decimal('0.00')
        total_interest = Decimal('0.00')
        total_fees = Decimal('0.00')
        total_penalty = Decimal('0.00')
        installments_reopened = 0

        if allocations:
            for allocation in allocations:
                # schedule_id is None for the "leftover" portion of a payment
                # that never landed on any installment (schedule already
                # exhausted, or schedule/aggregate drift) — see
                # _update_schedule_with_payment. Nothing to unwind on the
                # schedule for that portion, just fold it into the
                # loan-aggregate totals below.
                if allocation.schedule_id is None:
                    total_principal += allocation.principal_applied
                    total_interest += allocation.interest_applied
                    total_fees += allocation.fees_applied
                    total_penalty += allocation.penalty_applied
                    continue

                schedule = LoanRepaymentSchedule.objects.select_for_update().get(pk=allocation.schedule_id)
                was_paid = schedule.status == 'paid'

                schedule.principal_paid = max(Decimal('0.00'), schedule.principal_paid - allocation.principal_applied)
                schedule.interest_paid = max(Decimal('0.00'), schedule.interest_paid - allocation.interest_applied)
                schedule.fees_paid = max(Decimal('0.00'), schedule.fees_paid - allocation.fees_applied)
                schedule.penalty_paid = max(Decimal('0.00'), schedule.penalty_paid - allocation.penalty_applied)
                schedule.total_paid = max(Decimal('0.00'), schedule.total_paid - (
                    allocation.principal_applied + allocation.interest_applied
                    + allocation.fees_applied + allocation.penalty_applied
                ))

                if schedule.total_paid <= 0:
                    schedule.status = 'overdue' if schedule.due_date < today else 'pending'
                    schedule.payment_date = None
                    schedule.days_late = 0
                elif schedule.total_paid < schedule.total_due:
                    schedule.status = 'partial'
                    schedule.payment_date = None
                    schedule.days_late = 0
                schedule.save()

                if was_paid and schedule.status != 'paid':
                    installments_reopened += 1

                total_principal += allocation.principal_applied
                total_interest += allocation.interest_applied
                total_fees += allocation.fees_applied
                total_penalty += allocation.penalty_applied
        else:
            # Fallback: peel the amount that hit the loan off the schedule's
            # tail, most-recent-due-date-first among rows still carrying a
            # balance — the mirror image of record_payment()'s forward,
            # oldest-due-first application. Safe only because submit()/the
            # guard above already confirmed nothing has been paid since.
            remaining = self._amount_that_hit_loan(journal_entry)
            touched_schedules = LoanRepaymentSchedule.objects.select_for_update().filter(
                loan=loan, status__in=['paid', 'partial'],
            ).order_by('-due_date')

            for schedule in touched_schedules:
                if remaining <= 0:
                    break
                take = min(remaining, schedule.total_paid)
                if take <= 0:
                    continue
                was_paid = schedule.status == 'paid'

                # Peel off in the reverse of record_payment()'s forward
                # priority (penalty → interest → fees → principal), i.e.
                # principal first — a best-effort split, not a recorded one.
                p = min(take, schedule.principal_paid)
                schedule.principal_paid -= p
                take -= p
                f = min(take, schedule.fees_paid)
                schedule.fees_paid -= f
                take -= f
                i = min(take, schedule.interest_paid)
                schedule.interest_paid -= i
                take -= i
                n = min(take, schedule.penalty_paid)
                schedule.penalty_paid -= n
                take -= n

                applied = p + f + i + n
                schedule.total_paid -= applied
                remaining -= applied

                if schedule.total_paid <= 0:
                    schedule.status = 'overdue' if schedule.due_date < today else 'pending'
                    schedule.payment_date = None
                    schedule.days_late = 0
                elif schedule.total_paid < schedule.total_due:
                    schedule.status = 'partial'
                    schedule.payment_date = None
                    schedule.days_late = 0
                schedule.save()

                if was_paid and schedule.status != 'paid':
                    installments_reopened += 1

                total_principal += p
                total_fees += f
                total_interest += i
                total_penalty += n

            if remaining > 0:
                # Schedule couldn't absorb the full amount (drift) — same
                # defensive fallback record_payment() itself uses: attribute
                # whatever's left to principal rather than leaving it stuck.
                total_principal += remaining

        # ── 3. Unwind the loan's aggregate balances ─────────────────────────
        loan.outstanding_principal += total_principal
        loan.principal_paid = max(Decimal('0.00'), loan.principal_paid - total_principal)
        loan.outstanding_interest += total_interest
        loan.interest_paid = max(Decimal('0.00'), loan.interest_paid - total_interest)
        loan.outstanding_fees += total_fees
        loan.fees_paid = max(Decimal('0.00'), loan.fees_paid - total_fees)
        loan.outstanding_penalties += total_penalty
        loan.penalties_paid = max(Decimal('0.00'), loan.penalties_paid - total_penalty)
        loan.total_paid = max(Decimal('0.00'), loan.total_paid - (
            total_principal + total_interest + total_fees + total_penalty
        ))
        loan.installments_paid = max(0, loan.installments_paid - installments_reopened)

        if loan.status == 'paid_off':
            loan.status = 'active'
            loan.closed_date = None

        loan.save()
        loan._calculate_arrears()
        loan.save(update_fields=['arrears_amount', 'days_in_arrears'])

        self.reversal_journal_entry = reversal_journal
