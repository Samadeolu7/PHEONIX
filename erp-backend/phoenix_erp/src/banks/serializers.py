# banks/serializers.py
"""
Serializers for Bank Management System
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP

from common.serializers import TenantModelSerializer
from .models import Bank, BankAccount, BankTransfer, BankPayment, BankAccountBalanceLog, BankFeedConsent, BankStatementUpload, BankStatementLine
from accounts.models import Account
from cash_management.models import CashierAccount
from accounts.serializers import AccountSerializer


User = get_user_model()


class BankSerializer(TenantModelSerializer):
    """Serializer for Bank model"""
    
    accounts_count = serializers.SerializerMethodField()
    total_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Bank
        fields = [
            'id', 'bank_name', 'bank_code', 'branch_name',
            'address', 'phone', 'email',
            'account_manager_name', 'account_manager_phone', 'account_manager_email',
            'is_active', 'notes',
            'accounts_count', 'total_balance',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_accounts_count(self, obj):
        """Get number of active accounts at this bank"""
        return obj.accounts.filter(is_active=True, is_deleted=False).count()
    
    def get_total_balance(self, obj):
        """Sum GL account balances for all active accounts at this bank."""
        from django.db.models import Sum
        from accounts.models import Account
        total = Account.objects.filter(
            bank_account__bank=obj,
            bank_account__is_active=True,
            bank_account__is_deleted=False,
        ).aggregate(total=Sum('balance'))['total']
        return total if total else Decimal('0')


class BankAccountSerializer(TenantModelSerializer):
    """Serializer for BankAccount model"""
    
    bank_name = serializers.CharField(write_only=True, required=False, help_text="Bank name - will auto-create or find bank")
    new_bank_code = serializers.CharField(write_only=True, required=False, allow_blank=True, help_text="Bank code for newly created bank")
    new_bank_branch = serializers.CharField(write_only=True, required=False, allow_blank=True, help_text="Branch name for newly created bank")
    bank_display_name = serializers.CharField(source='bank.bank_name', read_only=True)
    bank_branch = serializers.CharField(source='bank.branch_name', read_only=True)
    bank_code_display = serializers.CharField(source='bank.bank_code', read_only=True)
    account_manager_name = serializers.SerializerMethodField()
    gl_account_code = serializers.SerializerMethodField()
    gl_account_name = serializers.SerializerMethodField()
    available_balance = serializers.SerializerMethodField()
    current_balance = serializers.SerializerMethodField()

    class Meta:
        model = BankAccount
        fields = [
            'id', 'bank', 'bank_name', 'new_bank_code', 'new_bank_branch',
            'bank_display_name', 'bank_branch', 'bank_code_display',
            'account_number', 'account_name', 'account_type', 'currency',
            'gl_account', 'gl_account_code', 'gl_account_name',
            'account_manager', 'account_manager_name',
            'current_balance', 'available_balance',
            'daily_withdrawal_limit', 'monthly_transaction_limit',
            'requires_dual_approval', 'dual_approval_threshold',
            'is_active', 'is_suspended', 'is_cashier_collection_account',
            'iban', 'swift_code', 'date_opened', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {
            'bank': {'required': False},
            'gl_account': {'required': False, 'allow_null': True},
            'account_manager': {'required': False},
            'current_balance': {'read_only': True},
        }
    
    def get_account_manager_name(self, obj):
        """Get account manager full name"""
        if obj.account_manager:
            return obj.account_manager.get_full_name() or obj.account_manager.username
        return None
    
    def get_available_balance(self, obj):
        """Get available balance after pending transactions"""
        return obj.get_available_balance()
    
    def get_current_balance(self, obj):
        """Always read live balance from the linked GL account."""
        if obj.gl_account_id:
            try:
                return obj.gl_account.balance
            except Exception:
                pass
        return obj.current_balance

    def get_available_balance(self, obj):
        """Available = GL balance minus pending outgoing transfers."""
        from django.db.models import Sum
        gl_balance = obj.gl_account.balance if obj.gl_account_id else obj.current_balance
        pending_out = obj.outgoing_transfers.filter(
            status__in=['pending', 'approved']
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return gl_balance - pending_out

    def get_gl_account_code(self, obj):
        return obj.gl_account.code if obj.gl_account_id else None

    def get_gl_account_name(self, obj):
        return obj.gl_account.name if obj.gl_account_id else None

    def validate_gl_account(self, value):
        """Validate GL account is appropriate for bank account"""
        if value is None:
            return value  # Will be auto-created in model.save()

        if value.account_type != 'ASSET':
            raise serializers.ValidationError(
                f'Bank accounts must use ASSET type GL accounts. '
                f'Selected account is type "{value.account_type}".'
            )
        
        if value.account_level != Account.LEVEL_CHILD:
            raise serializers.ValidationError(
                f'Bank accounts must use CHILD level GL accounts. '
                f'Selected account is a {value.account_level} account.'
            )
        
        # Check if already linked to another bank account
        if hasattr(value, 'bank_account') and value.bank_account:
            if not self.instance or value.bank_account.id != self.instance.id:
                raise serializers.ValidationError(
                    f'This GL account is already linked to bank account: {value.bank_account}'
                )
        
        return value
    
    def validate(self, data):
        """Validate bank account data"""
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        # Auto-create or find bank if bank_name provided but no bank FK
        if 'bank_name' in data and not data.get('bank'):
            bank_name = data.pop('bank_name')
            new_bank_code = data.pop('new_bank_code', '')
            new_bank_branch = data.pop('new_bank_branch', '')
            if user:
                tenant = getattr(user, 'tenant', None)
                branch = getattr(user, 'branch', None)
                if tenant and branch:
                    bank, _ = Bank.objects.get_or_create(
                        bank_name=bank_name,
                        branch=branch,
                        tenant=tenant,
                        defaults={
                            'owner': user,
                            'created_by': user,
                            'is_active': True,
                            'bank_code': new_bank_code or '',
                            'branch_name': new_bank_branch or '',
                        }
                    )
                    data['bank'] = bank
        else:
            # Remove these even when a bank FK is provided to keep the model clean
            data.pop('new_bank_code', None)
            data.pop('new_bank_branch', None)

        if not data.get('bank'):
            raise serializers.ValidationError({
                'bank': 'Either a bank ID or bank_name must be provided.'
            })

        # Default account_manager to the requesting user if not supplied
        if not data.get('account_manager') and user and getattr(user, 'is_authenticated', False):
            data['account_manager'] = user

        if data.get('requires_dual_approval') and not data.get('dual_approval_threshold'):
            raise serializers.ValidationError({
                'dual_approval_threshold': 'Dual approval threshold is required when dual approval is enabled.'
            })

        return data


class BankAccountDetailSerializer(BankAccountSerializer):
    """Detailed serializer for BankAccount with additional information"""
    
    recent_transactions = serializers.SerializerMethodField()
    pending_transfers_out = serializers.SerializerMethodField()
    pending_transfers_in = serializers.SerializerMethodField()
    
    class Meta(BankAccountSerializer.Meta):
        fields = BankAccountSerializer.Meta.fields + [
            'recent_transactions',
            'pending_transfers_out',
            'pending_transfers_in'
        ]
    
    def get_recent_transactions(self, obj):
        """Get 10 most recent transactions"""
        from transactions.models import TransactionEntry
        
        entries = TransactionEntry.objects.filter(
            account=obj.gl_account
        ).select_related('transaction').order_by('-transaction__date', '-transaction__id')[:10]
        
        return [{
            'date': entry.transaction.date.isoformat(),
            'reference': entry.transaction.reference_number,
            'description': entry.transaction.description,
            'debit': entry.amount if entry.side == 'DEBIT' else Decimal('0'),
            'credit': entry.amount if entry.side == 'CREDIT' else Decimal('0'),
        } for entry in entries]
    
    def get_pending_transfers_out(self, obj):
        """Get pending outgoing transfers"""
        transfers = obj.outgoing_transfers.filter(
            status__in=['pending', 'approved']
        ).aggregate(total=serializers.models.Sum('amount'))['total']
        return transfers if transfers else Decimal('0')
    
    def get_pending_transfers_in(self, obj):
        """Get pending incoming transfers"""
        transfers = obj.incoming_transfers.filter(
            status__in=['pending', 'approved']
        ).aggregate(total=serializers.models.Sum('amount'))['total']
        return transfers if transfers else Decimal('0')


class BankTransferSerializer(TenantModelSerializer):
    """Serializer for BankTransfer model"""

    # Explicit queryset evaluated at import time (no thread-local tenant filter baked in).
    # get_fields() below narrows this to the requesting user's own cashier account at
    # request time so no one can initiate a transfer from someone else's float.
    source_cashier_account = serializers.PrimaryKeyRelatedField(
        queryset=CashierAccount.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    # Destination cashier account (cashier-to-cashier transfers). Unlike
    # source_cashier_account, this is NOT narrowed to "your own" account in
    # get_fields() below — you're sending TO someone else's float, scoped to
    # same-branch active cashier accounts instead.
    destination_cashier_account = serializers.PrimaryKeyRelatedField(
        queryset=CashierAccount.objects.filter(is_active=True, is_suspended=False),
        required=False,
        allow_null=True,
    )

    # Read-only display fields
    source_display = serializers.SerializerMethodField()
    destination_display = serializers.SerializerMethodField()
    initiated_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    second_approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()

    # Status display
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BankTransfer
        fields = [
            'id', 'transfer_number', 'transfer_date',
            'source_type', 'source_cashier_account', 'source_bank_account',
            'source_display', 'destination_type', 'destination_bank_account',
            'destination_cashier_account', 'destination_display',
            'amount', 'description', 'reference_number',
            'status', 'status_display', 'can_approve',
            'initiated_by', 'initiated_by_name', 'initiated_at',
            'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
            'second_approved_by', 'second_approved_by_name', 'second_approved_at', 'second_approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'completed_by', 'completed_by_name', 'completed_at',
            'journal_entry', 'attachment',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'transfer_number', 'initiated_by', 'initiated_at', 'approved_by', 'approved_at',
            'second_approved_by', 'second_approved_at', 'rejected_by', 'rejected_at',
            'completed_by', 'completed_at', 'journal_entry',
            'created_at', 'updated_at'
        ]
    
    def get_fields(self):
        """Narrow source-account choices to the requesting user's own accounts only.

        This prevents any user — including directors — from seeing or selecting
        source accounts that belong to other people.
        """
        fields = super().get_fields()
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            user = request.user
            branch = getattr(user, 'branch', None)

            # Only the cashier's OWN float account may be used as source.
            cashier_qs = CashierAccount.objects.filter(is_active=True, cashier=user)
            fields['source_cashier_account'].queryset = cashier_qs

            # source_bank_account is auto-generated by DRF; replace it with a
            # branch-scoped queryset so other branches' accounts are invisible.
            if 'source_bank_account' in fields:
                bank_qs = BankAccount.objects.filter(is_active=True, is_deleted=False)
                if branch:
                    bank_qs = bank_qs.filter(branch=branch)
                else:
                    tenant = getattr(user, 'tenant', None)
                    if tenant:
                        bank_qs = bank_qs.filter(tenant=tenant)
                fields['source_bank_account'].queryset = bank_qs

            # destination_cashier_account: same-branch active cashier accounts
            # (cashier-to-cashier transfers are branch-restricted — see
            # BankTransfer.clean()). Not narrowed to "own account" — the whole
            # point is sending to someone else's float.
            if 'destination_cashier_account' in fields and branch:
                fields['destination_cashier_account'].queryset = CashierAccount.objects.filter(
                    is_active=True, is_suspended=False, branch=branch
                )

        return fields

    def get_source_display(self, obj):
        """Get human-readable source account"""
        if obj.source_type == 'cashier' and obj.source_cashier_account:
            return f"Cashier: {obj.source_cashier_account.name}"
        elif obj.source_type == 'bank' and obj.source_bank_account:
            return f"Bank: {obj.source_bank_account.bank.bank_name} - {obj.source_bank_account.account_number}"
        return "Unknown"
    
    def get_destination_display(self, obj):
        """Get human-readable destination account"""
        if obj.destination_type == 'cashier' and obj.destination_cashier_account:
            return f"Cashier: {obj.destination_cashier_account.name}"
        if obj.destination_bank_account:
            return f"{obj.destination_bank_account.bank.bank_name} - {obj.destination_bank_account.account_number}"
        return "Unknown"
    
    def get_can_approve(self, obj):
        """
        Whether the requesting user could successfully call approve() on this
        transfer right now — mirrors BankTransferViewSet.approve()'s permission
        branches exactly. Exists because the frontend's approve button was
        previously gated by a single global role-rank check (useApprovalGuard,
        rank >= 4) with no per-transfer awareness, which would hide the button
        entirely from a destination cashier approving a cashier-to-cashier
        transfer (cashiers are not rank >= 4). Computed server-side so the
        frontend never needs to know cashier/account-manager ownership details
        itself, and stays correct if the approval rules change later.
        """
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if obj.status != 'pending':
            return False

        if obj.source_type == 'bank':
            from permissions.services import PermissionResolver
            eff = PermissionResolver.resolve(user, module='banks', page='bank-transfers', action='approve')
            return bool(eff.can_approve)
        if obj.destination_type == 'cashier':
            return bool(obj.destination_cashier_account and obj.destination_cashier_account.cashier == user)
        return bool(obj.destination_bank_account and obj.destination_bank_account.account_manager == user)

    def get_initiated_by_name(self, obj):
        if obj.initiated_by:
            return obj.initiated_by.get_full_name() or obj.initiated_by.username
        return None
    
    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
    
    def get_second_approved_by_name(self, obj):
        if obj.second_approved_by:
            return obj.second_approved_by.get_full_name() or obj.second_approved_by.username
        return None
    
    def get_rejected_by_name(self, obj):
        if obj.rejected_by:
            return obj.rejected_by.get_full_name() or obj.rejected_by.username
        return None
    
    def get_completed_by_name(self, obj):
        if obj.completed_by:
            return obj.completed_by.get_full_name() or obj.completed_by.username
        return None
    
    def validate(self, data):
        """Validate transfer data"""
        # Validate source account based on type
        source_type = data.get('source_type')
        
        if source_type == 'cashier':
            if not data.get('source_cashier_account'):
                raise serializers.ValidationError({
                    'source_cashier_account': 'Cashier account is required when source type is cashier.'
                })
            if data.get('source_bank_account'):
                raise serializers.ValidationError({
                    'source_bank_account': 'Bank account should be empty when source type is cashier.'
                })
        elif source_type == 'bank':
            if not data.get('source_bank_account'):
                raise serializers.ValidationError({
                    'source_bank_account': 'Bank account is required when source type is bank.'
                })
            if data.get('source_cashier_account'):
                raise serializers.ValidationError({
                    'source_cashier_account': 'Cashier account should be empty when source type is bank.'
                })
        
        # Validate amount
        amount = data.get('amount')
        if amount and amount <= 0:
            raise serializers.ValidationError({
                'amount': 'Transfer amount must be greater than zero.'
            })

        # Validate destination account based on type
        destination_type = data.get('destination_type', 'bank')
        destination_bank = data.get('destination_bank_account')
        destination_cashier = data.get('destination_cashier_account')

        if destination_type == 'cashier':
            if not destination_cashier:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Destination cashier account is required when destination type is cashier.'
                })
            if destination_bank:
                raise serializers.ValidationError({
                    'destination_bank_account': 'Bank account should be empty when destination type is cashier.'
                })
            if source_type != 'cashier':
                raise serializers.ValidationError({
                    'destination_type': 'Bank-to-cashier transfers are not supported. Cashier-to-cashier only.'
                })
            source_cashier = data.get('source_cashier_account')
            if source_cashier and destination_cashier and source_cashier == destination_cashier:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Source and destination cashier accounts must be different.'
                })
            if source_cashier and destination_cashier and source_cashier.branch_id != destination_cashier.branch_id:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Cashier-to-cashier transfers must be within the same branch.'
                })
            if not destination_cashier.is_active:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Destination cashier account is not active.'
                })
            if destination_cashier.is_suspended:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Destination cashier account is suspended.'
                })
        else:
            if not destination_bank:
                raise serializers.ValidationError({
                    'destination_bank_account': 'Bank account is required when destination type is bank.'
                })
            if destination_cashier:
                raise serializers.ValidationError({
                    'destination_cashier_account': 'Cashier account should be empty when destination type is bank.'
                })
            if not destination_bank.is_active:
                raise serializers.ValidationError({
                    'destination_bank_account': 'Destination bank account is not active.'
                })
            if destination_bank.is_suspended:
                raise serializers.ValidationError({
                    'destination_bank_account': 'Destination bank account is suspended.'
                })

        return data


class BankTransferActionSerializer(serializers.Serializer):
    """Serializer for bank transfer approval/rejection actions"""
    
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Notes about the action"
    )
    
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Reason for rejection (required for reject action)"
    )


class BankPaymentSerializer(TenantModelSerializer):
    """Serializer for BankPayment model"""

    bank_account_display = serializers.SerializerMethodField()
    accounts_payable_reference = serializers.SerializerMethodField()
    accounts_payable_vendor = serializers.SerializerMethodField()
    expense_reference = serializers.SerializerMethodField()
    expense_description = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    advance_remaining = serializers.SerializerMethodField()

    posting_notes = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bypass_validation = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = BankPayment
        fields = [
            'id', 'payment_number', 'payment_date',
            'bank_account', 'bank_account_display',
            'amount', 'description', 'reference_number',
            'accounts_payable', 'accounts_payable_reference', 'accounts_payable_vendor',
            'expense', 'expense_reference', 'expense_description',
            'supplier', 'supplier_name',
            'advance_applied', 'advance_remaining',
            'status', 'status_display',
            'posted_by', 'posted_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason',
            'journal_entry',
            'posting_notes', 'bypass_validation',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'payment_number', 'status', 'posted_by', 'posted_at',
            'approved_by', 'approved_at', 'rejection_reason',
            'journal_entry', 'advance_applied', 'created_at', 'updated_at'
        ]

    def get_bank_account_display(self, obj):
        if obj.bank_account_id:
            return f"{obj.bank_account.bank.bank_name} - {obj.bank_account.account_number}"
        return None

    def get_accounts_payable_reference(self, obj):
        if obj.accounts_payable_id:
            return obj.accounts_payable.reference_number or obj.accounts_payable.invoice_number
        return None

    def get_accounts_payable_vendor(self, obj):
        if obj.accounts_payable_id:
            return obj.accounts_payable.vendor_name
        return None

    def get_expense_reference(self, obj):
        if obj.expense_id:
            return obj.expense.reference_number
        return None

    def get_expense_description(self, obj):
        if obj.expense_id:
            return obj.expense.description
        return None

    def get_supplier_name(self, obj):
        if obj.supplier_id:
            return obj.supplier.name
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by_id:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_advance_remaining(self, obj):
        """Return the unapplied balance for on-account payments."""
        if obj.supplier_id:
            return str(obj.advance_remaining)
        return None

    def validate(self, data):
        accounts_payable = data.get('accounts_payable')
        expense = data.get('expense')
        supplier = data.get('supplier')

        linked = [accounts_payable, expense, supplier]
        if sum(bool(x) for x in linked) != 1:
            raise serializers.ValidationError(
                'Select exactly one of accounts_payable, expense, or supplier '
                '(on-account payment).'
            )

        amount = data.get('amount')
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({'amount': 'Payment amount must be greater than zero.'})

        if accounts_payable and amount:
            if amount > accounts_payable.amount_due:
                raise serializers.ValidationError({
                    'amount': f'Payment amount exceeds amount due ({accounts_payable.amount_due}).'
                })

        if expense and amount:
            from django.db.models import Sum as _Sum
            from banks.models import BankPayment as _BankPayment
            already_paid = (
                _BankPayment.objects.filter(expense=expense, status='posted')
                .aggregate(total=_Sum('amount'))['total']
            ) or 0
            amount_due = expense.total_amount - already_paid
            if amount > amount_due:
                raise serializers.ValidationError({
                    'amount': f'Payment amount ({amount}) exceeds outstanding balance ({amount_due}) for this expense.'
                })

        if supplier and not supplier.is_active:
            raise serializers.ValidationError({
                'supplier': 'Cannot record payment for an inactive supplier.'
            })

        bank_account = data.get('bank_account')
        if bank_account:
            if not bank_account.is_active:
                raise serializers.ValidationError({'bank_account': 'Bank account is not active.'})
            if bank_account.is_suspended:
                raise serializers.ValidationError({'bank_account': 'Bank account is suspended.'})

        return data

    def create(self, validated_data):
        validated_data.pop('posting_notes', None)
        validated_data.pop('bypass_validation', None)

        # Inject branch from request (branch is not in Meta.fields so the
        # TenantModelSerializer HiddenField default never runs for it)
        request = self.context.get('request')
        if request is not None and not validated_data.get('branch'):
            branch = getattr(getattr(request, 'user', None), 'branch', None)
            if branch:
                validated_data['branch'] = branch

        return super().create(validated_data)



class BankAccountBalanceLogSerializer(serializers.ModelSerializer):
    """Serializer for balance change audit log"""
    
    bank_account_name = serializers.CharField(
        source='bank_account.account_name',
        read_only=True
    )
    changed_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = BankAccountBalanceLog
        fields = [
            'id', 'bank_account', 'bank_account_name',
            'previous_balance', 'new_balance', 'change_amount',
            'transaction_type', 'reference_number',
            'changed_by', 'changed_by_name',
            'created_at'
        ]
        read_only_fields = fields
    
    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.username
        return None


class BankAccountLedgerSerializer(serializers.Serializer):
    """Serializer for bank account ledger report"""
    
    account = serializers.DictField()
    period = serializers.DictField()
    opening_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    closing_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_debits = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_credits = serializers.DecimalField(max_digits=18, decimal_places=2)
    entries = serializers.ListField()
    entry_count = serializers.IntegerField()


class BankFeedConsentSerializer(TenantModelSerializer):
    """Full serializer for BankFeedConsent (used by detail and create/update views)."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    recorded_by_name = serializers.CharField(
        source='recorded_by.get_full_name', read_only=True, default=None
    )

    class Meta:
        model = BankFeedConsent
        fields = [
            'id', 'client', 'client_name',
            'bank_name', 'bank_code', 'account_number', 'account_name',
            'status',
            'consent_granted_at', 'consent_expires_at', 'consent_revoked_at',
            # Tokens intentionally excluded from API output for security
            'phoenix_bank_account',
            'last_sync_at', 'last_sync_status', 'sync_error_detail',
            'recorded_by', 'recorded_by_name', 'notes',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'client_name', 'recorded_by_name',
            'last_sync_at', 'last_sync_status', 'sync_error_detail',
            'consent_revoked_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'client': {'required': True},
            'bank_name': {'required': True},
            'account_number': {'required': True},
        }


