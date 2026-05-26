# cash_management/serializers.py
"""
Serializers for Cash/Bank Treasury Management
Implements the 4-step cash process with proper controls
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import models
from decimal import Decimal

from .models import (
    CashierAccount,
    CashCollection,
    CashTransfer,
    CashReconciliation,
    BankReconciliation,
    PettyCashFund,
    PettyCashVoucher,
    PettyCashReplenishment,
    PettyCashReceipt,
    DailyCollectionSheet,
    CollectionSheetItem,
)
from accounts.models import Account
from clients.models import Client
from transactions.models import Transaction




User = get_user_model()


class CashierAccountSerializer(serializers.ModelSerializer):
    """
    Cashier account for cash collection
    
    Links: User â†’ Child Account (ASSET) â†’ Parent Account (Cash/Bank)
    This enables balanced double-entry transactions when cashier collects cash.
    """
    cashier_name = serializers.SerializerMethodField()
    account_name = serializers.SerializerMethodField()
    account_code = serializers.SerializerMethodField()
    parent_account_name = serializers.SerializerMethodField()
    parent_account_code = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    needs_reconciliation = serializers.SerializerMethodField()
    
    class Meta:
        model = CashierAccount
        fields = [
            'id', 'account_number', 'name', 'cashier', 'cashier_name',
            'account', 'account_name', 'account_code',
            'parent_account_name', 'parent_account_code',
            'current_balance',
            'daily_collection_limit', 'requires_dual_approval',
            'is_active', 'is_suspended',
            'last_reconciled_at', 'last_reconciled_by',
            'branch', 'branch_name', 'needs_reconciliation',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'account', 'current_balance', 'last_reconciled_at', 'last_reconciled_by', 'created_at', 'updated_at']
        extra_kwargs = {
            'account': {'required': False, 'allow_null': True},
            'cashier': {'required': False, 'allow_null': True}
        }
    
    def get_cashier_name(self, obj):
        return obj.cashier.get_full_name() if obj.cashier else None
    
    def get_account_name(self, obj):
        return obj.account.name if obj.account else None
    
    def get_account_code(self, obj):
        return obj.account.code if obj.account else None
    
    def get_parent_account_name(self, obj):
        return obj.account.parent.name if obj.account and obj.account.parent else None
    
    def get_parent_account_code(self, obj):
        return obj.account.parent.code if obj.account and obj.account.parent else None
    
    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None
    
    def get_needs_reconciliation(self, obj):
        """Check if cashier needs end-of-day reconciliation"""
        if not obj.is_active or obj.is_suspended:
            return False
        
        # Check if reconciled today
        today = timezone.now().date()
        if obj.last_reconciled_at and obj.last_reconciled_at.date() == today:
            return False
        
        # Needs reconciliation if has balance or had collections today
        if obj.current_balance > 0:
            return True
        
        # Check if had collections today
        has_collections_today = obj.cash_collections.filter(
            collection_date=today,
            is_posted=True
        ).exists()
        
        return has_collections_today
    
    def create(self, validated_data):
        """
        Auto-create a child bank account when cashier is created if 'account' is not provided.
        This eliminates the need for manual GL account selection.
        
        Also auto-assigns the current user as cashier if not provided.
        """
        from accounts.models import Account, AccountCategory
        
        # Get request context
        request = self.context.get('request')
        user = request.user if request else None
        
        # Auto-assign current user as cashier if not provided
        if not validated_data.get('cashier'):
            validated_data['cashier'] = user
        
        # If account is already provided, use it
        if 'account' in validated_data and validated_data.get('account'):
            return super().create(validated_data)
        
        # Auto-create child bank account for this cashier
        branch = validated_data.get('branch') or (user.branch if hasattr(user, 'branch') else None)
        
        # Find or create "Cashier Accounts" parent account
        try:
            # Try to find existing "Cash and Cash Equivalents" parent account (4-digit scheme)
            parent_account = Account.objects.filter(
                account_type=Account.ASSET,
                account_level=Account.LEVEL_PARENT,
                owner=user,
                branch=branch
            ).filter(
                models.Q(name__icontains='Cash and Cash Equivalents') |
                models.Q(name__icontains='Cashier') |
                models.Q(name__icontains='Petty Cash') |
                models.Q(code='1100')  # FIRS 4-digit code for cash accounts
            ).first()

            # If not found, create a parent account
            if not parent_account:
                parent_account = Account.objects.create(
                    code='1100',
                    name='Cash and Cash Equivalents',
                    account_type=Account.ASSET,
                    account_level=Account.LEVEL_PARENT,
                    owner=user,
                    branch=branch,
                    allow_manual_entries=False,
                    is_system_account=True
                )
        except Exception as e:
            raise serializers.ValidationError(f"Failed to create parent account: {str(e)}")

        # Generate child account code using 4-digit scheme (1101, 1102, â€¦)
        existing_children = Account.objects.filter(
            parent=parent_account,
            owner=user,
            branch=branch
        ).count()
        parent_int = int(parent_account.code)
        seq = existing_children + 1
        child_code = str(parent_int + seq)
        # Avoid collisions with already-existing accounts
        while Account.objects.filter(owner=user, branch=branch, code=child_code).exists():
            seq += 1
            child_code = str(parent_int + seq)
        
        # Create child bank account for this cashier
        try:
            child_account = Account.objects.create(
                code=child_code,
                name=f"{validated_data['name']} - Cash Account",
                account_type=Account.ASSET,
                account_level=Account.LEVEL_CHILD,
                parent=parent_account,
                owner=user,
                branch=branch,
                allow_manual_entries=True,
                is_cashier_bank=True
            )
            
            validated_data['account'] = child_account
        except Exception as e:
            raise serializers.ValidationError(f"Failed to create child account: {str(e)}")
        
        return super().create(validated_data)


class CashCollectionSerializer(serializers.ModelSerializer):
    """
    Cash Receipt - Step 1 of Cash Process
    Cashier issues receipt for payment received
    
    The income account is automatically derived from the receivable (invoice/entitlement/loan) being paid.
    Double-entry accounting: Debit Cashier Account (ASSET), Credit Income Account (INCOME)
    """
    cashier_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    posted_by_name = serializers.SerializerMethodField()
    receivable_reference = serializers.SerializerMethodField()
    income_account_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CashCollection
        fields = [
            'id', 'receipt_number', 'cashier_account', 'cashier_name',
            'client', 'client_name', 'receivable', 'receivable_reference',
            'income_account_name',
            'collection_date',
            'amount_due', 'amount_collected', 'variance', 'variance_action',
            'payment_purpose', 'reference_number', 'collection_mode',
            'is_posted', 'posted_at', 'posted_by', 'posted_by_name',
            'journal_entry', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'receipt_number', 'variance', 'is_posted', 'posted_at', 
            'posted_by', 'journal_entry', 'created_at', 'updated_at'
        ]
    
    def get_cashier_name(self, obj):
        return obj.cashier_account.name if obj.cashier_account else None
    
    def get_client_name(self, obj):
        return obj.client.full_name if obj.client else None
    
    def get_receivable_reference(self, obj):
        """Return reference number of the invoice/entitlement being paid"""
        if obj.receivable:
            return obj.receivable.reference_number
        return None
    
    def get_income_account_name(self, obj):
        """Derive income account name from the receivable"""
        if not obj.receivable:
            return None
        
        invoice_or_entitlement = obj.receivable.content_object
        if not invoice_or_entitlement:
            return None
        
        # Get income account through fee_structure chain
        income_account = None
        if hasattr(invoice_or_entitlement, 'fee_structure') and invoice_or_entitlement.fee_structure:
            fee_structure = invoice_or_entitlement.fee_structure
            if hasattr(fee_structure, 'category') and fee_structure.category:
                income_account = fee_structure.category.income_account
        elif hasattr(invoice_or_entitlement, 'income_account'):
            income_account = invoice_or_entitlement.income_account
        
        if income_account:
            return f"{income_account.code} - {income_account.name}"
        
        return None
    
    def get_posted_by_name(self, obj):
        return obj.posted_by.get_full_name() if obj.posted_by else None
    
    def validate(self, data):
        """Validate collection"""
        # Ensure receivable is provided
        receivable = data.get('receivable')
        if not receivable:
            raise serializers.ValidationError({
                'receivable': 'Receivable (invoice/entitlement/loan) is required. '
                             'The income account is automatically derived from the receivable.'
            })
        
        # Ensure cashier is active
        cashier_account = data.get('cashier_account')
        if cashier_account and (not cashier_account.is_active or cashier_account.is_suspended):
            raise serializers.ValidationError({
                'cashier_account': 'Cashier account is not active or is suspended'
            })
        
        # Check daily limit
        collection_date = data.get('collection_date', timezone.now().date())
        amount_collected = data.get('amount_collected', Decimal('0.00'))
        
        if cashier_account and cashier_account.daily_collection_limit:
            today_collections = cashier_account.cash_collections.filter(
                collection_date=collection_date,
                is_posted=True
            ).aggregate(total=models.Sum('amount_collected'))['total'] or Decimal('0.00')
            
            if today_collections + amount_collected > cashier_account.daily_collection_limit:
                raise serializers.ValidationError({
                    'amount_collected': f'Exceeds daily collection limit of {cashier_account.daily_collection_limit}'
                })
        
        return data


class CashReconciliationSerializer(serializers.ModelSerializer):
    """
    Daily Cash Reconciliation - Step 2 of Cash Process
    Cashier prepares daily summary, Finance Officer signs off
    """
    cashier_name = serializers.SerializerMethodField()
    reconciled_by_name = serializers.SerializerMethodField()
    finance_officer_name = serializers.SerializerMethodField()
    is_balanced = serializers.SerializerMethodField()
    requires_signoff = serializers.SerializerMethodField()
    
    class Meta:
        model = CashReconciliation
        fields = [
            'id', 'cashier_account', 'cashier_name', 'reconciliation_date',
            'system_balance', 'physical_count', 'variance',
            'total_collections', 'total_transfers', 'status',
            'denomination_details', 'variance_explanation',
            'reconciled_by', 'reconciled_by_name',
            'finance_officer_signoff', 'finance_officer_name',
            'finance_officer_signoff_at', 'finance_officer_notes',
            'deposit_required', 'deposit_completed', 'deposit_slip_number',
            'deposit_timestamp', 'is_balanced', 'requires_signoff',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'variance', 'status', 'finance_officer_signoff_at',
            'created_at', 'updated_at'
        ]
    
    def get_cashier_name(self, obj):
        return obj.cashier_account.name if obj.cashier_account else None
    
    def get_reconciled_by_name(self, obj):
        return obj.reconciled_by.get_full_name() if obj.reconciled_by else None
    
    def get_finance_officer_name(self, obj):
        return obj.finance_officer_signoff.get_full_name() if obj.finance_officer_signoff else None
    
    def get_is_balanced(self, obj):
        return obj.variance == Decimal('0.00')
    
    def get_requires_signoff(self, obj):
        """Check if waiting for finance officer sign-off"""
        return obj.reconciled_by is not None and obj.finance_officer_signoff is None


class FinanceOfficerSignoffSerializer(serializers.Serializer):
    """Serializer for finance officer to sign off on reconciliation"""
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def update(self, instance, validated_data):
        """Sign off on reconciliation"""
        user = self.context['request'].user
        
        instance.finance_officer_signoff = user
        instance.finance_officer_signoff_at = timezone.now()
        instance.finance_officer_notes = validated_data.get('notes', '')
        instance.save(update_fields=[
            'finance_officer_signoff',
            'finance_officer_signoff_at', 
            'finance_officer_notes'
        ])
        
        return instance


class CashTransferSerializer(serializers.ModelSerializer):
    """
    Daily Deposit - Step 3 of Cash Process
    All funds deposited into bank daily (no holding overnight)
    """
    cashier_name = serializers.SerializerMethodField()
    destination_account_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = CashTransfer
        fields = [
            'id', 'transfer_number', 'cashier_account', 'cashier_name',
            'destination_account', 'destination_account_name',
            'transfer_date', 'amount',
            'bank_deposit_slip', 'bank_reference', 'deposit_proof',
            'status', 'status_display',
            'submitted_at', 'submitted_by', 'submitted_by_name',
            'approved_at', 'approved_by', 'approved_by_name',
            'approval_notes', 'rejection_reason',
            'posted_at', 'posted_by', 'journal_entry',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'transfer_number', 'status',
            'submitted_at', 'submitted_by',
            'approved_at', 'approved_by',
            'posted_at', 'posted_by', 'journal_entry',
            'created_at', 'updated_at'
        ]
    
    def get_cashier_name(self, obj):
        return obj.cashier_account.name if obj.cashier_account else None
    
    def get_destination_account_name(self, obj):
        return obj.destination_account.name if obj.destination_account else None
    
    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None


class CashTransferActionSerializer(serializers.Serializer):
    """Serializer for transfer actions (submit, approve, reject)"""
    action = serializers.ChoiceField(choices=['submit', 'approve', 'reject'])
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        if data['action'] == 'reject' and not data.get('notes'):
            raise serializers.ValidationError({
                'notes': 'Rejection reason is required'
            })
        return data


class BankReconciliationSerializer(serializers.ModelSerializer):
    """
    Monthly Bank Reconciliation - Step 4 of Cash Process
    Independent staff reconciles bank statement against GL
    """
    bank_account_name = serializers.SerializerMethodField()
    prepared_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reconciling_items_summary = serializers.SerializerMethodField()
    is_balanced = serializers.SerializerMethodField()
    
    class Meta:
        model = BankReconciliation
        fields = [
            'id', 'bank_account', 'bank_account_name',
            'reconciliation_period_start', 'reconciliation_period_end',
            'reconciliation_date',
            'bank_opening_balance', 'gl_opening_balance',
            'bank_closing_balance', 'gl_closing_balance',
            'deposits_in_transit', 'outstanding_checks',
            'bank_charges', 'bank_interest',
            'bank_errors', 'gl_errors',
            'reconciled_balance', 'variance',
            'status', 'status_display', 'is_balanced',
            'prepared_by', 'prepared_by_name', 'prepared_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'approval_notes',
            'variance_explanation', 'variance_resolved',
            'variance_resolved_at', 'variance_resolved_by',
            'bank_statement', 'supporting_documents',
            'reconciling_items', 'reconciling_items_summary',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'reconciled_balance', 'variance', 'status',
            'prepared_at', 'approved_at',
            'variance_resolved_at', 'created_at', 'updated_at'
        ]
    
    def get_bank_account_name(self, obj):
        return obj.bank_account.name if obj.bank_account else None
    
    def get_prepared_by_name(self, obj):
        return obj.prepared_by.get_full_name() if obj.prepared_by else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_is_balanced(self, obj):
        return abs(obj.variance) < Decimal('0.01')  # Allow for rounding
    
    def get_reconciling_items_summary(self, obj):
        return obj.get_reconciling_items_summary()
    
    def validate(self, data):
        """Validate bank reconciliation"""
        # Ensure period end is after period start
        if data.get('reconciliation_period_end') and data.get('reconciliation_period_start'):
            if data['reconciliation_period_end'] <= data['reconciliation_period_start']:
                raise serializers.ValidationError({
                    'reconciliation_period_end': 'End date must be after start date'
                })
        
        # Ensure bank account is ASSET type
        bank_account = data.get('bank_account')
        if bank_account and bank_account.account_type != 'ASSET':
            raise serializers.ValidationError({
                'bank_account': 'Bank account must be an ASSET type account'
            })
        
        return data


class BankReconciliationActionSerializer(serializers.Serializer):
    """Serializer for bank reconciliation actions (approve, reject)"""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        if data['action'] == 'reject' and not data.get('notes'):
            raise serializers.ValidationError({
                'notes': 'Rejection reason is required'
            })
        return data


class DailyCashSummarySerializer(serializers.Serializer):
    """
    Summary of daily cash activities for a specific date
    Used for dashboard and reporting
    """
    date = serializers.DateField()
    total_collections = serializers.DecimalField(max_digits=18, decimal_places=2)
    collection_count = serializers.IntegerField()
    total_deposits = serializers.DecimalField(max_digits=18, decimal_places=2)
    deposit_count = serializers.IntegerField()
    pending_reconciliations = serializers.IntegerField()
    completed_reconciliations = serializers.IntegerField()
    cashiers_need_reconciliation = serializers.ListField(child=serializers.CharField())
    cashiers_without_signoff = serializers.ListField(child=serializers.CharField())
    
    # Compliance metrics
    all_reconciled = serializers.BooleanField()
    all_signed_off = serializers.BooleanField()
    all_deposited = serializers.BooleanField()
    compliance_percentage = serializers.IntegerField()


# ============================================
# PETTY CASH SERIALIZERS
# ============================================

class PettyCashFundSerializer(serializers.ModelSerializer):
    """Petty Cash Fund serializer"""
    custodian_name = serializers.SerializerMethodField()
    alternate_custodian_name = serializers.SerializerMethodField()
    petty_cash_account_name = serializers.SerializerMethodField()
    petty_cash_account_code = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    needs_replenishment = serializers.ReadOnlyField()
    disbursed_amount = serializers.ReadOnlyField()
    pending_vouchers_count = serializers.SerializerMethodField()
    
    class Meta:
        from .models import PettyCashFund
        model = PettyCashFund
        fields = [
            'id', 'fund_name', 'fund_code', 'custodian', 'custodian_name',
            'alternate_custodian', 'alternate_custodian_name',
            'petty_cash_account', 'petty_cash_account_name', 'petty_cash_account_code',
            'float_amount', 'current_balance', 'replenishment_threshold',
            'single_transaction_limit', 'status', 'established_date',
            'last_replenishment_date', 'last_audit_date',
            'needs_replenishment', 'disbursed_amount', 'pending_vouchers_count',
            'branch', 'branch_name', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['current_balance', 'last_replenishment_date', 'created_at', 'updated_at']
    
    def get_custodian_name(self, obj):
        return obj.custodian.get_full_name() if obj.custodian else None
    
    def get_alternate_custodian_name(self, obj):
        return obj.alternate_custodian.get_full_name() if obj.alternate_custodian else None
    
    def get_petty_cash_account_name(self, obj):
        return obj.petty_cash_account.name if obj.petty_cash_account else None
    
    def get_petty_cash_account_code(self, obj):
        return obj.petty_cash_account.code if obj.petty_cash_account else None
    
    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None
    
    def get_pending_vouchers_count(self, obj):
        return obj.vouchers.filter(status='pending').count()


class PettyCashVoucherSerializer(serializers.ModelSerializer):
    """Petty Cash Voucher serializer"""
    fund_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    expense_category_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    disbursed_by_name = serializers.SerializerMethodField()
    retired_by_name = serializers.SerializerMethodField()
    replenishment_number = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    transaction_reference = serializers.SerializerMethodField()

    # fund is required by the DB, but we allow it to be omitted on the API
    # request so that perform_create can auto-provision the default fund.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .models import PettyCashFund
        from expenses.models import ExpenseCategory

        self.fields['fund'] = serializers.PrimaryKeyRelatedField(
            queryset=PettyCashFund.objects.all(),
            required=False,
            allow_null=True,
            default=None,
        )

        # Scope expense_category to the current user's branch so that pks
        # from other tenants are never accepted (avoids "Invalid pk" errors).
        # NOTE: owner is an audit field only â€” scope by branch like OwnerBranchManager.for_user().
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user
            branch = getattr(user, 'branch', None)
            if branch:
                cat_qs = ExpenseCategory.objects.filter(branch=branch)
            else:
                # No branch â€” fall back to all records (system admin scenario)
                cat_qs = ExpenseCategory.objects.all()
        else:
            cat_qs = ExpenseCategory.objects.none()
        self.fields['expense_category'] = serializers.PrimaryKeyRelatedField(
            queryset=cat_qs,
            required=False,
            allow_null=True,
        )
    
    class Meta:
        from .models import PettyCashVoucher
        model = PettyCashVoucher
        fields = [
            'id', 'fund', 'fund_name', 'voucher_number', 'voucher_date',
            'requested_by', 'requested_by_name', 'purpose', 'amount',
            'expense_category', 'expense_category_name',
            'payee_name', 'payee_phone', 'status',
            'submitted_at', 'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'disbursed_at', 'disbursed_by', 'disbursed_by_name', 'actual_amount_disbursed',
            'receipt_submitted', 'receipt_amount', 'receipt_date', 'receipt_reference',
            'receipt_attachment', 'retired_at', 'retired_by', 'retired_by_name',
            'variance', 'variance_explanation', 'replenishment', 'replenishment_number',
            'journal_entry', 'transaction_reference',
            'branch', 'branch_name', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'voucher_number', 'status', 'submitted_at',
            'requested_by',
            'approved_by', 'approved_at',
            'rejected_by', 'rejected_at',
            'disbursed_at', 'disbursed_by',
            'retired_at', 'retired_by',
            'variance', 'journal_entry',
            'transaction_reference', 'created_at', 'updated_at'
        ]
    
    def get_fund_name(self, obj):
        return obj.fund.fund_name if obj.fund else None
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None
    
    def get_expense_category_name(self, obj):
        return obj.expense_category.name if obj.expense_category else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None
    
    def get_disbursed_by_name(self, obj):
        return obj.disbursed_by.get_full_name() if obj.disbursed_by else None
    
    def get_retired_by_name(self, obj):
        return obj.retired_by.get_full_name() if obj.retired_by else None
    
    def get_replenishment_number(self, obj):
        return obj.replenishment.replenishment_number if obj.replenishment else None
    
    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None

    def get_transaction_reference(self, obj):
        """Return the GL transaction reference number once disbursed."""
        return obj.journal_entry.reference_number if obj.journal_entry_id else None
    
    def validate_amount(self, value):
        """Validate amount is positive"""
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value


class PettyCashVoucherActionSerializer(serializers.Serializer):
    """Serializer for voucher actions (approve, reject, disburse, etc.)"""
    notes = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False)
    receipt_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False)
    receipt_date = serializers.DateField(required=False)
    receipt_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    variance_explanation = serializers.CharField(required=False, allow_blank=True)


class PettyCashReplenishmentSerializer(serializers.ModelSerializer):
    """Petty Cash Replenishment serializer"""
    fund_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    posted_by_name = serializers.SerializerMethodField()
    replenishment_source_name = serializers.SerializerMethodField()
    replenishment_source_code = serializers.SerializerMethodField()
    bank_account_number = serializers.CharField(source='bank_account.account_number', read_only=True)
    bank_account_name_display = serializers.CharField(source='bank_account.account_name', read_only=True)
    bank_name = serializers.CharField(source='bank_account.bank.bank_name', read_only=True)
    vouchers_count = serializers.SerializerMethodField()
    # Read-only list of linked voucher IDs (for display in detail view)
    vouchers = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()

    # Custodian's explicit request amount (defaults to auto-calculated replenishment_amount)
    requested_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False, allow_null=True, default=None
    )
    # Amount approved by the approver (may be less than requested_amount)
    approved_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False, allow_null=True, read_only=False,
        default=None
    )

    # Write-only: explicit list of retired voucher IDs to include.
    # The backend uses these to auto-compute period_start/end, totals,
    # replenishment_amount, and fund_balance_before.
    voucher_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
        help_text="IDs of retired vouchers to include in this replenishment"
    )

    # Make backend-computed fields optional on writes (perform_create fills them)
    period_start = serializers.DateField(required=False, allow_null=True, default=None)
    period_end = serializers.DateField(required=False, allow_null=True, default=None)
    replenishment_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False, allow_null=True, default=None
    )
    fund_balance_before = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False, allow_null=True, default=None
    )
    # replenishment_source queryset is assigned in __init__ to avoid circular
    # import / AppRegistryNotReady issues at class-definition time.

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import Account
        self.fields['replenishment_source'] = serializers.PrimaryKeyRelatedField(
            queryset=Account.objects.all(),
            required=False,
            allow_null=True,
            default=None,
        )

    class Meta:
        from .models import PettyCashReplenishment
        model = PettyCashReplenishment
        fields = [
            'id', 'fund', 'fund_name', 'replenishment_number', 'replenishment_date',
            'period_start', 'period_end',
            'total_vouchers_amount', 'total_receipts_amount', 'total_variance',
            'replenishment_amount', 'requested_amount', 'approved_amount',
            'fund_balance_before', 'fund_balance_after',
            'replenishment_source', 'replenishment_source_name', 'replenishment_source_code',
            'bank_account', 'bank_account_number', 'bank_account_name_display', 'bank_name',
            'status', 'submitted_by', 'submitted_by_name', 'submitted_at',
            'verified_by', 'verified_by_name', 'verified_at', 'verification_notes',
            'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'posted_at', 'posted_by', 'posted_by_name', 'journal_entry',
            'expense_breakdown', 'vouchers_count', 'vouchers', 'voucher_ids',
            'branch', 'branch_name', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'replenishment_number', 'status',
            'submitted_by', 'submitted_at',
            'verified_by', 'verified_at',
            'approved_by', 'approved_at', 'approved_amount',
            'rejected_by', 'rejected_at',
            'posted_at', 'posted_by', 'journal_entry', 'fund_balance_after',
            'expense_breakdown', 'created_at', 'updated_at'
        ]
    
    def get_fund_name(self, obj):
        return obj.fund.fund_name if obj.fund else None
    
    def get_submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else None
    
    def get_verified_by_name(self, obj):
        return obj.verified_by.get_full_name() if obj.verified_by else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None
    
    def get_posted_by_name(self, obj):
        return obj.posted_by.get_full_name() if obj.posted_by else None
    
    def get_replenishment_source_name(self, obj):
        return obj.replenishment_source.name if obj.replenishment_source else None
    
    def get_replenishment_source_code(self, obj):
        return obj.replenishment_source.code if obj.replenishment_source else None
    
    def get_vouchers_count(self, obj):
        return obj.vouchers.count()

    def get_vouchers(self, obj):
        """Return list of voucher IDs linked to this replenishment"""
        return list(obj.vouchers.values_list('id', flat=True))

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else None


class PettyCashReplenishmentActionSerializer(serializers.Serializer):
    """Serializer for replenishment actions"""
    notes = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)
    approved_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False, allow_null=True
    )


class PettyCashReceiptSerializer(serializers.ModelSerializer):
    """Serializer for petty cash receipts"""
    uploaded_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = PettyCashReceipt
        fields = [
            'id', 'voucher', 'file', 'file_name', 'file_size', 'file_type',
            'description', 'uploaded_by', 'uploaded_by_name', 'uploaded_at', 'file_url'
        ]
        read_only_fields = ['id', 'file_name', 'file_size', 'file_type', 'uploaded_by', 'uploaded_at', 'file_url']
    
    def get_uploaded_by_name(self, obj):
        """Get uploader's full name"""
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None
    
    def get_file_url(self, obj):
        """Get file URL"""
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def create(self, validated_data):
        """Create receipt with uploader tracking"""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['uploaded_by'] = request.user
        return super().create(validated_data)


