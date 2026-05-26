from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import transaction
from decimal import Decimal
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from products.models import Product
from clients.models import Client


class SavingsAccount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Enhanced savings account model linked to Account hierarchy.
    Each SavingsAccount gets its own child Account under the parent "Savings" GL account.
    """
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name='savings_accounts')
    
    # Link to child account in Account hierarchy
    account = models.OneToOneField(
        Account,
        on_delete=models.PROTECT,
        limit_choices_to={
            'account_type': Account.SAVINGS,
            'account_level': Account.LEVEL_CHILD
        },
        related_name='savings_account_detail'
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        limit_choices_to={'product_type': 'SAVINGS'},
        related_name='savings_accounts'
    )
    
    # Account Details
    account_number = models.CharField(max_length=50, unique=True)
    nickname = models.CharField(max_length=100, blank=True)
    
    # Status and Terms
    status = models.CharField(max_length=20, choices=[
        ('active', 'Active'),
        ('dormant', 'Dormant'),
        ('frozen', 'Frozen'),
        ('closed', 'Closed')
    ], default='active')
    
    opened_on = models.DateField()
    closed_on = models.DateField(null=True, blank=True)
    last_transaction_date = models.DateField(null=True, blank=True)
    
    # Financial Terms
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    interest_calculation_method = models.CharField(max_length=20, choices=[
        ('daily', 'Daily'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annually', 'Annually')
    ])
    minimum_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    # Flags and Settings
    allow_overdraft = models.BooleanField(default=False)
    overdraft_limit = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    auto_renew = models.BooleanField(default=True)
    statement_frequency = models.CharField(max_length=20, choices=[
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annually', 'Annually'),
        ('on_demand', 'On Demand')
    ], default='monthly')

    # For weekly-cycle accounts: which weekday contributions are expected (0=Monday … 6=Sunday)
    contribution_day_of_week = models.IntegerField(
        null=True,
        blank=True,
        choices=[
            (0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'),
            (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday'),
        ],
        help_text="Only used when the linked product has contribution_cycle='weekly'."
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    @property
    def current_balance(self):
        """Get current balance from linked account."""
        return self.account.balance
    
    @property
    def available_balance(self):
        """Calculate available balance including overdraft."""
        balance = self.account.balance
        if self.allow_overdraft:
            return balance + self.overdraft_limit
        return balance
    
    @transaction.atomic
    def deposit(self, amount: Decimal, description: str = "Deposit",
                cashier_account=None, transacted_by=None):
        """
        Record a member deposit and create the corresponding GL journal entry.

        GL entry (SAV-DEP series):
            Dr. Cashier / Cash account (cashier_account) — ASSET goes up
            Cr. Member Savings account  (self.account)   — SAVINGS/LIABILITY goes up

        Args:
            amount: Deposit amount (must be > 0).
            description: Narrative for the transaction.
            cashier_account: The Cash/Bank GL Account receiving the cash.
                Required — the teller's cash account or main bank account.
            transacted_by: The User performing the deposit (created_by on the
                journal entry).

        Raises:
            ValidationError: if amount is not positive or cashier_account is missing.
        """
        if amount <= 0:
            raise ValidationError("Deposit amount must be positive")

        if not cashier_account:
            raise ValidationError(
                "cashier_account is required. Pass the Cash/Bank GL account "
                "that physically received the deposit."
            )

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='SAV-DEP',
            defaults={'description': 'Savings Deposits'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=description or f"Savings deposit – {self.account_number}",
            owner=self.owner,
            branch=self.branch,
            created_by=transacted_by,
        )

        # Debit: Cashier / Cash account (ASSET) — cash received
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cashier_account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
            description=f"Cash received from {self.client.full_name} – deposit",
        )

        # Credit: Member Savings (SAVINGS/LIABILITY) — balance increases
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
            description=f"Savings deposit – {self.account_number}",
        )

        journal_entry.post()

        self.last_transaction_date = timezone.now().date()
        self.save(update_fields=['last_transaction_date'])

        return journal_entry

    @transaction.atomic
    def withdraw(self, amount: Decimal, description: str = "Withdrawal",
                 cashier_account=None, transacted_by=None):
        """
        Record a member withdrawal and create the corresponding GL journal entry.

        GL entry (SAV-WDR series):
            Dr. Member Savings account  (self.account)   — SAVINGS/LIABILITY goes down
            Cr. Cashier / Cash account (cashier_account) — ASSET goes down

        Args:
            amount: Withdrawal amount (must be > 0).
            description: Narrative for the transaction.
            cashier_account: The Cash/Bank GL Account giving out the cash.
                Required — the teller's cash account or main bank account.
            transacted_by: The User performing the withdrawal.

        Raises:
            ValidationError: if insufficient funds, amount not positive, or
                cashier_account is missing.
        """
        if amount <= 0:
            raise ValidationError("Withdrawal amount must be positive")

        if not cashier_account:
            raise ValidationError(
                "cashier_account is required. Pass the Cash/Bank GL account "
                "that will pay out the withdrawal."
            )

        if amount > self.available_balance:
            raise ValidationError("Insufficient funds")

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='SAV-WDR',
            defaults={'description': 'Savings Withdrawals'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=description or f"Savings withdrawal – {self.account_number}",
            owner=self.owner,
            branch=self.branch,
            created_by=transacted_by,
        )

        # Debit: Member Savings (SAVINGS/LIABILITY) — balance decreases
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
            description=f"Savings withdrawal – {self.account_number}",
        )

        # Credit: Cashier / Cash account (ASSET) — cash paid out
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cashier_account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
            description=f"Cash paid to {self.client.full_name} – withdrawal",
        )

        journal_entry.post()

        self.last_transaction_date = timezone.now().date()
        self.save(update_fields=['last_transaction_date'])
    
    def __str__(self):
        return f"{self.account_number} - {self.client.name} ({self.account.code})"

    class Meta:
        ordering = ['-opened_on']
        indexes = [
            models.Index(fields=['account_number']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.client.full_name} - {self.product.name} ({self.account_number})"

    def clean(self):
        """Validate account data"""
        if self.closed_on and self.closed_on < self.opened_on:
            raise ValidationError('Closing date must be after opening date')
        if self.current_balance < -self.overdraft_limit:
            raise ValidationError('Balance cannot be less than negative overdraft limit')

    def calculate_available_balance(self):
        """
        Calculate available balance considering pending holds and overdraft limit.

        Returns the computed balance without saving it (available_balance is a
        @property derived from the GL account — there is no dedicated DB column).
        """
        holds = self.transaction_holds.filter(
            status='active'
        ).aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')

        balance = self.current_balance - holds
        if self.allow_overdraft:
            balance += self.overdraft_limit

        return balance

class SavingsGoal(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Track savings goals/targets for accounts
    """
    account = models.ForeignKey(SavingsAccount, on_delete=models.CASCADE, related_name='goals')
    name = models.CharField(max_length=200)
    target_amount = models.DecimalField(max_digits=18, decimal_places=2)
    current_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    target_date = models.DateField()
    
    # Automatic savings rules
    auto_save = models.BooleanField(default=False)
    save_frequency = models.CharField(max_length=20, choices=[
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly')
    ], null=True, blank=True)
    save_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=[
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ], default='active')
    
    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    def __str__(self):
        return f"{self.account.client.full_name} - {self.name}"

    @property
    def progress_percentage(self):
        """Calculate progress towards goal"""
        if self.target_amount:
            return (self.current_amount / self.target_amount) * 100
        return 0

