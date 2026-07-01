# incomes/services/discount_service.py
"""
Service for managing discounts, scholarships, and waivers
Handles accounting integration with proper journal entries
"""
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import models
from decimal import Decimal, ROUND_HALF_UP
import logging

from accounts.models import Account
from accounts.utils.account_creation import get_or_create_child_account
from transactions.models import Transaction, TransactionEntry
from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from receivables.models import CustomerReceivable

logger = logging.getLogger(__name__)


class DiscountService:
    """
    Service for discount/scholarship operations
    
    All methods are transactional and create proper accounting entries
    """
    
    @staticmethod
    @transaction.atomic
    def apply_discount_to_receivable(
        application: DiscountApplication,
        receivable: CustomerReceivable,
        user
    ):
        """
        Apply an approved discount to a receivable
        
        Process:
        1. Validate application and receivable
        2. Calculate discount amount
        3. Create AppliedDiscount record
        4. Post to accounting (creates journal entry)
        5. Update receivable balance
        6. Update program budget
        
        Args:
            application: Approved DiscountApplication
            receivable: CustomerReceivable to discount
            user: User applying the discount
        
        Returns:
            AppliedDiscount: The created and posted discount
        
        Raises:
            ValidationError: If validation fails
        """
        
        # Validation
        if application.status != 'approved':
            raise ValidationError("Application must be approved before applying discount")
        
        if not application.is_active:
            raise ValidationError("Application is not currently active")
        
        if receivable.status == 'paid':
            raise ValidationError("Cannot apply discount to fully paid receivable")
        
        # Check if discount already applied
        if AppliedDiscount.objects.filter(
            application=application,
            receivable=receivable,
            is_reversed=False
        ).exists():
            raise ValidationError("Discount already applied to this receivable")
        
        # Calculate discount amount
        program = application.program
        discount_value = application.actual_discount_value
        
        if program.discount_type == 'percentage':
            # Calculate percentage of original receivable amount
            discount_amount = (receivable.original_amount * discount_value) / 100
        elif program.discount_type == 'fixed_amount':
            # Use fixed amount, but not more than receivable amount
            discount_amount = min(discount_value, receivable.original_amount)
        else:  # full_waiver
            discount_amount = receivable.original_amount
        
        # Round to 2 decimal places
        discount_amount = discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # Ensure discount doesn't exceed outstanding balance
        if discount_amount > receivable.balance:
            logger.warning(
                f"Discount ({discount_amount}) exceeds outstanding balance "
                f"({receivable.balance}). Adjusting to outstanding amount."
            )
            discount_amount = receivable.balance
        
        # Check program budget
        if not program.is_within_budget:
            raise ValidationError(
                f"Program budget exceeded. Remaining: {program.budget_remaining}"
            )
        
        if program.budget_allocated > 0:
            if (program.budget_used + discount_amount) > program.budget_allocated:
                raise ValidationError(
                    f"Insufficient budget. Available: {program.budget_remaining}, "
                    f"Required: {discount_amount}"
                )
        
        # Create applied discount record
        applied_discount = AppliedDiscount.objects.create(
            application=application,
            receivable=receivable,
            discount_amount=discount_amount,
            owner=user,
            branch=receivable.branch,
            created_by=user
        )
        
        # Post to accounting (this also updates receivable and program budget)
        applied_discount.post(user=user)
        
        logger.info(
            f"Applied discount: {discount_amount} to receivable {receivable.id} "
            f"for client {receivable.client.name}"
        )
        
        return applied_discount
    
    @staticmethod
    @transaction.atomic
    def create_discount_journal_entry(applied_discount: AppliedDiscount, user):
        """
        Create accounting journal entry for discount
        
        Entry depends on program type:
        
        1. Scholarships/Discounts/Waivers (Contra-Revenue):
           DR: Scholarships & Financial Aid (5020)
           CR: Accounts Receivable (1200)
        
        2. Staff Benefits (Expense):
           DR: Staff Benefits Expense (6010)
           CR: Accounts Receivable (1200)
        
        3. Insurance (Asset Transfer):
           DR: Insurance Receivable (1250)
           CR: Accounts Receivable (1200)
        
        4. Promotions (Marketing Expense):
           DR: Marketing Expense (6030)
           CR: Accounts Receivable (1200)
        
        Args:
            applied_discount: AppliedDiscount to post
            user: User creating the entry
        
        Returns:
            Transaction: Created journal entry
        """
        
        program = applied_discount.application.program
        receivable = applied_discount.receivable
        
        # Get or create Trade Debtors child account (FIRS 1111 under parent 1110)
        # Never post directly to the PARENT 1110 — use the detail child account.
        ar_account = get_or_create_child_account(
            parent_code='1110',
            child_suffix='001',
            name='Trade Debtors (Accounts Receivable)',
            account_type='ASSET',
            owner=applied_discount.owner,
            branch=applied_discount.branch,
            parent_name='Trade and Other Receivables',
        )

        # Get discount account from program
        discount_account = program.discount_account
        
        # Get or create a transaction series for discounts
        from transactions.models import TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(
            code='DSC',
            defaults={'description': 'Discount/Scholarship Transactions'}
        )
        
        # Create transaction
        journal_entry = Transaction.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"{program.name} - {receivable.client.name}",
            workflow_reference=applied_discount.application.application_number,
            owner=user,
            branch=applied_discount.branch,
            created_by=user
        )
        
        # Debit: Discount/Scholarship Account
        debit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=discount_account,
            side=TransactionEntry.DEBIT,
            amount=applied_discount.discount_amount
        )
        
        # Credit: Accounts Receivable
        credit_entry = TransactionEntry.objects.create(
            transaction=journal_entry,
            account=ar_account,
            side=TransactionEntry.CREDIT,
            amount=applied_discount.discount_amount
        )
        
        # Validate and post entries atomically
        journal_entry.full_clean()
        Account.objects.select_for_update().filter(pk__in=[discount_account.pk, ar_account.pk])
        debit_entry.post()
        credit_entry.post()
        
        logger.info(
            f"Created discount journal entry: {journal_entry.id} "
            f"for amount {applied_discount.discount_amount}"
        )
        
        return journal_entry
    
    @staticmethod
    @transaction.atomic
    def create_reversal_journal_entry(applied_discount: AppliedDiscount, user, reason=''):
        """
        Create reversal journal entry for discount
        
        This is the exact opposite of the original entry:
        DR: Accounts Receivable (restore balance)
        CR: Discount/Scholarship Account (reverse discount)
        
        Args:
            applied_discount: AppliedDiscount to reverse
            user: User creating the reversal
            reason: Reason for reversal
        
        Returns:
            Transaction: Created reversal entry
        """
        
        if not applied_discount.journal_entry:
            raise ValidationError("Original journal entry not found")
        
        program = applied_discount.application.program
        receivable = applied_discount.receivable
        
        # Get or create Trade Debtors child account (FIRS 1111 under parent 1110)
        # Never post directly to the PARENT 1110 — use the detail child account.
        ar_account = get_or_create_child_account(
            parent_code='1110',
            child_suffix='001',
            name='Trade Debtors (Accounts Receivable)',
            account_type='ASSET',
            owner=applied_discount.owner,
            branch=applied_discount.branch,
            parent_name='Trade and Other Receivables',
        )

        discount_account = program.discount_account
        
        # Get or create a transaction series for discounts
        from transactions.models import TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(
            code='DSC',
            defaults={'description': 'Discount/Scholarship Transactions'}
        )
        
        # Create reversal transaction
        reversal_entry = Transaction.objects.create(
            series=series,
            date=timezone.now().date(),
            description=f"REVERSAL: {program.name} - {receivable.client.name}",
            workflow_reference=f"REV-{applied_discount.application.application_number}",
            is_reversal=True,
            reverses_transaction=applied_discount.journal_entry,
            owner=user,
            branch=applied_discount.branch,
            created_by=user
        )
        
        # Debit: Accounts Receivable (restore balance)
        # Debit: Accounts Receivable (restore AR)
        debit_entry = TransactionEntry.objects.create(
            transaction=reversal_entry,
            account=ar_account,
            side=TransactionEntry.DEBIT,
            amount=applied_discount.discount_amount
        )
        
        # Credit: Discount Account (reverse discount)
        credit_entry = TransactionEntry.objects.create(
            transaction=reversal_entry,
            account=discount_account,
            side=TransactionEntry.CREDIT,
            amount=applied_discount.discount_amount
        )
        
        # Validate and post reversal entries atomically
        reversal_entry.full_clean()
        Account.objects.select_for_update().filter(pk__in=[ar_account.pk, discount_account.pk])
        debit_entry.post()
        credit_entry.post()
        
        logger.info(
            f"Created discount reversal entry: {reversal_entry.id} "
            f"for amount {applied_discount.discount_amount}. Reason: {reason}"
        )
        
        return reversal_entry
    
    @staticmethod
    def calculate_discount_amount(
        program: DiscountProgram,
        application: DiscountApplication,
        receivable: CustomerReceivable
    ) -> Decimal:
        """
        Calculate discount amount without applying
        
        Useful for previewing discount before applying
        
        Args:
            program: DiscountProgram
            application: DiscountApplication
            receivable: CustomerReceivable
        
        Returns:
            Decimal: Calculated discount amount
        """
        discount_value = application.actual_discount_value
        
        if program.discount_type == 'percentage':
            discount_amount = (receivable.original_amount * discount_value) / 100
        elif program.discount_type == 'fixed_amount':
            discount_amount = min(discount_value, receivable.original_amount)
        else:  # full_waiver
            discount_amount = receivable.original_amount
        
        # Don't exceed outstanding balance
        discount_amount = min(discount_amount, receivable.balance)
        
        return discount_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    @transaction.atomic
    def auto_apply_to_client_receivables(client, user):
        """
        Automatically apply all active approved discounts to client's receivables
        
        Call this when:
        - Creating new fee entitlements for a student with scholarship
        - Approving a new scholarship application
        - Creating new invoices for a customer with discount
        
        Args:
            client: Client object
            user: User performing the operation
        
        Returns:
            list: List of created AppliedDiscount objects
        """
        
        # Find active approved applications for this client
        active_applications = DiscountApplication.objects.filter(
            client=client,
            status='approved',
            effective_from__lte=timezone.now().date()
        ).filter(
            models.Q(effective_to__gte=timezone.now().date()) | 
            models.Q(effective_to__isnull=True)
        )
        
        # Get client's receivables that don't have discounts yet
        receivables = CustomerReceivable.objects.filter(
            client=client,
            status__in=['pending', 'partial']
        )
        
        applied_discounts = []
        
        for application in active_applications:
            for receivable in receivables:
                # Check if discount already applied
                if AppliedDiscount.objects.filter(
                    application=application,
                    receivable=receivable,
                    is_reversed=False
                ).exists():
                    continue
                
                try:
                    applied_discount = DiscountService.apply_discount_to_receivable(
                        application=application,
                        receivable=receivable,
                        user=user
                    )
                    applied_discounts.append(applied_discount)
                    
                except ValidationError as e:
                    logger.warning(
                        f"Could not auto-apply discount {application.id} "
                        f"to receivable {receivable.id}: {e}"
                    )
                    continue
        
        logger.info(
            f"Auto-applied {len(applied_discounts)} discounts to "
            f"client {client.name}"
        )
        
        return applied_discounts
    
    @staticmethod
    def get_client_discount_summary(client):
        """
        Get summary of all discounts for a client
        
        Args:
            client: Client object
        
        Returns:
            dict: Summary statistics
        """
        from django.db.models import Sum, Count
        
        applications = DiscountApplication.objects.filter(client=client)
        applied_discounts = AppliedDiscount.objects.filter(
            application__client=client,
            is_reversed=False
        )
        
        summary = {
            'total_applications': applications.count(),
            'approved_applications': applications.filter(status='approved').count(),
            'active_applications': sum(1 for app in applications if app.is_active),
            'total_discounts_received': applied_discounts.aggregate(
                total=Sum('discount_amount')
            )['total'] or Decimal('0.00'),
            'discounts_count': applied_discounts.count(),
            'programs': list(
                applications.values_list('program__name', flat=True).distinct()
            )
        }
        
        return summary
    
    @staticmethod
    def get_program_statistics(program: DiscountProgram):
        """
        Get detailed statistics for a discount program
        
        Args:
            program: DiscountProgram object
        
        Returns:
            dict: Program statistics
        """
        from django.db.models import Sum, Count, Q
        
        applications = DiscountApplication.objects.filter(program=program)
        approved_apps = applications.filter(status='approved')
        active_apps = [app for app in approved_apps if app.is_active]
        
        applied_discounts = AppliedDiscount.objects.filter(
            application__program=program,
            is_reversed=False
        )
        
        stats = {
            'program_name': program.name,
            'program_code': program.program_code,
            'budget_allocated': program.budget_allocated,
            'budget_used': program.budget_used,
            'budget_remaining': program.budget_remaining,
            'budget_utilization_percent': program.budget_utilization_percent,
            'max_recipients': program.max_recipients,
            'current_recipients': program.current_recipients,
            'available_slots': (
                program.max_recipients - program.current_recipients 
                if program.max_recipients > 0 
                else 999999
            ),
            'applications': {
                'total': applications.count(),
                'approved': approved_apps.count(),
                'active': len(active_apps),
                'pending': applications.filter(
                    status__in=['submitted', 'under_review']
                ).count(),
                'rejected': applications.filter(status='rejected').count(),
            },
            'discounts': {
                'total_count': applied_discounts.count(),
                'total_amount': applied_discounts.aggregate(
                    total=Sum('discount_amount')
                )['total'] or Decimal('0.00'),
                'posted_count': applied_discounts.filter(is_posted=True).count(),
            },
            'is_active': program.is_active,
            'is_valid': program.is_valid,
            'is_within_budget': program.is_within_budget,
            'has_capacity': program.has_recipient_capacity,
        }
        
        return stats


# Import Q for queries
from django.db.models import Q
