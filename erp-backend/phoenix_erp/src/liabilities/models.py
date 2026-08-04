from django.db import models
from django.db.models.deletion import PROTECT, SET_NULL
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.conf import settings

from expenses.models import ExpenseCategory
from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from clients.models import Client
from accounts.models import Account


class AccountsPayable(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """
    Vendor bills and payment tracking
    Supports both Client and Supplier objects via generic foreign key
    """
    # Generic foreign key to support both Client and Supplier
    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT, null=True, blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    vendor = GenericForeignKey('content_type', 'object_id')
    
    # Keep the old supplier field for backward compatibility during migration
    # This will be removed after data migration
    supplier = models.ForeignKey(Client, on_delete=models.PROTECT, 
                                related_name='payables', null=True, blank=True)
    
    reference_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        null=True, blank=True,  # Allow null during migration
        help_text="Auto-generated: AP-YYYYMMDD-XXXX"
    )
    
    account = models.ForeignKey(Account, on_delete=models.PROTECT,
                               related_name='payables',
                               help_text="Liability account for accounts payable (must be LIABILITY type)")
    
    invoice_number = models.CharField(max_length=50)
    invoice_date = models.DateField()
    due_date = models.DateField()
    
    # Purchase Order Reference (REQUIRED for compliance)
    purchase_order = models.ForeignKey(
        'procurement.PurchaseOrder',
        on_delete=models.PROTECT,
        related_name='payables',
        null=True,
        blank=True,
        help_text="Purchase Order reference (required for vendor invoice validation)"
    )
    
    amount = models.DecimalField(max_digits=18, decimal_places=2, help_text="Total invoice amount")
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=0, help_text="Amount paid so far")
    
    description = models.TextField(blank=True, help_text="Description of the payable")
    
    # 3-Way Match Validation (PO → GRN → Invoice)
    three_way_match_status = models.CharField(
        max_length=20,
        choices=[
            ('not_validated', 'Not Validated'),
            ('passed', 'Match Passed'),
            ('warning', 'Match Warning'),
            ('failed', 'Match Failed'),
        ],
        default='not_validated',
        help_text="Result of 3-way matching validation"
    )
    three_way_match_result = models.JSONField(
        null=True,
        blank=True,
        help_text="Detailed 3-way matching results from validation"
    )
    validated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When 3-way match validation was performed"
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name='validated_payables',
        help_text="User who validated the invoice"
    )
    
    STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unpaid')
    
    # Payment Posting Accountability
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name='posted_payments',
        help_text="User who posted/approved the payment (responsible party)"
    )
    posted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When payment was posted"
    )
    posting_notes = models.TextField(
        blank=True,
        help_text="Notes from the person posting the payment"
    )
    
    @property
    def amount_due(self):
        """Calculate remaining amount due"""
        return self.amount - self.amount_paid
    
    @property
    def vendor_name(self):
        """Get vendor name regardless of type"""
        if self.vendor:
            if hasattr(self.vendor, 'name'):
                return self.vendor.name
            elif hasattr(self.vendor, 'first_name') and hasattr(self.vendor, 'last_name'):
                return f"{self.vendor.first_name} {self.vendor.last_name}".strip()
        return "Unknown Vendor"
    
    def save(self, *args, **kwargs):
        # Auto-set tenant if not provided
        if not self.tenant_id:
            from common.managers import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                self.tenant = tenant
            elif self.owner and hasattr(self.owner, 'tenant'):
                self.tenant = self.owner.tenant
            elif self.branch and hasattr(self.branch, 'tenant'):
                self.tenant = self.branch.tenant
        
        # Auto-generate reference number if not provided
        if not self.reference_number:
            from django.utils import timezone
            from django.db.models import Max
            from django.db import IntegrityError, transaction
            
            today = timezone.now().date()
            prefix = f"AP-{today.strftime('%Y%m%d')}"
            
            # Try up to 10 times to find an available reference number
            for attempt in range(10):
                # Get the maximum sequence number for today
                last_ref = AccountsPayable.objects.filter(
                    reference_number__startswith=prefix
                ).aggregate(Max('reference_number'))['reference_number__max']
                
                if last_ref:
                    # Extract the sequence number from last reference (e.g., "AP-20260204-0005" -> 5)
                    try:
                        last_sequence = int(last_ref.split('-')[-1])
                        next_sequence = last_sequence + 1 + attempt  # Add attempt to avoid collision
                    except (ValueError, IndexError):
                        next_sequence = 1 + attempt
                else:
                    next_sequence = 1 + attempt
                
                self.reference_number = f"{prefix}-{next_sequence:04d}"
                
                try:
                    # Nested atomic() creates a savepoint so a collision here only
                    # rolls back this attempt, not the whole outer transaction.
                    with transaction.atomic():
                        super().save(*args, **kwargs)
                    return  # Success!
                except IntegrityError as e:
                    if 'reference_number' in str(e).lower() and attempt < 9:
                        # Reference number collision, retry
                        self.reference_number = None
                        self.pk = None  # Reset PK in case partial save happened
                        continue
                    else:
                        raise  # Re-raise if not reference_number issue or exhausted attempts
        else:
            super().save(*args, **kwargs)
    
    def clean(self):
        """Validate account types, vendor, and compliance requirements before saving"""
        super().clean()
        
        # Validate account is a liability account
        if self.account_id:
            if self.account.account_type != 'LIABILITY':
                raise ValidationError({
                    'account': f'Accounts Payable must use a LIABILITY account. '
                             f'Selected account "{self.account.name}" is '
                             f'type "{self.account.account_type}".'
                })
        
        # Validate vendor type
        if self.vendor:
            from clients.models import Client
            from procurement.models import Supplier
            if not isinstance(self.vendor, (Client, Supplier)):
                raise ValidationError({
                    'vendor': f'Vendor must be either a Client or Supplier, not {type(self.vendor).__name__}'
                })
        
        # COMPLIANCE: Require Purchase Order reference for vendor invoices
        # (Exception: Can be bypassed for utility bills, recurring expenses, etc.)
        if not self.purchase_order and self.amount > 0:
            # Check if this is a vendor (Supplier) rather than client
            from procurement.models import Supplier
            if self.vendor and isinstance(self.vendor, Supplier):
                # Warning: PO should be present for audit trail
                # This is a soft validation - allows override but logs warning
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"AccountsPayable {self.invoice_number} created without PO reference "
                    f"for vendor {self.vendor_name}. Amount: {self.amount}"
                )
    
    def validate_three_way_match(self, user=None):
        """
        Perform 3-way matching validation (PO → GRN → Invoice)
        
        This method validates that:
        1. Invoice has a Purchase Order reference
        2. Purchase Order has a Goods Received Note
        3. Invoice amount matches PO and GRN within tolerance
        
        Args:
            user: User performing the validation (for accountability)
            
        Returns:
            dict: Validation result with status and details
            
        Raises:
            ValidationError: If critical validation fails
        """
        from django.utils import timezone
        from procurement.models import GoodsReceivedNote
        from procurement.services.three_way_matching import ThreeWayMatchingService
        from procurement.config_models import ProcurementConfig
        
        # Check if PO exists
        if not self.purchase_order:
            return {
                'status': 'failed',
                'message': 'No Purchase Order reference found for this invoice',
                'can_proceed': False,
                'requires_manual_review': True,
                'critical_failures': 1
            }
        
        po = self.purchase_order
        
        # Find related GRN
        grn = GoodsReceivedNote.objects.filter(
            purchase_order=po,
            is_deleted=False
        ).order_by('-created_at').first()
        
        if not grn:
            return {
                'status': 'failed',
                'message': f'No Goods Received Note found for PO {po.po_number}',
                'can_proceed': False,
                'requires_manual_review': True,
                'critical_failures': 1
            }
        
        # Get procurement config
        try:
            config = ProcurementConfig.get_for_branch(po.branch)
        except Exception:
            # If no config, create default validation result
            return {
                'status': 'warning',
                'message': '3-way matching not configured - manual review required',
                'can_proceed': True,
                'requires_manual_review': True,
                'warnings': 1
            }
        
        # Perform 3-way matching
        matching_service = ThreeWayMatchingService(workflow_config=config)
        result = matching_service.match_po_grn_invoice(
            po=po,
            grn=grn,
            invoice_amount=self.amount
        )
        
        # Update validation fields
        self.three_way_match_status = result.get('overall_status', 'not_validated')
        self.three_way_match_result = result
        self.validated_at = timezone.now()
        if user:
            self.validated_by = user
        
        self.save(update_fields=[
            'three_way_match_status',
            'three_way_match_result',
            'validated_at',
            'validated_by'
        ])
        
        return result
    
    def make_payment(self, amount, payment_date=None, notes='', posted_by=None, bypass_validation=False, bank_gl_account=None):
        """
        Record a payment against this AccountsPayable and post the matching GL entry.

        COMPLIANCE REQUIREMENT:
        - Must validate 3-way match before posting payment (unless bypassed)
        - Records who posted the payment for accountability

        Args:
            amount: Payment amount
            payment_date: Date of payment (default: today)
            notes: Payment notes
            posted_by: User posting the payment (REQUIRED for accountability)
            bypass_validation: Set to True to skip 3-way matching (use with caution)
            bank_gl_account: GL Account (Asset) to credit — the bank/cash account
                             being used to pay (REQUIRED for ledger correctness).

        Raises:
            ValidationError: If validation fails, posted_by not provided,
                             or bank_gl_account not provided
        """
        from django.utils import timezone
        from decimal import Decimal
        
        if payment_date is None:
            payment_date = timezone.now().date()
        
        amount = Decimal(str(amount))
        
        # Validate payment amount
        if amount <= 0:
            raise ValidationError("Payment amount must be positive")
        
        if amount > self.amount_due:
            raise ValidationError(f"Payment amount {amount} exceeds amount due {self.amount_due}")
        
        # ACCOUNTABILITY: Require user who is posting the payment
        if not posted_by:
            raise ValidationError(
                "Payment must be posted by an authorized user. "
                "The person posting is responsible for verifying all documentation."
            )

        # GL: Require a bank/cash GL account so both sides of the journal entry can be created
        if bank_gl_account is None:
            raise ValidationError(
                "bank_gl_account is required to post the payment to the ledger "
                "(Dr Accounts Payable / Cr Bank Account). "
                "Pass the GL Account object for the bank account making this payment."
            )

        # COMPLIANCE: Validate 3-way match before payment (unless bypassed)
        if not bypass_validation and self.purchase_order:
            # Check if validation already done
            if self.three_way_match_status == 'not_validated':
                # Perform validation
                validation_result = self.validate_three_way_match(user=posted_by)
            else:
                # Use existing validation
                validation_result = self.three_way_match_result or {}
            
            # Check validation status
            if self.three_way_match_status == 'failed':
                raise ValidationError(
                    f"Cannot process payment: 3-way matching validation FAILED. "
                    f"Reason: {validation_result.get('summary', 'Critical discrepancies found')}. "
                    f"Please review the Purchase Order, GRN, and Invoice for discrepancies."
                )
            
            elif self.three_way_match_status == 'warning':
                # Log warning but allow payment
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Payment processed with WARNINGS for {self.invoice_number}. "
                    f"Posted by: {posted_by.get_full_name()}. "
                    f"Warnings: {validation_result.get('summary', 'Minor discrepancies found')}"
                )
        
        # If no PO reference, warn the user
        if not self.purchase_order:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Payment posted WITHOUT Purchase Order reference. "
                f"Invoice: {self.invoice_number}, Amount: {amount}, "
                f"Posted by: {posted_by.get_full_name() if posted_by else 'Unknown'}"
            )
        
        from django.db import transaction as db_transaction
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        with db_transaction.atomic():
            # Update payment amount
            self.amount_paid += amount

            # Update status based on payment
            if self.amount_paid >= self.amount:
                self.status = 'paid'
            elif self.amount_paid > 0:
                self.status = 'partial'

            # Record who posted the payment and when
            self.posted_by = posted_by
            self.posted_at = timezone.now()
            if notes:
                self.posting_notes = notes

            self.save()

            # Create GL journal entry: DR Accounts Payable / CR Bank Account
            # This is the second leg of the two-step cycle:
            #   Step 1 (on purchase): DR Prepaid/Expense  CR Accounts Payable
            #   Step 2 (this):        DR Accounts Payable  CR Bank Account
            series, _ = TransactionSeries.objects.get_or_create(
                code='APPMT',
                defaults={'description': 'Accounts Payable Payments'},
            )
            invoice_ref = self.reference_number or self.invoice_number
            journal_entry = JournalEntry.objects.create(
                series=series,
                date=payment_date,
                description=f"AP Payment: {invoice_ref} – {self.vendor_name}",
                workflow_reference=f"{invoice_ref}-PMT-{payment_date.strftime('%Y%m%d')}",
                branch=self.branch,
                owner=self.owner,
                created_by=posted_by,
                tenant=self.tenant,
            )

            # DR: Accounts Payable — clears the liability from the balance sheet
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=self.account,
                side=JournalEntryLine.DEBIT,
                amount=amount,
            )
            # CR: Bank / Cash Account — reduces the bank balance
            JournalEntryLine.objects.create(
                transaction=journal_entry,
                account=bank_gl_account,
                side=JournalEntryLine.CREDIT,
                amount=amount,
            )
            journal_entry.post()

            # Expose the posted entry to callers (e.g. BankPayment.post_payment)
            # that need to link it without posting a second, duplicate entry.
            self._last_journal_entry = journal_entry

        return self.amount_due  # Return remaining balance
    
    @classmethod
    def overdue_payables(cls, as_of_date=None):
        """Get all overdue payables"""
        from django.utils import timezone
        
        if as_of_date is None:
            as_of_date = timezone.now().date()
        
        return cls.objects.filter(
            due_date__lt=as_of_date,
            status__in=['unpaid', 'partial'],
            is_deleted=False
        )
    
    @classmethod
    def resolve_vendor_account(cls, vendor, owner, branch):
        """
        Resolve the LIABILITY GL account a new AccountsPayable for *vendor*
        should post to.

        Supplier vendors get their own dedicated subledger account (see
        accounts.utils.account_creation.get_or_create_supplier_payable_account)
        so invoices, on-account advances, and applied payments all land on
        one account per vendor. Client vendors (legacy — being migrated away,
        see the `supplier` FK docstring above) keep using the single shared
        "General Trade Creditors" system account as before.
        """
        from procurement.models import Supplier
        from accounts.utils.account_creation import (
            get_system_account,
            get_or_create_supplier_payable_account,
        )

        if isinstance(vendor, Supplier):
            return get_or_create_supplier_payable_account(vendor, owner, branch)
        return get_system_account('accounts_payable', owner, branch)

    @classmethod
    def create_for_vendor(cls, vendor, account, invoice_number, invoice_date, due_date, amount, **kwargs):
        """
        Create AccountsPayable for either Client or Supplier
        
        Args:
            vendor: Client or Supplier instance
            account: Account instance (must be LIABILITY type)
            invoice_number: str
            invoice_date: date
            due_date: date
            amount: Decimal
            **kwargs: Additional fields
        """
        from django.contrib.contenttypes.models import ContentType
        
        content_type = ContentType.objects.get_for_model(vendor)
        
        return cls.objects.create(
            content_type=content_type,
            object_id=vendor.pk,
            account=account,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            amount=amount,
            **kwargs
        )
    
    @classmethod
    def for_vendor(cls, vendor):
        """Get all AccountsPayable records for a specific vendor"""
        from django.contrib.contenttypes.models import ContentType
        content_type = ContentType.objects.get_for_model(vendor)
        return cls.objects.filter(
            content_type=content_type,
            object_id=vendor.pk,
            is_deleted=False
        )
    
    def __str__(self):
        return f"{self.reference_number} - {self.vendor_name} - {self.amount}"
