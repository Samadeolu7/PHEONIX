# incomes/services/accounting_integration.py
"""
Accounting integration for income module
Creates journal entries for all income/payment transactions
Follows GAAP/IFRS double-entry bookkeeping standards

NOTE: This is DIRECT integration, not workflow-based, because:
1. Financial transactions MUST be atomic (same DB transaction)
2. GAAP/IFRS require immediate journal entries (not async)
3. Workflows can fail/be disabled - would break accounting integrity
4. Real-time financial reporting requires synchronous posting

Workflows are still used for:
- Approval processes (before creating transactions)
- Notifications (after transactions complete)
- Business logic (eligibility checks, discounts)
But NOT for creating the actual journal entries.
"""
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError
from accounts.utils.account_creation import get_or_create_child_account, get_system_account
from django.utils import timezone
from decimal import Decimal
import logging

from accounts.models import Account
from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries

logger = logging.getLogger(__name__)


class IncomeAccountingService:
    """
    Service for creating accounting entries for income transactions
    All methods follow double-entry bookkeeping principles
    
    Configuration-based approach:
    - Uses IncomeAccountingConfig for account mappings (no hardcoded lookups)
    - Supports per-branch configuration
    - Allows category-level overrides
    """
    
    @staticmethod
    def get_accounting_config(owner, branch=None):
        """
        Get accounting configuration for owner/branch
        Raises ValidationError if not configured
        """
        from incomes.models_config import IncomeAccountingConfig
        return IncomeAccountingConfig.get_config(owner, branch)
    
    @staticmethod
    def get_cash_account(owner, branch=None, payment_method='cash', income_category=None, user=None):
        """
        Get cash/bank account based on payment method and configuration

        If payment_method is 'cash' and user is provided, auto-creates a CashierAccount
        if one doesn't exist for that user.

        Priority:
        1. Income category override (if exists)
        2. Payment method-specific account from config
        3. Default cash account from config
        4. Auto-create cashier account for cash payments (even without config, using default 101)
        """
        # Try to get accounting config, but do NOT raise yet — fall back gracefully if missing
        config = None
        try:
            config = IncomeAccountingService.get_accounting_config(owner, branch)
        except Exception as config_error:
            owner_name = getattr(owner, 'username', str(owner))
            logger.warning(
                f"Income accounting config not found for {owner_name} — "
                f"using default accounts. Please configure GL accounts in "
                f"Settings > Income Configuration. Detail: {config_error}"
            )

        # Check for category override (requires config)
        if config and income_category and hasattr(income_category, 'account_override'):
            override = income_category.account_override
            if override.cash_account:
                return override.cash_account

        # For cash payments with a user, check/create cashier account
        if payment_method == 'cash' and user:
            from cash_management.models import CashierAccount

            # Check if user already has a cashier account
            cashier_account = CashierAccount.objects.filter(
                cashier=user,
                owner=owner,
                branch=branch,
                is_active=True,
                is_deleted=False
            ).first()

            if not cashier_account:
                # Determine parent cash GL account:
                # Use config if available, otherwise fall back to the default 101 / General Cash
                if config:
                    cash_gl_account = config.get_account_for_payment_method('cash')
                    parent_code = cash_gl_account.code
                    parent_name = cash_gl_account.name
                else:
                    parent_code = '1100'
                    parent_name = 'Cash and Cash Equivalents'
                    cash_gl_account = get_or_create_child_account(
                        parent_code='1100',
                        child_suffix='001',
                        name='Cash on Hand',
                        account_type='ASSET',
                        owner=owner,
                        branch=branch,
                        parent_name=parent_name
                    )

                # Create child account under the cash account
                cashier_gl_account = get_or_create_child_account(
                    parent_code=parent_code,
                    child_suffix=f'{user.id:03d}',
                    name=f'Cashier - {user.get_full_name() or user.username}',
                    account_type='ASSET',
                    owner=owner,
                    branch=branch,
                    parent_name=parent_name
                )

                # Generate unique account number
                last_account = CashierAccount.objects.filter(
                    owner=owner
                ).order_by('-account_number').first()

                if last_account and last_account.account_number.startswith('CASH-'):
                    try:
                        last_num = int(last_account.account_number.split('-')[1])
                        new_num = last_num + 1
                    except Exception:
                        new_num = 1
                else:
                    new_num = 1

                account_number = f'CASH-{new_num:04d}'

                # Create cashier account (tenant-aware + race-safe)
                try:
                    with transaction.atomic():
                        cashier_account = CashierAccount.objects.create(
                            cashier=user,
                            account=cashier_gl_account,
                            account_number=account_number,
                            name=f'Cashier - {user.get_full_name() or user.username}',
                            owner=owner,
                            branch=branch,
                            tenant=getattr(user, 'tenant', None),
                            created_by=user,
                            is_active=True
                        )
                    logger.info(f"Auto-created CashierAccount {account_number} for user {user.username}")
                except IntegrityError:
                    # A concurrent/previous create may already exist. Use base manager to
                    # bypass thread-local tenant filtering and recover the account.
                    cashier_account = CashierAccount._base_manager.filter(
                        cashier=user,
                        owner=owner,
                        branch=branch,
                        is_active=True,
                        is_deleted=False,
                    ).order_by('-id').first()
                    if not cashier_account:
                        raise
                    if not getattr(cashier_account, 'tenant_id', None) and getattr(user, 'tenant', None):
                        cashier_account.tenant = user.tenant
                        cashier_account.save(update_fields=['tenant'])

            # Return the cashier's GL account
            return cashier_account.account

        # Get account for payment method from config, or fall back to default cash account
        if config:
            return config.get_account_for_payment_method(payment_method)

        # Final fallback: no config, no user cashier — return/create general cash account
        return get_or_create_child_account(
            parent_code='1100',
            child_suffix='001',
            name='Cash on Hand',
            account_type='ASSET',
            owner=owner,
            branch=branch,
            parent_name='Cash and Cash Equivalents'
        )
    
    @staticmethod
    def get_ar_account(owner, branch=None, income_category=None):
        """
        Get Accounts Receivable account
        
        Priority:
        1. Income category override (if exists)
        2. Default AR account from config
        """
        config = IncomeAccountingService.get_accounting_config(owner, branch)
        
        # Check for category override
        if income_category and hasattr(income_category, 'account_override'):
            override = income_category.account_override
            if override.ar_account:
                return override.ar_account
        
        return config.default_ar_account
    
    @staticmethod
    @transaction.atomic
    def record_income_receipt(
        income,
        amount: Decimal,
        payment_method: str,
        user,
        bank_account: Account = None,
        notes: str = ''
    ) -> JournalEntry:
        """
        Record income receipt with proper accounting entries
        
        Accounting Treatment:
        - If full payment upfront:
          Dr. Cash/Bank Account (Asset)
          Cr. Income Account (Income)
        
        - If partial payment (creates receivable):
          Initial Invoice:
            Dr. Accounts Receivable (Asset)
            Cr. Income Account (Income)
          Payment:
            Dr. Cash/Bank Account (Asset)
            Cr. Accounts Receivable (Asset)
        
        Args:
            income: Income model instance
            amount: Amount received
            payment_method: Payment method (cash, bank, etc.)
            bank_account: GL account for cash/bank
            user: User recording the transaction
            notes: Additional notes
            
        Returns:
            JournalEntry: Created journal entry
        """
        # Get income account from category
        income_account = income.category.income_account
        
        # Get or create AR account (use child account)
        ar_account = get_or_create_child_account(
            parent_code='1110',
            child_suffix='001',
            name='Trade Debtors (Accounts Receivable)',
            account_type='ASSET',
            owner=income.owner,
            branch=income.branch,
            parent_name='Trade and Other Receivables'
        )

        # Determine if this is first time or payment
        is_first_record = income.amount_paid == 0
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='INC',
            defaults={'description': 'Income Transactions'}
        )

        # Resolve bank/cash account if not provided to avoid null account references
        if bank_account is None:
            try:
                bank_account = IncomeAccountingService.get_cash_account(
                    income.owner,
                    income.branch,
                    payment_method,
                    income_category=getattr(income, 'category', None),
                    user=user  # Pass user for auto-creation of cashier account
                )
            except Exception:
                bank_account = None

            if bank_account is None:
                # Final fallback: system default cash account
                bank_account = IncomeAccountingService.get_default_cash_account(
                    income.owner,
                    income.branch
                )
        
        if is_first_record and amount < income.amount:
            # Create receivable entry (invoice created)
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=income.income_date,
                description=f"Income: {income.description}",
                workflow_reference=income.reference_number,
                owner=income.owner,
                branch=income.branch,
                created_by=user
            )
            
            # Dr. Accounts Receivable
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=ar_account,
                side=JournalEntryLine.DEBIT,
                amount=income.amount,
            )
            
            # Cr. Income
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=income_account,
                side=JournalEntryLine.CREDIT,
                amount=income.amount,
            )
            
            # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
            journal_entry.post()
            
            # If partial payment received, create payment entry
            if amount > 0:
                _client = getattr(income, 'client', None)
                _client_label = _client.full_name if _client else ''
                _pmt_desc = (
                    f"Payment: {_client_label} - {income.reference_number}"
                    if _client_label else
                    f"Payment received for {income.reference_number}"
                )
                payment_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=_pmt_desc,
                    workflow_reference=f"{income.reference_number}-PMT",
                    owner=income.owner,
                    branch=income.branch,
                    created_by=user
                )
                
                # Dr. Cash/Bank
                JournalEntryLine.objects.create(
                    transaction=payment_entry,
                    account=bank_account,
                    side=JournalEntryLine.DEBIT,
                    amount=amount,
                )

                # Cr. Accounts Receivable
                JournalEntryLine.objects.create(
                    transaction=payment_entry,
                    account=ar_account,
                    side=JournalEntryLine.CREDIT,
                    amount=amount,
                )
                
                # POST THE PAYMENT ENTRY TO UPDATE ACCOUNT BALANCES
                payment_entry.post()
                
                return payment_entry
            
            return journal_entry
        
        elif is_first_record and amount == income.amount:
            # Full payment upfront - direct income recognition
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=income.income_date,
                description=f"Income: {income.description}",
                workflow_reference=income.reference_number,
                owner=income.owner,
                branch=income.branch,
                created_by=user
            )
            
            # Dr. Cash/Bank
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=bank_account,
                side=JournalEntryLine.DEBIT,
                amount=amount,
            )

            # Cr. Income Account
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=income_account,
                side=JournalEntryLine.CREDIT,
                amount=amount,
            )
            
            # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
            journal_entry.post()
            
            return journal_entry
        
        else:
            # Subsequent payment - reduce AR
            _client = getattr(income, 'client', None)
            _client_label = _client.full_name if _client else ''
            _sub_pmt_desc = (
                f"Payment: {_client_label} - {income.reference_number}"
                if _client_label else
                f"Payment for {income.reference_number}"
            )
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=timezone.now().date(),
                description=_sub_pmt_desc,
                workflow_reference=f"{income.reference_number}-PMT",
                owner=income.owner,
                branch=income.branch,
                created_by=user
            )
            
            # Dr. Cash/Bank
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=bank_account,
                side=JournalEntryLine.DEBIT,
                amount=amount,
            )

            # Cr. Accounts Receivable
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=ar_account,
                side=JournalEntryLine.CREDIT,
                amount=amount,
            )
            
            # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
            journal_entry.post()
            
            return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_inventory_redemption_cogs(
        entitlement,
        items_redeemed: list,
        user
    ):
        """
        Record COGS when inventory items are redeemed via entitlement
        
        Accounting Treatment:
        Dr. Cost of Goods Sold (Expense)
        Cr. Inventory Asset
        
        Args:
            entitlement: FeeEntitlement instance
            items_redeemed: List of {'item': InventoryItem, 'quantity': Decimal, 'cost': Decimal}
            user: User performing redemption
        """
        from inventory.models import InventoryItem
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='COGS',
            defaults={'description': 'Cost of Goods Sold'}
        )
        
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"COGS for entitlement redemption: {entitlement.id}",
            workflow_reference=f"ENT-{entitlement.id}-COGS",
            owner=entitlement.owner,
            branch=entitlement.branch,
            created_by=user
        )
        
        for item_data in items_redeemed:
            item = item_data['item']
            quantity = item_data['quantity']
            unit_cost = item_data['cost']
            total_cost = quantity * unit_cost
            
            # Get accounts from inventory category
            inventory_account = item.category.inventory_account
            cogs_account = item.category.cogs_account
            
            # Dr. COGS
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=cogs_account,
                side=JournalEntryLine.DEBIT,
                amount=total_cost,
            )

            # Cr. Inventory Asset
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=inventory_account,
                side=JournalEntryLine.CREDIT,
                amount=total_cost,
            )
        
        # POST THE JOURNAL ENTRY TO UPDATE ACCOUNT BALANCES
        journal_entry.post()
        
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def record_entitlement_payment(
        entitlement,
        amount: Decimal,
        payment_method: str,
        user,
        bank_account: Account = None,
        notes: str = ''
    ) -> JournalEntry:
        """
        Record payment for fee entitlement
        
        Accounting Treatment (similar to income):
        - First payment creates income recognition
        - Subsequent payments reduce AR
        
        Args:
            entitlement: FeeEntitlement instance
            amount: Payment amount
            payment_method: Payment method
            bank_account: Bank/cash GL account
            user: User recording payment
            notes: Additional notes
            
        Returns:
            JournalEntry: Created journal entry
        """
        # Get income account from fee structure
        income_account = entitlement.fee_structure.category.income_account
        
        # Get or create AR account (use child account)
        ar_account = get_or_create_child_account(
            parent_code='1110',
            child_suffix='001',
            name='Trade Debtors (Accounts Receivable)',
            account_type='ASSET',
            owner=entitlement.owner,
            branch=entitlement.branch,
            parent_name='Trade and Other Receivables'
        )
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='ENT',
            defaults={'description': 'Entitlement Payments'}
        )
        
        is_first_payment = entitlement.amount_paid == 0
        
        if is_first_payment:
            # Create initial income recognition (invoice)
            income_entry = JournalEntry.objects.create(
                series=series,
                date=entitlement.created_at.date(),
                description=f"Fee entitlement: {entitlement.fee_structure.name}",
                workflow_reference=f"ENT-{entitlement.id}",
                owner=entitlement.owner,
                branch=entitlement.branch,
                created_by=user
            )
            
            # Dr. AR
            JournalEntryLine.objects.create(
                transaction=income_entry,
                account=ar_account,
                side=JournalEntryLine.DEBIT,
                amount=entitlement.total_amount,
            )
            
            # Cr. Income
            JournalEntryLine.objects.create(
                transaction=income_entry,
                account=income_account,
                side=JournalEntryLine.CREDIT,
                amount=entitlement.total_amount,
            )
            
            # POST THE INCOME ENTRY TO UPDATE ACCOUNT BALANCES
            income_entry.post()
        
        # Ensure we have a bank/cash account to post the payment to
        if bank_account is None:
            # Try configured cash account for this payment method or income category
            try:
                bank_account = IncomeAccountingService.get_cash_account(
                    entitlement.owner,
                    entitlement.branch,
                    payment_method,
                    income_category=getattr(entitlement.fee_structure, 'category', None),
                    user=user  # Pass user for auto-creation of cashier account
                )
            except Exception:
                bank_account = None

            # Fallback to system default cash account
            if bank_account is None:
                bank_account = IncomeAccountingService.get_default_cash_account(
                    entitlement.owner,
                    entitlement.branch
                )

        # Record payment
        _ent_client = getattr(entitlement, 'client', None)
        _ent_client_label = _ent_client.full_name if _ent_client else ''
        _ent_pmt_desc = (
            f"Payment: {_ent_client_label} - {entitlement.fee_structure.name}"
            if _ent_client_label else
            f"Payment for entitlement {entitlement.id}"
        )
        payment_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=_ent_pmt_desc,
            workflow_reference=f"ENT-{entitlement.id}-PMT",
            owner=entitlement.owner,
            branch=entitlement.branch,
            created_by=user
        )
        
        JournalEntryLine.objects.create(
            transaction=payment_entry,
            account=bank_account,
            side=JournalEntryLine.DEBIT,
            amount=amount,
        )

        # Cr. AR
        JournalEntryLine.objects.create(
            transaction=payment_entry,
            account=ar_account,
            side=JournalEntryLine.CREDIT,
            amount=amount,
        )
        
        # POST THE PAYMENT ENTRY TO UPDATE ACCOUNT BALANCES
        payment_entry.post()
        
        return payment_entry
    
    @staticmethod
    def get_default_cash_account(owner, branch):
        """Get default cash account using centralized utility"""
        return get_system_account('cash', owner, branch)