# ============================================================================
# Daily Collection Workflow Serializers
# ============================================================================

class _LazyBankAccountField(serializers.PrimaryKeyRelatedField):
    """
    PrimaryKeyRelatedField whose queryset is resolved lazily to avoid circular imports.
    For credit_officer role: restricted to their own branch's bank accounts only.
    BM and above: see all active bank accounts.
    """
    def get_queryset(self):
        try:
            from banks.models import BankAccount
            qs = BankAccount.objects.filter(is_active=True)
            request = self.context.get('request')
            if request and request.user and request.user.is_authenticated:
                try:
                    staff = request.user.staff_profile
                    if staff.role_level == 'credit_officer' and staff.branch_id:
                        qs = qs.filter(branch_id=staff.branch_id)
                except Exception:
                    pass
            return qs
        except ImportError:
            return super().get_queryset()


class CollectionSheetItemSerializer(serializers.ModelSerializer):
    """Read serializer for a CollectionSheetItem."""
    client_name = serializers.SerializerMethodField()
    collection_type_display = serializers.CharField(
        source='get_collection_type_display', read_only=True
    )
    payment_mode_display = serializers.CharField(
        source='get_payment_mode_display', read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )
    transfer_status_display = serializers.CharField(
        source='get_transfer_confirmation_status_display', read_only=True
    )
    transfer_confirmed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CollectionSheetItem
        fields = [
            'id', 'sheet', 'client', 'client_name',
            'collection_type', 'collection_type_display',
            'loan_account', 'loan_installment', 'savings_account',
            'amount_expected', 'amount_collected',
            'payment_mode', 'payment_mode_display',
            'bank_reference', 'bank_account_credited',
            'transfer_confirmation_status', 'transfer_status_display',
            'transfer_confirmed_by', 'transfer_confirmed_by_name',
            'transfer_confirmed_at',
            'status', 'status_display',
            'is_posted', 'posted_at', 'journal_entry',
            'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'is_posted', 'posted_at', 'journal_entry',
            'transfer_confirmed_by', 'transfer_confirmed_at',
            'created_at', 'updated_at',
        ]

    def get_client_name(self, obj):
        if obj.client_id:
            return obj.client.full_name if hasattr(obj.client, 'full_name') else str(obj.client)
        return None

    def get_transfer_confirmed_by_name(self, obj):
        if obj.transfer_confirmed_by:
            return obj.transfer_confirmed_by.get_full_name() or obj.transfer_confirmed_by.username
        return None


