# cash_management/models.py
"""
Generic Cash Collection & Custody Management
Tracks cash collected by users (agents, cashiers, collectors) and transfers to main bank

Use Cases:
- Microfinance: Field agents collect loan payments
- Schools: Cashiers collect tuition fees
- Retail: Store cashiers collect sales
- Events: Ticket collectors at venues
"""
from django.db import models, transaction as db_transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account
from clients.models import Client


class CashierAccount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Virtual cash account for a user who collects cash
    
    Generic names for different domains:
    - Microfinance: "Field Agent Cash Account"
    - School: "Cashier Cash Account"
    - Retail: "Till/Register"
    - Events: "Collection Point"
    """
    # User who owns this cash account
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='cashier_accounts',
        null=True, blank=True,
        help_text="User responsible for this cash collection point"
    )
    
    # GL Child Account for tracking (MUST be a child account for proper double-entry)
    # This creates the link: User (cashier) → Child Account → Parent Account (Bank/Cash)
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='cashier_accounts',
        null=True, blank=True,
        help_text="GL CHILD account for this cashier's collections. Must be: "
                  "(1) CHILD level account, (2) ASSET type, (3) Under a Cash/Bank parent account. "
                  "This enables balanced transactions when cashier collects cash."
    )
    
    # Identification
    account_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique identifier for this cash account"
    )
    
    name = models.CharField(
        max_length=200,
        help_text="Descriptive name (e.g., 'Main Cashier', 'Agent A', 'Till 1')"
    )
    
    # Current balance - should be zero at end of day
    current_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Current cash on hand - must be zero at day end"
    )
    
    # Limits and controls
    daily_collection_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum amount this cashier can collect per day"
    )
    
    requires_dual_approval = models.BooleanField(
        default=False,
        help_text="Requires two approvers for cash transfers"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    is_suspended = models.BooleanField(
        default=False,
        help_text="Temporarily suspended from collecting cash"
    )
    
    # Last reconciliation
    last_reconciled_at = models.DateTimeField(null=True, blank=True)
    last_reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reconciled_cashier_accounts'
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('branch', 'cashier', 'account_number')]
        indexes = [
            models.Index(fields=['account_number']),
            models.Index(fields=['cashier', 'is_active']),
            models.Index(fields=['current_balance']),
        ]
        verbose_name = 'Cashier Account'
        verbose_name_plural = 'Cashier Accounts'
    
    def clean(self):
        """Validate account types and hierarchy"""
        super().clean()
        
        # Validate account is a CHILD-level ASSET account
        if self.account_id:
            # Must be ASSET type (not LIABILITY - changed from original validation)
            if self.account.account_type != 'ASSET':
                raise ValidationError({
                    'account': f'Cashier accounts must use ASSET account type for proper double-entry. '
                             f'Selected account "{self.account.name}" is type "{self.account.account_type}". '
                             f'Use a child account under a Cash/Bank parent account.'
                })
            
            # Must be CHILD level (not PARENT)
            if self.account.account_level != Account.LEVEL_CHILD:
                raise ValidationError({
                    'account': f'Cashier accounts must use CHILD-level accounts, not parent accounts. '
                             f'Selected account "{self.account.name}" is a {self.account.account_level} account. '
                             f'Create a child account under your Cash/Bank parent account first.'
                })
            
            # Must have a parent account
            if not self.account.parent:
                raise ValidationError({
                    'account': f'Selected child account "{self.account.name}" has no parent account. '
                             f'Cashier accounts require a proper parent-child hierarchy for balanced transactions.'
                })
    
    def save(self, *args, **kwargs):
        """Override save to protect balance field from direct writes."""
        # ACCOUNTING INTEGRITY PROTECTION:
        # Prevent direct current_balance writes outside of posting mechanisms
        if self.pk and 'current_balance' in kwargs.get('update_fields', []):
            import inspect
            import os
            from django.conf import settings
            
            # Allow bypass in tests or dev mode
            if getattr(settings, 'DISABLE_BALANCE_PROTECTION', False) or \
               os.environ.get('DISABLE_BALANCE_PROTECTION') == 'true':
                super().save(*args, **kwargs)
                return
            
            frame = inspect.currentframe()
            try:
                caller_frame = frame.f_back.f_back if frame and frame.f_back else None
                caller_function = caller_frame.f_code.co_name if caller_frame else 'unknown'
                
                # Allow only from authorized functions (includes 'inner' for @transaction.atomic decorated functions)
                allowed_functions = {'post', '_post_collection', 'refresh_from_db', 'bulk_update', '_do_update', 'inner'}
                
                if caller_function not in allowed_functions:
                    raise PermissionError(
                        f"Direct current_balance updates are prohibited. "
                        f"Use cash collection posting mechanisms instead. "
                        f"Called from: {caller_function}"
                    )
            finally:
                del frame
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        cashier_label = self.cashier.get_full_name() if self.cashier else 'Unassigned'
        return f"{self.name} - {cashier_label} (Balance: {self.current_balance})"
    
    def has_outstanding_balance(self):
        """Check if cashier has unremitted cash"""
        return self.current_balance != Decimal('0.00')
    
    def get_daily_collections(self, date=None):
        """Get total collections for a specific date"""
        date = date or timezone.now().date()
        return self.cash_collections.filter(
            collection_date=date,
            is_posted=True
        ).aggregate(
            total=models.Sum('amount_collected')
        )['total'] or Decimal('0.00')
    
    def get_pending_transfers(self):
        """Get transfers awaiting approval"""
        return self.cash_transfers.filter(
            status='pending'
        )


class CashCollection(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Individual cash collection from a client
    
    Double-Entry Accounting Flow:
    When cashier collects cash, two accounts are affected:
    1. Debit: Cashier's Child Account (ASSET - cash increase)
    2. Credit: Income/Revenue Account (INCOME - revenue recognition)
    
    This creates balanced transactions immediately upon posting.
    
    Examples:
    - Microfinance: Loan payment from borrower
    - School: Tuition fee from student
    - Retail: Sale from customer
    """
    # Which cashier collected this
    cashier_account = models.ForeignKey(
        CashierAccount,
        on_delete=models.PROTECT,
        related_name='cash_collections',
        null=True,
        blank=True
    )
    
    # From whom was cash collected
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='cash_collections',
        null=True, blank=True,
        help_text="Client who made the payment"
    )
    
    # Reference to what's being paid (invoice, loan, entitlement)
    # The income account will be derived from this receivable
    receivable = models.ForeignKey(
        'receivables.CustomerReceivable',
        on_delete=models.PROTECT,
        related_name='cash_collections',
        null=True, blank=True,
        help_text="The receivable (invoice/loan/entitlement) being paid. "
                  "The income account is automatically derived from this."
    )
    
    # Collection details
    receipt_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Official receipt number"
    )
    
    collection_date = models.DateField(
        default=timezone.now,
        help_text="Date cash was collected"
    )
    
    # Amounts
    amount_due = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount that was supposed to be paid"
    )
    
    amount_collected = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Actual amount collected from client"
    )
    
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Difference between due and collected (can be overpayment or underpayment)"
    )
    
    # Variance handling
    VARIANCE_ACTIONS = [
        ('none', 'No Variance'),
        ('savings', 'Credit to Client Savings'),
        ('debt', 'Add to Client Debt'),
        ('waive', 'Waive Difference'),
        ('refund', 'Refund to Client'),
    ]
    variance_action = models.CharField(
        max_length=20,
        choices=VARIANCE_ACTIONS,
        default='none'
    )
    
    # What was this payment for?
    payment_purpose = models.CharField(
        max_length=200,
        help_text="Purpose of payment (e.g., 'Loan Payment', 'Tuition Fee', 'Product Purchase')"
    )
    
    # Reference to the actual payment record (generic foreign key would be better in production)
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Reference to the actual transaction/invoice"
    )
    
    # Additional details
    notes = models.TextField(blank=True)
    collection_mode = models.CharField(
        max_length=20,
        choices=[
            ('cash', 'Cash'),
            ('mobile_money', 'Mobile Money'),
            ('bank_deposit', 'Bank Deposit'),
            ('cheque', 'Cheque'),
        ],
        default='cash'
    )
    
    # Posting status
    is_posted = models.BooleanField(
        default=False,
        help_text="Whether this collection has been posted to accounts"
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posted_cash_collections'
    )
    
    # Journal entry reference
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cash_collections'
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['receipt_number']),
            models.Index(fields=['collection_date', 'cashier_account']),
            models.Index(fields=['client', 'collection_date']),
            models.Index(fields=['is_posted']),
        ]
        ordering = ['-collection_date', '-created_at']
    
    def save(self, *args, **kwargs):
        # Calculate variance
        self.variance = self.amount_collected - self.amount_due
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.receipt_number} - {self.client} - {self.amount_collected}"
    
    @db_transaction.atomic
    def post(self, user):
        """
        Post collection to accounts with balanced double-entry
        
        Creates journal entry:
        - Debit: Cashier's Child Account (ASSET - cash increase)
        - Credit: Income Account (INCOME - revenue recognition)
        
        The income account is automatically derived from the receivable being paid.
        
        Args:
            user: User posting the transaction
        
        Raises:
            ValidationError: If already posted, missing receivable, or account validation fails
        """
        if self.is_posted:
            raise ValidationError("Collection already posted")
        
        # Get income account from the receivable being paid
        if not self.receivable:
            raise ValidationError(
                "Receivable is required to post collection. "
                "The income account is automatically determined from the invoice/entitlement being paid."
            )
        
        # Get the actual invoice/entitlement object through Generic FK
        invoice_or_entitlement = self.receivable.content_object
        if not invoice_or_entitlement:
            raise ValidationError(f"Invalid receivable reference: {self.receivable}")
        
        # Get income account from the invoice/entitlement
        # For Invoice: invoice.fee_structure.category.income_account
        # For FeeEntitlement: entitlement.fee_structure.category.income_account
        credit_account = None
        
        if hasattr(invoice_or_entitlement, 'fee_structure') and invoice_or_entitlement.fee_structure:
            # Invoice or FeeEntitlement with fee_structure
            fee_structure = invoice_or_entitlement.fee_structure
            if hasattr(fee_structure, 'category') and fee_structure.category:
                credit_account = fee_structure.category.income_account
        elif hasattr(invoice_or_entitlement, 'income_account'):
            # Direct income_account attribute (if added in future)
            credit_account = invoice_or_entitlement.income_account
        
        if not credit_account:
            raise ValidationError(
                f"Cannot determine income account for {self.receivable.receivable_type} "
                f"{invoice_or_entitlement}. Ensure fee_structure is set with a valid "
                f"income category."
            )
        
        # Validate income account type
        if credit_account.account_type != 'INCOME':
            raise ValidationError(
                f"Income account must be INCOME type. "
                f"Account '{credit_account.name}' on {self.receivable.receivable_type} is type '{credit_account.account_type}'."
            )
        
        # Update cashier account balance
        self.cashier_account.current_balance += self.amount_collected
        self.cashier_account.save(update_fields=['current_balance'])
        
        # Create journal entry
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='CC',  # Cash Collection
            defaults={'description': 'Cash Collections'}
        )
        
        journal_entry = Transaction.objects.create(
            series=series,
            date=self.collection_date,
            description=f"Cash collection from {self.client.full_name if self.client else 'Customer'} - {self.payment_purpose}",
            workflow_reference=self.receipt_number,
            owner=self.owner,
            branch=self.branch,
            created_by=user
        )
        
        # Debit: Cashier's Child Account (ASSET increase)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.cashier_account.account,
            side=TransactionEntry.DEBIT,
            amount=self.amount_collected
        )
        
        # Credit: Income Account (INCOME - revenue recognition)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=credit_account,
            side=TransactionEntry.CREDIT,
            amount=self.amount_collected
        )
        
        self.journal_entry = journal_entry
        self.is_posted = True
        self.posted_at = timezone.now()
        self.posted_by = user
        self.save(update_fields=['journal_entry', 'is_posted', 'posted_at', 'posted_by'])
        
        return journal_entry


