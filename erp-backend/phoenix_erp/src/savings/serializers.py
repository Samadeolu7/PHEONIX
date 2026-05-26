from rest_framework import serializers

from .models import (
    SavingsAccount,
    SavingsGoal,
    ContributionSchedule,
    SmartSavingsAccount,
    SmartSavingsEvent,
    CompulsorySavingsPolicy,
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
