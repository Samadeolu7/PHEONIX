# banks/models.py
"""
Bank Management System
Manages bank accounts, cashier accounts, and cash transfers with approval workflows
Integrates with general ledger for proper accounting
"""
import uuid

from django.db import models, transaction as db_transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from decimal import Decimal

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager
from accounts.models import Account


class Bank(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Represents a physical bank where the organization holds accounts
    
    Examples:
    - First Bank Nigeria
    - GT Bank
    - Access Bank
    - Zenith Bank
    """
    # Bank identification
    bank_name = models.CharField(
        max_length=200,
        help_text="Official name of the bank (e.g., First Bank of Nigeria)"
    )
    
    bank_code = models.CharField(
        max_length=20,
        help_text="Bank code (e.g., CBN code, SWIFT code)",
        blank=True
    )
    
    branch_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Bank branch name (e.g., Ikeja Branch)"
    )
    
    # Contact information
    address = models.TextField(
        blank=True,
        help_text="Physical address of the bank branch"
    )
    
    phone = models.CharField(
        max_length=50,
        blank=True
    )
    
    email = models.EmailField(
        blank=True
    )
    
    # Account manager contact
    account_manager_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of bank's account manager"
    )
    
    account_manager_phone = models.CharField(
        max_length=50,
        blank=True
    )
    
    account_manager_email = models.EmailField(
        blank=True
    )
    
    # Status
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this bank is currently active"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Additional notes about this bank"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['bank_name', 'branch_name']
        unique_together = [('bank_name', 'branch_name', 'branch')]
        indexes = [
            models.Index(fields=['bank_name']),
            models.Index(fields=['bank_code']),
            models.Index(fields=['is_active']),
        ]
        verbose_name = 'Bank'
        verbose_name_plural = 'Banks'
    
    def __str__(self):
        if self.branch_name:
            return f"{self.bank_name} - {self.branch_name}"
        return self.bank_name


class BankAccount(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Organization's bank account at a specific bank
    Linked to a GL Account (Asset type) for proper accounting
    
    Each bank account:
    - Is linked to a physical bank
    - Has a GL account (ASSET type, CHILD level) for transactions
    - Has a designated manager for approvals
    - Tracks current balance
    """
    # Bank relationship
    bank = models.ForeignKey(
        Bank,
        on_delete=models.PROTECT,
        related_name='accounts',
        help_text="The bank where this account is held"
    )
    
    # Account identification
    account_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Bank account number"
    )
    
    account_name = models.CharField(
        max_length=200,
        help_text="Name on the bank account"
    )
    
    account_type = models.CharField(
        max_length=50,
        choices=[
            ('savings', 'Savings Account'),
            ('current', 'Current Account'),
            ('fixed_deposit', 'Fixed Deposit'),
            ('domiciliary', 'Domiciliary Account'),
        ],
        default='current',
        help_text="Type of bank account"
    )
    
    currency = models.CharField(
        max_length=3,
        default='NGN',
        help_text="Currency code (e.g., NGN, USD, GBP)"
    )
    
    # GL Account linkage (CRITICAL for accounting)
    gl_account = models.OneToOneField(
        Account,
        on_delete=models.PROTECT,
        related_name='bank_account',
        null=True,
        blank=True,
        help_text=(
            "General Ledger account (ASSET, CHILD level) for this bank account. "
            "Auto-created under 1100 Cash and Cash Equivalents if left blank."
        )
    )
    
    # Account manager (for approvals)
    account_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='managed_bank_accounts',
        help_text="User responsible for approving transactions on this account"
    )
    
    # Balance tracking (synced with GL account)
    current_balance = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Current balance (should match GL account balance)"
    )
    
    # Limits and controls
    daily_withdrawal_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum daily withdrawal limit"
    )
    
    monthly_transaction_limit = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum monthly transaction limit"
    )
    
    requires_dual_approval = models.BooleanField(
        default=False,
        help_text="Require two approvers for large transactions"
    )
    
    dual_approval_threshold = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount above which dual approval is required"
    )
    
    # Status
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this account is active"
    )
    
    is_suspended = models.BooleanField(
        default=False,
        help_text="Whether transactions are temporarily suspended"
    )
    
    # Cashier management flag
    is_cashier_collection_account = models.BooleanField(
        default=False,
        help_text="Whether cashiers can transfer to this account (intermediate approval account)"
    )

    # ── Invoice / Document Display ─────────────────────────────────────────────
    is_primary_for_invoices = models.BooleanField(
        default=False,
        db_index=True,
        help_text=(
            "Show this account's details in the 'Payment Details' section of "
            "invoices and other outgoing documents. You may flag multiple "
            "accounts (e.g. NGN current + USD domiciliary)."
        )
    )
    
    # Additional information
    iban = models.CharField(
        max_length=50,
        blank=True,
        help_text="International Bank Account Number"
    )
    
    swift_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="SWIFT/BIC code"
    )
    
    date_opened = models.DateField(
        null=True,
        blank=True,
        help_text="Date when account was opened"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Additional notes"
    )

    # ── Bank Feed (Java App 3 — phoenix-bankfeed-svc) ──────────────────────────
    feed_connected = models.BooleanField(
        default=False,
        db_index=True,
        help_text=(
            'True when a live bank-feed consent is active for this account. '
            'Set by the bank-feed Java service after successful consent link. '
            'Displayed in the UI as "Live feed active" vs "Manual only".'
        )
    )
    last_feed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            'Timestamp of the last successful bank-feed sync from the Java '
            'reconciliation service. Used to detect stale feeds.'
        )
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['bank__bank_name', 'account_name']
        indexes = [
            models.Index(fields=['account_number']),
            models.Index(fields=['is_active']),
            models.Index(fields=['account_manager']),
            models.Index(fields=['is_cashier_collection_account']),
            models.Index(fields=['is_primary_for_invoices']),
        ]
        verbose_name = 'Bank Account'
        verbose_name_plural = 'Bank Accounts'
    
    def clean(self):
        """Validate bank account configuration"""
        super().clean()

        # Validate GL account is ASSET type and CHILD level (only when explicitly set)
        if self.gl_account_id:
            if self.gl_account.account_type != 'ASSET':
                raise ValidationError({
                    'gl_account': f'Bank accounts must use ASSET type GL accounts. '
                                f'Selected account "{self.gl_account.name}" is type "{self.gl_account.account_type}".'
                })

            if self.gl_account.account_level != Account.LEVEL_CHILD:
                raise ValidationError({
                    'gl_account': f'Bank accounts must use CHILD level GL accounts. '
                                f'Selected account "{self.gl_account.name}" is a {self.gl_account.account_level} account. '
                                f'Create a child account under your Bank parent account first.'
                })

            if not self.gl_account.parent:
                raise ValidationError({
                    'gl_account': f'Selected GL account "{self.gl_account.name}" has no parent account. '
                                f'Bank accounts require proper parent-child hierarchy.'
                })
        
        # Validate dual approval settings
        if self.requires_dual_approval and not self.dual_approval_threshold:
            raise ValidationError({
                'dual_approval_threshold': 'Dual approval threshold is required when dual approval is enabled.'
            })
    
    def save(self, *args, **kwargs):
        """Auto-create GL account if absent; sync balance from GL account."""
        # Auto-create a child GL account under 1100 when creating a new BankAccount
        if not self.gl_account_id:
            self._auto_create_gl_account()

        # Sync balance from GL account on every explicit save
        if self.pk and self.gl_account_id:
            self.current_balance = self.gl_account.balance

        super().save(*args, **kwargs)

    def _auto_create_gl_account(self):
        """Create a unique ASSET CHILD GL account under 1100 for this bank account."""
        from accounts.utils.account_creation import get_or_create_child_account

        owner = self.owner
        branch = self.branch

        # Use the bank account's own name as the GL account name so it appears
        # identically in the chart of accounts.  Fall back to "Bank – <number>"
        # only if no account_name has been set yet.
        account_display = self.account_name or (
            f"{self.bank.bank_name} – {self.account_number}"
            if hasattr(self, 'bank') and self.bank_id
            else "Bank Account"
        )

        # Find the next free child suffix under 1100.
        # Standard accounts use 1101-1103; new bank accounts start at 1104.
        from accounts.models import Account as AccModel
        existing_codes = set(
            AccModel.objects.filter(
                parent__code='1100',
                owner=owner,
                branch=branch,
            ).values_list('code', flat=True)
        )
        seq = 4  # 1101=Cash on Hand, 1102=Petty Cash, 1103=Main Bank → next is 1104
        while str(1100 + seq) in existing_codes:
            seq += 1
        child_suffix = str(seq).zfill(3)  # '004', '005', …

        self.gl_account = get_or_create_child_account(
            parent_code='1100',
            child_suffix=child_suffix,
            name=account_display,
            account_type='ASSET',
            owner=owner,
            branch=branch,
            parent_name='Cash and Cash Equivalents',
        )

    def sync_balance_from_gl(self):
        """Sync current_balance from the linked GL account. Call after any journal posting."""
        if self.gl_account_id:
            self.current_balance = self.gl_account.balance
            self.save(update_fields=['current_balance'])
    
    def __str__(self):
        return f"{self.bank.bank_name} - {self.account_number}"
    
    def get_available_balance(self):
        """Calculate available balance after pending transactions"""
        from .models import BankTransfer
        
        # Get pending outgoing transfers from this bank account
        pending_out = BankTransfer.objects.filter(
            source_bank_account=self,
            status__in=['pending', 'approved']
        ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        
        return self.current_balance - pending_out


class BankTransfer(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Transfer between accounts (cashier to bank, bank to bank, bank to cashier)
    Requires approval workflow
    """
    # Transfer identification
    transfer_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Auto-generated transfer reference number"
    )
    
    transfer_date = models.DateField(
        default=timezone.now,
        help_text="Date of transfer"
    )
    
    # Transfer details
    source_type = models.CharField(
        max_length=20,
        choices=[
            ('cashier', 'Cashier Account'),
            ('bank', 'Bank Account'),
        ],
        help_text="Type of source account"
    )
    
    # Source account (one of these will be populated)
    source_cashier_account = models.ForeignKey(
        'cash_management.CashierAccount',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='outgoing_transfers',
        help_text="Source cashier account (if transferring from cashier)"
    )
    
    source_bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='outgoing_transfers',
        help_text="Source bank account (if transferring from bank)"
    )
    
    # Destination
    destination_type = models.CharField(
        max_length=20,
        choices=[
            ('bank', 'Bank Account'),
            ('cashier', 'Cashier Account'),
        ],
        default='bank',
        help_text="Type of destination account"
    )

    destination_bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='incoming_transfers',
        help_text="Destination bank account (if destination type is bank)"
    )

    destination_cashier_account = models.ForeignKey(
        'cash_management.CashierAccount',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='incoming_transfers',
        help_text="Destination cashier account (if destination type is cashier)"
    )

    # Transfer amount
    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Transfer amount"
    )
    
    # Description
    description = models.TextField(
        help_text="Purpose of transfer"
    )
    
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="External reference number (e.g., bank slip number)"
    )
    
    # Workflow status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True
    )
    
    # Workflow tracking
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='initiated_bank_transfers',
        help_text="User who initiated the transfer"
    )
    
    initiated_at = models.DateTimeField(
        auto_now_add=True
    )
    
    # First approval (account manager)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_bank_transfers',
        help_text="First approver (account manager)"
    )
    
    approved_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    approval_notes = models.TextField(
        blank=True
    )
    
    # Second approval (for dual approval)
    second_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='second_approved_bank_transfers',
        help_text="Second approver (for dual approval)"
    )
    
    second_approved_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    second_approval_notes = models.TextField(
        blank=True
    )
    
    # Rejection
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rejected_bank_transfers'
    )
    
    rejected_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    rejection_reason = models.TextField(
        blank=True
    )
    
    # Completion
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_bank_transfers'
    )
    
    completed_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # Journal entry linkage
    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bank_transfers',
        help_text="Journal entry created for this transfer"
    )
    
    # Attachments
    attachment = models.FileField(
        upload_to='bank_transfers/%Y/%m/',
        null=True,
        blank=True,
        help_text="Supporting document (e.g., bank slip, receipt)"
    )
    
    objects = OwnerBranchManager()
    
    class Meta:
        ordering = ['-transfer_date', '-created_at']
        indexes = [
            models.Index(fields=['transfer_number']),
            models.Index(fields=['transfer_date', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['initiated_by']),
        ]
        verbose_name = 'Bank Transfer'
        verbose_name_plural = 'Bank Transfers'
    
    def clean(self):
        """Validate transfer"""
        super().clean()
        
        # Validate source account based on type
        if self.source_type == 'cashier':
            if not self.source_cashier_account:
                raise ValidationError({
                    'source_cashier_account': 'Cashier account is required when source type is cashier.'
                })
            if self.source_bank_account:
                raise ValidationError({
                    'source_bank_account': 'Bank account should be empty when source type is cashier.'
                })
        elif self.source_type == 'bank':
            if not self.source_bank_account:
                raise ValidationError({
                    'source_bank_account': 'Bank account is required when source type is bank.'
                })
            if self.source_cashier_account:
                raise ValidationError({
                    'source_cashier_account': 'Cashier account should be empty when source type is bank.'
                })

        # Validate destination account based on type
        if self.destination_type == 'cashier':
            if not self.destination_cashier_account:
                raise ValidationError({
                    'destination_cashier_account': 'Destination cashier account is required when destination type is cashier.'
                })
            if self.destination_bank_account:
                raise ValidationError({
                    'destination_bank_account': 'Bank account should be empty when destination type is cashier.'
                })
            if self.source_cashier_account_id and self.destination_cashier_account_id and \
               self.source_cashier_account_id == self.destination_cashier_account_id:
                raise ValidationError({
                    'destination_cashier_account': 'Source and destination cashier accounts must be different.'
                })
            if self.source_cashier_account_id and self.destination_cashier_account_id and \
               self.source_cashier_account.branch_id != self.destination_cashier_account.branch_id:
                raise ValidationError({
                    'destination_cashier_account': 'Cashier-to-cashier transfers must be within the same branch.'
                })
            if self.source_type == 'bank' and self.source_bank_account_id and self.destination_cashier_account_id and \
               self.source_bank_account.branch_id != self.destination_cashier_account.branch_id:
                raise ValidationError({
                    'destination_cashier_account': 'Bank-to-cashier transfers must be within the same branch.'
                })
        elif self.destination_type == 'bank':
            if not self.destination_bank_account:
                raise ValidationError({
                    'destination_bank_account': 'Bank account is required when destination type is bank.'
                })
            if self.destination_cashier_account:
                raise ValidationError({
                    'destination_cashier_account': 'Cashier account should be empty when destination type is bank.'
                })

        # Validate amount
        if self.amount <= 0:
            raise ValidationError({
                'amount': 'Transfer amount must be greater than zero.'
            })
        
        # Validate sufficient balance (if not draft)
        if self.status != 'draft' and self.pk is None:
            if self.source_type == 'cashier' and self.source_cashier_account:
                if self.amount > self.source_cashier_account.current_balance:
                    raise ValidationError({
                        'amount': f'Insufficient balance in cashier account. Available: {self.source_cashier_account.current_balance}'
                    })
            elif self.source_type == 'bank' and self.source_bank_account:
                available = self.source_bank_account.get_available_balance()
                if self.amount > available:
                    raise ValidationError({
                        'amount': f'Insufficient balance in bank account. Available: {available}'
                    })
        
        # Cashiers may transfer to any active bank account — no collection-account restriction.
        # Cashier-to-cashier transfers, however, are restricted to the same branch (see above).
    
    def save(self, *args, **kwargs):
        """Auto-generate transfer number"""
        if not self.transfer_number:
            # Generate transfer number
            from django.utils import timezone
            from django.db.models.query import QuerySet as _QS
            date_str = timezone.now().strftime('%Y%m%d')

            # Query ALL transfers for today (including soft-deleted) without going
            # through the scoped manager — otherwise deleted records are invisible
            # and we'd re-generate a transfer_number that already exists in the DB.
            last_transfer = (
                _QS(model=BankTransfer, using='default')
                .filter(transfer_number__startswith=f'TRF-{date_str}')
                .order_by('-transfer_number')
                .first()
            )

            if last_transfer:
                # Extract sequence and increment
                try:
                    last_seq = int(last_transfer.transfer_number.split('-')[-1])
                    new_seq = last_seq + 1
                except Exception:
                    new_seq = 1
            else:
                new_seq = 1

            self.transfer_number = f'TRF-{date_str}-{new_seq:04d}'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.transfer_number} - {self.amount}"

    @staticmethod
    def can_user_manage_bank_to_cashier(user):
        """
        Bank-to-cashier transfers (real bank funds moving into a personal cash
        float) are restricted to branch manager, supervisor, and director/
        admin — for BOTH initiating and approving them. Deliberately looser
        than the director/admin-only gate on bank-to-bank transfers (money
        actually leaving the institution's bank custody entirely), since
        bank-to-cashier keeps funds within internal custody, just changing
        which ledger holds them.

        Single source of truth for this role check — called from both
        BankTransferSerializer.validate() (initiation) and
        BankTransferViewSet.approve() (approval) so they can't drift apart,
        which is exactly the class of bug (two independent checks of the
        same rule silently disagreeing) this whole feature was built to fix.

        Checks the user's tenant Role name first (e.g. "Director"), matching
        the convention PaymentRoutingService._is_director() already uses
        elsewhere in this codebase — NOT the RolePermissionPolicy grant
        system (which has no supervisor grant for banks:bank-transfers
        today, and extending it would grant supervisor broader access than
        asked here). Falls back to hr.Staff.role_level for users set up only
        through HR with no tenant Role assigned. These two systems are known
        to drift apart for a given user (see
        permissions/management/commands/migrate_bank_transfer_policies.py
        and users/management/commands/diagnose_user_roles.py) — checking
        both, in this order, means a user correctly marked "Director" via
        their tenant Role isn't blocked by a stale/mismatched HR role_level.
        """
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if getattr(user, 'is_system_admin', False):
            return True
        if callable(getattr(user, 'is_owner', None)) and user.is_owner():
            return True
        try:
            role_names = user.roles.filter(is_active=True).values_list('name', flat=True)
            for name in role_names:
                name_lower = name.lower()
                if any(f in name_lower for f in (
                    'director', 'admin', 'branch manager', 'branch_manager', 'supervisor',
                )):
                    return True
        except Exception:
            pass
        try:
            return user.staff_profile.role_level in (
                'branch_manager', 'supervisor', 'director', 'admin',
            )
        except Exception:
            return False

    @db_transaction.atomic
    def submit_for_approval(self, user):
        """Submit transfer for approval"""
        if self.status != 'draft':
            raise ValidationError('Only draft transfers can be submitted for approval.')
        
        self.status = 'pending'
        self.save(update_fields=['status'])
    
    @db_transaction.atomic
    def approve(self, approved_by, notes=''):
        """Approve transfer (first approval)"""
        if self.status != 'pending':
            raise ValidationError('Only pending transfers can be approved.')
        
        self.approved_by = approved_by
        self.approved_at = timezone.now()
        self.approval_notes = notes
        
        # Check if dual approval is required. Cashier-to-cashier transfers never
        # require dual approval, regardless of any CashierAccount-side flag — this
        # gate only ever applies to a bank destination.
        if self.destination_type == 'bank' and self.destination_bank_account.requires_dual_approval and \
           self.destination_bank_account.dual_approval_threshold and \
           self.amount >= self.destination_bank_account.dual_approval_threshold:
            # Require second approval
            self.status = 'approved'  # Waiting for second approval
            self.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])
        else:
            # Single approval sufficient - complete the transfer
            self.status = 'approved'
            self.save(update_fields=['status', 'approved_by', 'approved_at', 'approval_notes'])
            self.complete(approved_by)
    
    @db_transaction.atomic
    def second_approve(self, approved_by, notes=''):
        """Second approval for dual approval transfers"""
        if self.status != 'approved':
            raise ValidationError('Transfer must be in approved status for second approval.')

        if self.destination_type == 'cashier':
            raise ValidationError('Cashier-to-cashier transfers do not support second approval.')

        if not self.destination_bank_account.requires_dual_approval:
            raise ValidationError('This transfer does not require dual approval.')
        
        if self.approved_by == approved_by:
            raise ValidationError('Second approver must be different from first approver.')
        
        self.second_approved_by = approved_by
        self.second_approved_at = timezone.now()
        self.second_approval_notes = notes
        self.save(update_fields=['second_approved_by', 'second_approved_at', 'second_approval_notes'])
        
        # Complete the transfer
        self.complete(approved_by)
    
    @db_transaction.atomic
    def reject(self, rejected_by, reason):
        """Reject transfer"""
        if self.status not in ['pending', 'approved']:
            raise ValidationError('Only pending or approved transfers can be rejected.')
        
        self.rejected_by = rejected_by
        self.rejected_at = timezone.now()
        self.rejection_reason = reason
        self.status = 'rejected'
        self.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason'])
    
    @db_transaction.atomic
    def complete(self, user):
        """Complete transfer and create journal entry"""
        if self.status == 'completed':
            raise ValidationError('Transfer already completed.')
        
        # Validate approvals (cashier-to-cashier is never dual-approval — see approve())
        if self.destination_type == 'bank' and self.destination_bank_account.requires_dual_approval and \
           self.destination_bank_account.dual_approval_threshold and \
           self.amount >= self.destination_bank_account.dual_approval_threshold:
            if not self.second_approved_by:
                raise ValidationError('Dual approval required but second approval not received.')
        
        if not self.approved_by:
            raise ValidationError('Transfer must be approved before completion.')
        
        # Create journal entry
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        
        # Get or create series
        series, _ = TransactionSeries.objects.get_or_create(
            code='BTRF',
            defaults={'description': 'Bank Transfers'}
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.transfer_date,
            description=f"Transfer: {self.description}",
            workflow_reference=self.transfer_number,
            branch=self.branch,
            owner=self.owner,
            created_by=user,
        )
        
        # Determine source account
        if self.source_type == 'cashier':
            source_gl_account = self.source_cashier_account.account
        else:
            source_gl_account = self.source_bank_account.gl_account

        # Determine destination account
        if self.destination_type == 'cashier':
            destination_gl_account = self.destination_cashier_account.account
        else:
            destination_gl_account = self.destination_bank_account.gl_account

        # Dr: Destination Account (increase asset)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=destination_gl_account,
            side=JournalEntryLine.DEBIT,
            amount=self.amount
        )
        
        # Cr: Source Account (decrease asset)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=source_gl_account,
            side=JournalEntryLine.CREDIT,
            amount=self.amount
        )
        
        # Post journal entry
        journal_entry.post()
        
        # Update transfer
        self.journal_entry = journal_entry
        self.status = 'completed'
        self.completed_by = user
        self.completed_at = timezone.now()
        self.save(update_fields=['journal_entry', 'status', 'completed_by', 'completed_at'])
        
        # Update cashier balance if source is cashier
        if self.source_type == 'cashier':
            self.source_cashier_account.current_balance -= self.amount
            self.source_cashier_account.save(update_fields=['current_balance'])

        # Sync source bank account balance with GL accounts
        if self.source_type == 'bank':
            self.source_bank_account.save()  # Triggers balance sync

        # Update destination balance
        if self.destination_type == 'cashier':
            self.destination_cashier_account.current_balance += self.amount
            self.destination_cashier_account.save(update_fields=['current_balance'])
        else:
            self.destination_bank_account.save()  # Triggers balance sync


class BankPayment(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Outgoing bank payments for suppliers (AP) or direct expenses.
    Creates journal entries with payment reference number as workflow reference.
    """
    payment_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Auto-generated bank payment reference"
    )

    payment_date = models.DateField(
        default=timezone.now,
        help_text="Date of payment"
    )

    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='bank_payments',
        help_text="Bank account used for the payment"
    )

    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Payment amount"
    )

    description = models.TextField(
        help_text="Purpose of payment"
    )

    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="External reference (bank slip, invoice ref, etc.)"
    )

    accounts_payable = models.ForeignKey(
        'liabilities.AccountsPayable',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bank_payments',
        help_text="Linked accounts payable (supplier/PO payment)"
    )

    expense = models.ForeignKey(
        'expenses.Expense',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bank_payments',
        help_text="Linked direct expense payment"
    )

    supplier = models.ForeignKey(
        'procurement.Supplier',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bank_payments',
        help_text="Supplier for payment-on-account (no AP/PO yet)"
    )

    advance_applied = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total amount of this advance already applied to Accounts Payable records"
    )

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('posted', 'Posted'),
        ('failed', 'Failed'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posted_bank_payments'
    )

    posted_at = models.DateTimeField(
        null=True,
        blank=True
    )

    # Approval fields
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_bank_payments'
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True
    )

    rejection_reason = models.TextField(
        blank=True,
        help_text="Reason for rejection (if rejected)"
    )

    journal_entry = models.ForeignKey(
        'transactions.Transaction',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='bank_payments',
        help_text="Journal entry created for this payment"
    )

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['payment_number']),
            models.Index(fields=['payment_date', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['bank_account']),
        ]
        verbose_name = 'Bank Payment'
        verbose_name_plural = 'Bank Payments'

    def clean(self):
        """Validate payment data"""
        super().clean()

        # Must be linked to exactly one of: accounts_payable, expense, or supplier (on-account)
        linked = [self.accounts_payable_id, self.expense_id, self.supplier_id]
        if sum(bool(x) for x in linked) != 1:
            raise ValidationError(
                'Select exactly one of: Accounts Payable, Expense, or Supplier '
                '(on-account payment). Not more than one, not none.'
            )

        # Validate amount
        if self.amount and self.amount <= 0:
            raise ValidationError({'amount': 'Payment amount must be greater than zero.'})

        # Validate bank account status
        if self.bank_account_id:
            if not self.bank_account.is_active:
                raise ValidationError({'bank_account': 'Bank account is not active.'})
            if self.bank_account.is_suspended:
                raise ValidationError({'bank_account': 'Bank account is suspended.'})

        # Validate accounts payable amount
        if self.accounts_payable_id and self.amount:
            if self.amount > self.accounts_payable.amount_due:
                raise ValidationError({
                    'amount': f'Payment amount exceeds amount due ({self.accounts_payable.amount_due}).'
                })

        # On-account payments: supplier must be active
        if self.supplier_id and self.supplier and not self.supplier.is_active:
            raise ValidationError({'supplier': 'Cannot record payment for an inactive supplier.'})

        # Validate expense amount — must not exceed what is still unpaid.
        # Expenses may have been partially settled previously, so compare against
        # total_amount only when no prior payment exists.
        if self.expense_id and self.amount:
            expense = self.expense
            # Compute already-paid amount via linked BankPayments (excluding self)
            from django.db.models import Sum as _Sum
            already_paid = (
                BankPayment.objects.filter(expense=expense, status='posted')
                .exclude(pk=self.pk)
                .aggregate(total=_Sum('amount'))['total']
            ) or Decimal('0.00')
            amount_due = expense.total_amount - already_paid
            if self.amount > amount_due:
                raise ValidationError({
                    'amount': (
                        f'Payment amount ({self.amount}) exceeds the outstanding balance '
                        f'for this expense ({amount_due}).'
                    )
                })

    def save(self, *args, **kwargs):
        """Auto-generate payment number"""
        if not self.payment_number:
            date_str = timezone.now().strftime('%Y%m%d')

            last_payment = BankPayment.objects.filter(
                payment_number__startswith=f'BPM-{date_str}'
            ).order_by('-payment_number').first()

            if last_payment:
                try:
                    last_seq = int(last_payment.payment_number.split('-')[-1])
                    new_seq = last_seq + 1
                except Exception:
                    new_seq = 1
            else:
                new_seq = 1

            self.payment_number = f'BPM-{date_str}-{new_seq:04d}'

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.payment_number} - {self.amount}"

    @property
    def advance_remaining(self):
        """Remaining advance balance not yet applied to any Accounts Payable records."""
        if not self.supplier_id:
            return Decimal('0.00')
        return self.amount - (self.advance_applied or Decimal('0.00'))

    @db_transaction.atomic
    def apply_advance_to_payable(self, payable, amount, posted_by, notes='', bypass_validation=False):
        """
        Apply a portion of this on-account advance against an Accounts Payable record.

        Two-step accounting cycle — this handles Step 2:
          Step 1 (original advance): Dr Supplier Advances / Cr Bank
          Step 2 (this method):      Dr Accounts Payable  / Cr Supplier Advances

        Args:
            payable: AccountsPayable instance to clear against
            amount:  Amount to apply (must not exceed advance_remaining or payable.amount_due)
            posted_by: User performing the action
            notes:   Optional notes recorded on the AP
            bypass_validation: Skip 3-way match check (use with caution)

        Returns:
            dict with journal_entry id, amount_applied, advance_remaining, ap status
        """
        from decimal import Decimal as _Dec
        from django.contrib.contenttypes.models import ContentType
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from accounts.utils.account_creation import get_system_account

        amount = _Dec(str(amount))

        # ── Guards ────────────────────────────────────────────────────────────
        if not self.supplier_id:
            raise ValidationError('Only on-account payments can be applied to Accounts Payable.')

        if self.status != 'posted':
            raise ValidationError(
                f'Payment must be posted before it can be applied. Current status: {self.status}.'
            )

        if amount <= 0:
            raise ValidationError('Application amount must be positive.')

        advance_remaining = self.advance_remaining
        if amount > advance_remaining:
            raise ValidationError(
                f'Application amount ({amount}) exceeds remaining advance balance ({advance_remaining}).'
            )

        if amount > payable.amount_due:
            raise ValidationError(
                f'Application amount ({amount}) exceeds the amount due on this invoice ({payable.amount_due}).'
            )

        # ── Validate same supplier ─────────────────────────────────────────────
        # AP uses a GenericFK: content_type=Supplier, object_id=supplier PK
        from procurement.models import Supplier as _Supplier
        supplier_ct = ContentType.objects.get_for_model(_Supplier)
        if payable.content_type_id != supplier_ct.id or int(payable.object_id) != self.supplier_id:
            raise ValidationError(
                'The Accounts Payable record does not belong to the same supplier as this advance.'
            )

        # ── 3-way match (optional) ─────────────────────────────────────────────
        if not bypass_validation and payable.purchase_order_id:
            if payable.three_way_match_status == 'not_validated':
                validation_result = payable.validate_three_way_match(user=posted_by)
            else:
                validation_result = payable.three_way_match_result or {}

            if payable.three_way_match_status == 'failed':
                raise ValidationError(
                    f"Cannot apply advance: 3-way matching FAILED. "
                    f"Reason: {validation_result.get('summary', 'Critical discrepancies found')}."
                )

        # ── GL journal: Dr AP / Cr Supplier Advances ──────────────────────────
        supplier_advance_account = get_system_account('supplier_advance', self.owner, self.branch)

        series, _ = TransactionSeries.objects.get_or_create(
            code='ADVCL',
            defaults={'description': 'Supplier Advance Clearance'}
        )

        invoice_ref = payable.reference_number or payable.invoice_number
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=(
                f"Advance Cleared: {self.payment_number} → {invoice_ref} "
                f"({payable.vendor_name})"
            ),
            workflow_reference=f"{self.payment_number}-CLR-{invoice_ref}",
            branch=self.branch,
            owner=self.owner,
            created_by=posted_by,
        )

        # Dr: Accounts Payable — reduces the liability
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payable.account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
        )

        # Cr: Supplier Advances — reduces the asset (advance consumed)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=supplier_advance_account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
        )

        journal_entry.post()

        # ── Update AP record ───────────────────────────────────────────────────
        payable.amount_paid = (_Dec(str(payable.amount_paid)) or _Dec('0')) + amount
        if payable.amount_paid >= payable.amount:
            payable.status = 'paid'
        elif payable.amount_paid > 0:
            payable.status = 'partial'
        payable.posted_by = posted_by
        payable.posted_at = timezone.now()
        if notes:
            payable.posting_notes = notes
        payable.save(update_fields=[
            'amount_paid', 'status', 'posted_by', 'posted_at', 'posting_notes'
        ])

        # ── Update advance applied tracker ─────────────────────────────────────
        self.advance_applied = (_Dec(str(self.advance_applied)) or _Dec('0')) + amount
        self.save(update_fields=['advance_applied'])

        return {
            'journal_entry_id': journal_entry.id,
            'amount_applied': str(amount),
            'advance_remaining': str(self.advance_remaining),
            'ap_amount_due': str(payable.amount_due),
            'ap_status': payable.status,
        }

    @db_transaction.atomic
    def approve_payment(self, approved_by, notes=''):
        """Approve the payment and immediately post it."""
        if self.status not in ('pending', 'draft'):
            raise ValidationError(f'Cannot approve a payment with status "{self.status}".')
        if not approved_by:
            raise ValidationError('Approver is required.')
        self.approved_by = approved_by
        self.approved_at = timezone.now()
        self.status = 'approved'
        self.save(update_fields=['approved_by', 'approved_at', 'status'])
        # Post immediately after approval
        self.post_payment(posted_by=approved_by, notes=notes)

    @db_transaction.atomic
    def reject_payment(self, rejected_by, reason=''):
        """Reject the payment."""
        if self.status not in ('pending', 'draft'):
            raise ValidationError(f'Cannot reject a payment with status "{self.status}".')
        if not reason:
            raise ValidationError('Rejection reason is required.')
        self.status = 'rejected'
        self.rejection_reason = reason
        self.save(update_fields=['status', 'rejection_reason'])

    @db_transaction.atomic
    def post_payment(self, posted_by, notes='', bypass_validation=False):
        """Post payment and create journal entry"""
        if self.status == 'posted' and self.journal_entry_id:
            raise ValidationError('Payment already posted.')

        if self.status == 'rejected':
            raise ValidationError('Cannot post a rejected payment.')

        if not posted_by:
            raise ValidationError('Posted by user is required.')

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries
        )
        from accounts.utils.account_creation import get_system_account
        from expenses.services.expense_accounting import ExpenseAccountingService

        series, _ = TransactionSeries.objects.get_or_create(
            code='BKPAY',
            defaults={'description': 'Bank Payments'}
        )

        if self.accounts_payable_id:
            payable = self.accounts_payable

            # Validate and update payable (3-way match, status, etc.)
            payable.make_payment(
                amount=self.amount,
                payment_date=self.payment_date,
                notes=notes or self.description,
                posted_by=posted_by,
                bypass_validation=bypass_validation
            )

            journal_entry = JournalEntry.objects.create(
                series=series,
                date=self.payment_date,
                description=f"Bank Payment: {payable.invoice_number} - {self.description}",
                workflow_reference=self.payment_number,
                branch=self.branch,
                owner=self.owner,
                created_by=posted_by,
            )

            # Dr: Accounts Payable (liability decreases)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=payable.account,
                side=JournalEntryLine.DEBIT,
                amount=self.amount
            )

            # Cr: Bank Account (asset decreases)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.bank_account.gl_account,
                side=JournalEntryLine.CREDIT,
                amount=self.amount
            )

            journal_entry.post()
            self.journal_entry = journal_entry

        elif self.expense_id:
            expense = self.expense

            if expense.requires_approval and not expense.approved:
                raise ValidationError('Expense must be approved before posting payment.')

            if expense.is_posted and expense.status == 'paid':
                raise ValidationError('Expense is already marked as paid.')

            if expense.is_posted and expense.status != 'paid':
                # Expense was previously posted to Accounts Payable (deferred payment).
                # Guard: reject if the expense was posted to a non-AP account (e.g. cash)
                # which would create a phantom AP debit with no matching AP credit.
                from transactions.models import TransactionEntry as _TE
                from accounts.models import Account as _Acc
                ap_system = get_system_account('accounts_payable', self.owner, self.branch)
                last_gl_entry = (
                    _TE.objects.filter(
                        transaction__workflow_reference=expense.reference_number,
                        side=_TE.CREDIT,
                    )
                    .select_related('account')
                    .order_by('-transaction__created_at')
                    .first()
                )
                if last_gl_entry and last_gl_entry.account.account_type != 'LIABILITY':
                    raise ValidationError(
                        f"Expense {expense.reference_number} was previously posted directly "
                        f"to a cash/bank account ('{last_gl_entry.account.name}'). "
                        "A BankPayment cannot be created on top of a direct posting. "
                        "Please reverse the original expense posting first, then retry."
                    )
                accounts_payable = ap_system

                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=self.payment_date,
                    description=f"Bank Payment for {expense.reference_number} - {self.description}",
                    workflow_reference=self.payment_number,
                    branch=self.branch,
                    owner=self.owner,
                    created_by=posted_by,
                )

                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=accounts_payable,
                    side=JournalEntryLine.DEBIT,
                    amount=self.amount
                )

                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=self.bank_account.gl_account,
                    side=JournalEntryLine.CREDIT,
                    amount=self.amount
                )

                journal_entry.post()
                self.journal_entry = journal_entry

            else:
                # Direct expense payment (Dr Expense / Cr Bank)
                expense_account = ExpenseAccountingService(expense)._get_expense_account()

                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=self.payment_date,
                    description=f"Bank Payment: {expense.reference_number} - {self.description}",
                    workflow_reference=self.payment_number,
                    branch=self.branch,
                    owner=self.owner,
                    created_by=posted_by,
                )

                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=expense_account,
                    side=JournalEntryLine.DEBIT,
                    amount=self.amount
                )

                JournalEntryLine.objects.create(
                    transaction=journal_entry,
                    account=self.bank_account.gl_account,
                    side=JournalEntryLine.CREDIT,
                    amount=self.amount
                )

                journal_entry.post()
                self.journal_entry = journal_entry

                expense.is_posted = True
                expense.posted_at = timezone.now()

            expense.status = 'paid'
            expense.payment_method = 'bank_transfer'
            expense.payment_reference = self.payment_number
            expense.bank_account = self.bank_account
            expense.save(update_fields=[
                'status',
                'payment_method',
                'payment_reference',
                'bank_account',
                'is_posted',
                'posted_at'
            ])

        elif self.supplier_id:
            # Payment on account — Dr Supplier Advances (Asset) / Cr Bank
            supplier_advance_account = get_system_account(
                'supplier_advance', self.owner, self.branch
            )

            journal_entry = JournalEntry.objects.create(
                series=series,
                date=self.payment_date,
                description=(
                    f"Payment on Account: {self.supplier.name} - {self.description}"
                ),
                workflow_reference=self.payment_number,
                branch=self.branch,
                owner=self.owner,
                created_by=posted_by,
            )

            # Dr: Supplier Advances (asset increases — we are owed delivery)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=supplier_advance_account,
                side=JournalEntryLine.DEBIT,
                amount=self.amount
            )

            # Cr: Bank Account (asset decreases — cash leaves)
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.bank_account.gl_account,
                side=JournalEntryLine.CREDIT,
                amount=self.amount
            )

            journal_entry.post()
            self.journal_entry = journal_entry

        self.status = 'posted'
        self.posted_by = posted_by
        self.posted_at = timezone.now()
        self.save(update_fields=['status', 'posted_by', 'posted_at', 'journal_entry'])

        # Sync bank balance
        self.bank_account.save()

        # ── Auto-clear outstanding APs for on-account payments ────────────────
        # Immediately after posting Dr Supplier Advances / Cr Bank, apply the
        # new advance against any pre-existing open APs for this supplier in FIFO
        # order (oldest first).  Any unconsumed balance stays in advance_remaining
        # and can be applied later via the "Apply to Invoice" button when a new AP
        # arrives.
        if self.supplier_id:
            from liabilities.models import AccountsPayable as _AP
            from django.contrib.contenttypes.models import ContentType
            from procurement.models import Supplier as _Supplier

            supplier_ct = ContentType.objects.get_for_model(_Supplier)
            outstanding_aps = list(
                _AP.objects
                .filter(
                    content_type=supplier_ct,
                    object_id=str(self.supplier_id),
                )
                .exclude(status__in=['paid', 'cancelled'])
                .order_by('created_at')  # FIFO — oldest AP first
            )

            for ap in outstanding_aps:
                # Always re-read advance_applied from DB before each iteration
                # so that changes from the previous apply_advance_to_payable()
                # call are reflected in advance_remaining.
                self.refresh_from_db(fields=['advance_applied'])
                if self.advance_remaining <= Decimal('0.00'):
                    break  # Advance fully consumed — nothing left to apply

                apply_amount = min(self.advance_remaining, ap.amount_due)
                if apply_amount <= Decimal('0.00'):
                    continue  # This AP has no outstanding balance — skip

                try:
                    self.apply_advance_to_payable(
                        payable=ap,
                        amount=apply_amount,
                        posted_by=posted_by,
                        notes=f"Auto-applied from advance {self.payment_number}",
                        bypass_validation=True,  # Auto-clear skips 3-way match
                    )
                except Exception:
                    # If this specific AP cannot be cleared (e.g. supplier mismatch,
                    # data integrity issue), skip it and continue to the next one.
                    # The advance balance is preserved for manual clearance.
                    continue

        return self


