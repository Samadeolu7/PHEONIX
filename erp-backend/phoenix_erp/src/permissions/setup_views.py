"""
permissions/setup_views.py

Bulk permission-setup API used by the PermissionsSetupPage in the frontend.

Design
──────
• Module / ModulePage records are created as global (tenant=None, branch=None)
  system records so that the globally-unique url_path constraint on ModulePage
  is never violated across tenants.  RolePermissionPolicy is tenant-scoped via
  the role FK (Role.tenant).

• Syncing is idempotent: running it twice is safe.

Endpoints
─────────
POST /api/permissions/setup/sync/
    Accept the frontend PERMISSION_REGISTRY and get-or-create Module /
    ModulePage DB records.  Call this once before saving policies.

GET  /api/permissions/setup/roles/
    Return all non-wildcard tenant roles with has_policies flag.

GET  /api/permissions/setup/role-policies/{role_id}/
    Current RolePermissionPolicy for a role keyed by "module:page".

PUT  /api/permissions/setup/role-policies/{role_id}/
    Atomically replace all page-level policies for a role.

Access: rank 4+ (Director / Principal) only.
"""
from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from django.db import transaction as db_tx, IntegrityError
from rest_framework import status as http_status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH

logger = logging.getLogger(__name__)

VALID_SCOPES = {'global', 'own_branch', 'assigned_clients', 'ajo_group', 'own_records'}


# ── Auth helper ───────────────────────────────────────────────────────────────

def _check_access(request: Request):
    """Returns (ok, response).  response is not-None when access should be denied."""
    user = request.user
    if not user or not getattr(user, 'is_authenticated', False):
        return False, Response({'detail': 'Authentication required.'},
                               status=http_status.HTTP_401_UNAUTHORIZED)
    try:
        from permissions.services import PermissionResolver
        if PermissionResolver._is_wildcard(user):
            return True, None
        # Require rank 4+ (Director = 4, Principal = 5)
        role_levels = list(user.roles.filter(is_active=True).values_list('level', flat=True))
        rank = max((r or 0) for r in role_levels) if role_levels else 0
        if rank < 4:
            return False, Response({'detail': 'Only Directors or Principals may manage permissions.'},
                                   status=http_status.HTTP_403_FORBIDDEN)
    except Exception:
        pass  # If resolver errors, let it through (fail-open for setup)
    return True, None


# ── Sync endpoint ─────────────────────────────────────────────────────────────

