# branches/views.py
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers

from common.views import ScopedModelViewSet
from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    """Serializer for Branch model"""
    class Meta:
        model = Branch
        fields =[
            'id', 'name', 'code', 'city', 'state', 'country', 'postal_code',
            'latitude', 'longitude', 'main_bank_account',
        ]
        read_only_fields = ['id', 'tenant', 'is_deleted', 'created_at', 'updated_at']


class BranchViewSet(ScopedModelViewSet):
    """
    ViewSet for managing branches
    """
    permission_module = 'branches'
    permission_page = 'branches'
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated]
    # Branch listing is structural data needed by every role (e.g. branch-switcher
    # dropdown for directors). Fine-grained action checks are unnecessary here.
    skip_action_permission = True
    
    def get_queryset(self):
        """
        Override to filter by tenant only (Branch model doesn't have a branch field).
        System admins see all branches across all tenants.
        """
        qs = Branch.objects.all()
        
        # During OpenAPI/schema generation
        if getattr(self, 'swagger_fake_view', False):
            return qs.none()
        
        user = getattr(self.request, 'user', None)
        if not user or not user.is_authenticated:
            return qs.none()
        
        # System admin bypass - sees all branches across all tenants
        if getattr(user, 'is_system_admin', False):
            return qs
        
        # Filter by tenant only (don't filter by branch since Branch is the branch)
        if hasattr(user, 'tenant') and user.tenant:
            return qs.filter(tenant=user.tenant, is_deleted=False)
        
        # Fallback: return empty queryset if user has no tenant
        return qs.none()

