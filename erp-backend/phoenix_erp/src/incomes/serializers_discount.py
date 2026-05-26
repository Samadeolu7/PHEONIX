# incomes/serializers_discount.py
"""
Serializers for discount, scholarship, and waiver system
"""
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone

from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from incomes.services.discount_service import DiscountService
from clients.serializers import ClientListSerializer
from accounts.serializers import AccountSerializer


class DiscountProgramSerializer(serializers.ModelSerializer):
    """
    Serializer for DiscountProgram model
    """
    
    # Computed fields
    budget_remaining = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True
    )
    budget_utilization_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )
    is_within_budget = serializers.BooleanField(read_only=True)
    has_recipient_capacity = serializers.BooleanField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)
    
    # Related fields with detail
    discount_account_detail = AccountSerializer(
        source='discount_account', read_only=True
    )
    
    # Statistics (optional, can be expensive)
    statistics = serializers.SerializerMethodField()
    
    class Meta:
        model = DiscountProgram
        fields = [
            'id', 'program_code', 'name', 'description', 'program_type',
            'discount_type', 'discount_value', 'budget_allocated', 'budget_used',
            'budget_remaining', 'budget_utilization_percent', 'max_recipients',
            'current_recipients', 'start_date', 'end_date', 'is_active',
            'is_renewable', 'renewal_period', 'requires_approval',
            'approval_workflow', 'eligibility_workflow', 'eligibility_workflow_required',
            'workflow_timeout_seconds', 'eligibility_criteria', 'discount_account',
            'discount_account_detail', 'is_within_budget', 'has_recipient_capacity',
            'is_valid', 'statistics', 'created_at', 'updated_at',
            'created_by'
        ]
        read_only_fields = [
            'id', 'program_code', 'budget_used', 'current_recipients',
            'created_at', 'updated_at', 'created_by'
        ]
    
    def get_statistics(self, obj):
        """Get program statistics if requested"""
        request = self.context.get('request')
        if request and request.query_params.get('include_statistics'):
            return DiscountService.get_program_statistics(obj)
        return None
    
    def validate(self, data):
        """Validate program data"""
        
        # Validate discount_value based on discount_type
        discount_type = data.get('discount_type')
        discount_value = data.get('discount_value')
        
        if discount_type == 'percentage' and discount_value:
            if discount_value < 0 or discount_value > 100:
                raise serializers.ValidationError({
                    'discount_value': 'Percentage must be between 0 and 100'
                })
        
        if discount_type == 'fixed_amount' and discount_value:
            if discount_value < 0:
                raise serializers.ValidationError({
                    'discount_value': 'Fixed amount cannot be negative'
                })
        
        # Validate dates
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if start_date and end_date:
            if end_date < start_date:
                raise serializers.ValidationError({
                    'end_date': 'End date cannot be before start date'
                })
        
        # Validate budget
        budget_allocated = data.get('budget_allocated')
        if budget_allocated and budget_allocated < 0:
            raise serializers.ValidationError({
                'budget_allocated': 'Budget cannot be negative'
            })
        
        # Validate eligibility workflow
        eligibility_workflow = data.get('eligibility_workflow')
        if eligibility_workflow:
            self._validate_eligibility_workflow(eligibility_workflow)
        
        # Validate workflow_required flag
        eligibility_workflow_required = data.get('eligibility_workflow_required')
        if eligibility_workflow_required and not eligibility_workflow:
            raise serializers.ValidationError({
                'eligibility_workflow_required': (
                    'Cannot require eligibility workflow when no workflow is configured'
                )
            })
        
        return data
    
    def _validate_eligibility_workflow(self, workflow):
        """Validate that eligibility workflow doesn't contain transaction steps"""
        from incomes.services.discount_workflow_service import DiscountWorkflowService
        
        if not workflow or not workflow.workflow_definition:
            return
        
        errors = DiscountWorkflowService.validate_workflow_steps(
            workflow.workflow_definition
        )
        
        if errors:
            raise serializers.ValidationError({
                'eligibility_workflow': errors
            })


