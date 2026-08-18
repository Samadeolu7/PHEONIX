"""
permissions/audit.py

Utilities for writing PermissionElevationLog entries and a DRF mixin
that automatically logs elevated actions on ViewSets.

Usage — manual logging
─────────────────────
    from permissions.audit import log_elevation

    log_elevation(
        user=request.user,
        action_code='loan-approve',
        record_type='LoanAccount',
        record_id=str(loan.pk),
        request=request,
        approval_amount=loan.principal_amount,
        field_changes={'status': {'before': 'pending', 'after': 'approved'}},
    )

Usage — automatic (DRF ViewSet mixin)
─────────────────────────────────────
    class LoanApprovalViewSet(ElevationAuditMixin, viewsets.ModelViewSet):
        # Override these two attributes to control log content:
        audit_record_type = 'LoanAccount'   # defaults to model name
        audit_action_code = 'loan-approve'  # defaults to HTTP-method-based code
        audit_amount_field = 'principal_amount'  # field on the instance holding a monetary amount

The mixin hooks into perform_create, perform_update, perform_destroy, and any
@action decorated methods that call perform_action() — only writing a log when
the requesting user is currently elevated.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, Optional

from django.db import transaction

log = logging.getLogger(__name__)


# ── Core logging function ─────────────────────────────────────────────────────

def log_elevation(
    user,
    *,
    action_code: str,
    record_type: str,
    record_id: str,
    request=None,
    approval_amount: Optional[Decimal] = None,
    field_changes: Optional[Dict[str, Any]] = None,
    override=None,
    branch=None,
    scope_used: str = '',
) -> None:
    """
    Write a PermissionElevationLog entry for an elevated action.

    Only writes if the user currently has an active elevated override.
    Safe to call unconditionally — it checks elevation itself.

    Parameters
    ──────────
    user          : The acting User instance.
    action_code   : A short code identifying the action (e.g. 'loan-approve').
    record_type   : Django model class name of the affected object.
    record_id     : String representation of the record PK.
    request       : Optional DRF/Django request — used to derive branch + scope.
    approval_amount : The monetary amount involved, if applicable.
    field_changes : Dict of {'field': {'before': old, 'after': new}}.
    override      : Specific UserPermissionOverride to reference. Resolved
                    automatically from active elevated overrides if not provided.
    branch        : Branch FK value. Resolved from request.user.branch if omitted.
    scope_used    : Scope string that was active. Resolved via PermissionResolver if omitted.
    """
    # Lazy import to avoid circular deps at module load time
    from permissions.models import PermissionElevationLog
    from permissions.services import PermissionResolver

    try:
        # Only log if the user actually has an elevated permission right now.
        ep = PermissionResolver.resolve(user)
        if not ep.is_elevated:
            return

        # Resolve branch from the request's *effective* branch (honors the
        # X-Branch-ID switcher — including a non-elevated user acting in a
        # temporarily-granted branch) rather than always the user's home
        # branch, so the log records where the action actually happened.
        if branch is None and request is not None:
            try:
                from common.views import resolve_effective_branch
                branch = resolve_effective_branch(request)
            except Exception:
                branch = None
            if branch is None:
                branch = getattr(request.user, 'branch', None)
        if branch is None:
            branch = getattr(user, 'branch', None)

        # Resolve scope
        if not scope_used:
            scope_used = ep.scope or ''

        # Resolve the specific override that caused the elevation
        if override is None:
            override = _find_elevated_override(user)

        with transaction.atomic():
            PermissionElevationLog.objects.create(
                user=user,
                override=override,
                action_code=action_code,
                record_type=record_type,
                record_id=str(record_id),
                branch=branch,
                scope_used=scope_used,
                approval_amount=approval_amount,
                field_changes=field_changes or {},
            )
    except Exception:
        # Audit failures must NEVER break the main operation.
        log.exception(
            'ElevationAudit: failed to write log for user=%s action=%s record=%s#%s',
            getattr(user, 'id', '?'), action_code, record_type, record_id,
        )


def _find_elevated_override(user):
    """Return the first active elevated override for *user*, or None."""
    from permissions.models import UserPermissionOverride
    from permissions.services import PermissionResolver

    for override in PermissionResolver._active_overrides(user):
        if override.is_elevated:
            return override
    return None


# ── DRF ViewSet mixin ─────────────────────────────────────────────────────────

class ElevationAuditMixin:
    """
    Mix into a DRF ModelViewSet to automatically log elevated actions.

    Class-level configuration attributes (all optional):

        audit_record_type   (str)  : Model name used in the log.
                                     Defaults to the queryset model's __name__.
        audit_action_code   (str)  : Code used in the log.
                                     Defaults to '<model>-<http_method>'.
        audit_amount_field  (str)  : Name of the field on the serializer instance
                                     that holds the monetary amount (e.g. 'amount').
        audit_tracked_fields (list): Field names to capture before/after snapshots.
    """

    audit_record_type:   Optional[str] = None
    audit_action_code:   Optional[str] = None
    audit_amount_field:  Optional[str] = None
    audit_tracked_fields: list         = []

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _audit_record_type(self) -> str:
        if self.audit_record_type:
            return self.audit_record_type
        try:
            return self.get_queryset().model.__name__
        except Exception:
            return 'Unknown'

    def _audit_action_code(self, http_verb: str) -> str:
        if self.audit_action_code:
            return self.audit_action_code
        return f'{self._audit_record_type().lower()}-{http_verb}'

    def _extract_amount(self, instance) -> Optional[Decimal]:
        if not self.audit_amount_field:
            return None
        raw = getattr(instance, self.audit_amount_field, None)
        if raw is None:
            return None
        try:
            return Decimal(str(raw))
        except Exception:
            return None

    def _capture_fields(self, instance, *, prefix='after') -> Dict[str, Any]:
        if not self.audit_tracked_fields:
            return {}
        return {
            field: {prefix: getattr(instance, field, None)}
            for field in self.audit_tracked_fields
            if hasattr(instance, field)
        }

    def _snapshot_before(self, instance_id) -> Dict[str, Any]:
        """Capture 'before' values by re-fetching from DB before mutation."""
        if not self.audit_tracked_fields:
            return {}
        try:
            qs = self.get_queryset()
            old = qs.get(pk=instance_id)
            return {f: getattr(old, f, None) for f in self.audit_tracked_fields}
        except Exception:
            return {}

    def _merge_changes(self, before: dict, after_instance) -> Dict[str, Any]:
        changes = {}
        for f, old_val in before.items():
            new_val = getattr(after_instance, f, None)
            if old_val != new_val:
                changes[f] = {'before': old_val, 'after': new_val}
        return changes

    # ── Overridden ViewSet hooks ───────────────────────────────────────────────

    def perform_create(self, serializer):
        super().perform_create(serializer)
        instance = serializer.instance
        log_elevation(
            self.request.user,
            action_code=self._audit_action_code('create'),
            record_type=self._audit_record_type(),
            record_id=str(instance.pk) if instance else '?',
            request=self.request,
            approval_amount=self._extract_amount(instance),
            field_changes=self._capture_fields(instance, prefix='after'),
        )

    def perform_update(self, serializer):
        # Capture before-state before committing
        instance = serializer.instance
        before = self._snapshot_before(instance.pk)

        super().perform_update(serializer)

        instance.refresh_from_db()
        changes = self._merge_changes(before, instance)
        log_elevation(
            self.request.user,
            action_code=self._audit_action_code('update'),
            record_type=self._audit_record_type(),
            record_id=str(instance.pk),
            request=self.request,
            approval_amount=self._extract_amount(instance),
            field_changes=changes,
        )

    def perform_destroy(self, instance):
        before = self._capture_fields(instance, prefix='before')
        record_id = str(instance.pk)
        super().perform_destroy(instance)
        log_elevation(
            self.request.user,
            action_code=self._audit_action_code('delete'),
            record_type=self._audit_record_type(),
            record_id=record_id,
            request=self.request,
            field_changes=before,
        )