class CashTransfer(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    DEPRECATED: This model is deprecated in favor of banks.BankTransfer
    Use banks.BankTransfer for all new transfers (cashier→bank, bank→bank)
    
    This model is kept for backward compatibility only and will be removed in future versions.
    
    Transfer of cash from cashier account to main bank
    
    Examples:
    - Microfinance: Agent transfers collections to head office
    - School: Cashier deposits to school bank account
    - Retail: Store deposits daily takings
    """
    # From which cashier
    cashier_account = models.ForeignKey(
        CashierAccount,
        on_delete=models.PROTECT,
        related_name='cash_transfers',
        null=True, blank=True
    )
    
    # To which bank account
    destination_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='cash_transfers_received',
        null=True, blank=True,
        help_text="Main bank account receiving the cash"
    )
    
    # Transfer details
    transfer_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True
    )
    
    transfer_date = models.DateField(default=timezone.now)
    
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount being transferred"
    )
    
    # Bank deposit details
    bank_deposit_slip = models.CharField(
        max_length=100,
        blank=True,
        help_text="Bank deposit slip/teller number"
    )
    
    bank_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Bank transaction reference"
    )
    
    deposit_proof = models.FileField(
        upload_to='cash_transfers/deposits/',
        null=True,
        blank=True,
        help_text="Upload bank deposit slip/receipt"
    )
    
    # Approval workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('posted', 'Posted to Accounts'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_cash_transfers'
    )
    
    # First approval
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_cash_transfers'
    )
    approval_notes = models.TextField(blank=True)
    
    # Second approval (if required)
    second_approved_at = models.DateTimeField(null=True, blank=True)
    second_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='second_approved_cash_transfers'
    )
    
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_cash_transfers'
    )
    rejection_reason = models.TextField(blank=True)
    
    # Posting
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posted_cash_transfers'
    )
    
    # Journal entry
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cash_transfers'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['transfer_number']),
            models.Index(fields=['transfer_date', 'status']),
            models.Index(fields=['cashier_account', 'status']),
        ]
        ordering = ['-transfer_date', '-created_at']
    
    def __str__(self):
        return f"{self.transfer_number} - {self.cashier_account.name} - {self.amount}"
    
    def clean(self):
        """Validate transfer"""
        super().clean()
        
        # Check cashier has sufficient balance
        if self.cashier_account_id and self.amount:
            if self.amount > self.cashier_account.current_balance:
                raise ValidationError({
                    'amount': f'Transfer amount ({self.amount}) exceeds cashier balance '
                             f'({self.cashier_account.current_balance})'
                })
        
        # Validate destination account is ASSET type
        if self.destination_account_id:
            if self.destination_account.account_type != 'ASSET':
                raise ValidationError({
                    'destination_account': f'Destination must be an ASSET account (bank account). '
                                         f'Selected account is type "{self.destination_account.account_type}".'
                })
        
        # CRITICAL: Enforce cashier bank workflow for regular cashiers
        if self.cashier_account_id and self.destination_account_id:
            # Check if destination is a non-cashier bank (main bank)
            is_main_bank = (
                self.destination_account.account_type == 'ASSET' and
                not getattr(self.destination_account, 'is_cashier_bank', False)
            )
            
            # Check if user is head cashier or admin
            cashier_user = self.cashier_account.cashier
            is_privileged_user = (
                cashier_user and (
                    cashier_user.is_superuser or 
                    cashier_user.groups.filter(name='Head Cashier').exists() or
                    getattr(cashier_user, 'is_head_cashier', False)
                )
            )
            
            # Regular cashiers cannot transfer to non-cashier banks
            if is_main_bank and not is_privileged_user:
                raise ValidationError({
                    'destination_account': 
                        f'Regular cashiers cannot transfer directly to non-cashier bank accounts. '
                        f'You must transfer to an intermediate cashier bank account first for approval. '
                        f'Account "{self.destination_account.name}" is flagged as a non-cashier bank. '
                        f'Only head cashiers or administrators can transfer directly to main bank accounts.'
                })
    
    @db_transaction.atomic
    def submit(self, user):
        """Submit transfer for approval"""
        if self.status != 'draft':
            raise ValidationError("Only draft transfers can be submitted")
        
        self.full_clean()  # Validate before submitting
        
        self.status = 'pending'
        self.submitted_at = timezone.now()
        self.submitted_by = user
        self.save(update_fields=['status', 'submitted_at', 'submitted_by'])
    
    @db_transaction.atomic
    def approve(self, user, notes=''):
        """Approve transfer"""
        if self.status != 'pending':
            raise ValidationError("Only pending transfers can be approved")
        
        # Check if dual approval is required
        if self.cashier_account.requires_dual_approval and not self.approved_by:
            # First approval
            self.approved_at = timezone.now()
            self.approved_by = user
            self.approval_notes = notes
            self.save(update_fields=['approved_at', 'approved_by', 'approval_notes'])
            return 'first_approval'
        
        elif self.cashier_account.requires_dual_approval and self.approved_by:
            # Second approval
            if user == self.approved_by:
                raise ValidationError("Same user cannot provide both approvals")
            
            self.second_approved_at = timezone.now()
            self.second_approved_by = user
            self.status = 'approved'
            self.save(update_fields=['second_approved_at', 'second_approved_by', 'status'])
            
            # Auto-post after second approval
            self.post(user)
            return 'second_approval_posted'
        
        else:
            # Single approval
            self.status = 'approved'
            self.approved_at = timezone.now()
            self.approved_by = user
            self.approval_notes = notes
            self.save(update_fields=['status', 'approved_at', 'approved_by', 'approval_notes'])
            
            # Auto-post after approval
            self.post(user)
            return 'approved_posted'
    
    @db_transaction.atomic
    def reject(self, user, reason):
        """Reject transfer"""
        if self.status not in ['pending', 'approved']:
            raise ValidationError("Only pending/approved transfers can be rejected")
        
        self.status = 'rejected'
        self.rejected_at = timezone.now()
        self.rejected_by = user
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejected_at', 'rejected_by', 'rejection_reason'])
    
    @db_transaction.atomic
    def post(self, user):
        """
        Post transfer to accounts
        - Debit: Main Bank Account (increase)
        - Credit: Cashier Account (decrease)
        - Update cashier balance to zero
        """
        if self.status != 'approved':
            raise ValidationError("Only approved transfers can be posted")
        
        if self.journal_entry:
            raise ValidationError("Transfer already posted")
        
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='CSHTR',
            defaults={'description': 'Cash Transfers'}
        )
        
        journal_entry = Transaction.objects.create(
            series=series,
            date=self.transfer_date,
            description=f"Cash transfer from {self.cashier_account.name} to bank",
            workflow_reference=self.transfer_number,
            owner=self.owner,
            branch=self.branch,
            created_by=user
        )
        
        # Debit: Main Bank Account (asset increase)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.destination_account,
            side=TransactionEntry.DEBIT,
            amount=self.amount
        )
        
        # Credit: Cashier Account (asset decrease)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.cashier_account.account,
            side=TransactionEntry.CREDIT,
            amount=self.amount
        )
        
        # Update cashier balance
        self.cashier_account.current_balance -= self.amount
        self.cashier_account.save(update_fields=['current_balance'])
        
        self.journal_entry = journal_entry
        self.status = 'posted'
        self.posted_at = timezone.now()
        self.posted_by = user
        self.save(update_fields=['journal_entry', 'status', 'posted_at', 'posted_by'])
        
        return journal_entry


class CashReconciliation(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Daily reconciliation of cashier account
    Ensures cashier balance matches physical cash count
    """
    cashier_account = models.ForeignKey(
        CashierAccount,
        on_delete=models.PROTECT,
        related_name='reconciliations',
        null=True, blank=True
    )
    
    reconciliation_date = models.DateField(default=timezone.now)
    
    # Expected vs Actual
    system_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Balance according to system"
    )
    
    physical_count = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Actual cash counted"
    )
    
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Difference between system and physical count"
    )
    
    # Denominations breakdown (optional)
    denomination_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Breakdown by currency denomination"
    )
    
    # Reconciliation details
    total_collections = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    total_transfers = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    STATUS_CHOICES = [
        ('balanced', 'Balanced'),
        ('variance', 'Has Variance'),
        ('resolved', 'Variance Resolved'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='balanced'
    )
    
    variance_explanation = models.TextField(
        blank=True,
        help_text="Explanation for any variance"
    )
    
    # Cashier prepares reconciliation
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='performed_reconciliations',
        null=True, blank=True,
        help_text="Cashier who performed the reconciliation"
    )
    
    # Finance Officer sign-off (CRITICAL CONTROL)
    finance_officer_signoff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='signed_off_reconciliations',
        help_text="Finance Officer who verified and signed off on reconciliation"
    )
    
    finance_officer_signoff_at = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When finance officer signed off"
    )
    
    finance_officer_notes = models.TextField(
        blank=True,
        help_text="Finance officer's verification notes"
    )
    
    # Daily deposit requirement tracking
    deposit_required = models.BooleanField(
        default=True,
        help_text="Whether daily deposit to bank is required (should always be True per policy)"
    )
    
    deposit_completed = models.BooleanField(
        default=False,
        help_text="Whether cash has been deposited to bank"
    )
    
    deposit_slip_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Bank deposit slip number"
    )
    
    deposit_timestamp = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When deposit was made (from bank slip)"
    )
    
    # Legacy field for backward compatibility
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_reconciliations',
        help_text="Supervisor who verified the reconciliation (deprecated - use finance_officer_signoff)"
    )
    
    verified_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['reconciliation_date', 'cashier_account']),
            models.Index(fields=['status']),
        ]
        ordering = ['-reconciliation_date', '-created_at']
    
    def save(self, *args, **kwargs):
        # Calculate variance
        self.variance = self.physical_count - self.system_balance
        
        # Set status based on variance
        if self.variance == Decimal('0.00'):
            self.status = 'balanced'
        else:
            self.status = 'variance'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Reconciliation {self.reconciliation_date} - {self.cashier_account.name}"


