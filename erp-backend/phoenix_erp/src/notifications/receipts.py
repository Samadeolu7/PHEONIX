"""
Automatic SMS receipts to customers when money moves on their account.

Why: many customers can't use apps or the portal. A receipt on every
disbursement, repayment, deposit and withdrawal lets them notice money that
was taken but never recorded ("no SMS = not recorded — call us").

Safety rules (each one has a test):
* Off unless a director switched receipts on for the organisation.
* Only for postings made by a person working in the app (an HTTP request).
  Management commands, data repairs, imports and Celery batch jobs never text
  customers about internal corrections.
* Only for postings dated within the last RECENT_DAYS days (no back-dated
  corrections).
* Queued with transaction.on_commit, so nothing is sent for a posting that
  rolls back. The notification row is created inside the same transaction.
* Never raises: an SMS problem can't block or undo a financial posting.
* Plain GSM-7 text within 160 characters (one SMS unit): "NGN", not "₦",
  which would force UCS-2 (70 chars) and roughly double the cost.
* No NIN/BVN or full account numbers in the text.
"""
import logging
import re
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('notifications.receipts')

RECENT_DAYS = 2
SMS_LIMIT = 160
NG_MOBILE_RE = re.compile(r'^(?:\+?234|0)([789][01]\d{8})$')

EVENTS = {
    'loan_disbursement': 'send_loan_disbursement',
    'loan_repayment': 'send_loan_repayment',
    'savings_deposit': 'send_savings_deposit',
    'savings_withdrawal': 'send_savings_withdrawal',
}

_GSM7 = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)


def normalise_ng_mobile(phone):
    """'0803 123 4567' / '+2348031234567' → '+2348031234567'; None if not a NG mobile."""
    digits = re.sub(r'[^\d+]', '', phone or '')
    m = NG_MOBILE_RE.match(digits)
    return f'+234{m.group(1)}' if m else None


def _ngn(amount):
    return f"NGN{Decimal(amount or 0):,.2f}"


def _last4(value):
    s = str(value or '')
    return f'..{s[-4:]}' if len(s) > 4 else s


def _gsm_safe(text):
    return ''.join(ch if ch in _GSM7 else '?' for ch in text)


def _fit(parts):
    """Join parts, dropping optional tail parts until it fits one SMS."""
    required, optional = parts
    text = ' '.join(p for p in required if p)
    for p in optional:
        if p and len(text) + 1 + len(p) <= SMS_LIMIT:
            text = f'{text} {p}'
    return _gsm_safe(text[:SMS_LIMIT])


def build_message(event, *, brand, amount, when, label, reference='', balance=None, support_phone='', extra=''):
    brand = (brand or 'Notice')[:20]
    date = when.strftime('%d-%b-%y') if when else ''
    ref = f'Ref {reference}.' if reference else ''
    bal = f'Bal {_ngn(balance)}.' if balance is not None else ''
    call = f'Not you? Call {support_phone}' if support_phone else ''
    if event == 'loan_disbursement':
        head = f'{brand}: Loan {label} of {_ngn(amount)} disbursed {date}.'
    elif event == 'loan_repayment':
        head = f'{brand}: {_ngn(amount)} received for loan {label} on {date}.'
    elif event == 'savings_deposit':
        head = f'{brand}: {_ngn(amount)} deposited to savings {label} on {date}.'
    elif event == 'savings_withdrawal':
        head = f'{brand}: {_ngn(amount)} withdrawn from savings {label} on {date}.'
    else:
        raise ValueError(event)
    return _fit(([head, bal], [extra, ref, call]))


def _in_user_request():
    """True when called while serving an HTTP request (AuditContextMiddleware)."""
    try:
        from clients.signals import get_audit_context
        _user, ip = get_audit_context()
        return ip is not None
    except Exception:
        return False


def _settings_for(tenant):
    from .models import SmsReceiptSettings
    if tenant is None:
        return None
    return SmsReceiptSettings.objects.filter(tenant=tenant, is_enabled=True).first()


