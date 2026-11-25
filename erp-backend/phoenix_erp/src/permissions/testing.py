"""
Test helper: grant a test user role-based page permissions the way an admin
would in the Permission Setup UI (Module + ModulePage + Role +
RolePermissionPolicy), so API tests exercise real permission checks instead
of bypassing them with an owner/superuser account.
"""
from pages.models import Module, ModulePage
from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH
from users.models import Role

_ALL_FLAGS = ('can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export')


def grant_page_permissions(user, module_code, page_code, *, flags=_ALL_FLAGS,
                           scope=SCOPE_OWN_BRANCH, role_name=None):
    """Give ``user`` a role allowing ``flags`` on module/page, at ``scope``."""
    module, _ = Module.objects.get_or_create(
        owner=None, branch=None, code=module_code,
        defaults={'name': module_code.replace('-', ' ').title(), 'icon': 'Circle',
                  'order': 99, 'is_active': True},
    )
    page, _ = ModulePage.objects.get_or_create(
        module=module, code=page_code,
        defaults={'title': page_code.replace('-', ' ').title(), 'page_type': 'list',
                  'order': 1, 'is_active': True, 'url_path': f'/{module_code}/{page_code}/',
                  'page_config': {}},
    )
    role, _ = Role.objects.get_or_create(
        tenant=user.tenant, name=role_name or f'Test {module_code}',
        defaults={'default_scope': Role.SCOPE_OWN_BRANCH, 'is_active': True},
    )
    RolePermissionPolicy.objects.update_or_create(
        role=role, module=module, page=page,
        defaults={**{f: (f in flags) for f in _ALL_FLAGS}, 'scope': scope},
    )
    user.roles.add(role)
    return role
