# assets/serializers.py
from rest_framework import serializers
from .models import (
    AssetCategory, FixedAsset, AssetDepreciation, AssetMaintenance,
    AssetAcquisition, AssetAcquisitionLine,
    AssetRequisition, AssetRequisitionLine,
    AssetTransfer, AssetAssignment,
)
from common.image_processing import compress_image


class AssetCategorySerializer(serializers.ModelSerializer):
    asset_account_name = serializers.CharField(source='asset_account.name', read_only=True)
    depreciation_account_name = serializers.CharField(source='depreciation_account.name', read_only=True)
    accumulated_depreciation_account_name = serializers.CharField(source='accumulated_depreciation_account.name', read_only=True)
    maintenance_expense_account_name = serializers.CharField(source='maintenance_expense_account.name', read_only=True, allow_null=True)
    asset_count = serializers.SerializerMethodField()
    
    class Meta:
        model = AssetCategory
        fields = [
            'id', 'name', 'code', 'description',
            'asset_account', 'asset_account_name',
            'depreciation_account', 'depreciation_account_name',
            'accumulated_depreciation_account', 'accumulated_depreciation_account_name',
            'maintenance_expense_account', 'maintenance_expense_account_name',
            'default_depreciation_method', 'default_useful_life_years',
            'default_salvage_value_percentage',
            'asset_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'asset_count']
    
    def get_asset_count(self, obj):
        return obj.assets.filter(is_deleted=False).count()


class FixedAssetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    book_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    depreciable_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    current_meter_reading = serializers.SerializerMethodField()
    consumption_count_30d = serializers.SerializerMethodField()
    has_anomalies = serializers.SerializerMethodField()
    assigned_to_staff_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    # Supplier / procurement linkage
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    purchase_order_number = serializers.CharField(
        source='purchase_order.po_number', read_only=True, allow_null=True
    )
    accounts_payable_reference = serializers.CharField(
        source='accounts_payable.reference_number', read_only=True, allow_null=True
    )

    # Per-asset GL sub-ledger — null until this asset's category has been
    # migrated to per-asset tracking (see migrate_category_to_per_asset_accounts).
    account_code = serializers.CharField(source='account.code', read_only=True, allow_null=True)
    account_name = serializers.CharField(source='account.name', read_only=True, allow_null=True)
    accumulated_depreciation_account_code = serializers.CharField(
        source='accumulated_depreciation_account.code', read_only=True, allow_null=True
    )
    accumulated_depreciation_account_name = serializers.CharField(
        source='accumulated_depreciation_account.name', read_only=True, allow_null=True
    )

    class Meta:
        model = FixedAsset
        fields = [
            'id', 'asset_number', 'category', 'category_name',
            'name', 'description',
            'registered_at',
            'serial_number', 'registration_number', 'make', 'model', 'year',
            # Financial — set to 0 / null at registration; filled on acquisition
            'purchase_date', 'purchase_price', 'salvage_value', 'current_value',
            # Depreciation — configured at registration; start_date set at acquisition
            'depreciation_method', 'useful_life_years', 'depreciation_start_date',
            'accumulated_depreciation', 'book_value', 'depreciable_amount',
            # Depreciation batch grouping
            'depreciation_batch_id',
            # Per-asset GL sub-ledger
            'account', 'account_code', 'account_name',
            'accumulated_depreciation_account', 'accumulated_depreciation_account_code',
            'accumulated_depreciation_account_name',
            # Location / assignment
            'current_location', 'assigned_to',
            'assigned_to_staff', 'assigned_to_staff_name',
            # Status
            'status', 'status_display',
            'disposal_date', 'disposal_amount', 'disposal_notes',
            'disposal_journal_entry',
            # Supplier / procurement linkage
            'supplier', 'supplier_name',
            'purchase_order', 'purchase_order_number',
            'accounts_payable', 'accounts_payable_reference',
            'metadata', 'photo',
            'current_meter_reading', 'consumption_count_30d', 'has_anomalies',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'current_value', 'book_value', 'depreciable_amount',
            'current_meter_reading', 'consumption_count_30d', 'has_anomalies',
            'assigned_to_staff_name', 'disposal_journal_entry',
            'status_display',
            # Set automatically when an acquisition/requisition is posted
            'purchase_order', 'purchase_order_number',
            'accounts_payable', 'accounts_payable_reference',
            'depreciation_batch_id',
            # Auto-provisioned — see assets.signals / migrate_category_to_per_asset_accounts
            'account', 'account_code', 'account_name',
            'accumulated_depreciation_account', 'accumulated_depreciation_account_code',
            'accumulated_depreciation_account_name',
        ]
    
    def validate_photo(self, value):
        if value:
            if value.content_type.startswith('image/'):
                value = compress_image(value, max_dimension=1600, quality=82)
        return value

    def get_current_meter_reading(self, obj):
        reading = obj.current_meter_reading
        return reading if reading is not None else None

    def get_consumption_count_30d(self, obj):
        return obj.consumption_count(days=30)

    def get_has_anomalies(self, obj):
        return obj.has_irregular_consumptions(days=30)

    def get_assigned_to_staff_name(self, obj):
        """Return the full name of the linked staff; fall back to the legacy CharField."""
        if obj.assigned_to_staff_id:
            s = obj.assigned_to_staff
            return f'{s.first_name} {s.last_name}'
        return obj.assigned_to or None


class AssetDepreciationSerializer(serializers.ModelSerializer):
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    posted_by_name = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = AssetDepreciation
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'period_start', 'period_end', 'depreciation_amount',
            'is_posted', 'posted_at', 'posted_by', 'posted_by_name', 'journal_entry',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'posted_at', 'posted_by', 'posted_by_name', 'journal_entry']

    def get_posted_by_name(self, obj):
        if obj.posted_by_id:
            u = obj.posted_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None


