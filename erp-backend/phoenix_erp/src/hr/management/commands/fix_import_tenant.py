# hr/management/commands/fix_import_tenant.py
"""
Fix imported staff, salary components, and pay info with NULL tenant_id.

These records were created by the staff Excel import before the tenant fix
was applied. This command backfills tenant_id using the record's owner or,
as a fallback, the first tenant in the database.

Usage:
    python manage.py fix_import_tenant          # dry-run (show what would change)
    python manage.py fix_import_tenant --apply  # actually apply fixes
"""

from django.core.management.base import BaseCommand
from django.db import connection, transaction


TABLES = [
    ("hr_staff", "Staff"),
    ("hr_salarycomponent", "SalaryComponent"),
    ("hr_staffpayinfo", "StaffPayInfo"),
]


class Command(BaseCommand):
    help = (
        "Fix imported records with NULL tenant_id across "
        "hr_staff, hr_salarycomponent, and hr_staffpayinfo"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Actually apply the fix. Without this flag the command is a dry-run.",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        mode = "APPLYING FIXES" if apply else "DRY-RUN (use --apply to commit)"

        self.stdout.write("=" * 70)
        self.stdout.write(f"FIX NULL TENANT_ID ON IMPORTED RECORDS — {mode}")
        self.stdout.write("=" * 70 + "\n")

        # ── 1. Discover tenants ──────────────────────────────────────────
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, slug FROM users_tenant ORDER BY id")
            tenants = cursor.fetchall()

        if not tenants:
            self.stdout.write(self.style.ERROR("No tenants found — cannot backfill."))
            return

        self.stdout.write(f"Tenants in database:")
        for t_id, t_name, t_slug in tenants:
            self.stdout.write(f"  id={t_id}  name={t_name}  slug={t_slug}")
        self.stdout.write("")
        fallback_tenant_id = tenants[0][0]
        self.stdout.write(f"Fallback tenant_id (first tenant): {fallback_tenant_id}\n")

        # ── 2. Process each table ────────────────────────────────────────
        for table, label in TABLES:
            self._fix_table(table, label, fallback_tenant_id, apply)

        # ── 3. Final summary ─────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write("FINAL STATE")
        self.stdout.write("=" * 70)
        for table, label in TABLES:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE tenant_id IS NULL"
                )
                remaining = cursor.fetchone()[0]
            status = "✓" if remaining == 0 else "⚠️"
            self.stdout.write(f"  {status} {label}: {remaining} still NULL")

        if not apply:
            self.stdout.write(
                self.style.WARNING("\nThis was a DRY-RUN. Run with --apply to commit.")
            )

    # ──────────────────────────────────────────────────────────────────────
    def _fix_table(self, table, label, fallback_tenant_id, apply):
        """Backfill tenant_id on a single table."""
        self.stdout.write(f"─── {label} ({table}) ───")

        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT COUNT(*) FROM {table} WHERE tenant_id IS NULL"
            )
            null_count = cursor.fetchone()[0]

        self.stdout.write(f"  Records with NULL tenant_id: {null_count}")

        if null_count == 0:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Nothing to fix.\n"))
            return

        if not apply:
            # Show what would be fixed
            with connection.cursor() as cursor:
                # How many can be fixed via owner? (join against AUTH_USER_MODEL table users_user)
                cursor.execute(
                    f"SELECT COUNT(*) FROM {table} t "
                    f"JOIN users_user u ON t.owner_id = u.id "
                    f"WHERE t.tenant_id IS NULL AND u.tenant_id IS NOT NULL"
                )
                via_owner = cursor.fetchone()[0]
                remaining = null_count - via_owner

            self.stdout.write(f"  Would fix via owner's tenant: {via_owner}")
            self.stdout.write(f"  Would fix via fallback tenant: {remaining}\n")
            return

        # Actually apply
        with transaction.atomic():
            with connection.cursor() as cursor:
                # Step A: backfill from owner's tenant
                cursor.execute(
                    f"UPDATE {table} t "
                    f"SET tenant_id = u.tenant_id "
                    f"FROM users_user u "
                    f"WHERE t.owner_id = u.id "
                    f"AND t.tenant_id IS NULL "
                    f"AND u.tenant_id IS NOT NULL"
                )
                via_owner = cursor.rowcount
                self.stdout.write(
                    self.style.SUCCESS(f"  ✓ Fixed {via_owner} via owner's tenant")
                )

                # Step B: fallback for any remaining
                cursor.execute(
                    f"UPDATE {table} SET tenant_id = %s WHERE tenant_id IS NULL",
                    [fallback_tenant_id],
                )
                via_fallback = cursor.rowcount
                if via_fallback:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ Fixed {via_fallback} via fallback tenant "
                            f"(id={fallback_tenant_id})"
                        )
                    )

        self.stdout.write("")
