# inventory/models_office_use_request.py
"""
Office Use Material Request System
Allows staff to request inventory items for internal office use.
Creates journal entries: Dr Expense Account / Cr Inventory Account
"""
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import date
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from .models import InventoryItem, Location


class OfficeUseRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Office Use Material Request.

    Used when staff members need inventory items for internal office use
    (stationery, cleaning supplies, etc.).  No client or service invoice
    is involved.  On fulfilment:
        Dr  expense_account   (user-selected GL expense account)
        Cr  category.inventory_account  (per consumed item)
    Stock quantities are reduced at the specified location.
    """

    request_number = models.CharField(max_length=50, unique=True, db_index=True)
    request_date = models.DateField(default=date.today)

    # Who is requesting
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='office_use_requests_created',
        help_text="Staff member who created/submitted this request",
    )

    # Optional department for organisational tracking
    department = models.CharField(
        max_length=120,
        blank=True,
        help_text="Department or cost centre requesting the items",
    )

    # GL account to debit when fulfilled (must be EXPENSE type)
    expense_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='office_use_requests',
        help_text="GL expense account to debit when this request is fulfilled",
    )

    # Delivery / collection location
    delivery_location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name='office_use_requests',
        help_text="Inventory location where items will be issued from",
    )

    purpose = models.TextField(help_text="Purpose / reason for this request")
    notes = models.TextField(blank=True)

    # ── Status workflow ──────────────────────────────────────────────────────
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('fulfilled', 'Fulfilled'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True,
    )

    # Approval tracking
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='office_use_requests_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)

    rejected_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='office_use_requests_rejected',
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Fulfilment tracking
    fulfilled_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='office_use_requests_fulfilled',
    )
    fulfilled_at = models.DateTimeField(null=True, blank=True)

    # Cancellation tracking
    cancelled_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='office_use_requests_cancelled',
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)

    # Journal entry created on fulfilment
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='office_use_requests',
        help_text="Journal entry generated when request is fulfilled",
    )

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-request_date', '-created_at']
        indexes = [
            models.Index(fields=['request_number']),
            models.Index(fields=['status']),
            models.Index(fields=['requested_by']),
        ]

    def __str__(self):
        return str(self.request_number)

    # ── Workflow actions ─────────────────────────────────────────────────────

    def submit(self, user=None):
        if self.status != 'draft':
            raise ValidationError("Only draft requests can be submitted")
        if not self.items.exists():
            raise ValidationError("Cannot submit a request without items")
        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.save()
        return True

    def approve(self, user, notes=''):
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be approved")
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save()
        return True

    def reject(self, user, reason):
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be rejected")
        if not reason:
            raise ValidationError("A rejection reason is required")
        self.status = 'rejected'
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save()
        return True

    def cancel(self, user=None, reason=''):
        if self.status in ('fulfilled',):
            raise ValidationError("Fulfilled requests cannot be cancelled")
        self.status = 'cancelled'
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        if reason:
            self.cancellation_reason = reason
        self.save()
        return True

    # ── Stock validation ─────────────────────────────────────────────────────

    def validate_stock_availability(self):
        """
        Returns (is_valid, error_messages).
        """
        if not self.items.exists():
            raise ValidationError("Cannot validate a request without items")

        errors = []
        from .models import InventoryStock

        for req_item in self.items.select_related('item').all():
            try:
                stock = InventoryStock.objects.get(
                    item=req_item.item,
                    location=self.delivery_location,
                )
                if stock.quantity_available < req_item.quantity:
                    errors.append(
                        f"{req_item.item.sku} – {req_item.item.name}: "
                        f"Insufficient stock. Requested: {req_item.quantity}, "
                        f"Available: {stock.quantity_available} at {self.delivery_location.name}"
                    )
            except InventoryStock.DoesNotExist:
                errors.append(
                    f"{req_item.item.sku} – {req_item.item.name}: "
                    f"No stock record at {self.delivery_location.name}"
                )

        return (len(errors) == 0, errors)

    # ── Fulfilment ───────────────────────────────────────────────────────────

    @transaction.atomic
    def fulfill(self, user):
        """
        Fulfil the office-use request:
          1. Validate sufficient stock.
          2. Reduce stock via InventoryService.
          3. Create journal entry: Dr expense_account / Cr inventory_account(s).
          4. Post the journal entry (updates GL balances).
        """
        if self.status != 'approved':
            raise ValidationError("Only approved requests can be fulfilled")
        if not self.items.exists():
            raise ValidationError("Cannot fulfil a request without items")

        is_valid, error_messages = self.validate_stock_availability()
        if not is_valid:
            raise ValidationError(
                "Cannot fulfil office-use request – insufficient stock:\n"
                + "\n".join(error_messages)
            )

        from .stock_service import InventoryService
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        total_expense = Decimal('0.00')
        inventory_credits = {}  # {account_id: {'account': ..., 'amount': Decimal}}

        for req_item in self.items.select_related('item__category__inventory_account').all():
            stock, movement = InventoryService.reduce_stock(
                item=req_item.item,
                location=self.delivery_location,
                quantity=req_item.quantity,
                movement_type='office_use',
                reference_number=self.request_number,
                unit_cost=None,
                user=user,
            )

            item_cost = movement.unit_cost * req_item.quantity
            total_expense += item_cost

            inv_account = req_item.item.category.inventory_account
            if inv_account.id not in inventory_credits:
                inventory_credits[inv_account.id] = {
                    'account': inv_account,
                    'amount': Decimal('0.00'),
                }
            inventory_credits[inv_account.id]['amount'] += item_cost

        # Create journal entry
        series, _ = TransactionSeries.objects.get_or_create(
            code='OUR',
            defaults={'description': 'Office Use Requests'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Office Use – {self.request_number} – {self.purpose[:80]}",
            workflow_reference=self.request_number,
            owner=self.owner,
            branch=self.branch,
            created_by=user,
        )

        # Debit: expense account (single line for the total)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.expense_account,
            side=JournalEntryLine.DEBIT,
            amount=total_expense,
        )

        # Credit: inventory account(s) – one line per distinct inventory account
        for credit_data in inventory_credits.values():
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=credit_data['account'],
                side=JournalEntryLine.CREDIT,
                amount=credit_data['amount'],
            )

        journal_entry.post()

        # Mark as fulfilled
        self.journal_entry = journal_entry
        self.status = 'fulfilled'
        self.fulfilled_by = user
        self.fulfilled_at = timezone.now()
        self.save()

        return journal_entry


class OfficeUseRequestItem(TimeStampedModel, SoftDeleteModel):
    """Line item in an office-use request."""

    office_use_request = models.ForeignKey(
        OfficeUseRequest,
        on_delete=models.CASCADE,
        related_name='items',
    )
    item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name='office_use_request_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.item.sku} × {self.quantity}"
