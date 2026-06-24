from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import transaction as db_transaction
from django.utils import timezone
from .base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from .hub import Tenant


class MenuGroup(TimeStampedModel, SoftDeleteModel):
    tenant    = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="menu_groups")
    code      = models.SlugField(max_length=50, help_text="Internal code, e.g. 'finance'")
    label     = models.CharField(max_length=100, help_text="Visible title, e.g. 'Finance'")
    order     = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('tenant', 'code')
        ordering = ['order']

    def get_accessible_items(self, user):
        """Get only items the user has permission to see"""
        qs = self.items.filter(is_deleted=False)
        result = []
        for item in qs:
            has = False
            try:
                has = item.user_has_permission(user)
            except Exception:
                pass
            if has:
                result.append(item)
        return result

    def reorder_items(self, new_order):
        """Update the order of items"""
        from django.db import transaction
        with transaction.atomic():
            for position, item_id in enumerate(new_order):
                self.items.filter(id=item_id).update(order=position)

class MenuItem(TimeStampedModel, SoftDeleteModel):
    group       = models.ForeignKey(MenuGroup, on_delete=models.CASCADE, related_name="items")
    code        = models.SlugField(max_length=50, help_text="Internal code, e.g. 'trial_balance'")
    label       = models.CharField(max_length=100, help_text="Visible title, e.g. 'Trial Balance'")
    route       = models.CharField(max_length=200, help_text="Frontend route or URL name")
    order       = models.PositiveIntegerField(default=0)
    permission  = models.CharField(
        max_length=100,
        blank=True,
        help_text="Django perm codename required to see this item, e.g. 'transactions.view_trialbalance'"
    )

    class Meta:
        unique_together = ('group', 'code')
        ordering = ['order']

    def user_has_permission(self, user):
        """Check if user has the required permission for this menu item"""
        if not self.permission:
            return True
        return user.has_perm(self.permission)

    def save(self, *args, **kwargs):
        """Ensure tenant is inherited from the group if not explicitly set."""
        try:
            if getattr(self, 'tenant', None) is None and self.group and getattr(self.group, 'tenant', None) is not None:
                self.tenant = self.group.tenant
        except Exception:
            pass
        super().save(*args, **kwargs)


class ReferenceTracking(TimeStampedModel):
    """
    Track reference chains across modules
    
    Every document gets a unique reference number (PR-2026-0001, PO-2026-0045, etc.)
    and is tracked here with links to its origin and parent.
    
    This enables complete transaction tracing from start to finish:
    PR-2026-0001 → PO-2026-0045 → GRN-2026-0123 → EXP-2026-0567 → AP-2026-0234 → PAY-2026-0189
    """
    
    MODULE_CHOICES = [
        ('procurement', 'Procurement'),
        ('expenses', 'Expenses'),
        ('inventory', 'Inventory'),
        ('assets', 'Assets'),
        ('liabilities', 'Liabilities'),
        ('incomes', 'Incomes'),
    ]
    
    reference_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique reference number for this document"
    )
    
    module = models.CharField(
        max_length=50,
        choices=MODULE_CHOICES,
        help_text="Module that owns this document"
    )
    
    model_name = models.CharField(
        max_length=100,
        help_text="Model class name (e.g., 'purchase_requisition')"
    )
    
    object_id = models.IntegerField(
        help_text="Primary key of the actual document"
    )
    
    # Tracking
    origin_reference = models.CharField(
        max_length=50,
        db_index=True,
        help_text="First reference in chain (the originating document)"
    )
    
    parent_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="Immediate parent reference (empty if this is the origin)"
    )
    
    # Workflow
    workflow_run = models.ForeignKey(
        'automations.WorkflowRun',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='tracked_references'
    )
    
    # Metadata
    status = models.CharField(
        max_length=50,
        help_text="Current status of the document"
    )
    
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Document amount (if applicable)"
    )
    
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional metadata (department, requester, etc.)"
    )
    
    # Ownership
    tenant = models.ForeignKey(
        'users.Tenant',
        on_delete=models.CASCADE,
        related_name='tracked_references'
    )
    
    branch = models.ForeignKey(
        'branches.Branch',
        on_delete=models.CASCADE,
        related_name='tracked_references'
    )
    
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='created_references'
    )
    
    class Meta:
        db_table = 'common_reference_tracking'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['origin_reference', 'created_at']),
            models.Index(fields=['parent_reference']),
            models.Index(fields=['module', 'status']),
            models.Index(fields=['reference_number']),
        ]
        verbose_name = 'Reference Tracking'
        verbose_name_plural = 'Reference Tracking'
    
    def __str__(self):
        return f"{self.reference_number} ({self.module})"
    
    def get_chain(self):
        """Get all references in this chain"""
        return ReferenceTracking.objects.filter(
            origin_reference=self.origin_reference
        ).order_by('created_at')
    
    def get_children(self):
        """Get direct children of this reference"""
        return ReferenceTracking.objects.filter(
            parent_reference=self.reference_number
        )


