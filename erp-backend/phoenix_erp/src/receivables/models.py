# receivables/models.py
"""
Unified Accounts Receivable system
Provides AR layer over invoices, entitlements, and loans with flexible tenant configuration
"""
from django.db import models, transaction
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from clients.models import Client


class CustomerReceivable(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Unified view of all amounts owed by customers
    Links to: Invoice, FeeEntitlement, Loan (doesn't duplicate data)
    Auto-created via signals when invoices/entitlements/loans are created
    """
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='receivables'
    )
    
    # Polymorphic linkage to source
    RECEIVABLE_TYPES = [
        ('invoice', 'Invoice'),
        ('entitlement', 'Fee Entitlement'),
        ('loan', 'Loan'),
        ('other', 'Other'),
    ]
    receivable_type = models.CharField(
        max_length=20,
        choices=RECEIVABLE_TYPES,
        db_index=True
    )
    
    # Generic FK to actual receivable (Invoice, FeeEntitlement, or Loan)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    
    # Cached for performance (updated by signals when source changes)
    reference_number = models.CharField(max_length=50, db_index=True)
    original_amount = models.DecimalField(max_digits=18, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    # NOTE: balance is now a computed property (original_amount - amount_paid)
    # but keeping field for database queries and backwards compatibility
    # Direct writes are blocked by save() protection
    balance = models.DecimalField(max_digits=18, decimal_places=2)
    due_date = models.DateField(db_index=True)
    
    # Aging calculation
    AGING_BUCKETS = [
        ('current', 'Current (Not Due)'),
        ('1-30', '1-30 Days Overdue'),
        ('31-60', '31-60 Days Overdue'),
        ('61-90', '61-90 Days Overdue'),
        ('90+', '90+ Days Overdue'),
    ]
    aging_bucket = models.CharField(
        max_length=20,
        choices=AGING_BUCKETS,
        default='current',
        db_index=True
    )
    days_overdue = models.IntegerField(default=0)
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending Payment'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('overdue', 'Overdue'),
        ('written_off', 'Written Off'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    
    # Interest on overdue (tenant configurable)
    overdue_interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Annual interest rate % for overdue amounts (0 = no interest)"
    )
    accrued_interest = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
        help_text="Interest accumulated on overdue balance"
    )
    last_interest_calculation = models.DateField(null=True, blank=True)
    
    # Collection management
    last_reminder_sent = models.DateField(null=True, blank=True)
    reminder_count = models.IntegerField(default=0)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_receivables',
        help_text="Collection agent assigned to this receivable"
    )
    collection_notes = models.TextField(blank=True)
    
    # Note: InstallmentPlan removed - loan payment schedules handled in loans app
    
    objects = OwnerBranchManager()
    
    def save(self, *args, **kwargs):
        """
        Auto-assign tenant if not provided.
        Prevent direct balance writes - balance should be computed from original_amount - amount_paid.
        """
        # Auto-assign tenant
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        # ACCOUNTING INTEGRITY PROTECTION:
        # Automatically compute balance from original_amount - amount_paid
        # This ensures balance is always accurate and prevents manual tampering
        update_fields = kwargs.get('update_fields', None)
        
        if update_fields is None or 'balance' not in update_fields:
            # Auto-compute balance when not explicitly setting it
            self.balance = self.original_amount - self.amount_paid
            
            # If update_fields is specified, add 'balance' to ensure it's saved
            if update_fields is not None:
                update_fields = list(update_fields) + ['balance']
                kwargs['update_fields'] = update_fields
        else:
            # If explicitly updating balance field, verify caller is authorized
            import inspect
            import os
            from django.conf import settings as django_settings
            
            # Allow bypass in tests or dev mode (use with extreme caution)
            if getattr(django_settings, 'DISABLE_BALANCE_PROTECTION', False) or \
               os.environ.get('DISABLE_BALANCE_PROTECTION') == 'true':
                super().save(*args, **kwargs)
                return
            
            # Get the calling function (2 levels up: save <- caller)
            frame = inspect.currentframe()
            try:
                caller_frame = frame.f_back.f_back if frame and frame.f_back else None
                caller_function = caller_frame.f_code.co_name if caller_frame else 'unknown'
                caller_class = caller_frame.f_locals.get('self', None).__class__.__name__ if caller_frame and 'self' in caller_frame.f_locals else 'unknown'
                
                # Allow only from authorized mechanisms (signals, bulk operations)
                allowed_functions = {'_do_update', 'bulk_update', 'refresh_from_db', '_do_insert', 'create_or_update_receivable_for_income_invoice', 'create_or_update_receivable_for_inventory_invoice', 'create_or_update_receivable_for_entitlement', 'create_or_update_receivable_for_loan'}
                allowed_classes = {'CustomerReceivable', 'QuerySet'}
                
                if caller_function not in allowed_functions and caller_class not in allowed_classes:
                    raise PermissionError(
                        f"Direct balance updates are prohibited on CustomerReceivable. \n"
                        f"Balance is automatically computed from original_amount - amount_paid. \n"
                        f"Update those fields instead. Called from: {caller_class}.{caller_function}"
                    )
            finally:
                del frame
        
        super().save(*args, **kwargs)
    
    class Meta:
        ordering = ['-due_date', '-created_at']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['aging_bucket', 'status']),
            models.Index(fields=['due_date', 'status']),
            models.Index(fields=['receivable_type', 'status']),
            models.Index(fields=['owner', 'branch', 'status']),
        ]
    
    def __str__(self):
        return f"{self.reference_number} - {self.client.full_name}: ₦{self.balance}"
    
    def update_aging(self):
        """Calculate and update aging bucket"""
        today = timezone.now().date()
        days_overdue = (today - self.due_date).days
        
        if days_overdue <= 0:
            bucket = 'current'
            status = self.status if self.status != 'overdue' else 'pending'
        elif days_overdue <= 30:
            bucket = '1-30'
            status = 'overdue' if self.balance > 0 else self.status
        elif days_overdue <= 60:
            bucket = '31-60'
            status = 'overdue' if self.balance > 0 else self.status
        elif days_overdue <= 90:
            bucket = '61-90'
            status = 'overdue' if self.balance > 0 else self.status
        else:
            bucket = '90+'
            status = 'overdue' if self.balance > 0 else self.status
        
        self.aging_bucket = bucket
        self.days_overdue = max(0, days_overdue)
        
        # Update status if paid
        if self.balance <= 0:
            status = 'paid'
        
        self.status = status
        self.save(update_fields=['aging_bucket', 'days_overdue', 'status'])
    
    def calculate_overdue_interest(self, as_of_date=None):
        """
        Calculate interest on overdue balance
        Only applies if overdue_interest_rate > 0
        """
        if self.overdue_interest_rate <= 0:
            return Decimal('0')
        
        if self.status not in ['overdue', 'partial']:
            return Decimal('0')
        
        as_of_date = as_of_date or timezone.now().date()
        
        # Calculate from last calculation or due date
        start_date = self.last_interest_calculation or self.due_date
        
        if as_of_date <= start_date:
            return Decimal('0')
        
        # Calculate daily interest
        days_elapsed = (as_of_date - start_date).days
        daily_rate = self.overdue_interest_rate / Decimal('365') / Decimal('100')
        interest = self.balance * daily_rate * Decimal(str(days_elapsed))
        
        return interest.quantize(Decimal('0.01'))
    
    @transaction.atomic
    def apply_overdue_interest(self):
        """Apply calculated interest to receivable"""
        interest = self.calculate_overdue_interest()
        
        if interest > 0:
            self.accrued_interest += interest
            self.balance += interest
            self.last_interest_calculation = timezone.now().date()
            self.save(update_fields=['accrued_interest', 'balance', 'last_interest_calculation'])
            
            # Log interest application
            ReceivableActivityLog.objects.create(
                receivable=self,
                activity_type='interest_applied',
                amount=interest,
                description=f"Interest applied: ₦{interest}",
                owner=self.owner,
                branch=self.branch,
                tenant=self.tenant,
            )


# NOTE: InstallmentPlan, Installment, CustomerCreditLimit removed - moved to loans app
# Invoice payment tracking is handled by Invoice.amount_paid field
# Loan payment schedules belong in loans app, not AR layer


class ReceivableActivityLog(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Activity log for receivables (payments, reminders, adjustments, etc.)
    """
    receivable = models.ForeignKey(
        CustomerReceivable,
        on_delete=models.CASCADE,
        related_name='activity_logs'
    )
    
    ACTIVITY_TYPES = [
        ('payment', 'Payment Received'),
        ('adjustment', 'Balance Adjustment'),
        ('interest_applied', 'Interest Applied'),
        ('reminder_sent', 'Reminder Sent'),
        ('status_change', 'Status Changed'),
        ('assigned', 'Assigned to Collector'),
        ('note_added', 'Note Added'),
        ('written_off', 'Written Off'),
        ('write_off', 'Write Off'),
        ('reversed', 'Payment Reversed'),
        ('credit_note_applied', 'Credit Note Applied'),
        ('refund', 'Refund Issued'),
    ]
    activity_type = models.CharField(max_length=50, choices=ACTIVITY_TYPES)
    
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount involved (if applicable)"
    )
    
    description = models.TextField()
    
    # User who performed action
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    
    # Note: PaymentAllocation removed - not needed since Invoice tracks amount_paid
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['receivable', 'activity_type']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.activity_type} - {self.receivable.reference_number}"


class CustomerStatement(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Generated customer account statements
    Shows all transactions for a period
    """
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='statements'
    )
    
    statement_number = models.CharField(max_length=50, unique=True)
    statement_date = models.DateField()
    period_start = models.DateField()
    period_end = models.DateField()
    
    # Balances
    opening_balance = models.DecimalField(max_digits=18, decimal_places=2)
    closing_balance = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Summary
    total_charges = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_payments = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Generation
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='generated_statements'
    )
    generated_at = models.DateTimeField(auto_now_add=True)
    
    # Delivery
    DELIVERY_METHODS = [
        ('email', 'Email'),
        ('print', 'Print'),
        ('download', 'Download'),
        ('portal', 'Customer Portal'),
    ]
    sent_via = models.CharField(max_length=20, choices=DELIVERY_METHODS, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_to = models.EmailField(blank=True)
    
    # PDF file
    pdf_file = models.FileField(
        upload_to='statements/%Y/%m/',
        null=True,
        blank=True
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-statement_date', '-created_at']
        indexes = [
            models.Index(fields=['client', 'statement_date']),
            models.Index(fields=['statement_number']),
        ]
    
    def __str__(self):
        return f"Statement {self.statement_number} - {self.client.full_name}"