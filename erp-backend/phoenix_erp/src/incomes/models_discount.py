# incomes/models_discount.py
"""
Generic Discount & Waiver System
Supports scholarships, staff benefits, insurance coverage, promotions
Works across domains: schools, hospitals, retail, microfinance
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class DiscountProgram(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Defines a discount/scholarship program
    
    Examples:
    - School: Merit Scholarship, Staff Children Discount, Hardship Waiver
    - Hospital: Insurance Coverage, Low-Income Patient Aid
    - Retail: Loyalty Discount, Promotional Discount
    - Microfinance: First-Time Borrower Waiver, Low-Income Fee Waiver
    """
    
    # Identification
    program_code = models.CharField(
        max_length=50,
        db_index=True,
        blank=True,
        help_text="Unique program identifier per tenant (e.g., SCHOLAR-MERIT-2026). Auto-generated if not provided."
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, help_text="Program description. Auto-generated if not provided.")
    
    # Type determines behavior and accounting treatment
    PROGRAM_TYPE_CHOICES = [
        ('scholarship', 'Scholarship/Grant'),
        ('staff_benefit', 'Staff Benefit'),
        ('discount', 'Customer Discount'),
        ('waiver', 'Fee Waiver'),
        ('insurance', 'Insurance Coverage'),
        ('promotion', 'Promotional Discount'),
    ]
    program_type = models.CharField(
        max_length=20,
        choices=PROGRAM_TYPE_CHOICES,
        db_index=True
    )
    
    # Discount mechanism
    DISCOUNT_TYPE_CHOICES = [
        ('percentage', 'Percentage Discount'),
        ('fixed_amount', 'Fixed Amount Discount'),
        ('full_waiver', 'Full Waiver (100%)'),
    ]
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPE_CHOICES)
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Percentage (0-100) or fixed amount"
    )
    
    # Budget & Limits
    budget_allocated = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Total budget for this program (0 = unlimited)"
    )
    budget_used = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0
    )
    max_recipients = models.IntegerField(
        default=0,
        help_text="Maximum number of recipients (0 = unlimited)"
    )
    current_recipients = models.IntegerField(default=0)
    
    # Validity Period
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    
    # Renewable
    is_renewable = models.BooleanField(
        default=False,
        help_text="Can be renewed each term/year"
    )
    RENEWAL_PERIOD_CHOICES = [
        ('term', 'Per Term'),
        ('semester', 'Per Semester'),
        ('year', 'Per Year'),
        ('none', 'One-Time'),
    ]
    renewal_period = models.CharField(
        max_length=20,
        choices=RENEWAL_PERIOD_CHOICES,
        default='none'
    )
    
    # Approval required
    requires_approval = models.BooleanField(default=True)
    approval_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discount_approval_programs',
        help_text="Optional workflow for approval process (runs after discount is calculated)"
    )
    
    # Eligibility validation workflow (NEW)
    eligibility_workflow = models.ForeignKey(
        'automations.WorkflowTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discount_eligibility_programs',
        help_text="Optional workflow for advanced eligibility checks (query/calculate only, no transactions)"
    )
    
    # Workflow execution tracking
    eligibility_workflow_required = models.BooleanField(
        default=False,
        help_text="If true, eligibility_workflow must pass for discount to apply"
    )
    workflow_timeout_seconds = models.IntegerField(
        default=30,
        help_text="Max execution time for eligibility workflow"
    )
    
    # Eligibility criteria (stored as JSON for flexibility)
    eligibility_criteria = models.JSONField(
        default=dict,
        blank=True,
        help_text="Flexible criteria: GPA threshold, income bracket, etc."
    )
    
    # Accounting
    discount_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='discount_programs',
        help_text="Account for posting discounts (Contra-Revenue or Expense)"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['program_code']
        unique_together = [('owner', 'branch', 'program_code')]
        indexes = [
            models.Index(fields=['program_type', 'is_active']),
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['branch', 'is_active']),
        ]
        verbose_name = 'Discount Program'
        verbose_name_plural = 'Discount Programs'
    
    def __str__(self):
        return f"{self.program_code} - {self.name}"
    
    def _validate_workflow_no_transactions(self, workflow):
        """Ensure workflow doesn't contain transaction steps"""
        if not workflow or not workflow.workflow_definition:
            return
        
        definition = workflow.workflow_definition
        steps = definition.get('steps', [])
        
        for step in steps:
            step_type = step.get('type', '')
            if step_type == 'transaction':
                raise ValidationError({
                    'eligibility_workflow': (
                        f"Eligibility workflows cannot contain transaction steps. "
                        f"Step '{step.get('id')}' is a transaction step. "
                        f"Only query, calculate, and loop steps are allowed."
                    )
                })
    
    @property
    def budget_remaining(self):
        """Calculate remaining budget"""
        if self.budget_allocated == 0:  # Unlimited
            return Decimal('999999999.99')
        return self.budget_allocated - self.budget_used
    
    @property
    def budget_utilization_percent(self):
        """Calculate budget utilization percentage"""
        if self.budget_allocated == 0:
            return Decimal('0.00')
        return (self.budget_used / self.budget_allocated) * 100
    
    @property
    def is_within_budget(self):
        """Check if program is within budget"""
        if self.budget_allocated == 0:  # Unlimited
            return True
        return self.budget_used < self.budget_allocated
    
    @property
    def has_recipient_capacity(self):
        """Check if program can accept more recipients"""
        if self.max_recipients == 0:  # Unlimited
            return True
        return self.current_recipients < self.max_recipients
    
    @property
    def is_valid(self):
        """Check if program is currently valid"""
        today = timezone.now().date()
        if not self.is_active:
            return False
        if today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False
        return True
    
    def clean(self):
        """Validate model data"""
        super().clean()
        
        # Validate discount percentage
        if self.discount_type == 'percentage':
            if not (0 <= self.discount_value <= 100):
                raise ValidationError({
                    'discount_value': 'Percentage must be between 0 and 100'
                })
        
        # Validate eligibility workflow doesn't have transaction steps
        if self.eligibility_workflow:
            self._validate_workflow_no_transactions(self.eligibility_workflow)
        
        if self.discount_type == 'full_waiver':
            self.discount_value = Decimal('100.00')
        
        if self.budget_allocated < 0:
            raise ValidationError({
                'budget_allocated': 'Budget cannot be negative'
            })
        
        if self.max_recipients < 0:
            raise ValidationError({
                'max_recipients': 'Max recipients cannot be negative'
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
        
        # Auto-generate program_code if not provided
        if not self.program_code:
            from datetime import datetime
            year = datetime.now().year
            # Generate based on type and name
            type_prefix = self.program_type[:4].upper()
            name_suffix = self.name[:15].upper().replace(' ', '-') if self.name else 'PROG'
            base_code = f"{type_prefix}-{name_suffix}-{year}"
            
            # Ensure uniqueness
            code = base_code
            counter = 1
            while DiscountProgram.objects.filter(program_code=code).exists():
                code = f"{base_code}-{counter}"
                counter += 1
            self.program_code = code
        
        # Auto-generate description if not provided
        if not self.description:
            type_label = dict(self.PROGRAM_TYPE_CHOICES).get(self.program_type, self.program_type)
            discount_label = dict(self.DISCOUNT_TYPE_CHOICES).get(self.discount_type, self.discount_type)
            self.description = f"{type_label} program offering {discount_label} for {self.name}"
        
        self.full_clean()
        super().save(*args, **kwargs)


class DiscountApplication(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    A client's application for a discount/scholarship
    
    Workflow:
    1. Client submits application (draft → submitted)
    2. Reviewer evaluates (submitted → under_review)
    3. Decision made (under_review → approved/rejected)
    4. If approved, discounts can be applied to receivables
    """
    
    application_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Auto-generated application number"
    )
    
    program = models.ForeignKey(
        DiscountProgram,
        on_delete=models.PROTECT,
        related_name='applications'
    )
    
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.PROTECT,
        related_name='discount_applications'
    )
    
    # Application details
    application_date = models.DateField(default=timezone.now)
    reason = models.TextField(
        help_text="Why applying for this discount/scholarship"
    )
    supporting_documents = models.JSONField(
        default=list,
        blank=True,
        help_text="List of document URLs/paths"
    )
    
    # Status workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
        ('revoked', 'Revoked'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Approval tracking
    reviewed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discount_applications_reviewed'
    )
    review_date = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    
    # Validity period (after approval)
    effective_from = models.DateField(
        null=True,
        blank=True,
        help_text="When discount becomes effective"
    )
    effective_to = models.DateField(
        null=True,
        blank=True,
        help_text="When discount expires"
    )
    
    # Override discount value (if different from program default)
    custom_discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Override program default if needed (e.g., partial scholarship)"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-application_date']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['program', 'status']),
            models.Index(fields=['application_number']),
        ]
        verbose_name = 'Discount Application'
        verbose_name_plural = 'Discount Applications'
    
    def __str__(self):
        return f"{self.application_number} - {self.client.name} - {self.program.name}"
    
    @property
    def actual_discount_value(self):
        """Returns custom value if set, otherwise program default"""
        return self.custom_discount_value or self.program.discount_value
    
    @property
    def is_active(self):
        """Check if application is currently active"""
        if self.status != 'approved':
            return False
        today = timezone.now().date()
        if self.effective_from and today < self.effective_from:
            return False
        if self.effective_to and today > self.effective_to:
            return False
        return True
    
    def approve(self, approved_by, effective_from, effective_to, notes='', custom_value=None):
        """Approve application"""
        if self.status not in ['submitted', 'under_review']:
            raise ValidationError("Can only approve submitted/under_review applications")
        
        # Check program capacity
        if not self.program.is_within_budget:
            raise ValidationError(
                f"Program budget exceeded. Remaining: {self.program.budget_remaining}"
            )
        
        if not self.program.has_recipient_capacity:
            raise ValidationError(
                f"Program at maximum capacity ({self.program.max_recipients} recipients)"
            )
        
        self.status = 'approved'
        self.reviewed_by = approved_by
        self.review_date = timezone.now()
        self.review_notes = notes
        self.effective_from = effective_from
        self.effective_to = effective_to
        
        if custom_value is not None:
            self.custom_discount_value = custom_value
        
        self.save()
        
        # Update program stats
        self.program.current_recipients += 1
        self.program.save()
        
        return self
    
    def reject(self, rejected_by, notes=''):
        """Reject application"""
        if self.status not in ['submitted', 'under_review']:
            raise ValidationError("Can only reject submitted/under_review applications")
        
        self.status = 'rejected'
        self.reviewed_by = rejected_by
        self.review_date = timezone.now()
        self.review_notes = notes
        self.save()
        
        return self
    
    def revoke(self, revoked_by, notes=''):
        """Revoke an approved application"""
        if self.status != 'approved':
            raise ValidationError("Can only revoke approved applications")
        
        self.status = 'revoked'
        self.reviewed_by = revoked_by
        self.review_date = timezone.now()
        self.review_notes = notes
        self.save()
        
        # Update program stats
        self.program.current_recipients -= 1
        self.program.save()
        
        return self
    
    def submit(self):
        """Submit draft application"""
        if self.status != 'draft':
            raise ValidationError("Can only submit draft applications")
        
        self.status = 'submitted'
        self.save()
        return self
    
    def clean(self):
        """Validate application"""
        if self.custom_discount_value:
            if self.program.discount_type == 'percentage':
                if not (0 <= self.custom_discount_value <= 100):
                    raise ValidationError({
                        'custom_discount_value': 'Percentage must be between 0 and 100'
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
        
        # Auto-generate application number if not set
        if not self.application_number:
            from django.db import transaction
            prefix = 'APP'
            year = timezone.now().year
            
            # Use atomic transaction with select_for_update to prevent race conditions
            with transaction.atomic():
                # Lock and get the last application for this branch and year
                last_app = DiscountApplication.all_objects.filter(
                    branch=self.branch,
                    application_number__startswith=f"{prefix}-{year}-"
                ).order_by('-application_number').select_for_update().first()
                
                if last_app and last_app.application_number:
                    # Extract the sequence number from the last application
                    try:
                        last_seq = int(last_app.application_number.split('-')[-1])
                        count = last_seq + 1
                    except (ValueError, IndexError):
                        count = 1
                else:
                    count = 1
                    
                self.application_number = f"{prefix}-{year}-{count:05d}"
        
        self.full_clean()
        super().save(*args, **kwargs)


class AppliedDiscount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Actual discount applied to a receivable (invoice, fee entitlement, etc.)
    
    This is the execution of an approved application.
    Creates accounting journal entry to reduce AR balance.
    """
    
    # Link to approved application
    application = models.ForeignKey(
        DiscountApplication,
        on_delete=models.PROTECT,
        related_name='applied_discounts'
    )
    
    # What is being discounted (links to unified receivables)
    receivable = models.ForeignKey(
        'receivables.CustomerReceivable',
        on_delete=models.PROTECT,
        related_name='discounts',
        help_text="The receivable being discounted"
    )
    
    # Discount details
    discount_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Actual discount amount applied"
    )
    
    # Accounting
    is_posted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether discount has been posted to accounting"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discounts_posted'
    )
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discount_entries',
        help_text="Journal entry created when discount was posted"
    )
    
    # Reversal support
    is_reversed = models.BooleanField(default=False, db_index=True)
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discounts_reversed'
    )
    reversal_reason = models.TextField(blank=True)
    reversal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discount_reversals',
        help_text="Journal entry created when discount was reversed"
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['application', 'is_posted']),
            models.Index(fields=['receivable', 'is_posted']),
            models.Index(fields=['is_reversed']),
        ]
        verbose_name = 'Applied Discount'
        verbose_name_plural = 'Applied Discounts'
    
    def __str__(self):
        return f"Discount: {self.discount_amount} on {self.receivable}"
    
    @property
    def can_be_posted(self):
        """Check if discount can be posted"""
        if self.is_posted:
            return False
        if self.is_reversed:
            return False
        if self.application.status != 'approved':
            return False
        return True
    
    @property
    def can_be_reversed(self):
        """Check if discount can be reversed"""
        if not self.is_posted:
            return False
        if self.is_reversed:
            return False
        return True
    
    def post(self, user):
        """
        Post discount to accounting
        
        Creates journal entry:
        DR: Discount/Scholarship Account (Contra-Revenue or Expense)
        CR: Accounts Receivable
        
        This reduces the customer's AR balance.
        """
        if not self.can_be_posted:
            raise ValidationError("Discount cannot be posted")
        
        # Import here to avoid circular imports
        from incomes.services.discount_service import DiscountService
        
        journal_entry = DiscountService.create_discount_journal_entry(
            applied_discount=self,
            user=user
        )
        
        self.is_posted = True
        self.posted_at = timezone.now()
        self.posted_by = user
        self.journal_entry = journal_entry
        self.save()
        
        # Update program budget
        program = self.application.program
        program.budget_used += self.discount_amount
        program.save()
        
        # Reduce receivable balance by increasing amount_paid
        # Note: We don't modify balance directly because CustomerReceivable.save()
        # auto-computes it as original_amount - amount_paid for accounting integrity
        self.receivable.amount_paid += self.discount_amount
        self.receivable.save()
        
        return journal_entry
    
    def reverse(self, user, reason=''):
        """
        Reverse a posted discount
        
        Creates reversal journal entry (opposite of original):
        DR: Accounts Receivable (restore balance)
        CR: Discount/Scholarship Account (reverse discount)
        
        Used when:
        - Student loses scholarship (poor grades, violation)
        - Application was approved in error
        - Policy change requires reversal
        """
        if not self.can_be_reversed:
            raise ValidationError("Discount cannot be reversed")
        
        # Import here to avoid circular imports
        from incomes.services.discount_service import DiscountService
        
        reversal_entry = DiscountService.create_reversal_journal_entry(
            applied_discount=self,
            user=user,
            reason=reason
        )
        
        # Restore receivable balance by reducing amount_paid
        # Note: We don't modify balance directly because CustomerReceivable.save()
        # auto-computes it as original_amount - amount_paid for accounting integrity
        self.receivable.amount_paid -= self.discount_amount
        self.receivable.save()
        
        # Update program budget
        program = self.application.program
        program.budget_used -= self.discount_amount
        program.save()
        
        # Mark as reversed
        self.is_reversed = True
        self.reversed_at = timezone.now()
        self.reversed_by = user
        self.reversal_reason = reason
        self.reversal_entry = reversal_entry
        self.save()
        
        return reversal_entry
    
    def clean(self):
        """Validate applied discount"""
        if self.discount_amount <= 0:
            raise ValidationError({
                'discount_amount': 'Discount amount must be positive'
            })
        
        if self.discount_amount > self.receivable.original_amount:
            raise ValidationError({
                'discount_amount': f'Discount amount ({self.discount_amount}) cannot exceed '
                                  f'receivable amount ({self.receivable.original_amount})'
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
        
        self.full_clean()
        super().save(*args, **kwargs)
