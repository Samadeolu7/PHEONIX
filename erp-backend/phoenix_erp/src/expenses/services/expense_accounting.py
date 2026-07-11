"""
Expense Accounting Service

Handles all accounting operations for expenses including:
- Journal entries for expense posting
- Prepaid expense amortization
- Payment processing
- Account reconciliation
"""

from decimal import Decimal
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from transactions.models import (
    Transaction as JournalEntry,
    TransactionEntry as JournalEntryLine,
    TransactionSeries
)
from accounts.models import Account
from accounts.utils.account_creation import get_system_account
from expenses.models import Expense, ExpenseCategory, PrepaidExpense


class ExpenseAccountingService:
    """Service for expense accounting operations"""
    
    def __init__(self, expense):
        """
        Initialize service with expense
        
        Args:
            expense: Expense instance
        """
        self.expense = expense
    
    @db_transaction.atomic
    def post_expense(self, posted_by, notes=None):
        """
        Post expense to accounting
        
        Creates journal entry:
        DR: Expense Account
        CR: Cash/Bank Account (or Accounts Payable if unpaid)
        
        Args:
            posted_by: User posting the expense
            notes: Optional notes
            
        Returns:
            JournalEntry: Created journal entry
            
        Raises:
            ValidationError: If expense cannot be posted
        """
        # Validate
        if self.expense.is_posted:
            raise ValidationError("Expense is already posted to accounting")
        
        if self.expense.requires_approval and not self.expense.approved:
            raise ValidationError("Expense must be approved before posting")
        
        # Get accounts
        expense_account = self._get_expense_account()
        payment_account = self._get_payment_account()
        
        # Get or create transaction series
        series, _ = TransactionSeries.objects.get_or_create(
            code='EXP',
            defaults={'description': 'Expenses'}
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.expense.expense_date,
            description=f"Expense: {self.expense.reference_number} - {self.expense.description}",
            workflow_reference=self.expense.reference_number,
            branch=self.expense.branch,
            owner=self.expense.owner,
            created_by=posted_by,
            tenant=self.expense.tenant,
        )

        # DR: Expense Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=expense_account,
            side=JournalEntryLine.DEBIT,
            amount=self.expense.total_amount
        )
        
        # CR: Payment Account (Cash/Bank/AP)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.CREDIT,
            amount=self.expense.total_amount
        )
        
        # Post the transaction
        journal_entry.post()
        
        # Update expense status.
        # Mark as 'paid' only when the payment is IMMEDIATE (credit went to a
        # cash/bank asset account).  When posted to AP (deferred), leave the
        # status unchanged so BankPayment.post_payment() can later settle it
        # with Dr AP / Cr <specific bank>.  Without this guard an expense
        # posted to AP would remain in 'submitted' state, and BankPayment
        # would try to double-debit a phantom AP entry on top of the real one.
        self.expense.is_posted = True
        self.expense.posted_at = timezone.now()
        if payment_account.account_type != 'LIABILITY':
            # Immediate payment (cash or specific bank account) — fully settled.
            self.expense.status = 'paid'
        # else: deferred (AP) — leave status so BankPayment can pick it up.
        self.expense.save()
        
        return journal_entry
    
    @db_transaction.atomic
    def record_payment(self, payment_account, paid_by, payment_reference=None, notes=None):
        """
        Record payment for an expense (if posted but not paid)
        
        Creates journal entry:
        DR: Accounts Payable
        CR: Cash/Bank Account
        
        Args:
            payment_account: Account used for payment
            paid_by: User recording payment
            payment_reference: Payment reference number
            notes: Optional notes
            
        Returns:
            JournalEntry: Created journal entry
        """
        if not self.expense.is_posted:
            raise ValidationError("Expense must be posted before recording payment")
        
        if self.expense.status == 'paid':
            raise ValidationError("Expense is already marked as paid")
        
        # Get accounts
        accounts_payable = self._get_accounts_payable()
        
        # Get series
        series, _ = TransactionSeries.objects.get_or_create(
            code='PMT',
            defaults={'description': 'Payments'}
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"Payment for {self.expense.reference_number}",
            workflow_reference=f"{self.expense.reference_number}-PMT",
            branch=self.expense.branch,
            owner=self.expense.owner,
            created_by=paid_by,
            tenant=self.expense.tenant,
        )
        
        # DR: Accounts Payable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=accounts_payable,
            side=JournalEntryLine.DEBIT,
            amount=self.expense.total_amount
        )
        
        # CR: Payment Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.CREDIT,
            amount=self.expense.total_amount
        )
        
        # Post transaction
        journal_entry.post()
        
        # Update expense
        self.expense.status = 'paid'
        if payment_reference:
            self.expense.payment_reference = payment_reference
        self.expense.save()
        
        return journal_entry
    
    def _get_expense_account(self):
        """Get or create expense account from category"""
        if self.expense.category and self.expense.category.expense_account:
            return self.expense.category.expense_account
        
        # Fallback: get system account (creates parent 501 + child 501-001)
        return get_system_account('general_expense', self.expense.owner, self.expense.branch)
    
    def _get_payment_account(self):
        """
        Get the credit account for the expense payment.

        Priority:
        1. If expense has a linked BankAccount FK, use its GL account directly.
        2. If payment method is cash, return the generic cash system account.
        3. If payment method is bank_transfer / cheque / card but no BankAccount FK,
           fall back to the generic system bank account (avoids hard failure).
        4. Otherwise, use Accounts Payable (deferred payment).
        """
        # Preferred: specific bank account linked to the expense
        if self.expense.bank_account_id:
            gl = self.expense.bank_account.gl_account
            if gl is None:
                raise ValidationError(
                    f"Bank account '{self.expense.bank_account.account_number}' has no linked GL account. "
                    "Save the bank account once to auto-create its GL account."
                )
            return gl

        if self.expense.payment_method == 'cash':
            return self._get_cash_account()
        elif self.expense.payment_method in ['bank_transfer', 'cheque', 'card']:
            # No specific bank account linked to the expense yet.
            # Treat as deferred (post to AP) so a BankPayment can settle it
            # later with Dr AP / Cr <specific bank>.  Using generic 'Cash at Bank'
            # here would create an entry that never reconciles with the actual bank.
            return self._get_accounts_payable()
        else:
            # Default to accounts payable if not paid immediately
            return self._get_accounts_payable()
    
    def _get_cash_account(self):
        """Get or create cash account"""
        return get_system_account('cash', self.expense.owner, self.expense.branch)
    
    def _get_bank_account(self):
        """Get or create bank account"""
        return get_system_account('bank', self.expense.owner, self.expense.branch)
    
    def _get_accounts_payable(self):
        """Get or create accounts payable account"""
        return get_system_account('accounts_payable', self.expense.owner, self.expense.branch)
    
    @staticmethod
    def get_expense_summary(branch, start_date=None, end_date=None):
        """
        Get expense summary for a branch
        
        Args:
            branch: Branch instance
            start_date: Optional start date
            end_date: Optional end date
            
        Returns:
            dict: Summary statistics
        """
        from django.db.models import Sum, Count, Q
        
        queryset = Expense.objects.filter(branch=branch, is_deleted=False)
        
        if start_date:
            queryset = queryset.filter(expense_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(expense_date__lte=end_date)
        
        summary = {
            'total_count': queryset.count(),
            'total_amount': queryset.aggregate(Sum('total_amount'))['total_amount__sum'] or Decimal('0.00'),
            'by_status': {},
            'by_category': {},
            'pending_approval': queryset.filter(
                requires_approval=True, approved=False, status='submitted'
            ).count(),
            'posted_count': queryset.filter(is_posted=True).count(),
            'unposted_count': queryset.filter(is_posted=False).count()
        }
        
        # By status
        for status_code, status_label in Expense.STATUS_CHOICES:
            count = queryset.filter(status=status_code).count()
            amount = queryset.filter(status=status_code).aggregate(
                Sum('total_amount')
            )['total_amount__sum'] or Decimal('0.00')
            
            summary['by_status'][status_code] = {
                'label': status_label,
                'count': count,
                'amount': amount
            }
        
        # By category (top 5)
        categories = queryset.values(
            'category__name', 'category__code'
        ).annotate(
            count=Count('id'),
            total=Sum('total_amount')
        ).order_by('-total')[:5]
        
        summary['by_category'] = list(categories)
        
        return summary


class PrepaidExpenseAccountingService:
    """Service for prepaid expense accounting"""
    
    def __init__(self, prepaid_expense):
        """Initialize service with prepaid expense"""
        self.prepaid_expense = prepaid_expense
    
    @db_transaction.atomic
    def record_initial_payment(self, paid_by, payment_account, notes=None):
        """
        Record initial payment for prepaid expense
        
        Creates journal entry:
        DR: Prepaid Expense Account (Asset)
        CR: Cash/Bank Account
        
        Args:
            paid_by: User recording payment
            payment_account: Account used for payment
            notes: Optional notes
            
        Returns:
            JournalEntry: Created journal entry
        """
        # Get accounts
        prepaid_account = self._get_prepaid_account()
        
        # Get series
        series, _ = TransactionSeries.objects.get_or_create(
            code='PREPA',
            defaults={'description': 'Prepaid Expenses'}
        )
        
        # Create journal entry
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.prepaid_expense.purchase_date,
            description=f"Prepaid: {self.prepaid_expense.reference_number} - {self.prepaid_expense.description}",
            workflow_reference=self.prepaid_expense.reference_number,
            branch=self.prepaid_expense.branch,
            owner=self.prepaid_expense.owner,
            created_by=paid_by,
            tenant=self.prepaid_expense.tenant,
        )
        
        # DR: Prepaid Expense (Asset)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=prepaid_account,
            side=JournalEntryLine.DEBIT,
            amount=self.prepaid_expense.total_amount
        )
        
        # CR: Payment Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=payment_account,
            side=JournalEntryLine.CREDIT,
            amount=self.prepaid_expense.total_amount
        )
        
        # Post transaction
        journal_entry.post()

        # Mark prepaid as posted and link to the initial GL entry (Gap 9 traceability)
        self.prepaid_expense.is_posted = True
        self.prepaid_expense.posted_at = timezone.now()
        self.prepaid_expense.journal_entry = journal_entry
        self.prepaid_expense.save()

        return journal_entry
    
    @db_transaction.atomic
    def amortize_period(self, amount, period_end_date, notes=None, posted_by=None):
        """
        Record amortization for a period
        
        Creates journal entry:
        DR: Expense Account
        CR: Prepaid Expense Account
        
        Args:
            amount: Amount to amortize
            period_end_date: End date of period (string or date object)
            notes: Optional notes
            
        Returns:
            JournalEntry: Created journal entry
        """
        if self.prepaid_expense.status == 'fully_consumed':
            raise ValidationError("Prepaid expense is fully consumed")

        if amount <= Decimal('0'):
            raise ValidationError("Amortization amount must be positive")

        if amount > self.prepaid_expense.remaining_amount:
            raise ValidationError(
                f"Amortization amount ({amount}) exceeds remaining balance "
                f"({self.prepaid_expense.remaining_amount})"
            )

        # Convert period_end_date to date object if it's a string
        from django.utils.dateparse import parse_date
        if isinstance(period_end_date, str):
            period_end_date = parse_date(period_end_date)
            if not period_end_date:
                raise ValidationError("Invalid date format for period_end_date")
        
        # Get accounts
        prepaid_account = self._get_prepaid_account()
        expense_account = self._get_expense_account()
        
        # Get series
        series, _ = TransactionSeries.objects.get_or_create(
            code='AMORT',
            defaults={'description': 'Amortization'}
        )
        
        # Create journal entry with unique workflow_reference including period
        period_str = period_end_date.strftime('%Y%m')  # YYYYMM format (e.g., 202601)
        journal_entry = JournalEntry.objects.create(
            series=series,
            date=period_end_date,
            description=f"Amortization: {self.prepaid_expense.reference_number} - {period_str}",
            workflow_reference=f"{self.prepaid_expense.reference_number}-AMORT-{period_str}",
            branch=self.prepaid_expense.branch,
            owner=self.prepaid_expense.owner,
            created_by=posted_by,
            tenant=self.prepaid_expense.tenant,
        )
        
        # DR: Expense Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=expense_account,
            side=JournalEntryLine.DEBIT,
            amount=amount
        )
        
        # CR: Prepaid Expense Account
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=prepaid_account,
            side=JournalEntryLine.CREDIT,
            amount=amount
        )
        
        # Post transaction
        journal_entry.post()
        
        # Update prepaid expense
        self.prepaid_expense.consumed_amount += amount
        self.prepaid_expense.remaining_amount -= amount
        if self.prepaid_expense.remaining_amount <= Decimal('0.01'):
            self.prepaid_expense.remaining_amount = Decimal('0.00')
            self.prepaid_expense.status = 'fully_consumed'
            self.prepaid_expense.consumed_date = timezone.now()
        self.prepaid_expense.save()
        
        return journal_entry
    
    def _get_prepaid_account(self):
        """Get or create prepaid expense account"""
        if self.prepaid_expense.category and self.prepaid_expense.category.prepaid_account:
            return self.prepaid_expense.category.prepaid_account
        
        # Fallback: get system account (creates parent 130 + child 130-001)
        return get_system_account('prepaid_expense', self.prepaid_expense.owner, self.prepaid_expense.branch)
    
    def _get_expense_account(self):
        """Get or create expense account for amortization"""
        if self.prepaid_expense.category and self.prepaid_expense.category.expense_account:
            return self.prepaid_expense.category.expense_account
        
        # Fallback: get system account (creates parent 501 + child 501-001)
        return get_system_account('general_expense', self.prepaid_expense.owner, self.prepaid_expense.branch)

    @db_transaction.atomic
    def create_supplier_payable(self, posted_by):
        """
        Create initial accounting entries for a supplier-backed prepaid expense.

        Journal entry:
          DR: Prepaid Expense Account (Asset)   ← we now hold this asset
          CR: Accounts Payable (to the supplier) ← we owe them

        Also creates an AccountsPayable record so the liability can be settled
        later via a bank payment (Dr AP / Cr Bank).  Once that payment is made
        the prepaid balance can be amortised normally (Dr Expense / Cr Prepaid).

        Args:
            posted_by: User who triggered the posting

        Returns:
            (JournalEntry, AccountsPayable) tuple

        Raises:
            ValidationError: if already posted or supplier is missing
        """
        if self.prepaid_expense.is_posted:
            raise ValidationError("Prepaid expense is already posted to accounting")

        if not self.prepaid_expense.supplier_id:
            raise ValidationError("A supplier must be set to create a payable")

        prepaid_account = self._get_prepaid_account()
        ap_account = get_system_account(
            'accounts_payable',
            self.prepaid_expense.owner,
            self.prepaid_expense.branch,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='PREPA',
            defaults={'description': 'Prepaid Expenses'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=self.prepaid_expense.purchase_date,
            description=(
                f"Prepaid payable: {self.prepaid_expense.reference_number} – "
                f"{self.prepaid_expense.description}"
            ),
            workflow_reference=self.prepaid_expense.reference_number,
            branch=self.prepaid_expense.branch,
            owner=self.prepaid_expense.owner,
            created_by=posted_by,
            tenant=self.prepaid_expense.tenant,
        )

        # DR: Prepaid Expense (Asset)
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=prepaid_account,
            side=JournalEntryLine.DEBIT,
            amount=self.prepaid_expense.total_amount,
        )

        # CR: Accounts Payable
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=ap_account,
            side=JournalEntryLine.CREDIT,
            amount=self.prepaid_expense.total_amount,
        )

        journal_entry.post()

        # Create AccountsPayable record so the supplier obligation is tracked
        from liabilities.models import AccountsPayable

        invoice_ref = (
            self.prepaid_expense.supplier_invoice
            or self.prepaid_expense.reference_number
        )

        # Respect supplier payment terms (mirror of Gap 12 fix in ResourceConsumption)
        PAYMENT_TERMS_DAYS = {
            'cash': 0, 'net_15': 15, 'net_30': 30, 'net_60': 60, 'net_90': 90,
        }
        payment_terms_str = (
            getattr(self.prepaid_expense.supplier, 'payment_terms', 'net_30') or 'net_30'
        )
        payment_days = PAYMENT_TERMS_DAYS.get(payment_terms_str, 30)
        prepaid_due_date = self.prepaid_expense.purchase_date + timezone.timedelta(days=payment_days)

        ap_record = AccountsPayable.create_for_vendor(
            vendor=self.prepaid_expense.supplier,
            account=ap_account,
            invoice_number=invoice_ref,
            invoice_date=self.prepaid_expense.purchase_date,
            due_date=prepaid_due_date,
            amount=self.prepaid_expense.total_amount,
            description=(
                f"Prepaid expense: {self.prepaid_expense.description}"
            ),
            branch=self.prepaid_expense.branch,
            owner=self.prepaid_expense.owner,
        )

        # Mark prepaid as posted and link to the AP record + GL entry (Gap 9)
        self.prepaid_expense.is_posted = True
        self.prepaid_expense.posted_at = timezone.now()
        self.prepaid_expense.accounts_payable = ap_record
        self.prepaid_expense.journal_entry = journal_entry
        self.prepaid_expense.save()

        return journal_entry, ap_record
