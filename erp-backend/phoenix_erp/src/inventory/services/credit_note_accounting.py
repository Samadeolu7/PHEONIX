"""
Credit Note Accounting Service

Handles all accounting operations for credit notes including:
- Journal entries for credit application
- Customer balance updates
- Credit reversal
- Stock return accounting
"""

from decimal import Decimal
from django.db import transaction, models
from django.utils import timezone
from django.core.exceptions import ValidationError

from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
from accounts.models import Account
from accounts.utils.account_creation import get_or_create_child_account
from inventory.models_credit_note import CreditNote, CreditNoteItem


class CreditNoteAccountingService:
    """Service for credit note accounting operations"""
    
    def __init__(self, credit_note):
        """
        Initialize service with credit note
        
        Args:
            credit_note: CreditNote instance
        """
        self.credit_note = credit_note
    
    @transaction.atomic
    def apply_credit_to_account(self, applied_by, notes=None):
        """
        Apply credit note to customer account
        
        Creates journal entry:
        DR: Sales Returns (or Revenue Reversal)
        CR: Accounts Receivable
        
        Args:
            applied_by: User applying the credit
            notes: Optional notes
            
        Returns:
            JournalEntry: Created journal entry
            
        Raises:
            ValidationError: If credit cannot be applied
        """
        # Validate
        if not self.credit_note.can_be_applied:
            raise ValidationError(
                f"Credit note {self.credit_note.credit_note_number} cannot be applied. "
                f"Status: {self.credit_note.status}"
            )
        
        # Get accounts
        sales_returns_account = self._get_sales_returns_account()
        accounts_receivable = self._get_accounts_receivable()
        
        # Get or create transaction series for credit notes
        series, _ = TransactionSeries.objects.get_or_create(
            code='CN',
            defaults={'description': 'Credit Notes'}
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Credit Note Applied: {self.credit_note.credit_note_number} - {self.credit_note.reason}",
            workflow_reference=self.credit_note.credit_note_number,
            branch=self.credit_note.branch,
            owner=self.credit_note.owner
        )
        
        # DR: Sales Returns
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=sales_returns_account,
            side=JournalEntryLine.DEBIT,
            amount=self.credit_note.total_amount
        )
        
        # CR: Accounts Receivable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=accounts_receivable,
            side=JournalEntryLine.CREDIT,
            amount=self.credit_note.total_amount
        )
        
        # Post the transaction
        journal_entry.post()
        
        # Update credit note status
        self.credit_note.applied_to_account = True
        self.credit_note.applied_date = timezone.now()
        self.credit_note.applied_by = applied_by
        self.credit_note.status = 'applied'
        self.credit_note.save()
        
        # Return stock if applicable
        self._return_items_to_stock()
        
        return journal_entry
    
    @transaction.atomic
    def reverse_credit(self, reversed_by, reversal_reason):
        """
        Reverse an applied credit note
        
        Creates reversing journal entry:
        DR: Accounts Receivable
        CR: Sales Returns
        
        Args:
            reversed_by: User reversing the credit
            reversal_reason: Reason for reversal
            
        Returns:
            JournalEntry: Reversal journal entry
            
        Raises:
            ValidationError: If credit cannot be reversed
        """
        # Validate
        if not self.credit_note.applied_to_account:
            raise ValidationError("Credit note has not been applied")
        
        if self.credit_note.reversed:
            raise ValidationError("Credit note has already been reversed")
        
        # Get accounts
        sales_returns_account = self._get_sales_returns_account()
        accounts_receivable = self._get_accounts_receivable()
        
        # Get transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='CN',
            defaults={'description': 'Credit Notes'}
        )
        
        # Create reversal journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Credit Note Reversal: {self.credit_note.credit_note_number}",
            workflow_reference=f"{self.credit_note.credit_note_number}-REV",
            branch=self.credit_note.branch,
            owner=self.credit_note.owner,
            is_reversal=True
        )
        
        # DR: Accounts Receivable (restore customer balance)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=accounts_receivable,
            side=JournalEntryLine.DEBIT,
            amount=self.credit_note.total_amount
        )
        
        # CR: Sales Returns
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=sales_returns_account,
            side=JournalEntryLine.CREDIT,
            amount=self.credit_note.total_amount
        )
        
        # Post the transaction
        journal_entry.post()
        
        # Update credit note
        self.credit_note.reversed = True
        self.credit_note.reversed_date = timezone.now()
        self.credit_note.reversed_by = reversed_by
        self.credit_note.reversal_reason = reversal_reason
        self.credit_note.save()
        
        # Reverse stock returns if applicable
        self._reverse_stock_returns()
        
        return journal_entry
    
    def _return_items_to_stock(self):
        """Return items to inventory if applicable"""
        for item in self.credit_note.items.all():
            if item.can_return_to_stock and not item.stock_returned:
                # Get inventory item
                inventory_item = item.item
                
                if inventory_item:
                    # Increase stock quantity
                    inventory_item.quantity_in_stock += item.quantity_returned
                    inventory_item.save()
                    
                    # Mark as returned
                    item.stock_returned = True
                    item.save()
                    
                    # Create stock movement record
                    from inventory.models import StockMovement
                    StockMovement.objects.create(
                        inventory_item=inventory_item,
                        movement_type='return',
                        quantity=item.quantity_returned,
                        reference_number=self.credit_note.credit_note_number,
                        notes=f"Return from credit note {self.credit_note.credit_note_number}",
                        branch=self.credit_note.branch,
                        owner=self.credit_note.owner,
                        created_by=self.credit_note.applied_by
                    )
    
    def _reverse_stock_returns(self):
        """Reverse stock returns when credit is reversed"""
        for item in self.credit_note.items.filter(stock_returned=True):
            inventory_item = item.item
            
            if inventory_item:
                # Decrease stock quantity (reverse the return)
                inventory_item.quantity_in_stock -= item.quantity_returned
                inventory_item.save()
                
                # Mark as not returned
                item.stock_returned = False
                item.save()
                
                # Create stock movement record
                from inventory.models import StockMovement
                StockMovement.objects.create(
                    inventory_item=inventory_item,
                    movement_type='adjustment',
                    quantity=-item.quantity_returned,
                    reference_number=f"{self.credit_note.credit_note_number}-REV",
                    notes=f"Reverse return - Credit note reversal {self.credit_note.credit_note_number}",
                    branch=self.credit_note.branch,
                    owner=self.credit_note.owner,
                    created_by=self.credit_note.reversed_by
                )
    
    def _get_sales_returns_account(self):
        """Get or create Sales Returns account using centralized utility"""
        account = get_or_create_child_account(
            parent_code='4900',
            child_suffix='001',
            name='Sales Returns and Allowances',
            account_type='INCOME',
            owner=self.credit_note.owner,
            branch=self.credit_note.branch,
            parent_name='Revenue Deductions'
        )
        return account
    
    def _get_accounts_receivable(self):
        """Get or create Accounts Receivable account using centralized utility"""
        account = get_or_create_child_account(
            parent_code='1110',
            child_suffix='001',
            name='Trade Debtors (Accounts Receivable)',
            account_type='ASSET',
            owner=self.credit_note.owner,
            branch=self.credit_note.branch,
            parent_name='Trade and Other Receivables'
        )
        return account
    
    def _get_revenue_parent_account(self):
        """Get parent revenue account"""
        return Account.objects.filter(
            account_type='REVENUE',
            account_level='PARENT',
            branch=self.credit_note.branch
        ).first()
    
    def _get_asset_parent_account(self):
        """Get parent asset account"""
        return Account.objects.filter(
            account_type='ASSET',
            account_level='PARENT',
            branch=self.credit_note.branch
        ).first()
    
    @staticmethod
    def get_customer_credit_balance(client, branch):
        """
        Get total credit balance for a customer
        
        Args:
            client: Client instance
            branch: Branch instance
            
        Returns:
            Decimal: Total available credit
        """
        applied_credits = CreditNote.objects.filter(
            client=client,
            branch=branch,
            applied_to_account=True,
            reversed=False,
            status='applied'
        ).aggregate(
            total=models.Sum('total_amount')
        )['total'] or Decimal('0.00')
        
        return applied_credits
    
    @staticmethod
    def get_invoice_credit_notes(invoice):
        """
        Get all credit notes for an invoice
        
        Args:
            invoice: Invoice instance
            
        Returns:
            QuerySet: Credit notes for the invoice
        """
        return CreditNote.objects.filter(
            original_invoice=invoice
        ).order_by('-issue_date')
    
    @staticmethod
    def get_total_credits_for_invoice(invoice):
        """
        Get total credit amount for an invoice
        
        Args:
            invoice: Invoice instance
            
        Returns:
            Decimal: Total credit amount
        """
        total = CreditNote.objects.filter(
            original_invoice=invoice,
            status__in=['issued', 'applied'],
            reversed=False
        ).aggregate(
            total=models.Sum('total_amount')
        )['total'] or Decimal('0.00')
        
        return total
