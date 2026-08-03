"""
Management command: backup_database
=====================================
Dumps the Postgres database (pg_dump, custom format, gzip-compressed) and
emails it as an attachment via the existing SMTP config (EMAIL_HOST_* in
settings.py), so a copy of the ledger leaves the VPS every day instead of
living only on the one disk the `postgres` container's volume sits on.

Deliberately mail-based rather than pushed to object storage: this project
already has working SMTP creds and no bucket/credentials of its own, so this
is the zero-new-infra option. It will stop working once the compressed dump
exceeds the receiving mailbox's attachment limit (~25MB on Gmail) — at that
point this needs to be replaced with a shipped-to-storage approach instead
of stretched further.

Usage
-----
    python manage.py backup_database
"""
import gzip
import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime

from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)

# Gmail (and most providers) reject attachments above ~25MB; stay comfortably
# under that so the failure mode is a clear alert email, not a silently
# bounced/dropped send.
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


class Command(BaseCommand):
    help = "Dump the database with pg_dump and email the gzip-compressed backup off-box."

    def handle(self, *args, **options):
        db = settings.DATABASES['default']
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        recipients = [email for _, email in settings.ADMINS]

        if not recipients:
            raise CommandError("No ADMINS configured — nowhere to send the backup.")

        tmp_dir = tempfile.mkdtemp(prefix='phoenix_db_backup_')
        dump_path = os.path.join(tmp_dir, f"phoenix_backup_{timestamp}.dump")
        gz_path = f"{dump_path}.gz"

        try:
            self._run_pg_dump(db, dump_path)
            self._gzip_file(dump_path, gz_path)

            size = os.path.getsize(gz_path)
            if size > MAX_ATTACHMENT_BYTES:
                self._send_too_large_alert(recipients, gz_path, size)
                raise CommandError(
                    f"Backup ({size / 1024 / 1024:.1f}MB) exceeds the "
                    f"{MAX_ATTACHMENT_BYTES / 1024 / 1024:.0f}MB email limit — sent an "
                    f"alert instead. Move this job to object storage."
                )

            self._send_backup_email(recipients, gz_path, timestamp, size)
            self.stdout.write(self.style.SUCCESS(
                f"Backup emailed to {', '.join(recipients)} ({size / 1024:.0f}KB)"
            ))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _run_pg_dump(self, db, dump_path):
        env = os.environ.copy()
        env['PGPASSWORD'] = db['PASSWORD']
        cmd = [
            'pg_dump',
            '-h', db['HOST'] or 'localhost',
            '-p', str(db['PORT'] or 5432),
            '-U', db['USER'],
            '-F', 'c',  # custom format: compressed, restorable with pg_restore
            '-f', dump_path,
            db['NAME'],
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error("pg_dump failed: %s", result.stderr)
            raise CommandError(f"pg_dump failed: {result.stderr}")

    def _gzip_file(self, src_path, gz_path):
        with open(src_path, 'rb') as f_in, gzip.open(gz_path, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)

    def _send_backup_email(self, recipients, gz_path, timestamp, size):
        email = EmailMessage(
            subject=f"[Phoenix ERP] Database backup {timestamp}",
            body=(
                f"Automated daily database backup, {size / 1024:.0f}KB compressed.\n\n"
                f"Restore with:\n"
                f"  gunzip -c {os.path.basename(gz_path)} > backup.dump\n"
                f"  pg_restore -h <host> -U <user> -d <dbname> --clean --if-exists backup.dump"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        email.attach_file(gz_path)
        email.send()

    def _send_too_large_alert(self, recipients, gz_path, size):
        logger.error("Database backup too large to email: %.1fMB", size / 1024 / 1024)
        email = EmailMessage(
            subject="[Phoenix ERP] Database backup FAILED — too large to email",
            body=(
                f"The compressed database backup is {size / 1024 / 1024:.1f}MB, "
                f"over the {MAX_ATTACHMENT_BYTES / 1024 / 1024:.0f}MB email limit, "
                f"so no backup was sent this run. The database is growing past what "
                f"mail-based backup can handle — switch to shipping backups to object "
                f"storage (S3/B2/rclone) instead."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        email.send()
