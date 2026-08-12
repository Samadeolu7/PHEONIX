"""Shared role/permission helpers for the threads app.

Split out from views.py so serializers.py (which views.py already imports
from) can compute the same permission flags for API responses without a
circular import.
"""
from django.db.models import Q


def is_director(user):
    """True if the user has global scope (director / owner / system admin)."""
    if getattr(user, 'is_system_admin', False):
        return True
    if callable(getattr(user, 'is_owner', None)) and user.is_owner():
        return True
    try:
        return user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        return False


def is_branch_manager(user):
    """True if the user is a branch manager (or any higher role)."""
    if is_director(user):
        return True
    try:
        return user.roles.filter(is_active=True, name__icontains='manager').exists()
    except Exception:
        return False


def directors_for_tenant(tenant):
    """All director-equivalent users for a tenant — same criteria as
    is_director, expressed as a queryset for bulk notification fan-out."""
    from django.contrib.auth import get_user_model
    UserModel = get_user_model()
    return UserModel.objects.filter(tenant=tenant, is_active=True).filter(
        Q(is_system_admin=True) |
        Q(tenant_owned__isnull=False) |
        Q(roles__is_active=True, roles__default_scope='global')
    ).distinct()


def branch_managers_for_branch(tenant, branch):
    """Branch Manager users scoped to one specific branch (not tenant-wide)."""
    from django.contrib.auth import get_user_model
    UserModel = get_user_model()
    if not branch:
        return UserModel.objects.none()
    return UserModel.objects.filter(
        tenant=tenant, branch=branch, is_active=True,
        roles__name='Branch Manager', roles__is_active=True,
    ).distinct()


def thread_permissions_for_user(thread, user):
    """Compute what a given user can actually do to a thread, so the
    frontend never has to guess and render a button that will 403."""
    director = is_director(user)
    branch_manager = is_branch_manager(user)
    is_initiator = thread.initiated_by_id == user.pk

    is_participant = thread.participants.filter(user=user, is_deleted=False).exists()
    can_add_participants = is_initiator or director or thread.participants.filter(
        user=user, can_add_participants=True, is_deleted=False
    ).exists()

    can_reopen = director or (branch_manager and thread.branch_id == getattr(user, 'branch_id', None))

    return {
        'can_edit': is_initiator or director,
        'can_close': is_initiator or director,
        'can_reopen': can_reopen,
        'can_add_participants': can_add_participants,
        'is_participant': is_participant,
        # Oversight visibility (Director/Branch Manager can see it) without
        # being a tagged participant — see ThreadViewSet.get_queryset.
        'is_observer': not is_participant and (director or branch_manager),
    }