class CollectionSheetItemCreateSerializer(serializers.ModelSerializer):
    """Write serializer for adding ad-hoc items to a sheet."""

    class Meta:
        model = CollectionSheetItem
        fields = [
            'sheet', 'client', 'collection_type',
            'loan_account', 'loan_installment', 'savings_account',
            'amount_expected', 'amount_collected',
            'payment_mode', 'bank_reference', 'bank_account_credited',
            'transfer_confirmation_status',
            'notes',
        ]

    def validate(self, attrs):
        ct = attrs.get('collection_type')
        if ct in ('loan_repayment', 'processing_fee') and not attrs.get('loan_account'):
            raise serializers.ValidationError(
                {'loan_account': 'Required for loan_repayment and processing_fee items.'}
            )
        if ct == 'savings_deposit' and not attrs.get('savings_account'):
            raise serializers.ValidationError(
                {'savings_account': 'Required for savings_deposit items.'}
            )
        return attrs


class CollectItemSerializer(serializers.Serializer):
    """
    Payload for the ``collect`` action on CollectionSheetItemViewSet.
    Records what the officer actually received from the client.
    Does NOT post to GL — use ``post_payment`` for that.
    """
    amount_collected = serializers.DecimalField(
        max_digits=18, decimal_places=2, min_value=Decimal('0.01'),
    )
    payment_mode = serializers.ChoiceField(
        choices=CollectionSheetItem.PAYMENT_MODE_CHOICES,
        default='cash',
    )
    bank_reference = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default='',
    )
    bank_account_credited = _LazyBankAccountField(
        required=False,
        allow_null=True,
        help_text='The KTIL bank account the client transferred into (if applicable).',
    )
    status = serializers.ChoiceField(
        choices=CollectionSheetItem.ITEM_STATUS_CHOICES,
        default='collected',
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ConfirmTransferSerializer(serializers.Serializer):
    """Payload for the ``confirm_transfer`` action."""
    bank_account_credited = _LazyBankAccountField(
        required=False,
        allow_null=True,
        help_text='If the BankAccount was not set on the item, provide it here.',
    )


class RejectTransferSerializer(serializers.Serializer):
    """Payload for the ``reject_transfer`` action."""
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class DailyCollectionSheetSerializer(serializers.ModelSerializer):
    """
    List serializer for DailyCollectionSheet — totals only, no nested items.
    """
    credit_officer_name = serializers.SerializerMethodField()
    submitted_to_name = serializers.SerializerMethodField()
    reconciled_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )
    total_items = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()

    class Meta:
        model = DailyCollectionSheet
        fields = [
            'id', 'credit_officer', 'credit_officer_name',
            'collection_date', 'status', 'status_display',
            'total_expected', 'total_collected_cash',
            'total_confirmed_transfers', 'total_unconfirmed_transfers',
            'total_items', 'total_collected',
            'submitted_at', 'submitted_to', 'submitted_to_name',
            'reconciled_at', 'reconciled_by', 'reconciled_by_name',
            'overdue_notified', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'total_expected', 'total_collected_cash',
            'total_confirmed_transfers', 'total_unconfirmed_transfers',
            'submitted_at', 'reconciled_at', 'overdue_notified',
            'created_at', 'updated_at',
        ]

    def get_credit_officer_name(self, obj):
        if obj.credit_officer_id:
            o = obj.credit_officer
            return f"{o.first_name} {o.last_name}".strip() or str(o)
        return None

    def get_submitted_to_name(self, obj):
        if obj.submitted_to_id:
            s = obj.submitted_to
            return f"{s.first_name} {s.last_name}".strip() or str(s)
        return None

    def get_reconciled_by_name(self, obj):
        if obj.reconciled_by_id:
            return obj.reconciled_by.get_full_name() or obj.reconciled_by.username
        return None

    def get_total_items(self, obj):
        return obj.items.count()

    def get_total_collected(self, obj):
        return (
            (obj.total_collected_cash or Decimal('0.00')) +
            (obj.total_confirmed_transfers or Decimal('0.00'))
        )