class BankReconciliation(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Monthly bank reconciliation - matches bank statements to general ledger
    Required for Step 4 of Cash/Bank Process
    """
    # Bank account being reconciled
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='bank_reconciliations',
        help_text="Bank account (GL Account) being reconciled"
    )
    
    # Reconciliation period
    reconciliation_period_start = models.DateField(
        help_text="Start date of reconciliation period"
    )
    
    reconciliation_period_end = models.DateField(
        help_text="End date of reconciliation period"
    )
    
    reconciliation_date = models.DateField(
        default=timezone.now,
        help_text="Date reconciliation was performed"
    )
    
    # Opening balances
    bank_opening_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Opening balance per bank statement"
    )
    
    gl_opening_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Opening balance per general ledger"
    )
    
    # Closing balances
    bank_closing_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Closing balance per bank statement"
    )
    
    gl_closing_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Closing balance per general ledger"
    )
    
    # Reconciling items
    deposits_in_transit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Deposits made but not yet reflected in bank statement"
    )
    
    outstanding_checks = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Checks issued but not yet cleared by bank"
    )
    
    bank_charges = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Bank charges not yet recorded in GL"
    )
    
    bank_interest = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Bank interest not yet recorded in GL"
    )
    
    bank_errors = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Bank errors (+ or -)"
    )
    
    gl_errors = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="GL errors (+ or -)"
    )
    
    # Calculated reconciled balance
    reconciled_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Calculated reconciled balance"
    )
    
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Unexplained variance after all adjustments"
    )
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in_review', 'In Review'),
        ('balanced', 'Balanced'),
        ('variance_pending', 'Variance Under Investigation'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Prepared by (usually finance staff, NOT cashier)
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='prepared_bank_reconciliations',
        help_text="Staff who prepared the reconciliation (independent of cash receipt process)"
    )
    
    prepared_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    
    # Finance Manager sign-off (CRITICAL CONTROL)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_bank_reconciliations',
        help_text="Finance Manager who approved the reconciliation"
    )
    
    approved_at = models.DateTimeField(null=True, blank=True)
    
    approval_notes = models.TextField(
        blank=True,
        help_text="Finance manager approval notes"
    )
    
    # Variance investigation
    variance_explanation = models.TextField(
        blank=True,
        help_text="Explanation for any variance and investigation details"
    )
    
    variance_resolved = models.BooleanField(
        default=False,
        help_text="Whether variance has been resolved"
    )
    
    variance_resolved_at = models.DateTimeField(null=True, blank=True)
    variance_resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_bank_variances'
    )
    
    # Attachments
    bank_statement = models.FileField(
        upload_to='bank_reconciliations/statements/',
        null=True,
        blank=True,
        help_text="Upload bank statement PDF"
    )
    
    supporting_documents = models.FileField(
        upload_to='bank_reconciliations/supporting/',
        null=True,
        blank=True,
        help_text="Supporting documents for reconciling items"
    )
    
    # Detailed reconciling items (JSON)
    reconciling_items = models.JSONField(
        default=dict,
        blank=True,
        help_text="""Detailed reconciling items:
        {
            'deposits_in_transit': [{'date': '2026-01-31', 'ref': 'DEP-001', 'amount': 100000}],
            'outstanding_checks': [{'check_no': 'CHK-001', 'payee': 'ABC', 'amount': 50000}],
            'bank_charges': [{'date': '2026-01-31', 'description': 'Service charge', 'amount': 500}]
        }
        """
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['bank_account', 'reconciliation_period_end']),
            models.Index(fields=['status', 'reconciliation_date']),
            models.Index(fields=['prepared_by']),
        ]
        ordering = ['-reconciliation_period_end', '-reconciliation_date']
        unique_together = [('bank_account', 'reconciliation_period_start', 'reconciliation_period_end', 'branch')]
    
    def save(self, *args, **kwargs):
        """Calculate reconciled balance and variance"""
        # Reconciled balance calculation:
        # Start with bank closing balance
        # Add: Deposits in transit (in GL but not bank)
        # Subtract: Outstanding checks (in GL but not bank)
        # Add: Bank charges (in bank but not GL)
        # Subtract: Bank interest (in bank but not GL)
        # Adjust for errors
        
        self.reconciled_balance = (
            self.bank_closing_balance
            + self.deposits_in_transit
            - self.outstanding_checks
            - self.bank_charges  # Negative because bank deducted but GL hasn't
            + self.bank_interest  # Positive because bank added but GL hasn't
            + self.bank_errors
            - self.gl_errors
        )
        
        # Variance = GL Balance - Reconciled Balance
        self.variance = self.gl_closing_balance - self.reconciled_balance
        
        # Auto-update status based on variance
        if self.variance == Decimal('0.00') and self.status == 'in_review':
            self.status = 'balanced'
        elif self.variance != Decimal('0.00') and self.status in ['draft', 'in_review']:
            self.status = 'variance_pending'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Bank Reconciliation {self.bank_account.name} - {self.reconciliation_period_end}"
    
    @db_transaction.atomic
    def approve(self, user, notes=''):
        """Finance Manager approves reconciliation"""
        if self.status not in ['balanced', 'variance_pending']:
            raise ValidationError("Only balanced or variance_pending reconciliations can be approved")
        
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])
    
    @db_transaction.atomic
    def reject(self, user, reason):
        """Finance Manager rejects reconciliation"""
        if self.status not in ['in_review', 'balanced', 'variance_pending']:
            raise ValidationError("Only in_review/balanced/variance_pending reconciliations can be rejected")
        
        self.status = 'rejected'
        self.approval_notes = f"REJECTED: {reason}"
        self.save(update_fields=['status', 'approval_notes'])
    
    def get_reconciling_items_summary(self):
        """Get summary of reconciling items"""
        items = self.reconciling_items or {}
        return {
            'deposits_in_transit_count': len(items.get('deposits_in_transit', [])),
            'outstanding_checks_count': len(items.get('outstanding_checks', [])),
            'bank_charges_count': len(items.get('bank_charges', [])),
            'total_reconciling_items': (
                len(items.get('deposits_in_transit', [])) +
                len(items.get('outstanding_checks', [])) +
                len(items.get('bank_charges', []))
            )
        }


class PettyCashFund(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Petty Cash Fund - Imprest System
    
    A fixed-amount petty cash fund managed by a custodian.
    Used for small day-to-day expenses that don't warrant formal payment vouchers.
    
    System:
    - Fund has a fixed float amount (e.g., ₦50,000)
    - Custodian disburses for approved small expenses
    - When depleted/low, custodian submits receipts for reimbursement
    - Fund is replenished back to float amount
    
    Accounting:
    Setup:     Dr. Petty Cash (ASSET)     Cr. Cash/Bank (ASSET)
    Disbursement: No GL entry (just tracking)
    Replenishment: Dr. Expense Accounts    Cr. Cash/Bank (to reimburse custodian)
    """
    # Fund identification
    fund_name = models.CharField(
        max_length=200,
        help_text="Name of petty cash fund (e.g., 'Main Office Petty Cash', 'Admin Department')"
    )
    
    fund_code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique code for this fund (e.g., 'PC-001')"
    )
    
    # Custodian
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='petty_cash_funds_managed',
        help_text="Person responsible for managing this fund"
    )
    
    alternate_custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='petty_cash_funds_alternate',
        help_text="Alternate custodian when primary is unavailable"
    )
    
    # GL Account
    petty_cash_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='petty_cash_funds',
        help_text="Petty Cash GL Account (ASSET account - typically 110-xxx)"
    )
    
    # Fund limits
    float_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Fixed float amount for this fund (Imprest amount)"
    )
    
    current_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Current cash in fund"
    )
    
    replenishment_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="When balance falls below this, trigger replenishment"
    )
    
    single_transaction_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('5000.00'),
        help_text="Maximum amount for a single petty cash transaction"
    )
    
    # Status
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('closed', 'Closed'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    
    # Establishment and closure
    established_date = models.DateField(
        default=timezone.now,
        help_text="Date fund was established"
    )
    
    established_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='established_petty_cash_funds'
    )
    
    last_replenishment_date = models.DateField(null=True, blank=True)
    last_audit_date = models.DateField(null=True, blank=True)
    
    # Initial setup journal entry
    setup_journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_fund_setups'
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        unique_together = [('branch', 'fund_code')]
        indexes = [
            models.Index(fields=['fund_code']),
            models.Index(fields=['custodian', 'status']),
            models.Index(fields=['status']),
        ]
        ordering = ['fund_name']
    
    def clean(self):
        """Validate fund setup"""
        super().clean()
        
        # Validate petty cash account
        if self.petty_cash_account_id:
            if self.petty_cash_account.account_type != 'ASSET':
                raise ValidationError({
                    'petty_cash_account': 'Petty cash account must be an ASSET account'
                })
        
        # Validate replenishment threshold
        if self.replenishment_threshold > self.float_amount:
            raise ValidationError({
                'replenishment_threshold': 'Replenishment threshold cannot exceed float amount'
            })
        
        # Validate single transaction limit
        if self.single_transaction_limit > self.float_amount:
            raise ValidationError({
                'single_transaction_limit': 'Single transaction limit cannot exceed float amount'
            })
    
    def __str__(self):
        return f"{self.fund_name} - {self.custodian.get_full_name()} (₦{self.current_balance})"
    
    @property
    def needs_replenishment(self):
        """Check if fund needs replenishment"""
        return self.current_balance <= self.replenishment_threshold
    
    @property
    def disbursed_amount(self):
        """Total amount disbursed (float - current balance)"""
        return self.float_amount - self.current_balance
    
    def get_pending_vouchers(self):
        """Get pending vouchers"""
        return self.vouchers.filter(status='pending')

    def get_approved_vouchers(self):
        """Get approved vouchers"""
        return self.vouchers.filter(status='approved')

    @db_transaction.atomic
    def get_or_create_cashier_account(self):
        """
        Get or create the CashierAccount that wraps this fund's GL account,
        with the fund's custodian as its cashier.

        PettyCashFund alone isn't wired into BankTransfer, CashReconciliation,
        or the cashier summary dashboard - wrapping its GL account in a
        CashierAccount gets all of that for free, without changing how
        PettyCashVoucher/PettyCashReplenishment post GL entries.

        Idempotent: returns the existing CashierAccount (restoring it first
        if it was soft-deleted) if one already wraps this fund's GL account.
        Shared by both the link_petty_cash_cashier_account management
        command and PettyCashFundViewSet.link_cashier_account, so the two
        never drift out of agreement about how this is done.
        """
        if self.petty_cash_account_id is None:
            raise ValidationError(
                'This fund has no linked GL account (petty_cash_account is null).'
            )

        existing = CashierAccount.objects.filter(account=self.petty_cash_account)
        active = existing.filter(is_deleted=False).first()
        if active:
            return active

        dead = existing.filter(is_deleted=True).first()
        if dead:
            dead.is_deleted = False
            dead.is_active = True
            dead.cashier = self.custodian
            dead.save(update_fields=['is_deleted', 'is_active', 'cashier'])
            cashier_account = dead
        else:
            cashier_account = CashierAccount.objects.create(
                cashier=self.custodian,
                account=self.petty_cash_account,
                account_number=f'PETTY-{self.fund_code}',
                name=f'{self.fund_name} - Cashier Till',
                branch=self.branch,
                owner=self.owner,
                is_active=True,
                requires_dual_approval=False,
            )

        self.petty_cash_account.refresh_from_db(fields=['balance'])
        CashierAccount.objects.filter(pk=cashier_account.pk).update(
            current_balance=self.petty_cash_account.balance
        )
        cashier_account.refresh_from_db(fields=['current_balance'])
        return cashier_account

    @db_transaction.atomic
    def establish_fund(self, source_account, user):
        """
        Establish petty cash fund with initial GL entry.
        
        Creates balanced journal entry:
        Dr. Petty Cash Account (ASSET - fund created)
        Cr. Source Account (ASSET - cash/bank out)
        
        This is the INITIAL setup entry that brings the fund into existence.
        
        Args:
            source_account: Bank/Cash account to fund from (ASSET account)
            user: User establishing the fund
        
        Raises:
            ValidationError: If fund already established, invalid accounts, or type mismatch
            
        Returns:
            Transaction: Created journal entry
        """
        if self.setup_journal_entry:
            raise ValidationError("Fund already established with journal entry")
        
        if self.current_balance != Decimal('0.00'):
            raise ValidationError("Fund already has balance. Cannot re-establish.")
        
        # Validate source account is ASSET type (bank/cash)
        if source_account.account_type != 'ASSET':
            raise ValidationError(
                f"Source account must be ASSET type (bank/cash). "
                f"Selected account '{source_account.name}' is type '{source_account.account_type}'."
            )
        
        # Validate petty cash account is ASSET type (already validated in clean(), but double-check)
        if self.petty_cash_account.account_type != 'ASSET':
            raise ValidationError(
                f"Petty cash account must be ASSET type. "
                f"Account '{self.petty_cash_account.name}' is type '{self.petty_cash_account.account_type}'."
            )
        
        # Validate both accounts are CHILD level (can post transactions)
        if not self.petty_cash_account.can_post_transactions:
            raise ValidationError(
                f"Petty cash account '{self.petty_cash_account.name}' cannot receive transactions. "
                f"Must be a CHILD account with allow_manual_entries=True."
            )
        
        if not source_account.can_post_transactions:
            raise ValidationError(
                f"Source account '{source_account.name}' cannot receive transactions. "
                f"Must be a CHILD account with allow_manual_entries=True."
            )
        
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
        # Get or create PC-SETUP series
        series, _ = TransactionSeries.objects.get_or_create(
            code='PCSET',
            defaults={'description': 'Petty Cash Fund Establishment'}
        )
        
        # Create journal entry
        journal_entry = Transaction.objects.create(
            series=series,
            date=self.established_date,
            description=f"Petty cash fund establishment - {self.fund_name}",
            workflow_reference=self.fund_code,
            owner=self.owner,
            branch=self.branch,
            created_by=user
        )
        
        # Dr. Petty Cash Account (ASSET increase - fund established)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.petty_cash_account,
            side=TransactionEntry.DEBIT,
            amount=self.float_amount,
        )
        
        # Cr. Source Account (ASSET decrease - cash/bank out)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=source_account,
            side=TransactionEntry.CREDIT,
            amount=self.float_amount,
        )

        journal_entry.post()

        # Update fund record
        self.setup_journal_entry = journal_entry
        self.current_balance = self.float_amount
        self.established_by = user
        self.save(update_fields=['setup_journal_entry', 'current_balance', 'established_by'])
        
        return journal_entry