class AccruedLiability(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Expenses incurred but not yet paid (salaries, utilities, etc.)"""
    account = models.ForeignKey(Account, on_delete=PROTECT)
    expense_category = models.ForeignKey(ExpenseCategory, on_delete=PROTECT)
    
    description = models.TextField()
    accrual_date = models.DateField()
    expected_payment_date = models.DateField()
    
    accrued_amount = models.DecimalField(max_digits=18, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    def clean(self):
        """Validate account types before saving"""
        super().clean()
        
        # Validate account is a liability account
        if self.account_id:
            if self.account.account_type != 'LIABILITY':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'account': f'Accrued liabilities must use a LIABILITY account. '
                             f'Selected account "{self.account.name}" is '
                             f'type "{self.account.account_type}".'
                })


class TaxLiability(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    """Track tax obligations"""
    TAX_TYPES = [
        ('vat', 'VAT/Sales Tax'),
        ('income', 'Income Tax'),
        ('payroll', 'Payroll Tax'),
        ('withholding', 'Withholding Tax'),
    ]
    
    tax_type = models.CharField(max_length=20, choices=TAX_TYPES)
    account = models.ForeignKey(Account, on_delete=PROTECT)
    
    period_start = models.DateField()
    period_end = models.DateField()
    
    taxable_amount = models.DecimalField(max_digits=18, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    def clean(self):
        """Validate account types before saving"""
        super().clean()
        
        # Validate account is a liability account
        if self.account_id:
            if self.account.account_type != 'LIABILITY':
                from django.core.exceptions import ValidationError
                raise ValidationError({
                    'account': f'Tax liabilities must use a LIABILITY account. '
                             f'Selected account "{self.account.name}" is '
                             f'type "{self.account.account_type}".'
                })