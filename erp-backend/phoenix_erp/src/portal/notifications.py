"""
In-app (bell) notifications for staff about portal activity.

Same approach as hr/notifications.py: create Notification rows directly on
the 'in_app' channel (no template seeding needed) and push a realtime event.
Every function swallows its own errors — a notification problem must never
block the customer's action. Messages carry no identity numbers (NIN/BVN)
or account details; staff open the record in the ERP for those.
"""
import logging

logger = logging.getLogger('portal')

MAX_RECIPIENTS = 10


def _can_view(user, module, page):
    from permissions.services import PermissionResolver
    try:
        return bool(PermissionResolver.resolve(user, module=module, page=page).can_view)
    except Exception:
        return False


def _branch_staff_with(branch, module, page, limit=MAX_RECIPIENTS):
    from users.models import User
    if branch is None:
        return []
    out = []
    for user in User.objects.filter(branch=branch, is_active=True).order_by('id')[:60]:
        if getattr(user, 'is_active_user', True) and _can_view(user, module, page):
            out.append(user)
            if len(out) >= limit:
                break
    return out


def _send(recipients, *, subject, message, tenant, branch, related_object):
    from hr.notifications import _create_notification
    owner = getattr(tenant, 'owner', None)
    for user in recipients:
        try:
            _create_notification(
                recipient=user, subject=subject, message=message, owner=owner or user,
                branch=branch, created_by=None, related_object=related_object,
            )
        except Exception:
            logger.exception('Portal notification to user %s failed', user.pk)


def notify_new_application(application):
    try:
        recipients = _branch_staff_with(application.branch, 'loans', 'online-loan-applications')
        _send(
            recipients,
            subject='New online loan application',
            message=(
                f'{application.full_name} applied online for ₦{application.requested_amount:,.0f} '
                f'({application.loan_product.product.name}) at {application.branch.name}. '
                f'Reference {application.reference}. Open Loans → Online Applications to review.'
            ),
            tenant=application.tenant, branch=application.branch, related_object=application,
        )
    except Exception:
        logger.exception('Failed to notify staff about application %s', application.pk)


def notify_new_withdrawal(withdrawal):
    """The client's own officer/manager first; otherwise branch withdrawal staff."""
    try:
        client = withdrawal.savings_account.client
        recipients = []
        for staff in (client.account_manager, client.assigned_officer):
            user = getattr(staff, 'user', None) if staff else None
            if user and user.is_active and user not in recipients:
                recipients.append(user)
        if not recipients:
            recipients = _branch_staff_with(withdrawal.branch, 'savings', 'savings-withdrawals')
        _send(
            recipients,
            subject='Online withdrawal request',
            message=(
                f'{client.full_name} asked online to withdraw ₦{withdrawal.amount:,.2f} from '
                f'{withdrawal.savings_account.account_number} ({withdrawal.get_payout_preference_display().lower()}). '
                f'Reference {withdrawal.reference}. Confirm with the client, then open '
                f'Savings → Online Withdrawal Requests.'
            ),
            tenant=withdrawal.tenant, branch=withdrawal.branch, related_object=withdrawal,
        )
    except Exception:
        logger.exception('Failed to notify staff about withdrawal %s', withdrawal.pk)