class PettyCashVoucher(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Petty Cash Voucher (PCV) - Disbursement Request
    
    Workflow:
    1. Request: Requestor creates voucher with expense details
    2. Approval: Manager/Head reviews and approves/rejects
    3. Collection: Custodian disburses cash upon approval
    
    Note: No GL entry is made at disbursement. GL entries are created
    during replenishment when receipts are submitted.
    """
    # Fund
    fund = models.ForeignKey(
        PettyCashFund,
        on_delete=models.PROTECT,
        related_name='vouchers'
    )
    
    # Voucher details
    voucher_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="PCV number (e.g., 'PCV-2026-001')"
    )
    
    voucher_date = models.DateField(
        default=timezone.now,
        help_text="Date voucher was created"
    )
    
    # Requestor
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='petty_cash_vouchers_requested',
        help_text="Person requesting petty cash"
    )
    
    # Expense details
    purpose = models.CharField(
        max_length=500,
        help_text="Purpose of expenditure (e.g., 'Office supplies purchase', 'Courier service')"
    )
    
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount requested"
    )
    
    expense_category = models.ForeignKey(
        'expenses.ExpenseCategory',
        on_delete=models.PROTECT,
        related_name='petty_cash_vouchers',
        null=True,
        blank=True,
        help_text="Expense category for accounting"
    )
    
    # Payee details
    payee_name = models.CharField(
        max_length=200,
        help_text="Who is receiving the money"
    )
    
    payee_phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Payee contact"
    )
    
    # Approval workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('disbursed', 'Cash Disbursed'),
        ('retired', 'Retired (Receipt Submitted)'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Submission
    submitted_at = models.DateTimeField(null=True, blank=True)
    
    # Approval
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_petty_cash_vouchers'
    )
    
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    # Rejection
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_petty_cash_vouchers'
    )
    
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Disbursement (Collection)
    disbursed_at = models.DateTimeField(null=True, blank=True)
    disbursed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='disbursed_petty_cash_vouchers',
        help_text="Custodian who disbursed the cash"
    )
    
    actual_amount_disbursed = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Actual amount given (may differ slightly from requested)"
    )
    
    # Receipt retirement
    receipt_submitted = models.BooleanField(default=False)
    receipt_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount on submitted receipt"
    )
    
    receipt_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date on receipt"
    )
    
    receipt_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Receipt/invoice number"
    )
    
    receipt_attachment = models.FileField(
        upload_to='petty_cash/receipts/',
        null=True,
        blank=True,
        help_text="Upload receipt/invoice"
    )
    
    retired_at = models.DateTimeField(null=True, blank=True)
    retired_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='retired_petty_cash_vouchers'
    )
    
    # Unaccounted variance
    variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Difference between disbursed and receipt (shortage/overage)"
    )
    
    variance_explanation = models.TextField(blank=True)
    
    # Linked to replenishment
    replenishment = models.ForeignKey(
        'PettyCashReplenishment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vouchers',
        help_text="Replenishment request this voucher is part of"
    )

    # GL journal entry created at disbursement
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_vouchers',
        help_text="GL transaction created when cash is disbursed"
    )

    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['voucher_number']),
            models.Index(fields=['fund', 'status']),
            models.Index(fields=['voucher_date', 'status']),
            models.Index(fields=['requested_by']),
        ]
        ordering = ['-voucher_date', '-created_at']
    
    def clean(self):
        """Validate voucher"""
        super().clean()
        
        # Check single transaction limit
        if self.fund_id and self.amount:
            if self.amount > self.fund.single_transaction_limit:
                raise ValidationError({
                    'amount': f'Amount exceeds single transaction limit of '
                             f'₦{self.fund.single_transaction_limit}. '
                             f'Use regular payment voucher instead.'
                })
    
    def save(self, *args, **kwargs):
        # Calculate variance if both amounts are set
        if self.actual_amount_disbursed and self.receipt_amount:
            self.variance = self.actual_amount_disbursed - self.receipt_amount
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.voucher_number} - {self.purpose} (₦{self.amount})"
    
    @db_transaction.atomic
    def submit(self):
        """Submit voucher for approval"""
        if self.status != 'draft':
            raise ValidationError("Only draft vouchers can be submitted")
        
        self.status = 'pending'
        self.submitted_at = timezone.now()
        self.save(update_fields=['status', 'submitted_at'])
    
    @db_transaction.atomic
    def approve(self, user, notes=''):
        """Approve voucher"""
        if self.status != 'pending':
            raise ValidationError("Only pending vouchers can be approved")
        
        # Check fund has sufficient balance
        if self.amount > self.fund.current_balance:
            raise ValidationError(
                f'Insufficient fund balance. Available: ₦{self.fund.current_balance}, '
                f'Required: ₦{self.amount}. Fund needs replenishment.'
            )
        
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        self.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])
    
    @db_transaction.atomic
    def reject(self, user, reason):
        """Reject voucher"""
        if self.status != 'pending':
            raise ValidationError("Only pending vouchers can be rejected")
        
        self.status = 'rejected'
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason'])
    
    @db_transaction.atomic
    def disburse(self, user, amount=None):
        """
        Disburse cash to payee and create a GL journal entry.

        GL Entry:
          Dr. Expense Account (per expense_category)
          Cr. Petty Cash Fund GL Account

        Expenses are recognised at disbursement so every voucher has its own
        traceable Transaction reference in the ledger.  The replenishment
        posting later restores the petty-cash balance by drawing from bank
        (Dr. Petty Cash, Cr. Bank) rather than re-debiting expense accounts.
        """
        if self.status != 'approved':
            raise ValidationError("Only approved vouchers can be disbursed")

        # Check user is custodian
        if user != self.fund.custodian and user != self.fund.alternate_custodian:
            raise ValidationError("Only fund custodian can disburse cash")

        # Use requested amount if actual not specified
        actual_amount = amount or self.amount

        # Check fund balance
        if actual_amount > self.fund.current_balance:
            raise ValidationError(f'Insufficient fund balance: ₦{self.fund.current_balance}')

        # --- GL ENTRY ---------------------------------------------------------
        # Resolve the expense account (debit side)
        if not self.expense_category_id:
            raise ValidationError(
                "Expense category is required for GL posting. "
                "Please set an expense category on this voucher before disbursing."
            )
        expense_account = self.expense_category.expense_account
        if not expense_account:
            raise ValidationError(
                f"Expense category '{self.expense_category.name}' has no GL account "
                f"configured. Set an expense account on that category first."
            )

        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        series, _ = TransactionSeries.objects.get_or_create(
            code='PCV',
            defaults={'description': 'Petty Cash Vouchers'}
        )

        journal_entry = Transaction.objects.create(
            series=series,
            date=self.voucher_date,
            description=f"Petty cash disbursement – {self.purpose[:200]}",
            workflow_reference=self.voucher_number,
            owner=self.owner,
            branch=self.branch,
            created_by=user,
        )

        # Debit: Expense account (recognises the expense at point of disbursement)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=expense_account,
            side=TransactionEntry.DEBIT,
            amount=actual_amount,
        )

        # Credit: Petty Cash Fund GL account (reduces fund balance on the GL)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.fund.petty_cash_account,
            side=TransactionEntry.CREDIT,
            amount=actual_amount,
        )

        journal_entry.post()
        # --- END GL ENTRY -----------------------------------------------------

        # Update fund balance (physical cash tracking)
        self.fund.current_balance -= actual_amount
        self.fund.save(update_fields=['current_balance'])

        # Update voucher
        self.status = 'disbursed'
        self.actual_amount_disbursed = actual_amount
        self.disbursed_by = user
        self.disbursed_at = timezone.now()
        self.journal_entry = journal_entry
        self.save(update_fields=[
            'status', 'actual_amount_disbursed', 'disbursed_by', 'disbursed_at',
            'journal_entry',
        ])
    
    @db_transaction.atomic
    def retire(self, user, receipt_amount, receipt_date, receipt_reference, variance_explanation=''):
        """Retire voucher by submitting receipt"""
        if self.status != 'disbursed':
            raise ValidationError("Only disbursed vouchers can be retired")
        
        self.receipt_submitted = True
        self.receipt_amount = receipt_amount
        self.receipt_date = receipt_date
        self.receipt_reference = receipt_reference
        self.variance_explanation = variance_explanation
        self.retired_by = user
        self.retired_at = timezone.now()
        self.status = 'retired'
        
        # Calculate variance
        self.variance = self.actual_amount_disbursed - receipt_amount
        
        self.save(update_fields=[
            'receipt_submitted', 'receipt_amount', 'receipt_date', 'receipt_reference',
            'variance_explanation', 'retired_by', 'retired_at', 'status', 'variance'
        ])


class PettyCashReplenishment(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Petty Cash Replenishment - Reimbursement Process
    
    When petty cash is depleted, custodian:
    1. Submits all retired vouchers with receipts
    2. Finance verifies receipts match vouchers
    3. Replenishment is approved
    4. Cash is given to custodian to restore fund to float amount
    5. GL entries are posted (Dr. Expenses, Cr. Cash/Bank)
    
    This is when actual accounting entries are created for petty cash expenses.
    """
    # Fund
    fund = models.ForeignKey(
        PettyCashFund,
        on_delete=models.PROTECT,
        related_name='replenishments'
    )
    
    # Replenishment details
    replenishment_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Replenishment reference (e.g., 'PCR-2026-001')"
    )
    
    replenishment_date = models.DateField(
        default=timezone.now,
        help_text="Date replenishment was requested"
    )
    
    # Period covered
    period_start = models.DateField(
        help_text="Start of period being replenished"
    )
    
    period_end = models.DateField(
        help_text="End of period being replenished"
    )
    
    # Amounts
    total_vouchers_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total of all retired vouchers"
    )
    
    total_receipts_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total of all receipts submitted"
    )
    
    total_variance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total shortage/overage"
    )
    
    replenishment_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Amount to replenish fund (auto-calculated from vouchers)"
    )

    requested_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount explicitly requested by the custodian for replenishment"
    )

    approved_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount approved (may be less than requested_amount)"
    )

    # Custodian balance before and after
    fund_balance_before = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Fund balance before replenishment"
    )
    
    fund_balance_after = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Fund balance after replenishment (should = float_amount)"
    )
    
    # Source of replenishment funds
    replenishment_source = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='petty_cash_replenishments',
        help_text="Cash/Bank GL account to replenish from"
    )

    # Direct bank account reference (links to Bank Management for proper reconciliation)
    bank_account = models.ForeignKey(
        'banks.BankAccount',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='petty_cash_replenishments',
        help_text=(
            "Bank account the replenishment funds are drawn from. "
            "When set, the bank account's GL account is used for the posting "
            "entry (Dr. Expenses / Cr. Bank Account) instead of the generic "
            "replenishment_source account."
        )
    )
    
    # Workflow
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('posted', 'Posted to GL'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    
    # Submission
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='submitted_petty_cash_replenishments',
        help_text="Custodian submitting for replenishment"
    )
    
    submitted_at = models.DateTimeField(null=True, blank=True)
    
    # Verification by finance
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_petty_cash_replenishments',
        help_text="Finance officer who verified receipts"
    )
    
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)
    
    # Approval
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_petty_cash_replenishments'
    )
    
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    
    # Rejection
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_petty_cash_replenishments'
    )
    
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    
    # Posting
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posted_petty_cash_replenishments'
    )
    
    # Journal entry
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_replenishments'
    )
    
    # Summary breakdown by expense category
    expense_breakdown = models.JSONField(
        default=dict,
        blank=True,
        help_text="""Breakdown by expense category:
        {
            'Office Supplies': {'amount': 5000, 'vouchers': ['PCV-001', 'PCV-005']},
            'Transportation': {'amount': 3000, 'vouchers': ['PCV-002']}
        }
        """
    )
    
    notes = models.TextField(blank=True)
    
    objects = OwnerBranchManager()
    
    class Meta:
        indexes = [
            models.Index(fields=['replenishment_number']),
            models.Index(fields=['fund', 'status']),
            models.Index(fields=['replenishment_date', 'status']),
        ]
        ordering = ['-replenishment_date', '-created_at']
    
    def __str__(self):
        return f"{self.replenishment_number} - {self.fund.fund_name} (₦{self.replenishment_amount})"
    
    @db_transaction.atomic
    def submit(self):
        """Submit for review.

        Vouchers are *optional* — a replenishment may be submitted as a
        direct fund top-up (e.g. initial fund setup or ad-hoc injection)
        without any retired vouchers.  When vouchers ARE attached, every
        one of them must be in 'retired' status.
        """
        if self.status != 'draft':
            raise ValidationError("Only draft replenishments can be submitted")

        # If any vouchers are attached, make sure they are all retired.
        vouchers = self.vouchers.all()
        unretired = vouchers.exclude(status='retired')
        if unretired.exists():
            raise ValidationError(
                f"{unretired.count()} voucher(s) not retired. "
                "All attached vouchers must have receipts before submitting."
            )

        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.save(update_fields=['status', 'submitted_at'])
    
    @db_transaction.atomic
    def verify(self, user, notes=''):
        """Finance officer verifies receipts"""
        if self.status != 'submitted':
            raise ValidationError("Only submitted replenishments can be verified")
        
        self.status = 'under_review'
        self.verified_by = user
        self.verified_at = timezone.now()
        self.verification_notes = notes
        self.save(update_fields=['status', 'verified_by', 'verified_at', 'verification_notes'])
    
    @db_transaction.atomic
    def approve(self, user, notes='', approved_amount=None):
        """Approve replenishment"""
        if self.status != 'under_review':
            raise ValidationError("Only replenishments under review can be approved")

        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.approval_notes = notes
        # Approver may approve a different amount; fall back to requested or calculated
        if approved_amount is not None:
            from decimal import Decimal as _Decimal
            self.approved_amount = _Decimal(str(approved_amount))
        elif self.approved_amount is None:
            self.approved_amount = self.requested_amount or self.replenishment_amount
        self.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes', 'approved_amount'])
    
    @db_transaction.atomic
    def reject(self, user, reason):
        """Reject replenishment"""
        if self.status not in ['submitted', 'under_review']:
            raise ValidationError("Only submitted/under_review replenishments can be rejected")
        
        self.status = 'rejected'
        self.rejected_by = user
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason'])
    
    @db_transaction.atomic
    def post(self, user):
        """
        Post replenishment to GL.

        GL Entry:
          Dr. Petty Cash Fund GL Account   (restores the fund balance on the ledger)
          Cr. Bank / Cash Account           (draws funds from bank to replenish the fund)

        Note: Individual expenses are recognised at disbursement time via the
        per-voucher journal entries (PCV series).  This replenishment entry
        simply records the bank draw that restores the petty-cash float.

        The expense_breakdown JSON is still computed and stored for management
        reporting but is no longer used to build per-category debit ledger entries.
        """
        if self.status != 'approved':
            raise ValidationError("Only approved replenishments can be posted")

        if self.journal_entry:
            raise ValidationError("Replenishment already posted")

        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        # Build expense breakdown for reporting (JSON field)
        vouchers = self.vouchers.filter(status='retired')
        expense_breakdown = {}
        for voucher in vouchers:
            if voucher.expense_category:
                category_name = voucher.expense_category.name
                amount = voucher.receipt_amount or voucher.actual_amount_disbursed or Decimal('0.00')
                if category_name not in expense_breakdown:
                    expense_breakdown[category_name] = {'amount': Decimal('0.00'), 'vouchers': []}
                expense_breakdown[category_name]['amount'] += amount
                expense_breakdown[category_name]['vouchers'].append(voucher.voucher_number)

        # Create replenishment journal entry
        series, _ = TransactionSeries.objects.get_or_create(
            code='PCR',
            defaults={'description': 'Petty Cash Replenishments'}
        )

        journal_entry = Transaction.objects.create(
            series=series,
            date=self.replenishment_date,
            description=(
                f"Petty cash replenishment – {self.fund.fund_name} "
                f"({self.period_start} to {self.period_end})"
            ),
            workflow_reference=self.replenishment_number,
            owner=self.owner,
            branch=self.branch,
            created_by=user,
        )

        # Amount to post: use approved_amount if set, else requested_amount, else replenishment_amount
        post_amount = self.approved_amount or self.requested_amount or self.replenishment_amount

        # Debit: Petty Cash Fund GL account (restores fund balance on the ledger)
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=self.fund.petty_cash_account,
            side=TransactionEntry.DEBIT,
            amount=post_amount,
        )

        # Credit: Bank / Cash account (draws from bank to restore the petty cash float)
        credit_account = self.replenishment_source
        if self.bank_account_id and self.bank_account.gl_account_id:
            credit_account = self.bank_account.gl_account
        TransactionEntry.objects.create(
            transaction=journal_entry,
            account=credit_account,
            side=TransactionEntry.CREDIT,
            amount=post_amount,
        )

        journal_entry.post()

        # Update fund balance (physical tracking)
        self.fund.current_balance += post_amount
        self.fund.last_replenishment_date = self.replenishment_date
        self.fund.save(update_fields=['current_balance', 'last_replenishment_date'])

        # Persist replenishment record
        self.fund_balance_after = self.fund.current_balance
        self.journal_entry = journal_entry
        self.status = 'posted'
        self.posted_at = timezone.now()
        self.posted_by = user
        self.expense_breakdown = {
            k: {'amount': str(v['amount']), 'vouchers': v['vouchers']}
            for k, v in expense_breakdown.items()
        }

        self.save(update_fields=[
            'fund_balance_after', 'journal_entry', 'status',
            'posted_at', 'posted_by', 'expense_breakdown'
        ])


