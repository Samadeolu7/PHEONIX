import logging
import re
from decimal import Decimal
from django.conf import settings
from django.db import models, connection, transaction as txt
from django.core.exceptions import ValidationError
from django.db.models import JSONField
from django.utils import timezone
from django.apps import apps

from common.managers import OwnerBranchManager, SoftDeleteManager
from common.base import BranchScopedModel, SoftDeleteModel, TimeStampedModel

logger = logging.getLogger(__name__)

# Lazy imports to avoid circular dependencies
def get_account_model():
    return apps.get_model('accounts', 'Account')

def get_period_model():
    return apps.get_model('accounts', 'Period')

class TransactionSeries(models.Model):
    """
    Defines a short alpha PREFIX and ensures a matching Postgres sequence exists.
    """
    code = models.CharField(
        max_length=5,
        unique=True,
        help_text="Short alpha code, e.g. 'CA' for Current Assets, 'LN' for Loans"
    )
    description = models.CharField(max_length=200, blank=True)
    sequence_name = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        help_text="Internally used Postgres sequence name"
    )
    
    def save(self, *args, **kwargs):
        # On first save, derive the sequence name
        if not self.sequence_name:
            self.sequence_name = f"seq_ref_{self.code.lower()}"
        super().save(*args, **kwargs)

        # Ensure the Postgres sequence exists
        # Guard: sequence_name is derived from code, but validate to prevent SQL injection
        if not re.match(r'^[a-z0-9_]+$', self.sequence_name):
            raise ValueError(f"Invalid sequence name: {self.sequence_name!r}")
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE SEQUENCE IF NOT EXISTS {self.sequence_name} START 1;"
            )

    def __str__(self):
        return f"{self.code} – {self.description or '(no desc)'}"


