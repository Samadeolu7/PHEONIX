# inventory/serializers.py - COMPLETE VERSION
"""
Comprehensive serializers for inventory allocation and redemption system
"""
from rest_framework import serializers
from django.apps import apps
from decimal import Decimal
from common.serializers import TenantModelSerializer
from .models import (
    InventoryItem, InventoryCategory, Location, InventoryStock, StockMovement,
    InventoryAllocation, AllocationItem, AllocationRedemption, RedemptionItem,
    AssetUsageLog, InventoryCostLayer, CostLayerConsumption,
    PhysicalCount, PhysicalCountLine
)


class InventoryCategorySerializer(TenantModelSerializer):
    inventory_account_name = serializers.CharField(source='inventory_account.name', read_only=True)
    cogs_account_name = serializers.CharField(source='cogs_account.name', read_only=True)
    sales_account_name = serializers.CharField(source='sales_account.name', read_only=True, allow_null=True, default=None)
    
    class Meta:
        model = InventoryCategory
        fields = [
            'id', 'name', 'code', 'description',
            'item_type',
            'inventory_account', 'inventory_account_name',
            'cogs_account', 'cogs_account_name',
            'sales_account', 'sales_account_name',
            'owner', 'branch', 'created_at', 'updated_at'
        ]


class InventoryItemSerializer(TenantModelSerializer):
    """
    Serializer for InventoryItem (Master Product Data).
    
    Includes computed stock properties from all locations:
    - total_stock: Sum of quantity_on_hand
    - total_available: Sum of quantity_available
    - total_reserved: Sum of quantity_reserved
    - total_value: Sum of total_value
    - needs_reorder: Boolean indicator
    
    For location-specific stock, use nested endpoint:
    GET /inventory/items/{id}/stock/
    """
    category_name = serializers.CharField(source='category.name', read_only=True)
    # Expose the category code and item_type so callers can do type-based matching
    # (e.g. for material-request authorization) without a separate category lookup.
    category_code = serializers.CharField(source='category.code', read_only=True)
    category_item_type = serializers.CharField(source='category.item_type', read_only=True)
    
    # Use computed properties from model instead of querying again
    total_stock = serializers.DecimalField(
        read_only=True,
        max_digits=18,
        decimal_places=2,
        help_text="Total quantity on hand across all locations"
    )
    total_available = serializers.DecimalField(
        read_only=True,
        max_digits=18,
        decimal_places=2,
        help_text="Total quantity available (on_hand - reserved)"
    )
    total_reserved = serializers.DecimalField(
        read_only=True,
        max_digits=18,
        decimal_places=2,
        help_text="Total quantity reserved across all locations"
    )
    total_value = serializers.DecimalField(
        read_only=True,
        max_digits=18,
        decimal_places=2,
        help_text="Total inventory value across all locations"
    )
    needs_reorder = serializers.BooleanField(
        read_only=True,
        help_text="True if total_stock <= reorder_level"
    )
    
    class Meta:
        model = InventoryItem
        fields = [
            'id', 'sku', 'name', 'barcode', 'description',
            'category', 'category_name', 'category_code', 'category_item_type',
            'unit_of_measure', 'cost_price', 'selling_price', 'minimum_selling_price',
            'valuation_method', 'reorder_level', 'reorder_quantity',
            'is_active', 'is_sellable', 'is_purchasable',
            'track_serial_numbers', 'track_batch_numbers', 'track_expiry',
            'total_stock', 'total_available', 'total_reserved', 'total_value', 'needs_reorder',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['total_stock', 'total_available', 'total_reserved', 'total_value', 'needs_reorder']


class LocationSerializer(TenantModelSerializer):
    class Meta:
        model = Location
        fields = [
            'id', 'name', 'code', 'location_type', 'address', 'is_active',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
    
    def validate_code(self, value):
        """Ensure code is either None or non-empty string"""
        if value == '':
            return None
        return value
    
    def validate(self, attrs):
        """Check for code uniqueness per branch"""
        code = attrs.get('code')
        branch = attrs.get('branch') or self.context.get('request').user.branch
        
        # If code is provided and not empty, check uniqueness
        if code and code.strip():
            # Get existing locations with same code in same branch
            queryset = Location.objects.filter(branch=branch, code=code)
            
            # Exclude current instance if updating
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            
            if queryset.exists():
                raise serializers.ValidationError({
                    'code': f"Location with code '{code}' already exists in this branch."
                })
        
        return attrs


class InventoryStockSerializer(TenantModelSerializer):
    """
    Serializer for InventoryStock (Location-Specific Quantities).
    
    Represents stock levels for one item at one location.
    
    Fields:
    - quantity_on_hand: Physical units in location
    - quantity_reserved: Reserved for orders (not available)
    - quantity_available: On hand - reserved (auto-calculated)
    - average_cost: Weighted average cost per unit
    - total_value: quantity_on_hand * average_cost (auto-calculated)
    
    Access via nested endpoint (preferred):
    GET /inventory/items/{item_id}/stock/
    
    Or flat endpoint:
    GET /inventory/stock/?item={item_id}
    """
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True, required=False)
    
    class Meta:
        model = InventoryStock
        fields = [
            'id', 'item', 'item_name', 'item_sku',
            'location', 'location_name', 'location_code',
            'quantity_on_hand', 'quantity_reserved', 'quantity_available',
            'average_cost', 'total_value',
            'owner', 'branch', 'created_at', 'updated_at'
        ]


class StockMovementSerializer(TenantModelSerializer):
    """
    Serializer for StockMovement (Audit Trail).
    
    Records every change to inventory quantities.
    Created automatically by InventoryService - never create manually.
    
    Movement Types:
    - RECEIVE: Stock received from supplier
    - SALE: Stock sold to customer
    - TRANSFER_OUT: Moved out to another location
    - TRANSFER_IN: Received from another location
    - ADJUSTMENT: Manual correction (cycle count, damage)
    - ALLOCATION: Reserved for allocation
    - REDEMPTION: Consumed from allocation
    
    Access via nested endpoint (preferred):
    GET /inventory/items/{item_id}/movements/
    
    Or flat endpoint:
    GET /inventory/movements/?item={item_id}
    """
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    from_location_name = serializers.CharField(source='from_location.name', read_only=True, required=False)
    to_location_name = serializers.CharField(source='to_location.name', read_only=True, required=False)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, required=False)
    
    class Meta:
        model = StockMovement
        fields = [
            'id', 'item', 'item_name', 'item_sku',
            'from_location', 'from_location_name',
            'to_location', 'to_location_name',
            'movement_type', 'movement_date', 'quantity', 'unit_cost',
            'reference_number', 'notes',
            'batch_number', 'serial_number', 'expiry_date',
            'created_by_name',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by_name']


# ================================================================
# ALLOCATION & REDEMPTION SERIALIZERS
# ================================================================

class AllocationItemSerializer(serializers.ModelSerializer):
    """Serializer for allocation items"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_unit = serializers.CharField(source='item.unit_of_measure', read_only=True)
    remaining_quantity = serializers.SerializerMethodField()
    
    class Meta:
        model = AllocationItem
        fields = [
            'id', 'allocation', 'item', 'item_name', 'item_sku', 'item_unit',
            'allocated_quantity', 'redeemed_quantity', 'remaining_quantity',
            'max_per_redemption', 'is_one_time_only', 'has_been_redeemed',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['redeemed_quantity', 'has_been_redeemed']
    
    def get_remaining_quantity(self, obj):
        """Get remaining quantity from model property"""
        return obj.remaining_quantity


class InventoryAllocationSerializer(TenantModelSerializer):
    """Main allocation serializer with nested items"""
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_code = serializers.CharField(source='client.client_id', read_only=True)
    items = AllocationItemSerializer(many=True, read_only=True)
    remaining_amount = serializers.SerializerMethodField()
    is_valid_now = serializers.SerializerMethodField()
    
    class Meta:
        model = InventoryAllocation
        fields = [
            'id', 'allocation_number', 'client', 'client_name', 'client_code',
            'invoice', 'allocation_date', 'allocation_type', 
            'allocated_amount', 'consumed_amount', 'remaining_amount',
            'valid_from', 'valid_until', 'status', 'is_valid_now',
            'linked_asset', 'usage_rules', 'notes', 'items',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['allocation_number', 'consumed_amount', 'remaining_amount', 'status']
    
    def get_remaining_amount(self, obj):
        """Get remaining amount from model property"""
        return obj.remaining_amount
    
    def get_is_valid_now(self, obj):
        """Check if allocation is currently valid"""
        return obj.is_valid


class AllocationSummarySerializer(serializers.ModelSerializer):
    """Light-weight serializer for allocation lists"""
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_id_display = serializers.CharField(source='client.client_id', read_only=True)
    type_display = serializers.CharField(source='get_allocation_type_display', read_only=True)
    remaining_amount = serializers.SerializerMethodField()
    
    class Meta:
        model = InventoryAllocation
        fields = [
            'id', 'allocation_number', 'client_name', 'client_id_display',
            'allocation_type', 'type_display',
            'allocated_amount', 'consumed_amount', 'remaining_amount',
            'status', 'valid_from', 'valid_until',
            'created_at'
        ]
    
    def get_remaining_amount(self, obj):
        """Get remaining amount from model property"""
        return obj.remaining_amount


class RedemptionItemSerializer(serializers.ModelSerializer):
    """Serializer for redemption items"""
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    
    class Meta:
        model = RedemptionItem
        fields = [
            'id', 'redemption', 'item',
            'item_name', 'item_sku',
            'quantity', 'unit_cost', 'total_cost',
            'created_at'
        ]


class AllocationRedemptionSerializer(TenantModelSerializer):
    """Redemption serializer with nested items"""
    allocation_number = serializers.CharField(source='allocation.allocation_number', read_only=True)
    client_name = serializers.CharField(source='allocation.client.name', read_only=True)
    authorized_by_name = serializers.CharField(source='authorized_by.username', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    items = RedemptionItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = AllocationRedemption
        fields = [
            'id', 'redemption_number', 'allocation', 'allocation_number',
            'client_name', 'redemption_date', 'redemption_time', 'amount_redeemed',
            'location', 'location_name', 'authorized_by', 'authorized_by_name',
            'status', 'asset', 'meter_reading',
            'is_posted', 'posted_at', 'transaction_entry',
            'items', 'notes',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = ['redemption_number', 'redemption_time', 'is_posted', 'posted_at']


class RedemptionCreateSerializer(serializers.Serializer):
    """Serializer for creating redemption with items"""
    allocation_id = serializers.IntegerField(required=True)
    items = serializers.ListField(
        child=serializers.DictField(),
        required=True,
        help_text="List of {allocation_item_id: int, quantity: decimal}"
    )
    meter_reading = serializers.DecimalField(max_digits=18, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(
        choices=['cash', 'card', 'allocation'],
        default='allocation'
    )
    payment_reference = serializers.CharField(required=False, allow_blank=True)


class AssetUsageLogSerializer(TenantModelSerializer):
    """Serializer for asset usage logs"""
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    
    class Meta:
        model = AssetUsageLog
        fields = [
            'id', 'asset', 'asset_name',
            'log_date', 'meter_reading_start', 'meter_reading_end', 
            'distance_traveled', 'resource_consumed', 'resource_unit',
            'consumption_rate', 'redemption', 'notes',
            'owner', 'branch', 'created_at', 'updated_at'
        ]


# ================================================================
# INVENTORY VALUATION & COST LAYERS
# ================================================================

class InventoryCostLayerSerializer(TenantModelSerializer):
    """Serializer for inventory cost layers"""
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    
    class Meta:
        model = InventoryCostLayer
        fields = [
            'id', 'item', 'item_sku', 'item_name',
            'location', 'location_name',
            'transaction_type', 'transaction_reference', 'transaction_date',
            'original_quantity', 'quantity_remaining',
            'unit_cost', 'total_cost', 'remaining_value',
            'is_depleted', 'depleted_date',
            'notes', 'metadata',
            'owner', 'branch', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'total_cost', 'remaining_value', 'is_depleted', 'depleted_date'
        ]


class CostLayerConsumptionSerializer(TenantModelSerializer):
    """Serializer for cost layer consumption records"""
    item_sku = serializers.CharField(source='cost_layer.item.sku', read_only=True)
    item_name = serializers.CharField(source='cost_layer.item.name', read_only=True)
    movement_reference = serializers.CharField(source='movement.reference_number', read_only=True)
    layer_transaction_ref = serializers.CharField(source='cost_layer.transaction_reference', read_only=True)
    
    class Meta:
        model = CostLayerConsumption
        fields = [
            'id', 'movement', 'movement_reference',
            'cost_layer', 'layer_transaction_ref',
            'item_sku', 'item_name',
            'quantity_consumed', 'unit_cost', 'total_cost',
            'consumption_date',
            'owner', 'branch', 'created_at'
        ]
        read_only_fields = ['total_cost', 'consumption_date']


class ItemValuationSerializer(serializers.Serializer):
    """Serializer for item valuation details"""
    item_id = serializers.IntegerField()
    sku = serializers.CharField()
    name = serializers.CharField()
    valuation_method = serializers.CharField()
    quantity_on_hand = serializers.DecimalField(max_digits=18, decimal_places=2)
    average_cost = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_value = serializers.DecimalField(max_digits=18, decimal_places=2)
    category = serializers.CharField()
    locations = serializers.IntegerField()


class RecalculateValuationSerializer(serializers.Serializer):
    """Serializer for recalculation request"""
    force = serializers.BooleanField(default=False, required=False)


class ValuationReportSerializer(serializers.Serializer):
    """Serializer for valuation report filters"""
    branch_id = serializers.IntegerField(required=False)
    category_id = serializers.IntegerField(required=False)
    valuation_method = serializers.ChoiceField(
        choices=['fifo', 'lifo', 'average'],
        required=False
    )


# ================================================================
# PHYSICAL COUNT / INVENTORY VARIANCE SERIALIZERS
# ================================================================

class PhysicalCountLineSerializer(TenantModelSerializer):
    """
    Serializer for individual physical count lines
    Includes auto-calculated variance fields
    """
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit_of_measure', read_only=True)
    
    # Variance fields (read-only, auto-calculated on save)
    variance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    variance_percent = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    variance_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    
    # Classification
    variance_reason_display = serializers.CharField(
        source='get_variance_reason_display',
        read_only=True
    )
    
    class Meta:
        model = PhysicalCountLine
        fields = [
            'id', 'physical_count', 'item', 'item_sku', 'item_name', 'item_unit',
            'system_quantity', 'counted_quantity',
            'variance', 'variance_percent', 'variance_value',
            'unit_cost', 'variance_reason', 'variance_reason_display',
            'notes', 'adjustment_posted', 'stock_movement',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'variance', 'variance_percent', 'variance_value',
            'adjustment_posted', 'stock_movement'
        ]


class PhysicalCountSerializer(TenantModelSerializer):
    """
    Serializer for physical count sessions
    Includes nested count lines and summary data
    """
    location_name = serializers.CharField(source='location.name', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    counted_by_name = serializers.CharField(
        source='counted_by.get_full_name',
        read_only=True
    )
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.get_full_name',
        read_only=True,
        allow_null=True
    )
    
    # Status display
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    
    # Nested count lines (optional, for detail view)
    count_lines = PhysicalCountLineSerializer(many=True, read_only=True)
    
    # Summary fields (read-only, calculated)
    total_lines = serializers.IntegerField(read_only=True)
    total_variance_value = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = PhysicalCount
        fields = [
            'id', 'count_number', 'count_date', 'location', 'location_name', 'location_code',
            'status', 'status_display',
            'counted_by', 'counted_by_name',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'total_lines', 'total_variance_value',
            'notes', 'review_notes',
            'count_lines',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'count_number', 'total_lines', 'total_variance_value',
            'reviewed_at'
        ]


class PhysicalCountListSerializer(TenantModelSerializer):
    """
    Lightweight serializer for listing physical counts
    Excludes nested count lines for performance
    """
    location_name = serializers.CharField(source='location.name', read_only=True)
    counted_by_name = serializers.CharField(
        source='counted_by.get_full_name',
        read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    
    class Meta:
        model = PhysicalCount
        fields = [
            'id', 'count_number', 'count_date', 'location', 'location_name',
            'status', 'status_display',
            'counted_by', 'counted_by_name',
            'total_lines', 'total_variance_value',
            'created_at'
        ]


class PhysicalCountLineCreateSerializer(serializers.Serializer):
    """
    Serializer for creating multiple count lines at once
    """
    item_id = serializers.IntegerField()
    counted_quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True)
    variance_reason = serializers.ChoiceField(
        choices=[
            ('shrinkage', 'Shrinkage/Loss'),
            ('damage', 'Damage'),
            ('obsolete', 'Obsolete'),
            ('theft', 'Theft'),
            ('counting_error', 'Counting Error'),
            ('system_error', 'System Error'),
            ('surplus', 'Surplus/Found'),
            ('other', 'Other'),
        ],
        required=False,
        allow_blank=True
    )


class VarianceReportSerializer(serializers.Serializer):
    """
    Serializer for variance report filters and response
    """
    # Filters
    location_id = serializers.IntegerField(required=False)
    category_id = serializers.IntegerField(required=False)
    variance_threshold = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        help_text="Only show variances above this percentage"
    )
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    variance_reason = serializers.ChoiceField(
        choices=[
            ('shrinkage', 'Shrinkage/Loss'),
            ('damage', 'Damage'),
            ('obsolete', 'Obsolete'),
            ('theft', 'Theft'),
            ('counting_error', 'Counting Error'),
            ('system_error', 'System Error'),
            ('surplus', 'Surplus/Found'),
            ('other', 'Other'),
        ],
        required=False
    )


class VarianceReportResponseSerializer(serializers.Serializer):
    """Response structure for variance report"""
    summary = serializers.DictField()
    by_location = serializers.ListField()
    by_category = serializers.ListField()
    by_reason = serializers.ListField()
    lines = PhysicalCountLineSerializer(many=True)

