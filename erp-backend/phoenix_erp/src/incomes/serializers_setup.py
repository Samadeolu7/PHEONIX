# incomes/serializers_setup.py
"""
Serializers for unified fee setup API
Comprehensive documentation for Swagger/OpenAPI
"""
from rest_framework import serializers
from decimal import Decimal

from .models import FeeStructure, IncomeCategory
from accounts.models import Account
from .models_config import IncomeAccountingConfig


class IncomeAccountSetupSerializer(serializers.Serializer):
    """
    Configuration for income GL account
    
    Two modes:
    1. Create new account (create_new=True)
    2. Use existing account (create_new=False, provide account_id)
    """
    create_new = serializers.BooleanField(
        default=True,
        help_text="If true, creates new GL account. If false, uses existing account_id"
    )
    
    # For existing account
    account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of existing GL account (required if create_new=False)"
    )
    
    # For new account
    name = serializers.CharField(
        required=False,
        max_length=100,
        help_text="Account name (e.g., 'Tuition Fee Income')"
    )
    code = serializers.CharField(
        required=False,
        max_length=10,
        help_text="Account code (e.g., '4102'). 4-digit FIRS code."
    )
    parent_code = serializers.CharField(
        required=False,
        max_length=10,
        default='4100',
        help_text="Parent account code (e.g., '4100' for Revenue from Contracts). Creates parent if it doesn't exist."
    )
    parent_name = serializers.CharField(
        required=False,
        max_length=100,
        default='Revenue from Contracts with Customers',
        help_text="Parent account name (used when creating parent)"
    )
    category_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Account category ID. If not provided, uses default income category"
    )
    
    def validate(self, data):
        if not data.get('create_new', True):
            # Using existing account
            if not data.get('account_id'):
                raise serializers.ValidationError({
                    'account_id': 'Required when create_new=False'
                })
        else:
            # Creating new account
            if not data.get('name'):
                raise serializers.ValidationError({
                    'name': 'Required when create_new=True'
                })
            if not data.get('code'):
                raise serializers.ValidationError({
                    'code': 'Required when create_new=True'
                })
        
        return data


class PaymentTermsSerializer(serializers.Serializer):
    """
    Payment terms and access rules for fee structure
    """
    allows_partial = serializers.BooleanField(
        default=True,
        help_text="Allow partial payments"
    )
    minimum_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Minimum payment percentage required (0-100)"
    )
    requires_invoice = serializers.BooleanField(
        default=True,
        help_text="Require invoice generation"
    )
    grace_period_days = serializers.IntegerField(
        default=30,
        help_text="Grace period for overdue payments (days)"
    )
    full_access_at_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('50.00'),
        help_text="Payment percentage for full access (0-100)"
    )


class FeeComponentSerializer(serializers.Serializer):
    """
    Individual component of a fee (for breakdown)
    """
    name = serializers.CharField(
        max_length=100,
        help_text="Component name (e.g., 'Tuition', 'Books', 'Uniform')"
    )
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Component amount"
    )
    is_mandatory = serializers.BooleanField(
        default=True,
        help_text="Whether this component is mandatory"
    )
    inventory_item_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Link to inventory item if this component includes physical goods"
    )


