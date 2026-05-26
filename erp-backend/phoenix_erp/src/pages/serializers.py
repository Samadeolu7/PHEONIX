from rest_framework import serializers
from .models import Module, ModulePage, QuickAction
from .action_models import PageAction, RoleActionPermission

class ModulePageSerializer(serializers.ModelSerializer):
    """Serializer for module pages"""
    
    class Meta:
        model = ModulePage
        fields = [
            'id',
            'code',
            'title',
            'description',
            'icon',
            'page_type',
            'page_config',
            'url_path',
            'show_in_menu',
            'order',
            'is_active',
        ]


class ModuleSerializer(serializers.ModelSerializer):
    """Serializer for modules with nested pages"""
    pages = ModulePageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Module
        fields = [
            'id',
            'code',
            'name',
            'description',
            'icon',
            'color',
            'order',
            'is_active',
            'pages',
        ]


class QuickActionSerializer(serializers.ModelSerializer):
    """Serializer for quick actions"""
    
    class Meta:
        model = QuickAction
        fields = [
            'id',
            'code',
            'title',
            'description',
            'icon',
            'color',
            'context',
            'action_type',
            'action_config',
            'order',
            'is_featured',
        ]


class PageActionSerializer(serializers.ModelSerializer):
    """Serializer for page actions"""
    module_name = serializers.CharField(source='module.name', read_only=True)
    module_code = serializers.CharField(source='module.code', read_only=True)
    page_title = serializers.CharField(source='page.title', read_only=True, allow_null=True)
    
    class Meta:
        model = PageAction
        fields = [
            'id',
            'module',
            'module_name',
            'module_code',
            'page',
            'page_title',
            'code',
            'name',
            'description',
            'action_type',
            'permission_codename',
            'icon',
            'color',
            'order',
            'is_active',
            'show_in_list',
        ]


class RoleActionPermissionSerializer(serializers.ModelSerializer):
    """Serializer for role action permissions"""
    role_name = serializers.CharField(source='role.name', read_only=True)
    action_name = serializers.CharField(source='action.name', read_only=True)
    action_code = serializers.CharField(source='action.code', read_only=True)
    module_code = serializers.CharField(source='action.module.code', read_only=True)
    
    class Meta:
        model = RoleActionPermission
        fields = [
            'id',
            'role',
            'role_name',
            'action',
            'action_name',
            'action_code',
            'module_code',
            'permission_level',
            'can_view',
            'can_create',
            'can_edit',
            'can_delete',
            'can_approve',
            'can_export',
            'conditions',
            'is_active',
            'granted_at',
            'updated_at',
        ]
        read_only_fields = ['granted_at', 'updated_at']


class RolePermissionMatrixSerializer(serializers.Serializer):
    """
    Serializer for the role permission matrix view
    Used to display all roles and their permissions for all actions
    """
    modules = serializers.ListField(child=serializers.DictField())
    roles = serializers.ListField(child=serializers.DictField())
    permissions = serializers.DictField()

