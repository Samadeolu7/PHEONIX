# procurement/serializers.py
"""
Serializers for procurement API
"""
from rest_framework import serializers
from decimal import Decimal
from datetime import date

from .models import (
    Supplier, SupplierDocument, PurchaseRequisition, PurchaseRequisitionItem,
    SupplierQuote, SupplierQuoteItem,
    PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote, GoodsReceivedNoteItem,
    PurchaseReturn, PurchaseReturnItem
)
from inventory.models import InventoryItem, Location


class SupplierSerializer(serializers.ModelSerializer):
    """Supplier serializer"""
    outstanding_balance = serializers.SerializerMethodField()
    current_balance = serializers.SerializerMethodField(
        help_text="Real-time balance of this supplier's own GL subledger account "
                  "(invoices, on-account advances, and applied payments all net "
                  "through it) — the true 'supplier account' balance."
    )

    def get_outstanding_balance(self, obj):
        return str(obj.get_outstanding_balance())

    def get_current_balance(self, obj):
        if obj.account_id:
            return str(obj.account.balance)
        return None

    class Meta:
        model = Supplier
        fields = [
            'id', 'supplier_code', 'name', 'contact_person',
            'email', 'phone', 'address', 'tax_id',
            'payment_terms', 'credit_limit', 'is_active',
            'metadata', 'created_at', 'updated_at', 'outstanding_balance',
            'account', 'current_balance',
        ]
        read_only_fields = [
            'supplier_code', 'created_at', 'updated_at', 'outstanding_balance',
            'account', 'current_balance',
        ]
    
    def validate(self, attrs):
        """Validate supplier data"""
        # Supplier code will be auto-generated, so we don't need to validate it here
        # The model will handle uniqueness
        return attrs


