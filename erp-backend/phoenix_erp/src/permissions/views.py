"""
permissions/views.py

ViewSets and APIViews for the fine-grained permission system.

Endpoints
─────────
POST/GET/PUT/PATCH/DELETE /api/permissions/role-policies/
POST/GET/PUT/PATCH/DELETE /api/permissions/user-overrides/
GET                        /api/permissions/effective/          ?user=<id>[&module=&page=&action=]
GET                        /api/permissions/exception-report/   (all elevated active overrides)
GET                        /api/permissions/elevation-log/      ?user=&record_type=&from=&to=
"""

from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, permissions as drf_permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from permissions.models import (
    RolePermissionPolicy, UserPermissionOverride, PermissionElevationLog,
)
from permissions.serializers import (
    RolePermissionPolicySerializer,
    UserPermissionOverrideSerializer,
    PermissionElevationLogSerializer,
    EffectivePermissionsSerializer,
)
from permissions.services import PermissionResolver


# ── Mixin: tenant scoping ─────────────────────────────────────────────────────

class TenantScopedMixin:
    """Limits querysets to the requesting user's tenant."""

    def get_tenant(self):
        return getattr(self.request.user, 'tenant', None)

    def perform_create(self, serializer):
        serializer.save()


# ── RolePermissionPolicy CRUD ─────────────────────────────────────────────────

class RolePermissionPolicyViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """
    CRUD for role-level permission policies.
    Scoped to the requesting user's tenant (via the role FK).
    """
    permission_module = 'permissions'
    permission_page = 'role-permission-policies'
    serializer_class = RolePermissionPolicySerializer
    permission_classes = [drf_permissions.IsAuthenticated]

    def get_queryset(self):
        tenant = self.get_tenant()
        qs = RolePermissionPolicy.objects.select_related(
            'role', 'module', 'page', 'action', 'created_by',
        )
        if tenant:
            qs = qs.filter(role__tenant=tenant)

        role_id = self.request.query_params.get('role')
        if role_id:
            qs = qs.filter(role_id=role_id)

        module_id = self.request.query_params.get('module')
        if module_id:
            qs = qs.filter(module_id=module_id)

        return qs.order_by('role__name', 'module__name', 'page__title', 'action__name')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _assert_admin(self):
        """Policies can only be created/modified by staff or owners."""
        user = self.request.user
        if not (getattr(user, 'is_staff', False) or getattr(user, 'is_system_admin', False)):
            raise PermissionDenied('Only staff users may modify role permission policies.')

    def create(self, request, *args, **kwargs):
        self._assert_admin()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._assert_admin()
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._assert_admin()
        return super().destroy(request, *args, **kwargs)


# ── UserPermissionOverride CRUD ───────────────────────────────────────────────

class UserPermissionOverrideViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """
    CRUD for user-level permission overrides.

    Key rules
    ─────────
    • A granter may not create an override that exceeds their own permissions.
    • ?elevated_only=true   → only elevated overrides
    • ?user=<id>            → only overrides for that user
    • ?active_only=true     → only currently active, non-expired overrides
    """
    permission_module = 'permissions'
    permission_page = 'user-permission-overrides'
    serializer_class = UserPermissionOverrideSerializer
    permission_classes = [drf_permissions.IsAuthenticated]

    def get_queryset(self):
        tenant = self.get_tenant()
        qs = UserPermissionOverride.objects.select_related(
            'user', 'module', 'page', 'action',
            'scope_ajo_group', 'granted_by', 'revoked_by',
        )
        if tenant:
            qs = qs.filter(user__tenant=tenant)

        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)

        if self.request.query_params.get('elevated_only', '').lower() == 'true':
            qs = qs.filter(is_elevated=True)

        if self.request.query_params.get('active_only', '').lower() == 'true':
            now = timezone.now()
            qs = qs.filter(is_active=True, is_suspended=False).filter(
                Q(expiry_type='permanent')
                | Q(expiry_type='duration')   # evaluated in Python via is_expired
                | Q(expiry_type__in=['date', 'datetime'], expires_at__gt=now)
            )

        return qs.order_by('-granted_at')

    def perform_create(self, serializer):
        granter = self.request.user
        serializer.save(granted_by=granter)

    def create(self, request, *args, **kwargs):
        """
        Before creating, check the delegation constraint:
        granter may not confer permissions they themselves don't have.
        """
        self._check_delegation_allowed(request)
        return super().create(request, *args, **kwargs)

    def _check_delegation_allowed(self, request):
        """
        Validate that the granting user holds (or exceeds) every permission
        they are about to confer.
        """
        data = request.data
        granter = request.user

        # Only staff / admins may grant overrides
        if not (
            getattr(granter, 'is_staff', False)
            or getattr(granter, 'is_system_admin', False)
            or granter.has_action_permission('permissions-grant-override')
        ):
            raise PermissionDenied('You do not have permission to grant user overrides.')

        # Wildcard users (owners/system-admins) can grant anything
        if PermissionResolver._is_wildcard(granter):
            return

        # Resolve granter's own effective permissions on the target
        module  = data.get('module')
        page    = data.get('page')
        action  = data.get('action')
        granter_eff = PermissionResolver.resolve(
            granter,
            module=module, page=page, action=action,
        )

        from permissions.models import SCOPE_RANK
        from decimal import Decimal

        # Check each flag the override would set to True
        for flag in ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export']:
            if data.get(flag) is True and not getattr(granter_eff, flag):
                raise PermissionDenied(
                    f'You cannot grant "{flag}" — you do not hold that permission yourself.'
                )

        # Check scope
        requested_scope = data.get('scope')
        if requested_scope:
            req_rank = SCOPE_RANK.get(requested_scope, 0)
            my_rank  = SCOPE_RANK.get(granter_eff.scope, 0)
            if req_rank > my_rank:
                raise PermissionDenied(
                    f'You cannot grant scope "{requested_scope}" — '
                    f'your own scope is "{granter_eff.scope}".'
                )

        # Check approval limit
        requested_limit_str = data.get('approval_limit')
        if requested_limit_str is not None:
            try:
                requested_limit = Decimal(str(requested_limit_str))
            except Exception:
                raise ValidationError({'approval_limit': 'Invalid decimal value.'})

            if granter_eff.approval_limit is not None and requested_limit > granter_eff.approval_limit:
                raise PermissionDenied(
                    f'You cannot grant an approval limit of {requested_limit}. '
                    f'Your own limit is {granter_eff.approval_limit}.'
                )

    @action(detail=True, methods=['post'], url_path='revoke')
    def revoke(self, request, pk=None):
        """Revoke an override — sets is_active=False and records who/why."""
        override = self.get_object()
        if not override.is_active:
            return Response({'detail': 'Override is already inactive.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '')
        override.is_active     = False
        override.revoked_at    = timezone.now()
        override.revoked_by    = request.user
        override.revoke_reason = reason
        override.save()
        return Response(UserPermissionOverrideSerializer(override).data)

    @action(detail=True, methods=['post'], url_path='suspend')
    def suspend(self, request, pk=None):
        """Suspend an override without revoking — admin must re-activate manually."""
        override = self.get_object()
        override.is_suspended = True
        override.save(update_fields=['is_suspended', 'is_elevated'])
        return Response(UserPermissionOverrideSerializer(override).data)

    @action(detail=True, methods=['post'], url_path='reinstate')
    def reinstate(self, request, pk=None):
        """Re-activate a suspended override."""
        override = self.get_object()
        if not override.is_active:
            return Response(
                {'detail': 'Cannot reinstate a revoked override.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        override.is_suspended = False
        override.save(update_fields=['is_suspended', 'is_elevated'])
        return Response(UserPermissionOverrideSerializer(override).data)


# ── Effective permissions resolver ────────────────────────────────────────────

class EffectivePermissionsView(APIView):
    """
    GET /api/permissions/effective/?user=<id>[&module=<id>][&page=<id>][&action=<id>]

    Returns the fully-resolved permission set for a user on a given target.
    Admins may query any user; non-admins can only query themselves.
    """
    permission_classes = [drf_permissions.IsAuthenticated]

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_id = request.query_params.get('user')
        if user_id:
            try:
                target_user = User.objects.get(pk=user_id, tenant=request.user.tenant)
            except User.DoesNotExist:
                return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
            # Only admins may query other users
            if target_user != request.user and not (
                getattr(request.user, 'is_staff', False)
                or getattr(request.user, 'is_system_admin', False)
            ):
                raise PermissionDenied('You may only query your own effective permissions.')
        else:
            target_user = request.user

        # Optional target context
        module  = request.query_params.get('module')
        page    = request.query_params.get('page')
        action  = request.query_params.get('action')

        eff = PermissionResolver.resolve(target_user, module=module, page=page, action=action)
        return Response(EffectivePermissionsSerializer(eff).data)


class BulkEffectivePermissionsView(APIView):
    """
    GET /api/permissions/matrix/

    Returns the requesting user's effective permission for EVERY module:page
    pair at once (see PermissionResolver.resolve_bulk_matrix), so the frontend
    can derive route access and nav visibility from one payload instead of
    maintaining separate hardcoded per-role nav allowlists. Always resolves
    the caller's own account — no `user` query param, unlike
    EffectivePermissionsView, since this is meant for frontend hydration on
    login/refresh, not admin inspection of other users.
    """
    permission_classes = [drf_permissions.IsAuthenticated]

    def get(self, request):
        matrix = PermissionResolver.resolve_bulk_matrix(request.user)
        return Response(matrix)


# ── Exception report ──────────────────────────────────────────────────────────

class PermissionExceptionReportView(APIView):
    """
    GET /api/permissions/exception-report/

    Returns all currently elevated and active overrides across the tenant.
    Admins / Auditors only.
    """
    permission_classes = [drf_permissions.IsAuthenticated]

    def get(self, request):
        if not (
            getattr(request.user, 'is_staff', False)
            or getattr(request.user, 'is_system_admin', False)
            or request.user.has_action_permission('permissions-view-exceptions')
        ):
            raise PermissionDenied('You do not have access to the exception report.')

        tenant = getattr(request.user, 'tenant', None)
        now    = timezone.now()
        qs = UserPermissionOverride.objects.filter(
            is_elevated=True,
            is_active=True,
            is_suspended=False,
        )
        if tenant:
            qs = qs.filter(user__tenant=tenant)

        # Exclude datetime/date-based expired entries in SQL; duration-based evaluated in Python
        qs = qs.filter(
            Q(expiry_type='permanent')
            | Q(expiry_type='duration')
            | Q(expiry_type__in=['date', 'datetime'], expires_at__gt=now)
        )

        user_id = request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)

        expiry_before = request.query_params.get('expiry_before')
        if expiry_before:
            try:
                from dateutil.parser import parse
                qs = qs.filter(expires_at__lte=parse(expiry_before))
            except Exception:
                pass

        qs = qs.select_related('user', 'module', 'page', 'action', 'granted_by').order_by('-granted_at')

        # Final Python-side filter for duration-based expiries
        results = [o for o in qs if not o.is_expired]

        return Response(UserPermissionOverrideSerializer(results, many=True).data)


# ── Elevation log ─────────────────────────────────────────────────────────────

class PermissionElevationLogView(APIView):
    """
    GET /api/permissions/elevation-log/?user=&record_type=&from=&to=

    Read-only audit log of actions performed under elevated permissions.
    """
    permission_classes = [drf_permissions.IsAuthenticated]

    def get(self, request):
        if not (
            getattr(request.user, 'is_staff', False)
            or getattr(request.user, 'is_system_admin', False)
            or request.user.has_action_permission('permissions-view-elevation-log')
        ):
            raise PermissionDenied('You do not have access to the elevation log.')

        tenant = getattr(request.user, 'tenant', None)
        qs = PermissionElevationLog.objects.select_related('user', 'override', 'branch')
        if tenant:
            qs = qs.filter(user__tenant=tenant)

        user_id = request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)

        record_type = request.query_params.get('record_type')
        if record_type:
            qs = qs.filter(record_type=record_type)

        from_dt = request.query_params.get('from')
        to_dt   = request.query_params.get('to')
        if from_dt:
            from dateutil.parser import parse
            qs = qs.filter(logged_at__gte=parse(from_dt))
        if to_dt:
            from dateutil.parser import parse
            qs = qs.filter(logged_at__lte=parse(to_dt))

        qs = qs.order_by('-logged_at')[:500]  # cap for safety
        return Response(PermissionElevationLogSerializer(qs, many=True).data)
