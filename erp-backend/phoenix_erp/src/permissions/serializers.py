"""
permissions/serializers.py
"""

from rest_framework import serializers
from permissions.models import RolePermissionPolicy, UserPermissionOverride, PermissionElevationLog
from permissions.services import PermissionResolver


# ── RolePermissionPolicy ──────────────────────────────────────────────────────

class RolePermissionPolicySerializer(serializers.ModelSerializer):
    role_name   = serializers.CharField(source='role.name',   read_only=True)
    module_name = serializers.CharField(source='module.name', read_only=True, allow_null=True)
    page_title  = serializers.CharField(source='page.title',  read_only=True, allow_null=True)
    action_name = serializers.CharField(source='action.name', read_only=True, allow_null=True)
    action_code = serializers.CharField(source='action.code', read_only=True, allow_null=True)
    specificity = serializers.IntegerField(read_only=True)

    class Meta:
        model  = RolePermissionPolicy
        fields = [
            'id', 'role', 'role_name',
            'module', 'module_name',
            'page', 'page_title',
            'action', 'action_name', 'action_code',
            'can_view', 'can_create', 'can_edit',
            'can_delete', 'can_approve', 'can_export',
            'scope', 'approval_limit',
            'specificity',
            'created_at', 'updated_at', 'created_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ── UserPermissionOverride ────────────────────────────────────────────────────

class UserPermissionOverrideSerializer(serializers.ModelSerializer):
    # Read-only computed / derived fields
    is_elevated        = serializers.BooleanField(read_only=True)
    is_currently_active = serializers.BooleanField(read_only=True)
    is_expired         = serializers.BooleanField(read_only=True)
    effective_expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
    hours_until_expiry = serializers.FloatField(read_only=True, allow_null=True)

    # Human-readable display names
    user_display       = serializers.SerializerMethodField()
    granted_by_display = serializers.SerializerMethodField()
    module_name  = serializers.CharField(source='module.name',  read_only=True, allow_null=True)
    page_title   = serializers.CharField(source='page.title',   read_only=True, allow_null=True)
    action_name  = serializers.CharField(source='action.name',  read_only=True, allow_null=True)
    action_code  = serializers.CharField(source='action.code',  read_only=True, allow_null=True)
    ajo_group_name = serializers.CharField(source='scope_ajo_group.name', read_only=True, allow_null=True)

    class Meta:
        model  = UserPermissionOverride
        fields = [
            'id', 'user', 'user_display',
            'module', 'module_name',
            'page', 'page_title',
            'action', 'action_name', 'action_code',
            'can_view', 'can_create', 'can_edit',
            'can_delete', 'can_approve', 'can_export',
            'scope', 'scope_ajo_group', 'ajo_group_name',
            'approval_limit',
            'expiry_type', 'expires_at', 'expire_after_hours', 'expiry_behavior',
            'is_active', 'is_suspended', 'is_elevated',
            'is_currently_active', 'is_expired',
            'effective_expires_at', 'hours_until_expiry',
            'granted_by', 'granted_by_display', 'granted_at', 'grant_reason',
            'revoked_at', 'revoked_by', 'revoke_reason',
        ]
        read_only_fields = [
            'id', 'is_elevated', 'is_currently_active', 'is_expired',
            'effective_expires_at', 'hours_until_expiry',
            'granted_at', 'revoked_at',
        ]

    def get_user_display(self, obj):
        return str(obj.user)

    def get_granted_by_display(self, obj):
        return str(obj.granted_by) if obj.granted_by else None


# ── PermissionElevationLog ────────────────────────────────────────────────────

class PermissionElevationLogSerializer(serializers.ModelSerializer):
    user_display     = serializers.SerializerMethodField()
    override_summary = serializers.SerializerMethodField()
    branch_name      = serializers.CharField(source='branch.name', read_only=True, allow_null=True)

    class Meta:
        model  = PermissionElevationLog
        fields = [
            'id', 'user', 'user_display',
            'override', 'override_summary',
            'action_code', 'record_type', 'record_id',
            'branch', 'branch_name',
            'scope_used', 'approval_amount',
            'field_changes', 'logged_at',
        ]
        read_only_fields = ['__all__']

    def get_user_display(self, obj):
        return str(obj.user)

    def get_override_summary(self, obj):
        if not obj.override_id:
            return None
        o = obj.override
        return {
            'id': o.id,
            'is_elevated': o.is_elevated,
            'grant_reason': o.grant_reason,
        }


# ── Effective permissions (resolver output) ───────────────────────────────────

class EffectivePermissionsSerializer(serializers.Serializer):
    """Serializes the output of PermissionResolver.resolve()."""
    can_view      = serializers.BooleanField()
    can_create    = serializers.BooleanField()
    can_edit      = serializers.BooleanField()
    can_delete    = serializers.BooleanField()
    can_approve   = serializers.BooleanField()
    can_export    = serializers.BooleanField()
    scope         = serializers.CharField()
    scope_ajo_group_id = serializers.IntegerField(allow_null=True)
    approval_limit     = serializers.DecimalField(max_digits=18, decimal_places=2, allow_null=True)
    is_elevated        = serializers.BooleanField()
    elevated_fields    = serializers.ListField(child=serializers.CharField())