class DailyCollectionSheetDetailSerializer(DailyCollectionSheetSerializer):
    """
    Detail serializer ï¿½ includes nested items.
    """
    items = CollectionSheetItemSerializer(many=True, read_only=True)

    class Meta(DailyCollectionSheetSerializer.Meta):
        fields = DailyCollectionSheetSerializer.Meta.fields + ['items']


class DailyCollectionSheetCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating a collection sheet."""

    class Meta:
        model = DailyCollectionSheet
        fields = [
            'credit_officer', 'collection_date', 'notes',
        ]

    def validate(self, attrs):
        officer = attrs.get('credit_officer')
        date = attrs.get('collection_date')
        if officer and date:
            if DailyCollectionSheet.objects.filter(
                credit_officer=officer, collection_date=date
            ).exists():
                raise serializers.ValidationError(
                    f"A collection sheet already exists for {officer} on {date}."
                )
        return attrs


class _LazyStaffField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        try:
            from hr.models import Staff
            return Staff.objects.all()
        except ImportError:
            return super().get_queryset()


class SubmitSheetSerializer(serializers.Serializer):
    """Payload for the ``submit`` action."""
    submitted_to = _LazyStaffField(
        required=False,
        allow_null=True,
        help_text='Staff ID of the superior the sheet is handed to.',
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
