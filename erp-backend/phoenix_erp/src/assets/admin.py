# assets/admin.py
from django.contrib import admin
from .models import AssetCategory, FixedAsset, AssetDepreciation, AssetMaintenance
from .models import AssetAcquisition, AssetAcquisitionLine


@admin.register(AssetCategory)
class AssetCategoryAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'default_depreciation_method', 'default_useful_life_years', 'created_at']
    list_filter = ['default_depreciation_method', 'is_deleted']
    search_fields = ['code', 'name', 'description']
    ordering = ['code']


@admin.register(FixedAsset)
class FixedAssetAdmin(admin.ModelAdmin):
    list_display = ['asset_number', 'name', 'category', 'status', 'purchase_price', 'current_value', 'purchase_date']
    list_filter = ['category', 'status', 'depreciation_method', 'is_deleted']
    search_fields = ['asset_number', 'name', 'serial_number', 'registration_number']
    date_hierarchy = 'purchase_date'
    ordering = ['asset_number']
    readonly_fields = ['current_value', 'created_at', 'updated_at']


@admin.register(AssetDepreciation)
class AssetDepreciationAdmin(admin.ModelAdmin):
    list_display = ['asset', 'period_start', 'period_end', 'depreciation_amount', 'is_posted', 'posted_at']
    list_filter = ['is_posted', 'period_start']
    search_fields = ['asset__asset_number', 'asset__name']
    date_hierarchy = 'period_start'
    ordering = ['-period_start']
    readonly_fields = ['posted_at', 'created_at', 'updated_at']


@admin.register(AssetMaintenance)
class AssetMaintenanceAdmin(admin.ModelAdmin):
    list_display = ['asset', 'maintenance_date', 'maintenance_type', 'cost', 'performed_by']
    list_filter = ['maintenance_type', 'maintenance_date']
    search_fields = ['asset__asset_number', 'asset__name', 'description', 'performed_by', 'vendor']
    date_hierarchy = 'maintenance_date'
    ordering = ['-maintenance_date']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AssetAcquisition)
class AssetAcquisitionAdmin(admin.ModelAdmin):
    list_display = ['reference_number', 'supplier', 'total_amount', 'purchase_date', 'status']
    list_filter = ['status', 'purchase_date']
    search_fields = ['reference_number', 'supplier__name']
    date_hierarchy = 'purchase_date'
    ordering = ['-purchase_date']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(AssetAcquisitionLine)
class AssetAcquisitionLineAdmin(admin.ModelAdmin):
    list_display = ['acquisition', 'name', 'asset_category', 'quantity', 'unit_price', 'total_price']
    list_filter = ['asset_category']
    search_fields = ['name', 'asset_category__name']
    ordering = ['-id']
    readonly_fields = ['total_price', 'created_at', 'updated_at']