"""
permissions/models.py

Fine-grained, scope-aware permission system for Phoenix ERP.

Architecture
────────────
• RolePermissionPolicy  — defines what a *role* can do on a given Module/Page/Action,
                          including scope (global / own_branch / assigned_clients /
                          ajo_group / own_records) and a monetary approval ceiling.

• UserPermissionOverride — per-user grants that override / extend the role baseline.
                           Each override records whether it *elevates* the user above
                           their role and supports time-limited / expiring privileges.

• PermissionElevationLog — immutable audit trail of every action taken by a user
                            while their override was in an elevated state.
"""

from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.conf import settings


# ──────────────────────────────────────────────────────────────────────────────
# Scope choices (shared across roles and user overrides)
# ──────────────────────────────────────────────────────────────────────────────
SCOPE_GLOBAL = 'global'
SCOPE_OWN_BRANCH = 'own_branch'
SCOPE_ASSIGNED_CLIENTS = 'assigned_clients'
SCOPE_AJO_GROUP = 'ajo_group'
SCOPE_OWN_RECORDS = 'own_records'

SCOPE_CHOICES = [
    (SCOPE_GLOBAL,           'All Branches (Global)'),
    (SCOPE_OWN_BRANCH,       'Own Branch Only'),
    (SCOPE_ASSIGNED_CLIENTS, 'Assigned Clients Only'),
    (SCOPE_AJO_GROUP,        'Specific Ajo/Savings Group'),
    (SCOPE_OWN_RECORDS,      'Own Records Only'),
]

SCOPE_RANK = {
    SCOPE_OWN_RECORDS:      1,
    SCOPE_ASSIGNED_CLIENTS: 2,
    SCOPE_AJO_GROUP:        2,
    SCOPE_OWN_BRANCH:       3,
    SCOPE_GLOBAL:           4,
}


# ──────────────────────────────────────────────────────────────────────────────
# Role-level permission policy
# ──────────────────────────────────────────────────────────────────────────────
class RolePermissionPolicy(models.Model):
    """
    Defines what a Role is permitted to do on a specific Module / Page / Action
    combination, together with the data scope and optional monetary ceiling.

    Granularity rules
    -----------------
    • module only  → the policy applies to *all* pages and actions within that module
    • module + page → the policy applies to *all* actions on that specific page
    • module + page + action → the most specific, action-level policy

    When resolving effective permissions the most specific matching policy wins.
    """
    role = models.ForeignKey(
        'users.Role',
        on_delete=models.CASCADE,
        related_name='permission_policies',
    )

    # ── Granularity ───────────────────────────────────────────────────────────
    module = models.ForeignKey(
        'pages.Module',
        on_delete=models.CASCADE,
        related_name='role_policies',
        null=True, blank=True,
    )
    page = models.ForeignKey(
        'pages.ModulePage',
        on_delete=models.CASCADE,
        related_name='role_policies',
        null=True, blank=True,
    )
    action = models.ForeignKey(
        'pages.PageAction',
        on_delete=models.CASCADE,
        related_name='role_policies',
        null=True, blank=True,
    )

    # ── Permission flags ──────────────────────────────────────────────────────
    can_view   = models.BooleanField(default=False)
    can_create = models.BooleanField(default=False)
    can_edit   = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_approve = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)

    # ── Scope ─────────────────────────────────────────────────────────────────
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        default=SCOPE_OWN_BRANCH,
        help_text='Data visibility scope for this role on this module/page/action.',
    )

    # ── Monetary ceiling (for financial approval actions) ─────────────────────
    approval_limit = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text='Maximum monetary amount this role may approve. NULL = unlimited.',
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_role_policies',
    )

    class Meta:
        db_table = 'perm_role_policy'
        ordering = ['role', 'module', 'page', 'action']
        indexes = [
            models.Index(fields=['role', 'module']),
            models.Index(fields=['role', 'page']),
            models.Index(fields=['role', 'action']),
        ]

    def __str__(self):
        parts = [self.role.name]
        if self.module:
            parts.append(self.module.name)
        if self.page:
            parts.append(self.page.title)
        if self.action:
            parts.append(self.action.name)
        return ' › '.join(parts)

    @property
    def flags(self):
        return {
            'can_view':   self.can_view,
            'can_create': self.can_create,
            'can_edit':   self.can_edit,
            'can_delete': self.can_delete,
            'can_approve': self.can_approve,
            'can_export': self.can_export,
        }

    @property
    def specificity(self):
        """Higher = more specific.  Used by the resolver to pick the winning policy."""
        if self.action_id:
            return 3
        if self.page_id:
            return 2
        if self.module_id:
            return 1
        return 0


