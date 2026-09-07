# notifications/telegram_alerts.py
"""Fire-and-forget Telegram alerts to the directors/branch-manager group
chat for director-level approvals and disbursement events.

Bypasses NotificationService.send_from_template (built around a single
named User/Client recipient) since a fixed group broadcast has no such
recipient — a Notification row is created directly against the 'telegram'
NotificationChannel and queued the same way _queue_notification does.
"""
from django.db import transaction
from django.contrib.contenttypes.models import ContentType
import logging

logger = logging.getLogger(__name__)


def notify_directors(event_code: str, subject: str, message: str, *, owner, branch, related_object=None):
    """Queue a Telegram alert to the directors/BM group chat.

    Never raises — a notification problem must not block the
    approval/disbursement action it's reporting on. Callers should still
    wrap the call in their own try/except as defence-in-depth on a
    financial code path, but this function guards itself regardless.
    """
    try:
        from .models import Notification, NotificationChannel

        channel = NotificationChannel.objects.filter(code='telegram', is_active=True).first()
        if not channel:
            logger.warning(
                "No active 'telegram' NotificationChannel found — skipping alert '%s' "
                "(see migration 0005_seed_telegram_channel).",
                event_code,
            )
            return None

        # Deliberately NOT resolving/requiring TELEGRAM_CHAT_ID here: this
        # function runs wherever the approval/disbursement call site runs
        # (the web/backend process), but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID
        # are only set on the celery_worker container (see docker-compose.yml)
        # since that's the only process that actually calls the Telegram API
        # (TelegramProvider.send(), via send_notification_task). Resolution
        # happens there instead — recipient_contact is left to
        # channel.provider_config['chat_id'] if set, otherwise blank, and
        # TelegramProvider.send() falls back to settings.TELEGRAM_CHAT_ID at
        # send time. A genuinely missing config surfaces as a failed
        # Notification (visible via admin/audit trail) instead of silently
        # never being created.
        chat_id = channel.provider_config.get('chat_id', '')

        content_type = None
        object_id = ''
        if related_object is not None:
            content_type = ContentType.objects.get_for_model(related_object)
            object_id = str(related_object.pk)

        notification = Notification.objects.create(
            channel=channel,
            recipient_contact=str(chat_id),
            recipient_name='Directors & Branch Managers',
            subject=subject,
            message=message,
            context_data={'event_code': event_code},
            priority='high',
            status='pending',
            content_type=content_type,
            object_id=object_id,
            owner=owner,
            branch=branch,
            tenant=getattr(owner, 'tenant', None),
        )

        transaction.on_commit(lambda: _queue(notification.id))
        return notification

    except Exception:
        logger.exception("Failed to queue Telegram alert '%s'", event_code)
        return None


def _queue(notification_id: int):
    from .tasks import send_notification_task
    send_notification_task.apply_async(args=[notification_id], countdown=1)


def _pending_disbursement_lines():
    """One formatted line per disbursement currently sitting in 'approved'
    and awaiting a distinct person to execute it — across both petty cash
    (bank-transfer-mode funds only) and loans. Each line is tagged with its
    branch since this is a cross-branch, single group chat.
    """
    lines = []

    try:
        from cash_management.models import PettyCashVoucher
        for v in (
            PettyCashVoucher.objects
            .filter(status='approved', fund__disbursement_mode='bank_transfer')
            .select_related('fund', 'branch', 'payee_staff')
            .order_by('approved_at')
        ):
            payee = (
                f"{v.payee_staff.first_name} {v.payee_staff.last_name}".strip()
                if v.payee_staff_id else v.payee_name
            )
            branch_name = v.branch.name if v.branch else 'Unknown branch'
            lines.append(
                f"• [Petty Cash] {v.voucher_number} — ₦{v.amount:,.2f} — {payee} — {branch_name}"
            )
    except Exception:
        logger.exception("Failed to list pending petty cash disbursements for alert")

    try:
        from loans.models import LoanDisbursement
        for d in (
            LoanDisbursement.objects
            .filter(status='approved')
            .select_related('loan', 'loan__client', 'loan__branch')
            .order_by('approved_at')
        ):
            branch_name = d.loan.branch.name if d.loan.branch else 'Unknown branch'
            lines.append(
                f"• [Loan] {d.loan.loan_number} — ₦{d.loan.principal_amount:,.2f} — "
                f"{d.loan.client} — {branch_name}"
            )
    except Exception:
        logger.exception("Failed to list pending loan disbursements for alert")

    return lines


def notify_pending_disbursements(
    event_code: str, subject: str, new_item_line: str, *, owner, branch, related_object=None
):
    """Like notify_directors, but the message body carries the FULL current
    list of everything approved and awaiting execution (petty cash +
    loans), not just the item that just became pending — so a stale item
    keeps surfacing on every subsequent alert until it's actually executed
    or rejected, without needing a separate scheduled/cron reminder.

    Only fires when something NEW enters the pending queue (called from the
    same approve() call sites as before) — there is no periodic re-send if
    the queue sits unchanged; the list only resurfaces piggybacked on the
    next new approval.
    """
    lines = _pending_disbursement_lines()
    body = new_item_line
    if lines:
        body += "\n\n📋 All pending disbursements:\n" + "\n".join(lines)
    return notify_directors(event_code, subject, body, owner=owner, branch=branch, related_object=related_object)
