"""
Runtime pieces of the STAGING safety switch (settings.STAGING).

A staging server is a test copy of Phoenix that must never contact a real
person. phoenix/settings.py routes all Django email through
StagingEmailBackend when STAGING is on; notifications/providers.py uses
blocked_in_staging() to turn SMS, WhatsApp, Telegram and push into no-ops.
"""
import functools
import logging

from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.backends.base import BaseEmailBackend

from .staging_config import CONSOLE_EMAIL_BACKEND, NON_DELIVERING_EMAIL_BACKENDS, STAGING_EMAIL_BACKEND

logger = logging.getLogger(__name__)

SUBJECT_PREFIX = '[STAGING] '


def is_staging() -> bool:
    return bool(getattr(settings, 'STAGING', False))


class StagingEmailBackend(BaseEmailBackend):
    """
    Wraps the real email backend so that no client address is ever used.

    With settings.STAGING_EMAIL_REDIRECT set, every message is re-addressed to
    that single inbox (To/Cc/Bcc are replaced; the original recipients are
    kept in an X-Staging-Original-To header and at the top of the body).
    Without it, the inner backend is a non-delivering one (console/locmem/
    file/dummy) and is checked again here at send time.
    """

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.redirect = (getattr(settings, 'STAGING_EMAIL_REDIRECT', '') or '').strip()
        inner = getattr(settings, 'STAGING_EMAIL_INNER_BACKEND', '') or CONSOLE_EMAIL_BACKEND
        if inner == STAGING_EMAIL_BACKEND or (not self.redirect and inner not in NON_DELIVERING_EMAIL_BACKENDS):
            # Never deliver without a redirect inbox, whatever the settings say.
            inner = CONSOLE_EMAIL_BACKEND
        self.inner = get_connection(inner, fail_silently=fail_silently, **kwargs)

    def open(self):
        return self.inner.open()

    def close(self):
        return self.inner.close()

    def _readdress(self, message):
        original = list(message.to or []) + list(message.cc or []) + list(message.bcc or [])
        message.extra_headers = dict(message.extra_headers or {})
        message.extra_headers['X-Staging-Original-To'] = ', '.join(original)
        if not (message.subject or '').startswith(SUBJECT_PREFIX):
            message.subject = SUBJECT_PREFIX + (message.subject or '')
        if self.redirect:
            message.to = [self.redirect]
            message.cc = []
            message.bcc = []
            note = f"[Staging copy. Originally addressed to: {', '.join(original) or '(nobody)'}]\n\n"
            message.body = note + (message.body or '')
        logger.info('STAGING email "%s" for %s -> %s', message.subject, original,
                    self.redirect or 'log only')
        return message

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        return self.inner.send_messages([self._readdress(m) for m in email_messages])


def blocked_in_staging(channel: str):
    """
    Decorator for a provider's send()/check_status(): on staging, log and
    return a harmless result instead of calling the provider.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            if not is_staging():
                return func(self, *args, **kwargs)
            if func.__name__ == 'check_status':
                return {'delivered': False, 'failed': False, 'error': f'STAGING: {channel} disabled'}
            recipient = kwargs.get('recipient', args[0] if args else '')
            logger.info('STAGING: %s message to %r suppressed (not sent)', channel, recipient)
            return {
                'success': True,
                'message_id': 'staging-suppressed',
                'delivered': False,
                'staging_suppressed': True,
            }
        return wrapper
    return decorator
