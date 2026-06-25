# users/viewsets.py
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth.models import Permission
from django.db.models import Q, Count
from .models import Tenant, Role, User
from .serializers import TenantSerializer, RoleSerializer, UserSerializer, PasswordChangeSerializer
from common.views import ScopedModelViewSet
from .domain_labels import get_domain_labels, DOMAIN_LABEL_MAPPINGS



class TenantViewSet(viewsets.ModelViewSet):
    permission_module = 'tenants'
    permission_page = 'tenants'
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    
    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get current tenant from request"""
        tenant = request.tenant  # Assuming middleware sets this
        serializer = self.get_serializer(tenant)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_domain(self, request):
        """Get tenant by domain"""
        domain = request.query_params.get('domain')
        if not domain:
            return Response({'error': 'domain parameter required'}, status=400)
        
        try:
            tenant = Tenant.objects.get(domain=domain)
            serializer = self.get_serializer(tenant)
            return Response(serializer.data)
        except Tenant.DoesNotExist:
            return Response({'error': 'Tenant not found'}, status=404)
    
    @action(detail=False, methods=['get'])
    def labels(self, request):
        """
        Get domain-specific labels for the current tenant.
        Returns label mappings that can be used to translate generic terms to domain-specific ones.
        """
        try:
            if not hasattr(request.user, 'tenant') or not request.user.tenant:
                return Response(
                    {
                        'error': 'No tenant associated with user',
                        'detail': 'User must belong to a tenant to access domain labels'
                    }, 
                    status=400
                )
            
            tenant = request.user.tenant
            
            # Get custom labels, ensuring it's a dict
            custom_labels = tenant.custom_labels
            if custom_labels and not isinstance(custom_labels, dict):
                # If custom_labels is not a dict (e.g., string, list), set to empty dict
                custom_labels = {}
            
            labels = get_domain_labels(tenant.domain_type, custom_labels)
            
            return Response({
                'domain_type': tenant.domain_type,
                'labels': labels,
                'tenant_name': tenant.name,
            })
            
        except Exception as e:
            # Log the full error for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.exception(f"Error fetching domain labels: {str(e)}")
            
            # Return a meaningful error to the client
            return Response(
                {
                    'error': 'Failed to retrieve domain labels',
                    'detail': str(e),
                    'tenant_id': getattr(request.user.tenant, 'id', None) if hasattr(request.user, 'tenant') else None
                },
                status=500
            )


class RoleViewSet(ScopedModelViewSet):
    permission_module = 'users'
    permission_page = 'roles'
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    
    def get_queryset(self):
        """Filter roles by tenant"""
        qs = super().get_queryset()
        if hasattr(self.request.user, 'tenant') and self.request.user.tenant:
            qs = qs.filter(tenant=self.request.user.tenant)
        return qs.annotate(user_count=Count('users'))
    
    def perform_create(self, serializer):
        """Automatically set tenant when creating role"""
        serializer.save(tenant=self.request.user.tenant)
    
    @action(detail=False, methods=['get'])
    def available_permissions(self, request):
        """Get list of available permissions for roles"""
        permissions = Permission.objects.select_related('content_type').all()
        data = [
            {
                'id': p.id,
                'codename': p.codename,
                'name': p.name,
                'content_type': p.content_type.app_label
            }
            for p in permissions
        ]
        return Response(data)


class StaffUserViewSet(ScopedModelViewSet):
    permission_module = 'users'
    permission_page = 'staff-users'
    queryset = User.objects.exclude(tenant=None)
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Filter users by tenant and apply permissions"""
        qs = super().get_queryset()
        user = self.request.user
        
        # Filter by tenant
        if hasattr(user, 'tenant') and user.tenant:
            qs = qs.filter(tenant=user.tenant)
        
        # Select related for performance
        qs = qs.select_related('branch', 'assigned_dashboard').prefetch_related('roles')
        
        return qs
    
    def perform_create(self, serializer):
        """Create user with tenant and branch resolved from the branch switcher."""
        _, branch, tenant = self._resolve_create_scope()
        serializer.save(branch=branch, tenant=tenant)

    def create(self, request, *args, **kwargs):
        """Only Directors and Principals are permitted to create new users."""
        user = request.user
        if not getattr(user, 'is_system_admin', False):
            user_role_names = set(
                user.roles.filter(is_active=True).values_list('name', flat=True)
            )
            allowed_roles = {'Director', 'Principal'}
            if not (allowed_roles & user_role_names):
                return Response(
                    {'error': 'Only Directors and Principals can create new users.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a user account"""
        user = self.get_object()
        if user.tenant != request.user.tenant:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        user.is_active = True
        user.is_active_user = True
        user.save()
        return Response({'status': 'User activated'})
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a user account"""
        user = self.get_object()
        if user.tenant != request.user.tenant:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        if user.is_owner():
            return Response({'error': 'Cannot deactivate tenant owner'}, status=status.HTTP_400_BAD_REQUEST)
        
        user.is_active_user = False
        user.save()
        return Response({'status': 'User deactivated'})
    
    @action(detail=True, methods=['post'])
    def assign_dashboard(self, request, pk=None):
        """Assign dashboard to a specific user"""
        user = self.get_object()
        if user.tenant != request.user.tenant:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        dashboard_id = request.data.get('dashboard_id')
        if dashboard_id:
            from dashboards.models import Dashboard
            try:
                dashboard = Dashboard.objects.get(id=dashboard_id, owner__tenant=request.user.tenant)
                user.assigned_dashboard = dashboard
            except Dashboard.DoesNotExist:
                return Response({'error': 'Dashboard not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            user.assigned_dashboard = None
        
        user.save()
        return Response({'status': 'Dashboard assigned', 'dashboard_id': dashboard_id})
    
    @action(detail=True, methods=['post'])
    def update_roles(self, request, pk=None):
        """Update user roles"""
        user = self.get_object()
        if user.tenant != request.user.tenant:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        role_ids = request.data.get('role_ids', [])
        roles = Role.objects.filter(id__in=role_ids, tenant=request.user.tenant)
        user.roles.set(roles)
        
        serializer = self.get_serializer(user)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def change_password(self, request, pk=None):
        """Change or reset a user's password.

        - If the requesting user is the same as the target user, `old_password` is required.
        - If the requester is a system admin or staff within the same tenant, they may reset without `old_password`.
        """
        user = self.get_object()
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_password = serializer.validated_data.get('new_password')
        old_password = serializer.validated_data.get('old_password')

        # Self-change requires old password
        if request.user == user:
            if not old_password:
                return Response({'error': 'old_password is required when changing your own password'}, status=status.HTTP_400_BAD_REQUEST)
            if not user.check_password(old_password):
                return Response({'error': 'old_password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Allow system admins or tenant staff to reset passwords for users in the same tenant
            if not (getattr(request.user, 'is_system_admin', False) or (
                hasattr(request.user, 'tenant') and request.user.tenant and user.tenant and request.user.tenant == user.tenant and request.user.is_staff
            )):
                return Response({'error': 'permission denied'}, status=status.HTTP_403_FORBIDDEN)

        user.set_password(new_password)
        user.save()
        return Response({'status': 'password_changed'})
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get user statistics for the tenant"""
        tenant = request.user.tenant
        users = User.objects.filter(tenant=tenant)
        
        stats = {
            'total_users': users.count(),
            'active_users': users.filter(is_active_user=True).count(),
            'inactive_users': users.filter(is_active_user=False).count(),
            'users_with_dashboards': users.exclude(assigned_dashboard=None).count(),
            'users_by_role': []
        }
        
        # Count users per role
        roles = Role.objects.filter(tenant=tenant).annotate(user_count=Count('users'))
        stats['users_by_role'] = [
            {'role': role.name, 'count': role.user_count}
            for role in roles
        ]
        
        return Response(stats)
