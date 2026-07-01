from rest_framework import serializers
from common.serializers import TenantModelSerializer

from .models import (
    SavingsAccount,
    SavingsGoal,
    ContributionSchedule,
    SmartSavingsAccount,
    SmartSavingsEvent,
    CompulsorySavingsPolicy,
    SavingsProduct,
    WithdrawalApprovalTier,
    SavingsWithdrawalRequest,
    WithdrawalApprovalStep,
)


class SavingsAccountSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    contribution_cycle = serializers.CharField(
        source='product.contribution_cycle', read_only=True
    )
    contribution_amount = serializers.DecimalField(
        source='product.contribution_amount',
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )
    current_balance = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    available_balance = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    smart_savings_active = serializers.SerializerMethodField()

    class Meta:
        model = SavingsAccount
        fields = [
            'id', 'account_number', 'nickname', 'status',
            'client', 'client_name',
            'product', 'product_name',
            'contribution_cycle', 'contribution_amount',
            'contribution_day_of_week',
            'interest_rate', 'interest_calculation_method',
            'minimum_balance', 'allow_overdraft', 'overdraft_limit',
            'auto_renew', 'statement_frequency',
            'opened_on', 'closed_on', 'last_transaction_date',
            'current_balance', 'available_balance',
            'smart_savings_active',
        ]
        read_only_fields = [
            'account_number', 'current_balance', 'available_balance',
            'smart_savings_active',
        ]

    def get_smart_savings_active(self, obj):
        try:
            return obj.smart_account.is_active
        except SavingsAccount.smart_account.RelatedObjectDoesNotExist:
            return False


class ContributionScheduleSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(
        source='savings_account.client.full_name', read_only=True
    )
    account_number = serializers.CharField(
        source='savings_account.account_number', read_only=True
    )
    contribution_cycle = serializers.CharField(
        source='savings_account.product.contribution_cycle', read_only=True
    )
    product_name = serializers.CharField(
        source='savings_account.product.name', read_only=True
    )
    paid_by_name = serializers.CharField(
        source='paid_by.get_full_name', read_only=True, default=None
    )

    class Meta:
        model = ContributionSchedule
        fields = [
            'id', 'savings_account', 'account_number',
            'client_name', 'product_name', 'contribution_cycle',
            'expected_date', 'expected_amount',
            'status', 'paid_on', 'paid_by', 'paid_by_name',
            'savings_transaction',
        ]
        read_only_fields = [
            'status', 'paid_on', 'paid_by', 'savings_transaction',
            'account_number', 'client_name', 'product_name', 'contribution_cycle',
        ]


class SmartSavingsAccountSerializer(serializers.ModelSerializer):
    maturity_date = serializers.DateField(read_only=True)
    matured = serializers.BooleanField(read_only=True)
    account_number = serializers.CharField(
        source='savings.account_number', read_only=True
    )
    client_name = serializers.CharField(
        source='savings.client.full_name', read_only=True
    )

    class Meta:
        model = SmartSavingsAccount
        fields = [
            'id', 'savings', 'account_number', 'client_name',
            'is_active', 'start_date', 'opening_balance',
            'last_interest_date', 'maturity_date', 'matured',
        ]
        read_only_fields = [
            'maturity_date', 'matured', 'last_interest_date',
            'account_number', 'client_name',
        ]


class SmartSavingsEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmartSavingsEvent
        fields = ['id', 'account', 'event_type', 'amount', 'details', 'created_at']
        read_only_fields = ['created_at']


class CompulsorySavingsPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompulsorySavingsPolicy
        fields = ['id', 'amount', 'enabled', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class SavingsGoalSerializer(serializers.ModelSerializer):
    progress_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )

    class Meta:
        model = SavingsGoal
        fields = [
            'id', 'account', 'name', 'target_amount', 'current_amount',
            'target_date', 'auto_save', 'save_frequency', 'save_amount',
            'status', 'progress_percentage',
        ]
        read_only_fields = ['current_amount', 'progress_percentage']


# ---------------------------------------------------------------------------
# Savings product configuration
# ---------------------------------------------------------------------------

