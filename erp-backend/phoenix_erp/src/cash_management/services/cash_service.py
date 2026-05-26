# cash_management/services/cash_service.py
"""
Business logic for cash collection and custody management
"""
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal
import logging

from cash_management.models import (
    CashierAccount, CashCollection, CashTransfer, CashReconciliation
)
from accounts.models import Account

logger = logging.getLogger(__name__)


class CashCollectionService:
    """Service for handling cash collections"""
    
    @staticmethod
    @transaction.atomic
    def record_collection(
        cashier_account,
        client,
        amount_due,
        amount_collected,
        payment_purpose,
        user,
        collection_date=None,
        receipt_number=None,
        notes='',
        collection_mode='cash',
        credit_account=None
    ):
        """
        Record cash collection from a client
        
        Args:
            cashier_account: CashierAccount instance
            client: Client who paid
            amount_due: Expected amount
            amount_collected: Actual amount received
            payment_purpose: What the payment is for
            user: User recording the collection
            collection_date: Date of collection (defaults to today)
            receipt_number: Receipt number (auto-generated if not provided)
            credit_account: Account to credit (e.g., Income, Loan Receivable)
        
        Returns:
            CashCollection instance
        """
        # Validate cashier is active
        if not cashier_account.is_active or cashier_account.is_suspended:
            raise ValidationError("Cashier account is not active")
        
        # Check daily limit
        if cashier_account.daily_collection_limit:
            today_collections = cashier_account.get_daily_collections()
            if today_collections + amount_collected > cashier_account.daily_collection_limit:
                raise ValidationError(
                    f"Collection exceeds daily limit. "
                    f"Limit: {cashier_account.daily_collection_limit}, "
                    f"Today's collections: {today_collections}, "
                    f"This collection: {amount_collected}"
                )
        
        # Generate receipt number if not provided
        if not receipt_number:
            receipt_number = CashCollectionService._generate_receipt_number(
                cashier_account.branch
            )
        
        collection_date = collection_date or timezone.now().date()
        
        # Create collection record
        collection = CashCollection.objects.create(
            cashier_account=cashier_account,
            client=client,
            receipt_number=receipt_number,
            collection_date=collection_date,
            amount_due=amount_due,
            amount_collected=amount_collected,
            payment_purpose=payment_purpose,
            notes=notes,
            collection_mode=collection_mode,
            owner=user,
            branch=cashier_account.branch,
            created_by=user
        )
        
        # Determine variance action
        if collection.variance > 0:
            # Overpayment - default to savings
            collection.variance_action = 'savings'
        elif collection.variance < 0:
            # Underpayment - default to debt
            collection.variance_action = 'debt'
        
        collection.save(update_fields=['variance_action'])
        
        # Post to accounts
        if credit_account:
            CashCollectionService._post_collection(collection, credit_account, user)
        
        logger.info(
            f"Recorded cash collection: {receipt_number}, "
            f"Amount: {amount_collected}, "
            f"Cashier: {cashier_account.name}"
        )
        
        return collection
    
    @staticmethod
    def _generate_receipt_number(branch):
        """Generate unique receipt number"""
        from django.db.models import Max
        
        today = timezone.now().date()
        prefix = f"RCT-{branch.code}-{today.strftime('%Y%m%d')}"
        
        last_receipt = CashCollection.objects.filter(
            receipt_number__startswith=prefix
        ).aggregate(Max('receipt_number'))['receipt_number__max']
        
        if last_receipt:
            last_num = int(last_receipt.split('-')[-1])
            new_num = last_num + 1
        else:
            new_num = 1
        
        return f"{prefix}-{new_num:04d}"
    
    @staticmethod
    @transaction.atomic
    def _post_collection(collection, credit_account, user):
        """
        Post collection to accounts
        
        Journal Entry:
        DR: Cashier Account (asset increase)
        CR: Income/Receivable/etc (depends on payment purpose)
        """
        from transactions.models import Transaction, TransactionEntry, TransactionSeries
        
        series, _ = TransactionSeries.objects.get_or_create(
            code='CSHCL',
            defaults={'description': 'Cash Collections'}
        )
        
        journal_entry = Transaction.objects.create(
            series=series,
            date=collection.collection_date,
            description=f"Cash collection: {collection.payment_purpose} - {collection.client.full_name}",
            workflow_reference=collection.receipt_number,
            owner=collection.owner,
            branch=collection.branch,
            created_by=user
        )
        
        # Debit: Cashier Account (asset increase)
        debit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=collection.cashier_account.account,
            side=TransactionEntry.DEBIT,
            amount=collection.amount_collected
        )
        
        # Credit: Credit account (income/receivable reduction)
        credit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=credit_account,
            side=TransactionEntry.CREDIT,
            amount=collection.amount_collected
        )
        
        # Validate and post entries atomically
        journal_entry.full_clean()
        Account.objects.select_for_update().filter(pk__in=[collection.cashier_account.account.pk, credit_account.pk])
        debit_entry.post()
        credit_entry.post()
        
        # Update cashier balance from posted account balance (do not directly mutate)
        collection.cashier_account.account.refresh_from_db()
        collection.cashier_account.current_balance = collection.cashier_account.account.balance
        collection.cashier_account.save(update_fields=['current_balance'])
        
        # Mark as posted
        collection.journal_entry = journal_entry
        collection.is_posted = True
        collection.posted_at = timezone.now()
        collection.posted_by = user
        collection.save(update_fields=['journal_entry', 'is_posted', 'posted_at', 'posted_by'])
        
        return journal_entry


