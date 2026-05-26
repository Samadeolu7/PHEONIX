# incomes/models_config.py
"""
Configuration models for income accounting
Provides flexible account mapping without hardcoded values
"""
from django.db import models
from django.core.exceptions import ValidationError

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account


class IncomeAccountingConfig(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Configure GL accounts for income module per branch/owner
    Eliminates hardcoded account lookups
    
    Setup:
        1. Create one config per branch/owner
        2. Link specific GL accounts for each transaction type
        3. Optional: Override at income category level
    """
    # Default accounts for income transactions
    default_cash_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_cash_configs',
        limit_choices_to={'account_type__in': ['current_asset', 'bank']},
        help_text="Default cash/bank account for cash receipts"
    )
    
    default_ar_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_ar_configs',
        limit_choices_to={'account_type': 'current_asset'},
        help_text="Default Accounts Receivable account for invoices"
    )
    
    # Alternative payment method accounts
    bank_transfer_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_bank_transfer_configs',
        null=True,
        blank=True,
        limit_choices_to={'account_type__in': ['current_asset', 'bank']},
        help_text="Bank account for electronic transfers"
    )
    
    mobile_money_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_mobile_money_configs',
        null=True,
        blank=True,
        limit_choices_to={'account_type__in': ['current_asset', 'bank']},
        help_text="Account for mobile money payments (M-Pesa, etc.)"
    )
    
    credit_card_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_credit_card_configs',
        null=True,
        blank=True,
        limit_choices_to={'account_type__in': ['current_asset', 'bank']},
        help_text="Account for credit card payments"
    )
    
    # Optional: Discount and write-off accounts
    discount_allowed_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_discount_configs',
        null=True,
        blank=True,
        limit_choices_to={'account_type': 'expense'},
        help_text="Expense account for discounts given to customers"
    )
    
    bad_debt_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_bad_debt_configs',
        null=True,
        blank=True,
        limit_choices_to={'account_type': 'expense'},
        help_text="Expense account for writing off bad debts"
    )
    
    # Transaction series configuration
    income_series_code = models.CharField(
        max_length=10,
        default='INC',
        help_text="Transaction series code for income receipts"
    )
    
    entitlement_series_code = models.CharField(
        max_length=10,
        default='ENT',
        help_text="Transaction series code for entitlement payments"
    )
    
    # Behavior settings
    require_bank_account = models.BooleanField(
        default=False,
        help_text="If true, payment requests must specify bank_account_id"
    )
    
    allow_overpayment = models.BooleanField(
        default=False,
        help_text="Allow payments exceeding invoice amount (creates credit balance)"
    )
    
    auto_reconcile = models.BooleanField(
        default=True,
        help_text="Automatically reconcile payments against AR"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'income_accounting_config'
        verbose_name = 'Income Accounting Configuration'
        verbose_name_plural = 'Income Accounting Configurations'
        unique_together = [['owner', 'branch']]
        indexes = [
            models.Index(fields=['owner', 'branch']),
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
        return f"Income Config - {self.owner.name} / {self.branch.name if self.branch else 'All Branches'}"
    
    def clean(self):
        """Validate configuration"""
        super().clean()
        
        # Validate account types
        if self.default_cash_account_id:
            if self.default_cash_account.account_type not in ['ASSET', 'current_asset', 'bank']:
                raise ValidationError({
                    'default_cash_account': f'Cash/bank accounts must be ASSET type. '
                                          f'Selected account "{self.default_cash_account.name}" is '
                                          f'type "{self.default_cash_account.account_type}".'
                })
        
        if self.default_ar_account_id:
            if self.default_ar_account.account_type not in ['ASSET', 'current_asset']:
                raise ValidationError({
                    'default_ar_account': f'Accounts Receivable must be ASSET type. '
                                        f'Selected account "{self.default_ar_account.name}" is '
                                        f'type "{self.default_ar_account.account_type}".'
                })
        
        if self.discount_allowed_account_id:
            if self.discount_allowed_account.account_type != 'EXPENSE':
                raise ValidationError({
                    'discount_allowed_account': f'Discount accounts must be EXPENSE type. '
                                              f'Selected account "{self.discount_allowed_account.name}" is '
                                              f'type "{self.discount_allowed_account.account_type}".'
                })
        
        if self.bad_debt_account_id:
            if self.bad_debt_account.account_type != 'EXPENSE':
                raise ValidationError({
                    'bad_debt_account': f'Bad debt accounts must be EXPENSE type. '
                                      f'Selected account "{self.bad_debt_account.name}" is '
                                      f'type "{self.bad_debt_account.account_type}".'
                })
        
        # Ensure all accounts belong to same owner/branch
        accounts = [
            self.default_cash_account,
            self.default_ar_account,
        ]
        
        for account in accounts:
            if account:
                if account.owner != self.owner:
                    raise ValidationError(
                        f"Account {account.code} belongs to different owner"
                    )
                if self.branch and account.branch != self.branch:
                    raise ValidationError(
                        f"Account {account.code} belongs to different branch"
                    )
    
    def get_account_for_payment_method(self, payment_method: str) -> Account:
        """
        Get the appropriate GL account for a payment method
        
        Args:
            payment_method: 'cash', 'bank_transfer', 'mobile_money', 'credit_card', etc.
            
        Returns:
            Account instance
        """
        method_mapping = {
            'cash': self.default_cash_account,
            'bank_transfer': self.bank_transfer_account or self.default_cash_account,
            'mobile_money': self.mobile_money_account or self.default_cash_account,
            'credit_card': self.credit_card_account or self.default_cash_account,
            'cheque': self.default_cash_account,
        }
        
        return method_mapping.get(payment_method, self.default_cash_account)
    
    @classmethod
    def get_config(cls, owner, branch=None):
        """
        Get accounting config for owner/branch
        Raises ValidationError if not found
        """
        try:
            return cls.objects.get(owner=owner, branch=branch)
        except cls.DoesNotExist:
            owner_name = getattr(owner, 'username', str(owner))
            raise ValidationError(
                f"Income accounting configuration not found for {owner_name}. "
                f"Please configure GL accounts in Settings > Income Configuration."
            )


class IncomeCategoryAccountOverride(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Override default accounting config for specific income categories
    Allows fine-grained control (e.g., different bank account for tuition vs donations)
    """
    income_category = models.OneToOneField(
        'IncomeCategory',
        on_delete=models.CASCADE,
        related_name='account_override'
    )
    
    # Override accounts (null = use default from IncomeAccountingConfig)
    cash_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_cash_overrides',
        null=True,
        blank=True,
        limit_choices_to={'account_type__in': ['current_asset', 'bank']},
        help_text="Override cash account for this income category"
    )
    
    ar_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='income_ar_overrides',
        null=True,
        blank=True,
        limit_choices_to={'account_type': 'current_asset'},
        help_text="Override AR account for this income category"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        db_table = 'income_category_account_override'
        verbose_name = 'Income Category Account Override'
        verbose_name_plural = 'Income Category Account Overrides'
    
    def __str__(self):
        return f"Override for {self.income_category.name}"
