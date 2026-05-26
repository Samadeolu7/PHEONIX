# liabilities/serializers.py
"""
Serializers for Accounts Payable and vendor payment management
"""
from rest_framework import serializers
from decimal import Decimal

from .models import AccountsPayable
from procurement.models import Supplier, PurchaseOrder
from clients.models import Client
from accounts.models import Account


class VendorSerializer(serializers.Serializer):
    """Generic vendor serializer (Supplier or Client)"""
    id = serializers.IntegerField()
    name = serializers.CharField()
    supplier_code = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False)


class PurchaseOrderSummarySerializer(serializers.ModelSerializer):
    """Summary of linked Purchase Order"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'order_date', 'total_amount',
            'status', 'supplier_name'
        ]


class ThreeWayMatchResultSerializer(serializers.Serializer):
    """3-way match validation result"""
    status = serializers.ChoiceField(
        choices=['not_validated', 'passed', 'warning', 'failed']
    )
    can_proceed = serializers.BooleanField()
    message = serializers.CharField()
    discrepancies = serializers.ListField(
        child=serializers.DictField(),
        required=False
    )
    po_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False
    )
    grn_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False
    )
    invoice_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False
    )


class AccountsPayableSerializer(serializers.ModelSerializer):
    """Full Accounts Payable serializer"""
    # Vendor details (polymorphic)
    vendor_type = serializers.SerializerMethodField()
    vendor_id = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    vendor_code = serializers.SerializerMethodField()
    vendor_email = serializers.SerializerMethodField()
    
    # Account details
    account_name = serializers.CharField(source='account.name', read_only=True)
    account_code = serializers.CharField(source='account.code', read_only=True)
    
    # Purchase Order details
    purchase_order_details = PurchaseOrderSummarySerializer(
        source='purchase_order', read_only=True
    )
    
    # User details
    posted_by_name = serializers.CharField(
        source='posted_by.get_full_name', read_only=True
    )
    validated_by_name = serializers.CharField(
        source='validated_by.get_full_name', read_only=True
    )
    
    # Computed fields
    outstanding_amount = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    
    class Meta:
        model = AccountsPayable
        fields = [
            'id', 'invoice_number', 'invoice_date', 'due_date',
            'amount', 'amount_paid', 'outstanding_amount',
            'description', 'status',
            
            # Vendor fields
            'vendor_type', 'vendor_id', 'vendor_name', 'vendor_code', 'vendor_email',
            
            # Account
            'account', 'account_name', 'account_code',
            
            # Purchase Order
            'purchase_order', 'purchase_order_details',
            
            # 3-Way Matching
            'three_way_match_status', 'three_way_match_result',
            'validated_at', 'validated_by', 'validated_by_name',
            
            # Payment Accountability
            'posted_by', 'posted_by_name', 'posted_at', 'posting_notes',
            
            # Dates
            'is_overdue', 'days_overdue',
            'created_at', 'updated_at',
            
            # Multi-tenancy
            'branch', 'owner', 'tenant'
        ]
        read_only_fields = [
            'id', 'amount_paid', 'status', 
            'three_way_match_status', 'three_way_match_result',
            'validated_at', 'validated_by',
            'posted_at', 'created_at', 'updated_at'
        ]
    
    def get_vendor_type(self, obj):
        """Get vendor type from ContentType"""
        if obj.content_type:
            return obj.content_type.model
        return None
    
    def get_vendor_id(self, obj):
        """Get vendor ID from polymorphic relationship"""
        return obj.object_id
    
    def get_vendor_name(self, obj):
        """Get vendor name from polymorphic relationship"""
        vendor = obj.vendor  # GenericForeignKey
        if vendor:
            return getattr(vendor, 'name', None)
        return None
    
    def get_vendor_code(self, obj):
        """Get vendor code"""
        vendor = obj.vendor  # GenericForeignKey
        if not vendor:
            return None
        # Supplier uses supplier_code, Client might use code or student_id
        if hasattr(vendor, 'supplier_code'):
            return vendor.supplier_code
        return getattr(vendor, 'code', None)
    
    def get_vendor_email(self, obj):
        """Get vendor email"""
        vendor = obj.vendor  # GenericForeignKey
        return getattr(vendor, 'email', None)
    
    def get_outstanding_amount(self, obj):
        """Calculate outstanding amount"""
        return str(obj.amount - obj.amount_paid)
    
    def get_is_overdue(self, obj):
        """Check if payable is overdue"""
        from django.utils import timezone
        if obj.status == 'paid':
            return False
        return obj.due_date and obj.due_date < timezone.now().date()
    
    def get_days_overdue(self, obj):
        """Calculate days overdue"""
        from django.utils import timezone
        if obj.status == 'paid' or not obj.due_date:
            return 0
        today = timezone.now().date()
        if obj.due_date < today:
            return (today - obj.due_date).days
        return 0


class AccountsPayableListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list view"""
    vendor_name = serializers.SerializerMethodField()
    account_name = serializers.CharField(source='account.name', read_only=True)
    outstanding_amount = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    
    class Meta:
        model = AccountsPayable
        fields = [
            'id', 'invoice_number', 'invoice_date', 'due_date',
            'amount', 'amount_paid', 'outstanding_amount',
            'vendor_name', 'account_name',
            'status', 'three_way_match_status',
            'is_overdue', 'purchase_order'
        ]
    
    def get_vendor_name(self, obj):
        vendor = obj.vendor  # GenericForeignKey
        if vendor:
            return getattr(vendor, 'name', None)
        return None
    
    def get_outstanding_amount(self, obj):
        return str(obj.amount - obj.amount_paid)
    
    def get_is_overdue(self, obj):
        from django.utils import timezone
        if obj.status == 'paid':
            return False
        return obj.due_date and obj.due_date < timezone.now().date()


