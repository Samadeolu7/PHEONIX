"""
permissions/tasks.py

Celery periodic tasks for the permission expiry engine.

Schedule (configured via django-celery-beat):
  process_expired_permission_overrides — every hour
  send_expiry_warning_notifications    — every hour
"""

import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='permissions.process_expired_overrides', bind=True, max_retries=3)
def process_expired_permission_overrides(self):
    """
    Find all overrides that have passed their expiry point and apply the
    configured expiry behavior (auto_revoke / auto_suspend / alert_only).

    Runs every hour.
    """
    from permissions.models import UserPermissionOverride
    from notifications.models import Notification  # noqa: F401 — may not exist yet

    now = timezone.now()
    processed = 0
    errors    = 0

    # Fetch all active, non-permanent overrides whose time-based expiry has passed
    candidates = UserPermissionOverride.objects.filter(
        is_active=True,
        is_suspended=False,
    ).exclude(expiry_type=UserPermissionOverride.EXPIRY_PERMANENT).select_related('user', 'granted_by')

    for override in candidates:
        if not override.is_expired:
            continue

        try:
            _apply_expiry_behavior(override, now)
            processed += 1
        except Exception as exc:
            logger.exception('Error processing override %s expiry: %s', override.pk, exc)
            errors += 1

    logger.info(
        'process_expired_overrides: processed=%d errors=%d',
        processed, errors,
    )
    return {'processed': processed, 'errors': errors}


@shared_task(name='permissions.send_expiry_warnings', bind=True, max_retries=3)
def send_expiry_warning_notifications(self):
    """
    Send advance warning notifications for overrides expiring within the next 24 hours.
    Avoids duplicate notifications by checking if a warning was already sent today.

    Runs every hour.
    """
    from permissions.models import UserPermissionOverride

    now        = timezone.now()
    warning_dt = now + timezone.timedelta(hours=24)
    warned     = 0

    candidates = UserPermissionOverride.objects.filter(
        is_active=True,
        is_suspended=False,
        is_elevated=True,
    ).exclude(expiry_type=UserPermissionOverride.EXPIRY_PERMANENT).select_related('user', 'granted_by')

    for override in candidates:
        expires = override.effective_expires_at
        if expires is None:
            continue
        if now < expires <= warning_dt:
            hours_left = override.hours_until_expiry
            _send_expiry_warning(override, hours_left)
            warned += 1

    logger.info('send_expiry_warnings: warned=%d', warned)
    return {'warned': warned}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _apply_expiry_behavior(override: 'UserPermissionOverride', now):
    """Apply the configured expiry behavior to an expired override."""
    behavior = override.expiry_behavior

    if behavior == override.BEHAVIOR_REVOKE:
        override.is_active    = False
        override.revoked_at   = now
        override.revoke_reason = 'Auto-revoked on expiry'
        override.save(update_fields=['is_active', 'revoked_at', 'revoke_reason', 'is_elevated'])
        _notify_expiry(override, 'revoked')

    elif behavior == override.BEHAVIOR_SUSPEND:
        override.is_suspended = True
        override.save(update_fields=['is_suspended', 'is_elevated'])
        _notify_expiry(override, 'suspended')

    elif behavior == override.BEHAVIOR_ALERT:
        # Keep active — just send a notification
        _notify_expiry(override, 'alert_only')


def _notify_expiry(override, action: str):
    """
    Send an in-app notification to the affected user, the granter, and any
    user with the Auditor role in the same tenant.
    """
    try:
        from notifications.models import Notification

        user    = override.user
        tenant  = getattr(user, 'tenant', None)
        target  = override.action or override.page or override.module
        target_label = str(target) if target else 'all permissions'

        messages = {
            'revoked':    f'Your elevated permission override on "{target_label}" has been auto-revoked.',
            'suspended':  f'Your elevated permission override on "{target_label}" has been auto-suspended pending review.',
            'alert_only': f'Your elevated permission override on "{target_label}" has expired. '
                          f'It remains active per configuration — please review.',
        }
        msg = messages.get(action, f'Permission override on "{target_label}" has expired.')

        # Notify the user
        Notification.objects.create(
            user=user,
            message=msg,
            notification_type='permission_expiry',
            tenant=tenant,
        )

        # Notify the granter
        if override.granted_by and override.granted_by != user:
            Notification.objects.create(
                user=override.granted_by,
                message=f'Permission override you granted to {user} on "{target_label}" has expired ({action}).',
                notification_type='permission_expiry',
                tenant=tenant,
            )

        # Notify auditors (users with roles named 'Auditor' in the same tenant)
        if tenant:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            auditors = User.objects.filter(
                tenant=tenant,
                roles__name__iexact='Auditor',
                is_active=True,
            ).exclude(id=user.id).distinct()
            for auditor in auditors:
                Notification.objects.create(
                    user=auditor,
                    message=f'Elevated permission override for {user} on "{target_label}" expired ({action}).',
                    notification_type='permission_expiry',
                    tenant=tenant,
                )
    except Exception as exc:
        logger.warning('Could not send expiry notification for override %s: %s', override.pk, exc)


def _send_expiry_warning(override, hours_left):
    """Send a 'will expire soon' warning notification."""
    try:
        from notifications.models import Notification

        user         = override.user
        tenant       = getattr(user, 'tenant', None)
        target       = override.action or override.page or override.module
        target_label = str(target) if target else 'all permissions'
        hours_str    = f'{hours_left:.0f}' if hours_left is not None else 'less than 24'

        Notification.objects.create(
            user=user,
            message=(
                f'Your elevated permission override on "{target_label}" will expire '
                f'in approximately {hours_str} hour(s).'
            ),
            notification_type='permission_expiry_warning',
            tenant=tenant,
        )
    except Exception as exc:
        logger.warning('Could not send expiry warning for override %s: %s', override.pk, exc)