class CashTransferService:
    """Service for handling cash transfers to main bank"""
    
    @staticmethod
    @transaction.atomic
    def initiate_transfer(
        cashier_account,
        destination_account,
        amount,
        user,
        transfer_date=None,
        bank_deposit_slip='',
        notes=''
    ):
        """
        Initiate cash transfer from cashier to main bank
        
        Args:
            cashier_account: CashierAccount to transfer from
            destination_account: Bank account to transfer to
            amount: Amount to transfer
            user: User initiating transfer
            transfer_date: Date of transfer
            bank_deposit_slip: Bank deposit slip number
            notes: Additional notes
        
        Returns:
            CashTransfer instance in 'draft' status
        """
        # Validate sufficient balance
        if amount > cashier_account.current_balance:
            raise ValidationError(
                f"Insufficient balance. "
                f"Available: {cashier_account.current_balance}, "
                f"Requested: {amount}"
            )
        
        # Generate transfer number
        transfer_number = CashTransferService._generate_transfer_number(
            cashier_account.branch
        )
        
        transfer_date = transfer_date or timezone.now().date()
        
        # Create transfer record
        transfer = CashTransfer.objects.create(
            cashier_account=cashier_account,
            destination_account=destination_account,
            transfer_number=transfer_number,
            transfer_date=transfer_date,
            amount=amount,
            bank_deposit_slip=bank_deposit_slip,
            notes=notes,
            status='draft',
            owner=user,
            branch=cashier_account.branch,
            created_by=user
        )
        
        logger.info(
            f"Initiated cash transfer: {transfer_number}, "
            f"Amount: {amount}, "
            f"Cashier: {cashier_account.name}"
        )
        
        return transfer
    
    @staticmethod
    def _generate_transfer_number(branch):
        """Generate unique transfer number"""
        from django.db.models import Max
        
        today = timezone.now().date()
        prefix = f"TRF-{branch.code}-{today.strftime('%Y%m%d')}"
        
        last_transfer = CashTransfer.objects.filter(
            transfer_number__startswith=prefix
        ).aggregate(Max('transfer_number'))['transfer_number__max']
        
        if last_transfer:
            last_num = int(last_transfer.split('-')[-1])
            new_num = last_num + 1
        else:
            new_num = 1
        
        return f"{prefix}-{new_num:04d}"
    
    @staticmethod
    @transaction.atomic
    def bulk_transfer(cashier_account, destination_account, user):
        """
        Transfer entire cashier balance to bank
        Convenience method for end-of-day transfers
        """
        if cashier_account.current_balance <= 0:
            raise ValidationError("No balance to transfer")
        
        return CashTransferService.initiate_transfer(
            cashier_account=cashier_account,
            destination_account=destination_account,
            amount=cashier_account.current_balance,
            user=user,
            notes="End of day bulk transfer"
        )


