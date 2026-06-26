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
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from products.models import Product
from clients.models import Client


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
            "Minimum calendar days from disbursement before the first repayment is due. "
            "0 = follows normal cadence. E.g. 14 means first weekly repayment won't be before day 14."
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
        help_text='ASSET account debited in daily interest accrual entries.',
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

    def calculate_late_penalty(self, outstanding_amount: Decimal, days_late: int) -> Decimal:
        """Calculate late payment penalty"""
        if days_late <= self.grace_period_days:
            return Decimal('0.00')
        
        if self.late_payment_penalty_type == 'fixed':
            return self.late_payment_penalty
        else:  # percentage per day
            return (outstanding_amount * self.late_payment_penalty * days_late) / 100


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
        self.disbursed_amount = self.approved_amount

        # Set outstanding principal
        self.outstanding_principal = self.disbursed_amount

        # Calculate repayment schedule (calls self.save() internally)
        self._generate_repayment_schedule()

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

    def _generate_repayment_schedule(self):
        """Delegate schedule generation to RepaymentScheduleService."""
        from .schedule_service import RepaymentScheduleService
        RepaymentScheduleService.generate(self)
    
    @transaction.atomic
    def record_payment(self, amount: Decimal, payment_date=None,
                       payment_account=None, received_by=None,
                       spillover_savings_account=None, spillover_amount=None):
        """
        Record a loan repayment and create the corresponding GL journal entry.

        When spillover_savings_account and spillover_amount are provided the excess
        is included in the SAME journal entry as a third credit line so that the
        cashier's cash account is debited only once for the total amount received:

            Dr. Cash / Bank (payment_account)         — total received (amount + spillover)
            Cr. Loan Receivable / Income accounts     — loan portion
            Cr. Member Savings (spillover GL account) — excess credited to savings

        Payments are applied in priority order: penalties → interest → fees → principal.

        GL entry (LN-PMT series):
            Dr. Cash / Bank (payment_account)         — ASSET goes up, money received
            Cr. Loan Receivable (self.account)         — LOAN/ASSET goes down (principal)
            Cr. Interest Income (interest_income_acct) — INCOME goes up
            Cr. Fee Income (fee_income_acct)           — INCOME goes up
            Cr. Penalty Income (penalty_income_acct)   — INCOME goes up

        When an income account is not configured on the Loan Product the
        corresponding amount is credited to the Loan Receivable account instead
        (conservative fallback that keeps the transaction balanced).

        Args:
            amount: Total payment amount received.
            payment_date: Date of payment (defaults to today).
            payment_account: The Cash/Bank GL Account that received the payment.
            received_by: The User recording the payment (used as created_by on
                the journal entry).

        Raises:
            ValidationError: if the loan is not active/disbursed, if no
                payment_account is provided, or if amount exceeds total outstanding.
        """
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

        # ── Apply payment in priority order ──────────────────────────────
        # CBN NPL rule: when interest is suspended (90+ DPD), apply cash to
        # principal first so the loan balance reduces before income is recognised.
        remaining = amount

        penalty_payment = min(remaining, self.outstanding_penalties)
        self.outstanding_penalties -= penalty_payment
        self.penalties_paid += penalty_payment
        remaining -= penalty_payment

        if self.interest_suspended:
            # NPL priority: principal → fees → interest
            principal_payment = min(remaining, self.outstanding_principal)
            self.outstanding_principal -= principal_payment
            self.principal_paid += principal_payment
            remaining -= principal_payment

            fee_payment = min(remaining, self.outstanding_fees)
            self.outstanding_fees -= fee_payment
            self.fees_paid += fee_payment
            remaining -= fee_payment

            interest_payment = min(remaining, self.outstanding_interest)
            self.outstanding_interest -= interest_payment
            self.interest_paid += interest_payment
            remaining -= interest_payment
        else:
            # Normal priority: interest → fees → principal
            interest_payment = min(remaining, self.outstanding_interest)
            self.outstanding_interest -= interest_payment
            self.interest_paid += interest_payment
            remaining -= interest_payment

            fee_payment = min(remaining, self.outstanding_fees)
            self.outstanding_fees -= fee_payment
            self.fees_paid += fee_payment
            remaining -= fee_payment

            principal_payment = min(remaining, self.outstanding_principal)
            self.outstanding_principal -= principal_payment
            self.principal_paid += principal_payment
            remaining -= principal_payment

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

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=payment_date,
            description=f"Loan repayment – {self.loan_number}",
            # workflow_reference is intentionally left None so multiple payments
            # per loan don't violate the unique_together constraint.
            owner=self.owner,
            branch=self.branch,
            created_by=received_by,
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
        interest_account  = self.product.interest_income_account
        fee_account       = self.product.fee_income_account
        penalty_account   = self.product.penalty_income_account

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
        self._update_schedule_with_payment(
            amount, payment_date,
            penalty=penalty_payment,
            interest=interest_payment,
            fees=fee_payment,
            principal=principal_payment,
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
    ):
        """
        Apply a payment across schedule installments in due-date order.
        Updates per-component paid fields (principal, interest, fees, penalty)
        proportionally and records payment_date / days_late on fully settled rows.
        """
        remaining = amount

        schedules = self.repayment_schedule.filter(
            status__in=['pending', 'partial', 'overdue']
        ).order_by('due_date')

        for schedule in schedules:
            if remaining <= 0:
                break

            installment_remaining = schedule.total_due - schedule.total_paid
            payment_to_schedule = min(remaining, installment_remaining)

            # Proportional breakdown within this installment
            if schedule.total_due > 0 and payment_to_schedule > 0:
                ratio = payment_to_schedule / schedule.total_due
                schedule.principal_paid = min(
                    schedule.principal_due,
                    (schedule.principal_paid + schedule.principal_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.interest_paid = min(
                    schedule.interest_due,
                    (schedule.interest_paid + schedule.interest_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.fees_paid = min(
                    schedule.fees_due,
                    (schedule.fees_paid + schedule.fees_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.penalty_paid = min(
                    schedule.penalty_due,
                    (schedule.penalty_paid + schedule.penalty_due * ratio).quantize(Decimal('0.01')),
                )

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
            remaining -= payment_to_schedule
    
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
            code='LN-WO',
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
        new_term_unit: str,
        new_interest_rate: Decimal,
        new_repayment_frequency: str,
        effective_date=None,
        restructured_by=None,
        reason: str = '',
        notes: str = '',
    ):
        """
        Restructure a loan: save old terms, apply new ones, regenerate schedule.

        Old pending/overdue installments are cancelled ('restructured').
        A LoanRestructure audit record is created.
        The loan status is set to 'active' and interest suspension cleared.

        Args:
            new_term: New term value (interpreted in new_term_unit).
            new_term_unit: 'days' | 'weeks' | 'months'.
            new_interest_rate: New annual interest rate (%).
            new_repayment_frequency: 'daily'|'weekly'|'biweekly'|'monthly'|'quarterly'.
            effective_date: Date the restructure takes effect (defaults to today).
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

        from django.utils import timezone as _tz
        effective_date = effective_date or _tz.now().date()

        # ── Snapshot old terms ────────────────────────────────────────────
        restructure = LoanRestructure(
            loan=self,
            effective_date=effective_date,
            restructured_by=restructured_by,
            reason=reason,
            notes=notes,
            old_term=self.term_months,
            old_term_unit=self.term_unit,
            old_interest_rate=self.interest_rate,
            old_repayment_frequency=self.repayment_frequency,
            old_outstanding_principal=self.outstanding_principal,
            old_installment_amount=self.installment_amount,
            old_maturity_date=self.maturity_date,
        )

        # ── Cancel remaining installments ─────────────────────────────────
        self.repayment_schedule.filter(
            status__in=['pending', 'partial', 'overdue']
        ).update(status='restructured')

        # ── Apply new terms ───────────────────────────────────────────────
        self.term_months = new_term
        self.term_unit = new_term_unit
        self.interest_rate = new_interest_rate
        self.repayment_frequency = new_repayment_frequency
        self.disbursement_date = effective_date   # regenerate from today

        # Reset arrears — restructure is a fresh start
        self.days_in_arrears = 0
        self.arrears_amount = Decimal('0.00')
        self.status = 'active'
        self.interest_suspended = False

        # Regenerate schedule from outstanding principal
        self._generate_repayment_schedule()

        # Update maturity/first payment dates from new schedule
        new_schedules = self.repayment_schedule.filter(
            status='pending'
        ).order_by('due_date')
        if new_schedules.exists():
            self.first_payment_date = new_schedules.first().due_date
            self.maturity_date = new_schedules.last().due_date

        self.save()

        # ── Save restructure record with new installment amount ───────────
        restructure.new_term = new_term
        restructure.new_term_unit = new_term_unit
        restructure.new_interest_rate = new_interest_rate
        restructure.new_repayment_frequency = new_repayment_frequency
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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-effective_date']

    def __str__(self):
        return f"Restructure #{self.pk} — {self.loan.loan_number} on {self.effective_date}"


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
    Guarantor for loan
    """
    loan = models.ForeignKey(
        LoanAccount,
        on_delete=models.CASCADE,
        related_name='guarantors'
    )
    
    guarantor = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='guaranteed_loans',
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
        unique_together = [('loan', 'guarantor')]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.guarantor_id and self.loan_id:
            if self.guarantor_id == self.loan.client_id:
                raise ValidationError(
                    "A borrower cannot be their own guarantor."
                )
            # Block guarantor already serving on another active loan
            conflict = LoanGuarantor.objects.filter(
                guarantor_id=self.guarantor_id,
                loan__status__in=self.ACTIVE_LOAN_STATUSES,
            ).exclude(pk=self.pk).exists()
            if conflict:
                raise ValidationError(
                    f"{self.guarantor.full_name} is already an active guarantor "
                    "on another loan and cannot be used until that loan is closed."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.guarantor.full_name} for {self.loan.loan_number}"


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
            code='LN-WO',
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
        limit_choices_to={'account_type': Account.INCOME},
        related_name='loan_product_fee_lines',
        help_text="Income GL account where this fee is posted.",
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

    objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"RepayRequest #{self.pk} — {self.loan.loan_number} "
            f"₦{self.amount} ({self.status})"
        )