# Audit log for balance changes
class BankAccountBalanceLog(TimeStampedModel):
    """Audit trail for bank account balance changes"""
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.CASCADE,
        related_name='balance_logs'
    )
    
    previous_balance = models.DecimalField(max_digits=18, decimal_places=2)
    new_balance = models.DecimalField(max_digits=18, decimal_places=2)
    change_amount = models.DecimalField(max_digits=18, decimal_places=2)
    
    transaction_type = models.CharField(
        max_length=50,
        help_text="Type of transaction causing balance change"
    )
    
    reference_number = models.CharField(max_length=100)
    
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['bank_account', '-created_at']),
        ]


class BankFeedConsent(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Records a client's consent for Phoenix to pull their bank transaction feed
    via Open Banking / direct bank API integration.

    Java App 3 (BankFeedReconciliationService) reads this model to know which
    clients have active consents and polls their bank feeds accordingly.

    Flow:
    1. Client grants consent via the portal or branch officer → record created here.
    2. Java App 3 picks up the consent record, initiates the OAuth / API handshake
       with the bank, and stores the access token back in `consent_token`.
    3. Java App 3 periodically pulls transactions, sets `last_sync_at`, and
       writes matched transactions to the reconciliation queue.
    4. Consent expires at `consent_expires_at`; Java App 3 triggers renewal flow.
    """
    CONSENT_STATUS_CHOICES = [
        ('pending',  'Pending — awaiting bank authorisation'),
        ('active',   'Active — consent granted'),
        ('expired',  'Expired'),
        ('revoked',  'Revoked by client'),
        ('failed',   'Authorisation failed'),
    ]

    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.CASCADE,
        related_name='bank_feed_consents',
        help_text='Client who granted this bank feed consent'
    )

    # Bank details
    bank_name = models.CharField(max_length=200, help_text='Name of the bank (e.g. GTBank, Zenith)')
    bank_code = models.CharField(
        max_length=10, blank=True,
        help_text='CBN bank sort code / NIP code (e.g. 058 for GTBank)'
    )
    account_number = models.CharField(max_length=20)
    account_name   = models.CharField(max_length=200, blank=True)

    # Consent lifecycle
    status = models.CharField(
        max_length=20, choices=CONSENT_STATUS_CHOICES, default='pending', db_index=True
    )
    consent_granted_at  = models.DateTimeField(null=True, blank=True)
    consent_expires_at  = models.DateTimeField(null=True, blank=True)
    consent_revoked_at  = models.DateTimeField(null=True, blank=True)

    # Token stored by Java App 3 (encrypted at rest by the Java service before saving)
    consent_token = models.TextField(
        blank=True,
        help_text='Encrypted OAuth/API access token stored by Java App 3'
    )
    refresh_token = models.TextField(
        blank=True,
        help_text='Encrypted OAuth refresh token for renewing access'
    )

    # Sync tracking
    last_sync_at    = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(
        max_length=50, blank=True,
        help_text='Result of the last sync attempt (e.g. "success", "bank_error")'
    )
    sync_error_detail = models.TextField(blank=True)

    # The Phoenix BankAccount this feed reconciles against
    phoenix_bank_account = models.ForeignKey(
        BankAccount,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='feed_consents',
        help_text='Phoenix internal bank account this feed reconciles against'
    )

    # Who recorded the consent on behalf of the client
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bank_feed_consents_recorded',
    )
    notes = models.TextField(blank=True)

    objects     = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['status', 'consent_expires_at']),
        ]
        verbose_name        = 'Bank Feed Consent'
        verbose_name_plural = 'Bank Feed Consents'

    def __str__(self):
        return f"{self.client} — {self.bank_name} {self.account_number} ({self.status})"


# ── Bank Statement Upload (Feature #2) ────────────────────────────────────────

class BankStatementUpload(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Uploaded bank statement file (CSV / Excel) for a given BankAccount.

    After upload Django stores the raw file and parses it into BankStatementLine
    rows. The Java BankFeedReconciliationService (App 3) then auto-matches lines
    to existing transactions.

    Status flow:
      uploaded → parsing → parsed → matching → matched → reconciled
    """
    STATUS_CHOICES = [
        ('uploaded',   'Uploaded — awaiting parse'),
        ('parsing',    'Parsing in progress'),
        ('parsed',     'Parsed — awaiting matching'),
        ('matching',   'Auto-matching in progress'),
        ('matched',    'Matching complete'),
        ('reconciled', 'Fully reconciled'),
        ('error',      'Parse / match error'),
    ]

    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='statement_uploads',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='bank_statement_uploads',
    )
    statement_file = models.FileField(
        upload_to='bank_statements/%Y/%m/',
        help_text='CSV or Excel bank statement file',
    )
    statement_date_from = models.DateField(null=True, blank=True)
    statement_date_to = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='uploaded', db_index=True
    )
    row_count = models.PositiveIntegerField(default=0)
    matched_count = models.PositiveIntegerField(default=0)
    unmatched_count = models.PositiveIntegerField(default=0)
    error_detail = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"{self.bank_account} upload {self.created_at:%Y-%m-%d} [{self.status}]"
        )


