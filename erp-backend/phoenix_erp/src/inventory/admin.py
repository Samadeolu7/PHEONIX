from django.contrib import admin
from inventory.models import (
    InventoryItem, InventoryStock, Location, StockMovement,
    StockAdjustmentRequest, StockTransferRequest, WriteOffRequest, SalesOrder,
    PhysicalCount, PhysicalCountLine,
)
from inventory.config_models import InventoryConfig


class InventoryStockInline(admin.TabularInline):
    """
    Shows all location-stock records for an item.
    - Add a row to assign the item to a new location (starts with 0 qty).
    - Quantities are read-only; use stock adjustments/transfers to change them.
    - average_cost can be edited here for initial cost setup.
    """
    model = InventoryStock
    extra = 1
    fields = ('location', 'quantity_on_hand', 'quantity_reserved', 'quantity_available', 'average_cost', 'total_value')
    readonly_fields = ('quantity_on_hand', 'quantity_reserved', 'quantity_available', 'total_value')
    raw_id_fields = ('location',)
    verbose_name = 'Stock at Location'
    verbose_name_plural = 'Stock by Location'


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ('sku', 'name', 'total_stock', 'reorder_level', 'is_active')
    search_fields = ('sku', 'name')
    list_filter = ('is_active',)
    readonly_fields = ('total_stock',)
    inlines = [InventoryStockInline]

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'location_type', 'branch', 'is_active')
    search_fields = ('name', 'code', 'address')
    list_filter = ('location_type', 'is_active', 'branch')
    raw_id_fields = ('owner', 'branch')
    fieldsets = (
        ('Location Details', {
            'fields': ('name', 'code', 'location_type', 'address', 'is_active')
        }),
        ('Ownership', {
            'fields': ('owner', 'branch'),
        }),
    )

@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('id', 'item', 'from_location', 'to_location', 'movement_type', 'quantity', 'movement_date', 'created_at')
    search_fields = ('item__name', 'item__sku', 'from_location__name', 'to_location__name')
    list_filter = ('movement_type', 'movement_date', 'created_at')
    raw_id_fields = ('item', 'from_location', 'to_location')

@admin.register(InventoryConfig)
class InventoryConfigAdmin(admin.ModelAdmin):
    list_display = ['owner', 'branch', 'require_adjustment_approval', 'require_transfer_approval', 'valuation_method']
    list_filter = ['require_adjustment_approval', 'require_transfer_approval', 'require_sales_order_approval', 'valuation_method']
    search_fields = ['owner__username', 'branch__name']
    fieldsets = (
        ('General', {
            'fields': ('owner', 'branch', 'valuation_method')
        }),
        ('Adjustment Settings', {
            'fields': ('require_adjustment_approval', 'adjustment_approval_threshold', 'default_adjustment_workflow', 'adjustment_prefix')
        }),
        ('Transfer Settings', {
            'fields': ('require_transfer_approval', 'transfer_approval_threshold', 'default_transfer_workflow', 'transfer_prefix')
        }),
        ('Sales Order Settings', {
            'fields': ('require_sales_order_approval', 'sales_order_approval_threshold', 'default_sales_order_workflow', 'so_prefix')
        }),
        ('Other Settings', {
            'fields': ('require_delivery_approval', 'require_writeoff_approval', 'default_delivery_workflow', 'dn_prefix', 'enable_low_stock_alerts')
        }),
    )