class SupplierDocumentSerializer(serializers.ModelSerializer):
    """Serializer for supplier documents with file upload support"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = SupplierDocument
        fields = [
            'id', 'supplier', 'supplier_name', 'title', 'category',
            'category_display', 'file', 'description', 'expiry_date',
            'is_expired', 'uploaded_by', 'uploaded_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['uploaded_by', 'created_at', 'updated_at']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None


class ConvertToPOSerializer(serializers.Serializer):
    """
    Serializer for converting PR to PO
    Validates the required fields for PO creation
    """
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(),
        required=True,
        help_text="ID of the supplier"
    )
    delivery_location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(),
        required=True,
        help_text="ID of the delivery location"
    )
    expected_delivery_date = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Expected delivery date (YYYY-MM-DD)"
    )
    order_date = serializers.DateField(
        required=False,
        default=date.today,
        help_text="Order date (defaults to today)"
    )
    payment_terms = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text="Payment terms (e.g., 'Net 30', 'Net 60')"
    )
    custom_payment_terms = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
        help_text="Custom payment terms description"
    )
    contact_person = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        help_text="Contact person at supplier"
    )
    contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
        help_text="Contact phone number"
    )
    contact_email = serializers.EmailField(
        required=False,
        allow_blank=True,
        help_text="Contact email address"
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Additional notes for the PO"
    )
    selected_quote = serializers.PrimaryKeyRelatedField(
        queryset=SupplierQuote.objects.all(),
        required=False,
        allow_null=True,
        help_text="Optional: Select a quote to use its pricing and items"
    )
    
    class Meta:
        fields = [
            'supplier', 'delivery_location', 'expected_delivery_date',
            'order_date', 'payment_terms', 'custom_payment_terms',
            'contact_person', 'contact_phone', 'contact_email', 'notes',
            'selected_quote'
        ]


class PurchaseRequisitionItemSerializer(serializers.ModelSerializer):
    """PR item serializer"""
    # Use source='item_id' to directly map to the database foreign key column
    # This bypasses all ForeignKey validation and allows optional null values
    item = serializers.IntegerField(
        source='item_id',
        required=False,
        allow_null=True,
        help_text="Link to inventory item ID (optional - can use description only)"
    )
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    total_price = serializers.SerializerMethodField()
    
    class Meta:
        model = PurchaseRequisitionItem
        fields = [
            'id', 'item', 'item_name', 'item_sku', 'description',
            'quantity', 'estimated_unit_price', 'total_price',
            'notes', 'po_item'
        ]
        read_only_fields = ['id', 'po_item', 'total_price', 'item_name', 'item_sku']
        extra_kwargs = {
            'description': {'required': False, 'allow_blank': True},
            'notes': {'required': False, 'allow_blank': True},
            'estimated_unit_price': {'min_value': Decimal('0')},
            'quantity': {'min_value': Decimal('0.01')}
        }
    
    def get_total_price(self, obj):
        return obj.quantity * obj.estimated_unit_price


class PurchaseRequisitionSerializer(serializers.ModelSerializer):
    """Purchase requisition serializer"""
    items = PurchaseRequisitionItemSerializer(many=True, required=False)
    requested_by_name = serializers.CharField(
        source='requested_by.get_full_name',
        read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = PurchaseRequisition
        fields = [
            'id', 'pr_number', 'requested_by', 'requested_by_name',
            'department', 'request_date', 'required_by_date',
            'purpose', 'status', 
            # Vendor invoice fields (pre-approval requirement)
            'vendor_invoice_number', 'vendor_invoice_date', 'vendor_invoice_amount',
            'vendor_invoice_file', 'invoice_verified_by', 'invoice_verified_at',
            # Approval fields
            'approved_by', 'approved_by_name',
            'approved_at', 'rejection_reason', 'estimated_total',
            'notes', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'pr_number', 'requested_by', 'requested_by_name',
            'invoice_verified_by', 'invoice_verified_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'estimated_total', 'status',
            'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'department': {'required': False, 'allow_blank': True},
            'request_date': {'required': False},  # Defaults to today
            'purpose': {'required': True},
            'required_by_date': {'required': True},
            'notes': {'required': False, 'allow_blank': True}
        }
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Auto-fill requested_by from request user
        if 'requested_by' not in validated_data:
            validated_data['requested_by'] = self.context['request'].user
        
        # Set default status to draft
        if 'status' not in validated_data:
            validated_data['status'] = 'draft'
        
        requisition = PurchaseRequisition.objects.create(**validated_data)
        
        for item_data in items_data:
            # No need to convert anymore - 'item_id' comes directly from serializer source
            PurchaseRequisitionItem.objects.create(
                requisition=requisition,
                **item_data
            )
        
        requisition.calculate_total()
        return requisition
    
    def update(self, instance, validated_data):
        """Update requisition and its items"""
        items_data = validated_data.pop('items', None)
        
        # Update PR fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Remove old items
            instance.items.all().delete()
            
            # Create new items
            for item_data in items_data:
                # No need to convert anymore - 'item_id' comes directly from serializer source
                PurchaseRequisitionItem.objects.create(
                    requisition=instance,
                    **item_data
                )
            
            # Recalculate total
            instance.calculate_total()
        
        return instance


class SupplierQuoteItemSerializer(serializers.ModelSerializer):
    """Quote item serializer"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    
    class Meta:
        model = SupplierQuoteItem
        fields = [
            'id', 'item', 'item_name', 'description',
            'quantity', 'unit_price', 'total_price',
            'lead_time_days'
        ]


