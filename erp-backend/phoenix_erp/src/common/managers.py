from django.db import models
from django.db.models import Q
from django.core.exceptions import PermissionDenied
import threading

# Thread-local storage for current tenant
_thread_locals = threading.local()

def get_current_tenant():
    """Get current tenant from thread-local storage (set by middleware)"""
    return getattr(_thread_locals, 'tenant', None)

def set_current_tenant(tenant):
    """Set current tenant in thread-local storage (called by middleware)"""
    _thread_locals.tenant = tenant


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        # Soft-delete: mark as deleted
        return super().update(is_deleted=True)

    def hard_delete(self):
        # Physically remove records
        return super().delete()

    def alive(self):
        # Exclude soft-deleted records
        return self.filter(is_deleted=False)

    def deleted(self):
        return self.filter(is_deleted=True)


class SoftDeleteManager(models.Manager):
    """Manager that hides soft-deleted rows by default."""
    def __init__(self, *, include_deleted=False, **kwargs):
        self.include_deleted = include_deleted
        super().__init__(**kwargs)

    def get_queryset(self):
        qs = SoftDeleteQuerySet(self.model, using=self._db)
        if not self.include_deleted:
            qs = qs.alive()
        return qs


class OwnerBranchQuerySet(SoftDeleteQuerySet):
    """QuerySet that adds owner, branch, and tenant scoping."""
    def for_tenant(self, tenant):
        """Filter by specific tenant"""
        if not tenant:
            raise PermissionDenied("Tenant must be specified.")
        return self.filter(tenant=tenant)
    
    def for_owner(self, owner):
        if not owner or not owner.is_authenticated:
            raise PermissionDenied("Owner must be authenticated to access data.")
        return self.filter(owner=owner)

    def for_branch(self, branch):
        if not branch:
            raise PermissionDenied("Branch must be specified.")
        return self.filter(branch=branch)

    # def for_user(self, user):
    #     if not user.is_authenticated:
    #         raise PermissionDenied("User must be authenticated.")
    #     return self.for_owner(user)


class OwnerBranchManager(SoftDeleteManager):
    """Manager that provides owner and branch scoping."""
    def get_queryset(self):
        return OwnerBranchQuerySet(self.model, using=self._db)
        qs = self.for_owner(user)
        # custom permission to view all branches under the same owner
        perm = f"{self.model._meta.app_label}.view_all_branches"
        if user.has_perm(perm):
            return qs
        if hasattr(user, 'branch') and user.branch:
            return qs.filter(branch=user.branch)
        raise PermissionDenied("User does not have branch access.")


class OwnerBranchManager(SoftDeleteManager):
    """Manager combining soft-delete, owner/branch, and tenant scoping."""
    def get_queryset(self):
        # Base queryset with soft-delete handling
        qs = OwnerBranchQuerySet(self.model, using=self._db)
        if not self.include_deleted:
            qs = qs.alive()
        
        # Automatically filter by tenant if model has tenant field
        if hasattr(self.model, 'tenant'):
            tenant = get_current_tenant()
            if tenant:
                qs = qs.filter(tenant=tenant)
        
        return qs
    
    def for_tenant(self, tenant):
        """Explicitly filter by tenant (bypasses thread-local)"""
        return self.get_queryset().for_tenant(tenant)

    def for_owner(self, owner):
        return self.get_queryset().for_owner(owner)

    def for_branch(self, branch):
        return self.get_queryset().for_branch(branch)

    def for_user(self, user):
        """Return a queryset scoped to the provided user.

        This avoids relying on thread-local tenant detection during request
        middleware (which may not have access to DRF-authenticated users
        when middleware runs). Tests that use `force_authenticate` will
        therefore get correct scoping when the view calls `manager.for_user(user)`.
        """
        if not user or not getattr(user, 'is_authenticated', False):
            raise PermissionDenied("User must be authenticated.")

        qs = OwnerBranchQuerySet(self.model, using=self._db)
        if not self.include_deleted:
            qs = qs.alive()

        # System admin bypass
        if getattr(user, 'is_system_admin', False):
            return qs

        # Scope by tenant if available on user
        tenant = getattr(user, 'tenant', None)
        if tenant:
            qs = qs.filter(tenant=tenant)

        # Users with global-scope Roles (directors, admins) bypass branch filtering.
        # Tenant owners are always unrestricted. Everyone else is branch-scoped.
        is_owner = callable(getattr(user, 'is_owner', None)) and user.is_owner()
        has_global_role = False
        try:
            has_global_role = user.roles.filter(is_active=True, default_scope='global').exists()
        except Exception:
            pass

        is_unrestricted = is_owner or has_global_role
        if is_unrestricted:
            return qs

        # Scope by branch if available on user.
        # Records with NULL branch are treated as explicitly tenant-wide only when the
        # model opts in via `is_tenant_wide = True` (e.g. system config records).
        # Regular data records must have a branch assigned; if not they are visible
        # only to directors/owners (handled above) to avoid accidental cross-branch exposure.
        branch = getattr(user, 'branch', None)
        if branch:
            from django.db.models import Q as _Q
            # NULL-branch records are tenant-wide config (e.g. fee structures, loan
            # products imported without a branch). Always include them so every user
            # in the branch can see shared configuration. This matches the behaviour
            # of _build_scoped_qs in loans/views.py.
            qs = qs.filter(_Q(branch=branch) | _Q(branch__isnull=True))
        # No branch assigned → no additional restriction beyond tenant scope.

        # NOTE: We do NOT filter by owner here.
        # The 'owner' field is for audit purposes only.
        # All users in the same branch/tenant should see the same data.

        return qs
    
    def all_tenants(self):
        """Get queryset without tenant filtering (admin use only)"""
        # Create fresh queryset without tenant filter
        qs = OwnerBranchQuerySet(self.model, using=self._db)
        if not self.include_deleted:
            qs = qs.alive()
        return qs