"""
Cash/Bank Payment Routing Service

Handles routing of payments to appropriate cash management accounts based on payment method.
Ensures proper integration with treasury management workflow.
"""
from decimal import Decimal
from typing import Optional, TYPE_CHECKING
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from accounts.models import Account
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine
from cash_management.models import CashierAccount, CashCollection
from cash_management.services.cash_service import CashCollectionService

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser as User
else:
    User = get_user_model()


class PaymentRoutingService:
    """
    Service to route payments to correct cash/bank accounts and create proper GL entries.
    
    Business Rules:
    - Cash payments → Route to CashierAccount → Daily reconciliation required
    - Bank/Card payments → Route directly to Bank Account → Bank reconciliation
    - All payments create proper double-entry journal entries
    - Auto-creates cashier accounts for users recording cash payments
    """
    
    CASH_PAYMENT_METHODS = ['cash', 'mobile_money']
    BANK_PAYMENT_METHODS = ['bank_transfer', 'check', 'credit_card', 'online']

    @staticmethod
    def _is_director(user: User) -> bool:
        """Return True when user has any active role containing 'director'."""
        try:
            return user.roles.filter(is_active=True, name__icontains='director').exists()
        except Exception:
            return False
    
    @staticmethod
    def get_or_create_cashier_account(user: User) -> CashierAccount:
        """
        Get existing cashier account for user or auto-create one.
        
        This ensures every user recording a cash payment has a cashier account
        to hold the payment.
        
        Args:
            user: User who needs a cashier account
            
        Returns:
            CashierAccount instance for the user
        """
        # Try to find existing active cashier account for this user
        cashier_account = CashierAccount.objects.filter(
            cashier=user,
            is_active=True,
            is_suspended=False
        ).first()
        
        if cashier_account:
            return cashier_account
        
        # Auto-create cashier account for this user
        from accounts.models import Account
        
        branch = user.branch if hasattr(user, 'branch') else None
        tenant = getattr(user, 'tenant', None)

        # Generate unique account number
        existing_count = CashierAccount.objects.filter(
            account_number__startswith='CASH-'
        ).count()
        account_number = f"CASH-{str(existing_count + 1).zfill(4)}"

        # Find or create parent "Cash and Cash Equivalents" GL account (4-digit FIRS scheme).
        # Filter by tenant+branch (matching the unique constraint) not by owner, because the
        # parent account may have been created by a different user (e.g. system admin).
        parent_account, _ = Account.objects.get_or_create(
            code='1100',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            tenant=tenant,
            branch=branch,
            defaults={
                'name': 'Cash and Cash Equivalents',
                'owner': user,
                'allow_manual_entries': False,
                'is_system_account': True,
            }
        )

        # Generate child account code using 4-digit scheme (1101, 1102, …).
        # Count by tenant+branch so codes from other owners are included, avoiding collisions.
        existing_children = Account.objects.filter(
            parent=parent_account,
            tenant=tenant,
            branch=branch
        ).count()
        parent_int = int(parent_account.code)
        seq = existing_children + 1
        child_code = str(parent_int + seq)
        while Account.objects.filter(tenant=tenant, branch=branch, code=child_code).exists():
            seq += 1
            child_code = str(parent_int + seq)

        # Create child GL account
        child_account = Account.objects.create(
            code=child_code,
            name=f"{user.get_full_name() or user.username} - Cash Account",
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=parent_account,
            owner=user,
            tenant=tenant,
            branch=branch,
            allow_manual_entries=True,
            is_cashier_bank=True
        )
        
        # Create cashier account
        cashier_account = CashierAccount.objects.create(
            account_number=account_number,
            name=f"{user.get_full_name() or user.username} - Cashier",
            cashier=user,
            account=child_account,
            branch=branch,
            is_active=True,
            requires_dual_approval=False
        )
        
        return cashier_account

    @staticmethod
    def resolve_cashier_gl_account(
        user: User,
        *,
        owner=None,
        branch=None,
        cashier_account_id: Optional[int] = None,
    ) -> Account:
        """
        Resolve the GL ASSET account to use for cash-collected postings.

        Resolution order:
        1. Explicit cashier_account_id (if supplied)
        2. User cashier account (auto-created when missing)
        """
        if cashier_account_id:
            own_cashier = CashierAccount.objects.filter(
                cashier=user,
                is_active=True,
                is_suspended=False
            ).first()
            own_gl_account_id = own_cashier.account_id if own_cashier else None

            filters = {
                'pk': cashier_account_id,
                'account_type': Account.ASSET,
            }
            # Scope by tenant only.  The cashier GL account belongs to the teller
            # (request.user), not to loan.owner or client.owner — filtering by
            # owner/branch from the loan would silently exclude the teller's own
            # account when the loan was created by a different user (e.g. import admin).
            tenant = getattr(user, 'tenant', None)
            if tenant is not None:
                filters['tenant'] = tenant

            try:
                explicit_account = Account.objects.get(**filters)
            except Account.DoesNotExist as exc:
                raise ValidationError('Cashier account not found.') from exc

            # Non-directors cannot post into another staff member's cashier GL account.
            if (
                explicit_account.id != own_gl_account_id
                and not PaymentRoutingService._is_director(user)
            ):
                raise ValidationError(
                    'Only directors may use another staff cashier account. '
                    'Use your own cashier account instead.'
                )

            return explicit_account

        cashier = PaymentRoutingService.get_or_create_cashier_account(user)
        if cashier and cashier.account:
            return cashier.account

        raise ValidationError(
            'Unable to resolve cashier account automatically. '
            'Please configure a cashier account for this user.'
        )

    @staticmethod
    def resolve_bank_gl_account(bank_account_id) -> Account:
        """
        Resolve the GL ASSET account behind a bank_account_id for bank_transfer /
        mobile_money payments.

        bank_account_id must reference an active banks.BankAccount, NOT a raw
        accounts.Account pk. Looking up accounts.Account directly would accept
        any GL account (including parent/liability/income accounts), letting a
        payment post as if cash landed somewhere it never did.
        """
        from banks.models import BankAccount

        try:
            bank_account = BankAccount.objects.get(
                pk=bank_account_id, is_active=True, is_suspended=False,
            )
        except BankAccount.DoesNotExist as exc:
            raise ValidationError('Bank account not found or is not active.') from exc

        if not bank_account.gl_account_id:
            raise ValidationError(
                f'Bank account {bank_account.pk} has no linked GL account configured.'
            )

        return bank_account.gl_account

    @staticmethod
    def determine_payment_route(payment_method: str) -> str:
        """
        Determine if payment should go to cash or bank
        
        Args:
            payment_method: Payment method (cash, bank_transfer, etc.)
            
        Returns:
            'cash' or 'bank'
        """
        if payment_method in PaymentRoutingService.CASH_PAYMENT_METHODS:
            return 'cash'
        elif payment_method in PaymentRoutingService.BANK_PAYMENT_METHODS:
            return 'bank'
        else:
            # Default to cash for unknown methods
            return 'cash'
    
    @staticmethod
    @transaction.atomic
    def record_cash_payment(
        amount: Decimal,
        payment_date,
        payment_method: str,
        cashier_account: CashierAccount,
        client,
        reference_number: str,
        description: str,
        user: User,
        ar_account: Account,
        notes: str = ''
    ) -> tuple[JournalEntry, CashCollection]:
        """
        Record a cash payment through cashier account
        
        This creates:
        1. Cash collection record
        2. Journal entry: Dr. Cashier Account, Cr. AR
        3. Posts the cash collection to GL
        
        Args:
            amount: Payment amount
            payment_date: Date of payment
            payment_method: Payment method
            cashier_account: CashierAccount to receive payment
            client: Client making payment
            reference_number: Payment reference
            description: Payment description
            user: User recording the payment
            ar_account: Accounts Receivable account
            notes: Additional notes
            
        Returns:
            tuple of (JournalEntry, CashCollection)
        """
        # Create cash collection using existing service
        # Note: The service expects amount_due and amount_collected
        cash_collection = CashCollectionService.record_collection(
            cashier_account=cashier_account,
            client=client,
            amount_due=amount,
            amount_collected=amount,
            payment_purpose=description,
            user=user,
            collection_date=payment_date,
            receipt_number=reference_number,
            notes=notes,
            collection_mode=payment_method,
            credit_account=ar_account  # This will post to GL automatically
        )
        
        # Get the journal entry from the collection
        journal_entry = cash_collection.journal_entry
        
        return journal_entry, cash_collection
    
    @staticmethod
    @transaction.atomic
    def record_bank_payment(
        amount: Decimal,
        payment_date,
        payment_method: str,
        bank_account,
        reference_number: str,
        description: str,
        user: User,
        ar_account: Account,
        branch=None
    ) -> JournalEntry:
        """
        Record a bank payment directly to a bank account.

        Creates a journal entry:  Dr. Bank GL Account  |  Cr. AR

        Args:
            bank_account: Either a ``banks.BankAccount`` instance (preferred) or a
                          raw GL ``accounts.Account`` object (legacy).  When a
                          ``BankAccount`` is supplied its ``gl_account`` is used
                          automatically so the GL ledger stays linked to the
                          correct bank account for reconciliation.
        """
        from transactions.models import TransactionSeries, TransactionEntry

        # Resolve to the GL Account regardless of what was passed in
        try:
            from banks.models import BankAccount as BankAccountModel
            if isinstance(bank_account, BankAccountModel):
                gl_account = bank_account.gl_account
                if gl_account is None:
                    raise ValueError(
                        f"BankAccount {bank_account.account_number} has no linked GL account. "
                        "Save the bank account first to auto-create one."
                    )
            else:
                gl_account = bank_account  # Legacy: raw Account passed directly
        except ImportError:
            gl_account = bank_account

        # Get or create series for payments
        series, _ = TransactionSeries.objects.get_or_create(
            code='BKPMT',
            defaults={'description': 'Bank Payments'}
        )

        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=payment_date,
            description=description,
            workflow_reference=reference_number,
            owner=user,
            branch=branch or user.branch,
            created_by=user
        )

        # Dr. Bank GL Account
        debit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=gl_account,
            side=TransactionEntry.DEBIT,
            amount=amount
        )

        # Cr. Accounts Receivable
        credit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=ar_account,
            side=TransactionEntry.CREDIT,
            amount=amount
        )

        # Validate and post entries
        journal_entry.full_clean()
        Account.objects.select_for_update().filter(pk__in=[gl_account.pk, ar_account.pk])
        debit_entry.post()
        credit_entry.post()

        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def route_payment(
        amount: Decimal,
        payment_date,
        payment_method: str,
        client,
        reference_number: str,
        description: str,
        user: User,
        ar_account: Account,
        cashier_account: Optional[CashierAccount] = None,
        bank_account=None,   # BankAccount (preferred) or raw Account (legacy)
        notes: str = ''
    ) -> dict:
        """
        Main routing function - routes payment to cash or bank based on method
        
        Auto-creates cashier accounts for cash payments if not provided.
        
        Args:
            amount: Payment amount
            payment_date: Date of payment
            payment_method: Payment method
            client: Client making payment
            reference_number: Payment reference
            description: Payment description
            user: User recording the payment
            ar_account: Accounts Receivable account
            cashier_account: Optional cashier account for cash payments (auto-created if not provided)
            bank_account: Optional bank account for bank payments
            notes: Additional notes
            
        Returns:
            dict with journal_entry, route ('cash' or 'bank'), and optional cash_collection
            
        Raises:
            ValueError: If bank account not provided for bank payments
        """
        route = PaymentRoutingService.determine_payment_route(payment_method)
        
        if route == 'cash':
            # Cash payment - auto-create or get cashier account if not provided
            auto_created = False
            if not cashier_account:
                # Auto-create cashier account for the user recording the payment
                cashier_account = PaymentRoutingService.get_or_create_cashier_account(user)
                auto_created = True
            
            journal_entry, cash_collection = PaymentRoutingService.record_cash_payment(
                amount=amount,
                payment_date=payment_date,
                payment_method=payment_method,
                cashier_account=cashier_account,
                client=client,
                reference_number=reference_number,
                description=description,
                user=user,
                ar_account=ar_account,
                notes=notes
            )
            
            message = f'Cash payment recorded to cashier account: {cashier_account.account_number}'
            if auto_created:
                message += f' (Cashier account auto-created for {user.get_full_name() or user.username})'
            
            return {
                'journal_entry': journal_entry,
                'route': 'cash',
                'cash_collection': cash_collection,
                'cashier_account': cashier_account,
                'auto_created': auto_created,
                'message': message
            }
        
        else:  # route == 'bank'
            # Bank payment - must have bank account
            if not bank_account:
                raise ValueError(
                    f"Bank account required for {payment_method} payments. "
                    f"Please select a bank account to receive this payment."
                )
            
            journal_entry = PaymentRoutingService.record_bank_payment(
                amount=amount,
                payment_date=payment_date,
                payment_method=payment_method,
                bank_account=bank_account,
                reference_number=reference_number,
                description=description,
                user=user,
                ar_account=ar_account,
                branch=user.branch
            )
            
            return {
                'journal_entry': journal_entry,
                'route': 'bank',
                'bank_account': bank_account,
                'message': f'Bank payment recorded to account: {getattr(bank_account, "account_number", None) or getattr(bank_account, "name", str(bank_account))}'
            }
    
    @staticmethod
    def get_default_cashier_account(user: User) -> Optional[CashierAccount]:
        """Get default active cashier account for user"""
        return CashierAccount.objects.filter(
            cashier=user,
            is_active=True
        ).first()
    
    @staticmethod
    def get_default_bank_account(user: User, branch=None):
        """
        Get the default active BankAccount for this branch/organisation.

        Returns a ``banks.BankAccount`` instance (preferred for reconciliation) or
        falls back to the GL Account 1103 when no BankAccount record exists yet.
        """
        effective_branch = branch or getattr(user, 'branch', None)

        # Preferred: return a proper BankAccount so the GL link is known
        try:
            from banks.models import BankAccount as BankAccountModel
            bank_acct = BankAccountModel.objects.filter(
                is_active=True,
                is_suspended=False,
                branch=effective_branch,
            ).order_by('-is_primary_for_invoices', 'created_at').first()
            if bank_acct:
                return bank_acct
        except Exception:
            pass

        # Legacy fallback: raw GL account 1103 (generic COA) → then KTIL microfinance
        # bank/cash codes (1002 MoniePoint, 1003 First Bank, 1004 First Bank Orimerunmu,
        # 1001 Cash In Hand) → then any ASSET account with "bank" in the name.
        return (
            Account.objects.filter(
                code='1103',
                account_type='ASSET',
                branch=effective_branch,
            ).first()
            or Account.objects.filter(
                code__in=['1002', '1003', '1004', '1001'],
                account_type='ASSET',
                branch=effective_branch,
            ).order_by('code').first()
            or Account.objects.filter(
                account_type='ASSET',
                name__icontains='bank',
                branch=effective_branch,
            ).first()
        )