class DiscountApplicationSerializer(serializers.ModelSerializer):
    """
    Serializer for DiscountApplication model
    """
    
    # Computed fields
    actual_discount_value = serializers.DecimalField(
        max_digits=15, decimal_places=2, read_only=True
    )
    is_active = serializers.BooleanField(read_only=True)
    
    # Related fields with detail
    program_detail = DiscountProgramSerializer(source='program', read_only=True)
    client_detail = ClientListSerializer(source='client', read_only=True)
    
    # Approval info
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.get_full_name', read_only=True
    )
    
    class Meta:
        model = DiscountApplication
        fields = [
            'id', 'application_number', 'program', 'program_detail', 'client',
            'client_detail', 'application_date', 'reason', 'supporting_documents',
            'status', 'reviewed_by', 'reviewed_by_name', 'review_date',
            'review_notes', 'effective_from', 'effective_to',
            'custom_discount_value', 'actual_discount_value', 'is_active',
            'created_at', 'updated_at', 'created_by'
        ]
        read_only_fields = [
            'id', 'application_number', 'status', 'reviewed_by', 'review_date',
            'review_notes', 'effective_from', 'effective_to', 'created_at',
            'updated_at', 'created_by'
        ]
    
    def validate(self, data):
        """Validate application data"""
        
        # Validate custom_discount_value if provided
        custom_value = data.get('custom_discount_value')
        program = data.get('program') or (
            self.instance.program if self.instance else None
        )
        
        if custom_value and program:
            if program.discount_type == 'percentage':
                if custom_value < 0 or custom_value > 100:
                    raise serializers.ValidationError({
                        'custom_discount_value': 'Percentage must be between 0 and 100'
                    })
            elif program.discount_type == 'fixed_amount':
                if custom_value < 0:
                    raise serializers.ValidationError({
                        'custom_discount_value': 'Amount cannot be negative'
                    })
        
        # Validate program is active if creating new application
        if not self.instance and program:
            if not program.is_active:
                raise serializers.ValidationError({
                    'program': 'Program is not currently active'
                })
            
            if not program.is_valid:
                raise serializers.ValidationError({
                    'program': 'Program is not within valid date range'
                })
        
        return data
    
    def create(self, validated_data):
        """Create application in 'draft' status"""
        validated_data['status'] = 'draft'
        validated_data['application_date'] = timezone.now().date()
        return super().create(validated_data)


class DiscountApplicationApprovalSerializer(serializers.Serializer):
    """
    Serializer for approving discount applications
    """
    effective_from = serializers.DateField(required=True)
    effective_to = serializers.DateField(required=False, allow_null=True)
    review_notes = serializers.CharField(required=False, allow_blank=True)
    custom_discount_value = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )
    
    def validate(self, data):
        """Validate approval data"""
        effective_from = data.get('effective_from')
        effective_to = data.get('effective_to')
        
        if effective_to and effective_from:
            if effective_to < effective_from:
                raise serializers.ValidationError({
                    'effective_to': 'End date cannot be before start date'
                })
        
        return data


class DiscountApplicationRejectionSerializer(serializers.Serializer):
    """
    Serializer for rejecting discount applications
    """
    review_notes = serializers.CharField(required=True)


