# inventory/serializers_invoice.py
"""
Serializers for inventory invoice management
Handles sales invoices, purchase orders, and payment tracking
"""
from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone

from .models import Invoice, InvoiceItem, InventoryItem
from clients.models import Client
from common.serializers import TenantModelSerializer


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for invoice line items"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    line_total = serializers.DecimalField(source='total_price', max_digits=18, decimal_places=2, read_only=True)
    
    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'item', 'item_name', 'item_sku',
            'quantity', 'unit_price', 'discount',
            'tax_amount', 'line_total'
        ]
    
    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value
    
    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative")
        return value


class InvoiceSerializer(TenantModelSerializer):
    """Serializer for invoices"""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    amount_due = serializers.DecimalField(source='balance', max_digits=18, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Invoice
        ref_name = 'InventoryInvoice'
        fields = [
            'id', 'invoice_number', 'invoice_date', 'due_date',
            'client', 'client_name',
            'subtotal', 'tax_amount', 'discount', 'total_amount',
            'amount_paid', 'amount_due',
            'status', 'is_overdue',
            'notes',
            'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['invoice_number', 'amount_due', 'is_overdue']
    
    def validate(self, data):
        if data.get('due_date') and data.get('invoice_date'):
            if data['due_date'] < data['invoice_date']:
                raise serializers.ValidationError("Due date cannot be before invoice date")
        return data


class InvoiceCreateItemSerializer(serializers.Serializer):
    """Typed invoice item payload for create endpoint"""
    item_id = serializers.IntegerField(help_text="Inventory item ID")
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    unit_price = serializers.DecimalField(max_digits=18, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=Decimal('0'))
    tax_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=Decimal('0'))

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative")
        return value

    def validate_discount_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Discount amount cannot be negative")
        return value

    def validate_tax_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Tax amount cannot be negative")
        return value


class InvoiceCreateSerializer(serializers.Serializer):
    """Serializer for creating complete invoice with items"""
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(),
        help_text="Client ID"
    )
    invoice_date = serializers.DateField(
        default=timezone.now().date,
        help_text="Invoice date (defaults to today)"
    )
    due_date = serializers.DateField(
        help_text="Payment due date"
    )
    payment_terms = serializers.CharField(
        max_length=200,
        required=False,
        default='',
        help_text="Payment terms (e.g., 'Net 30')"
    )
    notes = serializers.CharField(
        required=False,
        default='',
        help_text="Additional notes"
    )
    discount_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0'),
        help_text="Total invoice-level discount"
    )
    
    # Items
    items = InvoiceCreateItemSerializer(
        many=True,
        help_text="""
        List of invoice items:
        [
            {
                "item_id": 1,
                "quantity": "10.00",
                "unit_price": "50.00",
                "discount_amount": "0.00",
                "tax_amount": "0.00"
            }
        ]
        """
    )

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Invoice must have at least one item")
        return value
    
    def validate(self, data):
        if data['due_date'] < data['invoice_date']:
            raise serializers.ValidationError("Due date cannot be before invoice date")
        return data


class RecordPaymentSerializer(serializers.Serializer):
    """
    Serializer for recording invoice payment with bank routing.
    All payments go directly to the selected bank account.
    """
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        help_text="Payment amount"
    )
    payment_date = serializers.DateField(
        default=timezone.now().date,
        help_text="Payment date"
    )
    payment_method = serializers.ChoiceField(
        choices=[
            ('cash', 'Cash'),
            ('bank_transfer', 'Bank Transfer'),
            ('credit_card', 'Credit Card'),
            ('mobile_money', 'Mobile Money'),
            ('check', 'Check'),
            ('online', 'Online Payment'),
        ],
        default='cash',
        help_text="Payment method"
    )
    bank_account_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Bank account ID – all payments route to the selected bank account"
    )
    reference_number = serializers.CharField(
        max_length=100,
        required=False,
        help_text="Payment reference number (e.g., transaction ID, check number)"
    )
    notes = serializers.CharField(
        required=False,
        default='',
        help_text="Payment notes"
    )
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be positive")
        return value
    
    def validate(self, attrs):
        """Validate that a bank account is provided for payment."""
        bank_account_id = attrs.get('bank_account_id')
        if not bank_account_id:
            raise serializers.ValidationError({
                'bank_account_id': 'Please select a bank account to receive the payment.'
            })
        return attrs


class InvoiceSummarySerializer(serializers.Serializer):
    """Summary statistics for invoices"""
    total_invoices = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_paid = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_outstanding = serializers.DecimalField(max_digits=18, decimal_places=2)
    overdue_count = serializers.IntegerField()
    overdue_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
