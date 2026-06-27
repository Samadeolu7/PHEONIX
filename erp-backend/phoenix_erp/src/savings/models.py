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
                cashier_account=None, transacted_by=None, date=None):
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
            date: The effective date of the deposit. Defaults to today. Pass the
                payment_date / collection_date when this deposit is part of a
                larger transaction so all GL lines land on the same date.

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
            code='SVDEP',
            defaults={'description': 'Savings Deposits'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=date or timezone.now().date(),
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
        )

        # Credit: Member Savings (SAVINGS/LIABILITY) — balance increases
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=self.account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
        )

        journal_entry.post()

        self.last_transaction_date = timezone.now().date()
        self.save(update_fields=['last_transaction_date'])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.SAVINGS_DEPOSIT,
            acted_by=transacted_by,
            record_type='SavingsAccount',
            record_id=str(self.pk),
            amount=amount,
            description=description or f'Savings deposit – {self.account_number}',
            extra={'account_number': self.account_number,
                   'client_id': str(self.client_id),
                   'journal_entry_id': str(journal_entry.pk)},
        )

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

        withdrawable = self.available_balance - self.minimum_balance
        if amount > withdrawable:
            if self.minimum_balance > 0:
                raise ValidationError(
                    f"Withdrawal would reduce balance below the required minimum of "
                    f"₦{self.minimum_balance:,.2f} held as compulsory savings. "
                    f"Available for withdrawal: ₦{max(withdrawable, Decimal('0.00')):,.2f}."
                )
            raise ValidationError("Insufficient funds")

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='SVWDR',
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
        )

        # Credit: Cashier / Cash account (ASSET) — cash paid out
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=cashier_account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
        )

        journal_entry.post()

        self.last_transaction_date = timezone.now().date()
        self.save(update_fields=['last_transaction_date'])

        from common.models import FinancialAuditLog, log_financial_event
        log_financial_event(
            FinancialAuditLog.SAVINGS_WITHDRAW,
            acted_by=transacted_by,
            record_type='SavingsAccount',
            record_id=str(self.pk),
            amount=amount,
            description=description or f'Savings withdrawal – {self.account_number}',
            extra={'account_number': self.account_number,
                   'client_id': str(self.client_id),
                   'journal_entry_id': str(journal_entry.pk)},
        )

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


# ---------------------------------------------------------------------------
# Savings Product Configuration
# ---------------------------------------------------------------------------

