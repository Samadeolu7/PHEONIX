"""
Signed, expiring, effectively single-use tokens for email verification and
password reset.

The signed payload includes a hash of the account state the token is meant
to change (password hash, verification timestamp, last login).  Once the
action has happened that state changes, so the same token no longer
validates — no token table needed, and nothing secret is stored.
"""
import hashlib

from django.core import signing
from django.utils.crypto import constant_time_compare

from .models import PortalCustomer

VERIFY_SALT = 'portal.email-verify.v1'
RESET_SALT = 'portal.password-reset.v1'

VERIFY_MAX_AGE = 60 * 60 * 48   # 48 hours
RESET_MAX_AGE = 60 * 60         # 1 hour


def _state(customer: PortalCustomer, purpose: str) -> str:
    parts = [
        purpose,
        str(customer.pk),
        customer.tenant_id and str(customer.tenant_id) or '',
        customer.email.lower(),
        customer.password,
        customer.email_verified_at.isoformat() if customer.email_verified_at else '',
        '1' if customer.is_active else '0',
    ]
    if purpose == 'reset':
        # Logging in (Django's own reset-token behaviour) also burns a reset link.
        parts.append(customer.last_login.isoformat() if customer.last_login else '')
    return hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()[:32]


def make_token(customer: PortalCustomer, purpose: str) -> str:
    salt = VERIFY_SALT if purpose == 'verify' else RESET_SALT
    return signing.dumps({'c': customer.pk, 's': _state(customer, purpose)}, salt=salt, compress=True)


def read_token(token: str, purpose: str, tenant) -> PortalCustomer | None:
    """Return the customer the token is valid for, or None.  Never raises."""
    salt, max_age = (VERIFY_SALT, VERIFY_MAX_AGE) if purpose == 'verify' else (RESET_SALT, RESET_MAX_AGE)
    if not token or len(token) > 512:
        return None
    try:
        payload = signing.loads(token, salt=salt, max_age=max_age)
    except signing.BadSignature:  # includes SignatureExpired
        return None
    if not isinstance(payload, dict):
        return None
    try:
        customer = PortalCustomer.objects.get(pk=int(payload.get('c')), tenant=tenant)
    except (PortalCustomer.DoesNotExist, TypeError, ValueError):
        return None
    if not constant_time_compare(str(payload.get('s', '')), _state(customer, purpose)):
        return None
    return customer
