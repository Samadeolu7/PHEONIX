"""
STAGING=true must never contact a real person (docs/STAGING.md).

These tests prove that, with the switch on:
  - no email reaches a client address (redirected to one inbox, or log only);
  - SMS, WhatsApp, Telegram and push providers make no network call;
  - director Telegram alerts are not even queued.
They also prove the switch is off by default, so production is unchanged.
"""
import io
import socket
from contextlib import redirect_stdout
from unittest import mock

from django.conf import settings
from django.core import mail
from django.core.mail import EmailMessage, send_mail
from django.test import SimpleTestCase, TestCase, override_settings

from common.staging import StagingEmailBackend, blocked_in_staging, is_staging
from common.staging_config import (
    CONSOLE_EMAIL_BACKEND, SMTP_EMAIL_BACKEND, STAGING_EMAIL_BACKEND, env_flag, staging_email_settings,
)

LOCMEM = 'django.core.mail.backends.locmem.EmailBackend'
INBOX = 'staging-inbox@example.test'
CLIENT = 'real.client@gmail.com'


def _no_network():
    """Patch every way Python opens a TCP connection to fail the test loudly."""
    def boom(*a, **k):
        raise AssertionError(f'network call attempted: {a!r}')
    return [
        mock.patch.object(socket.socket, 'connect', boom),
        mock.patch.object(socket.socket, 'connect_ex', boom),
        mock.patch('socket.create_connection', boom),
    ]


class NoNetworkMixin:
    def setUp(self):
        super().setUp()
        for p in _no_network():
            p.start()
            self.addCleanup(p.stop)


class SwitchDefaultsTests(SimpleTestCase):
    def test_env_flag(self):
        for v in ('true', 'True', 'TRUE', '1', 'yes', 'on', ' true '):
            self.assertTrue(env_flag(v), v)
        for v in (None, '', 'false', 'False', '0', 'no', 'off', 'staging'):
            self.assertFalse(env_flag(v), v)

    def test_off_by_default(self):
        # The test runner sets no STAGING env var, exactly like production.
        self.assertFalse(settings.STAGING)
        self.assertFalse(is_staging())
        self.assertNotEqual(settings.EMAIL_BACKEND, STAGING_EMAIL_BACKEND)

    def test_without_redirect_the_inner_backend_never_delivers(self):
        for configured in (SMTP_EMAIL_BACKEND, '', 'some.custom.Backend', STAGING_EMAIL_BACKEND):
            backend, inner = staging_email_settings(configured, '')
            self.assertEqual(backend, STAGING_EMAIL_BACKEND)
            self.assertEqual(inner, CONSOLE_EMAIL_BACKEND, configured)
        self.assertEqual(staging_email_settings(LOCMEM, ''), (STAGING_EMAIL_BACKEND, LOCMEM))

    def test_with_redirect_the_configured_backend_is_wrapped(self):
        self.assertEqual(staging_email_settings(SMTP_EMAIL_BACKEND, INBOX), (STAGING_EMAIL_BACKEND, SMTP_EMAIL_BACKEND))
        self.assertEqual(staging_email_settings('', INBOX), (STAGING_EMAIL_BACKEND, SMTP_EMAIL_BACKEND))
        self.assertEqual(staging_email_settings(STAGING_EMAIL_BACKEND, INBOX), (STAGING_EMAIL_BACKEND, SMTP_EMAIL_BACKEND))


@override_settings(STAGING=True, EMAIL_BACKEND=STAGING_EMAIL_BACKEND,
                   STAGING_EMAIL_INNER_BACKEND=LOCMEM, STAGING_EMAIL_REDIRECT=INBOX)
class EmailRedirectTests(NoNetworkMixin, SimpleTestCase):
    def test_send_mail_goes_only_to_the_test_inbox(self):
        send_mail('Your loan', 'Hello', 'noreply@example.test', [CLIENT, 'other@yahoo.com'])
        self.assertEqual(len(mail.outbox), 1)
        m = mail.outbox[0]
        self.assertEqual(m.to, [INBOX])
        self.assertEqual(m.cc, [])
        self.assertEqual(m.bcc, [])
        self.assertTrue(m.subject.startswith('[STAGING] '))
        self.assertIn(CLIENT, m.extra_headers['X-Staging-Original-To'])
        self.assertIn(CLIENT, m.body)  # so testers can see who it was for

    def test_cc_and_bcc_are_dropped(self):
        EmailMessage('S', 'B', 'noreply@example.test', [CLIENT], cc=['cc@x.com'], bcc=['bcc@x.com']).send()
        m = mail.outbox[0]
        recipients = m.recipients()
        self.assertEqual(recipients, [INBOX])

    def test_portal_emails_are_redirected(self):
        from portal.services import _send
        self.assertTrue(_send('Invitation', 'Click here', CLIENT))
        self.assertEqual(mail.outbox[0].recipients(), [INBOX])

    def test_email_provider_is_redirected(self):
        from notifications.providers import EmailProvider
        res = EmailProvider().send(recipient=CLIENT, subject='S', message='M', html_message='<b>M</b>')
        self.assertTrue(res['success'])
        self.assertEqual(mail.outbox[0].recipients(), [INBOX])


@override_settings(STAGING=True, EMAIL_BACKEND=STAGING_EMAIL_BACKEND,
                   STAGING_EMAIL_INNER_BACKEND=SMTP_EMAIL_BACKEND, STAGING_EMAIL_REDIRECT='')
