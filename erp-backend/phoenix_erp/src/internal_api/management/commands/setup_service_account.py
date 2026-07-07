"""
Provisions the internal service account Java microservices authenticate as
when calling /api/internal/ endpoints (IsInternalServiceUser in
internal_api/views.py falls back to `user.is_staff` since no service-account
profile flag actually exists in this codebase — this command sets is_staff).

DRF's TokenAuthentication requires a real row in authtoken_token; setting
INTERNAL_SERVICE_TOKEN as an env var alone does nothing for the Java-to-Django
direction unless that exact value is also stored here as a token.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from rest_framework.authtoken.models import Token


class Command(BaseCommand):
    help = (
        "Creates (or reuses) the internal service account used by Java "
        "microservices to authenticate against /api/internal/ endpoints, "
        "and prints its DRF token. Idempotent — safe to re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            default='bankrecon-service',
            help="Username for the service account (default: bankrecon-service)",
        )
        parser.add_argument(
            '--regenerate',
            action='store_true',
            help="Delete and recreate the token, invalidating the old one",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']

        user, created = User.objects.get_or_create(
            username=username,
            defaults={'is_staff': True, 'is_active': True},
        )
        update_fields = []
        if not user.is_staff:
            user.is_staff = True
            update_fields.append('is_staff')
        if not user.is_active:
            user.is_active = True
            update_fields.append('is_active')
        if update_fields:
            user.save(update_fields=update_fields)
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])

        if options['regenerate']:
            Token.objects.filter(user=user).delete()

        token, _ = Token.objects.get_or_create(user=user)

        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created else 'Reusing'} service account '{username}' (is_staff=True, no login password)"
        ))
        self.stdout.write(
            "Set this SAME value as INTERNAL_SERVICE_TOKEN in Django's environment "
            "and as DJANGO_INTERNAL_SERVICE_TOKEN in the Bank-Recon Java service's "
            "environment — it's one shared secret used in both call directions:"
        )
        self.stdout.write(self.style.WARNING(token.key))
