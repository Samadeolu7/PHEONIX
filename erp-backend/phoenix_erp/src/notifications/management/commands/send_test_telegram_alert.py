"""
management/commands/send_test_telegram_alert.py

One-off check that the Telegram bot alert wiring (TELEGRAM_BOT_TOKEN /
TELEGRAM_CHAT_ID, the 'telegram' NotificationChannel, and the Celery
worker) actually delivers, without needing to trigger one of the four real
hooks (loan disbursement, director-escalation, petty cash disbursement,
bank transfer) to test it.

    python manage.py send_test_telegram_alert

Requires a running Celery worker (the alert is queued via
transaction.on_commit + Celery, same as every other notification) —
check the worker logs if nothing arrives in the group within a few seconds.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send a one-off test Telegram alert to the directors/BM group to verify wiring."

    def handle(self, *args, **options):
        from django.db import transaction
        from notifications.telegram_alerts import notify_directors
        from users.models import User

        owner = User.objects.filter(is_superuser=True).first()
        branch = None
        try:
            from branches.models import Branch
            branch = Branch.objects.first()
        except Exception:
            pass

        with transaction.atomic():
            notification = notify_directors(
                'test',
                'Test Alert',
                'Telegram wiring works. If you can see this in the group, the bot and chat_id are configured correctly.',
                owner=owner,
                branch=branch,
            )

        if notification is None:
            self.stderr.write(self.style.ERROR(
                "Alert was not queued — check that migration 0005_seed_telegram_channel "
                "has run (creates the 'telegram' NotificationChannel row). See logs for details."
            ))
            return

        self.stdout.write(self.style.SUCCESS(
            f"Test alert queued as Notification #{notification.pk}. TELEGRAM_BOT_TOKEN/"
            "TELEGRAM_CHAT_ID are resolved by the celery_worker container at send time, "
            "not here — check the group chat within a few seconds, or inspect this "
            "Notification's status/error_message (via admin or shell) if nothing arrives."
        ))
