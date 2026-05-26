"""
Budget Models

Tracks budget allocations and enables variance analysis against actual spending.
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.db.models import Sum, Q
from decimal import Decimal
from common.base import BranchScopedModel, SoftDeleteModel, TimeStampedModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from django.conf import settings


class BudgetPeriod(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Fiscal year or custom budget period
    
    Represents a time period for which budgets are allocated and tracked.
    Multiple departments can have separate budgets within the same period.
    """
    
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT)
    
    objects = OwnerBranchManager()
    
    name = models.CharField(
        max_length=100,
        help_text="e.g., 'FY 2025-2026' or 'Q1 2026'"
    )
    
    start_date = models.DateField(
        help_text="Budget period start date"
    )
    
    end_date = models.DateField(
        help_text="Budget period end date"
    )
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('approved', 'Approved'),
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Budget status workflow"
    )
    
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_budgets',
        help_text="User who approved the budget"
    )
    
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the budget was approved"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Budget notes and assumptions"
    )
    
    class Meta:
        db_table = 'budgets_budget_period'
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['owner', 'status', 'start_date']),
            models.Index(fields=['start_date', 'end_date']),
        ]
        verbose_name = 'Budget Period'
        verbose_name_plural = 'Budget Periods'
    
    def __str__(self):
        return f"{self.name} ({self.start_date} to {self.end_date})"
    
    def clean(self):
        """Validate budget period dates"""
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError('End date must be after start date')
        
        # Check for overlapping periods
        if self.owner:
            overlapping = BudgetPeriod.objects.filter(
                owner=self.owner,
                status__in=['approved', 'active']
            ).filter(
                Q(start_date__lte=self.end_date, end_date__gte=self.start_date)
            ).exclude(pk=self.pk)
            
            if overlapping.exists():
                raise ValidationError(
                    f'Budget period overlaps with existing period: {overlapping.first().name}'
                )
    
    def get_total_budget(self):
        """Calculate total budgeted amount"""
        total = self.budget_lines.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        return total
    
    def get_total_actual(self):
        """Calculate total actual spending across all budget lines"""
        total_actual = Decimal('0.00')
        for line in self.budget_lines.all():
            total_actual += line.get_actual_amount()
        return total_actual
    
    def get_variance_summary(self):
        """Get budget vs actual variance summary"""
        total_budget = self.get_total_budget()
        total_actual = self.get_total_actual()
        variance = total_budget - total_actual
        variance_percent = (variance / total_budget * 100) if total_budget else 0
        
        return {
            'total_budget': total_budget,
            'total_actual': total_actual,
            'variance': variance,
            'variance_percent': variance_percent,
            'utilization_percent': (total_actual / total_budget * 100) if total_budget else 0,
        }


class BudgetLine(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual budget allocation line
    
    Links a budget amount to a specific account (and optionally department).
    Allows tracking of budget vs actual at granular level.
    """
    
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT)
    
    objects = OwnerBranchManager()
    
    budget_period = models.ForeignKey(
        BudgetPeriod,
        on_delete=models.CASCADE,
        related_name='budget_lines',
        help_text="Parent budget period"
    )
    
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='budget_allocations',
        help_text="Account this budget applies to (typically expense accounts)"
    )
    
    # Note: Department model may not exist in all installations
    # Commenting out for now - can be enabled if needed
    # department = models.ForeignKey(
    #     'branches.Department',
    #     on_delete=models.SET_NULL,
    #     null=True,
    #     blank=True,
    #     related_name='budget_lines',
    #     help_text="Optional: Department responsible for this budget line"
    # )
    
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Budgeted amount for the period"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Line item notes and justification"
    )
    
    class Meta:
        db_table = 'budgets_budget_line'
        ordering = ['budget_period', 'account__code']
        unique_together = [
            ['budget_period', 'account']
        ]
        indexes = [
            models.Index(fields=['budget_period', 'account']),
            models.Index(fields=['owner', 'budget_period']),
        ]
        verbose_name = 'Budget Line'
        verbose_name_plural = 'Budget Lines'
    
    def __str__(self):
        return f"{self.account.code} {self.account.name}: {self.amount}"
    
    def clean(self):
        """Validate budget line"""
        # Ensure account belongs to same owner
        if self.account and self.owner and self.account.owner != self.owner:
            raise ValidationError('Account must belong to the same organization')
        
        # Typically budget lines are for expense accounts
        if self.account and self.account.type != 'expense':
            # Warning but not blocking - sometimes budgets for revenue too
            pass
    
    def get_actual_amount(self):
        """
        Calculate actual spending against this budget line
        
        Sums all posted transactions for this account (and department if specified)
        within the budget period date range.
        """
        from transactions.models import TransactionEntry, Transaction
        
        # Base query for transaction entries
        entries = TransactionEntry.objects.filter(
            account=self.account,
            posted=True,
            transaction__is_deleted=False,
            transaction__date__gte=self.budget_period.start_date,
            transaction__date__lte=self.budget_period.end_date,
        )
        
        # If department specified, filter by department
        # Note: This requires transactions to have department field
        # If not available, this filter won't work
        if self.department:
            entries = entries.filter(transaction__department=self.department)
        
        # For expense accounts, sum debit-side entries
        else:
            # For other account types, use appropriate side
            actual = entries.aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
        
        return actual
    
    def get_variance(self):
        """Calculate variance for this budget line"""
        actual = self.get_actual_amount()
        variance = self.amount - actual
        variance_percent = (variance / self.amount * 100) if self.amount else 0
        
        return {
            'budget': self.amount,
            'actual': actual,
            'variance': variance,
            'variance_percent': variance_percent,
            'utilization_percent': (actual / self.amount * 100) if self.amount else 0,
            'status': 'under' if variance > 0 else 'over' if variance < 0 else 'on_target'
        }