class CashReconciliationService:
    """Service for daily cash reconciliation"""
    
    @staticmethod
    @transaction.atomic
    def perform_reconciliation(
        cashier_account,
        physical_count,
        user,
        reconciliation_date=None,
        denomination_details=None,
        notes=''
    ):
        """
        Perform daily cash reconciliation
        
        Args:
            cashier_account: CashierAccount to reconcile
            physical_count: Actual cash counted
            user: User performing reconciliation
            reconciliation_date: Date of reconciliation
            denomination_details: Breakdown by currency denomination
            notes: Additional notes
        
        Returns:
            CashReconciliation instance
        """
        reconciliation_date = reconciliation_date or timezone.now().date()
        system_balance = cashier_account.current_balance
        
        # Get day's statistics
        collections = cashier_account.cash_collections.filter(
            collection_date=reconciliation_date,
            is_posted=True
        )
        
        transfers = cashier_account.cash_transfers.filter(
            transfer_date=reconciliation_date,
            status='posted'
        )
        
        total_collections = sum(c.amount_collected for c in collections) or Decimal('0.00')
        total_transfers = sum(t.amount for t in transfers) or Decimal('0.00')
        
        # Create reconciliation record
        reconciliation = CashReconciliation.objects.create(
            cashier_account=cashier_account,
            reconciliation_date=reconciliation_date,
            system_balance=system_balance,
            physical_count=physical_count,
            total_collections=total_collections,
            total_transfers=total_transfers,
            denomination_details=denomination_details or {},
            reconciled_by=user,
            notes=notes,
            owner=user,
            branch=cashier_account.branch,
            created_by=user
        )
        
        # Update cashier account
        cashier_account.last_reconciled_at = timezone.now()
        cashier_account.last_reconciled_by = user
        cashier_account.save(update_fields=['last_reconciled_at', 'last_reconciled_by'])
        
        logger.info(
            f"Reconciliation completed: {cashier_account.name}, "
            f"Date: {reconciliation_date}, "
            f"Variance: {reconciliation.variance}"
        )
        
        return reconciliation
    
    @staticmethod
    def get_pending_reconciliations(branch, date=None):
        """Get cashier accounts that need reconciliation"""
        date = date or timezone.now().date()
        
        # Find accounts that haven't been reconciled today
        accounts = CashierAccount.objects.filter(
            branch=branch,
            is_active=True,
            is_suspended=False
        )
        
        pending = []
        for account in accounts:
            last_recon = account.reconciliations.filter(
                reconciliation_date=date
            ).first()
            
            if not last_recon and account.has_outstanding_balance():
                pending.append(account)
        
        return pending


class CashierAccountService:
    """Service for managing cashier accounts"""
    
    @staticmethod
    def get_cashier_summary(cashier_account, date=None):
        """
        Get summary of cashier account activity
        
        Returns:
            dict with collections, transfers, balance, etc.
        """
        date = date or timezone.now().date()
        
        # Collections
        collections = cashier_account.cash_collections.filter(
            collection_date=date,
            is_posted=True
        )
        
        total_collections = sum(c.amount_collected for c in collections) or Decimal('0.00')
        collection_count = collections.count()
        
        # Transfers
        transfers = cashier_account.cash_transfers.filter(
            transfer_date=date
        )
        
        pending_transfers = transfers.filter(status='pending')
        approved_transfers = transfers.filter(status__in=['approved', 'posted'])
        
        total_pending = sum(t.amount for t in pending_transfers) or Decimal('0.00')
        total_transferred = sum(t.amount for t in approved_transfers) or Decimal('0.00')
        
        # Reconciliation status
        last_recon = cashier_account.reconciliations.filter(
            reconciliation_date=date
        ).first()
        
        return {
            'cashier_account': cashier_account,
            'date': date,
            'current_balance': cashier_account.current_balance,
            'collections': {
                'count': collection_count,
                'total_amount': total_collections,
                'details': collections
            },
            'transfers': {
                'pending_count': pending_transfers.count(),
                'pending_amount': total_pending,
                'transferred_count': approved_transfers.count(),
                'transferred_amount': total_transferred,
                'pending_details': pending_transfers,
                'transferred_details': approved_transfers
            },
            'reconciliation': {
                'completed': last_recon is not None,
                'details': last_recon
            },
            'requires_reconciliation': cashier_account.has_outstanding_balance(),
            'daily_limit': cashier_account.daily_collection_limit,
            'limit_remaining': (
                cashier_account.daily_collection_limit - total_collections
                if cashier_account.daily_collection_limit
                else None
            )
        }