class AssetMaintenanceSerializer(serializers.ModelSerializer):
    asset_number = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    performed_by_staff_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssetMaintenance
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'maintenance_date', 'maintenance_type',
            'description', 'cost',
            'payment_method',
            'performed_by', 'performed_by_staff', 'performed_by_staff_name',
            'vendor',
            'next_maintenance_date', 'meter_reading',
            'notes', 'is_posted', 'posted_at', 'posted_by', 'journal_entry',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'is_posted', 'posted_at', 'posted_by', 'journal_entry',
            'performed_by_staff_name',
        ]

    def get_performed_by_staff_name(self, obj):
        """Return the full name of the linked staff; fall back to the legacy CharField."""
        if obj.performed_by_staff_id:
            s = obj.performed_by_staff
            return f'{s.first_name} {s.last_name}'
        return obj.performed_by or None

    def validate(self, data):
        """Auto-populate performed_by string from the FK when provided."""
        if 'performed_by_staff' in data and data['performed_by_staff']:
            s = data['performed_by_staff']
            data['performed_by'] = f'{s.first_name} {s.last_name}'
        return data


# ─── Asset Acquisition (multi-line bulk purchase) ────────────────────────────

class AssetAcquisitionLineSerializer(serializers.ModelSerializer):
    """Serializer for individual line items within an acquisition."""

    asset_category_name = serializers.CharField(
        source='asset_category.name', read_only=True
    )
    registered_asset_name = serializers.CharField(
        source='registered_asset.name', read_only=True, allow_null=True
    )
    registered_asset_number = serializers.CharField(
        source='registered_asset.asset_number', read_only=True, allow_null=True
    )
    total_price = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    # Read-only summary of assets activated/created by this line (populated after posting)
    fixed_asset_ids = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssetAcquisitionLine
        fields = [
            'id', 'asset_category', 'asset_category_name',
            # Optional link to a registered asset shell
            'registered_asset', 'registered_asset_name', 'registered_asset_number',
            'name', 'description',
            'quantity', 'unit_price', 'total_price',
            'depreciation_method', 'useful_life_years', 'salvage_value_percentage',
            'fixed_asset_ids',
        ]
        read_only_fields = [
            'total_price', 'asset_category_name',
            'registered_asset_name', 'registered_asset_number',
            'fixed_asset_ids',
        ]

    def get_fixed_asset_ids(self, obj):
        return list(obj.fixed_assets.filter(is_deleted=False).values_list('id', flat=True))