class BankStatementLine(TimeStampedModel):
    """
    One row from a BankStatementUpload.
    Auto-matched by the Java reconciliation service.
    """
    MATCH_STATUS_CHOICES = [
        ('unmatched',       'Unmatched'),
        ('auto_matched',    'Auto-matched by Java service'),
        ('manual_matched',  'Manually matched'),
        ('excluded',        'Excluded / ignored'),
    ]

    upload = models.ForeignKey(
        BankStatementUpload,
        on_delete=models.CASCADE,
        related_name='lines',
    )
    value_date = models.DateField(db_index=True)
    description = models.TextField(blank=True)
    credit_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00')
    )
    debit_amount = models.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00')
    )
    balance = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True,
        help_text="Closing balance as per the bank statement for this line"
    )
    reference = models.CharField(max_length=200, blank=True, db_index=True)
    match_status = models.CharField(
        max_length=20, choices=MATCH_STATUS_CHOICES, default='unmatched', db_index=True
    )
    matched_transaction = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bank_statement_matches',
    )
    match_confidence = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Confidence score (0–100) provided by the Java matching engine"
    )
    raw_data = models.JSONField(
        default=dict,
        help_text="Original parsed row data from the upload file"
    )

    class Meta:
        ordering = ['value_date', 'id']
        indexes = [
            models.Index(fields=['upload', 'match_status']),
            models.Index(fields=['value_date', 'match_status']),
        ]

    def __str__(self):
        return (
            f"{self.value_date} | +{self.credit_amount} / -{self.debit_amount} "
            f"[{self.match_status}]"
        )