class EmailLogOnlyTests(NoNetworkMixin, SimpleTestCase):
    def test_smtp_is_refused_without_a_redirect_inbox(self):
        # Even if STAGING_EMAIL_INNER_BACKEND somehow says SMTP, no redirect
        # means the wrapper falls back to printing.
        backend = StagingEmailBackend()
        self.assertEqual(type(backend.inner).__module__, 'django.core.mail.backends.console')
        out = io.StringIO()
        with mock.patch('smtplib.SMTP') as smtp, mock.patch('smtplib.SMTP_SSL') as smtp_ssl:
            with redirect_stdout(out):
                # console backend writes to sys.stdout at construction time
                send_mail('Hi', 'Body', 'noreply@example.test', [CLIENT])
            smtp.assert_not_called()
            smtp_ssl.assert_not_called()


@override_settings(STAGING=True)
class ProviderNoOpTests(NoNetworkMixin, TestCase):
    def _assert_suppressed(self, res):
        self.assertTrue(res['success'])
        self.assertTrue(res.get('staging_suppressed'))

    def test_every_outbound_provider_is_a_no_op(self):
        """Sweep the sender's real provider table, so a new provider can't slip through."""
        from notifications.services import NotificationSender
        providers = NotificationSender().providers
        configs = {
            'sms': [{'provider': 'termii', 'api_key': 'k'}, {'provider': 'twilio', 'account_sid': 'a', 'auth_token': 'b'},
                    {'provider': 'africas_talking', 'api_key': 'k'}],
            'whatsapp': [{'provider': 'twilio'}, {'provider': 'termii', 'api_key': 'k'}],
            'telegram': [{'bot_token': 'real-looking-token', 'chat_id': '-100123'}],
            'push': [{'provider': 'firebase'}, {'provider': 'onesignal', 'app_id': 'a', 'api_key': 'k'}],
        }
        safe = {'email', 'in_app'}  # email is covered by the email backend tests
        self.assertEqual(set(providers) - safe, set(configs), 'new provider: add it here and to blocked_in_staging')
        with mock.patch('notifications.providers.requests.post') as post, \
                mock.patch('notifications.providers.requests.get') as get:
            for code, cfgs in configs.items():
                for cfg in cfgs:
                    with self.subTest(code=code, cfg=cfg.get('provider')):
                        self._assert_suppressed(providers[code].send(
                            recipient='08031234567', subject='S', message='M', channel_config=cfg))
                        status = providers[code].check_status(message_id='x', channel_config=cfg)
                        self.assertFalse(status['delivered'])
            post.assert_not_called()
            get.assert_not_called()

    def test_sender_marks_suppressed_message_without_contacting_anyone(self):
        from notifications.models import Notification, NotificationChannel
        from notifications.services import NotificationSender
        channel, _ = NotificationChannel.objects.get_or_create(
            code='sms', defaults={'name': 'SMS', 'provider': 'termii', 'provider_config': {'api_key': 'k'}})
        n = Notification.objects.create(channel=channel, recipient_contact='08031234567',
                                        recipient_name='Ada', subject='S', message='M', status='pending')
        with mock.patch('notifications.providers.requests.post') as post:
            self.assertTrue(NotificationSender().send(n))
            post.assert_not_called()
        self.assertEqual(n.provider_message_id, 'staging-suppressed')
        self.assertTrue(n.provider_response.get('staging_suppressed'))
        n.refresh_from_db()
        self.assertEqual(n.status, 'sent')  # handled; the provider was never called

    def test_director_telegram_alerts_are_not_queued(self):
        from notifications.models import Notification, NotificationChannel
        from notifications.telegram_alerts import notify_directors
        NotificationChannel.objects.get_or_create(code='telegram', defaults={'name': 'Telegram', 'provider': 'telegram'})
        before = Notification.objects.count()
        with mock.patch('notifications.telegram_alerts._queue') as queue:
            self.assertIsNone(notify_directors('x', 'S', 'M', owner=None, branch=None))
            queue.assert_not_called()
        self.assertEqual(Notification.objects.count(), before)

    def test_telegram_credentials_are_blank_in_staging_settings(self):
        # settings.py blanks these when STAGING is on at start-up; prove the
        # provider still refuses even if a token is supplied per channel.
        from notifications.providers import TelegramProvider
        with mock.patch('notifications.providers.requests.post') as post:
            self._assert_suppressed(TelegramProvider().send(
                recipient='-100', subject='S', message='M', channel_config={'bot_token': 't'}))
            post.assert_not_called()


class ProvidersStillWorkInProductionTests(SimpleTestCase):
    """Control: with the switch off the same calls DO reach the provider (so the
    patches above are aimed at the right place)."""

    def test_termii_and_telegram_call_out_when_not_staging(self):
        from notifications.providers import SMSProvider, TelegramProvider
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'ok': True, 'result': {'message_id': 1}, 'message_id': 'm1', 'code': 'ok'}
        with mock.patch('notifications.providers.requests.post', return_value=resp) as post:
            SMSProvider().send(recipient='08031234567', subject='', message='M',
                               channel_config={'provider': 'termii', 'api_key': 'k'})
            TelegramProvider().send(recipient='-100', subject='S', message='M', channel_config={'bot_token': 't'})
        self.assertEqual(post.call_count, 2)

    def test_decorator_passes_through_when_off(self):
        class P:
            @blocked_in_staging('X')
            def send(self, recipient, subject, message, html_message='', channel_config=None):
                return {'success': True, 'real': True}
        self.assertTrue(P().send(recipient='r', subject='s', message='m')['real'])
