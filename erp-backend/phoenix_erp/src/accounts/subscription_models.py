"""
SaaS Billing Models - Multi-Tenant Subscription Management

Uses existing Product model for subscription plans.
Tracks tenant subscriptions, invoices, and payment proofs.
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from dateutil.relativedelta import relativedelta

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel


class TenantSubscription(TimeStampedModel, SoftDeleteModel):
    """
    Tracks each tenant's subscription to your SaaS platform.
    
    The tenant_owner is registered as a Client in YOUR admin account.
    Subscription plan is a Product in your catalog.
    """
    
    STATUS_CHOICES = [
        ('trial', 'Trial'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
    ]
    
    FREQUENCY_CHOICES = [
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('yearly', 'Yearly'),
        ('custom', 'Custom'),
    ]
    
    # Tenant identification
    tenant_owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscription',
        help_text="The tenant owner (has is_owner=True check)"
    )
    
    # Subscription plan (Product in YOUR catalog)
    subscription_product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='subscriptions',
        help_text="Subscription plan as a Product (e.g., 'Basic Monthly', 'Pro Yearly')"
    )
    
    billing_frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default='monthly'
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='trial'
    )
    
    # Billing dates
    start_date = models.DateField()
    next_billing_date = models.DateField()
    trial_end_date = models.DateField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    
    # Financial tracking (in YOUR system admin account)
    income_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='subscription_income',
        help_text="Income sub-account in YOUR books (e.g., 'Tenant ABC - Subscription Income')"
    )
    receivable_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='subscription_receivable',
        help_text="Receivable sub-account in YOUR books (e.g., 'Tenant ABC - Outstanding')"
    )
    
    # Financial tracking (in TENANT's account)
    tenant_expense_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='saas_expense',
        help_text="Expense account in TENANT's books (e.g., 'SaaS Subscription Expense')"
    )
    tenant_payable_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='saas_payable',
        help_text="Payable account in TENANT's books (e.g., 'SaaS Vendor Payable')"
    )
    
    # Client record (Tenant registered as Client in YOUR admin account)
    admin_client_record = models.ForeignKey(
        'clients.Client',
        on_delete=models.PROTECT,
        related_name='subscription',
        help_text="Client record in YOUR admin account for this tenant"
    )
    
    # Current amounts
    current_amount_due = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )
    total_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Usage tracking
    current_users_count = models.IntegerField(default=1)
    current_branches_count = models.IntegerField(default=1)
    current_transactions_count = models.IntegerField(default=0)
    storage_used_gb = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    # Plan limits (cached from product metadata)
    max_users = models.IntegerField(default=5)
    max_branches = models.IntegerField(default=1)
    max_transactions_per_month = models.IntegerField(null=True, blank=True)
    storage_limit_gb = models.IntegerField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Tenant Subscription'
        verbose_name_plural = 'Tenant Subscriptions'
    
    def __str__(self):
        return f"{self.tenant_owner.email} - {self.subscription_product.name} ({self.status})"
    
    def get_price_for_frequency(self):
        """Get price based on billing frequency from product"""
        # Price stored in product.unit_price
        # Frequency adjustments can be in product metadata
        base_price = self.subscription_product.unit_price
        
        # Check product metadata for frequency multipliers
        metadata = self.subscription_product.metadata or {}
        multipliers = metadata.get('frequency_multipliers', {
            'monthly': 1,
            'quarterly': 2.85,  # 5% discount
            'yearly': 10,  # 2 months free
        })
        
        return base_price * Decimal(str(multipliers.get(self.billing_frequency, 1)))
    
    def is_overdue(self):
        """Check if payment is overdue"""
        return self.status == 'active' and self.next_billing_date < timezone.now().date()
    
    def days_until_due(self):
        """Days until next payment due"""
        delta = self.next_billing_date - timezone.now().date()
        return delta.days
    
    def days_overdue(self):
        """Days overdue"""
        if not self.is_overdue():
            return 0
        delta = timezone.now().date() - self.next_billing_date
        return delta.days
    
    def is_within_usage_limits(self):
        """Check if tenant is within plan limits"""
        if self.current_users_count > self.max_users:
            return False, f"User limit exceeded: {self.current_users_count}/{self.max_users}"
        
        if self.current_branches_count > self.max_branches:
            return False, f"Branch limit exceeded: {self.current_branches_count}/{self.max_branches}"
        
        if self.max_transactions_per_month and self.current_transactions_count > self.max_transactions_per_month:
            return False, f"Transaction limit exceeded: {self.current_transactions_count}/{self.max_transactions_per_month}"
        
        if self.storage_limit_gb and self.storage_used_gb > self.storage_limit_gb:
            return False, f"Storage limit exceeded: {self.storage_used_gb}GB/{self.storage_limit_gb}GB"
        
        return True, "Within limits"
    
    def suspend(self, reason="Non-payment"):
        """Suspend subscription for non-payment"""
        self.status = 'suspended'
        self.suspended_at = timezone.now()
        self.save()
        # TODO: Send suspension email
    
    def reactivate(self):
        """Reactivate subscription after payment"""
        self.status = 'active'
        self.suspended_at = None
        self.save()
        # TODO: Send reactivation email
    
    def cancel(self):
        """Cancel subscription"""
        self.status = 'cancelled'
        self.cancelled_at = timezone.now()
        self.save()
        # TODO: Send cancellation email


class SubscriptionInvoice(TimeStampedModel, SoftDeleteModel):
    """
    Invoice for subscription billing
    
    Generates accounting transactions on both sides:
    - YOUR books: Debit Receivable, Credit Income
    - TENANT's books: Debit Expense, Credit Payable
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]
    
    subscription = models.ForeignKey(
        TenantSubscription,
        on_delete=models.CASCADE,
        related_name='invoices'
    )
    
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    due_date = models.DateField()
    
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Billing period
    period_start = models.DateField()
    period_end = models.DateField()
    
    # Payment tracking
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Accounting (in YOUR books)
    admin_transaction = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='subscription_invoices',
        help_text="Transaction in YOUR account (Debit: Receivable, Credit: Income)"
    )
    
    # Accounting (in TENANT's books)
    tenant_transaction = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='saas_expense_transactions',
        help_text="Transaction in TENANT's account (Debit: Expense, Credit: Payable)"
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-invoice_date']
        verbose_name = 'Subscription Invoice'
        verbose_name_plural = 'Subscription Invoices'
    
    def __str__(self):
        return f"Invoice {self.invoice_number} - {self.subscription.tenant_owner.email} - ₦{self.amount}"
    
    def mark_as_overdue(self):
        """Mark invoice as overdue"""
        if self.status == 'pending' and self.due_date < timezone.now().date():
            self.status = 'overdue'
            self.save()
    
    def mark_as_paid(self, payment_proof):
        """
        Mark invoice as paid and record transactions on both sides.
        Called when admin approves payment proof.
        """
        self.status = 'paid'
        self.paid_at = timezone.now()
        self.paid_amount = self.amount
        self.save()
        
        # Update subscription
        subscription = self.subscription
        subscription.current_amount_due = Decimal('0.00')
        subscription.total_paid += self.amount
        
        # Calculate next billing date
        if subscription.billing_frequency == 'monthly':
            subscription.next_billing_date += relativedelta(months=1)
        elif subscription.billing_frequency == 'quarterly':
            subscription.next_billing_date += relativedelta(months=3)
        elif subscription.billing_frequency == 'yearly':
            subscription.next_billing_date += relativedelta(years=1)
        
        subscription.save()
        
        # Create accounting transactions (deferred import to avoid circular dependency)
        from .subscription_accounting import record_payment_transactions
        record_payment_transactions(self, payment_proof)