class PermissionSetupSyncView(APIView):
    """
    POST /api/permissions/setup/sync/

    Accepts the frontend PERMISSION_REGISTRY and ensures Module / ModulePage
    DB records exist for every entry.  These records are global (not
    tenant-scoped) so that ModulePage.url_path uniqueness is never violated.
    """

    def post(self, request: Request):
        ok, err = _check_access(request)
        if not ok:
            return err

        modules_data = request.data.get('modules', [])
        if not isinstance(modules_data, list):
            return Response({'detail': 'modules must be a list.'},
                            status=http_status.HTTP_400_BAD_REQUEST)

        from pages.models import Module, ModulePage

        created_modules = 0
        created_pages = 0

        with db_tx.atomic():
            for idx, mod_data in enumerate(modules_data):
                code = (mod_data.get('code') or '').strip()
                if not code:
                    continue

                # Get-or-create a global Module record
                module_obj = Module.objects.filter(code=code, branch=None, tenant=None).first()
                if not module_obj:
                    try:
                        module_obj = Module.objects.create(
                            code=code,
                            name=mod_data.get('name', code.title()),
                            icon=mod_data.get('icon', 'Package'),
                            color=mod_data.get('color', '#6366f1'),
                            description=mod_data.get('description', ''),
                            order=idx,
                            is_active=True,
                            tenant=None,
                            branch=None,
                        )
                        created_modules += 1
                    except IntegrityError:
                        module_obj = Module.objects.filter(code=code, branch=None, tenant=None).first()
                        if not module_obj:
                            logger.warning('Could not create or find Module code=%s', code)
                            continue
                else:
                    # Keep display info up to date
                    changed = False
                    for attr, val in [
                        ('name', mod_data.get('name')),
                        ('icon', mod_data.get('icon')),
                        ('color', mod_data.get('color')),
                    ]:
                        if val and getattr(module_obj, attr) != val:
                            setattr(module_obj, attr, val)
                            changed = True
                    if changed:
                        module_obj.save(update_fields=['name', 'icon', 'color'])

                for pidx, page_data in enumerate(mod_data.get('pages', [])):
                    pcode = (page_data.get('code') or '').strip()
                    if not pcode:
                        continue

                    page_obj = ModulePage.objects.filter(module=module_obj, code=pcode).first()
                    if not page_obj:
                        try:
                            page_obj = ModulePage.objects.create(
                                module=module_obj,
                                code=pcode,
                                title=page_data.get('title', pcode.title()),
                                description=page_data.get('description', ''),
                                page_type='list',
                                order=pidx,
                                is_active=True,
                                tenant=None,
                                branch=None,
                            )
                            created_pages += 1
                        except IntegrityError:
                            # url_path already exists (another tenant's sync ran first)
                            page_obj = ModulePage.objects.filter(module=module_obj, code=pcode).first()
                            if not page_obj:
                                logger.warning(
                                    'Could not create or find ModulePage module=%s code=%s', code, pcode
                                )
                    else:
                        changed = False
                        for attr, val in [
                            ('title', page_data.get('title')),
                            ('description', page_data.get('description', '')),
                        ]:
                            if val is not None and getattr(page_obj, attr) != val:
                                setattr(page_obj, attr, val)
                                changed = True
                        if changed:
                            page_obj.save(update_fields=['title', 'description'])

        return Response({
            'synced': True,
            'created_modules': created_modules,
            'created_pages': created_pages,
        })


# ── Role list ─────────────────────────────────────────────────────────────────

class PermissionSetupRoleListView(APIView):
    """
    GET /api/permissions/setup/roles/

    Returns all active non-wildcard roles for the current tenant, with a
    has_policies flag and the number of configured pages.
    """

    def get(self, request: Request):
        ok, err = _check_access(request)
        if not ok:
            return err

        from users.models import Role

        tenant = request.user.tenant
        roles = (
            Role.objects
            .filter(tenant=tenant, is_active=True)
            .order_by('name')
        )

        # Count configured page-level policies per role
        from django.db.models import Count
        policy_counts = dict(
            RolePermissionPolicy.objects
            .filter(role__tenant=tenant, page__isnull=False)
            .values('role_id')
            .annotate(n=Count('id'))
            .values_list('role_id', 'n')
        )

        result = []
        for role in roles:
            count = policy_counts.get(role.id, 0)
            result.append({
                'id': role.id,
                'name': role.name,
                'description': getattr(role, 'description', '') or '',
                'level': getattr(role, 'level', None),
                'has_policies': count > 0,
                'policy_count': count,
            })

        return Response({'roles': result})


# ── Role policies ─────────────────────────────────────────────────────────────

