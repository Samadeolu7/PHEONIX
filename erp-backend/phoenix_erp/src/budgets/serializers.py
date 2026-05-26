"""Budget Serializers"""
from rest_framework import serializers
from common.base import BranchScopedModel
from .models import BudgetPeriod, BudgetLine
from accounts.models import Account


class BudgetLineSerializer(serializers.ModelSerializer):
    """Serializer for budget line items"""
    
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    # department field removed from model; omit department_name
    
    # Computed fields for variance
    actual = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
        help_text="Actual spending (computed)"
    )
    variance = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
        help_text="Budget - Actual (computed)"
    )
    variance_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        help_text="Variance as percentage (computed)"
    )
    utilization_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
        help_text="Actual / Budget * 100 (computed)"
    )
    
    class Meta:
        model = BudgetLine
        fields = [
            'id', 'budget_period', 'account', 'account_code', 'account_name',
            'amount', 'notes',
            'actual', 'variance', 'variance_percent', 'utilization_percent',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['owner', 'branch', 'created_at', 'updated_at']
    
    def to_representation(self, instance):
        """Add computed variance fields to output"""
        representation = super().to_representation(instance)
        
        # Get variance data
        variance_data = instance.get_variance()
        representation['actual'] = str(variance_data['actual'])
        representation['variance'] = str(variance_data['variance'])
        representation['variance_percent'] = str(variance_data['variance_percent'])
        representation['utilization_percent'] = str(variance_data['utilization_percent'])
        
        return representation


class BudgetPeriodSerializer(serializers.ModelSerializer):
    """Serializer for budget periods"""
    
    approved_by_name = serializers.SerializerMethodField()
    total_budget = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
        help_text="Total budgeted amount (computed)"
    )
    total_actual = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
        help_text="Total actual spending (computed)"
    )
    variance_summary = serializers.SerializerMethodField(
        help_text="Overall variance summary (computed)"
    )
    
    # Include budget lines when detail view
    budget_lines = BudgetLineSerializer(many=True, read_only=True)
    
    class Meta:
        model = BudgetPeriod
        fields = [
            'id', 'name', 'start_date', 'end_date', 'status',
            'approved_by', 'approved_by_name', 'approved_at', 'notes',
            'total_budget', 'total_actual', 'variance_summary',
            'budget_lines',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'approved_by', 'approved_at', 'owner', 'branch',
            'created_at', 'updated_at'
        ]
    
    def get_approved_by_name(self, obj):
        """Get approver's full name"""
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
    
    def get_variance_summary(self, obj):
        """Get variance summary data"""
        return obj.get_variance_summary()
    
    def to_representation(self, instance):
        """Add computed totals to output"""
        representation = super().to_representation(instance)
        
        representation['total_budget'] = str(instance.get_total_budget())
        representation['total_actual'] = str(instance.get_total_actual())
        
        return representation


class BudgetPeriodListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for budget period list view (without lines)"""
    
    approved_by_name = serializers.SerializerMethodField()
    total_budget = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True
    )
    line_count = serializers.IntegerField(
        source='budget_lines.count',
        read_only=True,
        help_text="Number of budget lines"
    )
    
    class Meta:
        model = BudgetPeriod
        fields = [
            'id', 'name', 'start_date', 'end_date', 'status',
            'approved_by_name', 'approved_at',
            'total_budget', 'line_count',
            'owner', 'created_at', 'updated_at'
        ]
    
    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
    
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['total_budget'] = str(instance.get_total_budget())
        return representation