class PettyCashReceipt(models.Model):
    """
    Supporting receipts/documents for petty cash vouchers.
    
    Used to attach proof of expenditure (receipts, invoices, etc.) when
    retiring a voucher. These documents support the replenishment request.
    """
    voucher = models.ForeignKey(
        PettyCashVoucher,
        on_delete=models.CASCADE,
        related_name='receipts'
    )
    
    file = models.FileField(
        upload_to='petty_cash_receipts/%Y/%m/',
        help_text="Receipt image or PDF"
    )
    
    file_name = models.CharField(
        max_length=255,
        help_text="Original file name"
    )
    
    file_size = models.IntegerField(
        help_text="File size in bytes"
    )
    
    file_type = models.CharField(
        max_length=50,
        help_text="MIME type (e.g., 'application/pdf', 'image/jpeg')"
    )
    
    description = models.CharField(
        max_length=500,
        blank=True,
        help_text="Optional description of the receipt"
    )
    
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='uploaded_petty_cash_receipts'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True
    )
    
    class Meta:
        ordering = ['-uploaded_at']
        verbose_name = "Petty Cash Receipt"
        verbose_name_plural = "Petty Cash Receipts"
    
    def __str__(self):
        return f"Receipt for {self.voucher.voucher_number} - {self.file_name}"
    
    def save(self, *args, **kwargs):
        # Auto-populate file metadata if not set
        if self.file and not self.file_name:
            self.file_name = self.file.name
        if self.file and not self.file_size:
            self.file_size = self.file.size
        super().save(*args, **kwargs)