class PermissionSetupRolePoliciesView(APIView):
    """
    GET  /api/permissions/setup/role-policies/{role_id}/
    PUT  /api/permissions/setup/role-policies/{role_id}/
    """

    def _get_role(self, request, role_id):
        from users.models import Role
        try:
            return Role.objects.get(pk=role_id, tenant=request.user.tenant, is_active=True)
        except Role.DoesNotExist:
            return None

    def get(self, request: Request, role_id: int):
        ok, err = _check_access(request)
        if not ok:
            return err

        role = self._get_role(request, role_id)
        if not role:
            return Response({'detail': 'Role not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        policies = (
            RolePermissionPolicy.objects
            .filter(role=role, page__isnull=False)
            .select_related('module', 'page')
        )

        result: dict = {}
        for policy in policies:
            if not policy.module or not policy.page:
                continue
            key = f'{policy.module.code}:{policy.page.code}'
            result[key] = {
                'can_view':    policy.can_view,
                'can_create':  policy.can_create,
                'can_edit':    policy.can_edit,
                'can_delete':  policy.can_delete,
                'can_approve': policy.can_approve,
                'can_export':  policy.can_export,
                'scope':       policy.scope or SCOPE_OWN_BRANCH,
                'approval_limit': str(policy.approval_limit) if policy.approval_limit is not None else None,
            }

        return Response({
            'role': {'id': role.id, 'name': role.name},
            'policies': result,
        })

    def put(self, request: Request, role_id: int):
        ok, err = _check_access(request)
        if not ok:
            return err

        role = self._get_role(request, role_id)
        if not role:
            return Response({'detail': 'Role not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        policies_data = request.data.get('policies', {})
        if not isinstance(policies_data, dict):
            return Response({'detail': 'policies must be an object.'},
                            status=http_status.HTTP_400_BAD_REQUEST)

        from pages.models import Module, ModulePage

        new_policies = []
        warnings = []

        for key, flags in policies_data.items():
            if ':' not in key:
                warnings.append(f'Invalid key format: {key!r}')
                continue

            module_code, page_code = key.split(':', 1)

            # Look up global Module/ModulePage records (tenant=None)
            module_obj = Module.objects.filter(code=module_code, tenant=None).first()
            if not module_obj:
                warnings.append(
                    f'Module {module_code!r} not found. Run sync first.'
                )
                continue

            page_obj = ModulePage.objects.filter(module=module_obj, code=page_code).first()
            if not page_obj:
                warnings.append(
                    f'Page {page_code!r} in module {module_code!r} not found. Run sync first.'
                )
                continue

            scope = flags.get('scope', SCOPE_OWN_BRANCH)
            if scope not in VALID_SCOPES:
                scope = SCOPE_OWN_BRANCH

            limit_raw = flags.get('approval_limit')
            limit = None
            if limit_raw is not None:
                try:
                    limit = Decimal(str(limit_raw))
                except (InvalidOperation, TypeError):
                    limit = None

            new_policies.append(RolePermissionPolicy(
                role=role,
                module=module_obj,
                page=page_obj,
                action=None,
                can_view=bool(flags.get('can_view', False)),
                can_create=bool(flags.get('can_create', False)),
                can_edit=bool(flags.get('can_edit', False)),
                can_delete=bool(flags.get('can_delete', False)),
                can_approve=bool(flags.get('can_approve', False)),
                can_export=bool(flags.get('can_export', False)),
                scope=scope,
                approval_limit=limit,
                created_by=request.user,
            ))

        # Derive permission codes from the saved policies.
        # Format: {page_code}-{action}  e.g. "clients-view", "loan-accounts-create"
        # These are stored on role.permission_codes so the frontend hasPermission()
        # check can gate navigation cards without a separate Action Permissions save.
        _FLAG_TO_ACTION = {
            'can_view': 'view', 'can_create': 'create', 'can_edit': 'edit',
            'can_delete': 'delete', 'can_approve': 'approve', 'can_export': 'export',
        }
        derived_codes: set[str] = set()
        for key, flags in policies_data.items():
            if ':' not in key:
                continue
            _, page_code = key.split(':', 1)
            for flag, action in _FLAG_TO_ACTION.items():
                if flags.get(flag):
                    derived_codes.add(f'{page_code}-{action}')

        with db_tx.atomic():
            # Atomic replace: delete existing page-level policies then bulk create
            deleted, _ = RolePermissionPolicy.objects.filter(
                role=role, page__isnull=False
            ).delete()
            RolePermissionPolicy.objects.bulk_create(new_policies)
            # Merge derived codes with any manually-added custom codes, then save
            existing = set(role.permission_codes or [])
            # Keep codes that don't follow the derived format (manually added) plus all derived
            non_derived = {c for c in existing if not any(
                c.endswith(f'-{a}') for a in _FLAG_TO_ACTION.values()
            )}
            role.permission_codes = sorted(derived_codes | non_derived)
            role.save(update_fields=['permission_codes'])

        logger.info(
            'Permission policies saved: role=%s (%s) by user=%s — '
            '%d new, %d removed, %d warnings',
            role.id, role.name, request.user.id,
            len(new_policies), deleted, len(warnings),
        )

        return Response({
            'saved': len(new_policies),
            'warnings': warnings or None,
        })
