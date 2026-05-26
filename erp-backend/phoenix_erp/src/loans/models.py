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
from dateutil.relativedelta import relativedelta

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
        ('flat', 'Flat Rate'),
        ('reducing_balance', 'Reducing Balance'),
        ('compound', 'Compound Interest'),
    ]
    interest_calculation_method = models.CharField(
        max_length=20,
        choices=INTEREST_CALCULATION_METHODS,
        default='reducing_balance'
    )
    
    default_interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Annual interest rate percentage"
    )
    
    # Term configuration
    min_term_months = models.PositiveIntegerField(default=1)
    max_term_months = models.PositiveIntegerField(default=60)
    
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
    term_months = models.PositiveIntegerField(help_text="Loan term in months")
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
        
        if self.term_months:
            if self.term_months > self.product.max_term_months:
                raise ValidationError('Term exceeds product maximum')
            if self.term_months < self.product.min_term_months:
                raise ValidationError('Term below product minimum')
    
    @transaction.atomic
    def approve(self, user, approved_amount: Decimal = None):
        """Approve loan application"""
        if self.status != 'pending':
            raise ValidationError("Only pending loans can be approved")

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

        # Calculate processing fee
        self.processing_fee = self.product.calculate_processing_fee(self.approved_amount)

        # Calculate insurance premium
        self.insurance_amount = self.product.calculate_insurance(self.approved_amount)

        # Total upfront charges added to outstanding fees
        self.outstanding_fees = self.processing_fee + self.insurance_amount

        self.save()
    
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
            code='LN-DISB',
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
            description=f"Loan issued to {self.client.full_name} – {self.loan_number}",
        )

        # Credit: Cash / Bank account (ASSET type) — balance DECREASES
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cash_account,
            side=JournalEntryLine.CREDIT,
            amount=self.disbursed_amount,
            description=f"Cash disbursed for loan {self.loan_number}",
        )

        journal_entry.post()

        self.disbursement_journal_entry = journal_entry
        self.status = 'active'
        self.save()
    
    def _generate_repayment_schedule(self):
        """Generate repayment schedule"""
        # Calculate installment details
        principal_per_installment, interest_per_installment, total_per_installment = \
            self._calculate_installment_amounts()
        
        # Determine number of installments
        if self.repayment_frequency == 'daily':
            num_installments = self.term_months * 30
            date_increment = relativedelta(days=1)
        elif self.repayment_frequency == 'weekly':
            num_installments = self.term_months * 4
            date_increment = relativedelta(weeks=1)
        elif self.repayment_frequency == 'biweekly':
            num_installments = self.term_months * 2
            date_increment = relativedelta(weeks=2)
        elif self.repayment_frequency == 'monthly':
            num_installments = self.term_months
            date_increment = relativedelta(months=1)
        elif self.repayment_frequency == 'quarterly':
            num_installments = self.term_months // 3
            date_increment = relativedelta(months=3)
        
        self.number_of_installments = num_installments
        self.installment_amount = total_per_installment
        self.save()
        
        # Create schedule entries
        current_date = self.disbursement_date
        for i in range(1, num_installments + 1):
            current_date = current_date + date_increment
            
            LoanRepaymentSchedule.objects.create(
                loan=self,
                installment_number=i,
                due_date=current_date,
                principal_due=principal_per_installment,
                interest_due=interest_per_installment,
                total_due=total_per_installment,
                owner=self.owner,
                branch=self.branch,
                created_by=self.created_by
            )
    
    def _calculate_installment_amounts(self) -> tuple:
        """Calculate principal, interest, and total per installment"""
        if self.product.interest_calculation_method == 'flat':
            return self._calculate_flat_rate()
        elif self.product.interest_calculation_method == 'reducing_balance':
            return self._calculate_reducing_balance()
        else:
            return self._calculate_flat_rate()  # Default
    
    def _calculate_flat_rate(self) -> tuple:
        """Calculate with flat interest rate"""
        total_interest = (
            self.disbursed_amount * 
            (self.interest_rate / 100) * 
            (self.term_months / 12)
        )
        
        total_repayable = self.disbursed_amount + total_interest
        
        principal_per = self.disbursed_amount / self.number_of_installments
        interest_per = total_interest / self.number_of_installments
        total_per = total_repayable / self.number_of_installments
        
        return (principal_per, interest_per, total_per)
    
    def _calculate_reducing_balance(self) -> tuple:
        """Calculate with reducing balance (amortized)"""
        monthly_rate = (self.interest_rate / 100) / 12
        num_payments = self.number_of_installments
        
        # EMI formula
        if monthly_rate > 0:
            emi = (
                self.disbursed_amount * 
                monthly_rate * 
                ((1 + monthly_rate) ** num_payments) / 
                (((1 + monthly_rate) ** num_payments) - 1)
            )
        else:
            emi = self.disbursed_amount / num_payments
        
        # First installment breakdown (simplified - actual varies each installment)
        interest_first = self.disbursed_amount * monthly_rate
        principal_first = emi - interest_first
        
        return (principal_first, interest_first, emi)
    
    @transaction.atomic
    def record_payment(self, amount: Decimal, payment_date=None,
                       payment_account=None, received_by=None):
        """
        Record a loan repayment and create the corresponding GL journal entry.

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
        if self.status not in ['active', 'disbursed']:
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
        remaining = amount

        penalty_payment = min(remaining, self.outstanding_penalties)
        self.outstanding_penalties -= penalty_payment
        self.penalties_paid += penalty_payment
        remaining -= penalty_payment

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
            code='LN-PMT',
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

        # Debit: Cash received
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
            description=f"Payment received for loan {self.loan_number}",
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
                description=f"Principal (and unrouted income) repaid – {self.loan_number}",
            )

        if interest_account and interest_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=interest_account,
                side=JournalEntryLine.CREDIT,
                amount=interest_payment,
                description=f"Interest income – {self.loan_number}",
            )

        if fee_account and fee_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=fee_account,
                side=JournalEntryLine.CREDIT,
                amount=fee_payment,
                description=f"Fee income – {self.loan_number}",
            )

        if penalty_account and penalty_payment > 0:
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=penalty_account,
                side=JournalEntryLine.CREDIT,
                amount=penalty_payment,
                description=f"Penalty income – {self.loan_number}",
            )

        journal_entry.post()

        self.save()

        # Update schedule and arrears
        self._update_schedule_with_payment(amount, payment_date)
        self._calculate_arrears()

        return journal_entry
    
    def _update_schedule_with_payment(self, amount: Decimal, payment_date):
        """Update repayment schedule with payment"""
        remaining = amount
        
        # Get unpaid or partially paid installments
        schedules = self.repayment_schedule.filter(
            status__in=['pending', 'partial']
        ).order_by('due_date')
        
        for schedule in schedules:
            if remaining <= 0:
                break
            
            schedule_remaining = schedule.total_due - schedule.total_paid
            payment_to_schedule = min(remaining, schedule_remaining)
            
            # Allocate payment
            schedule.total_paid += payment_to_schedule
            
            # Mark as paid if fully paid
            if schedule.total_paid >= schedule.total_due:
                schedule.status = 'paid'
                self.installments_paid += 1
            else:
                schedule.status = 'partial'
            
            schedule.save()
            remaining -= payment_to_schedule
    
    def _calculate_arrears(self):
        """Calculate arrears"""
        today = timezone.now().date()
        
        overdue = self.repayment_schedule.filter(
            due_date__lt=today,
            status__in=['pending', 'partial']
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
        
        self.save()


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
        null=True,
        blank=True
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
    
    class Meta:
        unique_together = [('loan', 'guarantor')]
    
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
        # Also must not be the same person who approved the loan
        if self.loan.approved_by_id and approving_user.pk == self.loan.approved_by_id:
            raise ValidationError(
                "The person who approved the loan application cannot also approve disbursement "
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
        self.status = 'disbursed'
        self.disbursed_by = disbursed_by_user
        self.disbursement_date = disbursement_date or tz.now().date()
        self.save(update_fields=['status', 'disbursed_by', 'disbursement_date'])


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
            description=f"Write-off provision reduction — {loan.loan_number}",
        )

        # Cr. Loan Receivable (removes the asset from the balance sheet)
        JournalEntryLine.objects.create(
            transaction=journal,
            account=loan.account,
            side=JournalEntryLine.CREDIT,
            amount=self.total_write_off_amount,
            description=f"Loan receivable written off — {loan.loan_number}",
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