class SupplierQuoteSerializer(serializers.ModelSerializer):
    """Supplier quote serializer"""
    items = SupplierQuoteItemSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    attachment = serializers.FileField(required=False, allow_null=True)
    
    class Meta:
        model = SupplierQuote
        fields = [
            'id', 'quote_number', 'requisition', 'supplier',
            'supplier_name', 'quote_date', 'valid_until',
            'subtotal', 'tax_amount', 'shipping_cost', 'total_amount',
            'payment_terms', 'delivery_terms', 'status',
            'notes', 'attachment', 'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['quote_number', 'created_at', 'updated_at']
        extra_kwargs = {
            'attachment': {'required': False, 'allow_null': True}
        }
    
    def create(self, validated_data):
        """Create quote with items"""
        items_data = validated_data.pop('items', [])
        quote = SupplierQuote.objects.create(**validated_data)

        # Ensure nested items inherit owner/branch/tenant if those fields exist on the item model
        from .models import SupplierQuoteItem
        item_field_names = [f.name for f in SupplierQuoteItem._meta.fields]

        for item_data in items_data:
            item_kwargs = item_data.copy()
            if 'owner' in item_field_names and getattr(quote, 'owner', None) is not None:
                item_kwargs['owner'] = quote.owner
            if 'branch' in item_field_names and getattr(quote, 'branch', None) is not None:
                item_kwargs['branch'] = quote.branch
            if 'tenant' in item_field_names and getattr(quote, 'tenant', None) is not None:
                item_kwargs['tenant'] = quote.tenant

            SupplierQuoteItem.objects.create(
                quote=quote,
                **item_kwargs
            )

        return quote
    
    def update(self, instance, validated_data):
        """Update quote and its items"""
        items_data = validated_data.pop('items', None)
        
        # Update quote fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Remove old items
            instance.items.all().delete()

            from .models import SupplierQuoteItem
            item_field_names = [f.name for f in SupplierQuoteItem._meta.fields]

            # Create new items and inherit owner/branch/tenant when applicable
            for item_data in items_data:
                item_kwargs = item_data.copy()
                if 'owner' in item_field_names and getattr(instance, 'owner', None) is not None:
                    item_kwargs['owner'] = instance.owner
                if 'branch' in item_field_names and getattr(instance, 'branch', None) is not None:
                    item_kwargs['branch'] = instance.branch
                if 'tenant' in item_field_names and getattr(instance, 'tenant', None) is not None:
                    item_kwargs['tenant'] = instance.tenant

                SupplierQuoteItem.objects.create(
                    quote=instance,
                    **item_kwargs
                )
        
        return instance


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """PO item serializer"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    quantity_pending = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True
    )
    is_fully_received = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'item', 'item_name', 'item_sku', 'description',
            'quantity', 'unit_price', 'discount', 'tax_rate',
            'total_price', 'quantity_received', 'quantity_pending',
            'is_fully_received', 'expected_delivery_date', 'notes'
        ]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """Purchase order serializer (list view)"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    location_name = serializers.CharField(
        source='delivery_location.name',
        read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    received_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    attachment = serializers.FileField(required=False, allow_null=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'requisition', 'selected_quote',
            'supplier', 'supplier_name', 'order_date',
            'expected_delivery_date', 'delivery_date',
            'delivery_location', 'location_name',
            'contact_person', 'contact_phone', 'contact_email',
            'payment_terms', 'custom_payment_terms', 'status',
            'subtotal', 'tax_amount', 'shipping_cost', 'discount',
            'total_amount', 'requires_approval', 'approved_by',
            'approved_by_name', 'approved_at', 'acknowledged_at',
            'supplier_po_number', 'attachment', 'notes', 'received_percentage',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'po_number', 'subtotal', 'total_amount',
            'approved_by', 'approved_at', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'attachment': {'required': False, 'allow_null': True}
        }


class PurchaseOrderDetailSerializer(PurchaseOrderSerializer):
    """Purchase order serializer (detail view with items)"""
    items = PurchaseOrderItemSerializer(many=True, required=False)
    
    class Meta(PurchaseOrderSerializer.Meta):
        fields = PurchaseOrderSerializer.Meta.fields + ['items']
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        
        # Ensure nested items inherit owner/branch/tenant
        from .models import PurchaseOrderItem
        item_field_names = [f.name for f in PurchaseOrderItem._meta.fields]
        
        for item_data in items_data:
            item_kwargs = item_data.copy()
            if 'owner' in item_field_names and getattr(purchase_order, 'owner', None) is not None:
                item_kwargs['owner'] = purchase_order.owner
            if 'branch' in item_field_names and getattr(purchase_order, 'branch', None) is not None:
                item_kwargs['branch'] = purchase_order.branch
            if 'tenant' in item_field_names and getattr(purchase_order, 'tenant', None) is not None:
                item_kwargs['tenant'] = purchase_order.tenant
            
            PurchaseOrderItem.objects.create(
                purchase_order=purchase_order,
                **item_kwargs
            )
        
        purchase_order.calculate_totals()
        return purchase_order
    
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update PO fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Remove old items
            instance.items.all().delete()
            
            # Ensure nested items inherit owner/branch/tenant
            from .models import PurchaseOrderItem
            item_field_names = [f.name for f in PurchaseOrderItem._meta.fields]
            
            # Create new items
            for item_data in items_data:
                item_kwargs = item_data.copy()
                if 'owner' in item_field_names and getattr(instance, 'owner', None) is not None:
                    item_kwargs['owner'] = instance.owner
                if 'branch' in item_field_names and getattr(instance, 'branch', None) is not None:
                    item_kwargs['branch'] = instance.branch
                if 'tenant' in item_field_names and getattr(instance, 'tenant', None) is not None:
                    item_kwargs['tenant'] = instance.tenant
                
                PurchaseOrderItem.objects.create(
                    purchase_order=instance,
                    **item_kwargs
                )
            
            instance.calculate_totals()
        
        return instance


class GoodsReceivedNoteItemSerializer(serializers.ModelSerializer):
    """GRN item serializer"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    
    class Meta:
        model = GoodsReceivedNoteItem
        fields = [
            'id', 'item', 'item_name', 'item_sku', 'po_item',
            'quantity_ordered', 'quantity_received',
            'quantity_accepted', 'quantity_rejected',
            'unit_cost', 'total_cost',
            'batch_number', 'serial_number', 'expiry_date',
            'condition_notes', 'rejection_reason', 'quality_data'
        ]


class GoodsReceivedNoteSerializer(serializers.ModelSerializer):
    """GRN serializer"""
    items = GoodsReceivedNoteItemSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    location_name = serializers.CharField(
        source='received_location.name',
        read_only=True
    )
    received_by_name = serializers.CharField(
        source='received_by.get_full_name',
        read_only=True
    )
    po_number = serializers.CharField(
        source='purchase_order.po_number',
        read_only=True,
        allow_null=True
    )
    delivery_note_attachment = serializers.FileField(required=False, allow_null=True)
    
    class Meta:
        model = GoodsReceivedNote
        fields = [
            'id', 'grn_number', 'purchase_order', 'po_number',
            'supplier', 'supplier_name', 'received_date', 'received_time',
            'received_location', 'location_name', 'received_by',
            'received_by_name', 'delivery_note_number', 'vehicle_number',
            'driver_name', 'driver_phone', 'supplier_invoice_number',
            'supplier_invoice_date', 'supplier_invoice_amount',
            'quality_status', 'inspected_by', 'inspection_notes',
            'total_amount', 'is_posted', 'posted_at', 'posted_by',
            'accounts_payable', 'notes', 'delivery_note_attachment',
            'photos', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'grn_number', 'received_by', 'is_posted', 'posted_at',
            'posted_by', 'accounts_payable', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'delivery_note_attachment': {'required': False, 'allow_null': True}
        }
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        grn = GoodsReceivedNote.objects.create(**validated_data)
        
        # Ensure nested items inherit owner/branch/tenant
        from .models import GoodsReceivedNoteItem
        item_field_names = [f.name for f in GoodsReceivedNoteItem._meta.fields]
        
        # If linked to PO, auto-populate items
        if grn.purchase_order and not items_data:
            for po_item in grn.purchase_order.items.all():
                quantity_pending = po_item.quantity - po_item.quantity_received
                if quantity_pending > 0:
                    item_kwargs = {
                        'grn': grn,
                        'item': po_item.item,
                        'po_item': po_item,
                        'quantity_ordered': po_item.quantity,
                        'quantity_received': quantity_pending,
                        'quantity_accepted': quantity_pending,
                        'unit_cost': po_item.unit_price
                    }
                    if 'owner' in item_field_names and getattr(grn, 'owner', None) is not None:
                        item_kwargs['owner'] = grn.owner
                    if 'branch' in item_field_names and getattr(grn, 'branch', None) is not None:
                        item_kwargs['branch'] = grn.branch
                    if 'tenant' in item_field_names and getattr(grn, 'tenant', None) is not None:
                        item_kwargs['tenant'] = grn.tenant
                    
                    GoodsReceivedNoteItem.objects.create(**item_kwargs)
        else:
            for item_data in items_data:
                item_kwargs = item_data.copy()
                if 'owner' in item_field_names and getattr(grn, 'owner', None) is not None:
                    item_kwargs['owner'] = grn.owner
                if 'branch' in item_field_names and getattr(grn, 'branch', None) is not None:
                    item_kwargs['branch'] = grn.branch
                if 'tenant' in item_field_names and getattr(grn, 'tenant', None) is not None:
                    item_kwargs['tenant'] = grn.tenant
                
                GoodsReceivedNoteItem.objects.create(
                    grn=grn,
                    **item_kwargs
                )
        
        grn.calculate_total()
        return grn
    
    def update(self, instance, validated_data):
        """Update GRN and its items"""
        items_data = validated_data.pop('items', None)
        
        # Update GRN fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Remove old items
            instance.items.all().delete()
            
            # Ensure nested items inherit owner/branch/tenant
            from .models import GoodsReceivedNoteItem
            item_field_names = [f.name for f in GoodsReceivedNoteItem._meta.fields]
            
            # Create new items
            for item_data in items_data:
                item_kwargs = item_data.copy()
                if 'owner' in item_field_names and getattr(instance, 'owner', None) is not None:
                    item_kwargs['owner'] = instance.owner
                if 'branch' in item_field_names and getattr(instance, 'branch', None) is not None:
                    item_kwargs['branch'] = instance.branch
                if 'tenant' in item_field_names and getattr(instance, 'tenant', None) is not None:
                    item_kwargs['tenant'] = instance.tenant
                
                GoodsReceivedNoteItem.objects.create(
                    grn=instance,
                    **item_kwargs
                )
            
            # Recalculate total
            instance.calculate_total()
        
        return instance


class PurchaseReturnItemSerializer(serializers.ModelSerializer):
    """Return item serializer"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    
    class Meta:
        model = PurchaseReturnItem
        fields = [
            'id', 'grn_item', 'item', 'item_name',
            'quantity_returned', 'unit_cost', 'total_cost',
            'reason'
        ]


class PurchaseReturnSerializer(serializers.ModelSerializer):
    """Purchase return serializer"""
    items = PurchaseReturnItemSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    grn_number = serializers.CharField(source='grn.grn_number', read_only=True)
    
    class Meta:
        model = PurchaseReturn
        fields = [
            'id', 'return_number', 'grn', 'grn_number',
            'supplier', 'supplier_name', 'return_date',
            'return_reason', 'status', 'total_amount',
            'refund_method', 'refund_received', 'refund_date',
            'is_posted', 'posted_at', 'journal_entry', 'notes', 'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'return_number', 'is_posted', 'posted_at', 'journal_entry',
            'created_at', 'updated_at'
        ]
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        purchase_return = PurchaseReturn.objects.create(**validated_data)
        
        # Ensure nested items inherit owner/branch/tenant
        from .models import PurchaseReturnItem
        item_field_names = [f.name for f in PurchaseReturnItem._meta.fields]
        
        for item_data in items_data:
            item_kwargs = item_data.copy()
            if 'owner' in item_field_names and getattr(purchase_return, 'owner', None) is not None:
                item_kwargs['owner'] = purchase_return.owner
            if 'branch' in item_field_names and getattr(purchase_return, 'branch', None) is not None:
                item_kwargs['branch'] = purchase_return.branch
            if 'tenant' in item_field_names and getattr(purchase_return, 'tenant', None) is not None:
                item_kwargs['tenant'] = purchase_return.tenant
            
            PurchaseReturnItem.objects.create(
                purchase_return=purchase_return,
                **item_kwargs
            )
        
        purchase_return.calculate_total()
        return purchase_return
    
    def update(self, instance, validated_data):
        """Update purchase return and its items"""
        items_data = validated_data.pop('items', None)
        
        # Update return fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Remove old items
            instance.items.all().delete()
            
            # Ensure nested items inherit owner/branch/tenant
            from .models import PurchaseReturnItem
            item_field_names = [f.name for f in PurchaseReturnItem._meta.fields]
            
            # Create new items
            for item_data in items_data:
                item_kwargs = item_data.copy()
                if 'owner' in item_field_names and getattr(instance, 'owner', None) is not None:
                    item_kwargs['owner'] = instance.owner
                if 'branch' in item_field_names and getattr(instance, 'branch', None) is not None:
                    item_kwargs['branch'] = instance.branch
                if 'tenant' in item_field_names and getattr(instance, 'tenant', None) is not None:
                    item_kwargs['tenant'] = instance.tenant
                
                PurchaseReturnItem.objects.create(
                    purchase_return=instance,
                    **item_kwargs
                )
            
            # Recalculate total
            instance.calculate_total()
        
        return instance


# ========== NEW: Procurement Configuration Serializers ==========

from procurement.config_models import ProcurementConfig
from automations.models import WorkflowTemplate


class ProcurementConfigSerializer(serializers.ModelSerializer):
    """
    Serializer for procurement configuration
    """
    # Read-only computed fields
    next_pr_number = serializers.SerializerMethodField()
    next_po_number = serializers.SerializerMethodField()
    next_grn_number = serializers.SerializerMethodField()
    
    # Workflow template details (nested read)
    default_pr_workflow_details = serializers.SerializerMethodField()
    default_po_workflow_details = serializers.SerializerMethodField()
    default_grn_workflow_details = serializers.SerializerMethodField()
    high_value_po_workflow_details = serializers.SerializerMethodField()
    
    class Meta:
        model = ProcurementConfig
        fields = [
            'id', 'branch', 'owner',
            'created_at', 'updated_at',
            
            # 3-Way Matching
            'enable_three_way_matching',
            'matching_tolerance_percentage',
            'auto_approve_within_tolerance',
            
            # Document Numbering
            'pr_prefix', 'po_prefix', 'grn_prefix',
            'next_pr_number', 'next_po_number', 'next_grn_number',
            
            # Workflow Links
            'default_pr_workflow', 'default_po_workflow',
            'default_grn_workflow', 'high_value_po_workflow',
            'default_pr_workflow_details', 'default_po_workflow_details',
            'default_grn_workflow_details', 'high_value_po_workflow_details',
            
            # Amount-based routing
            'high_value_threshold',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'next_pr_number', 'next_po_number', 'next_grn_number',
            'default_pr_workflow_details', 'default_po_workflow_details',
            'default_grn_workflow_details', 'high_value_po_workflow_details',
        ]
    
    def get_next_pr_number(self, obj):  
        """Get next PR number"""
        # Simple numbering - just return prefix + 1 (or implement counter if needed)
        return f"{obj.pr_prefix}-NEXT"
    
    def get_next_po_number(self, obj):
        """Get next PO number"""
        return f"{obj.po_prefix}-NEXT"
    
    def get_next_grn_number(self, obj):
        """Get next GRN number"""
        return f"{obj.grn_prefix}-NEXT"
    
    def get_default_pr_workflow_details(self, obj):
        """Get PR workflow details"""
        if obj.default_pr_workflow:
            return {
                'id': obj.default_pr_workflow.id,
                'name': obj.default_pr_workflow.name,
                'run_sequence': obj.default_pr_workflow.run_sequence,
            }
        return None
    
    def get_default_po_workflow_details(self, obj):
        """Get PO workflow details"""
        if obj.default_po_workflow:
            return {
                'id': obj.default_po_workflow.id,
                'name': obj.default_po_workflow.name,
                'run_sequence': obj.default_po_workflow.run_sequence,
            }
        return None
    
    def get_default_grn_workflow_details(self, obj):
        """Get GRN workflow details"""
        if obj.default_grn_workflow:
            return {
                'id': obj.default_grn_workflow.id,
                'name': obj.default_grn_workflow.name,
                'run_sequence': obj.default_grn_workflow.run_sequence,
            }
        return None
    
    def get_high_value_po_workflow_details(self, obj):
        """Get high value PO workflow details"""
        if obj.high_value_po_workflow:
            return {
                'id': obj.high_value_po_workflow.id,
                'name': obj.high_value_po_workflow.name,
                'run_sequence': obj.high_value_po_workflow.run_sequence,
            }
        return None
    
    def validate_matching_tolerance_percentage(self, value):
        """Validate tolerance percentage"""
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Tolerance percentage must be between 0 and 100"
            )
        return value
    
    def validate_high_value_threshold(self, value):
        """Validate high value threshold"""
        if value is not None and value < 0:
            raise serializers.ValidationError(
                "High value threshold must be positive"
            )
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        # If high value threshold is set, high value workflow should be set
        high_value_threshold = data.get('high_value_threshold')
        high_value_workflow = data.get('high_value_po_workflow')
        
        if high_value_threshold and not high_value_workflow:
            raise serializers.ValidationError({
                'high_value_po_workflow': 
                    'High value workflow must be set when threshold is specified'
            })
        
        return data