class TransactionHold(TimeStampedModel, SoftDeleteModel):
    """
    Track holds/freezes on account funds
    """
    account = models.ForeignKey(
        SavingsAccount,
        on_delete=models.CASCADE,
        related_name='transaction_holds'
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    reason = models.CharField(max_length=200)
    hold_type = models.CharField(max_length=50, choices=[
        ('pending_debit', 'Pending Debit'),
        ('legal_hold', 'Legal Hold'),
        ('collateral', 'Collateral Hold'),
        ('other', 'Other')
    ])
    status = models.CharField(max_length=20, choices=[
        ('active', 'Active'),
        ('released', 'Released'),
        ('expired', 'Expired')
    ], default='active')
    
    placed_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='placed_holds'
    )
    release_date = models.DateTimeField(null=True, blank=True)
    released_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='released_holds'
    )
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.account.account_number} - {self.amount} ({self.get_hold_type_display()})"

    def release(self, user, notes=None):
        """Release the hold"""
        self.status = 'released'
        self.release_date = timezone.now()
        self.released_by = user
        if notes:
            self.notes += f"\nReleased: {notes}"
        self.save()
        self.account.calculate_available_balance()

class InterestAccrual(TimeStampedModel, SoftDeleteModel):
    """
    Track interest accruals on savings accounts
    """
    account = models.ForeignKey(
        SavingsAccount,
        on_delete=models.CASCADE,
        related_name='interest_accruals'
    )
    calculation_date = models.DateField()
    daily_balance = models.DecimalField(max_digits=18, decimal_places=2)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    accrued_amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('posted', 'Posted'),
        ('reversed', 'Reversed')
    ], default='pending')
    
    posting_date = models.DateField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_interest'
    )

    class Meta:
        ordering = ['calculation_date']
        indexes = [
            models.Index(fields=['calculation_date']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.account.account_number} - {self.calculation_date} - {self.accrued_amount}"


# ---------------------------------------------------------------------------
# Smart Savings
# ---------------------------------------------------------------------------

class SmartSavingsAccount(TimeStampedModel, SoftDeleteModel):
    """
    Opt-in 3-month cycle savings feature.
    Any SavingsAccount (any cycle type) can activate Smart Savings.
    At maturity (3 months) the account earns 6% interest on the opening balance.
    Early withdrawal incurs a penalty.
    """
    savings = models.OneToOneField(
        SavingsAccount,
        on_delete=models.CASCADE,
        related_name='smart_account',
    )
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(help_text="Date when current 3-month cycle began.")
    opening_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Balance at cycle start. Interest is calculated on this amount.",
    )
    last_interest_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date interest was last applied.",
    )

    @property
    def maturity_date(self):
        from dateutil.relativedelta import relativedelta
        return self.start_date + relativedelta(months=3)

    @property
    def matured(self):
        return timezone.localdate() >= self.maturity_date

    def __str__(self):
        return f"Smart Savings – {self.savings.account_number} (active={self.is_active})"