def queue_receipt(event, *, client, amount, label, when=None, reference='', balance=None,
                  extra='', related_object=None, branch=None, tenant=None, owner=None):
    """
    Create and queue an SMS receipt if every safety rule allows it.
    Returns the Notification or None. Never raises.
    """
    try:
        if event not in EVENTS or client is None:
            return None
        tenant = tenant or getattr(client, 'tenant', None)
        cfg = _settings_for(tenant)
        if cfg is None or not getattr(cfg, EVENTS[event]):
            return None
        if not _in_user_request():
            return None
        when = when or timezone.localdate()
        if isinstance(when, datetime):
            when = timezone.localtime(when).date() if timezone.is_aware(when) else when.date()
        if abs((timezone.localdate() - when).days) > RECENT_DAYS:
            return None
        phone = normalise_ng_mobile(getattr(client, 'phone_primary', ''))
        if not phone:
            return None

        from .models import Notification, NotificationChannel
        channel = NotificationChannel.objects.filter(code='sms', is_active=True).first()
        if channel is None:
            logger.warning('SMS receipts are on but no active "sms" channel is configured')
            return None

        message = build_message(
            event, brand=cfg.brand_name, amount=amount, when=when, label=label,
            reference=reference, balance=balance, support_phone=cfg.support_phone, extra=extra,
        )
        kwargs = dict(
            channel=channel, recipient_client=client, recipient_contact=phone,
            recipient_name=getattr(client, 'full_name', '')[:200],
            subject=event.replace('_', ' ').title(), message=message, priority='normal',
            status='pending', scheduled_for=timezone.now(), cost=channel.cost_per_unit,
            context_data={'event': event, 'reference': str(reference)},
            owner=owner or getattr(client, 'owner', None), branch=branch or getattr(client, 'branch', None),
            tenant=tenant,
        )
        if related_object is not None:
            from django.contrib.contenttypes.models import ContentType
            kwargs['content_type'] = ContentType.objects.get_for_model(related_object.__class__)
            kwargs['object_id'] = str(related_object.pk)
        notification = Notification.objects.create(**kwargs)

        def _send():
            try:
                from .tasks import send_notification_task
                send_notification_task.apply_async(args=[notification.pk], countdown=1)
            except Exception:
                logger.exception('Could not queue SMS receipt %s', notification.pk)

        transaction.on_commit(_send)
        return notification
    except Exception:
        logger.exception('SMS receipt (%s) skipped after an error', event)
        return None


def _account_balance(account_id):
    from accounts.models import Account
    return Account.objects.filter(pk=account_id).values_list('balance', flat=True).first()


# ── Convenience wrappers used from the money-movement methods ────────────────

def receipt_for_loan_disbursement(loan, journal_entry=None):
    freq = (loan.get_repayment_frequency_display() or '').lower()
    extra = f'Repay {_ngn(loan.installment_amount)} {freq}.' if loan.installment_amount else ''
    return queue_receipt(
        'loan_disbursement', client=loan.client, amount=loan.disbursed_amount, label=loan.loan_number,
        when=loan.disbursement_date, reference=getattr(journal_entry, 'reference_number', '') or '',
        extra=extra, related_object=loan, branch=loan.branch, tenant=loan.tenant,
    )


def receipt_for_loan_repayment(loan, amount, payment_date=None, journal_entry=None):
    balance = (loan.outstanding_principal + loan.outstanding_interest
               + loan.outstanding_fees + loan.outstanding_penalties)
    return queue_receipt(
        'loan_repayment', client=loan.client, amount=amount, label=loan.loan_number,
        when=payment_date, reference=getattr(journal_entry, 'reference_number', '') or '',
        balance=balance, related_object=loan, branch=loan.branch, tenant=loan.tenant,
    )


def receipt_for_savings(event, savings_account, amount, when=None, journal_entry=None):
    return queue_receipt(
        event, client=savings_account.client, amount=amount, label=_last4(savings_account.account_number),
        when=when, reference=getattr(journal_entry, 'reference_number', '') or '',
        balance=_account_balance(savings_account.account_id), related_object=savings_account,
        branch=savings_account.branch, tenant=getattr(savings_account, 'tenant', None),
    )