# ============================================================================
# KTIL Microfinance — Daily Collection Workflow
# ============================================================================

class DailyCollectionSheet(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    One daily collection worksheet per credit officer per day.

    Lifecycle
    ---------
    draft     → Officer has not yet started collecting
    active    → Officer is out collecting / recording payments
    submitted → Officer has handed cash upward (CashTransfer submitted/approved)
    reconciled→ Superior has verified all items and confirmed the sheet is balanced

    Grace-period rule
    -----------------
    If status is not 'reconciled' by 10:00 AM the following day and the
    officer's CashierAccount still carries a non-zero balance, the Celery
    task ``notify_unreconciled_sheets`` fires a notification to
    ``credit_officer.reports_to``.
    """

    credit_officer = models.ForeignKey(
        'hr.Staff',
        on_delete=models.PROTECT,
        related_name='collection_sheets',
        help_text='Credit officer responsible for this sheet',
    )
    collection_date = models.DateField(
        default=timezone.now,
        db_index=True,
        help_text='Date on which collections are being made',
    )

    STATUS_CHOICES = [
        ('draft',       'Draft'),
        ('active',      'Active'),
        ('submitted',   'Submitted'),
        ('reconciled',  'Reconciled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True,
    )

    # ── Denormalised totals (refreshed via refresh_totals()) ─────────────────
    total_expected = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Sum of amount_expected across all items',
    )
    total_collected_cash = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Sum of posted cash collections',
    )
    total_confirmed_transfers = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Sum of confirmed direct bank transfers',
    )
    total_unconfirmed_transfers = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00'),
        help_text='Sum of bank transfers still awaiting confirmation',
    )

    # ── EOD submission ────────────────────────────────────────────────────────
    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_to = models.ForeignKey(
        'hr.Staff',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='received_collection_sheets',
        help_text='Superior the sheet was handed to',
    )

    # ── Reconciliation ────────────────────────────────────────────────────────
    reconciled_at = models.DateTimeField(null=True, blank=True)
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reconciled_sheets',
    )

    # ── Grace-period tracking ─────────────────────────────────────────────────
    # Set to True once the 10am notification has been fired so we don't repeat it.
    overdue_notified = models.BooleanField(default=False)

    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        unique_together = [('credit_officer', 'collection_date')]
        ordering = ['-collection_date']
        indexes = [
            models.Index(fields=['credit_officer', 'collection_date']),
            models.Index(fields=['status', 'collection_date']),
        ]

    def __str__(self):
        return (
            f"Sheet {self.collection_date} — "
            f"{self.credit_officer.first_name} {self.credit_officer.last_name}"
        )

    # ── Totals ────────────────────────────────────────────────────────────────

    def refresh_totals(self):
        """Recalculate denormalised totals from child items and save."""
        from django.db.models import Sum, Q
        items = self.items.all()
        self.total_expected = (
            items.aggregate(t=Sum('amount_expected'))['t'] or Decimal('0.00')
        )
        self.total_collected_cash = (
            items.filter(
                payment_mode='cash', is_posted=True
            ).aggregate(t=Sum('amount_collected'))['t'] or Decimal('0.00')
        )
        self.total_confirmed_transfers = (
            items.filter(
                payment_mode__in=['bank_transfer', 'mobile_money'],
                transfer_confirmation_status='confirmed',
            ).aggregate(t=Sum('amount_collected'))['t'] or Decimal('0.00')
        )
        self.total_unconfirmed_transfers = (
            items.filter(
                payment_mode__in=['bank_transfer', 'mobile_money'],
                transfer_confirmation_status='pending',
            ).aggregate(t=Sum('amount_collected'))['t'] or Decimal('0.00')
        )
        self.save(update_fields=[
            'total_expected', 'total_collected_cash',
            'total_confirmed_transfers', 'total_unconfirmed_transfers',
        ])

    # ── Workflow ──────────────────────────────────────────────────────────────

    def activate(self):
        """Move sheet from draft to active.

        Feature #14: hard block — cannot activate if this officer has a
        previous unreconciled (submitted) sheet still outstanding.
        """
        if self.status != 'draft':
            raise ValidationError("Only draft sheets can be activated.")

        unreconciled = DailyCollectionSheet.objects.filter(
            credit_officer=self.credit_officer,
            status='submitted',
        ).exclude(pk=self.pk).exists()

        if unreconciled:
            raise ValidationError(
                "Cannot activate a new collection sheet: you have a previously submitted "
                "sheet that has not been reconciled yet. "
                "Ask your branch manager to reconcile it before starting a new day."
            )

        self.status = 'active'
        self.save(update_fields=['status'])

    @db_transaction.atomic
    def submit(self, submitted_by_user, submitted_to_staff):
        """
        Officer submits their EOD sheet.
        All cash items must be posted. Unconfirmed transfers are allowed
        (they will be chased by the 10am Celery task if still open next day).
        """
        if self.status not in ('draft', 'active'):
            raise ValidationError("Sheet has already been submitted.")
        unposted_cash = self.items.filter(
            payment_mode='cash',
            status='collected',
            is_posted=False,
        ).count()
        if unposted_cash:
            raise ValidationError(
                f"{unposted_cash} cash item(s) have been marked collected but not yet "
                "posted to the GL. Post them before submitting."
            )
        self.status = 'submitted'
        self.submitted_at = timezone.now()
        self.submitted_to = submitted_to_staff
        self.save(update_fields=['status', 'submitted_at', 'submitted_to'])

    @db_transaction.atomic
    def reconcile(self, reconciled_by_user):
        """
        Superior marks the sheet as fully reconciled.

        Feature #13: GL sweep — aggregated cash collected is moved from the
        credit officer's till account to the branch's main bank GL account.

        Feature #3: BusinessDay — auto-closes the business day for this
        collection date on this branch.
        """
        if self.status != 'submitted':
            raise ValidationError("Only submitted sheets can be reconciled.")
        pending = self.items.filter(
            transfer_confirmation_status='pending'
        ).count()
        if pending:
            raise ValidationError(
                f"{pending} unconfirmed bank transfer(s) must be confirmed or "
                "rejected before reconciling the sheet."
            )

        # ── Feature #13: GL sweep for cash collected ─────────────────────────
        cash_amount = self.total_collected_cash
        if cash_amount and cash_amount > Decimal('0.00'):
            # Find the officer's CashierAccount (linked via User)
            officer_user = getattr(self.credit_officer, 'user', None)
            cashier_acct = None
            if officer_user:
                cashier_acct = CashierAccount.objects.filter(
                    cashier=officer_user,
                    branch=self.branch,
                    is_active=True,
                ).select_related('account').first()

            branch_bank_account = getattr(self.branch, 'main_bank_account', None)

            if cashier_acct and cashier_acct.account_id and branch_bank_account and branch_bank_account.gl_account_id:
                from transactions.models import (
                    Transaction as JournalEntry,
                    TransactionEntry as JournalEntryLine,
                    TransactionSeries,
                )
                series, _ = TransactionSeries.objects.get_or_create(
                    code='CSHBK',
                    defaults={'description': 'Daily Cash-to-Bank Sweep'},
                )
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=self.collection_date,
                    description=(
                        f"EOD cash sweep — {self.credit_officer} "
                        f"sheet {self.collection_date}"
                    ),
                    workflow_reference=f"SWEEP-{self.collection_date}-{self.credit_officer_id}",
                    branch=self.branch,
                    created_by=reconciled_by_user,
                )
                # DR: Branch bank GL account (ASSET goes up — cash received in bank)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=branch_bank_account.gl_account,
                    side=JournalEntryLine.DEBIT,
                    amount=cash_amount,
                    description=f"Cash collected by {self.credit_officer} on {self.collection_date}",
                )
                # CR: Officer till GL account (ASSET goes down — cash leaves officer's hand)
                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=cashier_acct.account,
                    side=JournalEntryLine.CREDIT,
                    amount=cash_amount,
                    description=f"Cash handed over to branch — {self.collection_date}",
                )
                journal_entry.post()

                # Sync cashier account's denormalised balance
                cashier_acct.refresh_from_db()

        # ── Mark reconciled ───────────────────────────────────────────────────
        self.status = 'reconciled'
        self.reconciled_at = timezone.now()
        self.reconciled_by = reconciled_by_user
        self.save(update_fields=['status', 'reconciled_at', 'reconciled_by'])

        # ── Feature #3: Auto-close the BusinessDay ────────────────────────────
        if self.branch_id and self.collection_date:
            from common.models import BusinessDay
            BusinessDay.objects.update_or_create(
                branch=self.branch,
                date=self.collection_date,
                defaults={
                    'status': 'closed',
                    'closed_by': reconciled_by_user,
                    'closed_at': timezone.now(),
                },
            )


class CollectionSheetItem(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    One collection line on a DailyCollectionSheet.

    Covers every type of payment a credit officer collects:
      - Loan repayments (principal + interest + fees + penalties)
      - Savings / Ajo thrift deposits
      - Loan processing fees (up-front, at disbursement)

    Cash flow
    ---------
    Cash payment posted:
        DR  Officer Till GL account   (CashierAccount.account)
        CR  Loan Portfolio / Savings  (via LoanAccount.record_payment or
                                       SavingsAccount.deposit)

    Bank transfer confirmed:
        DR  Bank GL account           (BankAccount.account)
        CR  Loan Portfolio / Savings  (same underlying methods)
        — officer till is never touched for confirmed bank transfers —

    The officer's CashierAccount.current_balance is updated manually here
    because LoanAccount.record_payment / SavingsAccount.deposit only know
    about GL accounts, not the higher-level CashierAccount wrapper.
    """

    sheet = models.ForeignKey(
        DailyCollectionSheet,
        on_delete=models.CASCADE,
        related_name='items',
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name='collection_sheet_items',
    )

    COLLECTION_TYPE_CHOICES = [
        ('loan_repayment',  'Loan Repayment'),
        ('savings_deposit', 'Savings / Thrift Deposit'),
        ('processing_fee',  'Loan Processing Fee'),
    ]
    collection_type = models.CharField(
        max_length=20,
        choices=COLLECTION_TYPE_CHOICES,
        db_index=True,
    )

    # ── What is being paid (exactly one should be non-null) ───────────────────
    loan_account = models.ForeignKey(
        'loans.LoanAccount',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='collection_items',
    )
    loan_installment = models.ForeignKey(
        'loans.LoanRepaymentSchedule',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='collection_items',
        help_text='The specific schedule instalment being settled (for loan_repayment)',
    )
    savings_account = models.ForeignKey(
        'savings.SavingsAccount',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='collection_items',
    )

    # ── Amounts ───────────────────────────────────────────────────────────────
    amount_expected = models.DecimalField(
        max_digits=18, decimal_places=2,
        help_text='Amount due per schedule / expected contribution',
    )
    amount_collected = models.DecimalField(
        max_digits=18, decimal_places=2,
        default=Decimal('0.00'),
        help_text='Amount actually received from the client',
    )

    # ── Payment mode ──────────────────────────────────────────────────────────
    PAYMENT_MODE_CHOICES = [
        ('cash',          'Cash'),
        ('bank_transfer', 'Direct Bank Transfer'),
        ('mobile_money',  'Mobile Money / USSD'),
    ]
    payment_mode = models.CharField(
        max_length=20,
        choices=PAYMENT_MODE_CHOICES,
        default='cash',
    )

    # ── Bank-transfer confirmation fields ─────────────────────────────────────
    bank_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text='Reference number / teller number provided by the client',
    )
    bank_account_credited = models.ForeignKey(
        'banks.BankAccount',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='collection_items_received',
        help_text='Which of our bank accounts the client transferred into',
    )

    TRANSFER_STATUS_CHOICES = [
        ('na',        'Not Applicable'),   # cash payments
        ('pending',   'Awaiting Confirmation'),
        ('confirmed', 'Confirmed'),
        ('rejected',  'Not Found / Rejected'),
    ]
    transfer_confirmation_status = models.CharField(
        max_length=20,
        choices=TRANSFER_STATUS_CHOICES,
        default='na',
        db_index=True,
    )
    transfer_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='confirmed_transfer_items',
    )
    transfer_confirmed_at = models.DateTimeField(null=True, blank=True)

    # ── Item status ───────────────────────────────────────────────────────────
    ITEM_STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('collected', 'Collected / Paid'),
        ('partial',   'Partial Payment'),
        ('missed',    'Missed / Not Paid'),
    ]
    status = models.CharField(
        max_length=20,
        choices=ITEM_STATUS_CHOICES,
        default='pending',
        db_index=True,
    )

    # ── GL posting ────────────────────────────────────────────────────────────
    is_posted = models.BooleanField(default=False)
    posted_at = models.DateTimeField(null=True, blank=True)
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='collection_sheet_items',
    )

    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['sheet__collection_date', 'client__last_name']
        indexes = [
            models.Index(fields=['sheet', 'status']),
            models.Index(fields=['transfer_confirmation_status']),
            models.Index(fields=['is_posted']),
        ]

    def __str__(self):
        return (
            f"{self.sheet.collection_date} | {self.client} | "
            f"{self.get_collection_type_display()} | "
            f"₦{self.amount_collected}"
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_officer_cashier_account(self):
        """Return the CashierAccount for this sheet's officer. Raises if not found."""
        officer_user = self.sheet.credit_officer.user
        ca = CashierAccount.objects.filter(
            cashier=officer_user,
            branch=self.branch,
            is_active=True,
            is_suspended=False,
        ).first()
        if not ca:
            raise ValidationError(
                f"No active cashier account found for officer "
                f"{self.sheet.credit_officer}. "
                "Create one under Cash Management → Cashier Accounts."
            )
        return ca

    # ── Posting: cash ─────────────────────────────────────────────────────────

    @db_transaction.atomic
    def post_cash_collection(self, user):
        """
        Post a cash collection to the GL.

        Delegates to the correct domain model based on collection_type:
          loan_repayment  → LoanAccount.record_payment(payment_account=officer_till)
          savings_deposit → SavingsAccount.deposit(cashier_account=officer_till)
          processing_fee  → posts a direct journal entry to fee income

        Also updates CashierAccount.current_balance (denormalised field).
        """
        if self.is_posted:
            raise ValidationError("Item already posted.")
        if self.payment_mode != 'cash':
            raise ValidationError(
                "Use confirm_bank_transfer() for non-cash payment modes."
            )
        if self.amount_collected <= 0:
            raise ValidationError("Amount collected must be positive before posting.")

        cashier_acct = self._get_officer_cashier_account()

        je = self._do_post(
            payment_gl_account=cashier_acct.account,
            user=user,
        )

        # Sync the denormalised balance FROM the GL account that the transaction
        # just updated — never derive it by arithmetic independent of the ledger.
        cashier_acct.account.refresh_from_db(fields=['balance'])
        cashier_acct.current_balance = cashier_acct.account.balance
        cashier_acct.save(update_fields=['current_balance'])

        self.is_posted = True
        self.posted_at = timezone.now()
        self.journal_entry = je
        self.save(update_fields=['is_posted', 'posted_at', 'journal_entry'])

        self.sheet.refresh_totals()

    # ── Posting: bank transfer confirmation ───────────────────────────────────

    @db_transaction.atomic
    def confirm_bank_transfer(self, user, bank_gl_account=None):
        """
        Superior confirms a client's direct bank transfer and posts it to the GL.

        The officer's till is NOT credited — cash never passed through them.
        The DR goes straight to the bank GL account.

        Args:
            user: User performing the confirmation (supervisor / branch manager).
            bank_gl_account: accounts.Account for the bank the money landed in.
                If omitted and bank_account_credited is set, its GL account is used.
        """
        if self.payment_mode not in ('bank_transfer', 'mobile_money'):
            raise ValidationError("This item is not a bank / mobile transfer.")
        if self.transfer_confirmation_status != 'pending':
            raise ValidationError(
                "Transfer is not in 'pending' state — it may already be "
                "confirmed or rejected."
            )
        if self.is_posted:
            raise ValidationError("Item is already posted.")

        # Resolve bank GL account
        if not bank_gl_account and self.bank_account_credited:
            bank_gl_account = self.bank_account_credited.account
        if not bank_gl_account:
            raise ValidationError(
                "A bank_gl_account is required to confirm the transfer. "
                "Either pass one explicitly or set bank_account_credited on the item."
            )

        je = self._do_post(
            payment_gl_account=bank_gl_account,
            user=user,
        )

        self.transfer_confirmation_status = 'confirmed'
        self.transfer_confirmed_by = user
        self.transfer_confirmed_at = timezone.now()
        self.status = 'collected'
        self.is_posted = True
        self.posted_at = timezone.now()
        self.journal_entry = je
        self.save(update_fields=[
            'transfer_confirmation_status', 'transfer_confirmed_by',
            'transfer_confirmed_at', 'status',
            'is_posted', 'posted_at', 'journal_entry',
        ])

        self.sheet.refresh_totals()

    @db_transaction.atomic
    def reject_bank_transfer(self, user, reason=''):
        """Mark a bank transfer item as rejected (reference not found)."""
        if self.transfer_confirmation_status != 'pending':
            raise ValidationError("Only pending transfers can be rejected.")
        self.transfer_confirmation_status = 'rejected'
        self.status = 'missed'
        if reason:
            self.notes = (self.notes + f"\nRejected by {user}: {reason}").strip()
        self.save(update_fields=['transfer_confirmation_status', 'status', 'notes'])
        self.sheet.refresh_totals()

    # ── Core double-entry dispatcher ──────────────────────────────────────────

    def _do_post(self, payment_gl_account, user):
        """
        Call the correct domain-model posting method and return the journal entry.

        payment_gl_account: the GL account that will be DR'd (officer till or bank).
        """
        if self.collection_type == 'loan_repayment':
            if not self.loan_account:
                raise ValidationError(
                    "loan_account must be set for a loan_repayment item."
                )
            from decimal import ROUND_HALF_UP

            loan = self.loan_account
            total_outstanding = Decimal(str(loan.total_outstanding))
            amount_collected = self.amount_collected

            # Cap at overdue + next-pending dues — excess goes to client savings,
            # not silently pre-applied to future installments.
            overdue_due = Decimal('0.00')
            for s in loan.repayment_schedule.filter(status__in=['overdue', 'partial']):
                overdue_due += Decimal(str(s.total_due)) - Decimal(str(s.total_paid))

            next_pending = (
                loan.repayment_schedule
                .filter(status='pending')
                .order_by('due_date')
                .first()
            )
            next_pending_due = (
                Decimal(str(next_pending.total_due)) - Decimal(str(next_pending.total_paid))
                if next_pending else Decimal('0.00')
            )

            has_schedule = loan.repayment_schedule.exists()
            if has_schedule and (overdue_due + next_pending_due) > Decimal('0.00'):
                payable_now = min(
                    (overdue_due + next_pending_due).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
                    total_outstanding,
                )
            else:
                payable_now = total_outstanding

            if total_outstanding > Decimal('0.00') and amount_collected > total_outstanding:
                excess = (amount_collected - total_outstanding).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                payment_amount = total_outstanding
            elif payable_now > Decimal('0.00') and amount_collected > payable_now:
                excess = (amount_collected - payable_now).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                payment_amount = payable_now
            else:
                excess = Decimal('0.00')
                payment_amount = amount_collected

            spillover_savings = None
            if excess > Decimal('0.00'):
                from savings.models import SavingsAccount as SavAcct
                spillover_savings = (
                    SavAcct.objects
                    .filter(client=self.client, status='active')
                    .order_by('opened_on')
                    .first()
                )

            return loan.record_payment(
                amount=payment_amount,
                payment_account=payment_gl_account,
                payment_date=self.sheet.collection_date,
                received_by=user,
                spillover_savings_account=spillover_savings,
                spillover_amount=excess if spillover_savings else Decimal('0.00'),
            )

        elif self.collection_type == 'savings_deposit':
            if not self.savings_account:
                raise ValidationError(
                    "savings_account must be set for a savings_deposit item."
                )
            # deposit creates, posts, and now returns the journal entry.
            return self.savings_account.deposit(
                amount=self.amount_collected,
                description=(
                    f"Collection sheet deposit — "
                    f"{self.sheet.collection_date} — "
                    f"{self.client.full_name}"
                ),
                cashier_account=payment_gl_account,
                transacted_by=user,
                date=self.sheet.collection_date,
            )

        elif self.collection_type == 'processing_fee':
            # Direct journal entry: DR payment account, CR Fee Income
            return self._post_processing_fee(payment_gl_account, user)

        else:
            raise ValidationError(
                f"Unknown collection_type '{self.collection_type}'."
            )

    def _post_processing_fee(self, payment_gl_account, user):
        """Post a processing fee collection directly to the fee income GL account."""
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        if not self.loan_account:
            raise ValidationError(
                "loan_account must be set to determine the fee income account."
            )
        fee_account = self.loan_account.product.fee_income_account
        if not fee_account:
            raise ValidationError(
                "Fee income account is not configured on the Loan Product."
            )

        series, _ = TransactionSeries.objects.get_or_create(
            code='LNFEE',
            defaults={'description': 'Loan Administrative Fee'},
        )
        je = JournalEntry.objects.create(
            series=series,
            date=self.sheet.collection_date,
            description=(
                f"Processing fee — {self.loan_account.loan_number} — "
                f"{self.client.full_name}"
            ),
            owner=self.owner,
            branch=self.branch,
            created_by=user,
        )
        JournalEntryLine.objects.create(
            transaction=je,
            account=payment_gl_account,
            side=JournalEntryLine.DEBIT,
            amount=self.amount_collected,
            description='Processing fee received',
        )
        JournalEntryLine.objects.create(
            transaction=je,
            account=fee_account,
            side=JournalEntryLine.CREDIT,
            amount=self.amount_collected,
            description=f"Fee income — {self.loan_account.loan_number}",
        )
        je.post()
        return je