class PaymentProof(TimeStampedModel, SoftDeleteModel):
    """
    Payment proof submitted by tenant for admin verification
    
    Workflow:
    1. Tenant submits proof (receipt image, reference number)
    2. Status = 'submitted'
    3. Admin reviews and approves/rejects
    4. If approved: Invoice marked as paid, transactions recorded, subscription reactivated
    """
    
    STATUS_CHOICES = [
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    PAYMENT_METHOD_CHOICES = [
        ('bank_transfer', 'Bank Transfer'),
        ('card', 'Credit/Debit Card'),
        ('mobile_money', 'Mobile Money'),
        ('cash', 'Cash'),
        ('other', 'Other'),
    ]
    
    subscription = models.ForeignKey(
        TenantSubscription,
        on_delete=models.CASCADE,
        related_name='payment_proofs'
    )
    
    invoice = models.ForeignKey(
        SubscriptionInvoice,
        on_delete=models.CASCADE,
        related_name='payment_proofs'
    )
    
    # Proof details
    reference_number = models.CharField(max_length=100, unique=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    
    # Evidence
    receipt_image = models.ImageField(
        upload_to='payment_proofs/%Y/%m/',
        null=True,
        blank=True
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional information from tenant"
    )
    
    # Admin review
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='submitted')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_payments'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(
        blank=True,
        help_text="Admin's reason for rejection or comments"
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Payment Proof'
        verbose_name_plural = 'Payment Proofs'
    
    def __str__(self):
        return f"{self.reference_number} - ₦{self.amount} ({self.status})"
    
    def approve(self, admin_user):
        """
        Admin approves payment
        - Marks invoice as paid
        - Records transactions (both sides)
        - Reactivates subscription if suspended
        """
        self.status = 'approved'
        self.reviewed_by = admin_user
        self.reviewed_at = timezone.now()
        self.save()
        
        # Mark invoice as paid (triggers transaction creation)
        self.invoice.mark_as_paid(self)
        
        # Reactivate subscription if suspended
        if self.subscription.status == 'suspended':
            self.subscription.reactivate()
        
        # TODO: Send approval email to tenant
    
    def reject(self, admin_user, reason):
        """Admin rejects payment"""
        self.status = 'rejected'
        self.reviewed_by = admin_user
        self.reviewed_at = timezone.now()
        self.admin_notes = reason
        self.save()
        
        # TODO: Send rejection email to tenant with reason


class SubscriptionUsageLog(TimeStampedModel):
    """
    Daily usage tracking for subscription limits
    
    Logged daily by Celery task to track:
    - User count
    - Branch count
    - Transaction count
    - Storage usage
    """
    
    subscription = models.ForeignKey(
        TenantSubscription,
        on_delete=models.CASCADE,
        related_name='usage_logs'
    )
    
    log_date = models.DateField()
    
    users_count = models.IntegerField(default=0)
    branches_count = models.IntegerField(default=0)
    transactions_count = models.IntegerField(default=0)
    storage_used_gb = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    # Metadata
    exceeded_limits = models.JSONField(
        default=list,
        help_text="List of limits exceeded on this date"
    )
    
    class Meta:
        unique_together = [['subscription', 'log_date']]
        ordering = ['-log_date']
        verbose_name = 'Subscription Usage Log'
        verbose_name_plural = 'Subscription Usage Logs'
    
    def __str__(self):
        return f"{self.subscription.tenant_owner.email} - {self.log_date}"
