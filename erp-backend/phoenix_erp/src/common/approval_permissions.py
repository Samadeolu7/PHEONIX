# common/approval_permissions.py
"""
Approval authority helpers shared across all modules.

Uses PermissionResolver as the single source of truth for approval authority.
Falls back to role-name lookup only when the permissions app is unavailable.
"""
from rest_framework.permissions import BasePermission

# Legacy role names kept for migration-period fallback only.
# Prefer PermissionResolver.resolve(...).can_approve for all new code.
APPROVER_ROLES = ('Director', 'Principal')


def can_user_approve(user) -> bool:
    """Return True if *user* has approval authority.

    Checks via PermissionResolver first (scope-aware, policy-driven).
    Falls back to role-name lookup when the permissions app is not yet available.
    """
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True

    # Primary check: PermissionResolver (respects RolePermissionPolicy + UserPermissionOverride)
    try:
        from permissions.services import PermissionResolver
        if PermissionResolver._is_wildcard(user):
            return True
        # Use a generic module/page -- caller-specific checks should use PermissionResolver directly
        effective = PermissionResolver.resolve(user, module=None, page=None, action='approve')
        return effective.can_approve
    except Exception:
        pass

    # Fallback: legacy role-name check (kept for migration period)
    return user.roles.filter(name__in=APPROVER_ROLES, is_active=True).exists()


class IsApprover(BasePermission):
    """DRF permission: user must have approval authority per PermissionResolver.

    Prefer adding explicit PermissionResolver.resolve() calls inside action
    methods over using this class, so module/page context is passed correctly.
    """
    message = 'You do not have approval authority to perform this action.'

    def has_permission(self, request, view):
        return can_user_approve(request.user)