class SavingsProductSerializer(TenantModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = SavingsProduct
        fields = [
            'id', 'product', 'product_name',
            'interest_expense_account', 'penalty_income_account',
            'is_daily_contribution', 'first_deposit_is_income', 'first_deposit_income_account',
            'has_savings_cycle', 'cycle_length_months', 'cycle_interest_rate',
            'cycle_break_penalty_rate', 'cycle_auto_renew',
            'withdrawal_needs_approval', 'only_account_manager_can_withdraw',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'product_name', 'owner', 'branch', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# Withdrawal approval tiers
# ---------------------------------------------------------------------------

class WithdrawalApprovalTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = WithdrawalApprovalTier
        fields = [
            'id', 'owner', 'tier_name', 'min_amount', 'max_amount',
            'required_approvers', 'approver_roles', 'is_active', 'order',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# Withdrawal requests
# ---------------------------------------------------------------------------

class WithdrawalApprovalStepSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model = WithdrawalApprovalStep
        fields = [
            'id', 'step_number', 'approver', 'approver_name',
            'status', 'comment', 'responded_at',
            'created_at',
        ]
        read_only_fields = [
            'id', 'step_number', 'approver', 'approver_name',
            'status', 'comment', 'responded_at', 'created_at',
        ]

    def get_approver_name(self, obj):
        if obj.approver_id:
            return getattr(obj.approver, 'get_full_name', lambda: str(obj.approver))()
        return None


class SavingsWithdrawalRequestSerializer(TenantModelSerializer):
    steps = WithdrawalApprovalStepSerializer(
        source='approval_steps', many=True, read_only=True
    )
    account_number = serializers.CharField(
        source='savings_account.account_number', read_only=True
    )
    client_name = serializers.CharField(
        source='savings_account.client.full_name', read_only=True
    )
    client_phone = serializers.CharField(
        source='savings_account.client.phone_primary', read_only=True, default=None
    )
    client_bank_name = serializers.CharField(
        source='savings_account.client.bank_name', read_only=True, default=None
    )
    client_bank_account_name = serializers.CharField(
        source='savings_account.client.bank_account_name', read_only=True, default=None
    )
    client_bank_account_number = serializers.CharField(
        source='savings_account.client.bank_account_number', read_only=True, default=None
    )
    client_bvn = serializers.CharField(
        source='savings_account.client.bvn', read_only=True, default=None
    )
    requested_by_name = serializers.SerializerMethodField()
    disbursed_by_name = serializers.SerializerMethodField()

    # Bank account details for disbursement page
    destination_bank_name = serializers.SerializerMethodField()
    destination_account_number = serializers.SerializerMethodField()
    destination_account_name = serializers.SerializerMethodField()

    class Meta:
        model = SavingsWithdrawalRequest
        fields = [
            'id', 'savings_account', 'account_number', 'client_name',
            'client_phone', 'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
            'requested_by', 'requested_by_name',
            'amount', 'description', 'status',
            'required_approvals', 'approvals_received',
            'applied_tier', 'destination_bank_account', 'cashier_account',
            'destination_bank_name', 'destination_account_number', 'destination_account_name',
            'journal_entry', 'steps',
            'disbursed_by', 'disbursed_by_name', 'disbursed_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'account_number', 'client_name',
            'client_phone', 'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
            'requested_by_name',
            'status', 'required_approvals', 'approvals_received',
            'applied_tier', 'journal_entry', 'steps',
            'destination_bank_name', 'destination_account_number', 'destination_account_name',
            'disbursed_by', 'disbursed_by_name', 'disbursed_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by_id:
            return getattr(obj.requested_by, 'get_full_name', lambda: str(obj.requested_by))()
        return None

    def get_disbursed_by_name(self, obj):
        if obj.disbursed_by_id:
            return getattr(obj.disbursed_by, 'get_full_name', lambda: str(obj.disbursed_by))()
        return None

    def get_destination_bank_name(self, obj):
        if obj.destination_bank_account_id:
            try:
                bank = obj.destination_bank_account.bank
                return bank.name if bank else None
            except Exception:
                return None
        return None

    def get_destination_account_number(self, obj):
        if obj.destination_bank_account_id:
            return getattr(obj.destination_bank_account, 'account_number', None)
        return None

    def get_destination_account_name(self, obj):
        if obj.destination_bank_account_id:
            return getattr(obj.destination_bank_account, 'account_name', None)
        return None


class WithdrawalApprovalActionSerializer(serializers.Serializer):
    """Used by approve/reject action endpoints."""
    approved = serializers.BooleanField()
    comment = serializers.CharField(required=False, allow_blank=True, default='')