class AppliedDiscountSerializer(serializers.ModelSerializer):
    """
    Serializer for AppliedDiscount model
    """
    
    # Computed fields
    can_be_posted = serializers.BooleanField(read_only=True)
    can_be_reversed = serializers.BooleanField(read_only=True)
    
    # Related fields with detail
    application_detail = DiscountApplicationSerializer(
        source='application', read_only=True
    )
    
    # Receivable info
    receivable_details = serializers.SerializerMethodField()
    
    # Posting/reversal info
    posted_by_name = serializers.CharField(
        source='posted_by.get_full_name', read_only=True
    )
    reversed_by_name = serializers.CharField(
        source='reversed_by.get_full_name', read_only=True
    )
    
    class Meta:
        model = AppliedDiscount
        fields = [
            'id', 'application', 'application_detail', 'receivable',
            'receivable_details', 'discount_amount', 'is_posted', 'posted_at',
            'posted_by', 'posted_by_name', 'journal_entry', 'is_reversed',
            'reversed_at', 'reversed_by', 'reversed_by_name', 'reversal_reason',
            'reversal_entry', 'can_be_posted', 'can_be_reversed', 'created_at',
            'updated_at', 'created_by'
        ]
        read_only_fields = [
            'id', 'is_posted', 'posted_at', 'posted_by', 'journal_entry',
            'is_reversed', 'reversed_at', 'reversed_by', 'reversal_entry',
            'created_at', 'updated_at', 'created_by'
        ]
    
    def get_receivable_details(self, obj):
        """Get receivable summary"""
        receivable = obj.receivable
        return {
            'id': receivable.id,
            'client_name': receivable.client.name,
            'original_amount': receivable.original_amount,
            'balance': receivable.balance,
            'status': receivable.status,
            'due_date': receivable.due_date,
        }
    
    def validate(self, data):
        """Validate applied discount data"""
        
        discount_amount = data.get('discount_amount')
        receivable = data.get('receivable')
        
        if discount_amount and receivable:
            if discount_amount > receivable.balance:
                raise serializers.ValidationError({
                    'discount_amount': (
                        f'Discount amount ({discount_amount}) cannot exceed '
                        f'outstanding balance ({receivable.balance})'
                    )
                })
            
            if discount_amount <= 0:
                raise serializers.ValidationError({
                    'discount_amount': 'Discount amount must be positive'
                })
        
        return data


class ApplyDiscountSerializer(serializers.Serializer):
    """
    Serializer for applying discount to receivable
    """
    application_id = serializers.IntegerField(required=True)
    receivable_id = serializers.IntegerField(required=True)
    
    @transaction.atomic
    def create(self, validated_data):
        """Apply discount using service"""
        from receivables.models import CustomerReceivable
        
        application_id = validated_data['application_id']
        receivable_id = validated_data['receivable_id']
        user = self.context['request'].user
        
        try:
            application = DiscountApplication.objects.get(id=application_id)
        except DiscountApplication.DoesNotExist:
            raise serializers.ValidationError({
                'application_id': f'Application {application_id} not found'
            })
        
        try:
            receivable = CustomerReceivable.objects.get(id=receivable_id)
        except CustomerReceivable.DoesNotExist:
            raise serializers.ValidationError({
                'receivable_id': f'Receivable {receivable_id} not found'
            })
        
        # Use service to apply discount
        applied_discount = DiscountService.apply_discount_to_receivable(
            application=application,
            receivable=receivable,
            user=user
        )
        
        return applied_discount


class ReverseDiscountSerializer(serializers.Serializer):
    """
    Serializer for reversing applied discount
    """
    reason = serializers.CharField(required=True)
    
    def validate_reason(self, value):
        """Ensure reason is provided"""
        if not value or not value.strip():
            raise serializers.ValidationError('Reversal reason is required')
        return value


class ClientDiscountSummarySerializer(serializers.Serializer):
    """
    Serializer for client discount summary
    """
    client_id = serializers.IntegerField(required=True)
    
    def validate_client_id(self, value):
        """Ensure client exists"""
        from clients.models import Client
        
        try:
            Client.objects.get(id=value)
        except Client.DoesNotExist:
            raise serializers.ValidationError(f'Client {value} not found')
        
        return value
    
    def to_representation(self, instance):
        """Get summary from service"""
        from clients.models import Client
        
        client_id = instance.get('client_id')
        client = Client.objects.get(id=client_id)
        
        summary = DiscountService.get_client_discount_summary(client)
        summary['client_id'] = client_id
        summary['client_name'] = client.name
        
        return summary
