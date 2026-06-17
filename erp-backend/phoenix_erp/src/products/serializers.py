"""
Product Serializers
Handles serialization/deserialization for Product API endpoints
"""
from rest_framework import serializers
from .models import Product
from branches.models import Branch
from django.contrib.auth import get_user_model

User = get_user_model()


class ProductSerializer(serializers.ModelSerializer):
    """
    Comprehensive serializer for Product model
    Includes validation for product configuration
    """
    # Read-only nested fields
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    # Count of accounts using this product
    account_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            # IDs
            'id', 'branch', 'branch_name', 'owner', 'owner_name',
            'created_by', 'created_by_name',
            
            # Basic Info
            'name', 'code', 'description', 'product_class', 'product_type',
            'is_active',
            
            # Financial Limits
            'minimum_amount', 'maximum_amount', 'standard_price',
            'min_transaction_amount', 'max_transaction_amount',
            'daily_transaction_limit', 'monthly_transaction_limit',
            
            # Product Behavior
            'validation_scope', 'track_inventory', 'allow_credit_sales',
            'allow_reservations', 'requires_approval',
            
            # Interest Configuration
            'interest_rate', 'interest_posting_method', 'interest_posting_cron',
            
            # Fee Configuration
            'fee_structure', 'auto_debit_fees', 'calculation_method',
            'repayment_config',
            
            # Validation & Metadata
            'validation_rules', 'custom_attributes', 'metadata_schema',
            
            # Timestamps
            'created_at', 'updated_at',
            
            # Computed
            'account_count',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'branch_name', 'owner_name', 'created_by_name', 'account_count'
        ]
        
    def get_account_count(self, obj):
        """Count savings accounts using this product"""
        try:
            return obj.savings_accounts.filter(status='active').count()
        except Exception:
            return 0
    
    def validate_code(self, value):
        """Validate product code format"""
        if not value:
            raise serializers.ValidationError("Product code is required")
        
        # Check format (e.g., SAV-BASIC, LOAN-PERSONAL)
        if '-' not in value:
            raise serializers.ValidationError(
                "Product code should follow format: TYPE-NAME (e.g., SAV-BASIC)"
            )
        
        # Check uniqueness within branch
        if self.instance:
            # Update - check other products in branch
            if Product.objects.filter(
                branch=self.instance.branch,
                code=value
            ).exclude(id=self.instance.id).exists():
                raise serializers.ValidationError(
                    f"Product with code '{value}' already exists in this branch"
                )
        
        return value.upper()
    
    def validate_interest_rate(self, value):
        """Validate interest rate is reasonable"""
        if value is not None:
            if value < 0:
                raise serializers.ValidationError("Interest rate cannot be negative")
            if value > 100:
                raise serializers.ValidationError("Interest rate cannot exceed 100%")
        return value
    
    def validate_interest_posting_cron(self, value):
        """Validate cron expression format"""
        if value:
            parts = value.split()
            if len(parts) != 5:
                raise serializers.ValidationError(
                    "Invalid cron format. Expected 5 parts: 'minute hour day month weekday'"
                )
        return value
    
    def validate_minimum_amount(self, value):
        """Ensure minimum amount is positive"""
        if value is not None and value < 0:
            raise serializers.ValidationError("Minimum amount cannot be negative")
        return value
    
    def validate_maximum_amount(self, value):
        """Ensure maximum amount is reasonable"""
        if value is not None and value < 0:
            raise serializers.ValidationError("Maximum amount cannot be negative")
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        # Ensure max >= min for amounts
        min_amt = data.get('minimum_amount') or (self.instance.minimum_amount if self.instance else None)
        max_amt = data.get('maximum_amount') or (self.instance.maximum_amount if self.instance else None)
        
        if min_amt and max_amt and max_amt < min_amt:
            raise serializers.ValidationError({
                'maximum_amount': 'Maximum amount must be greater than minimum amount'
            })
        
        # Validate interest rate exists for SAVINGS/LOAN products
        product_type = data.get('product_type') or (self.instance.product_type if self.instance else None)
        interest_rate = data.get('interest_rate')
        
        if product_type in ['SAVINGS', 'LOAN'] and interest_rate is None:
            raise serializers.ValidationError({
                'interest_rate': f'Interest rate is required for {product_type} products'
            })
        
        return data


class ProductListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for product lists
    Includes only essential fields for performance
    """
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    account_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'code', 'product_class', 'product_type',
            'is_active', 'branch', 'branch_name',
            'interest_rate', 'minimum_amount',
            'account_count', 'created_at'
        ]
        read_only_fields = fields
    
    def get_account_count(self, obj):
        """Count savings accounts using this product"""
        try:
            return obj.savings_accounts.filter(status='active').count()
        except Exception:
            return 0


class ProductSummarySerializer(serializers.ModelSerializer):
    """
    Minimal serializer for dropdowns and selections
    """
    class Meta:
        model = Product
        fields = ['id', 'name', 'code', 'product_type', 'is_active']
        read_only_fields = fields
