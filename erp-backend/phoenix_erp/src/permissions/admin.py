from django.contrib import admin
from permissions.models import RolePermissionPolicy, UserPermissionOverride, PermissionElevationLog


@admin.register(RolePermissionPolicy)
class RolePermissionPolicyAdmin(admin.ModelAdmin):
    list_display  = ('role', 'module', 'page', 'action', 'scope', 'can_view', 'can_create',
                     'can_edit', 'can_delete', 'can_approve', 'can_export', 'approval_limit')
    list_filter   = ('role__tenant', 'scope', 'can_approve')
    search_fields = ('role__name', 'module__name', 'page__title', 'action__name')
    raw_id_fields = ('role', 'module', 'page', 'action', 'created_by')


@admin.register(UserPermissionOverride)
class UserPermissionOverrideAdmin(admin.ModelAdmin):
    list_display  = ('user', 'module', 'page', 'action', 'scope', 'target_branch',
                     'is_elevated', 'is_active', 'is_suspended', 'expiry_type',
                     'effective_expires_at', 'granted_by', 'granted_at')
    list_filter   = ('is_elevated', 'is_active', 'is_suspended', 'expiry_type', 'expiry_behavior')
    search_fields = ('user__email', 'user__first_name', 'user__last_name',
                     'module__name', 'page__title', 'action__name')
    raw_id_fields = ('user', 'module', 'page', 'action', 'scope_ajo_group',
                     'target_branch', 'granted_by', 'revoked_by')
    readonly_fields = ('is_elevated', 'granted_at', 'revoked_at', 'effective_expires_at', 'hours_until_expiry')

    def effective_expires_at(self, obj):
        return obj.effective_expires_at
    effective_expires_at.short_description = 'Expires At'


@admin.register(PermissionElevationLog)
class PermissionElevationLogAdmin(admin.ModelAdmin):
    list_display  = ('user', 'action_code', 'record_type', 'record_id',
                     'scope_used', 'approval_amount', 'logged_at')
    list_filter   = ('action_code', 'record_type', 'scope_used')
    search_fields = ('user__email', 'action_code', 'record_type', 'record_id')
    raw_id_fields = ('user', 'override', 'branch')
    readonly_fields = tuple(f.name for f in PermissionElevationLog._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
