"""
permissions/permission_classes.py

Reusable DRF permission classes that enforce the fine-grained
permission system at the action level.

Usage
─────
Add HasActionPermission to any ViewSet's permission_classes list,
and optionally set class-level hints so the resolver knows which
page/module/action to check:

    class LoanAccountViewSet(ScopedModelViewSet):
        permission_module = 'loans'     # maps to pages.Module.code
        permission_page   = 'loan-accounts'  # maps to pages.ModulePage.code

For custom @action methods that represent financial approvals, also
set a method-level hint via the view's kwargs or override
``get_permission_action_code()``:

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        # HasActionPermission will detect action_name='approve'
        # and check can_approve + approval_limit automatically.
        ...
"""
import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

logger = logging.getLogger(__name__)

# Map HTTP verb + DRF action name → permission flag
_METHOD_FLAG: dict[str, str] = {
    'GET':    'can_view',
    'HEAD':   'can_view',
    'OPTIONS': 'can_view',
    'POST':   'can_create',
    'PUT':    'can_edit',
    'PATCH':  'can_edit',
    'DELETE': 'can_delete',
}

# Custom @action names that require can_approve instead of the HTTP-method default
_APPROVE_ACTIONS = frozenset({
    'approve', 'reject', 'authorize', 'confirm', 'disburse',
    'process', 'verify', 'validate', 'activate', 'deactivate',
})

# Field names that carry the transaction amount (tried in order)
_AMOUNT_FIELDS = ('amount', 'loan_amount', 'principal', 'disbursement_amount', 'total')


class HasActionPermission(BasePermission):
    """
    Action-level DRF permission class backed by PermissionResolver.

    Resolution order:
        1. Wildcard users (system admin / tenant owner) → always allowed.
        2. Look up the effective permission for (user, module, page) via
           PermissionResolver.
        3. Map the current HTTP method / DRF action to a flag
           (can_view / can_create / can_edit / can_delete / can_approve /
            can_export).
        4. For approval actions also check approval_limit against the
           request body amount.

    Non-blocking: if the PermissionResolver itself raises any exception
    (e.g. during schema generation or if the permissions app is not yet
    migrated), the check falls back to True so it never breaks existing
    behaviour.  Log the exception at WARNING level so ops can spot it.
    """

    message = 'You do not have permission to perform this action.'

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _get_module_code(view) -> Optional[str]:
        return getattr(view, 'permission_module', None)

    @staticmethod
    def _get_page_code(view) -> Optional[str]:
        return getattr(view, 'permission_page', None)

    @staticmethod
    def _get_action_code(view) -> Optional[str]:
        """Return the DRF action name (list, create, retrieve, update, destroy,
        or custom @action name)."""
        return getattr(view, 'action', None)

    @staticmethod
    def _resolve_flag(method: str, action_name: Optional[str]) -> str:
        """Return the permission flag name to check."""
        if action_name and action_name.lower() in _APPROVE_ACTIONS:
            return 'can_approve'
        if action_name == 'export':
            return 'can_export'
        return _METHOD_FLAG.get(method.upper(), 'can_view')

    @staticmethod
    def _get_request_amount(request: Request) -> Optional[Decimal]:
        """Try to extract a monetary amount from the request body."""
        data = getattr(request, 'data', {}) or {}
        for field in _AMOUNT_FIELDS:
            val = data.get(field)
            if val is not None:
                try:
                    return Decimal(str(val))
                except InvalidOperation:
                    continue
        return None

    # ── Main check ────────────────────────────────────────────────────────────

    def has_permission(self, request: Request, view) -> bool:
        user = getattr(request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return False

        # Avoid breaking schema generation
        if getattr(view, 'swagger_fake_view', False):
            return True

        module_code = self._get_module_code(view)
        page_code   = self._get_page_code(view)
        action_name = self._get_action_code(view)
        flag        = self._resolve_flag(request.method, action_name)

        try:
            from permissions.services import PermissionResolver

            # Wildcard users bypass all fine-grained checks
            if PermissionResolver._is_wildcard(user):
                return True

            effective = PermissionResolver.resolve(
                user,
                module=module_code,
                page=page_code,
                action=action_name,
            )

            # Check the primary flag
            if not getattr(effective, flag.replace('can_', ''), False):
                # Map attribute name back: effective stores as .can_approve etc
                if not getattr(effective, flag, True):
                    self.message = f'You do not have {flag} permission for this resource.'
                    return False

            # For approvals, also check amount limit
            if flag == 'can_approve' and effective.approval_limit is not None:
                amount = self._get_request_amount(request)
                if amount is not None:
                    limit = Decimal(str(effective.approval_limit))
                    if amount > limit:
                        self.message = (
                            f'Amount {amount} exceeds your approval limit of {limit}.'
                        )
                        return False

            return True

        except Exception as exc:
            logger.error(
                'HasActionPermission: resolver error for user=%s action=%s — '
                'denying access. Error: %s',
                getattr(user, 'id', '?'), action_name, exc,
            )
            self.message = 'Permission check failed. Please contact your administrator.'
            return False

    def has_object_permission(self, request: Request, view, obj) -> bool:
        # Object-level: re-use has_permission (scope filtering is handled by
        # ScopedModelViewSet.get_queryset, not here).
        return self.has_permission(request, view)
