"""Authentication hooks that enforce the tenant-level `is_active_user` flag.

Django's ModelBackend and simplejwt only look at `is_active`, but the staff
user admin (activate/deactivate endpoints, the user form checkbox, and the
delete fallback) toggles `is_active_user`. Without these hooks a deactivated
user could still log in, refresh tokens, and keep using existing tokens.
"""
from django.contrib.auth.backends import ModelBackend
from django.utils.translation import gettext_lazy as _
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


def user_authentication_rule(user):
    """SIMPLE_JWT['USER_AUTHENTICATION_RULE'] — checked on login and refresh."""
    return (
        user is not None
        and user.is_active
        and getattr(user, 'is_active_user', True)
    )


class ActiveUserModelBackend(ModelBackend):
    """ModelBackend that also rejects users deactivated for their tenant."""

    def user_can_authenticate(self, user):
        return super().user_can_authenticate(user) and getattr(user, 'is_active_user', True)


class ActiveUserJWTAuthentication(JWTAuthentication):
    """Rejects already-issued access tokens once the user is deactivated."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not getattr(user, 'is_active_user', True):
            raise AuthenticationFailed(_('User is inactive'), code='user_inactive')
        return user