class WorkflowTemplateListSerializer(serializers.ModelSerializer):
    """
    Simplified workflow template serializer for dropdowns/selection
    """
    class Meta:
        model = WorkflowTemplate
        fields = [
            'id', 'name', 'run_sequence', 'description',
            'category', 'is_active'
        ]


class ThreeWayMatchingRequestSerializer(serializers.Serializer):
    """
    Serializer for 3-way matching request
    """
    po_id = serializers.IntegerField(required=True)
    grn_id = serializers.IntegerField(required=True)
    invoice_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        required=False,
        allow_null=True
    )
    invoice_items = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True,
        default=list
    )
    
    def validate_po_id(self, value):
        """Validate PO exists"""
        from procurement.models import PurchaseOrder
        if not PurchaseOrder.objects.filter(id=value).exists():
            raise serializers.ValidationError("Purchase Order not found")
        return value
    
    def validate_grn_id(self, value):
        """Validate GRN exists"""
        from procurement.models import GoodsReceivedNote
        if not GoodsReceivedNote.objects.filter(id=value).exists():
            raise serializers.ValidationError("GRN not found")
        return value


class ThreeWayMatchingResponseSerializer(serializers.Serializer):
    """
    Serializer for 3-way matching response
    """
    overall_status = serializers.ChoiceField(
        choices=['passed', 'warning', 'failed']
    )
    can_proceed = serializers.BooleanField()
    requires_approval = serializers.BooleanField()
    matching_results = serializers.DictField()
    discrepancies = serializers.ListField(child=serializers.DictField())
    report = serializers.CharField(required=False)
    approver_roles = serializers.ListField(child=serializers.CharField(), required=False)
    critical_failures = serializers.IntegerField(required=False)
    warnings = serializers.IntegerField(required=False)
    summary = serializers.CharField(required=False)