class SmartSavingsEvent(TimeStampedModel):
    """Audit log for interest credits and early-withdrawal penalties."""
    INTEREST = 'interest'
    PENALTY = 'penalty'
    EVENT_TYPE_CHOICES = [
        (INTEREST, 'Interest Applied'),
        (PENALTY, 'Early Withdrawal Penalty'),
    ]
    account = models.ForeignKey(
        SmartSavingsAccount,
        on_delete=models.CASCADE,
        related_name='events',
    )
    event_type = models.CharField(max_length=10, choices=EVENT_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    details = models.TextField(blank=True)

    def __str__(self):
        return f"{self.get_event_type_display()} – {self.amount} on {self.created_at:%Y-%m-%d}"


# ---------------------------------------------------------------------------
# Contribution Schedule
# ---------------------------------------------------------------------------

class ContributionSchedule(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Pre-generated expected contribution dates for a savings account.
    One row per expected contribution date.
    Generated monthly (current month only; regenerate at month start).
    """
    PENDING = 'pending'
    PAID = 'paid'
    MISSED = 'missed'
    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (PAID, 'Paid'),
        (MISSED, 'Missed'),
    ]

    savings_account = models.ForeignKey(
        SavingsAccount,
        on_delete=models.CASCADE,
        related_name='contribution_schedule',
    )
    expected_date = models.DateField(db_index=True)
    expected_amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING, db_index=True)

    # Set when the contribution is marked paid
    savings_transaction = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contribution_schedules',
    )
    paid_on = models.DateField(null=True, blank=True)
    paid_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='collected_contributions',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = ['savings_account', 'expected_date']
        ordering = ['expected_date']
        indexes = [
            models.Index(fields=['expected_date', 'status']),
        ]

    def __str__(self):
        return (
            f"{self.savings_account.account_number} – "
            f"{self.expected_date} – {self.get_status_display()}"
        )


# ---------------------------------------------------------------------------
# Compulsory Savings Policy
# ---------------------------------------------------------------------------

class CompulsorySavingsPolicy(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Per-owner/tenant compulsory savings deduction applied at loan disbursement.
    Typically one active row per owner (enforced via `enabled` flag).
    """
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Fixed amount deducted from loan disbursement into client savings.",
    )
    enabled = models.BooleanField(default=False)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    def __str__(self):
        state = "enabled" if self.enabled else "disabled"
        return f"Compulsory Savings Policy – ₦{self.amount} ({state})"