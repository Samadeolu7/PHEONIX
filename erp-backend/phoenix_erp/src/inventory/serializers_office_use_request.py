# inventory/serializers_office_use_request.py
"""
Serializers for the Office Use Request system.
"""
from rest_framework import serializers
from .models_office_use_request import OfficeUseRequest, OfficeUseRequestItem
from .models import InventoryItem
from .serializers import InventoryItemSerializer


class OfficeUseRequestItemSerializer(serializers.ModelSerializer):
    item_details = InventoryItemSerializer(source='item', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    unit_of_measure = serializers.CharField(source='item.unit_of_measure', read_only=True)
    # The GL expense account this line will post to on fulfilment — comes from
    # the item's own category (set up when the item/category was created).
    expense_account_name = serializers.CharField(
        source='item.category.cogs_account.name', read_only=True
    )
    expense_account_code = serializers.CharField(
        source='item.category.cogs_account.code', read_only=True
    )

    class Meta:
        model = OfficeUseRequestItem
        fields = [
            'id', 'item', 'item_details', 'item_name', 'item_sku',
            'unit_of_measure', 'quantity', 'notes',
            'expense_account_name', 'expense_account_code',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class OfficeUseRequestCreateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfficeUseRequestItem
        fields = ['item', 'quantity', 'notes']


class OfficeUseRequestSerializer(serializers.ModelSerializer):
    """Full read serializer."""
    items = OfficeUseRequestItemSerializer(many=True, read_only=True)
    requested_by_name = serializers.CharField(
        source='requested_by.get_full_name', read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name', read_only=True
    )
    rejected_by_name = serializers.CharField(
        source='rejected_by.get_full_name', read_only=True
    )
    fulfilled_by_name = serializers.CharField(
        source='fulfilled_by.get_full_name', read_only=True
    )
    delivery_location_name = serializers.CharField(
        source='delivery_location.name', read_only=True
    )
    expense_account_name = serializers.CharField(
        source='expense_account.name', read_only=True
    )
    expense_account_code = serializers.CharField(
        source='expense_account.code', read_only=True
    )
    journal_entry_reference = serializers.CharField(
        source='journal_entry.reference_number', read_only=True
    )
    cancelled_by_name = serializers.CharField(
        source='cancelled_by.get_full_name', read_only=True
    )
    total_items = serializers.SerializerMethodField()

    class Meta:
        model = OfficeUseRequest
        fields = [
            'id', 'request_number', 'request_date',
            'requested_by', 'requested_by_name',
            'department',
            'expense_account', 'expense_account_name', 'expense_account_code',
            'delivery_location', 'delivery_location_name',
            'purpose', 'notes', 'status',
            'submitted_at',
            'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'fulfilled_by', 'fulfilled_by_name', 'fulfilled_at',
            'cancelled_by', 'cancelled_by_name', 'cancelled_at', 'cancellation_reason',
            'journal_entry', 'journal_entry_reference',
            'items', 'total_items',
            'created_at', 'updated_at', 'owner', 'branch',
        ]
        read_only_fields = [
            'id', 'request_number', 'submitted_at',
            'approved_by', 'approved_at',
            'rejected_by', 'rejected_at',
            'fulfilled_by', 'fulfilled_at',
            'cancelled_by', 'cancelled_at',
            'journal_entry', 'created_at', 'updated_at',
        ]

    def get_total_items(self, obj):
        return obj.items.count()


class OfficeUseRequestCreateSerializer(serializers.ModelSerializer):
    items = OfficeUseRequestCreateItemSerializer(many=True)

    class Meta:
        model = OfficeUseRequest
        fields = [
            'department', 'delivery_location',
            'purpose', 'notes', 'items',
        ]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        user = self.context['request'].user

        from django.db.models import Max
        tenant = getattr(user, 'tenant', None)
        base_qs = (
            OfficeUseRequest.objects.filter(tenant=tenant)
            if tenant
            else OfficeUseRequest.objects.all()
        )
        last = base_qs.aggregate(Max('id'))
        next_id = (last['id__max'] or 0) + 1
        request_number = f"OUR-{next_id:06d}"

        office_use_request = OfficeUseRequest.objects.create(
            request_number=request_number,
            requested_by=user,
            owner=user,
            branch=getattr(user, 'branch', None),
            tenant=getattr(user, 'tenant', None),
            **validated_data,
        )

        for item_data in items_data:
            OfficeUseRequestItem.objects.create(
                office_use_request=office_use_request,
                **item_data,
            )

        return office_use_request


class OfficeUseRequestUpdateSerializer(serializers.ModelSerializer):
    items = OfficeUseRequestCreateItemSerializer(many=True, required=False)

    class Meta:
        model = OfficeUseRequest
        fields = [
            'department', 'delivery_location',
            'purpose', 'notes', 'items',
        ]

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        if instance.status != 'draft':
            raise serializers.ValidationError(
                {"detail": "Only draft requests can be updated."}
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                OfficeUseRequestItem.objects.create(
                    office_use_request=instance,
                    **item_data,
                )

        return instance


class OfficeUseRequestActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)


class OfficeUseRequestSummarySerializer(serializers.Serializer):
    total_requests = serializers.IntegerField()
    draft_count = serializers.IntegerField()
    pending_approval_count = serializers.IntegerField()
    approved_count = serializers.IntegerField()
    fulfilled_count = serializers.IntegerField()
    rejected_count = serializers.IntegerField()
    cancelled_count = serializers.IntegerField()
