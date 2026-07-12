"""
jobs/permissions.py
"""
from rest_framework import permissions


class IsSystemAdmin(permissions.BasePermission):
    """Staff or system-admin users only — mirrors the _assert_admin check
    used by permissions.views.RolePermissionPolicyViewSet."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and
            (getattr(user, 'is_staff', False) or getattr(user, 'is_system_admin', False))
        )