class FeeStructureSetupSerializer(serializers.Serializer):
    """
    Complete fee structure setup
    
    This endpoint creates:
    - GL accounts (parent and child) if needed
    - Income category
    - Fee structure
    - Links everything together
    
    Example:
    {
        "name": "Grade 1 Tuition Fees",
        "code": "G1TUT",
        "base_amount": 10000.00,
        "description": "Annual tuition for Grade 1 students",
        "income_account": {
            "create_new": true,
            "name": "Grade 1 Tuition Income",
            "code": "401-001",
            "parent_code": "400",
            "parent_name": "Total Income"
        },
        "payment_terms": {
            "allows_partial": true,
            "minimum_percent": 50,
            "requires_invoice": true,
            "grace_period_days": 30,
            "full_access_at_percent": 50
        },
        "fee_components": [
            {"name": "Tuition", "amount": 8000.00, "is_mandatory": true},
            {"name": "Books", "amount": 1500.00, "is_mandatory": true},
            {"name": "Uniform", "amount": 500.00, "is_mandatory": false, "inventory_item_id": 123}
        ]
    }
    """
    name = serializers.CharField(
        max_length=200,
        help_text="Fee structure name (e.g., 'Grade 1 Tuition Fees')"
    )
    code = serializers.CharField(
        max_length=20,
        required=False,
        help_text="Fee structure code (e.g., 'G1TUT'). Auto-generated if not provided"
    )
    base_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Total fee amount"
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Detailed description of the fee"
    )
    
    income_account = IncomeAccountSetupSerializer(
        help_text="GL account configuration for income recognition"
    )
    
    payment_terms = PaymentTermsSerializer(
        required=False,
        help_text="Payment terms and access rules"
    )
    
    fee_components = serializers.ListField(
        child=FeeComponentSerializer(),
        required=False,
        help_text="Optional breakdown of fee into components"
    )
    
    effective_from = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Date from which this fee structure is effective"
    )
    effective_to = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Date until which this fee structure is effective"
    )
    
    def validate_base_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive")
        return value
    
    def validate(self, data):
        # Validate components sum to base amount if provided
        components = data.get('fee_components', [])
        if components:
            total = sum(Decimal(str(comp['amount'])) for comp in components)
            base = data['base_amount']
            if abs(total - base) > Decimal('0.01'):  # Allow 1 cent difference for rounding
                raise serializers.ValidationError({
                    'fee_components': f'Components total ({total}) must equal base_amount ({base})'
                })
        
        return data


class FeeStructureSetupResponseSerializer(serializers.Serializer):
    """
    Response after successful fee structure setup
    """
    success = serializers.BooleanField()
    message = serializers.CharField()
    
    fee_structure = serializers.SerializerMethodField()
    income_category = serializers.SerializerMethodField()
    income_account = serializers.SerializerMethodField()
    parent_account = serializers.SerializerMethodField()
    
    created_accounts = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of created account codes"
    )
    needs_config = serializers.BooleanField(
        help_text="If true, income accounting configuration needs to be set up"
    )
    
    def get_fee_structure(self, obj):
        fs = obj.get('fee_structure')
        if fs:
            return {
                'id': fs.id,
                'name': fs.name,
                'code': fs.code,
                'base_amount': str(fs.base_amount)
            }
        return None
    
    def get_income_category(self, obj):
        rc = obj.get('income_category')
        if rc:
            return {
                'id': rc.id,
                'name': rc.name,
                'code': rc.code
            }
        return None
    
    def get_income_account(self, obj):
        acc = obj.get('income_account')
        if acc:
            return {
                'id': acc.id,
                'code': acc.code,
                'name': acc.name,
                'account_type': acc.account_type
            }
        return None
    
    def get_parent_account(self, obj):
        parent = obj.get('income_account')
        if parent and parent.parent:
            return {
                'id': parent.parent.id,
                'code': parent.parent.code,
                'name': parent.parent.name
            }
        return None


class AccountingConfigSetupSerializer(serializers.Serializer):
    """
    Setup income accounting configuration
    
    Required to enable payment processing with proper GL entries.
    Typically set up once per branch/owner.
    
    Example:
    {
        "cash_account_id": 1,
        "ar_account_id": 2,
        "bank_transfer_account_id": 3,
        "mobile_money_account_id": 4
    }
    """
    cash_account_id = serializers.IntegerField(
        help_text="ID of default cash account (Type: ASSET)"
    )
    ar_account_id = serializers.IntegerField(
        help_text="ID of Accounts Receivable account (Type: ASSET)"
    )
    bank_transfer_account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of bank account for electronic transfers"
    )
    mobile_money_account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of mobile money account (M-Pesa, etc.)"
    )
    credit_card_account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of credit card processing account"
    )


class AccountingConfigResponseSerializer(serializers.ModelSerializer):
    """Response for accounting config"""
    
    default_cash_account_name = serializers.CharField(
        source='default_cash_account.name',
        read_only=True
    )
    default_ar_account_name = serializers.CharField(
        source='default_ar_account.name',
        read_only=True
    )
    
    class Meta:
        model = IncomeAccountingConfig
        fields = [
            'id', 'default_cash_account', 'default_cash_account_name',
            'default_ar_account', 'default_ar_account_name',
            'bank_transfer_account', 'mobile_money_account',
            'income_series_code', 'entitlement_series_code',
            'require_bank_account', 'allow_overpayment', 'auto_reconcile'
        ]