# ── Reconciliation Bank Transactions (Bank-Recon Java integration) ─────────────
# NOTE: this is deliberately NOT named BankFeedTransaction — that name is
# already taken (below) by a dead model from the abandoned Mono/open-banking
# consent architecture (never referenced by any view/serializer/url; its
# migration is left untouched per the same caution applied elsewhere).

class ReconciliationBankTransaction(models.Model):
    """
    One line from an uploaded bank statement. Django owns this storage —
    Bank-Recon (Java) is a stateless matching service with no database of
    its own; every reconciliation run sends it the current unmatched pool
    for the target date and persists whatever comes back in the response.

    Deduplicated per (bank_account, bank_ref) so re-uploading the same
    statement (or a multi-day file that overlaps a previous upload) never
    double-counts a transaction.
    """
    DIRECTION_CHOICES = [
        ('CREDIT', 'Credit — money in'),
        ('DEBIT', 'Debit — money out'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='reconciliation_transactions',
    )
    bank_ref = models.CharField(
        max_length=500,
        help_text="The bank's own reference, or a deterministic hash when none was supplied",
    )
    value_date = models.DateField(db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    narration = models.TextField(blank=True)
    balance_after = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # Populated once Java reports a confirmed match
    matched = models.BooleanField(default=False, db_index=True)
    match_confidence = models.CharField(max_length=10, blank=True)
    matched_erp_payment_id = models.IntegerField(null=True, blank=True)
    matched_at = models.DateTimeField(null=True, blank=True)

    # Accountability signals captured at match time (see banks/tasks.py's
    # _persist_outcome) — who recorded the ERP side, whether their narration
    # had a traceable bank reference, and how many days late the bank posted
    # relative to the date they claimed it. Null until matched; used by the
    # Officer Reconciliation Risk report to judge patterns across ALL of an
    # officer's activity, not just the cases that ended up as exceptions.
    matched_erp_officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='matched_bank_transactions',
        help_text='User who recorded the ERP-side payment this line matched to',
    )
    matched_erp_had_reference = models.BooleanField(null=True, blank=True)
    # value_date minus the ERP payment's own claimed date. Positive means
    # the bank posted AFTER the officer claimed the payment (late posting —
    # the pattern the user specifically asked to catch); negative means the
    # officer logged it in the ERP after it had already hit the bank.
    posting_lag_days = models.IntegerField(null=True, blank=True)

    # Set when a director manually undoes an incorrect auto-match (see
    # unmatch() below). Deliberately does NOT clear matched_erp_payment_id/
    # match_confidence/matched_at/matched_erp_officer/matched_erp_had_reference/
    # posting_lag_days — those stay as a historical record of what this line
    # was wrongly matched to, mirroring Transaction.reverse()'s non-destructive
    # philosophy (transactions/models.py). matched=False alone is what excludes
    # it from the Officer Reconciliation Risk report's matched_qs and makes it
    # eligible again as a candidate on the next reconciliation rerun.
    unmatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='unmatched_bank_transactions',
        help_text='Director who manually undid an incorrect auto-match',
    )
    unmatched_at = models.DateTimeField(null=True, blank=True)
    unmatched_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('bank_account', 'bank_ref')]
        indexes = [
            models.Index(fields=['bank_account', 'value_date', 'matched']),
        ]
        verbose_name = 'Reconciliation Bank Transaction'
        verbose_name_plural = 'Reconciliation Bank Transactions'

    def __str__(self):
        return f"{self.bank_account} — {self.value_date} — {self.direction} {self.amount}"

    @db_transaction.atomic
    def unmatch(self, user, reason):
        """
        Manually undo an incorrect auto-match, styled after
        Transaction.reverse() (transactions/models.py): validate first,
        mutate second, explicit update_fields. Never touches the underlying
        GL Transaction/TransactionEntry this line was matched to — only the
        reconciliation-side linkage changes. The freed-up ERP payment becomes
        available for matching again (see fetch_erp_payments' exclude_payment_ids
        in banks/tasks.py, built from matched=True rows only), and this bank
        line reappears as an outstanding bank_only exception immediately via
        get_or_create_bank_only_exception (banks/reconciliation_utils.py),
        rather than waiting for the next scheduled rerun.
        """
        from .reconciliation_utils import reason_too_short, MIN_REASON_LENGTH

        if not self.matched:
            raise ValidationError('This transaction is not currently matched.')
        if reason_too_short(reason):
            raise ValidationError(f'A reason of at least {MIN_REASON_LENGTH} characters is required to unmatch a transaction.')

        self.matched = False
        self.unmatched_by = user
        self.unmatched_at = timezone.now()
        self.unmatched_reason = reason
        self.save(update_fields=['matched', 'unmatched_by', 'unmatched_at', 'unmatched_reason'])

        from .reconciliation_utils import get_or_create_bank_only_exception, recompute_reconciliation_counts

        recon = DailyReconciliation.objects.filter(
            bank_account=self.bank_account, reconciliation_date=self.value_date,
        ).first()
        if recon is not None:
            get_or_create_bank_only_exception(recon, self)
            recompute_reconciliation_counts(recon)


