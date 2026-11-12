"""
Portal authentication.

* ``PortalSessionAuthentication`` reads an opaque token from an httpOnly
  cookie, looks up its SHA-256 hash, and checks that the session is live and
  belongs to the tenant this request resolved to.  It is used ONLY by views
  in this app — staff views never list it, so a customer cookie can never
  authenticate a staff endpoint.

* CSRF: because the credential is a cookie, every state-changing portal
  request must carry the ``X-Portal-Request: 1`` header.  Browsers cannot
  send a custom header cross-origin without a CORS preflight, and our CORS
  allow-list only admits our own frontends — so a forged form post or
  cross-site fetch is rejected.  The cookie is also SameSite.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication
from rest_framework.throttling import SimpleRateThrottle

from .models import PortalSession, hash_token

SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')
CSRF_HEADER = 'HTTP_X_PORTAL_REQUEST'


def portal_settings():
    return getattr(settings, 'PORTAL', {})


def cookie_name():
    return portal_settings().get('SESSION_COOKIE_NAME', 'phx_portal_session')


def client_ip(request):
    """
    Best-effort real client IP.  With N trusted proxies in front of us
    (Traefik = 1), the real client is the Nth-from-last X-Forwarded-For
    entry; anything to the left of that was supplied by the client and can
    be forged, so we never use the leftmost value.
    """
    trusted = int(portal_settings().get('TRUSTED_PROXY_COUNT', 1))
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if trusted > 0 and xff:
        parts = [p.strip() for p in xff.split(',') if p.strip()]
        if len(parts) >= trusted:
            return parts[-trusted]
    return request.META.get('REMOTE_ADDR')


def enforce_csrf_header(request):
    if request.method in SAFE_METHODS:
        return
    if request.META.get(CSRF_HEADER) != '1':
        raise exceptions.PermissionDenied('Missing request verification header.')


class PortalSessionAuthentication(BaseAuthentication):
    def authenticate(self, request):
        raw = request.COOKIES.get(cookie_name())
        if not raw:
            return None

        # Any problem with the cookie => treat the request as anonymous.
        # Protected views then answer 401; public views keep working even if
        # the browser still holds a stale cookie.
        session = (
            PortalSession.objects.select_related('customer', 'customer__tenant')
            .filter(token_hash=hash_token(raw)).first()
        )
        if session is None:
            return None

        now = timezone.now()
        customer = session.customer
        if not session.is_valid(now) or not customer.is_active:
            return None

        # Tenant binding: a session issued for tenant A is useless on tenant B,
        # even if someone copies the cookie or sends a spoofed tenant header.
        request_tenant = getattr(request._request, 'tenant', None)
        if request_tenant is None or request_tenant.pk != customer.tenant_id:
            return None

        enforce_csrf_header(request)

        # Sliding idle timeout — but don't write on every request.
        if now - session.last_seen_at > timedelta(minutes=1):
            session.last_seen_at = now
            session.save(update_fields=['last_seen_at'])

        request.portal_session = session
        return (customer, session)

    def authenticate_header(self, request):
        # Makes DRF answer 401 (not 403) for unauthenticated portal requests.
        return 'PortalSession'


def set_session_cookie(response, raw_token):
    cfg = portal_settings()
    response.set_cookie(
        cookie_name(),
        raw_token,
        max_age=int(cfg.get('SESSION_ABSOLUTE_HOURS', 12)) * 3600,
        httponly=True,
        secure=cfg.get('COOKIE_SECURE', not settings.DEBUG),
        samesite=cfg.get('COOKIE_SAMESITE', 'Strict'),
        domain=cfg.get('COOKIE_DOMAIN') or None,
        path='/api/portal/',
    )


def clear_session_cookie(response):
    cfg = portal_settings()
    response.delete_cookie(
        cookie_name(), path='/api/portal/', domain=cfg.get('COOKIE_DOMAIN') or None,
        samesite=cfg.get('COOKIE_SAMESITE', 'Strict'),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Throttles — keyed on the spoof-resistant client IP above.
# ─────────────────────────────────────────────────────────────────────────────

class _PortalIPThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': client_ip(request) or 'unknown'}


class PortalLoginThrottle(_PortalIPThrottle):
    scope = 'portal_login'


class PortalRegisterThrottle(_PortalIPThrottle):
    scope = 'portal_register'


class PortalPasswordResetThrottle(_PortalIPThrottle):
    scope = 'portal_password_reset'


class PortalVerifyThrottle(_PortalIPThrottle):
    scope = 'portal_verify'


class PortalApplyThrottle(SimpleRateThrottle):
    """Per-customer cap on application submissions."""
    scope = 'portal_apply'

    def get_cache_key(self, request, view):
        customer = getattr(request, 'user', None)
        ident = getattr(customer, 'pk', None) or client_ip(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'c{ident}'}


class PortalAnonThrottle(_PortalIPThrottle):
    scope = 'portal_anon'
