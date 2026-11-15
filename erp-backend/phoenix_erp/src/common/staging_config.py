"""
Pure helpers for the STAGING safety switch, used by phoenix/settings.py.

Kept free of Django imports so settings can import it before apps load.
See common/staging.py for the runtime pieces and docs/STAGING.md for the
whole staging set-up.
"""

STAGING_EMAIL_BACKEND = 'common.staging.StagingEmailBackend'
CONSOLE_EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
SMTP_EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# Backends that never deliver anything to anybody. With no redirect inbox set,
# staging only ever uses one of these.
NON_DELIVERING_EMAIL_BACKENDS = frozenset({
    CONSOLE_EMAIL_BACKEND,
    'django.core.mail.backends.locmem.EmailBackend',
    'django.core.mail.backends.filebased.EmailBackend',
    'django.core.mail.backends.dummy.EmailBackend',
})


def env_flag(value) -> bool:
    """True for 1/true/yes/on (any case); everything else, including unset, is False."""
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def staging_email_settings(configured_backend: str, redirect: str):
    """
    Return (EMAIL_BACKEND, STAGING_EMAIL_INNER_BACKEND) for a staging server.

    - Always routes mail through StagingEmailBackend.
    - With a redirect inbox, the inner backend is whatever was configured
      (normally SMTP), but StagingEmailBackend re-addresses every message to
      that one inbox first.
    - Without one, the inner backend is forced to a non-delivering backend
      (console unless a non-delivering one was configured), so nothing can
      leave the server even if EMAIL_BACKEND says SMTP.
    """
    configured_backend = (configured_backend or '').strip()
    if redirect:
        inner = configured_backend
        if not inner or inner == STAGING_EMAIL_BACKEND:
            inner = SMTP_EMAIL_BACKEND
    else:
        inner = configured_backend if configured_backend in NON_DELIVERING_EMAIL_BACKENDS else CONSOLE_EMAIL_BACKEND
    return STAGING_EMAIL_BACKEND, inner
