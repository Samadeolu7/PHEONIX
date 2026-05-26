from django.contrib import admin
from .models import Dashboard, Widget, WidgetDataSource, DashboardTemplate


@admin.register(Dashboard)
class DashboardAdmin(admin.ModelAdmin):
    list_display = ['owner', 'name', 'slug', 'is_default', 'is_active', 'created_at']
    list_filter = ['is_default', 'is_active', 'created_at']
    search_fields = ['name', 'slug']
    readonly_fields = ['slug', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('owner', 'name', 'slug', 'description')
        }),
        ('Settings', {
            'fields': ('is_default', 'is_active')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class WidgetInline(admin.TabularInline):
    model = Widget
    extra = 0
    fields = ['widget_type', 'instance_key', 'layout_x', 'layout_y', 'layout_w', 'layout_h']
    readonly_fields = ['instance_key']


@admin.register(Widget)
class WidgetAdmin(admin.ModelAdmin):
    list_display = ['dashboard', 'widget_type', 'instance_key', 'layout_x', 'layout_y', 'created_at']
    list_filter = ['widget_type', 'created_at']
    search_fields = ['dashboard__name', 'instance_key']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Widget Information', {
            'fields': ('dashboard', 'widget_type', 'instance_key', 'config')
        }),
        ('Layout', {
            'fields': (
                ('layout_x', 'layout_y'),
                ('layout_w', 'layout_h'),
                ('layout_min_w', 'layout_min_h'),
                ('layout_max_w', 'layout_max_h'),
            )
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WidgetDataSource)
class WidgetDataSourceAdmin(admin.ModelAdmin):
    # Use actual model fields: `source_type` replaces old `widget_type`/`query_type` usage
    list_display = ['name', 'identifier', 'source_type', 'is_active', 'cache_duration']
    list_filter = ['source_type', 'is_active']
    search_fields = ['name', 'identifier', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'identifier', 'description', 'source_type')
        }),
        ('Source Configuration', {
            'fields': ('source_config', 'cache_duration')
        }),
        ('Settings', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(DashboardTemplate)
class DashboardTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'is_active', 'created_at']
    list_filter = ['category', 'is_active', 'created_at']
    search_fields = ['name', 'description', 'category']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'description', 'category', 'preview_image')
        }),
        ('Template Configuration', {
            'fields': ('template_config',)
        }),
        ('Settings', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )