"""
Django signals for automatic Customer Audit Trail logging (Feature #4).

The pre_save signal captures the old field values before the save, and the
post_save signal compares them with the new values to write a CustomerAuditLog
entry.  The request context (user + IP) is threaded via a lightweight
thread-local store so the signal handler can access it without changing any
existing call sites.
"""

import threading
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

_request_local = threading.local()

# Fields we do NOT want to track (noisy or binary blobs)
_SKIP_FIELDS = frozenset({
    'metadata', 'image', 'signature', 'updated_at',
})


def set_audit_context(user=None, ip_address=None):
    """
    Store the current request's user and IP in thread-local storage so that
    the signal handler can access them.  Call this at the top of any view or
    serializer that modifies a Client.

    In practice the middleware below calls this automatically for every request.
    """
    _request_local.user = user
    _request_local.ip_address = ip_address


def get_audit_context():
    return (
        getattr(_request_local, 'user', None),
        getattr(_request_local, 'ip_address', None),
    )


def clear_audit_context():
    _request_local.user = None
    _request_local.ip_address = None


# ─── Capture old values before save ──────────────────────────────────────────

@receiver(pre_save, sender='clients.Client')
def _capture_old_client_values(sender, instance, **kwargs):
    """Stash the current DB state on the instance before the save overwrites it."""
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._pre_save_snapshot = {
                f.attname: getattr(old, f.attname)
                for f in sender._meta.get_fields()
                if hasattr(f, 'attname') and f.attname not in _SKIP_FIELDS
            }
        except sender.DoesNotExist:
            instance._pre_save_snapshot = None
    else:
        instance._pre_save_snapshot = None


# ─── Write audit entry after save ────────────────────────────────────────────

@receiver(post_save, sender='clients.Client')
def _log_client_change(sender, instance, created, **kwargs):
    """Compare old/new values and write a CustomerAuditLog entry."""
    from clients.models import CustomerAuditLog  # local import to avoid circular

    user, ip_address = get_audit_context()

    if created:
        CustomerAuditLog.log(
            client=instance,
            action='created',
            user=user,
            ip_address=ip_address,
            description=f'Client profile created: {instance.full_name}',
        )
        return

    old_snapshot = getattr(instance, '_pre_save_snapshot', None)
    if not old_snapshot:
        return

    changed_fields = []
    old_values = {}
    new_values = {}

    for f in sender._meta.get_fields():
        if not hasattr(f, 'attname'):
            continue
        attr = f.attname
        if attr in _SKIP_FIELDS:
            continue
        old_val = old_snapshot.get(attr)
        new_val = getattr(instance, attr, None)
        # Normalise to comparable types
        if str(old_val) != str(new_val):
            changed_fields.append(attr)
            old_values[attr] = str(old_val) if old_val is not None else None
            new_values[attr] = str(new_val) if new_val is not None else None

    if not changed_fields:
        return

    # Determine action from what changed
    if 'status' in changed_fields:
        action = 'status_changed'
    elif 'kyc_status' in changed_fields:
        action = 'kyc_updated'
    elif 'assigned_officer_id' in changed_fields:
        action = 'assigned_officer_changed'
    elif 'account_manager_id' in changed_fields:
        action = 'account_manager_changed'
    elif 'is_deleted' in changed_fields:
        action = 'deleted' if new_values.get('is_deleted') == 'True' else 'restored'
    else:
        action = 'updated'

    CustomerAuditLog.log(
        client=instance,
        action=action,
        user=user,
        ip_address=ip_address,
        changed_fields=changed_fields,
        old_values=old_values,
        new_values=new_values,
        description=f'Fields changed: {", ".join(changed_fields)}',
    )
