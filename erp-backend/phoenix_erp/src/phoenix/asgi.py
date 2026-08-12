"""
ASGI config for phoenix project.

Serves both HTTP and WebSocket. In production, HTTP still goes through the
existing gunicorn/WSGI `backend` service (docker-compose.yml) unchanged —
this ASGI app is only what the separate `backend_ws` (daphne) service runs,
handling the `/ws/` path Traefik routes to it. Locally (`manage.py
runserver`, via the `channels` app in INSTALLED_APPS), this same app serves
both.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')

# Must run before importing anything that touches Django models (Channels
# routing, consumers) — this is what populates the app registry.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from common.channels_auth import JWTAuthMiddlewareStack  # noqa: E402
from notifications.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