# ──────────────────────────────────────────────────────────────────────────────
# Per-user permission override
# ──────────────────────────────────────────────────────────────────────────────
class UserPermissionOverride(models.Model):
    """
    An individual grant that extends or restricts a user's role-derived permissions.

    Expiry options
    ──────────────
    expiry_type = 'permanent'  → never expires
    expiry_type = 'date'       → expires at midnight on expires_at.date()
    expiry_type = 'datetime'   → expires at the exact expires_at datetime
    expiry_type = 'duration'   → expires expire_after_hours hours after granted_at

    Expiry behaviour (when the grant expires)
    ─────────────────────────────────────────
    'auto_revoke'  → is_active set to False automatically
    'auto_suspend' → is_suspended set to True; admin must manually re-activate or revoke
    'alert_only'   → permission stays active; notification sent; no automatic change
    """

    EXPIRY_PERMANENT = 'permanent'
    EXPIRY_DATE      = 'date'
    EXPIRY_DATETIME  = 'datetime'
    EXPIRY_DURATION  = 'duration'

    EXPIRY_TYPE_CHOICES = [
        (EXPIRY_PERMANENT, 'Permanent'),
        (EXPIRY_DATE,      'Expires on Date'),
        (EXPIRY_DATETIME,  'Expires at Date/Time'),
        (EXPIRY_DURATION,  'Expires After Duration'),
    ]

    BEHAVIOR_REVOKE  = 'auto_revoke'
    BEHAVIOR_SUSPEND = 'auto_suspend'
    BEHAVIOR_ALERT   = 'alert_only'

    EXPIRY_BEHAVIOR_CHOICES = [
        (BEHAVIOR_REVOKE,  'Auto-Revoke on Expiry'),
        (BEHAVIOR_SUSPEND, 'Auto-Suspend on Expiry'),
        (BEHAVIOR_ALERT,   'Alert Only — Keep Active'),
    ]

    # ── Who ───────────────────────────────────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='permission_overrides',
    )

    # ── What (granularity mirrors RolePermissionPolicy) ───────────────────────
    module = models.ForeignKey(
        'pages.Module',
        on_delete=models.CASCADE,
        related_name='user_overrides',
        null=True, blank=True,
    )
    page = models.ForeignKey(
        'pages.ModulePage',
        on_delete=models.CASCADE,
        related_name='user_overrides',
        null=True, blank=True,
    )
    action = models.ForeignKey(
        'pages.PageAction',
        on_delete=models.CASCADE,
        related_name='user_overrides',
        null=True, blank=True,
    )

    # ── Permission flags (None = inherit from role; True/False = explicit override) ─
    can_view   = models.BooleanField(null=True, blank=True)
    can_create = models.BooleanField(null=True, blank=True)
    can_edit   = models.BooleanField(null=True, blank=True)
    can_delete = models.BooleanField(null=True, blank=True)
    can_approve = models.BooleanField(null=True, blank=True)
    can_export = models.BooleanField(null=True, blank=True)

    # ── Scope override (None = inherit from role) ─────────────────────────────
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        null=True, blank=True,
        help_text='Override the data scope for this user. NULL = use role default.',
    )
    # For ajo_group scope — the specific group this override applies to
    scope_ajo_group = models.ForeignKey(
        'clients.ClientGroup',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='permission_overrides',
        help_text='The Ajo group this override scopes to (only used when scope=ajo_group).',
    )

    # ── Monetary approval ceiling (None = inherit from role) ──────────────────
    approval_limit = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text='Override approval monetary limit for this user. NULL = use role limit.',
    )

    # ── Expiry ────────────────────────────────────────────────────────────────
    expiry_type = models.CharField(
        max_length=20,
        choices=EXPIRY_TYPE_CHOICES,
        default=EXPIRY_PERMANENT,
    )
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Set when expiry_type is "date" or "datetime".',
    )
    expire_after_hours = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Set when expiry_type is "duration". Hours from granted_at.',
    )
    expiry_behavior = models.CharField(
        max_length=20,
        choices=EXPIRY_BEHAVIOR_CHOICES,
        default=BEHAVIOR_REVOKE,
    )

    # ── State ─────────────────────────────────────────────────────────────────
    is_active    = models.BooleanField(default=True)
    is_suspended = models.BooleanField(default=False)
    # Cached elevation flag — recomputed each time the override is saved
    is_elevated  = models.BooleanField(
        default=False,
        help_text='True when this override grants more than the user\'s role allows.',
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='granted_overrides',
    )
    granted_at   = models.DateTimeField(auto_now_add=True)
    grant_reason = models.TextField(
        blank=True,
        help_text='Reason for granting this override (shown in exception report).',
    )
    # Populated when the override is processed on expiry
    revoked_at   = models.DateTimeField(null=True, blank=True)
    revoked_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='revoked_overrides',
    )
    revoke_reason = models.TextField(blank=True)
    # Dedup marker for send_expiry_warning_notifications — set when a
    # "will expire soon" warning is sent, so it's only sent once per day.
    last_expiry_warning_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'perm_user_override'
        ordering = ['-granted_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['is_elevated', 'is_active']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        target = self.action or self.page or self.module
        target_str = str(target) if target else '(all)'
        return f'{self.user} override on {target_str}'

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_currently_active(self):
        """True only if the override is active, not suspended, and not expired."""
        if not self.is_active or self.is_suspended:
            return False
        return not self.is_expired

    @property
    def is_expired(self):
        if self.expiry_type == self.EXPIRY_PERMANENT:
            return False
        now = timezone.now()
        if self.expiry_type == self.EXPIRY_DURATION:
            if self.expire_after_hours is None:
                return False
            deadline = self.granted_at + timezone.timedelta(hours=self.expire_after_hours)
            return now >= deadline
        # date or datetime
        if self.expires_at is None:
            return False
        return now >= self.expires_at

    @property
    def effective_expires_at(self):
        """Return the absolute datetime this override expires, or None if permanent."""
        if self.expiry_type == self.EXPIRY_PERMANENT:
            return None
        if self.expiry_type == self.EXPIRY_DURATION:
            if self.expire_after_hours is None:
                return None
            return self.granted_at + timezone.timedelta(hours=self.expire_after_hours)
        return self.expires_at

    @property
    def hours_until_expiry(self):
        exp = self.effective_expires_at
        if exp is None:
            return None
        delta = exp - timezone.now()
        return max(0, delta.total_seconds() / 3600)

    def compute_is_elevated(self):
        """
        Return True if this override grants more than the user's roles allow.
        Evaluated lazily — call save() to persist the result.
        """
        from permissions.services import PermissionResolver
        return PermissionResolver.override_exceeds_role(self)

    def save(self, *args, **kwargs):
        # Keep is_elevated up to date whenever the override is saved
        try:
            self.is_elevated = self.compute_is_elevated()
        except Exception:
            # If resolver fails (e.g. during data migration), keep existing value
            pass
        super().save(*args, **kwargs)


# ──────────────────────────────────────────────────────────────────────────────
# Immutable audit log of elevated-permission actions
# ──────────────────────────────────────────────────────────────────────────────
class PermissionElevationLog(models.Model):
    """
    Immutable record written every time a user performs an action while their
    effective permission is elevated above their role baseline.

    Fields follow the "standard" audit depth agreed with the team:
    basic info + key field before/after snapshot.
    """
    user     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='elevation_logs',
    )
    override = models.ForeignKey(
        UserPermissionOverride,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='elevation_logs',
        help_text='The specific override that elevated this action.',
    )

    # ── What happened ─────────────────────────────────────────────────────────
    action_code   = models.CharField(max_length=100,
        help_text='Permission code used (e.g. "loan-approve").')
    record_type   = models.CharField(max_length=100,
        help_text='Django model name of the affected record (e.g. "LoanAccount").')
    record_id     = models.CharField(max_length=100,
        help_text='PK of the affected record as a string.')

    # ── Context ───────────────────────────────────────────────────────────────
    branch        = models.ForeignKey(
        'branches.Branch',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='elevation_logs',
    )
    scope_used    = models.CharField(max_length=20, choices=SCOPE_CHOICES, blank=True)
    approval_amount = models.DecimalField(
        max_digits=18, decimal_places=2,
        null=True, blank=True,
        help_text='Monetary amount involved (for financial approval actions).',
    )

    # ── Before / after snapshot (standard audit depth) ────────────────────────
    field_changes = models.JSONField(
        default=dict,
        help_text='{"field_name": {"before": <old>, "after": <new>}}',
    )

    # ── Immutable timestamp ───────────────────────────────────────────────────
    logged_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'perm_elevation_log'
        ordering = ['-logged_at']
        indexes = [
            models.Index(fields=['user', 'logged_at']),
            models.Index(fields=['override', 'logged_at']),
            models.Index(fields=['record_type', 'record_id']),
        ]

    def __str__(self):
        return f'{self.user} elevated [{self.action_code}] on {self.record_type}#{self.record_id}'

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError('PermissionElevationLog records are immutable.')
        super().save(*args, **kwargs)