# ── Business Day Controls ─────────────────────────────────────────────────────

class BusinessDay(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Represents an accounting day for a branch.

    A day is 'open' by default. It is closed:
      - Automatically when the branch manager reconciles a DailyCollectionSheet
        for that date.
      - Manually when a BM calls the close_day() action.

    Any Transaction posted to a closed day will be rejected unless the user
    holds the 'common.override_closed_day' permission.
    """
    STATUS_CHOICES = [
        ('open',   'Open'),
        ('closed', 'Closed'),
    ]

    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='open', db_index=True
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='closed_business_days',
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    override_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='overridden_business_days',
        help_text="User who overrode the day closure to post a backdated entry",
    )
    override_reason = models.TextField(blank=True)

    class Meta:
        unique_together = [('branch', 'date')]
        ordering = ['-date']

    def __str__(self):
        return f"{self.branch} — {self.date} [{self.status}]"

    @db_transaction.atomic
    def close(self, closed_by_user):
        """Manually close this business day."""
        if self.status == 'closed':
            raise ValidationError(f"Business day {self.date} is already closed.")
        self.status = 'closed'
        self.closed_by = closed_by_user
        self.closed_at = timezone.now()
        self.save(update_fields=['status', 'closed_by', 'closed_at'])

    @classmethod
    def get_or_open(cls, branch, date):
        """Get or create an open BusinessDay for the given branch and date."""
        obj, _ = cls.objects.get_or_create(
            branch=branch,
            date=date,
            defaults={'status': 'open'},
        )
        return obj

    @classmethod
    def is_closed(cls, branch, date) -> bool:
        """Return True if this branch/date combination has been closed."""
        return cls.objects.filter(branch=branch, date=date, status='closed').exists()


class BackdateRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Request by a credit officer to post a transaction on a past (closed) date.
    Must be approved by a branch manager or above before the entry is allowed.
    """
    STATUS_CHOICES = [
        ('pending',  'Pending BM Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='backdate_requests',
    )
    target_date = models.DateField(help_text="The closed date the user wants to post to")
    reason = models.TextField()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='pending', db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_backdate_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Backdate request by {self.requested_by} for {self.target_date} [{self.status}]"

    @db_transaction.atomic
    def approve(self, reviewed_by_user):
        if self.status != 'pending':
            raise ValidationError("Only pending backdate requests can be approved.")
        self.status = 'approved'
        self.reviewed_by = reviewed_by_user
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

    @db_transaction.atomic
    def reject(self, reviewed_by_user, reason=''):
        if self.status != 'pending':
            raise ValidationError("Only pending backdate requests can be rejected.")
        self.status = 'rejected'
        self.reviewed_by = reviewed_by_user
        self.reviewed_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])


# ── Financial Audit Log ───────────────────────────────────────────────────────

