# inventory/serializers_material_request.py
"""
Serializers for Material Request system
"""
from rest_framework import serializers
from .models_material_request import MaterialRequest, MaterialRequestItem
from .models import InventoryItem
from clients.models import Client
from .serializers import InventoryItemSerializer
from clients.serializers import ClientDetailSerializer as ClientSerializer


class MaterialRequestItemSerializer(serializers.ModelSerializer):
    """Serializer for material request line items"""
    item_details = InventoryItemSerializer(source='item', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    unit_of_measure = serializers.CharField(source='item.unit_of_measure', read_only=True)
    
    class Meta:
        model = MaterialRequestItem
        fields = [
            'id', 'item', 'item_details', 'item_name', 'item_sku', 
            'unit_of_measure', 'quantity', 'approved_quantity', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MaterialRequestCreateItemSerializer(serializers.ModelSerializer):
    """Serializer for creating material request items"""
    class Meta:
        model = MaterialRequestItem
        fields = ['item', 'quantity', 'notes']


class MaterialRequestSerializer(serializers.ModelSerializer):
    """Full serializer for material requests"""
    items = MaterialRequestItemSerializer(many=True, read_only=True)
    client_details = ClientSerializer(source='client', read_only=True)
    client_name = serializers.CharField(source='client.get_full_name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    rejected_by_name = serializers.CharField(source='rejected_by.get_full_name', read_only=True)
    fulfilled_by_name = serializers.CharField(source='fulfilled_by.get_full_name', read_only=True)
    delivery_location_name = serializers.CharField(source='delivery_location.name', read_only=True)
    service_invoice_number = serializers.CharField(source='service_invoice.invoice_number', read_only=True)
    inventory_invoice_number = serializers.CharField(source='inventory_invoice.invoice_number', read_only=True)
    
    # Computed fields
    total_items = serializers.SerializerMethodField()
    
    class Meta:
        model = MaterialRequest
        fields = [
            'id', 'request_number', 'request_date', 'client', 'client_details', 
            'client_name', 'requested_by', 'requested_by_name', 'service_invoice',
            'service_invoice_number', 'delivery_location', 'delivery_location_name',
            'purpose', 'notes', 'status', 'submitted_at', 'approved_by',
            'approved_by_name', 'approved_at', 'approval_notes', 'rejected_by',
            'rejected_by_name', 'rejected_at', 'rejection_reason', 'fulfilled_by',
            'fulfilled_by_name', 'fulfilled_at', 'inventory_invoice',
            'inventory_invoice_number', 'items', 'total_items',
            'created_at', 'updated_at', 'owner', 'branch'
        ]
        read_only_fields = [
            'id', 'request_number', 'submitted_at', 'approved_by', 'approved_at',
            'rejected_by', 'rejected_at', 'fulfilled_by', 'fulfilled_at',
            'inventory_invoice', 'created_at', 'updated_at'
        ]
    
    def get_total_items(self, obj):
        """Get total number of unique items in request"""
        return obj.items.count()


class MaterialRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating material requests"""
    items = MaterialRequestCreateItemSerializer(many=True)
    
    class Meta:
        model = MaterialRequest
        fields = [
            'client', 'service_invoice', 'delivery_location', 
            'purpose', 'notes', 'items'
        ]

    def validate(self, attrs):
        """
        Enforce invoice-based item eligibility.

        An inventory item may only be requested if the linked service_invoice
        contains EITHER:
          (a) An InvoiceItem with item_type='inventory' pointing to that exact item, OR
          (b) An InvoiceItem with item_type='service' whose ServiceItem has
              allows_material_requests=True and whose material_request_config
              'allowed_categories' list contains the item's category code.
        """
        service_invoice = attrs.get('service_invoice')
        items_data = attrs.get('items', [])

        if not service_invoice:
            raise serializers.ValidationError(
                {'service_invoice': 'A service invoice is required to create a material request.'}
            )

        if not items_data:
            return attrs

        # Build authorization sets from invoice items
        exact_item_ids: set = set()       # InventoryItem PKs directly on invoice
        authorized_cat_codes: set = set() # Category codes from service items
        authorized_item_types: set = set() # item_type labels from service items

        for inv_item in service_invoice.items.select_related(
            'service_item', 'inventory_item__category'
        ).all():
            if inv_item.item_type == 'inventory' and inv_item.inventory_item_id:
                exact_item_ids.add(inv_item.inventory_item_id)
            elif inv_item.item_type == 'service' and inv_item.service_item_id:
                svc = inv_item.service_item
                if svc.allows_material_requests:
                    config = svc.material_request_config or {}
                    authorized_cat_codes.update(config.get('allowed_categories', []))
                    # Also support item_type-based matching
                    authorized_item_types.update(
                        t.strip().lower() for t in config.get('allowed_item_types', [])
                    )

        errors = []
        for item_data in items_data:
            inv_item_obj = item_data.get('item')
            if inv_item_obj is None:
                continue

            if inv_item_obj.id in exact_item_ids:
                continue  # authorized — exact match

            cat_code = inv_item_obj.category.code if inv_item_obj.category else None
            if cat_code and cat_code in authorized_cat_codes:
                continue  # authorized — category code match

            cat_item_type = (
                (inv_item_obj.category.item_type or '').strip().lower()
                if inv_item_obj.category else ''
            )
            if cat_item_type and cat_item_type in authorized_item_types:
                continue  # authorized — item_type match

            # Not authorized
            type_label = (
                f"category '{inv_item_obj.category.name}'"
                f" (code: {cat_code}, type: {inv_item_obj.category.item_type or 'unset'})"
                if inv_item_obj.category else "no category"
            )
            errors.append(
                f"'{inv_item_obj.name}' is not authorized by invoice "
                f"{service_invoice.invoice_number}. "
                f"The invoice does not include this item directly or a service "
                f"covering {type_label}."
            )

        if errors:
            raise serializers.ValidationError({'items': errors})

        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        
        # Get current user from context
        user = self.context['request'].user
        
        # Generate request number scoped to tenant (unique across all branches)
        from django.db.models import Max
        tenant = getattr(user, 'tenant', None)
        base_qs = MaterialRequest.objects.filter(tenant=tenant) if tenant else MaterialRequest.objects.all()
        last_request = base_qs.aggregate(Max('id'))
        next_id = (last_request['id__max'] or 0) + 1
        request_number = f"MR-{next_id:06d}"
        
        # Create material request
        material_request = MaterialRequest.objects.create(
            request_number=request_number,
            requested_by=user,
            owner=user,
            branch=getattr(user, 'branch', None),
            tenant=getattr(user, 'tenant', None),
            **validated_data
        )
        
        # Create items
        for item_data in items_data:
            MaterialRequestItem.objects.create(
                material_request=material_request,
                **item_data
            )
        
        return material_request


class MaterialRequestUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating material requests"""
    items = MaterialRequestCreateItemSerializer(many=True, required=False)
    
    class Meta:
        model = MaterialRequest
        fields = [
            'client', 'service_invoice', 'delivery_location', 
            'purpose', 'notes', 'items'
        ]
    
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Only allow updates if status is draft
        if instance.status != 'draft':
            raise serializers.ValidationError(
                "Only draft material requests can be updated"
            )
        
        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update items if provided
        if items_data is not None:
            # Delete existing items
            instance.items.all().delete()
            
            # Create new items
            for item_data in items_data:
                MaterialRequestItem.objects.create(
                    material_request=instance,
                    **item_data
                )
        
        return instance


class MaterialRequestActionSerializer(serializers.Serializer):
    """Serializer for approval/rejection actions"""
    notes = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)


class MaterialRequestSummarySerializer(serializers.Serializer):
    """Summary statistics for material requests"""
    total_requests = serializers.IntegerField()
    draft = serializers.IntegerField()
    submitted = serializers.IntegerField()
    approved = serializers.IntegerField()
    rejected = serializers.IntegerField()
    fulfilled = serializers.IntegerField()
    pending_approval = serializers.IntegerField()
