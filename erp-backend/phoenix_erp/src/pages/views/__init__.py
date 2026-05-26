# pages/views/__init__.py
# Re-exports all viewsets so that `from .views import ModuleViewSet, ...` keeps working
# now that views/ is a package (system_links_views lives alongside this file).

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Prefetch, Q
from pages.models import Module, ModulePage, QuickAction
from pages.action_models import PageAction, RoleActionPermission
from pages.serializers import (
    ModuleSerializer, ModulePageSerializer, QuickActionSerializer,
    PageActionSerializer, RoleActionPermissionSerializer, RolePermissionMatrixSerializer
)
from users.models import Role

class ModuleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for modules - provides navigation structure
    """
    serializer_class = ModuleSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'code'
    queryset = Module.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return Module.objects.none()
        
        user = self.request.user
        
        # Base queryset - filter by user (owner field is FK to User, not Tenant)
        queryset = Module.objects.filter(
            owner=user,
            is_active=True,
            is_deleted=False
        )
        
        # If user has a branch, filter by branch as well
        if user.branch:
            queryset = queryset.filter(branch=user.branch)
        else:
            # If no branch, get modules with no branch requirement
            queryset = queryset.filter(branch__isnull=True)
        
        return queryset.prefetch_related(
            Prefetch(
                'pages',
                queryset=ModulePage.objects.filter(
                    is_active=True,
                    is_deleted=False
                ).order_by('order')
            )
        ).order_by('order')
    
    @action(detail=False, methods=['get'])
    def navigation(self, request):
        """
        Get complete navigation structure with all modules and pages
        """
        modules = self.get_queryset()
        
        # Filter based on user permissions
        accessible_modules = []
        for module in modules:
            if module.user_can_access(request.user):
                # Filter pages by permission and visibility
                accessible_pages = [
                    page for page in module.pages.all()
                    if page.user_can_access(request.user) and page.show_in_menu
                ]
                
                module_data = {
                    'id': module.id,
                    'code': module.code,
                    'name': module.name,
                    'description': module.description,
                    'icon': module.icon,
                    'color': module.color,
                    'order': module.order,
                    'pages': [
                        {
                            'id': page.id,
                            'code': page.code,
                            'title': page.title,
                            'description': page.description,
                            'icon': page.icon or module.icon,
                            'page_type': page.page_type,
                            'url_path': page.url_path,
                            'show_in_menu': page.show_in_menu,
                            'order': page.order,
                        }
                        for page in accessible_pages
                    ]
                }
                
                accessible_modules.append(module_data)
        
        return Response({
            'success': True,
            'data': accessible_modules
        })


class ModulePageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for module pages
    """
    serializer_class = ModulePageSerializer
    permission_classes = [IsAuthenticated]
    queryset = ModulePage.objects.none()  # For schema generation
    
    def get_queryset(self):
        # Protect against schema generation with AnonymousUser
        if getattr(self, 'swagger_fake_view', False):
            return ModulePage.objects.none()
        
        user = self.request.user
        
        queryset = ModulePage.objects.filter(
            owner=user,
            is_active=True,
            is_deleted=False
        )
        
        if user.branch:
            queryset = queryset.filter(branch=user.branch)
        else:
            queryset = queryset.filter(branch__isnull=True)
        
        return queryset.select_related('module')
    
    @action(detail=False, methods=['get'], url_path='by-path')
    def by_path(self, request):
        """
        Get page configuration by URL path
        """
        path = request.query_params.get('path')
        if not path:
            return Response(
                {'error': 'path parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not path.startswith('/'):
            path = f'/{path}'
        if not path.endswith('/'):
            path = f'{path}/'
        
        try:
            page = self.get_queryset().get(url_path=path)
            
            if not page.user_can_access(request.user):
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            serializer = self.get_serializer(page)
            return Response({
                'success': True,
                'data': serializer.data
            })
        except ModulePage.DoesNotExist:
            return Response(
                {'error': f'Page not found: {path}'},
                status=status.HTTP_404_NOT_FOUND
            )


class PageActionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing page actions
    """
    serializer_class = PageActionSerializer
    permission_classes = [IsAuthenticated]
    queryset = PageAction.objects.none()
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PageAction.objects.none()
        
        user = self.request.user
        
        queryset = PageAction.objects.filter(
            owner=user,
            is_active=True,
            is_deleted=False
        ).select_related('module', 'page')
        
        module_code = self.request.query_params.get('module')
        if module_code:
            queryset = queryset.filter(module__code=module_code)
        
        page_id = self.request.query_params.get('page')
        if page_id:
            queryset = queryset.filter(page_id=page_id)
        
        return queryset.order_by('module__order', 'order')
    
    @action(detail=False, methods=['get'])
    def by_module(self, request):
        """
        Get all actions grouped by module
        """
        actions = self.get_queryset()
        
        grouped = {}
        for action in actions:
            module_code = action.module.code
            if module_code not in grouped:
                grouped[module_code] = []
            grouped[module_code].append(PageActionSerializer(action).data)
        
        return Response({
            'success': True,
            'data': grouped
        })


class RoleActionPermissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing role action permissions
    """
    serializer_class = RoleActionPermissionSerializer
    permission_classes = [IsAuthenticated]
    queryset = RoleActionPermission.objects.none()
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return RoleActionPermission.objects.none()
        
        user = self.request.user
        
        queryset = RoleActionPermission.objects.filter(
            role__tenant=user.tenant,
            is_active=True
        ).select_related('role', 'action', 'action__module', 'action__page')
        
        role_id = self.request.query_params.get('role')
        if role_id:
            queryset = queryset.filter(role_id=role_id)
        
        module_code = self.request.query_params.get('module')
        if module_code:
            queryset = queryset.filter(action__module__code=module_code)
        
        return queryset.order_by('role__name', 'action__module__order', 'action__order')
    
    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(granted_by=self.request.user)
    
    @action(detail=False, methods=['get'])
    def matrix(self, request):
        """
        Get permission matrix showing all roles vs all actions
        """
        user = request.user
        
        modules = Module.objects.filter(
            owner=user,
            is_active=True,
            is_deleted=False
        ).prefetch_related(
            Prefetch(
                'actions',
                queryset=PageAction.objects.filter(
                    is_active=True,
                    is_deleted=False
                ).order_by('page__title', 'order')
            )
        ).order_by('order')
        
        roles = Role.objects.filter(
            tenant=user.tenant,
            is_active=True
        ).order_by('name')
        
        permissions_qs = RoleActionPermission.objects.filter(
            role__tenant=user.tenant,
            is_active=True
        ).select_related('role', 'action')
        
        permissions_lookup = {}
        for perm in permissions_qs:
            key = f"{perm.role_id}-{perm.action_id}"
            permissions_lookup[key] = {
                'id': perm.id,
                'permission_level': perm.permission_level,
                'can_view': perm.can_view,
                'can_create': perm.can_create,
                'can_edit': perm.can_edit,
                'can_delete': perm.can_delete,
                'can_approve': perm.can_approve,
                'can_export': perm.can_export,
            }
        
        modules_data = []
        for module in modules:
            pages_dict = {}
            
            for action in module.actions.all():
                page_key = action.page_id if action.page_id else 'module_level'
                page_title = action.page.title if action.page else module.name
                
                if page_key not in pages_dict:
                    pages_dict[page_key] = {
                        'id': action.page_id,
                        'title': page_title,
                        'actions': []
                    }
                
                pages_dict[page_key]['actions'].append({
                    'id': action.id,
                    'code': action.code,
                    'name': action.name,
                    'action_type': action.action_type,
                    'icon': action.icon,
                    'color': action.color,
                })
            
            modules_data.append({
                'id': module.id,
                'code': module.code,
                'name': module.name,
                'icon': module.icon,
                'color': module.color,
                'pages': list(pages_dict.values())
            })
        
        roles_data = [
            {
                'id': role.id,
                'name': role.name,
                'description': role.description,
            }
            for role in roles
        ]
        
        return Response({
            'success': True,
            'data': {
                'modules': modules_data,
                'roles': roles_data,
                'permissions': permissions_lookup,
            }
        })
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """
        Bulk update permissions for multiple role-action pairs
        """
        updates = request.data.get('updates', [])
        
        if not updates:
            return Response(
                {'error': 'No updates provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created_count = 0
        updated_count = 0
        
        for update_data in updates:
            role_id = update_data.get('role_id')
            action_id = update_data.get('action_id')
            
            if not role_id or not action_id:
                continue
            
            permission, created = RoleActionPermission.objects.get_or_create(
                role_id=role_id,
                action_id=action_id,
                defaults={
                    'granted_by': request.user,
                    'is_active': True,
                }
            )
            
            for field in ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export']:
                if field in update_data:
                    setattr(permission, field, update_data[field])
            
            if 'permission_level' in update_data:
                permission.permission_level = update_data['permission_level']
            
            permission.granted_by = request.user
            permission.save()
            
            if created:
                created_count += 1
            else:
                updated_count += 1
        
        return Response({
            'success': True,
            'message': f'Updated {updated_count} permissions, created {created_count} new permissions',
            'created': created_count,
            'updated': updated_count,
        })
    
    @action(detail=False, methods=['get'], url_path='by-role/(?P<role_id>[^/.]+)')
    def by_role(self, request, role_id=None):
        """
        Get all permissions for a specific role
        """
        permissions = self.get_queryset().filter(role_id=role_id)
        serializer = self.get_serializer(permissions, many=True)
        
        return Response({
            'success': True,
            'data': serializer.data
        })