class AssetAcquisitionSerializer(serializers.ModelSerializer):
    """
    Full serializer for AssetAcquisition.

    * On CREATE: accepts nested `lines` and creates draft header + line records.
    * On READ:   returns supplier name, totals, line details, and linked PO/AP.
    """

    lines = AssetAcquisitionLineSerializer(many=True)

    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    purchase_order_number = serializers.CharField(
        source='purchase_order.po_number', read_only=True, allow_null=True
    )
    accounts_payable_reference = serializers.CharField(
        source='accounts_payable.reference_number', read_only=True, allow_null=True
    )
    posted_by_name = serializers.SerializerMethodField(read_only=True)
    submitted_by_name = serializers.SerializerMethodField(read_only=True)
    approved_by_acquisition_name = serializers.SerializerMethodField(read_only=True)
    asset_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssetAcquisition
        fields = [
            'id', 'reference_number',
            'supplier', 'supplier_name',
            'purchase_date', 'payment_terms', 'notes',
            'total_amount', 'status',
            # submission
            'submitted_by', 'submitted_by_name', 'submitted_at',
            # approval
            'approved_by_acquisition', 'approved_by_acquisition_name', 'approved_at_acquisition',
            'rejection_reason',
            # posting
            'purchase_order', 'purchase_order_number',
            'accounts_payable', 'accounts_payable_reference',
            'journal_entry',
            'posted_by', 'posted_by_name', 'posted_at',
            'lines',
            'asset_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'reference_number', 'total_amount', 'status',
            'submitted_by', 'submitted_by_name', 'submitted_at',
            'approved_by_acquisition', 'approved_by_acquisition_name', 'approved_at_acquisition',
            'rejection_reason',
            'purchase_order', 'purchase_order_number',
            'accounts_payable', 'accounts_payable_reference',
            'journal_entry',
            'posted_by', 'posted_by_name', 'posted_at',
            'asset_count',
            'created_at', 'updated_at',
        ]

    def get_posted_by_name(self, obj):
        if obj.posted_by_id:
            u = obj.posted_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def get_submitted_by_name(self, obj):
        if obj.submitted_by_id:
            u = obj.submitted_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def get_approved_by_acquisition_name(self, obj):
        if obj.approved_by_acquisition_id:
            u = obj.approved_by_acquisition
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def get_asset_count(self, obj):
        return sum(
            line.fixed_assets.filter(is_deleted=False).count()
            for line in obj.lines.all()
        )

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("At least one line item is required.")
        return lines

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        acquisition = AssetAcquisition.objects.create(**validated_data)
        for line_data in lines_data:
            AssetAcquisitionLine.objects.create(acquisition=acquisition, **line_data)
        acquisition.recalculate_total()
        return acquisition


# ─────────────────────────────────────────────────────────────────────────────
#  Asset Requisition serializers
# ─────────────────────────────────────────────────────────────────────────────

class AssetRequisitionLineSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(
        source='asset.name', read_only=True
    )
    asset_number = serializers.CharField(
        source='asset.asset_number', read_only=True
    )
    asset_category_name = serializers.CharField(
        source='asset_category.name', read_only=True
    )
    supplier_name = serializers.CharField(
        source='supplier.name', read_only=True, allow_null=True
    )
    line_total = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AssetRequisitionLine
        fields = [
            'id',
            'asset', 'asset_name', 'asset_number',
            'asset_category', 'asset_category_name',
            'supplier', 'supplier_name',
            'description', 'quantity', 'actual_unit_price',
            'line_total', 'notes',
            'is_activated',
        ]
        read_only_fields = [
            'asset_category', 'asset_category_name',
            'asset_name', 'asset_number',
            'supplier_name',
            'line_total',
            'is_activated',
        ]

    def get_line_total(self, obj):
        from decimal import Decimal
        return Decimal(str(obj.actual_unit_price)) * obj.quantity

    def validate_asset(self, asset):
        """Ensure the referenced asset is in 'draft' status (registered but not yet acquired)."""
        if asset.status not in ('draft',):
            raise serializers.ValidationError(
                f"Asset '{asset.name}' (#{asset.asset_number}) has status '{asset.status}'. "
                "Only draft (registered-but-not-acquired) assets can be requisitioned."
            )
        return asset


