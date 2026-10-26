from decimal import Decimal

from django.conf import settings
from django.db import models

from common.base import TimeStampedModel, SoftDeleteModel


class TreasurySettings(TimeStampedModel, SoftDeleteModel):
    """Per-tenant knobs for the liquidity forecast / gate. Use TreasurySettings.get_for(tenant)."""
    lookahead_days = models.PositiveSmallIntegerField(
        default=45, help_text="How many days ahead the lending check looks for committed outflows.")
    smart_savings_notice_days = models.PositiveSmallIntegerField(
        default=14, help_text="Days between a Smart Saver's withdrawal request and the payout deadline.")
    collection_rate_window_days = models.PositiveSmallIntegerField(
        default=90, help_text="History window used to measure each branch's collection rate.")
    reserve_buffer_days = models.PositiveSmallIntegerField(
        default=0, help_text="Optional safety margin: cover each obligation this many days before it is due. "
                             "0 = money only has to be there on the due date (no lending is held back early).")
    include_arrears_recovery = models.BooleanField(
        default=True, help_text="Count expected recovery of overdue instalments, at each branch's recent recovery rate.")
    max_collection_rate_pct = models.PositiveSmallIntegerField(
        default=90, help_text="Safety cap: never assume a branch collects more than this % of expected repayments.")
    default_contribution_lead_days = models.PositiveSmallIntegerField(
        default=3, help_text="Suggested days before a bank instalment that branches send their share.")

    class Meta:
        verbose_name_plural = 'Treasury settings'

    @classmethod
    def get_for(cls, tenant):
        """Return the tenant's settings row, creating it on first use. Unsaved defaults when no tenant."""
        if tenant is None:
            return cls()
        row = cls.all_objects.filter(tenant=tenant, is_deleted=False).first()
        if row is None:
            row = cls.all_objects.create(tenant=tenant)
        return row


class BankBorrowing(TimeStampedModel, SoftDeleteModel):
    """A loan the company takes from a bank, repaid monthly from one 'debit branch' account."""
    STATUS_DRAFT = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_PAID_OFF = 'paid_off'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft (funds not received)'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_PAID_OFF, 'Paid off'),
    ]

    lender_name = models.CharField(max_length=200)
    reference = models.CharField(max_length=100, blank=True)
    principal = models.DecimalField(max_digits=18, decimal_places=2)
    monthly_rate = models.DecimalField(
        max_digits=7, decimal_places=3, help_text="Interest % per month on the reducing balance.")
    tenor_months = models.PositiveSmallIntegerField()
    first_due_date = models.DateField(help_text="First instalment date. Its day-of-month repeats every month.")
    debit_branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='debit_borrowings')
    debit_bank_account = models.ForeignKey(
        'banks.BankAccount', on_delete=models.PROTECT, related_name='debit_borrowings')
    contribution_lead_days = models.PositiveSmallIntegerField(
        default=3, help_text="Days before each instalment that other branches should send their share.")
    liability_account = models.ForeignKey(
        'accounts.Account', null=True, blank=True, on_delete=models.PROTECT, related_name='bank_borrowings')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    received_on = models.DateField(null=True, blank=True)
    receipt_transaction = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.lender_name} {self.reference} ({self.principal})"


class BorrowingAllocation(TimeStampedModel, SoftDeleteModel):
    """How much of a borrowing's proceeds a branch takes (and therefore its share of every instalment)."""
    borrowing = models.ForeignKey(BankBorrowing, on_delete=models.CASCADE, related_name='allocations')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='borrowing_allocations')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    bank_account = models.ForeignKey(
        'banks.BankAccount', on_delete=models.PROTECT, related_name='borrowing_allocations',
        help_text="Where this branch receives its proceeds and pays its share from.")
    proceeds_transfer = models.ForeignKey(
        'interbranch.InterBranchTransfer', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['borrowing', 'branch'], condition=models.Q(is_deleted=False),
                name='unique_borrowing_allocation_branch'),
        ]

    @property
    def share(self):
        if not self.borrowing.principal:
            return Decimal('0')
        return self.amount / self.borrowing.principal


class BorrowingInstalment(TimeStampedModel, SoftDeleteModel):
    STATUS_PENDING = 'pending'
    STATUS_PAID = 'paid'
    STATUS_CHOICES = [(STATUS_PENDING, 'Pending'), (STATUS_PAID, 'Paid')]

    borrowing = models.ForeignKey(BankBorrowing, on_delete=models.CASCADE, related_name='instalments')
    number = models.PositiveSmallIntegerField()
    due_date = models.DateField(db_index=True)
    principal_due = models.DecimalField(max_digits=18, decimal_places=2)
    interest_due = models.DecimalField(max_digits=18, decimal_places=2)
    total_due = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    paid_transaction = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['borrowing', 'number']
        constraints = [
            models.UniqueConstraint(
                fields=['borrowing', 'number'], condition=models.Q(is_deleted=False),
                name='unique_borrowing_instalment_number'),
        ]


class BorrowingContribution(TimeStampedModel, SoftDeleteModel):
    """A non-debit branch's share of one instalment, to be sent to the debit branch before the due date."""
    STATUS_PENDING = 'pending'
    STATUS_SENT = 'sent'
    STATUS_CHOICES = [(STATUS_PENDING, 'Pending'), (STATUS_SENT, 'Sent')]

    instalment = models.ForeignKey(BorrowingInstalment, on_delete=models.CASCADE, related_name='contributions')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='borrowing_contributions')
    bank_account = models.ForeignKey('banks.BankAccount', on_delete=models.PROTECT, related_name='+')
    principal_part = models.DecimalField(max_digits=18, decimal_places=2)
    interest_part = models.DecimalField(max_digits=18, decimal_places=2)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    due_date = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    transfer = models.ForeignKey(
        'interbranch.InterBranchTransfer', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    recharge_source_transaction = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    recharge_destination_transaction = models.ForeignKey(
        'transactions.Transaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['due_date', 'branch']
        constraints = [
            models.UniqueConstraint(
                fields=['instalment', 'branch'], condition=models.Q(is_deleted=False),
                name='unique_contribution_instalment_branch'),
        ]


class LiquidityDecision(TimeStampedModel):
    """Audit trail of every time the liquidity gate blocked, was overridden, or was acknowledged."""
    STAGE_APPROVAL = 'approval'
    STAGE_DISBURSEMENT = 'disbursement'
    STAGE_CHOICES = [(STAGE_APPROVAL, 'Loan approval'), (STAGE_DISBURSEMENT, 'Loan disbursement')]

    OUTCOME_BLOCKED = 'blocked'
    OUTCOME_OVERRIDDEN = 'overridden'
    OUTCOME_ACKNOWLEDGED = 'acknowledged'
    OUTCOME_CHOICES = [
        (OUTCOME_BLOCKED, 'Blocked'),
        (OUTCOME_OVERRIDDEN, 'Overridden by director'),
        (OUTCOME_ACKNOWLEDGED, 'Impact acknowledged at disbursement'),
    ]

    loan = models.ForeignKey('loans.LoanAccount', on_delete=models.CASCADE, related_name='liquidity_decisions')
    branch = models.ForeignKey('branches.Branch', null=True, on_delete=models.SET_NULL, related_name='+')
    stage = models.CharField(max_length=15, choices=STAGE_CHOICES)
    outcome = models.CharField(max_length=15, choices=OUTCOME_CHOICES, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    reason = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    available_today = models.DecimalField(max_digits=18, decimal_places=2)
    snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['loan', 'stage', 'outcome'])]