# ── Daily Reconciliation (Bank-Recon Java integration) ─────────────────────────

class DailyReconciliation(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    One reconciliation run for a given bank account and date.

    Workflow:
      1. Branch manager uploads First Bank CSV → DailyReconciliation created (status='processing')
      2. Django parses CSV, calls Java POST /api/internal/bank-feed/ingest-and-match
      3. Java matches transactions, returns ReconciliationOutcome
      4. Django writes ReconciliationException rows and sets status='completed' (or 'failed')

    unique_together ensures only one reconciliation per account per day.
    """
    STATUS_CHOICES = [
        ('processing', 'Processing'),
        ('completed',  'Completed'),
        ('failed',     'Failed'),
    ]

    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='daily_reconciliations',
        help_text='The branch bank account being reconciled',
    )
    reconciliation_date = models.DateField(
        db_index=True,
        help_text='The business date of the bank statement being reconciled',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reconciliation_uploads',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    statement_file = models.FileField(
        upload_to='bank_statements/%Y/%m/',
        help_text='Raw CSV file as uploaded by the branch manager',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='processing',
        db_index=True,
    )

    # Counts populated by Java after matching
    total_bank_transactions = models.PositiveIntegerField(default=0)
    matched_count           = models.PositiveIntegerField(default=0)
    unmatched_bank_count    = models.PositiveIntegerField(default=0)
    unmatched_erp_count     = models.PositiveIntegerField(default=0)

    # Error detail if status='failed'
    error_detail = models.TextField(blank=True)

    # Incremented each time matching is re-triggered for a reconciliation
    # that already existed — a day is never really "closed": postings lag,
    # and late-arriving transactions must still be matchable against it.
    rerun_count = models.PositiveIntegerField(default=0)

    # Whether this run should also attempt to match debit transactions (bank
    # charges, reverse credits, etc.) in addition to the default credit-only
    # matching. Persisted so that watchdog re-queues honour the original
    # intent rather than silently downgrading to credit-only.
    include_debits = models.BooleanField(default=False)

    objects = OwnerBranchManager()

    class Meta:
        ordering = ['-reconciliation_date', '-uploaded_at']
        unique_together = [('bank_account', 'reconciliation_date')]
        indexes = [
            models.Index(fields=['bank_account', 'reconciliation_date']),
            models.Index(fields=['status']),
        ]
        verbose_name        = 'Daily Reconciliation'
        verbose_name_plural = 'Daily Reconciliations'

    def __str__(self):
        return (
            f"{self.bank_account} — {self.reconciliation_date} [{self.status}]"
        )


class ReconciliationException(TimeStampedModel):
    """
    A single unmatched or mismatched item within a DailyReconciliation.

    exception_type:
      'bank_only'   — transaction in bank statement but not in ERP
      'erp_only'    — payment recorded in ERP but not in bank statement
      'amount_diff' — same reference but amounts differ

    Populated by the Java IngestAndMatchController via the Django internal API.
    Branch managers review and resolve these manually.
    """
    EXCEPTION_TYPE_CHOICES = [
        ('bank_only',   'Bank Only — not in ERP'),
        ('erp_only',    'ERP Only — not in bank'),
        ('amount_diff', 'Amount Difference'),
    ]

    reconciliation = models.ForeignKey(
        DailyReconciliation,
        on_delete=models.CASCADE,
        related_name='exceptions',
    )
    exception_type = models.CharField(
        max_length=20,
        choices=EXCEPTION_TYPE_CHOICES,
        db_index=True,
    )
    direction = models.CharField(
        max_length=10,
        choices=[('CREDIT', 'Credit — money in'), ('DEBIT', 'Debit — money out')],
        default='CREDIT',
        db_index=True,
        help_text='Which side of the statement this exception came from. '
                   'DEBIT exceptions only appear when a reconciliation opted in to debit checking.',
    )

    # Bank-side details (null for 'erp_only')
    bank_transaction_id = models.UUIDField(
        null=True, blank=True,
        help_text='UUID assigned by Java to this bank transaction',
    )
    bank_amount    = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    bank_narration = models.TextField(blank=True)
    bank_date      = models.DateField(null=True, blank=True)

    # ERP-side details (null for 'bank_only')
    loan_payment_id = models.IntegerField(
        null=True, blank=True,
        help_text='ID of the ERP transaction (transactions_transaction.id)',
    )
    erp_amount    = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    erp_narration = models.TextField(blank=True)
    erp_date      = models.DateField(null=True, blank=True)

    # Accountability — who actually recorded the ERP-side transaction (not
    # who uploaded the statement) and which branch it belongs to. Derived
    # from Transaction.created_by via loan_payment_id; null for bank_only
    # exceptions, since there's no ERP record to attribute.
    officer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='recon_exceptions_as_officer',
        help_text='User who recorded the ERP-side transaction, if any',
    )
    erp_branch = models.ForeignKey(
        'branches.Branch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='recon_exceptions_as_erp_branch',
        help_text="The officer's branch, if any",
    )

    # A bank credit with no matching ERP record at all (exception_type=
    # 'bank_only') is the single most likely "cash collected but not
    # recorded" signature, so it's auto-flagged for director attention.
    is_high_priority = models.BooleanField(default=False, db_index=True)

    # Resolution
    resolved       = models.BooleanField(default=False, db_index=True)
    resolved_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='resolved_recon_exceptions',
    )
    resolved_at      = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    # Second sign-off for exceptions at/above RECONCILIATION_EXCEPTION_
    # DUAL_APPROVAL_THRESHOLD — mirrors BankTransfer's approved_by/
    # second_approved_by pattern (banks/models.py). While a second approval
    # is pending, resolved_by/resolved_at/resolution_notes above hold the
    # FIRST director's action and `resolved` stays False (still genuinely
    # outstanding) until second_resolved_by confirms — see
    # requires_dual_approval_to_resolve below and ResolveExceptionView/
    # SecondResolveExceptionView (banks/views.py).
    second_resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='second_resolved_recon_exceptions',
    )
    second_resolved_at = models.DateTimeField(null=True, blank=True)
    second_resolution_notes = models.TextField(blank=True)

    # Set when a branch manager or director posts a bank-only DEBIT exception
    # (e.g. stamp duty, bank charges) straight to an expense — see
    # ResolveExceptionToExpenseView (banks/views.py). The exception is NOT
    # marked resolved here; that happens automatically once the payment is
    # approved+posted and a later rerun matches it against this bank line
    # (the existing auto-resolve step in _persist_outcome, banks/tasks.py).
    pending_bank_payment = models.ForeignKey(
        'banks.BankPayment',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='pending_exception_resolutions',
        help_text='Draft/pending payment created to close this exception via expense posting',
    )

    # Set when a director manually links this exception against another one
    # on the same bank account — either another bank_only exception of the
    # opposite direction (compensating-transfer/netting) or a bank_only+
    # erp_only pair of the same direction (a missed auto-match — see
    # is_valid_exception_pairing, banks/reconciliation_utils.py). Kept the
    # name "netted_with" from when this only covered the netting case; the
    # field itself is generic. See LinkResolveExceptionsView (banks/views.py).
    # Set symmetrically on both rows.
    netted_with = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        help_text='The other exception this was manually linked/netted against',
    )

    # Director-resolvable tolerance for amount mismatches: whichever is
    # smaller of a flat cap or a percentage of the ERP amount, so small
    # transactions aren't swamped by the flat cap and large ones aren't
    # swamped by the percentage.
    AMOUNT_TOLERANCE_FIXED   = Decimal('100.00')
    AMOUNT_TOLERANCE_PERCENT = Decimal('0.005')  # 0.5%

    class Meta:
        ordering = ['reconciliation', 'exception_type']
        indexes = [
            models.Index(fields=['reconciliation', 'exception_type']),
            models.Index(fields=['reconciliation', 'resolved']),
            models.Index(fields=['reconciliation', 'direction']),
        ]
        constraints = [
            # One row per (reconciliation, bank line / ERP payment) — resolved
            # or not. Without this, a rerun that finds the same still-unmatched
            # bank line again could create a duplicate exception even though
            # _persist_outcome's get_or_create dedup_filter (banks/tasks.py)
            # already tries to prevent it; the DB constraint is the actual
            # enforcement point against concurrent task runs with overlapping
            # ±window matching (the TOCTOU race get_or_create alone can't close).
            models.UniqueConstraint(
                fields=['reconciliation', 'bank_transaction_id'],
                condition=models.Q(exception_type='bank_only'),
                name='uniq_bank_only_exception_per_recon',
            ),
            models.UniqueConstraint(
                fields=['reconciliation', 'loan_payment_id'],
                condition=models.Q(exception_type='erp_only'),
                name='uniq_erp_only_exception_per_recon',
            ),
            models.UniqueConstraint(
                fields=['reconciliation', 'bank_transaction_id', 'loan_payment_id'],
                condition=models.Q(exception_type='amount_diff'),
                name='uniq_amount_diff_exception_per_recon',
            ),
        ]
        verbose_name        = 'Reconciliation Exception'
        verbose_name_plural = 'Reconciliation Exceptions'

    def __str__(self):
        return (
            f"{self.reconciliation} — {self.direction} {self.exception_type} "
            f"(bank={self.bank_amount}, erp={self.erp_amount})"
        )

    @property
    def amount_variance(self):
        """abs(bank_amount - erp_amount), or None when either side is missing
        (bank_only/erp_only exceptions have no counterpart amount to compare)."""
        if self.bank_amount is None or self.erp_amount is None:
            return None
        return abs(self.bank_amount - self.erp_amount)

    @property
    def is_perfect_match(self):
        """True only when both amounts are present and identical. The one case
        a branch manager may resolve without director sign-off."""
        variance = self.amount_variance
        return variance is not None and variance == 0

    @property
    def is_within_director_tolerance(self):
        """
        True when there's a nonzero amount variance small enough — whichever is
        smaller of AMOUNT_TOLERANCE_FIXED or AMOUNT_TOLERANCE_PERCENT of the ERP
        amount — that a director can resolve it without the resolution being
        treated as a large, unexplained mismatch. Always False for bank_only/
        erp_only exceptions (no counterpart amount at all) and for perfect
        matches (zero variance isn't a "tolerance" case). Directors can still
        resolve exceptions outside this tolerance; resolution_notes is just
        mandatory in that case to leave a paper trail.
        """
        variance = self.amount_variance
        if variance is None or variance == 0:
            return False
        tolerance = min(
            self.AMOUNT_TOLERANCE_FIXED,
            self.AMOUNT_TOLERANCE_PERCENT * self.erp_amount,
        )
        return variance <= tolerance

    @property
    def resolve_amount(self):
        """The amount relevant for the dual-approval threshold check —
        whichever of bank_amount/erp_amount is present. Both are set for
        amount_diff (they prefer bank_amount, the two are close by
        definition); only one is ever set for bank_only/erp_only."""
        return self.bank_amount if self.bank_amount is not None else self.erp_amount

    @property
    def requires_dual_approval_to_resolve(self):
        """
        True when a second director must confirm before this exception can
        actually close — resolve_amount at/above
        RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD (settings.py).

        Deliberately excludes perfect matches: those are already resolvable
        by a branch manager alone with no director involved at all (see
        is_perfect_match), so gating them behind two directors would be a
        far bigger workflow change than closing the gap this exists for —
        a director single-handedly waving away a genuine large discrepancy
        with one short note and no second opinion.
        """
        from django.conf import settings as django_settings

        if self.is_perfect_match:
            return False
        threshold = getattr(django_settings, 'RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD', None)
        if threshold is None or self.resolve_amount is None:
            return False
        return self.resolve_amount >= threshold

    @property
    def awaiting_second_resolution(self):
        """True once the first director has acted but a second director's
        confirmation is still outstanding — resolved stays False the whole
        time this is True, since the exception is genuinely still open."""
        return (
            not self.resolved
            and self.resolved_by_id is not None
            and self.requires_dual_approval_to_resolve
        )


# ── Bank Feed Transactions (Java App 3 write-back) ─────────────────────────

class BankFeedTransaction(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    A single bank transaction pulled from the client's bank via Java App 3
    (BankFeedReconciliationService) and written back to Django.

    Java App 3 calls POST /api/internal/banks/feed-transactions/bulk/ with
    a batch of transactions after each nightly reconciliation cycle.  Django
    stores them here and pre-populates the reconciliation screen.

    Match lifecycle:
        unmatched  → Java auto-matching tries to pair with an ERP transaction
        matched    → Paired successfully; matched_transaction is set
        exception  → Auto-matching failed; branch manager reviews manually
        ignored    → Deliberately excluded from reconciliation
    """
    MATCH_STATUS_CHOICES = [
        ('unmatched',  'Unmatched — awaiting auto-match'),
        ('matched',    'Matched — paired with ERP transaction'),
        ('exception',  'Exception — could not auto-match'),
        ('ignored',    'Ignored — excluded from reconciliation'),
    ]

    # The BankFeedConsent this transaction came through
    consent = models.ForeignKey(
        BankFeedConsent,
        on_delete=models.PROTECT,
        related_name='feed_transactions',
        help_text='BankFeedConsent record used to pull this transaction',
    )

    # The internal Phoenix bank account this reconciles against
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='feed_transactions',
        help_text='Internal Phoenix BankAccount this transaction belongs to',
    )

    # Transaction details as received from the bank
    transaction_date = models.DateField(db_index=True)
    value_date       = models.DateField(null=True, blank=True)
    amount           = models.DecimalField(max_digits=18, decimal_places=2)
    transaction_type = models.CharField(
        max_length=10,
        choices=[('credit', 'Credit'), ('debit', 'Debit')],
        db_index=True,
    )
    description      = models.TextField(blank=True)
    bank_reference   = models.CharField(
        max_length=100, blank=True, db_index=True,
        help_text='Reference/ID assigned by the bank',
    )
    # UUID assigned by Java App 3 — stable across retries
    java_transaction_id = models.UUIDField(
        unique=True,
        help_text='Stable UUID assigned by Java App 3 for idempotency',
    )

    # Match status
    match_status = models.CharField(
        max_length=15,
        choices=MATCH_STATUS_CHOICES,
        default='unmatched',
        db_index=True,
    )

    # If matched, the ERP transaction this pairs with
    matched_transaction = models.ForeignKey(
        'transactions.Transaction',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bank_feed_matches',
        help_text='ERP Transaction (GL journal entry) this feed transaction was matched to',
    )

    # How confident Java was about the match (0.0–1.0)
    confidence_score = models.DecimalField(
        max_digits=4, decimal_places=3,
        null=True, blank=True,
        help_text='Auto-match confidence score from Java (0.000–1.000)',
    )

    # Manual review
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_feed_transactions',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    objects     = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at']
        indexes = [
            models.Index(fields=['bank_account', 'match_status']),
            models.Index(fields=['transaction_date', 'match_status']),
            models.Index(fields=['java_transaction_id']),
        ]
        verbose_name        = 'Bank Feed Transaction'
        verbose_name_plural = 'Bank Feed Transactions'

    def __str__(self):
        return (
            f"{self.transaction_date} {self.transaction_type} ₦{self.amount} "
            f"[{self.match_status}] ref={self.bank_reference}"
        )
