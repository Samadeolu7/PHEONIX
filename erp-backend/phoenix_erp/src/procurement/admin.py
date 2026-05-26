from django.contrib import admin
from .models import (
    Supplier, PurchaseRequisition, PurchaseRequisitionItem,
    SupplierQuote, SupplierQuoteItem,
    PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote, GoodsReceivedNoteItem,
    PurchaseReturn, PurchaseReturnItem,
    ProcurementConfig
)


class PurchaseRequisitionItemInline(admin.TabularInline):
    model = PurchaseRequisitionItem
    extra = 0
    fields = ['item', 'description', 'quantity', 'estimated_unit_price', 'notes']
    readonly_fields = ['po_item']


@admin.register(PurchaseRequisition)
class PurchaseRequisitionAdmin(admin.ModelAdmin):
    list_display = ['pr_number', 'requested_by', 'department', 'status', 'request_date', 'required_by_date', 'estimated_total']
    list_filter = ['status', 'request_date', 'branch']
    search_fields = ['pr_number', 'purpose', 'department']
    readonly_fields = ['pr_number', 'estimated_total', 'created_at', 'updated_at']
    inlines = [PurchaseRequisitionItemInline]
    date_hierarchy = 'request_date'
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('pr_number', 'requested_by', 'department', 'branch')
        }),
        ('Dates', {
            'fields': ('request_date', 'required_by_date')
        }),
        ('Details', {
            'fields': ('purpose', 'notes')
        }),
        ('Status', {
            'fields': ('status', 'approved_by', 'approved_at', 'rejection_reason')
        }),
        ('Financial', {
            'fields': ('estimated_total',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class SupplierQuoteItemInline(admin.TabularInline):
    model = SupplierQuoteItem
    extra = 0
    fields = ['item', 'description', 'quantity', 'unit_price', 'notes']


@admin.register(SupplierQuote)
class SupplierQuoteAdmin(admin.ModelAdmin):
    list_display = ['quote_number', 'supplier', 'requisition', 'status', 'quote_date', 'valid_until', 'total_amount']
    list_filter = ['status', 'quote_date', 'branch']
    search_fields = ['quote_number', 'supplier__name']
    readonly_fields = ['quote_number', 'total_amount', 'created_at', 'updated_at']
    inlines = [SupplierQuoteItemInline]
    date_hierarchy = 'quote_date'


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    fields = ['item', 'description', 'quantity', 'unit_price', 'notes']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['po_number', 'supplier', 'status', 'order_date', 'expected_delivery_date', 'total_amount']
    list_filter = ['status', 'order_date', 'branch']
    search_fields = ['po_number', 'supplier__name']
    readonly_fields = ['po_number', 'total_amount', 'created_at', 'updated_at']
    inlines = [PurchaseOrderItemInline]
    date_hierarchy = 'order_date'
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('po_number', 'requisition', 'supplier', 'branch', 'selected_quote')
        }),
        ('Dates', {
            'fields': ('order_date', 'expected_delivery_date')
        }),
        ('Delivery', {
            'fields': ('delivery_location', 'shipping_method', 'shipping_cost')
        }),
        ('Payment', {
            'fields': ('payment_terms', 'custom_payment_terms')
        }),
        ('Contact', {
            'fields': ('contact_person', 'contact_phone', 'contact_email')
        }),
        ('Status & Financial', {
            'fields': ('status', 'total_amount')
        }),
        ('Notes', {
            'fields': ('notes',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class GoodsReceivedNoteItemInline(admin.TabularInline):
    model = GoodsReceivedNoteItem
    extra = 0
    fields = ['item', 'quantity_ordered', 'quantity_received', 'unit_cost', 'batch_number']


@admin.register(GoodsReceivedNote)
class GoodsReceivedNoteAdmin(admin.ModelAdmin):
    list_display = ['grn_number', 'supplier', 'purchase_order', 'received_date', 'quality_status', 'total_amount']
    list_filter = ['quality_status', 'received_date', 'branch']
    search_fields = ['grn_number', 'supplier__name', 'purchase_order__po_number']
    readonly_fields = ['grn_number', 'total_amount', 'created_at', 'updated_at']
    inlines = [GoodsReceivedNoteItemInline]
    date_hierarchy = 'received_date'


class PurchaseReturnItemInline(admin.TabularInline):
    model = PurchaseReturnItem
    extra = 0
    fields = ['item', 'quantity_returned', 'unit_cost', 'reason']


@admin.register(PurchaseReturn)
class PurchaseReturnAdmin(admin.ModelAdmin):
    list_display = ['return_number', 'supplier', 'grn', 'return_date', 'status', 'total_amount']
    list_filter = ['status', 'return_date', 'branch']
    search_fields = ['return_number', 'supplier__name']
    readonly_fields = ['return_number', 'total_amount', 'created_at', 'updated_at']
    inlines = [PurchaseReturnItemInline]
    date_hierarchy = 'return_date'


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['supplier_code', 'name', 'contact_person', 'email', 'phone', 'payment_terms', 'credit_limit', 'is_active']
    list_filter = ['is_active', 'payment_terms', 'branch']
    search_fields = ['supplier_code', 'name', 'contact_person', 'email', 'tax_id']
    readonly_fields = ['supplier_code', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('supplier_code', 'name', 'branch')
        }),
        ('Contact Information', {
            'fields': ('contact_person', 'email', 'phone', 'address')
        }),
        ('Financial', {
            'fields': ('tax_id', 'payment_terms', 'credit_limit')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Additional Info', {
            'fields': ('metadata',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ProcurementConfig)
class ProcurementConfigAdmin(admin.ModelAdmin):
    list_display = ['branch', 'enable_three_way_matching', 'matching_tolerance_percentage', 'auto_approve_within_tolerance']
    list_filter = ['enable_three_way_matching', 'auto_approve_within_tolerance']
    search_fields = ['branch__name']


# Register individual item models
@admin.register(PurchaseRequisitionItem)
class PurchaseRequisitionItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'requisition', 'item', 'description', 'quantity', 'estimated_unit_price', 'get_total']
    list_filter = ['requisition__status', 'requisition__branch']
    search_fields = ['description', 'requisition__pr_number', 'item__name']
    readonly_fields = ['po_item']
    
    def get_total(self, obj):
        return obj.quantity * obj.estimated_unit_price
    get_total.short_description = 'Total Price'


@admin.register(SupplierQuoteItem)
class SupplierQuoteItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'quote', 'item', 'description', 'quantity', 'unit_price', 'get_total']
    list_filter = ['quote__status', 'quote__branch']
    search_fields = ['description', 'quote__quote_number', 'item__name']
    
    def get_total(self, obj):
        return obj.quantity * obj.unit_price
    get_total.short_description = 'Total Price'


@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'purchase_order', 'item', 'description', 'quantity', 'unit_price', 'get_total', 'quantity_received']
    list_filter = ['purchase_order__status', 'purchase_order__branch']
    search_fields = ['description', 'purchase_order__po_number', 'item__name']
    
    def get_total(self, obj):
        return obj.quantity * obj.unit_price
    get_total.short_description = 'Total Price'


@admin.register(GoodsReceivedNoteItem)
class GoodsReceivedNoteItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'grn', 'item', 'quantity_ordered', 'quantity_received', 'unit_cost', 'get_total']
    list_filter = ['grn__quality_status', 'grn__branch']
    search_fields = ['grn__grn_number', 'item__name', 'batch_number']
    
    def get_total(self, obj):
        return obj.quantity_received * obj.unit_cost
    get_total.short_description = 'Total Cost'


@admin.register(PurchaseReturnItem)
class PurchaseReturnItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'purchase_return', 'item', 'quantity_returned', 'unit_cost', 'get_total']
    list_filter = ['purchase_return__status', 'purchase_return__branch']
    search_fields = ['purchase_return__return_number', 'item__name', 'reason']
    
    def get_total(self, obj):
        return obj.quantity_returned * obj.unit_cost
    get_total.short_description = 'Total Cost'