class SavingsProduct(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Extended configuration for a savings Product.
    One-to-one with Product (product_type='SAVINGS').

    Covers two distinct behaviour modes that can both be active on the same product:

    1. DAILY CONTRIBUTION (first_deposit_is_income=True)
       ─────────────────────────────────────────────────
       Clients are expected to make daily deposits throughout the month.
       The *first* deposit each calendar month is treated as income for the
       organisation (posted to first_deposit_income_account) and does NOT
       increase the client's savings balance.  Subsequent deposits in the same
       month add to the savings balance as normal.

    2. SAVINGS CYCLE (has_savings_cycle=True)
       ─────────────────────────────────────
       Clients who keep their balance untouched for cycle_length_months earn
       cycle_interest_rate% interest (posted as expense to
       interest_expense_account).  If they break the cycle early (i.e. make a
       withdrawal before maturity) a penalty of cycle_break_penalty_rate% of
       the balance is charged (posted as income to penalty_income_account).
    """
    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        limit_choices_to={'product_type': 'SAVINGS'},
        related_name='savings_product_config',
    )

    # ── GL accounts ─────────────────────────────────────────────────────────
    interest_expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True, blank=True,
        limit_choices_to={'account_type': Account.EXPENSE},
        related_name='savings_interest_expense',
        help_text="Expense GL account for interest paid TO clients at cycle end.",
    )
    penalty_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True, blank=True,
        limit_choices_to={'account_type': Account.INCOME},
        related_name='savings_cycle_penalty_income',
        help_text="Income GL account for penalties on early cycle withdrawal.",
    )

    # ── Daily contribution settings ──────────────────────────────────────────
    is_daily_contribution = models.BooleanField(
        default=False,
        help_text="True for Ajo / daily-collection type accounts.",
    )
    first_deposit_is_income = models.BooleanField(
        default=False,
        help_text=(
            "When True, the first deposit each calendar month is posted as income "
            "rather than added to the client's savings balance."
        ),
    )
    first_deposit_income_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True, blank=True,
        limit_choices_to={'account_type': Account.INCOME},
        related_name='savings_first_deposit_income',
        help_text="Income GL account for first-deposit income. Required when first_deposit_is_income=True.",
    )

    # ── Cycle savings settings ───────────────────────────────────────────────
    has_savings_cycle = models.BooleanField(
        default=False,
        help_text="Enable fixed-term cycle savings (e.g. 3-month cycle with interest/penalty).",
    )
    cycle_length_months = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Length of the savings cycle in months (e.g. 3).",
    )
    cycle_interest_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="Interest rate (%) paid on opening balance if cycle completes.",
    )
    cycle_break_penalty_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, blank=True,
        help_text="Penalty rate (%) of balance charged on early cycle break.",
    )
    cycle_auto_renew = models.BooleanField(
        default=True,
        help_text="Automatically start a new cycle when the current one matures.",
    )

    # ── Withdrawal controls ──────────────────────────────────────────────────
    withdrawal_needs_approval = models.BooleanField(
        default=True,
        help_text="All withdrawals on this product must go through the approval workflow.",
    )
    only_account_manager_can_withdraw = models.BooleanField(
        default=True,
        help_text=(
            "Only the client's assigned account manager (Client.account_manager) "
            "may initiate a withdrawal request."
        ),
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['product__name']

    def __str__(self):
        return f"SavingsProduct config – {self.product.name}"

    def clean(self):
        if self.first_deposit_is_income and not self.first_deposit_income_account_id:
            raise ValidationError(
                "first_deposit_income_account is required when first_deposit_is_income is True."
            )
        if self.has_savings_cycle:
            if not self.cycle_length_months:
                raise ValidationError("cycle_length_months is required when has_savings_cycle is True.")
            if self.cycle_interest_rate is None:
                raise ValidationError("cycle_interest_rate is required when has_savings_cycle is True.")
            if self.cycle_break_penalty_rate is None:
                raise ValidationError("cycle_break_penalty_rate is required when has_savings_cycle is True.")
            if not self.interest_expense_account_id:
                raise ValidationError("interest_expense_account is required when has_savings_cycle is True.")
            if not self.penalty_income_account_id:
                raise ValidationError("penalty_income_account is required when has_savings_cycle is True.")


# ---------------------------------------------------------------------------
# Withdrawal approval tiers and requests
# ---------------------------------------------------------------------------

class WithdrawalApprovalTier(TimeStampedModel, SoftDeleteModel):
    """
    Global (per-owner) tiered approval configuration for savings withdrawals.

    Example setup:
      Tier 1  ₦0       – ₦49,999   → 1 approver  (Managers)
      Tier 2  ₦50,000  – ₦499,999  → 2 approvers (Managers + Admins)
      Tier 3  ₦500,000 – unlimited → 3 approvers  (Managers + Admins + Director)

    max_amount = None means "no upper limit" (catch-all top tier).
    approver_roles: JSON list of auth.Group names that can approve at this tier,
    e.g. ["Branch Manager", "Admin", "Director"].
    """
    owner = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='withdrawal_approval_tiers',
    )
    tier_name = models.CharField(max_length=100)
    min_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
    )
    max_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text="Leave blank for no upper limit (highest tier).",
    )
    required_approvers = models.PositiveIntegerField(
        default=1,
        help_text="Number of distinct approvals needed before the withdrawal executes.",
    )
    approver_roles = models.JSONField(
        default=list,
        help_text='List of Django auth.Group names that can approve, e.g. ["Manager", "Admin"].',
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(
        default=0,
        help_text="Evaluated from lowest to highest order; first matching tier is used.",
    )

    class Meta:
        ordering = ['owner', 'order']

    def __str__(self):
        upper = f"₦{self.max_amount:,.2f}" if self.max_amount else "∞"
        return f"{self.tier_name} (₦{self.min_amount:,.2f} – {upper}, {self.required_approvers} approver(s))"

    def matches(self, amount: Decimal) -> bool:
        """Return True if amount falls within this tier's range."""
        if amount < self.min_amount:
            return False
        if self.max_amount is not None and amount > self.max_amount:
            return False
        return True


class SavingsWithdrawalRequest(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    A withdrawal request that must go through the tiered approval workflow.

    Lifecycle:
      pending → partially_approved → fully_approved → completed
                                   → rejected
              → cancelled (before first approval)

    The actual GL debit/credit happens ONLY when status becomes 'completed'
    (i.e. all required approvals collected).
    """
    STATUS_PENDING = 'pending'
    STATUS_PARTIAL = 'partially_approved'
    STATUS_APPROVED = 'fully_approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'
    STATUS_COMPLETED = 'completed'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PARTIAL, 'Partially Approved'),
        (STATUS_APPROVED, 'Fully Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    savings_account = models.ForeignKey(
        SavingsAccount,
        on_delete=models.PROTECT,
        related_name='withdrawal_requests',
    )
    requested_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='initiated_withdrawal_requests',
        help_text="Must be the client's account_manager when only_account_manager_can_withdraw is True.",
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )

    # Approval tracking (snapshot at creation)
    required_approvals = models.PositiveIntegerField(
        help_text="Snapshot of WithdrawalApprovalTier.required_approvers at creation time.",
    )
    approvals_received = models.PositiveIntegerField(default=0)
    applied_tier = models.ForeignKey(
        WithdrawalApprovalTier,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='withdrawal_requests',
        help_text="The tier that was matched for this request.",
    )

    # Where the money goes once approved
    destination_bank_account = models.ForeignKey(
        'banks.BankAccount',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='incoming_withdrawal_requests',
        help_text="Bank account to credit when withdrawal completes.",
    )
    cashier_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        null=True, blank=True,
        limit_choices_to={'account_type': Account.ASSET},
        related_name='withdrawal_request_cashier',
        help_text="Cash / Cashier GL account debited from savings, used when no bank account.",
    )

    # GL journal entry — set only when status = completed
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='savings_withdrawal_requests',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['savings_account', 'status']),
        ]

    def __str__(self):
        return (
            f"Withdrawal ₦{self.amount:,.2f} from {self.savings_account.account_number} "
            f"[{self.get_status_display()}]"
        )

    @property
    def is_fully_approved(self) -> bool:
        return self.approvals_received >= self.required_approvals

    def cancel(self, user):
        """Cancel before any approvals have been collected."""
        if self.approvals_received > 0:
            raise ValidationError("Cannot cancel a request that has already received approvals.")
        self.status = self.STATUS_CANCELLED
        self.save(update_fields=['status', 'updated_at'])


class WithdrawalApprovalStep(TimeStampedModel, SoftDeleteModel):
    """
    One row per approver slot per withdrawal request.
    Steps are created upfront (required_approvals rows), then filled in as
    approvers respond.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    withdrawal_request = models.ForeignKey(
        SavingsWithdrawalRequest,
        on_delete=models.CASCADE,
        related_name='approval_steps',
    )
    step_number = models.PositiveIntegerField(
        help_text="1-based position in the approval chain.",
    )
    approver = models.ForeignKey(
        'users.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='withdrawal_approval_steps',
        help_text="Populated when an eligible user claims and responds to this step.",
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    comment = models.TextField(blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['withdrawal_request', 'step_number']
        unique_together = [['withdrawal_request', 'step_number']]

    def __str__(self):
        return (
            f"Step {self.step_number} for {self.withdrawal_request} "
            f"— {self.get_status_display()}"
        )