"""JWT auth middleware for Django Channels.

Channels' built-in AuthMiddlewareStack assumes session auth; this app's API
authenticates with rest_framework_simplejwt (see REST_FRAMEWORK settings).
A browser can't set an Authorization header on a WebSocket handshake, so the
frontend passes the access token as a `?token=` query param instead (see
useNotificationSocket.ts) and this middleware validates it the same way
JWTAuthentication does for every normal DRF request — same token classes,
same signature/expiry checks — then populates scope['user'].
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware


@database_sync_to_async
def _get_user_from_token(raw_token):
    from django.contrib.auth.models import AnonymousUser
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    authenticator = JWTAuthentication()
    try:
        validated_token = authenticator.get_validated_token(raw_token.encode('utf-8'))
        return authenticator.get_user(validated_token)
    except (InvalidToken, TokenError):
        return AnonymousUser()
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        from django.contrib.auth.models import AnonymousUser

        query_string = scope.get('query_string', b'').decode()
        token = parse_qs(query_string).get('token', [None])[0]
        scope['user'] = await _get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
