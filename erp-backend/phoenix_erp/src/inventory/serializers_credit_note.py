"""
Credit Note Serializers

Handles serialization of credit notes and credit note items.
"""

from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone

from inventory.models_credit_note import CreditNote, CreditNoteItem
from inventory.models import Invoice, InvoiceItem, InventoryItem
from clients.models import Client
from users.serializers import UserSerializer
from clients.serializers import ClientListSerializer


class CreditNoteItemSerializer(serializers.ModelSerializer):
    """Serializer for credit note line items"""
    
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    original_invoice_item_description = serializers.CharField(
        source='original_invoice_item.description',
        read_only=True
    )
    
    class Meta:
        model = CreditNoteItem
        fields = [
            'id',
            'credit_note',
            'original_invoice_item',
            'item',
            'item_name',
            'item_sku',
            'description',
            'quantity_returned',
            'original_quantity',
            'unit_price',
            'discount',
            'tax_amount',
            'line_total',
            'return_reason',
            'return_notes',
            'return_to_stock',
            'stock_returned',
            'original_invoice_item_description',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'credit_note',
            'item_name',
            'item_sku',
            'original_invoice_item_description',
            'stock_returned',
            'created_at',
            'updated_at',
        ]
    
    def validate(self, data):
        """Validate credit note item"""
        # Validate quantity
        original_invoice_item = data.get('original_invoice_item')
        quantity_returned = data.get('quantity_returned')
        
        if original_invoice_item and quantity_returned:
            if quantity_returned > original_invoice_item.quantity:
                raise serializers.ValidationError(
                    f"Quantity returned ({quantity_returned}) cannot exceed "
                    f"original quantity ({original_invoice_item.quantity})"
                )
        
        # Calculate line total if not provided
        if 'line_total' not in data or data['line_total'] is None:
            unit_price = data.get('unit_price', Decimal('0'))
            discount = data.get('discount', Decimal('0'))
            tax_amount = data.get('tax_amount', Decimal('0'))
            
            data['line_total'] = (
                (quantity_returned * unit_price)
                - discount
                + tax_amount
            )
        
        return data


class CreditNoteItemReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for credit note items with expanded data"""
    
    item = serializers.SerializerMethodField()
    original_invoice_item = serializers.SerializerMethodField()
    
    class Meta:
        model = CreditNoteItem
        fields = [
            'id',
            'credit_note',
            'original_invoice_item',
            'item',
            'description',
            'quantity_returned',
            'original_quantity',
            'unit_price',
            'discount',
            'tax_amount',
            'line_total',
            'return_reason',
            'return_notes',
            'return_to_stock',
            'stock_returned',
            'created_at',
            'updated_at',
        ]
    
    def get_item(self, obj):
        """Get inventory item details"""
        if obj.item:
            return {
                'id': obj.item.id,
                'name': obj.item.name,
                'sku': obj.item.sku,
                'unit_of_measure': obj.item.unit_of_measure,
            }
        return None
    
    def get_original_invoice_item(self, obj):
        """Get original invoice item details"""
        if obj.original_invoice_item:
            return {
                'id': obj.original_invoice_item.id,
                'description': obj.original_invoice_item.description,
                'quantity': obj.original_invoice_item.quantity,
                'unit_price': obj.original_invoice_item.unit_price,
                'total_price': obj.original_invoice_item.total_price,
            }
        return None


class CreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for credit notes"""
    
    items = CreditNoteItemSerializer(many=True, required=False)
    client_name = serializers.CharField(source='client.first_name', read_only=True)
    invoice_number = serializers.CharField(source='original_invoice.invoice_number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    applied_by_name = serializers.CharField(source='applied_by.username', read_only=True)
    
    # Make original_invoice optional since it can be passed via URL in nested routes
    original_invoice = serializers.PrimaryKeyRelatedField(
        queryset=Invoice.objects.all(),
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = CreditNote
        fields = [
            'id',
            'credit_note_number',
            'original_invoice',
            'invoice_number',
            'client',
            'client_name',
            'issue_date',
            'reason',
            'notes',
            'subtotal',
            'discount',
            'tax_amount',
            'total_amount',
            'applied_to_account',
            'applied_date',
            'applied_by',
            'applied_by_name',
            'status',
            'reversed',
            'reversed_date',
            'reversed_by',
            'reversal_reason',
            'created_by',
            'created_by_name',
            'branch',
            'owner',
            'items',
            'remaining_amount',
            'can_be_applied',
            'can_be_cancelled',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'credit_note_number',
            'client_name',
            'invoice_number',
            'applied_to_account',
            'applied_date',
            'applied_by',
            'applied_by_name',
            'reversed',
            'reversed_date',
            'reversed_by',
            'remaining_amount',
            'can_be_applied',
            'can_be_cancelled',
            'created_at',
            'updated_at',
        ]
    
    def validate(self, data):
        """Validate credit note"""
        # Validate invoice and client match
        original_invoice = data.get('original_invoice')
        client = data.get('client')
        
        if original_invoice and client:
            if original_invoice.client != client:
                raise serializers.ValidationError(
                    "Credit note client must match original invoice client"
                )
        
        # Validate total amount doesn't exceed invoice
        total_amount = data.get('total_amount')
        if original_invoice and total_amount:
            if total_amount > original_invoice.total_amount:
                raise serializers.ValidationError(
                    f"Credit note amount ({total_amount}) cannot exceed "
                    f"original invoice amount ({original_invoice.total_amount})"
                )
        
        # Validate totals calculation
        subtotal = data.get('subtotal', Decimal('0'))
        discount = data.get('discount', Decimal('0'))
        tax_amount = data.get('tax_amount', Decimal('0'))
        
        calculated_total = subtotal - discount + tax_amount
        if total_amount and abs(total_amount - calculated_total) > Decimal('0.01'):
            raise serializers.ValidationError(
                f"Total amount ({total_amount}) doesn't match calculated total ({calculated_total})"
            )
        
        return data
    
    def create(self, validated_data):
        """Create credit note with items"""
        items_data = validated_data.pop('items', [])
        
        # Set created_by from request user
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        
        # Set issue_date if not provided
        if 'issue_date' not in validated_data:
            validated_data['issue_date'] = timezone.now().date()
        
        # Create credit note
        credit_note = CreditNote.objects.create(**validated_data)
        
        # Create items
        for item_data in items_data:
            CreditNoteItem.objects.create(
                credit_note=credit_note,
                **item_data
            )
        
        return credit_note
    
    def update(self, instance, validated_data):
        """Update credit note"""
        items_data = validated_data.pop('items', None)
        
        # Update credit note fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Delete existing items
            instance.items.all().delete()
            
            # Create new items
            for item_data in items_data:
                CreditNoteItem.objects.create(
                    credit_note=instance,
                    **item_data
                )
        
        return instance


class CreditNoteReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for credit notes with expanded data"""
    
    items = CreditNoteItemReadSerializer(many=True, read_only=True)
    client = ClientListSerializer(read_only=True)
    original_invoice = serializers.SerializerMethodField()
    created_by = UserSerializer(read_only=True)
    applied_by = UserSerializer(read_only=True)
    reversed_by = UserSerializer(read_only=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'id',
            'credit_note_number',
            'original_invoice',
            'client',
            'issue_date',
            'reason',
            'notes',
            'subtotal',
            'discount',
            'tax_amount',
            'total_amount',
            'applied_to_account',
            'applied_date',
            'applied_by',
            'status',
            'reversed',
            'reversed_date',
            'reversed_by',
            'reversal_reason',
            'created_by',
            'branch',
            'owner',
            'items',
            'remaining_amount',
            'can_be_applied',
            'can_be_cancelled',
            'created_at',
            'updated_at',
        ]
    
    def get_original_invoice(self, obj):
        """Get original invoice summary"""
        invoice = obj.original_invoice
        return {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'invoice_date': invoice.invoice_date,
            'total_amount': invoice.total_amount,
            'status': invoice.status,
        }


class CreditNoteApplySerializer(serializers.Serializer):
    """Serializer for applying credit note to customer account"""
    
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional notes about applying the credit"
    )
    
    def validate(self, data):
        """Validate credit note can be applied"""
        credit_note = self.instance
        
        if not credit_note.can_be_applied:
            raise serializers.ValidationError(
                "Credit note cannot be applied. "
                f"Status: {credit_note.status}, "
                f"Already applied: {credit_note.applied_to_account}, "
                f"Reversed: {credit_note.reversed}"
            )
        
        return data


class CreditNoteCancelSerializer(serializers.Serializer):
    """Serializer for cancelling credit note"""
    
    cancellation_reason = serializers.CharField(
        required=True,
        help_text="Reason for cancelling credit note"
    )
    
    def validate(self, data):
        """Validate credit note can be cancelled"""
        credit_note = self.instance
        
        if not credit_note.can_be_cancelled:
            raise serializers.ValidationError(
                f"Credit note cannot be cancelled. Status: {credit_note.status}, "
                f"Applied: {credit_note.applied_to_account}"
            )
        
        return data


class CreditNoteReverseSerializer(serializers.Serializer):
    """Serializer for reversing applied credit note"""
    
    reversal_reason = serializers.CharField(
        required=True,
        help_text="Reason for reversing the credit"
    )
    
    def validate(self, data):
        """Validate credit note can be reversed"""
        credit_note = self.instance
        
        if not credit_note.applied_to_account:
            raise serializers.ValidationError(
                "Credit note has not been applied and cannot be reversed"
            )
        
        if credit_note.reversed:
            raise serializers.ValidationError(
                "Credit note has already been reversed"
            )
        
        if credit_note.status == 'cancelled':
            raise serializers.ValidationError(
                "Cannot reverse cancelled credit note"
            )
        
        return data
