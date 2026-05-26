"""
Credit Notes Models

Handles sales returns and customer credit management.
"""

from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from users.models import User
from clients.models import Client


class CreditNote(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Credit note for sales returns
    
    Represents money owed to customer due to:
    - Product returns
    - Overpayment
    - Pricing corrections
    - Service cancellations
    """
    
    # Identification
    credit_note_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique credit note identifier"
    )
    
    # Relationships
    original_invoice = models.ForeignKey(
        'inventory.Invoice',
        on_delete=models.PROTECT,
        related_name='credit_notes',
        help_text="Invoice being credited"
    )
    
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.PROTECT,
        related_name='credit_notes',
        help_text="Customer receiving the credit"
    )
    
    # Dates
    issue_date = models.DateField(
        help_text="Date credit note was issued"
    )
    
    # Reason and Details
    reason = models.TextField(
        help_text="Reason for issuing credit note"
    )
    
    notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes"
    )
    
    # Amounts
    subtotal = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total before tax"
    )
    
    discount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Discount amount"
    )
    
    tax_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Tax amount"
    )
    
    total_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total credit amount"
    )
    
    # Application Status
    applied_to_account = models.BooleanField(
        default=False,
        help_text="Whether credit has been applied to customer account"
    )
    
    applied_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When credit was applied"
    )
    
    applied_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='applied_credit_notes',
        help_text="User who applied the credit"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('draft', 'Draft'),
            ('issued', 'Issued'),
            ('applied', 'Applied'),
            ('cancelled', 'Cancelled'),
        ],
        default='draft',
        help_text="Credit note status"
    )
    
    # Reversal
    reversed = models.BooleanField(
        default=False,
        help_text="Whether credit has been reversed"
    )
    
    reversed_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When credit was reversed"
    )
    
    reversed_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reversed_credit_notes',
        help_text="User who reversed the credit"
    )
    
    reversal_reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for reversal"
    )
    
    # Audit
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_credit_notes'
    )
    
    class Meta:
        db_table = 'inventory_credit_notes'
        ordering = ['-issue_date', '-created_at']
        indexes = [
            models.Index(fields=['credit_note_number']),
            models.Index(fields=['status']),
            models.Index(fields=['issue_date']),
            models.Index(fields=['applied_to_account']),
        ]
    
    def __str__(self):
        return f"{self.credit_note_number} - {self.client} - ₦{self.total_amount}"
    
    def clean(self):
        """Validate credit note"""
        super().clean()
        
        # Cannot apply if cancelled
        if self.applied_to_account and self.status == 'cancelled':
            raise ValidationError("Cannot apply cancelled credit note")
        
        # Cannot apply if already applied
        if self.applied_to_account and self.pk:
            original = CreditNote.objects.get(pk=self.pk)
            if original.applied_to_account and self.applied_to_account:
                if not self.reversed:
                    raise ValidationError("Credit note already applied")
        
        # Validate total matches calculation
        calculated_total = self.subtotal - self.discount + self.tax_amount
        if abs(self.total_amount - calculated_total) > Decimal('0.01'):
            raise ValidationError(
                f"Total amount ({self.total_amount}) doesn't match "
                f"calculated total ({calculated_total})"
            )
        
        # Cannot exceed original invoice amount
        if self.total_amount > self.original_invoice.total_amount:
            raise ValidationError(
                "Credit note amount cannot exceed original invoice amount"
            )
        
        # Client must match original invoice
        if self.client != self.original_invoice.client:
            raise ValidationError(
                "Credit note client must match original invoice client"
            )
    
    def save(self, *args, **kwargs):
        # Auto-generate credit note number if not provided
        if not self.credit_note_number:
            self.credit_note_number = self._generate_credit_note_number()
        
        self.full_clean()
        super().save(*args, **kwargs)
    
    def _generate_credit_note_number(self):
        """Generate unique credit note number"""
        from django.utils import timezone
        year = timezone.now().year
        
        # Get last credit note number for this year
        last_cn = CreditNote.objects.filter(
            credit_note_number__startswith=f'CN-{year}-',
            branch=self.branch
        ).order_by('-created_at').first()
        
        if last_cn:
            try:
                last_num = int(last_cn.credit_note_number.split('-')[-1])
                next_num = last_num + 1
            except (ValueError, IndexError):
                next_num = 1
        else:
            next_num = 1
        
        return f'CN-{year}-{next_num:05d}'
    
    @property
    def remaining_amount(self):
        """Amount not yet applied"""
        if self.applied_to_account:
            return Decimal('0.00')
        return self.total_amount
    
    @property
    def can_be_applied(self):
        """Check if credit note can be applied"""
        return (
            self.status == 'issued' and
            not self.applied_to_account and
            not self.reversed
        )
    
    @property
    def can_be_cancelled(self):
        """Check if credit note can be cancelled"""
        return (
            self.status in ['draft', 'issued'] and
            not self.applied_to_account
        )


class CreditNoteItem(TimeStampedModel, SoftDeleteModel):
    """
    Line items in credit note
    
    Tracks individual items being returned/credited.
    """
    
    # Relationships
    credit_note = models.ForeignKey(
        'inventory.CreditNote',
        on_delete=models.CASCADE,
        related_name='items',
        help_text="Parent credit note"
    )
    
    original_invoice_item = models.ForeignKey(
        'inventory.InvoiceItem',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='credit_note_items',
        help_text="Original invoice item being credited"
    )
    
    item = models.ForeignKey(
        'inventory.InventoryItem',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='credit_note_items',
        help_text="Inventory item (if applicable)"
    )
    
    # Item Details
    description = models.TextField(
        help_text="Item description"
    )
    
    # Quantities
    quantity_returned = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Quantity being credited"
    )
    
    original_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Original quantity on invoice"
    )
    
    # Pricing
    unit_price = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Unit price from original invoice"
    )
    
    discount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Discount per line"
    )
    
    tax_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Tax for this line"
    )
    
    line_total = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total for this line"
    )
    
    # Return Details
    return_reason = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        choices=[
            ('defective', 'Defective Product'),
            ('wrong_item', 'Wrong Item Sent'),
            ('damaged', 'Damaged in Transit'),
            ('not_as_described', 'Not as Described'),
            ('customer_request', 'Customer Request'),
            ('pricing_error', 'Pricing Error'),
            ('other', 'Other'),
        ],
        help_text="Reason for return"
    )
    
    return_notes = models.TextField(
        blank=True,
        null=True,
        help_text="Additional notes about return"
    )
    
    # Stock Impact
    return_to_stock = models.BooleanField(
        default=True,
        help_text="Whether item should be returned to inventory"
    )
    
    stock_returned = models.BooleanField(
        default=False,
        help_text="Whether item has been returned to stock"
    )
    
    class Meta:
        db_table = 'inventory_credit_note_items'
        ordering = ['id']
    
    def __str__(self):
        return f"{self.credit_note.credit_note_number} - {self.description} x {self.quantity_returned}"
    
    def clean(self):
        """Validate credit note item"""
        super().clean()
        
        # Quantity returned cannot exceed original quantity
        if self.original_invoice_item:
            if self.quantity_returned > self.original_invoice_item.quantity:
                raise ValidationError(
                    f"Quantity returned ({self.quantity_returned}) cannot exceed "
                    f"original quantity ({self.original_invoice_item.quantity})"
                )
        
        # Validate line total
        calculated_total = (
            (self.quantity_returned * self.unit_price) 
            - self.discount 
            + self.tax_amount
        )
        if abs(self.line_total - calculated_total) > Decimal('0.01'):
            raise ValidationError(
                f"Line total ({self.line_total}) doesn't match "
                f"calculated total ({calculated_total})"
            )
    
    def save(self, *args, **kwargs):
        # Auto-calculate line total if not provided
        if not self.line_total:
            self.line_total = (
                (self.quantity_returned * self.unit_price)
                - self.discount
                + self.tax_amount
            )
        
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def can_return_to_stock(self):
        """Check if item can be returned to stock"""
        return (
            self.return_to_stock and
            not self.stock_returned and
            self.item is not None and
            self.return_reason not in ['defective', 'damaged']
        )
