# common/serializers.py
from rest_framework import viewsets, permissions, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.fields import SkipField

from branches.models import Branch
from users.models import User


from .models import MenuGroup, MenuItem, BusinessDay, BackdateRequest


class CurrentBranchDefault:
    requires_context = True

    def __call__(self, serializer_field):
        user = serializer_field.context['request'].user
        if hasattr(user, 'branch') and user.branch:
            return user.branch
        raise PermissionDenied('User has no branch assigned.')

    def __repr__(self):
        return '<CurrentBranchDefault>'


class CurrentTenantDefault:
    requires_context = True

    def __call__(self, serializer_field):
        # Prefer tenant resolved by middleware on the request; fall back to user's tenant
        request = serializer_field.context.get('request')
        if request is not None:
            # Prefer an authenticated user's tenant when available (works with DRF's force_authenticate)
            user = getattr(request, 'user', None)
            if user is not None and getattr(user, 'is_authenticated', False):
                user_tenant = getattr(user, 'tenant', None)
                if user_tenant:
                    return user_tenant
            # Fallback to tenant resolved by middleware
            tenant = getattr(request, 'tenant', None)
            if tenant:
                return tenant
        return None

    def __repr__(self):
        return '<CurrentTenantDefault>'


class IsTenantUser(permissions.BasePermission):
    """
    Allow access only to users who belong to the tenant and branch (or have cross-branch permission).
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        # Allow access if user belongs to the same tenant and branch
        # NOTE: We do NOT check owner here - that's for audit purposes only
        # All users in the same branch/tenant should access the same records
        
        # System admin bypass
        if getattr(request.user, 'is_system_admin', False):
            return True
        
        # Check tenant if both user and object have tenant
        if hasattr(request.user, 'tenant') and hasattr(obj, 'tenant'):
            if request.user.tenant and obj.tenant and request.user.tenant != obj.tenant:
                return False
        
        # Check branch - allow cross-branch permission or same branch
        if request.user.has_perm(f"{obj._meta.app_label}.view_all_branches"):
            return True
        
        # Enforce branch match
        if hasattr(request.user, 'branch') and hasattr(obj, 'branch'):
            return obj.branch == request.user.branch
        
        # If no branch on either, allow (shouldn't happen for BranchScopedModel)
        return True


class TenantModelSerializer(serializers.ModelSerializer):
    """
    Auto-populate owner and branch on creation; make read-only in responses.
    """
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    branch = serializers.HiddenField(default=CurrentBranchDefault())
    tenant = serializers.HiddenField(default=CurrentTenantDefault())

    def create(self, validated_data):
        """Ensure tenant is set from request if HiddenField default didn't provide it.

        This handles non-request creation paths and cases where the default returns None.
        """
        request = self.context.get('request') if hasattr(self, 'context') else None
        if request is not None:
            # Prefer authenticated user's tenant when available (works with force_authenticate in tests)
            user = getattr(request, 'user', None)
            if user is not None and getattr(user, 'is_authenticated', False):
                user_tenant = getattr(user, 'tenant', None)
                if user_tenant and not validated_data.get('tenant'):
                    validated_data['tenant'] = user_tenant

            # Fallback to request.tenant (set by middleware)
            tenant = getattr(request, 'tenant', None)
            if tenant and not validated_data.get('tenant'):
                validated_data['tenant'] = tenant

        return super().create(validated_data)


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ['id', 'group', 'code', 'label', 'route', 'order', 'permission']
        read_only_fields = ['id']

    def validate_permission(self, value):
        """
        Validate that the permission string is in the correct format and exists
        """
        if value and '.' not in value:
            raise serializers.ValidationError(
                "Permission must be in format 'app_label.codename'"
            )
        return value

class MenuGroupSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = MenuGroup
        fields = ['id', 'code', 'label', 'order', 'items']
        read_only_fields = ['id']

    def create(self, validated_data):
        # Automatically set tenant from request
        validated_data['tenant'] = self.context['request'].user.tenant
        return super().create(validated_data)
    """
    Allow access only to users who belong to the tenant and branch (or have cross-branch permission).
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        # obj must have .owner and .branch attributes
        if obj.owner != request.user:
            return False
        # cross-branch permission check
        if request.user.has_perm(f"{obj._meta.app_label}.view_all_branches"):
            return True
        # else enforce branch match
        return hasattr(request.user, 'branch') and obj.branch == request.user.branch


# ---------------------------------------------------------------------------
# BusinessDay serializers
# ---------------------------------------------------------------------------

class BusinessDaySerializer(serializers.ModelSerializer):
    closed_by_name = serializers.SerializerMethodField()
    override_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BusinessDay
        fields = [
            'id', 'branch', 'date', 'status',
            'closed_by', 'closed_by_name', 'closed_at',
            'override_by', 'override_by_name', 'override_reason',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'closed_by', 'closed_at', 'override_by',
            'created_at', 'updated_at',
        ]

    def get_closed_by_name(self, obj):
        return obj.closed_by.get_full_name() if obj.closed_by else None

    def get_override_by_name(self, obj):
        return obj.override_by.get_full_name() if obj.override_by else None


# ---------------------------------------------------------------------------
# BackdateRequest serializers
# ---------------------------------------------------------------------------

class BackdateRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BackdateRequest
        fields = [
            'id', 'branch', 'requested_by', 'requested_by_name',
            'target_date', 'reason', 'status',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'rejection_reason',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'requested_by', 'reviewed_by', 'reviewed_at',
            'status', 'created_at', 'updated_at',
        ]

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None