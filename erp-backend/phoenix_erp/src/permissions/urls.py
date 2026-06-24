"""
permissions/urls.py
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from permissions.views import (
    RolePermissionPolicyViewSet,
    UserPermissionOverrideViewSet,
    EffectivePermissionsView,
    PermissionExceptionReportView,
    PermissionElevationLogView,
)
from permissions.setup_views import (
    PermissionSetupSyncView,
    PermissionSetupRoleListView,
    PermissionSetupRolePoliciesView,
)

router = DefaultRouter()
router.register(r'role-policies',   RolePermissionPolicyViewSet,   basename='role-policy')
router.register(r'user-overrides',  UserPermissionOverrideViewSet, basename='user-override')

urlpatterns = [
    path('', include(router.urls)),
    path('effective/',        EffectivePermissionsView.as_view(),     name='permissions-effective'),
    path('exception-report/', PermissionExceptionReportView.as_view(), name='permissions-exception-report'),
    path('elevation-log/',    PermissionElevationLogView.as_view(),    name='permissions-elevation-log'),
    # Permission setup UI endpoints
    path('setup/sync/',                        PermissionSetupSyncView.as_view(),        name='permissions-setup-sync'),
    path('setup/roles/',                       PermissionSetupRoleListView.as_view(),    name='permissions-setup-roles'),
    path('setup/role-policies/<int:role_id>/', PermissionSetupRolePoliciesView.as_view(), name='permissions-setup-role-policies'),
]