class CreateAccountsPayableSerializer(serializers.ModelSerializer):
    """Serializer for creating new payables"""
    vendor_type = serializers.CharField(write_only=True, required=False)
    vendor_id = serializers.IntegerField(write_only=True, required=False)
    
    class Meta:
        model = AccountsPayable
        fields = [
            'vendor_type', 'vendor_id', 'supplier', 'account',
            'invoice_number', 'invoice_date', 'due_date',
            'amount', 'description',
            'purchase_order', 'branch', 'owner', 'tenant'
        ]
    
    def validate(self, data):
        """Validate vendor exists and handle ContentType"""
        vendor_type = data.pop('vendor_type', None)
        vendor_id = data.pop('vendor_id', None)
        
        # If vendor_type and vendor_id provided, set content_type and object_id
        if vendor_type and vendor_id:
            from django.contrib.contenttypes.models import ContentType
            
            if vendor_type == 'supplier':
                if not Supplier.objects.filter(id=vendor_id).exists():
                    raise serializers.ValidationError({
                        'vendor_id': f'Supplier with id {vendor_id} does not exist'
                    })
                supplier_ct = ContentType.objects.get_for_model(Supplier)
                data['content_type'] = supplier_ct
                data['object_id'] = vendor_id
                
            elif vendor_type == 'client':
                if not Client.objects.filter(id=vendor_id).exists():
                    raise serializers.ValidationError({
                        'vendor_id': f'Client with id {vendor_id} does not exist'
                    })
                client_ct = ContentType.objects.get_for_model(Client)
                data['content_type'] = client_ct
                data['object_id'] = vendor_id
        
        # Also support old way via supplier field
        elif not data.get('supplier') and not data.get('content_type'):
            raise serializers.ValidationError(
                'Either provide vendor_type/vendor_id or supplier field'
            )
        
        return data


class ValidateThreeWayMatchSerializer(serializers.Serializer):
    """Input serializer for 3-way match validation"""
    # No input needed - uses payable's linked PO


class MakePaymentSerializer(serializers.Serializer):
    """Input serializer for making payment.

    NOTE: ``posted_by`` is intentionally NOT accepted from the request body.
    The currently authenticated user (``request.user``) is always used as the
    payment poster to prevent attribution spoofing.
    """
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Payment amount"
    )
    bank_account_id = serializers.IntegerField(
        help_text="GL Account ID of the bank or cash account making this payment (will be credited: Dr AP / Cr Bank)"
    )
    posting_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional notes about the payment"
    )
    bypass_validation = serializers.BooleanField(
        default=False,
        help_text="Bypass 3-way match validation (emergency use only)"
    )

    def validate_amount(self, value):
        """Validate amount is positive"""
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero")
        return value


class PaymentResultSerializer(serializers.Serializer):
    """Result of payment operation"""
    success = serializers.BooleanField()
    message = serializers.CharField()
    payment_id = serializers.IntegerField(required=False)
    new_paid_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False
    )
    outstanding_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, required=False
    )
    payment_status = serializers.CharField(required=False)
    validation_bypassed = serializers.BooleanField(required=False)