@admin.register(StockAdjustmentRequest)
class StockAdjustmentRequestAdmin(admin.ModelAdmin):
    list_display = ['request_number', 'item', 'location', 'adjustment_type', 'quantity', 'estimated_cost', 'status', 'requested_by', 'created_at']
    list_filter = ['status', 'adjustment_type', 'created_at', 'approved_at']
    search_fields = ['request_number', 'item__name', 'item__sku', 'requested_by__username', 'reason']
    readonly_fields = ['request_number', 'estimated_cost', 'created_at', 'updated_at']
    fieldsets = (
        ('Request Information', {
            'fields': ('request_number', 'requested_by', 'status')
        }),
        ('Adjustment Details', {
            'fields': ('item', 'location', 'adjustment_type', 'quantity', 'unit_cost', 'estimated_cost', 'reason', 'notes')
        }),
        ('Approval Information', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Execution', {
            'fields': ('stock_movement',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(StockTransferRequest)
class StockTransferRequestAdmin(admin.ModelAdmin):
    list_display = ['request_number', 'item', 'from_location', 'to_location', 'quantity', 'estimated_cost', 'status', 'requested_by', 'created_at']
    list_filter = ['status', 'created_at', 'approved_at']
    search_fields = ['request_number', 'item__name', 'item__sku', 'requested_by__username', 'reference_number', 'reason']
    readonly_fields = ['request_number', 'estimated_cost', 'created_at', 'updated_at']
    fieldsets = (
        ('Request Information', {
            'fields': ('request_number', 'requested_by', 'status', 'reference_number')
        }),
        ('Transfer Details', {
            'fields': ('item', 'from_location', 'to_location', 'quantity', 'unit_cost', 'estimated_cost', 'reason', 'notes')
        }),
        ('Approval Information', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Execution', {
            'fields': ('transfer_out_movement', 'transfer_in_movement')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WriteOffRequest)
class WriteOffRequestAdmin(admin.ModelAdmin):
    list_display = ['request_number', 'item', 'location', 'quantity', 'estimated_cost', 'status', 'requested_by', 'created_at']
    list_filter = ['status', 'created_at', 'approved_at']
    search_fields = ['request_number', 'item__name', 'item__sku', 'requested_by__username', 'reason']
    readonly_fields = ['request_number', 'estimated_cost', 'created_at', 'updated_at']
    fieldsets = (
        ('Request Information', {
            'fields': ('request_number', 'requested_by', 'status')
        }),
        ('Write-off Details', {
            'fields': ('item', 'location', 'quantity', 'unit_cost', 'estimated_cost', 'reason', 'notes')
        }),
        ('Approval Information', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Execution', {
            'fields': ('stock_movement',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(SalesOrder)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ['so_number', 'client', 'order_date', 'total_amount', 'status', 'approved_by', 'created_at']
    list_filter = ['status', 'order_date', 'approved_at']
    search_fields = ['so_number', 'client__name', 'notes']
    readonly_fields = ['so_number', 'approved_by', 'approved_at', 'created_at', 'updated_at']
    fieldsets = (
        ('Order Information', {
            'fields': ('so_number', 'client', 'order_date', 'expected_delivery_date', 'status')
        }),
        ('Amounts', {
            'fields': ('subtotal', 'discount', 'tax_amount', 'total_amount')
        }),
        ('Approval Information', {
            'fields': ('approved_by', 'approved_at', 'approval_notes')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class PhysicalCountLineInline(admin.TabularInline):
    model = PhysicalCountLine
    extra = 0
    fields = ('item', 'system_quantity', 'counted_quantity', 'variance', 'variance_percent', 'variance_value', 'variance_reason', 'notes')
    readonly_fields = ('variance', 'variance_percent', 'variance_value')
    raw_id_fields = ('item',)


@admin.register(PhysicalCount)
class PhysicalCountAdmin(admin.ModelAdmin):
    list_display = ['count_number', 'count_date', 'location', 'status', 'counted_by', 'reviewed_by', 'created_at']
    list_filter = ['status', 'count_date', 'location', 'created_at']
    search_fields = ['count_number', 'counted_by__username', 'reviewed_by__username', 'notes']
    readonly_fields = ['count_number', 'total_lines', 'total_variance_value', 'created_at', 'updated_at']
    inlines = [PhysicalCountLineInline]
    fieldsets = (
        ('Count Information', {
            'fields': ('count_number', 'count_date', 'location', 'status')
        }),
        ('Personnel', {
            'fields': ('counted_by', 'reviewed_by', 'reviewed_at')
        }),
        ('Summary', {
            'fields': ('total_lines', 'total_variance_value', 'notes', 'review_notes')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(PhysicalCountLine)
class PhysicalCountLineAdmin(admin.ModelAdmin):
    list_display = ['physical_count', 'item', 'system_quantity', 'counted_quantity', 'variance', 'variance_percent', 'variance_value', 'variance_reason']
    list_filter = ['variance_reason', 'physical_count__status', 'physical_count__count_date']
    search_fields = ['item__name', 'item__sku', 'physical_count__count_number', 'notes']
    readonly_fields = ['variance', 'variance_percent', 'variance_value']
    raw_id_fields = ('physical_count', 'item')

