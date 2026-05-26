from django.contrib import admin
from .models import Module, ModulePage, PageWidget, QuickAction, FormLink
from .action_models import PageAction, RoleActionPermission


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'order', 'is_active', 'owner', 'branch']
    list_filter = ['is_active', 'is_deleted']
    search_fields = ['name', 'code', 'description']
    ordering = ['order', 'name']


@admin.register(ModulePage)
class ModulePageAdmin(admin.ModelAdmin):
    list_display = ['title', 'module', 'code', 'page_type', 'url_path', 'show_in_menu', 'is_active']
    list_filter = ['module', 'page_type', 'show_in_menu', 'is_active', 'is_deleted']
    search_fields = ['title', 'code', 'url_path']
    ordering = ['module', 'order']


@admin.register(PageAction)
class PageActionAdmin(admin.ModelAdmin):
    list_display = ['name', 'module', 'page', 'code', 'action_type', 'order', 'is_active']
    list_filter = ['module', 'action_type', 'is_active', 'is_deleted']
    search_fields = ['name', 'code', 'description']
    ordering = ['module', 'order']
    raw_id_fields = ['module', 'page']


@admin.register(RoleActionPermission)
class RoleActionPermissionAdmin(admin.ModelAdmin):
    list_display = ['role', 'action', 'permission_level', 'can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'is_active']
    list_filter = ['role', 'permission_level', 'is_active', 'granted_at']
    search_fields = ['role__name', 'action__name', 'action__code']
    ordering = ['role', 'action']
    raw_id_fields = ['role', 'action', 'granted_by']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('role', 'action', 'permission_level', 'is_active')
        }),
        ('Granular Permissions', {
            'fields': ('can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export')
        }),
        ('Conditions', {
            'fields': ('conditions',),
            'classes': ('collapse',)
        }),
        ('Audit', {
            'fields': ('granted_by', 'granted_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    readonly_fields = ['granted_at', 'updated_at']
