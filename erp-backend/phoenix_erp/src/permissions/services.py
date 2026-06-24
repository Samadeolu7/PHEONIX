"""
permissions/services.py

PermissionResolver — single source of truth for computing a user's effective
permissions at runtime.

Resolution algorithm
────────────────────
1. Owner / system-admin → wildcard '*' (all permissions, global scope, no limit)
2. Collect RolePermissionPolicy entries for the user's active roles.
   For a given (module, page, action) target the most-specific policy wins
   (specificity: action > page > module).
3. Merge the winning policy flags → role baseline.
4. Collect active, non-expired UserPermissionOverride entries.
   Apply flag overrides (True/False) on top of the baseline.
   Apply scope override (if set).
   Apply approval_limit override (if set — user limit wins if it differs from role).
5. Return an EffectivePermission dataclass.

The resolver also provides `override_exceeds_role()` to determine whether a
given UserPermissionOverride grants MORE than the user's role alone would allow.
This powers the `is_elevated` flag on the override.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional, Dict, Any

from django.db import transaction as db_tx
from permissions.models import (
    RolePermissionPolicy, UserPermissionOverride,
    SCOPE_GLOBAL, SCOPE_OWN_BRANCH, SCOPE_RANK,
)


@dataclass
class EffectivePermission:
    """The resolved permission set for a user on a given context."""
    can_view:    bool = False
    can_create:  bool = False
    can_edit:    bool = False
    can_delete:  bool = False
    can_approve: bool = False
    can_export:  bool = False

    scope:          str = SCOPE_OWN_BRANCH
    scope_ajo_group_id: Optional[int] = None
    approval_limit: Optional[Decimal] = None   # None = unlimited

    is_elevated: bool = False   # True if any flag/scope/limit exceeds the role baseline
    elevated_fields: list = field(default_factory=list)  # which specific dimensions are elevated

    def as_dict(self) -> Dict[str, Any]:
        return {
            'can_view':     self.can_view,
            'can_create':   self.can_create,
            'can_edit':     self.can_edit,
            'can_delete':   self.can_delete,
            'can_approve':  self.can_approve,
            'can_export':   self.can_export,
            'scope':        self.scope,
            'scope_ajo_group_id': self.scope_ajo_group_id,
            'approval_limit': str(self.approval_limit) if self.approval_limit is not None else None,
            'is_elevated':  self.is_elevated,
            'elevated_fields': self.elevated_fields,
        }


FLAG_NAMES = ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export']


class PermissionResolver:
    """
    Stateless helper that computes the effective permission for a user.
    All methods are class-methods for convenience (no need to instantiate).
    """

    # ── Public API ────────────────────────────────────────────────────────────

    @classmethod
    def resolve(
        cls,
        user,
        *,
        module=None,
        page=None,
        action=None,
    ) -> EffectivePermission:
        """
        Compute the fully-resolved EffectivePermission for `user` on the given
        module / page / action target.
        """
        # --- Wildcard principals ---
        if cls._is_wildcard(user):
            return cls._wildcard()

        # --- Role baseline ---
        baseline = cls._resolve_role_baseline(user, module=module, page=page, action=action)

        # --- User overrides ---
        effective = cls._apply_user_overrides(user, baseline, module=module, page=page, action=action)

        return effective

    @classmethod
    def get_all_permission_codes(cls, user) -> list[str]:
        """
        Return the flat list of permission codes (e.g. ['loan-approve', 'pr-list'])
        for the user.  Used by the API serializer to populate `action_permissions`.

        This bridges the new system with the existing frontend that reads a flat
        list of string codes from the login response.

        Sources (in priority order):
          1. RolePermissionPolicy action codes (new system — primary source)
          2. role.permission_codes JSONField (legacy fallback — only for roles
             that have no RolePermissionPolicy records yet; prevents divergence)
          3. UserPermissionOverride action codes
        """
        if cls._is_wildcard(user):
            return ['*']

        codes: set[str] = set()

        # --- 1. RolePermissionPolicy (new system) ---
        # Each try block is wrapped in a savepoint so a DB error (e.g. table not
        # yet migrated) only rolls back that savepoint and leaves the request
        # transaction alive. Without the savepoint, a ProgrammingError here would
        # abort the entire PostgreSQL transaction and break every subsequent query.
        try:
            with db_tx.atomic():
                from permissions.models import RolePermissionPolicy
                role_ids = list(user.roles.filter(is_active=True).values_list('id', flat=True))
                for policy in (
                    RolePermissionPolicy.objects
                    .filter(role_id__in=role_ids, action__isnull=False)
                    .select_related('action')
                ):
                    if not policy.action or not policy.action.code:
                        continue
                    if any([
                        policy.can_view, policy.can_create, policy.can_edit,
                        policy.can_delete, policy.can_approve, policy.can_export,
                    ]):
                        codes.add(policy.action.code)
        except Exception:
            pass  # Permissions app may not be available during early migrations

        # --- 2. Legacy fallback: only for roles with no RolePermissionPolicy records ---
        try:
            with db_tx.atomic():
                from permissions.models import RolePermissionPolicy as _RolePermissionPolicy
                policy_role_ids = set(
                    _RolePermissionPolicy.objects
                    .filter(role_id__in=role_ids)
                    .values_list('role_id', flat=True)
                    .distinct()
                )
        except Exception:
            policy_role_ids = set()

        for role in user.roles.filter(is_active=True):
            if role.pk not in policy_role_ids and isinstance(role.permission_codes, list):
                codes.update(role.permission_codes)

        # --- 3. Active user overrides that explicitly enable a flag ---
        try:
            with db_tx.atomic():
                for override in cls._active_overrides(user):
                    if override.action and override.action.code:
                        if any([
                            override.can_view, override.can_create, override.can_edit,
                            override.can_delete, override.can_approve, override.can_export,
                        ]):
                            codes.add(override.action.code)
        except Exception:
            pass

        # Remove codes where role has excluded_permission_codes
        excluded: set[str] = set()
        try:
            with db_tx.atomic():
                for role in user.roles.filter(is_active=True):
                    if isinstance(role.excluded_permission_codes, list):
                        excluded.update(role.excluded_permission_codes)
        except Exception:
            pass
        codes -= excluded

        return sorted(codes)

    @classmethod
    def override_exceeds_role(cls, override: UserPermissionOverride) -> bool:
        """
        Return True if the override grants more than what the user's roles
        allow on the same target.  Used to compute `is_elevated`.

        'More' means:
        - A flag is True in the override AND False in the role baseline, OR
        - The scope is broader (higher SCOPE_RANK) than the role's scope, OR
        - The approval_limit is higher than the role's limit (or is None=unlimited
          while the role has a finite limit).
        """
        user = override.user
        if cls._is_wildcard(user):
            return False  # wildcard users can never be "elevated" — they already have everything

        baseline = cls._resolve_role_baseline(
            user,
            module=override.module,
            page=override.page,
            action=override.action,
        )

        # Check permission flags
        for flag in FLAG_NAMES:
            override_val = getattr(override, flag)
            if override_val is True and not getattr(baseline, flag):
                return True

        # Check scope
        if override.scope is not None:
            override_rank = SCOPE_RANK.get(override.scope, 0)
            baseline_rank = SCOPE_RANK.get(baseline.scope, 0)
            if override_rank > baseline_rank:
                return True

        # Check approval limit (None = unlimited → higher than any finite limit)
        if override.approval_limit is not None or baseline.approval_limit is not None:
            if override.approval_limit is None and baseline.approval_limit is not None:
                # Override is unlimited while role has a cap → elevated
                return True
            if (
                override.approval_limit is not None
                and baseline.approval_limit is not None
                and override.approval_limit > baseline.approval_limit
            ):
                return True

        return False

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _is_wildcard(user) -> bool:
        if getattr(user, 'is_system_admin', False):
            return True
        if callable(getattr(user, 'is_owner', None)) and user.is_owner():
            return True
        # Roles seeded with permission_codes=["*"] (Director, Admin, Operations)
        # bypass fine-grained checks — they have full access by design.
        try:
            return user.roles.filter(
                is_active=True, permission_codes__contains=['*']
            ).exists()
        except Exception:
            pass
        return False

    @staticmethod
    def _wildcard() -> EffectivePermission:
        return EffectivePermission(
            can_view=True, can_create=True, can_edit=True,
            can_delete=True, can_approve=True, can_export=True,
            scope=SCOPE_GLOBAL,
            approval_limit=None,  # unlimited
            is_elevated=False,
        )

    @classmethod
    def _legacy_mode_baseline(cls, user) -> EffectivePermission:
        """
        Called when a role has NO RolePermissionPolicy entries at all, meaning
        the fine-grained permission system hasn't been configured for this role.
        Fall back to the pre-policy behaviour: allow view/create/edit/delete,
        block approve/export (those require explicit grants), use own_branch scope.
        """
        return EffectivePermission(
            can_view=True,
            can_create=True,
            can_edit=True,
            can_delete=True,
            can_approve=False,
            can_export=False,
            scope=SCOPE_OWN_BRANCH,
            approval_limit=Decimal('0'),
        )

    @classmethod
    def _resolve_role_baseline(cls, user, *, module, page, action) -> EffectivePermission:
        """
        Find the most specific RolePermissionPolicy for the user's active roles
        on the given target and return the aggregated baseline.
        """
        from permissions.models import RolePermissionPolicy

        role_ids = list(user.roles.filter(is_active=True).values_list('id', flat=True))
        if not role_ids:
            return EffectivePermission()

        # Build a queryset ordered by specificity (action > page > module)
        # We use annotate-free ordering: action__isnull ASC first (non-null = more specific)
        policies = (
            RolePermissionPolicy.objects
            .filter(role_id__in=role_ids)
            .filter(
                cls._target_filter(module=module, page=page, action=action)
            )
            .select_related('role', 'action', 'page', 'module')
        )

        if not policies.exists():
            # No RolePermissionPolicy configured for this target.
            # Check if ANY policy exists for this role — if not, the permission
            # system hasn't been set up for this role yet; fall back to legacy
            # behaviour (allow view/create/edit, block approve/export).
            any_policies = RolePermissionPolicy.objects.filter(
                role_id__in=role_ids
            ).exists()
            if not any_policies:
                return cls._legacy_mode_baseline(user)
            return EffectivePermission()

        # Pick the single most specific policy per role then aggregate across roles
        # (if multiple roles match, OR the boolean flags, take broader scope, take higher limit)
        winning_flags = {f: False for f in FLAG_NAMES}
        winning_scope = SCOPE_OWN_BRANCH
        winning_limit: Optional[Decimal] = Decimal('0')  # start at 0, build up
        limit_is_unlimited = False

        for policy in sorted(policies, key=lambda p: p.specificity, reverse=True):
            for flag in FLAG_NAMES:
                if getattr(policy, flag):
                    winning_flags[flag] = True
            # Broader scope wins
            if SCOPE_RANK.get(policy.scope, 0) > SCOPE_RANK.get(winning_scope, 0):
                winning_scope = policy.scope
            # Higher (or unlimited) approval limit wins
            if policy.approval_limit is None:
                limit_is_unlimited = True
            elif not limit_is_unlimited and policy.approval_limit > winning_limit:
                winning_limit = policy.approval_limit

        return EffectivePermission(
            **winning_flags,
            scope=winning_scope,
            approval_limit=None if limit_is_unlimited else (winning_limit or None),
        )

    @staticmethod
    def _target_filter(*, module, page, action):
        """
        Build a Q filter that matches policies applicable to the given target.
        A policy applies if it matches at the action level, page level, module level,
        or has no target at all (global for the role).

        Parameters may be model instances or string codes.  String codes are
        matched via __code lookups (Module.code / ModulePage.code / PageAction.code)
        to avoid ValueError when Django tries to cast a string to an integer PK.
        """
        from django.db.models import Q

        q = Q()
        if action is not None:
            if isinstance(action, str):
                q |= Q(action__code=action)
            else:
                q |= Q(action=action)
        if page is not None:
            if isinstance(page, str):
                q |= Q(page__code=page, action__isnull=True)
            else:
                q |= Q(page=page, action__isnull=True)
        if module is not None:
            if isinstance(module, str):
                q |= Q(module__code=module, page__isnull=True, action__isnull=True)
            else:
                q |= Q(module=module, page__isnull=True, action__isnull=True)
        # policies with no target key set apply globally within the role
        q |= Q(module__isnull=True, page__isnull=True, action__isnull=True)
        return q

    @classmethod
    def _active_overrides(cls, user):
        from permissions.models import UserPermissionOverride
        overrides = (
            UserPermissionOverride.objects
            .filter(user=user, is_active=True, is_suspended=False)
            .select_related('action', 'page', 'module', 'scope_ajo_group')
        )
        return [o for o in overrides if not o.is_expired]

    @classmethod
    def _apply_user_overrides(
        cls,
        user,
        baseline: EffectivePermission,
        *,
        module,
        page,
        action,
    ) -> EffectivePermission:
        from permissions.models import UserPermissionOverride

        overrides = cls._active_overrides(user)

        # Filter overrides relevant to this target (same specificity logic as policies)
        relevant = []
        for o in overrides:
            if action is not None and o.action_id == getattr(action, 'id', None):
                relevant.append((3, o))
            elif page is not None and o.page_id == getattr(page, 'id', None) and o.action_id is None:
                relevant.append((2, o))
            elif module is not None and o.module_id == getattr(module, 'id', None) and o.page_id is None and o.action_id is None:
                relevant.append((1, o))
            elif o.module_id is None and o.page_id is None and o.action_id is None:
                relevant.append((0, o))

        if not relevant:
            return baseline

        # Apply most-specific override first; later overrides of equal specificity
        # keep the more permissive value.
        result_flags = {f: getattr(baseline, f) for f in FLAG_NAMES}
        result_scope = baseline.scope
        result_ajo_group = baseline.scope_ajo_group_id
        result_limit = baseline.approval_limit
        elevated_fields = []

        for _, override in sorted(relevant, key=lambda x: x[0], reverse=True):
            for flag in FLAG_NAMES:
                ov = getattr(override, flag)
                if ov is not None:
                    if ov and not result_flags[flag]:
                        elevated_fields.append(flag)
                    result_flags[flag] = ov

            if override.scope is not None:
                ov_rank = SCOPE_RANK.get(override.scope, 0)
                base_rank = SCOPE_RANK.get(baseline.scope, 0)
                if ov_rank > base_rank:
                    elevated_fields.append('scope')
                result_scope = override.scope
                result_ajo_group = getattr(override.scope_ajo_group, 'id', None)

            if override.approval_limit is not None or (
                override.approval_limit is None and override.expiry_type != UserPermissionOverride.EXPIRY_PERMANENT
            ):
                # explicit None on a non-permanent override means unlimited
                # compare with baseline
                if override.approval_limit is None and baseline.approval_limit is not None:
                    elevated_fields.append('approval_limit')
                elif (
                    override.approval_limit is not None
                    and baseline.approval_limit is not None
                    and override.approval_limit > baseline.approval_limit
                ):
                    elevated_fields.append('approval_limit')
                result_limit = override.approval_limit

        is_elevated = bool(elevated_fields)

        return EffectivePermission(
            **result_flags,
            scope=result_scope,
            scope_ajo_group_id=result_ajo_group,
            approval_limit=result_limit,
            is_elevated=is_elevated,
            elevated_fields=list(set(elevated_fields)),
        )