class Transaction(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Core transaction: auto-generates a ref no on creation using its series' sequence.
    All balance updates happen through TransactionEntry with proper concurrency control.
    """
    series = models.ForeignKey(
        TransactionSeries,
        on_delete=models.PROTECT,
        help_text="Select the series (e.g. CA, LN) to drive the reference number."
    )
    date = models.DateField(default=timezone.localdate)
    reference_number = models.CharField(
        max_length=50,  # Increased from 30 to 50 for longer series codes
        editable=False, 
        unique=True,
        help_text="Auto-generated reference number"
    )
    workflow_reference = models.CharField(
        max_length=50,  # Increased from 30 to 50 for workflow run references
        null=True, 
        blank=True, 
        help_text="Optional reference for external workflows"
    )
    
    # Approval workflow
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL,
        null=True, 
        blank=True, 
        related_name="approved_transactions"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    description = models.CharField(max_length=255)
    
    # Reversal tracking
    is_reversed = models.BooleanField(
        default=False, 
        help_text="Whether this transaction has been reversed"
    )
    reversed_at = models.DateTimeField(
        null=True, 
        blank=True, 
        help_text="When this transaction was reversed"
    )
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reversed_transactions",
        help_text="User who reversed this transaction"
    )
    reversal_reason = models.TextField(
        blank=True, 
        help_text="Reason for reversal"
    )
    reversal_transaction = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='original_transaction',
        help_text="The reversing transaction (if this is reversed)"
    )
    is_reversal = models.BooleanField(
        default=False, 
        help_text="Whether this transaction is a reversal of another"
    )
    reverses_transaction = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reversed_by_transaction',
        help_text="The original transaction (if this is a reversal)"
    )
    
    @txt.atomic
    def post(self):
        """
        Post transaction: STRICTLY validate entries and update all account balances.
        This is the main method for committing a transaction.
        
        CRITICAL SAFEGUARDS:
        1. Transaction cannot be posted twice
        2. Entries MUST balance (debits = credits)
        3. All amounts MUST be positive
        4. Account balances updated atomically
        """
        if self.approved:
            raise ValidationError("Transaction already posted")
        
        # STRICT balance validation
        if not self.validate_entries():
            from django.db.models import Sum
            debits = self.entries.filter(side=TransactionEntry.DEBIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            credits = self.entries.filter(side=TransactionEntry.CREDIT).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            raise ValidationError(
                f"CANNOT POST UNBALANCED TRANSACTION. "
                f"Reference: {self.reference_number}, "
                f"Debits: {debits}, Credits: {credits}, "
                f"Difference: {debits - credits}, "
                f"Description: {self.description}"
            )
        
        # Validate all entry amounts are positive
        for entry in self.entries.all():
            if entry.amount <= 0:
                raise ValidationError(
                    f"Invalid entry amount: {entry.amount} for account {entry.account.name}. "
                    f"All amounts must be positive. Use 'side' field to indicate debit/credit."
                )
        
        # Update all account balances atomically
        for entry in self.entries.all():
            entry.post()
        
        # Mark as approved
        self.approved = True
        self.approved_at = timezone.now()
        self.save(update_fields=['approved', 'approved_at'])
    
    def validate_entries(self) -> bool:
        """
        Validate that debits equal credits.
        
        Returns:
            True if balanced, False otherwise
        """
        from django.db.models import Sum, Q
        
        entries = self.entries.all()
        
        debits = entries.filter(side=TransactionEntry.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        
        credits = entries.filter(side=TransactionEntry.CREDIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        
        return debits == credits
    
    def get_total_amount(self) -> Decimal:
        """Get total debit/credit amount (should be same on both sides)."""
        from django.db.models import Sum
        return self.entries.filter(side=TransactionEntry.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
    
    def verify_trial_balance_impact(self) -> bool:
        """
        Verify that this transaction maintains trial balance.
        
        In a proper double-entry system:
        - Sum of all debits = Sum of all credits (for the transaction)
        - Sum of balance effects = 0 (accounting equation preserved)
        
        This validates the fundamental accounting equation:
        Assets = Liabilities + Equity
        
        Returns:
            True if trial balance is maintained, False otherwise
        """
        # Method 1: Traditional validation (debits = credits)
        if not self.validate_entries():
            return False
        
        # Method 2: Verify sum of signed amounts = 0
        # This ensures the accounting equation is preserved
        total_signed = sum(entry.signed_amount() for entry in self.entries.all())
        if total_signed != Decimal('0.00'):
            return False
        
        return True
    
    class Meta:
        ordering = ['-date', 'created_at']
        unique_together = [
            ('owner', 'reference_number'),
        ]
        indexes = [
            models.Index(fields=['owner', 'reference_number']),
            models.Index(fields=['owner', 'workflow_reference']),
            # CRITICAL: For date range queries in financial reports
            models.Index(fields=['date', 'owner', 'branch', 'is_deleted'], name='idx_trans_date_owner_br'),
            models.Index(fields=['owner', 'date'], name='idx_trans_owner_date'),
            models.Index(fields=['branch', 'date'], name='idx_trans_branch_date'),
        ]

    def clean(self):
        # Reversal integrity: a transaction cannot be simultaneously reversed and a reversal
        if self.is_reversed and self.is_reversal:
            raise ValidationError("Transaction cannot be both reversed and a reversal")
        # Cannot validate entries before the transaction is saved (no pk yet)
        if not self.pk:
            return
        # ensure debit and credit sum to zero
        total = sum(entry.signed_amount() for entry in self.entries.all())
        credits = [(entry.account.name, entry.amount) for entry in self.entries.all() if entry.side == TransactionEntry.CREDIT]
        debits = [(entry.account.name,entry.amount) for entry in self.entries.all() if entry.side == TransactionEntry.DEBIT]
        total_credits = sum(entry.amount for entry in self.entries.all() if entry.side == TransactionEntry.CREDIT)
        total_debits = sum(entry.amount for entry in self.entries.all() if entry.side == TransactionEntry.DEBIT)
        if total != Decimal('0.00'):
            raise ValidationError(f"Transaction entries must balance debits={total_debits} credits={total_credits} difference={total},debit sections={debits},credit sections={credits}, desc={self.description}")

        # enforce period closure
        # look up the Month period
        Period = apps.get_model('accounts', 'Period')
        month = Period.objects.for_owner(self.owner).filter(
            period_type=Period.MONTH,
            year=self.date.year,
            month=self.date.month,
            branch=self.branch,
            is_closed=True
        ).exists()
        if month:
            raise ValidationError(f"Cannot post: month {self.date.year}-{self.date.month:02d} is closed.")
        
        # if posting a Dec entry and closing year
        Period = apps.get_model('accounts', 'Period')
        year_closed = Period.objects.for_owner(self.owner).filter(
            period_type=Period.YEAR,
            year=self.date.year,
            branch=self.branch,
            is_closed=True
        ).exists()
        if year_closed:
            raise ValidationError(f"Cannot post: fiscal year {self.date.year} is closed.")

    def _next_sequence(self):
        """Fetch next sequence value from Postgres."""
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT nextval(%s)", [self.series.sequence_name])
            return cursor.fetchone()[0]

    def _build_reference(self):
        ymd = self.date.strftime("%Y%m%d")
        seq = self._next_sequence()
        return f"{self.series.code}-{ymd}-{seq:04d}"

    def save(self, *args, **kwargs):
        """
        Minimal save: generate reference number for new records and persist.
        Posting of entries and validation is handled by the create_transaction orchestrator.
        If callers still call tx.full_clean() before saving, that's acceptable.
        """
        # Ensure tenant set from owner when missing (helps direct creates/tests)
        try:
            if getattr(self, 'tenant', None) is None and getattr(self, 'owner', None) is not None:
                owner_tenant = getattr(self.owner, 'tenant', None)
                if owner_tenant is not None:
                    self.tenant = owner_tenant
        except Exception:
            pass

        is_new = self.pk is None
        if is_new:
            # ensure reference number is generated (needs sequence)
            if not self.reference_number:
                self.reference_number = self._build_reference()
        super().save(*args, **kwargs)


    def __str__(self):
        return self.reference_number

    @txt.atomic
    def reverse(self, user, reason=''):
        """
        Reverse this entire transaction by creating an opposite transaction.
        This is the RECOMMENDED approach for financial integrity.
        
        Steps:
        1. Mark original as reversed
        2. Create new transaction with opposite entries
        3. Post the reversal entries to update balances
        4. Link transactions together
        """
        if self.is_reversed:
            raise ValidationError("This transaction has already been reversed")
        
        if not self.approved:
            raise ValidationError("Cannot reverse unapproved transaction")
        
        if self.is_reversal:
            raise ValidationError("Cannot reverse a reversal transaction")
        
        # Check period closure
        Period = get_period_model()
        today = timezone.now().date()
        month_closed = Period.objects.for_owner(self.owner).filter(
            period_type=Period.MONTH,
            year=today.year,
            month=today.month,
            branch=self.branch,
            is_closed=True
        ).exists()
        
        if month_closed:
            raise ValidationError(f"Cannot reverse: current month is closed")
        
        with txt.atomic():
            # Build -REV suffixed refs defensively (max_length=50)
            _rev = '-REV'
            rev_ref = (
                self.reference_number[:50 - len(_rev)] + _rev
                if len(self.reference_number) + len(_rev) > 50
                else self.reference_number + _rev
            )
            rev_wf = None
            if self.workflow_reference:
                rev_wf = (
                    self.workflow_reference[:50 - len(_rev)] + _rev
                    if len(self.workflow_reference) + len(_rev) > 50
                    else self.workflow_reference + _rev
                )
            # Create reversal transaction
            reversal_txn = Transaction.objects.create(
                series=self.series,
                date=today,
                reference_number=rev_ref,
                workflow_reference=rev_wf,
                description=f"REVERSAL: {self.description} - Reason: {reason}",
                owner=self.owner,
                branch=self.branch,
                created_by=user,
                is_reversal=True,
                reverses_transaction=self,
                tenant=self.tenant
            )
            
            # Create opposite entries
            for entry in self.entries.all():
                # Flip debit/credit
                opposite_side = (
                    TransactionEntry.CREDIT 
                    if entry.side == TransactionEntry.DEBIT 
                    else TransactionEntry.DEBIT
                )
                
                rev_entry = TransactionEntry.objects.create(
                    transaction=reversal_txn,
                    account=entry.account,
                    side=opposite_side,
                    amount=entry.amount
                )
                
                # Post the reversal entry to update account balance
                rev_entry.post()

            # Mark the reversal transaction itself as approved (entries are already posted)
            reversal_txn.approved = True
            reversal_txn.approved_at = timezone.now()
            reversal_txn.save(update_fields=['approved', 'approved_at'])

            # Mark original as reversed
            self.is_reversed = True
            self.reversed_at = timezone.now()
            self.reversed_by = user
            self.reversal_reason = reason
            self.reversal_transaction = reversal_txn
            self.save(update_fields=[
                'is_reversed', 'reversed_at', 'reversed_by', 
                'reversal_reason', 'reversal_transaction'
            ])
            
            return reversal_txn
    
    def void(self, user, reason=''):
        """
        Void this transaction (mark as invalid without creating reversal).
        
        WARNING: Only use this for transactions that haven't been posted yet
        or in special circumstances. Regular reversal is preferred.
        
        This approach:
        1. Marks transaction as voided
        2. Reverses the account balance changes
        3. Does NOT create a reversal transaction
        """
        if self.is_reversed:
            raise ValidationError("This transaction has already been reversed")
        
        if not self.approved:
            # If not approved yet, just delete it
            self.delete()
            return

        # Check period closure — same guard as reverse()
        Period = get_period_model()
        _today = timezone.now().date()
        if Period.objects.for_owner(self.owner).filter(
            period_type=Period.MONTH,
            year=_today.year,
            month=_today.month,
            branch=self.branch,
            is_closed=True,
        ).exists():
            raise ValidationError("Cannot void: current month is closed")

        with txt.atomic():
            # Reverse all entry postings
            Account = get_account_model()
            for entry in self.entries.all():
                # Post opposite amount to reverse the effect. Same SAVINGS-only,
                # overdraft-aware floor guard as TransactionEntry.post(): a
                # savings account currently >= its allowed floor may never be
                # pushed below it; already-negative accounts are exempt.
                delta = -entry.signed_amount()
                floor = None
                if entry.account.account_type == Account.SAVINGS:
                    SavingsAccount = apps.get_model('savings', 'SavingsAccount')
                    overdraft_limit = SavingsAccount.objects.all_tenants().filter(
                        account_id=entry.account_id
                    ).values_list('overdraft_limit', flat=True).first() or Decimal('0.00')
                    floor = -overdraft_limit
                    floor_guard = models.Q(balance__lt=floor) | models.Q(balance__gte=floor - delta)
                else:
                    floor_guard = models.Q()
                updated = Account.objects.filter(pk=entry.account_id).filter(
                    floor_guard
                ).update(
                    balance=models.F('balance') + delta
                )
                if not updated:
                    account = Account.objects.get(pk=entry.account_id)
                    if floor is not None and account.balance >= floor and account.balance + delta < floor:
                        raise ValidationError(
                            f"Cannot void: account {account.code} ({account.name}) "
                            f"would go below the allowed floor ({floor}) "
                            f"(balance {account.balance}, delta {delta})."
                        )
                    raise ValidationError(
                        f"Failed to update account balance while voiding "
                        f"(account_id={entry.account_id})."
                    )
            
            # Mark as reversed (voided)
            self.is_reversed = True
            self.reversed_at = timezone.now()
            self.reversed_by = user
            self.reversal_reason = f"VOIDED: {reason}"
            self.save(update_fields=[
                'is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason'
            ])

class TransactionEntry(models.Model):
    """
    One leg of a transaction: links to an Account and indicates debit or credit.
    Handles account balance updates with proper concurrency control.
    
    CRITICAL ACCOUNTING SIGN CONVENTION:
    ====================================
    All amounts are POSITIVE. The 'side' field (DR/CR) determines the effect.
    
    Account balance changes follow accounting rules:
    - DEBIT-SIDE ACCOUNTS (Assets, Expenses):
        * Debit  → Balance INCREASES (+amount)
        * Credit → Balance DECREASES (-amount)
    
    - CREDIT-SIDE ACCOUNTS (Liabilities, Equity, Revenue):
        * Credit → Balance INCREASES (+amount)  [stored as negative in DB]
        * Debit  → Balance DECREASES (-amount)  [stored as positive in DB]
    
    This ensures: SUM(all account balances) = 0 (trial balance always balances)
    """
    CREDIT = 'CR'
    DEBIT = 'DR'
    SIDE_CHOICES = [
        (CREDIT, 'Credit'),
        (DEBIT, 'Debit'),
    ]

    transaction = models.ForeignKey(
        Transaction,
        related_name='entries',
        on_delete=models.CASCADE,
    )
    account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.PROTECT,
        related_name='entries',
        help_text="Account to debit/credit (can be parent or child)"
    )
    side = models.CharField(max_length=2, choices=SIDE_CHOICES)
    amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2,
        help_text="Amount to debit/credit"
    )
    
    # Reversal tracking
    is_reversed = models.BooleanField(default=False)
    reversed_amount = models.DecimalField(
        max_digits=18, 
        decimal_places=2, 
        default=Decimal('0.00'),
        help_text="Amount that has been reversed"
    )
    
    # Metadata
    posted = models.BooleanField(
        default=False,
        help_text="Whether this entry has been posted to the account"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name_plural = "Transaction Entries"
        indexes = [
            models.Index(fields=['account', 'posted']),
            models.Index(fields=['transaction', 'side']),
            # CRITICAL: For financial report balance calculations
            models.Index(fields=['account', 'posted', 'side'], name='idx_entry_acct_posted_side'),
            # For date range filtering in financial reports
            models.Index(fields=['posted'], name='idx_entry_posted'),
        ]
    
    def clean(self):
        """Validate entry with STRICT sign convention enforcement."""
        if self.amount is not None:
            # Convert to Decimal if string
            if isinstance(self.amount, str):
                self.amount = Decimal(self.amount)
            
            # CRITICAL: Enforce positive amounts ALWAYS
            # The 'side' field (DR/CR) determines the effect, NOT negative amounts
            if self.amount <= 0:
                raise ValidationError(
                    f"Amount must be POSITIVE (got {self.amount}). "
                    f"Use 'side' field (DEBIT/CREDIT) to indicate direction, not negative amounts."
                )
        
        # Validate that account belongs to same branch as transaction
        if self.transaction_id and self.account_id:
            # Only validate if both relations are properly loaded
            if self.account and self.transaction and \
               hasattr(self.account, 'branch_id') and hasattr(self.transaction, 'branch_id'):
                if self.account.branch_id != self.transaction.branch_id:
                    raise ValidationError(
                        f"Account must belong to the same branch as the transaction"
                    )
        
        # Parent accounts never receive direct entries — absolute, no
        # allow_manual_entries override. A parent's rollup balance already
        # reflects its children's postings via TransactionEntry.post(); a
        # direct entry on the parent has nowhere consistent to land and is
        # invisible to the trial balance's children-only aggregation. This
        # matches Account.can_post_transactions's documented "Parent
        # accounts: NO" rule, which this check previously contradicted by
        # honoring allow_manual_entries as an override for parents.
        # (Child-account behaviour is intentionally left unchanged here.)
        if self.account_id:
            Account = apps.get_model('accounts', 'Account')
            if self.account.account_level == Account.LEVEL_PARENT and self.account.children.exists():
                raise ValidationError(
                    f"Account {self.account.code} ({self.account.name}) is a parent "
                    f"account and cannot receive direct entries. Post to a child "
                    f"account instead."
                )
    
    @txt.atomic
    def post(self):
        """
        Post this entry to the account, updating balances with concurrency control.
        Also updates parent account balances for proper hierarchy rollup.
        
        ACCOUNTING RULES ENFORCED:
        ==========================
        - Assets/Expenses (DEBIT-side): Debit increases, Credit decreases
        - Liabilities/Equity/Revenue (CREDIT-side): Credit increases, Debit decreases
        
        This ensures the trial balance always balances: Assets + Expenses = Liabilities + Equity + Income
        """
        if self.posted:
            raise ValidationError("Entry already posted")
        
        # Get account (with fallback for tenant scoping)
        Account = apps.get_model('accounts', 'Account')
        try:
            account = Account.objects.get(pk=self.account_id)
        except Exception:
            try:
                account = Account.objects.all_tenants().get(pk=self.account_id)
            except Exception:
                raise
        
        # Calculate balance effect using accounting rules
        # This method encapsulates the sign convention logic
        balance_delta = self.get_balance_effect()

        # Floor guard: SAVINGS accounts only, per client decision — bank/other
        # GL account types are left unguarded for now, and the parent SAVINGS
        # control account (a rollup of many members' accounts, some of which
        # may legitimately overdraft) is left unguarded too. A savings account
        # currently >= its allowed floor may never be pushed below that floor
        # by a new posting; accounts already below it (legacy balances
        # migrated from the old system) are exempt, since enforcing a floor
        # there isn't something we can retroactively fix. The floor is
        # -overdraft_limit (0 for accounts without overdraft), matching
        # SavingsAccount.clean()'s intent. The guard is baked into the WHERE
        # clause so the check-then-write is race-safe under concurrent
        # postings.
        floor = None
        if account.account_type == Account.SAVINGS:
            SavingsAccount = apps.get_model('savings', 'SavingsAccount')
            overdraft_limit = SavingsAccount.objects.all_tenants().filter(
                account_id=self.account_id
            ).values_list('overdraft_limit', flat=True).first() or Decimal('0.00')
            floor = -overdraft_limit
            not_going_negative = models.Q(balance__lt=floor) | models.Q(balance__gte=floor - balance_delta)
        else:
            not_going_negative = models.Q()
        try:
            updated = Account.objects.all_tenants().filter(pk=self.account_id).filter(
                not_going_negative
            ).update(
                balance=models.F('balance') + balance_delta
            )
        except Exception as e:
            logger.error('TransactionEntry.post exception for account_id=%s: %s', self.account_id, e)
            raise
        else:
            logger.debug(
                'Posted entry - Account: %s, Type: %s, Side: %s, Amount: %s, Delta: %s, Updated rows: %s',
                account.code, account.account_type, self.side, self.amount, balance_delta, updated,
            )

            if not updated:
                account.refresh_from_db(fields=['balance'])
                if floor is not None and account.balance >= floor and account.balance + balance_delta < floor:
                    raise ValidationError(
                        f"Insufficient balance on account {account.code} ({account.name}). "
                        f"Current balance {account.balance} would go below the allowed floor "
                        f"({floor}) by {balance_delta}."
                    )
                raise ValidationError(
                    f"Failed to update account {account.code} (ID={self.account_id}). "
                    f"Database update affected 0 rows. Balance delta: {balance_delta}"
                )

        # Update parent account balance if this is a child account
        if account.parent_id:
            try:
                parent_updated = Account.objects.all_tenants().filter(pk=account.parent_id).update(
                    balance=models.F('balance') + balance_delta
                )
                logger.debug(
                    'Updated parent account balance - Parent ID: %s, Delta: %s, Updated rows: %s',
                    account.parent_id, balance_delta, parent_updated,
                )
            except Exception as e:
                logger.error('Parent balance update failed for parent_id=%s: %s', account.parent_id, e)
                raise ValidationError(f"Failed to update parent account balance: {e}") from e
        
        # Mark as posted
        self.posted = True
        self.posted_at = timezone.now()
        self.save(update_fields=['posted', 'posted_at'])
    
    def save(self, *args, **kwargs):
        """
        Save the entry - posting must be done explicitly via post() method.

        clean() runs on creation so this can't be silently skipped by a
        caller that forgets to call full_clean() before saving (that's
        exactly how entries ended up posted directly to parent-level GL
        accounts in the past — see loans repayment bank_transfer routing).
        Only enforced on INSERT, not on later partial-field updates (e.g.
        post()'s own save(update_fields=['posted', 'posted_at'])).
        """
        if self.pk is None:
            self.clean()
        super().save(*args, **kwargs)
    
    def signed_amount(self):
        """
        Calculate the signed amount for this entry based on ACCOUNTING RULES.
        
        This method enforces the accounting equation and ensures trial balance.
        
        Returns:
            Decimal: The amount with proper sign for balance calculation
            
        Accounting Convention:
        - Debits are POSITIVE in the accounting equation
        - Credits are NEGATIVE in the accounting equation
        - This ensures: Σ(all signed amounts) = 0 for any balanced transaction
        """
        return self.amount if self.side == self.DEBIT else -self.amount
    
    def get_balance_effect(self):
        """
        Calculate how this entry affects the account balance.
        
        This implements the fundamental accounting rules:
        - Assets/Expenses: DR increases, CR decreases
        - Liabilities/Equity/Revenue: CR increases, DR decreases
        
        IMPORTANT: All balances are stored as POSITIVE for display purposes.
        The accounting equation is maintained by the sign convention:
        Assets + Expenses = Liabilities + Equity + Income
        
        Returns:
            Decimal: The amount to add to the account's balance
                    (positive = increase, negative = decrease)
        """
        Account = apps.get_model('accounts', 'Account')
        
        # For DEBIT-side accounts (Assets, Loan Receivables, Expenses):
        # - Debit entry INCREASES balance (+amount)
        # - Credit entry DECREASES balance (-amount)
        #
        # NOTE: Account.LOAN is treated as DEBIT-side because loans receivable
        # are ASSETS of the institution (money owed TO us by members/clients).
        # AccountCategory section 1 (Assets 1000-1999) includes Loans Receivable.
        if self.account.account_type in [Account.ASSET, Account.EXPENSE, Account.LOAN]:
            return self.amount if self.side == self.DEBIT else -self.amount
        
        # For CREDIT-side accounts (Liabilities incl. Savings, Equity, Income):
        # - Credit entry INCREASES balance (+amount)
        # - Debit entry DECREASES balance (-amount)
        #
        # NOTE: Account.SAVINGS is treated as CREDIT-side because member savings
        # are LIABILITIES of the institution (money owed TO members).
        # AccountCategory section 2 (Liabilities 2000-2999) includes Savings Accounts.
        else:  # LIABILITY, EQUITY, INCOME, SAVINGS
            return self.amount if self.side == self.CREDIT else -self.amount
        
    @property
    def remaining_amount(self):
        """Amount not yet reversed"""
        return self.amount - self.reversed_amount
    
    def reverse_partial(self, amount, user, reason=''):
        """
        Partially reverse this entry.
        
        This is COMPLEX and should be used carefully because:
        - You need to find the matching entry to reverse
        - You need to maintain double-entry balance
        - Partial reversals can make audit trail confusing
        
        RECOMMENDATION: Always reverse the entire transaction instead.
        """
        if amount > self.remaining_amount:
            raise ValidationError(
                f"Cannot reverse {amount}. Only {self.remaining_amount} remaining."
            )
        
        if self.transaction.is_reversed:
            raise ValidationError("Parent transaction is already reversed")
        
        # This is where it gets tricky - you need to find the matching entry
        # and reverse it proportionally
        raise NotImplementedError(
            "Partial entry reversal is complex and not recommended. "
            "Use full transaction reversal instead."
        )

    def __str__(self):
        side_symbol = "Dr" if self.side == self.DEBIT else "Cr"
        return f"{self.transaction.reference_number} - {self.account.code} {side_symbol} {self.amount}"
