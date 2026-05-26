from django.db import models
from django.core.exceptions import ValidationError
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from common.industry import Industry
from decimal import Decimal

class ProductCategory(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Categories for different products across various industries
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    industry = models.ForeignKey(
        Industry, 
        on_delete=models.PROTECT,
        related_name='product_categories'
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='children'
    )
    attributes = models.JSONField(
        default=dict,
        help_text="Dynamic attributes for this category"
    )
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = ['code', 'industry']
        verbose_name_plural = 'Product Categories'
        ordering = ['industry', 'code']

    def clean(self):
        if self.parent and self.parent.industry != self.industry:
            raise ValidationError('Parent category must be from the same industry')

    def __str__(self):
        return f"{self.industry.code} - {self.code} - {self.name}"

class Product(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Universal product model supporting physical products, services, and financial products
    """
    PRODUCT_CLASSES = [
        ('PHYSICAL', 'Physical Product'),
        ('SERVICE', 'Service'),
        ('FINANCIAL', 'Financial Product'),
        ('DIGITAL', 'Digital Product')
    ]
    
    # For financial products
    SAVINGS = 'SAVINGS'
    LOAN = 'LOAN'
    EXPENSE = 'EXPENSE'
    INVESTMENT = 'INVESTMENT'
    INSURANCE = 'INSURANCE'
    
    FINANCIAL_PRODUCT_TYPES = [
        (SAVINGS, 'Savings Product'),
        (LOAN, 'Loan Product'),
        (EXPENSE, 'Expense Product'),
        (INVESTMENT, 'Investment Product'),
        (INSURANCE, 'Insurance Product'),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    product_class = models.CharField(max_length=50, choices=PRODUCT_CLASSES)
    product_type = models.CharField(
        max_length=20,
        choices=FINANCIAL_PRODUCT_TYPES,
        null=True,
        blank=True,
        help_text="For financial products (SAVINGS/LOAN), specify the type"
    )
    is_active = models.BooleanField(default=True)
    
    # Pricing and limits
    minimum_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    maximum_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    standard_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Transaction limits
    min_transaction_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=0,
        help_text="Minimum amount per transaction"
    )
    max_transaction_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Maximum amount per transaction"
    )
    daily_transaction_limit = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Total transaction limit per day"
    )
    monthly_transaction_limit = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Total transaction limit per month"
    )
    
    # Validation scope for expense products
    VALIDATION_SCOPES = [
        ('category', 'Per Category'),
        ('account', 'Per Account'),
        ('user', 'Per User'),
    ]
    validation_scope = models.CharField(
        max_length=20,
        choices=VALIDATION_SCOPES,
        default='category',
        help_text="Scope for applying transaction limits"
    )
    
    # Product behavior flags
    track_inventory = models.BooleanField(default=False)
    allow_credit_sales = models.BooleanField(default=False)
    allow_reservations = models.BooleanField(default=False)
    requires_approval = models.BooleanField(default=False)
    
    # Savings contribution cycle — applies to SAVINGS products only
    CYCLE_DAILY = 'daily'
    CYCLE_WEEKLY = 'weekly'
    CYCLE_MONTHLY = 'monthly'
    CONTRIBUTION_CYCLE_CHOICES = [
        (CYCLE_DAILY, 'Daily'),
        (CYCLE_WEEKLY, 'Weekly'),
        (CYCLE_MONTHLY, 'Monthly'),
    ]
    contribution_cycle = models.CharField(
        max_length=10,
        choices=CONTRIBUTION_CYCLE_CHOICES,
        null=True,
        blank=True,
        help_text="Contribution frequency for savings products. Null = normal (no fixed cycle)."
    )
    # Standard contribution amount for this product (used as schedule default)
    contribution_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Default contribution amount per cycle for savings products."
    )

    # Financial product specific
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    # Interest/Fee posting configuration
    INTEREST_POSTING_METHODS = [
        ('auto_journal', 'Automatic Journal Entry'),
        ('pending_approval', 'Pending Approval'),
        ('accrual', 'Accrual Only'),
    ]
    interest_posting_method = models.CharField(
        max_length=20,
        choices=INTEREST_POSTING_METHODS,
        default='accrual',
        help_text="How interest should be posted"
    )
    interest_posting_cron = models.CharField(
        max_length=100,
        blank=True,
        help_text="Cron expression for scheduled interest posting (e.g., '0 0 1 * *' for monthly)"
    )
    auto_debit_fees = models.BooleanField(
        default=False,
        help_text="Automatically debit fees based on fee_structure"
    )
    
    fee_structure = models.JSONField(
        default=dict,
        help_text="Fee configuration for the product (maintenance_fee, transaction_fee, etc.)"
    )
    calculation_method = models.JSONField(
        default=dict,
        help_text="Rules for interest/fee calculation"
    )
    repayment_config = models.JSONField(
        default=dict,
        help_text="Configurable repayment rules"
    )
    
    # Flexible validation rules
    validation_rules = models.JSONField(
        default=dict,
        help_text="Custom validation rules for this product (e.g., min_balance, withdrawal_frequency)"
    )
    
    # Dynamic fields per industry
    custom_attributes = models.JSONField(
        default=dict,
        help_text="Industry-specific attributes"
    )
    metadata_schema = models.JSONField(
        default=dict,
        help_text="Schema for required metadata"
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    def __str__(self):
        return f"{self.name} ({self.get_product_type_display()})"

    class Meta:
        unique_together = ['branch', 'code']

class ProductRequirement(TimeStampedModel, SoftDeleteModel):
    """
    Requirements for each product (e.g. documentation needed)
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='requirements')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_mandatory = models.BooleanField(default=True)
    document_type = models.CharField(max_length=50, blank=True,
        choices=[
            ('id', 'Identification'),
            ('address', 'Address Proof'),
            ('income', 'Income Proof'),
            ('photo', 'Photograph'),
            ('other', 'Other')
        ])

    def __str__(self):
        return f"{self.product.name} - {self.name}"

class Fee(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Fee definitions that can be applied to products
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    fee_type = models.CharField(max_length=20,
        choices=[
            ('fixed', 'Fixed Amount'),
            ('percentage', 'Percentage of Amount'),
            ('hybrid', 'Hybrid (Fixed + Percentage)')
        ])
    fixed_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    minimum_charge = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    maximum_charge = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    def __str__(self):
        return self.name

    def calculate_fee(self, amount):
        """Calculate the fee for a given amount"""
        if self.fee_type == 'fixed':
            return self.fixed_amount
        elif self.fee_type == 'percentage':
            fee = (amount * self.percentage) / 100
        else:  # hybrid
            fee = self.fixed_amount + (amount * self.percentage) / 100
            
        # Apply min/max constraints
        if self.minimum_charge and fee < self.minimum_charge:
            return self.minimum_charge
        if self.maximum_charge and fee > self.maximum_charge:
            return self.maximum_charge
        return fee
