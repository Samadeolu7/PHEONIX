"""
Directors manage SMS receipts from the ERP (no server access needed):

GET  /api/notifications/sms-receipts/            settings + provider (secrets never returned) + recent receipts
PUT  /api/notifications/sms-receipts/            save settings and provider
POST /api/notifications/sms-receipts/test/       send one test SMS to a number now

Directors = users with all-branch scope (owner, system admin, global-scope roles),
the same rule as Admin → Online Portal Settings. Every change is logged.
"""
import logging

from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification, NotificationChannel, SmsReceiptSettings
from .receipts import build_message, normalise_ng_mobile

logger = logging.getLogger('notifications.receipts')

PROVIDERS = ['log', 'termii', 'africas_talking', 'twilio']
# Non-secret provider fields that are safe to show back to the director.
PUBLIC_FIELDS = {'provider', 'sender_id', 'channel', 'username', 'from_number'}
SECRET_FIELDS = {'api_key', 'auth_token', 'account_sid'}


class IsDirector(permissions.BasePermission):
    message = 'Only directors can change SMS receipt settings.'

    def has_permission(self, request, view):
        from common.views import is_elevated_user
        u = request.user
        return bool(u and u.is_authenticated and getattr(u, 'tenant', None) and is_elevated_user(u))


class ReceiptSettingsSerializer(serializers.Serializer):
    is_enabled = serializers.BooleanField()
    brand_name = serializers.CharField(max_length=20, allow_blank=True)
    support_phone = serializers.CharField(max_length=20, allow_blank=True)
    send_loan_disbursement = serializers.BooleanField()
    send_loan_repayment = serializers.BooleanField()
    send_savings_deposit = serializers.BooleanField()
    send_savings_withdrawal = serializers.BooleanField()
    # Provider (stored on the shared 'sms' NotificationChannel)
    provider = serializers.ChoiceField(choices=PROVIDERS)
    sender_id = serializers.CharField(max_length=11, allow_blank=True, required=False, default='')
    channel = serializers.ChoiceField(choices=['dnd', 'generic'], required=False, default='dnd')
    username = serializers.CharField(max_length=100, allow_blank=True, required=False, default='')
    from_number = serializers.CharField(max_length=20, allow_blank=True, required=False, default='')
    # Write-only secrets: blank = keep the stored value.
    api_key = serializers.CharField(max_length=300, allow_blank=True, required=False, default='', write_only=True)
    auth_token = serializers.CharField(max_length=300, allow_blank=True, required=False, default='', write_only=True)
    account_sid = serializers.CharField(max_length=300, allow_blank=True, required=False, default='', write_only=True)

    def validate_sender_id(self, v):
        import re
        if v and not re.fullmatch(r'[A-Za-z0-9 ]{3,11}', v):
            raise serializers.ValidationError('Sender ID: 3–11 letters/numbers (network rule).')
        return v

    def validate_support_phone(self, v):
        if v and not normalise_ng_mobile(v) and not v.replace(' ', '').isdigit():
            raise serializers.ValidationError('Enter a phone number customers can call.')
        return v

    def validate(self, attrs):
        if attrs.get('is_enabled'):
            if not attrs.get('support_phone'):
                raise serializers.ValidationError({'support_phone': 'Required before switching receipts on.'})
            if attrs['provider'] != 'log' and not attrs.get('sender_id'):
                raise serializers.ValidationError({'sender_id': 'Required for a live provider.'})
        return attrs


def _channel():
    ch, _ = NotificationChannel.objects.get_or_create(
        code='sms', defaults={'name': 'SMS', 'provider': 'log', 'provider_config': {'provider': 'log'}},
    )
    return ch


def _payload(tenant):
    cfg, _ = SmsReceiptSettings.objects.get_or_create(tenant=tenant)
    ch = _channel()
    conf = ch.provider_config or {}
    recent = (Notification.objects.filter(channel=ch, tenant=tenant)
              .order_by('-created_at')
              .values('id', 'recipient_name', 'recipient_contact', 'message', 'status', 'error_message',
                      'created_at', 'sent_at')[:30])
    return {
        'settings': {f: getattr(cfg, f) for f in (
            'is_enabled', 'brand_name', 'support_phone', 'send_loan_disbursement', 'send_loan_repayment',
            'send_savings_deposit', 'send_savings_withdrawal')},
        'provider': {k: conf.get(k, '') for k in PUBLIC_FIELDS} | {
            'provider': conf.get('provider', ch.provider or 'log'),
            'channel': conf.get('channel', 'dnd'),
            'secrets_saved': sorted(k for k in SECRET_FIELDS if conf.get(k)),
        },
        'channel_active': ch.is_active,
        'sample': build_message('loan_repayment', brand=cfg.brand_name or 'KTIL', amount=5000,
                                when=timezone.localdate(),
                                label='LN-20261115-AB12CD', reference='TXN-000123', balance=45000,
                                support_phone=cfg.support_phone or '0700 000 0000'),
        'recent': [
            {**r, 'recipient_contact': (r['recipient_contact'] or '')[:-4] + '****'} for r in recent
        ],
    }


class SmsReceiptSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsDirector]

    def get(self, request):
        return Response(_payload(request.user.tenant))

    def put(self, request):
        ser = ReceiptSettingsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        cfg, _ = SmsReceiptSettings.objects.get_or_create(tenant=request.user.tenant)
        for f in ('is_enabled', 'brand_name', 'support_phone', 'send_loan_disbursement', 'send_loan_repayment',
                  'send_savings_deposit', 'send_savings_withdrawal'):
            setattr(cfg, f, d[f])
        cfg.updated_by = request.user
        cfg.save()

        ch = _channel()
        conf = dict(ch.provider_config or {})
        conf.update({'provider': d['provider'], 'sender_id': d.get('sender_id', ''), 'channel': d.get('channel', 'dnd'),
                     'username': d.get('username', ''), 'from_number': d.get('from_number', '')})
        for k in SECRET_FIELDS:
            if d.get(k):
                conf[k] = d[k]
        ch.provider = d['provider']
        ch.provider_config = conf
        ch.is_active = True
        ch.save()

        logger.info('SMS receipt settings changed by user %s (enabled=%s provider=%s)',
                    request.user.pk, cfg.is_enabled, d['provider'])
        return Response(_payload(request.user.tenant))


class SmsReceiptTestView(APIView):
    """Send one test SMS right now through the configured provider and report the result."""
    permission_classes = [permissions.IsAuthenticated, IsDirector]

    def post(self, request):
        phone = normalise_ng_mobile(request.data.get('phone', ''))
        if not phone:
            return Response({'phone': ['Enter a Nigerian mobile number, e.g. 08031234567.']},
                            status=status.HTTP_400_BAD_REQUEST)
        from .providers import SMSProvider
        ch = _channel()
        cfg = SmsReceiptSettings.objects.filter(tenant=request.user.tenant).first()
        brand = (cfg.brand_name if cfg else '') or 'Test'
        result = SMSProvider().send(
            recipient=phone, subject='Test',
            message=f'{brand}: test message from your ERP. SMS receipts are set up correctly.',
            channel_config=ch.provider_config or {},
        )
        ok = bool(result.get('success'))
        return Response({
            'success': ok,
            'test_mode': (ch.provider_config or {}).get('provider', 'log') == 'log',
            'error': '' if ok else str(result.get('error', 'Sending failed'))[:300],
        }, status=status.HTTP_200_OK if ok else status.HTTP_502_BAD_GATEWAY)
