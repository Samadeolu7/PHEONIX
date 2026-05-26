# receivables/serializers.py
"""
Serializers for receivables API
"""
from rest_framework import serializers
from .models import (
    CustomerReceivable,
    ReceivableActivityLog,
    CustomerStatement
)


class CustomerReceivableSerializer(serializers.ModelSerializer):
    """Serializer for CustomerReceivable"""
    client_name = serializers.CharField(source='client.name', read_only=True)
    content_type_name = serializers.CharField(source='content_type.model', read_only=True)
    # Explicit fields for frontend navigation to source documents
    source_id = serializers.IntegerField(source='object_id', read_only=True)
    source_type = serializers.CharField(source='content_type.model', read_only=True)
    
    class Meta:
        model = CustomerReceivable
        fields = [
            'id', 'client', 'client_name', 'receivable_type', 'content_type', 'content_type_name',
            'object_id', 'source_id', 'source_type', 'reference_number', 'original_amount', 
            'amount_paid', 'balance', 'due_date', 'status', 'aging_bucket', 'days_overdue', 
            'overdue_interest_rate', 'accrued_interest', 'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['days_overdue', 'accrued_interest', 'aging_bucket', 'created_at', 'updated_at']


class ClientSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField(allow_null=True, required=False)
    phone = serializers.CharField(source='phone_primary', allow_null=True, required=False)


class ReceivableActivityLogReadSerializer(serializers.ModelSerializer):
    performed_by = serializers.SerializerMethodField()

    class Meta:
        model = ReceivableActivityLog
        fields = ['id', 'activity_type', 'amount', 'description', 'performed_by', 'created_at']
        read_only_fields = fields

    def get_performed_by(self, obj):
        if obj.performed_by:
            return {
                'id': obj.performed_by.id,
                'full_name': getattr(obj.performed_by, 'full_name', str(obj.performed_by))
            }
        return None


class CustomerReceivableDetailSerializer(serializers.ModelSerializer):
    client = ClientSummarySerializer(read_only=True)
    activity_logs = ReceivableActivityLogReadSerializer(many=True, read_only=True)
    content_object = serializers.SerializerMethodField()

    class Meta:
        model = CustomerReceivable
        fields = [
            'id', 'client', 'receivable_type', 'reference_number', 'original_amount',
            'amount_paid', 'balance', 'due_date', 'status', 'aging_bucket', 'days_overdue',
            'overdue_interest_rate', 'accrued_interest', 'assigned_to', 'collection_notes',
            'activity_logs', 'content_object', 'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['activity_logs', 'content_object', 'created_at', 'updated_at']

    def get_content_object(self, obj):
        # Provide a minimal representation of the linked object depending on type
        source = obj.content_object
        if source is None:
            return None

        try:
            if obj.receivable_type == 'invoice' and hasattr(source, 'invoice_number'):
                return {
                    'id': source.id,
                    'invoice_number': source.invoice_number,
                    'invoice_date': source.invoice_date,
                    'due_date': source.due_date,
                    'amount': source.amount,
                    'amount_paid': source.amount_paid,
                    'balance': getattr(source, 'amount', 0) - getattr(source, 'amount_paid', 0),
                    'status': getattr(source, 'status', None),
                }
            if obj.receivable_type == 'entitlement' and hasattr(source, 'fee_structure'):
                return {
                    'id': source.id,
                    'invoice_id': getattr(source, 'invoice_id', None),
                    'fee_structure': getattr(source, 'fee_structure_id', None),
                    'academic_period': getattr(source, 'academic_period', None),
                }
            if obj.receivable_type == 'loan':
                return {
                    'id': source.id,
                    'loan_reference': getattr(source, 'reference_number', None),
                    'principal': getattr(source, 'principal', None),
                    'balance': getattr(source, 'balance', None),
                }
        except Exception:
            return None

        # Generic fallback
        return {
            'id': getattr(source, 'id', None),
            'repr': str(source)
        }


class ReceivableActivityLogSerializer(serializers.ModelSerializer):
    """Serializer for ReceivableActivityLog"""
    receivable_reference = serializers.CharField(source='receivable.reference_number', read_only=True)
    
    class Meta:
        model = ReceivableActivityLog
        fields = [
            'id', 'receivable', 'receivable_reference', 'activity_type', 'amount',
            'description', 'created_by', 'created_at'
        ]
        read_only_fields = ['created_at']


class CustomerStatementSerializer(serializers.ModelSerializer):
    """Serializer for CustomerStatement"""
    client_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerStatement
        fields = [
            'id', 'client', 'client_name', 'statement_number', 'statement_date',
            'period_start', 'period_end',
            'opening_balance', 'closing_balance', 'total_charges', 'total_payments',
            'generated_by', 'generated_at', 'sent_via', 'sent_at', 'sent_to', 'pdf_file',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['statement_number', 'closing_balance', 'generated_at', 'owner', 'branch', 'created_at', 'updated_at']
    
    def get_client_name(self, obj):
        return obj.client.full_name if hasattr(obj.client, 'full_name') else str(obj.client)