class BankFeedConsentListSerializer(TenantModelSerializer):
    """Lightweight list serializer for BankFeedConsent."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)

    class Meta:
        model = BankFeedConsent
        fields = [
            'id', 'client', 'client_name',
            'bank_name', 'account_number',
            'status', 'consent_expires_at', 'last_sync_at',
            'created_at',
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# BankStatementUpload serializers
# ---------------------------------------------------------------------------

class BankStatementLineSerializer(serializers.ModelSerializer):
    matched_transaction_ref = serializers.SerializerMethodField()

    class Meta:
        model = BankStatementLine
        fields = [
            'id', 'upload', 'value_date', 'description',
            'credit_amount', 'debit_amount', 'balance', 'reference',
            'match_status', 'matched_transaction', 'matched_transaction_ref',
            'match_confidence', 'raw_data',
        ]
        read_only_fields = ['id', 'upload', 'match_status', 'matched_transaction', 'match_confidence']

    def get_matched_transaction_ref(self, obj):
        if obj.matched_transaction_id:
            return getattr(obj.matched_transaction, 'reference_number', str(obj.matched_transaction_id))
        return None


class BankStatementUploadSerializer(TenantModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    bank_account_number = serializers.SerializerMethodField()

    class Meta:
        model = BankStatementUpload
        fields = [
            'id', 'bank_account', 'bank_account_number',
            'uploaded_by', 'uploaded_by_name',
            'statement_file', 'statement_date_from', 'statement_date_to',
            'status', 'row_count', 'matched_count', 'unmatched_count',
            'error_detail', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'uploaded_by', 'status', 'row_count', 'matched_count',
            'unmatched_count', 'error_detail', 'created_at', 'updated_at',
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None

    def get_bank_account_number(self, obj):
        return obj.bank_account.account_number if obj.bank_account else None


# ── Daily Reconciliation serializers ────────────────────────────────────────

from .models import DailyReconciliation, ReconciliationException


class ReconciliationExceptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationException
        fields = [
            'id',
            'exception_type',
            'bank_transaction_id',
            'bank_amount', 'bank_narration', 'bank_date',
            'loan_payment_id',
            'erp_amount', 'erp_narration', 'erp_date',
            'resolved', 'resolved_by', 'resolved_at', 'resolution_notes',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class DailyReconciliationSerializer(serializers.ModelSerializer):
    uploaded_by_name  = serializers.SerializerMethodField()
    bank_account_info = serializers.SerializerMethodField()
    exceptions        = ReconciliationExceptionSerializer(many=True, read_only=True)

    class Meta:
        model = DailyReconciliation
        fields = [
            'id',
            'bank_account', 'bank_account_info',
            'reconciliation_date',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at',
            'statement_file',
            'status',
            'total_bank_transactions',
            'matched_count',
            'unmatched_bank_count',
            'unmatched_erp_count',
            'error_detail',
            'exceptions',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'uploaded_by', 'uploaded_at', 'status',
            'total_bank_transactions', 'matched_count',
            'unmatched_bank_count', 'unmatched_erp_count',
            'error_detail', 'created_at', 'updated_at',
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None

    def get_bank_account_info(self, obj):
        if not obj.bank_account:
            return None
        return {
            'id': obj.bank_account.id,
            'account_number': obj.bank_account.account_number,
            'account_name':   obj.bank_account.account_name,
            'bank_name':      obj.bank_account.bank.bank_name if obj.bank_account.bank_id else '',
        }


class DailyReconciliationListSerializer(serializers.ModelSerializer):
    """Lightweight list serializer — no nested exceptions."""
    bank_account_info = serializers.SerializerMethodField()
    uploaded_by_name  = serializers.SerializerMethodField()

    class Meta:
        model = DailyReconciliation
        fields = [
            'id',
            'bank_account', 'bank_account_info',
            'reconciliation_date',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at',
            'status',
            'total_bank_transactions',
            'matched_count',
            'unmatched_bank_count',
            'unmatched_erp_count',
            'created_at',
        ]

    def get_bank_account_info(self, obj):
        if not obj.bank_account:
            return None
        return {
            'id': obj.bank_account.id,
            'account_number': obj.bank_account.account_number,
            'bank_name':      obj.bank_account.bank.bank_name if obj.bank_account.bank_id else '',
        }

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None

