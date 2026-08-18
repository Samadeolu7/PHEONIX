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
from django.db.models import Q as _Q
from permissions.models import (
    RolePermissionPolicy, UserPermissionOverride,
    SCOPE_GLOBAL, SCOPE_OWN_BRANCH, SCOPE_OWN_RECORDS, SCOPE_RANK,
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

        # --- 2. Role permission_codes (complements page policies) ---
        # Always include permission_codes from all active roles. These are generated
        # automatically by setup_views.py when page policies are saved, and can also
        # be set manually via the Action Permissions tab.
        for role in user.roles.filter(is_active=True):
            if isinstance(role.permission_codes, list):
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
    def resolve_bulk_matrix(cls, user) -> Dict[str, Any]:
        """
        Compute effective permissions for every module:page pair at once, in a
        constant number of queries (roles, policies, overrides, page catalog)
        regardless of how many pages exist. Used to hand the frontend a single
        payload it can derive route access AND nav visibility from, instead of
        the frontend maintaining its own hand-written per-role nav allowlists.

        Mirrors the exact aggregation semantics of `_resolve_role_baseline` /
        `_apply_user_overrides` (specificity ordering, scope/limit widening,
        the legacy `{page_code}-{suffix}` fallback for pages with no
        RolePermissionPolicy row yet) — just applied to every page in one pass
        instead of one page per call. Does not alter `resolve()` itself.

        Returns:
            {
              "wildcard": bool,       # true → frontend grants everything
              "legacy_mode": bool,    # true → role has no policies at all yet;
                                      #        frontend applies the same
                                      #        view/create/edit/delete-yes,
                                      #        approve/export-no default as
                                      #        _legacy_mode_baseline
              "pages": {
                "module:page": {"can_view": bool, ..., "scope": str,
                                 "approval_limit": str|None},
                ...
              }
            }
        """
        if cls._is_wildcard(user):
            return {'wildcard': True, 'legacy_mode': False, 'pages': {}}

        role_ids = list(user.roles.filter(is_active=True).values_list('id', flat=True))
        if not role_ids:
            return {'wildcard': False, 'legacy_mode': False, 'pages': {}}

        any_policies = RolePermissionPolicy.objects.filter(role_id__in=role_ids).exists()
        if not any_policies:
            return {'wildcard': False, 'legacy_mode': True, 'pages': {}}

        # Action-level rows power get_all_permission_codes(); the page matrix
        # only needs module/page/global-level rows.
        policies = list(
            RolePermissionPolicy.objects
            .filter(role_id__in=role_ids, action__isnull=True)
            .select_related('module', 'page')
        )
        overrides = [o for o in cls._active_overrides(user) if o.action_id is None]

        legacy_codes: set[str] = set()
        for role in user.roles.filter(is_active=True, id__in=role_ids):
            if isinstance(role.permission_codes, list):
                legacy_codes.update(role.permission_codes)

        from pages.models import ModulePage
        # Migration 0005_backfill_module_page_tenant stamped all Module /
        # ModulePage rows with the real tenant. Use all_tenants() to bypass
        # OwnerBranchManager's automatic filter, then scope to the user's
        # tenant plus any NULL-tenant rows that predated the backfill.
        user_tenant = getattr(user, 'tenant', None)
        all_pages = list(
            ModulePage.objects.all_tenants()
            .filter(
                _Q(tenant=user_tenant) | _Q(tenant__isnull=True),
                is_active=True,
            )
            .select_related('module')
        )

        def _bucket(items, key_fn):
            d: dict = {}
            for it in items:
                d.setdefault(key_fn(it), []).append(it)
            return d

        page_policies = _bucket(
            [p for p in policies if p.module_id and p.page_id],
            lambda p: (p.module.code, p.page.code),
        )
        module_policies = _bucket(
            [p for p in policies if p.module_id and not p.page_id],
            lambda p: p.module.code,
        )
        global_policies = [p for p in policies if not p.module_id and not p.page_id]

        page_overrides = _bucket(
            [o for o in overrides if o.module_id and o.page_id],
            lambda o: (o.module.code, o.page.code),
        )
        module_overrides = _bucket(
            [o for o in overrides if o.module_id and not o.page_id],
            lambda o: o.module.code,
        )
        global_overrides = [o for o in overrides if not o.module_id and not o.page_id]

        _FLAG_SUFFIX = {
            'can_view': 'view', 'can_create': 'create', 'can_edit': 'edit',
            'can_delete': 'delete', 'can_approve': 'approve', 'can_export': 'export',
        }

        result_pages: Dict[str, Any] = {}
        for mp in all_pages:
            key = (mp.module.code, mp.code)
            applicable = (
                page_policies.get(key, [])
                + module_policies.get(mp.module.code, [])
                + global_policies
            )
            # True the moment ANY RolePermissionPolicy row targets this page —
            # including one whose flags are all False. That distinction matters:
            # an explicit "no access" decision (e.g. an admin unchecking every
            # box in Permission Setup) must be reported as a definite deny, not
            # omitted as if no policy existed at all. Omitting it would make the
            # frontend treat it as 'unknown' and fall back to the legacy flat
            # permission_codes check — silently undoing the revocation if that
            # role still happens to hold a matching legacy code.
            has_explicit_policy = bool(applicable)

            if applicable:
                flags, scope, limit = cls._aggregate_policy_list(applicable)
            else:
                # No RolePermissionPolicy targets this page at all — fall back
                # to the role's flat permission_codes, same as
                # _resolve_role_baseline's per-page fallback.
                flags = {
                    flag: f'{mp.code}-{suffix}' in legacy_codes
                    for flag, suffix in _FLAG_SUFFIX.items()
                }
                scope = SCOPE_OWN_BRANCH
                limit = None
                if not any(flags.values()):
                    continue  # no explicit policy AND no legacy code match — omit ('unknown', safe to fall back)

            applicable_overrides = (
                page_overrides.get(key, [])
                + module_overrides.get(mp.module.code, [])
                + global_overrides
            )
            if applicable_overrides:
                flags, scope, limit = cls._apply_override_list(flags, scope, limit, applicable_overrides)
                has_explicit_policy = True  # an override is also an explicit administrative decision

            if has_explicit_policy or any(flags.values()):
                result_pages[f'{key[0]}:{key[1]}'] = {
                    **flags,
                    'scope': scope,
                    'approval_limit': str(limit) if limit is not None else None,
                }

        return {'wildcard': False, 'legacy_mode': False, 'pages': result_pages}

    @staticmethod
    def _aggregate_policy_list(policy_list):
        """Same winning-flags/scope/limit aggregation as _resolve_role_baseline, factored out for bulk reuse."""
        flags = {f: False for f in FLAG_NAMES}
        # Seed at the NARROWEST rank, not SCOPE_OWN_BRANCH — policy_list is
        # never empty here (callers only invoke this when `applicable` is
        # truthy), so the loop below always overwrites this with a real
        # policy's scope. Seeding at own_branch (rank 3) would silently
        # out-rank any single assigned_clients/ajo_group/own_records policy
        # (rank ≤2), making those scopes impossible to ever resolve to.
        scope = SCOPE_OWN_RECORDS
        limit: Optional[Decimal] = Decimal('0')
        unlimited = False
        for p in sorted(policy_list, key=lambda x: x.specificity, reverse=True):
            for f in FLAG_NAMES:
                if getattr(p, f):
                    flags[f] = True
            if SCOPE_RANK.get(p.scope, 0) > SCOPE_RANK.get(scope, 0):
                scope = p.scope
            if p.approval_limit is None:
                unlimited = True
            elif not unlimited and p.approval_limit > limit:
                limit = p.approval_limit
        return flags, scope, (None if unlimited else (limit or None))

    @staticmethod
    def _apply_override_list(flags, scope, limit, override_list):
        """
        Simplified sibling of _apply_user_overrides for the bulk matrix — same
        flag/scope/limit override application, without is_elevated/
        elevated_fields tracking (not needed for access-grant computation).
        """
        result = dict(flags)
        for o in override_list:
            for f in FLAG_NAMES:
                ov = getattr(o, f)
                if ov is not None:
                    result[f] = ov
            if o.scope is not None:
                scope = o.scope
            if o.approval_limit is not None or (
                o.approval_limit is None and o.expiry_type != UserPermissionOverride.EXPIRY_PERMANENT
            ):
                limit = o.approval_limit
        return result, scope, limit

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

        # A branch-access grant is always elevation — it widens which
        # branch's data the user can see/act on, independent of the
        # flag/scope/limit checks below (which only compare the same
        # module/page/action target the role already covers).
        if override.target_branch_id:
            return True

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
        # Wrapped in a savepoint: if the DB query fails, only the savepoint is
        # rolled back; the outer transaction remains alive so callers can proceed.
        try:
            with db_tx.atomic():
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

            # The role has policies for OTHER pages but none for this one.
            # Fall back to the role's flat permission_codes list so that pages
            # granted via the Action Permissions tab (or before the page-level
            # policy system was set up) still work.
            if page is not None:
                page_code = page if isinstance(page, str) else getattr(page, 'code', None)
                if page_code:
                    _FLAG_SUFFIX = {
                        'can_view': 'view', 'can_create': 'create',
                        'can_edit': 'edit', 'can_delete': 'delete',
                        'can_approve': 'approve', 'can_export': 'export',
                    }
                    merged: dict[str, bool] = {f: False for f in FLAG_NAMES}
                    found = False
                    for role in user.roles.filter(is_active=True, id__in=role_ids):
                        codes = set(role.permission_codes or [])
                        for flag, suffix in _FLAG_SUFFIX.items():
                            if f'{page_code}-{suffix}' in codes:
                                merged[flag] = True
                                found = True
                    if found:
                        return EffectivePermission(**merged)

            # No policy and no permission_codes entry — deny by default.
            return EffectivePermission()

        # Pick the single most specific policy per role then aggregate across roles
        # (if multiple roles match, OR the boolean flags, take broader scope, take higher limit)
        winning_flags = {f: False for f in FLAG_NAMES}
        # Seed at the NARROWEST rank, not SCOPE_OWN_BRANCH — `policies` is
        # confirmed non-empty above (the `not policies.exists()` branch
        # already returned), so the loop below always overwrites this with a
        # real policy's scope. Seeding at own_branch (rank 3) would silently
        # out-rank any single assigned_clients/ajo_group/own_records policy
        # (rank ≤2) an admin configured via the Permission Setup UI, making
        # those narrower scopes impossible to ever actually resolve to.
        winning_scope = SCOPE_OWN_RECORDS
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

        # Filter overrides relevant to this target (same specificity logic as policies).
        # module/page/action may be string codes or model instances — resolve to PKs once.
        from pages.models import Module, ModulePage
        from pages.action_models import PageAction

        def _resolve_pk(target, model, code_field='code'):
            if target is None:
                return None
            if isinstance(target, str):
                obj = model.objects.filter(**{code_field: target}).first()
                return obj.pk if obj else None
            return getattr(target, 'pk', None)

        action_pk = _resolve_pk(action, PageAction)
        page_pk   = _resolve_pk(page, ModulePage)
        module_pk = _resolve_pk(module, Module)

        relevant = []
        for o in overrides:
            if action_pk is not None and o.action_id == action_pk:
                relevant.append((3, o))
            elif page_pk is not None and o.page_id == page_pk and o.action_id is None:
                relevant.append((2, o))
            elif module_pk is not None and o.module_id == module_pk and o.page_id is None and o.action_id is None:
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


def scope_queryset_to_user(
    qs,
    user,
    *,
    module: str,
    page: str,
    officer_client_lookup: Optional[str],
    officer_group_lookup: Optional[str] = None,
    officer_group_members_lookup: Optional[str] = None,
):
    """
    Free-function equivalent of common.views.ScopedModelViewSet's
    `_apply_officer_scope` instance method, for use in plain APIView-based
    report/aggregation endpoints that don't go through a ModelViewSet.
    Mirrors that method's tiers and fail-closed behavior exactly, so a
    report's totals agree with what the same (module, page) scope already
    permits in the corresponding list endpoint.

    `officer_client_lookup` is the ORM path from `qs`'s model to
    `Client.assigned_officer` (e.g. 'client__assigned_officer'), same
    convention as ScopedModelViewSet.officer_client_lookup.
    """
    if getattr(user, 'is_system_admin', False):
        return qs
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return qs

    scope = PermissionResolver.resolve(user, module=module, page=page).scope

    if scope in ('own_branch', 'global'):
        return qs

    staff = None
    try:
        staff = user.staff_profile
    except Exception:
        pass

    lookup = officer_client_lookup
    if not lookup:
        return qs.filter(created_by=user)

    if not staff:
        return qs.none()

    # Unassigned records (officer_client_lookup IS NULL) are visible to
    # everyone, not just the officers they'd otherwise be scoped to —
    # matches ScopedModelViewSet._apply_officer_scope's documented behavior.
    unassigned = _Q(**{f'{lookup}__isnull': True})

    if scope == 'ajo_group':
        q = (
            _Q(**{lookup: staff}) |
            _Q(**{f'{lookup}__reports_to': staff}) |
            unassigned
        )
        if officer_group_lookup:
            q |= _Q(**{officer_group_lookup: staff})
        if officer_group_members_lookup:
            q |= _Q(**{officer_group_members_lookup: staff})
            return qs.filter(q).distinct()
        return qs.filter(q)

    # own_records / assigned_clients (and any other/unrecognized value) —
    # narrowest tier, fail toward MORE restriction rather than less.
    q = _Q(**{lookup: staff}) | unassigned
    if officer_group_lookup:
        q |= _Q(**{officer_group_lookup: staff})
    if officer_group_members_lookup:
        q |= _Q(**{officer_group_members_lookup: staff})
        return qs.filter(q).distinct()
    return qs.filter(q)


# ──────────────────────────────────────────────────────────────────────────────
# Temporary cross-branch access
# ──────────────────────────────────────────────────────────────────────────────

def get_temp_branch_overrides(user):
    """
    Return the active, non-expired UserPermissionOverride rows granting this
    user temporary access to an additional branch. Wrapped in a savepoint the
    same way PermissionResolver._active_overrides is — a DB error here (e.g.
    during early migrations) must only roll back this lookup, not the caller's
    whole request transaction.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    try:
        with db_tx.atomic():
            overrides = (
                UserPermissionOverride.objects
                .filter(user=user, is_active=True, is_suspended=False, target_branch__isnull=False)
                .select_related('target_branch')
            )
            return [o for o in overrides if not o.is_expired]
    except Exception:
        return []


def get_temp_branch_ids(user) -> set:
    """Branch PKs the user has active temporary access to, via target_branch grants."""
    return {o.target_branch_id for o in get_temp_branch_overrides(user)}
