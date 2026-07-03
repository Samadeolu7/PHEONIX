from rest_framework import serializers
from django.contrib.auth.models import Permission
from .models import Tenant, Role, User
from branches.models import Branch
from dashboards.models import Dashboard

class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for detailed permission information"""
    content_type = serializers.CharField(source='content_type.app_label', read_only=True)
    
    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'content_type']


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SlugRelatedField(
        many=True,
        slug_field='codename',
        queryset=Permission.objects.all(),
        required=False
    )
    permission_details = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Role
        fields = [
            'id', 'name', 'description', 'permissions', 'permission_details',
            'default_dashboard', 'can_access_dashboards', 'can_access_modules',
            'can_access_pages', 'permission_codes', 'is_active', 'user_count', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'permission_details']
    
    def get_user_count(self, obj):
        return obj.users.count()
    
    def get_permission_details(self, obj):
        """Return detailed permission information"""
        return PermissionSerializer(obj.permissions.all(), many=True).data

class TenantSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source='owner.get_full_name')
    domain_type_display = serializers.CharField(source='get_domain_type_display', read_only=True)
    
    class Meta:
        model = Tenant
        fields = [
            'id',
            'name',
            'owner',
            'slug',
            'domain_type',
            'domain_type_display',
            'domain_config',
            'enabled_features',
            'custom_labels',
            'settings',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.PrimaryKeyRelatedField(many=True, queryset=Role.objects.all(), required=False)
    role_names = serializers.SerializerMethodField()
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False, allow_null=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    assigned_dashboard = serializers.PrimaryKeyRelatedField(
        queryset=Dashboard.objects.all(),  # Default to all, will be filtered in __init__
        required=False,
        allow_null=True
    )
    assigned_dashboard_name = serializers.CharField(source='assigned_dashboard.name', read_only=True)
    full_name = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    action_permissions = serializers.SerializerMethodField()
    effective_permissions = serializers.SerializerMethodField()
    # Password is write-only and only required when creating a new user
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, style={'input_type': 'password'})

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'tenant', 'branch', 'branch_name', 'roles', 'role_names',
            'assigned_dashboard', 'assigned_dashboard_name',
            'action_permissions', 'effective_permissions',
            'is_active', 'is_active_user', 'is_staff', 'is_owner',
            'date_joined', 'last_login', 'password'
        ]
        # `tenant` is readonly by default but made writable for system admins in __init__
        read_only_fields = ['date_joined', 'last_login', 'is_owner', 'action_permissions', 'effective_permissions']
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set dashboard queryset based on request context
        request = self.context.get('request')
        if request and hasattr(request, 'user') and hasattr(request.user, 'tenant') and request.user.tenant:
            self.fields['assigned_dashboard'].queryset = Dashboard.objects.filter(
                owner__tenant=request.user.tenant
            )
        else:
            # Fallback: set to empty queryset if no tenant context
            self.fields['assigned_dashboard'].queryset = Dashboard.objects.none()

        # Make `tenant` writable for system admins so they can create users under any tenant.
        # For non-admins, `tenant` remains effectively read-only and will be assigned from the request user.
        try:
            if request and hasattr(request, 'user') and getattr(request.user, 'is_system_admin', False):
                self.fields['tenant'].read_only = False
            else:
                self.fields['tenant'].read_only = True
        except Exception:
            # If anything goes wrong, default to read-only to avoid accidental tenant changes
            self.fields['tenant'].read_only = True

    def validate(self, data):
        # Require password when creating a new user (no instance present)
        if self.instance is None and not data.get('password'):
            raise serializers.ValidationError({'password': 'A password is required when creating a new user.'})
        return data

    def create(self, validated_data):
        request = self.context['request']
        # Determine tenant assignment:
        # - If the authenticated user is a system admin, allow tenant provided in payload (if any).
        # - Otherwise, force tenant to the authenticated user's tenant.
        tenant_to_assign = None
        if request and hasattr(request, 'user') and getattr(request.user, 'is_system_admin', False):
            # System admin: allow tenant from validated_data if provided
            tenant_to_assign = validated_data.get('tenant', None)
        else:
            tenant_to_assign = getattr(request.user, 'tenant', None)

        if tenant_to_assign is not None:
            validated_data['tenant'] = tenant_to_assign
        else:
            # Ensure tenant key is not present as None when creating
            validated_data.pop('tenant', None)
        roles = validated_data.pop('roles', [])
        password = validated_data.pop('password')
        user = User.objects.create_user(**validated_data)
        user.is_staff = True  # Ensure new users are staff by default
        user.set_password(password)
        user.save(update_fields=['password'])
        if roles:
            user.roles.set(roles)
        return user

    def update(self, instance, validated_data):
        # Password is optional on update; only touch it (via set_password, never a raw
        # assignment) when the client actually sent a non-blank value. Otherwise DRF's
        # default update() would overwrite the stored hash with an empty string.
        password = validated_data.pop('password', None)
        roles = validated_data.pop('roles', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if roles is not None:
            instance.roles.set(roles)
        return instance

    def get_role_names(self, obj):
        return [role.name for role in obj.roles.all()]
    
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username
    
    def get_is_owner(self, obj):
        return obj.is_owner()
    
    def get_action_permissions(self, obj):
        """Return all action permissions for this user from all roles"""
        return obj.get_all_action_permissions()

    def get_effective_permissions(self, obj):
        """Return the resolved scope/approval-limit/elevation summary for the frontend."""
        try:
            from permissions.services import PermissionResolver
            ep = PermissionResolver.resolve(obj)
            return ep.as_dict()
        except Exception:
            return None


class PasswordChangeSerializer(serializers.Serializer):
    """Serializer for validating password change requests."""
    old_password = serializers.CharField(required=False, write_only=True, allow_blank=True)
    new_password = serializers.CharField(required=True, write_only=True)