class AssetRequisitionSerializer(serializers.ModelSerializer):
    items = AssetRequisitionLineSerializer(many=True)

    requested_by_name = serializers.SerializerMethodField(read_only=True)
    approved_by_name = serializers.SerializerMethodField(read_only=True)
    acquisition_reference = serializers.CharField(
        source='acquisition.reference_number', read_only=True, allow_null=True
    )

    class Meta:
        model = AssetRequisition
        fields = [
            'id', 'ar_number',
            'requested_by', 'requested_by_name',
            'department', 'request_date', 'required_by_date',
            'purpose', 'notes',
            'status',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason',
            'estimated_total',
            'acquisition', 'acquisition_reference',
            'approval_chain',
            'items',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'ar_number', 'status',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason',
            'estimated_total',
            'acquisition', 'acquisition_reference',
            'approval_chain',
            'created_at', 'updated_at',
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by_id:
            u = obj.requested_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by_id:
            u = obj.approved_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("At least one line item is required.")
        return items

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        requisition = AssetRequisition.objects.create(**validated_data)
        for item_data in items_data:
            AssetRequisitionLine.objects.create(requisition=requisition, **item_data)
        requisition.recalculate_total()
        return requisition

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            # Replace all existing non-activated items; leave activated ones untouched
            instance.items.filter(is_activated=False).delete()
            for item_data in items_data:
                AssetRequisitionLine.objects.create(requisition=instance, **item_data)
            instance.recalculate_total()
        return instance


# ─────────────────────────────────────────────────────────────────────────────
#  Asset Transfer serializers
# ─────────────────────────────────────────────────────────────────────────────

class AssetTransferSerializer(serializers.ModelSerializer):
    """Serializes an AssetTransfer record (custody movement)."""

    asset_number    = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name      = serializers.CharField(source='asset.name',         read_only=True)
    from_staff_name = serializers.SerializerMethodField(read_only=True)
    to_staff_name   = serializers.SerializerMethodField(read_only=True)
    transferred_by_name  = serializers.SerializerMethodField(read_only=True)
    acknowledged_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = AssetTransfer
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'from_staff', 'from_staff_name', 'from_location',
            'to_staff',   'to_staff_name',   'to_location',
            'transfer_date', 'reason', 'notes',
            'transferred_by', 'transferred_by_name',
            'status',
            'acknowledged_by', 'acknowledged_by_name', 'acknowledged_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'status', 'acknowledged_by', 'acknowledged_by_name', 'acknowledged_at',
            'created_at', 'updated_at',
            'asset_number', 'asset_name',
            'from_staff_name', 'to_staff_name',
            'transferred_by_name', 'acknowledged_by_name',
        ]

    def get_from_staff_name(self, obj):
        if obj.from_staff_id:
            s = obj.from_staff
            return f'{s.first_name} {s.last_name}'.strip()
        return None

    def get_to_staff_name(self, obj):
        if obj.to_staff_id:
            s = obj.to_staff
            return f'{s.first_name} {s.last_name}'.strip()
        return None

    def get_transferred_by_name(self, obj):
        if obj.transferred_by_id:
            u = obj.transferred_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None

    def get_acknowledged_by_name(self, obj):
        if obj.acknowledged_by_id:
            u = obj.acknowledged_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  Asset Assignment serializers
# ─────────────────────────────────────────────────────────────────────────────

class AssetAssignmentSerializer(serializers.ModelSerializer):
    """Serializes an AssetAssignment history record."""

    asset_number   = serializers.CharField(source='asset.asset_number', read_only=True)
    asset_name     = serializers.CharField(source='asset.name',         read_only=True)
    staff_display  = serializers.SerializerMethodField(read_only=True)
    staff_id = serializers.CharField(source='staff.staff_id', read_only=True)
    assigned_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = AssetAssignment
        fields = [
            'id', 'asset', 'asset_number', 'asset_name',
            'staff', 'staff_id', 'staff_name', 'staff_display',
            'location',
            'assigned_date', 'unassigned_date',
            'assigned_by', 'assigned_by_name',
            'notes', 'is_current',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'is_current', 'created_at', 'updated_at',
            'asset_number', 'asset_name', 'staff_display', 'assigned_by_name',
        ]

    def get_staff_display(self, obj):
        """Prefer the live FK name; fall back to the snapshot CharField."""
        if obj.staff_id:
            s = obj.staff
            return f'{s.first_name} {s.last_name}'.strip()
        return obj.staff_name or None

    def get_assigned_by_name(self, obj):
        if obj.assigned_by_id:
            u = obj.assigned_by
            return f'{u.first_name} {u.last_name}'.strip() or u.username
        return None