class FinancialAuditLog(models.Model):
    """
    Immutable, append-only record of every financial operation.

    Covers: loan approvals, disbursements, repayments, savings deposits and
    withdrawals, manual GL journal entries, and permission/role changes.

    This table must NEVER be truncated or soft-deleted in production.
    Row-level DELETE permission should be revoked from the app DB user.
    """

    # Event types
    LOAN_APPROVE        = 'loan_approve'
    LOAN_DISBURSE       = 'loan_disburse'
    LOAN_REPAY          = 'loan_repay'
    SAVINGS_DEPOSIT     = 'savings_deposit'
    SAVINGS_WITHDRAW    = 'savings_withdraw'
    JOURNAL_POST        = 'journal_post'
    PERMISSION_CHANGE   = 'permission_change'
    USER_ROLE_CHANGE    = 'user_role_change'

    EVENT_CHOICES = [
        (LOAN_APPROVE,      'Loan Approved'),
        (LOAN_DISBURSE,     'Loan Disbursed'),
        (LOAN_REPAY,        'Loan Repayment'),
        (SAVINGS_DEPOSIT,   'Savings Deposit'),
        (SAVINGS_WITHDRAW,  'Savings Withdrawal'),
        (JOURNAL_POST,      'Journal Entry Posted'),
        (PERMISSION_CHANGE, 'Permission Changed'),
        (USER_ROLE_CHANGE,  'User Role Changed'),
    ]

    event_type      = models.CharField(max_length=30, choices=EVENT_CHOICES, db_index=True)
    acted_by        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='financial_audit_logs',
    )
    branch          = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    tenant          = models.ForeignKey(
        'users.Tenant',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    record_type     = models.CharField(max_length=100)
    record_id       = models.CharField(max_length=50, db_index=True)
    amount          = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    description     = models.TextField(blank=True)
    extra           = models.JSONField(default=dict, blank=True)
    ip_address      = models.GenericIPAddressField(null=True, blank=True)
    timestamp       = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['event_type', 'timestamp']),
            models.Index(fields=['acted_by', 'timestamp']),
            models.Index(fields=['record_type', 'record_id']),
        ]

    def __str__(self):
        return f"{self.get_event_type_display()} by {self.acted_by_id} at {self.timestamp:%Y-%m-%d %H:%M}"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError('FinancialAuditLog entries are immutable and cannot be modified.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('FinancialAuditLog entries cannot be deleted.')


def log_financial_event(
    event_type,
    *,
    acted_by,
    record_type,
    record_id,
    amount=None,
    description='',
    extra=None,
    request=None,
):
    """
    Write a FinancialAuditLog entry. Safe to call inside atomic blocks —
    audit failures are logged but never propagate to the caller.

    Usage::

        log_financial_event(
            FinancialAuditLog.LOAN_APPROVE,
            acted_by=request.user,
            record_type='LoanAccount',
            record_id=str(loan.pk),
            amount=loan.approved_amount,
            description=f'Loan {loan.loan_number} approved',
            request=request,
        )
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        branch = getattr(acted_by, 'branch', None) if acted_by else None
        tenant = getattr(acted_by, 'tenant', None) if acted_by else None
        ip = None
        if request is not None:
            x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
            ip = x_forwarded.split(',')[0].strip() if x_forwarded else request.META.get('REMOTE_ADDR')
            if branch is None:
                branch = getattr(request.user, 'branch', None)
            if tenant is None:
                tenant = getattr(request.user, 'tenant', None)
        FinancialAuditLog.objects.create(
            event_type=event_type,
            acted_by=acted_by,
            branch=branch,
            tenant=tenant,
            record_type=record_type,
            record_id=str(record_id),
            amount=amount,
            description=description,
            extra=extra or {},
            ip_address=ip,
        )
    except Exception:
        _log.exception(
            'FinancialAuditLog: failed to write %s event for record %s#%s',
            event_type, record_type, record_id,
        )