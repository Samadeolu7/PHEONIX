# accounts/management/commands/fix_account_parent_child.py
from django.core.management.base import BaseCommand
from django.db import connection, transaction, ProgrammingError
from django.apps import apps

def table_has_column(table_name, col_name):
    """Return True if table has column (uses DB introspection)."""
    with connection.cursor() as c:
        try:
            desc = connection.introspection.get_table_description(c, table_name)
        except Exception:
            return False
    return any(col.name == col_name for col in desc)

class Command(BaseCommand):
    help = "Detect and optionally fix parent/child consistency issues in accounts_account (safe if migration not applied yet)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Apply fixes (default is dry-run)')
        parser.add_argument('--limit', type=int, default=20, help='Sample rows to show per issue type')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        limit = options['limit']
        table = 'accounts_account'

        # Check which columns exist
        has_account_level = table_has_column(table, 'account_level')
        has_parent_id = table_has_column(table, 'parent_id')
        has_account_type = table_has_column(table, 'account_type')

        self.stdout.write(self.style.MIGRATE_HEADING('Checking accounts_account for parent/child consistency issues...'))
        self.stdout.write(f"Detected columns - account_level: {has_account_level}, parent_id: {has_parent_id}, account_type: {has_account_type}")

        # If neither account_level nor parent exists, nothing meaningful to do
        if not (has_account_level or has_parent_id):
            self.stdout.write(self.style.WARNING(
                "Neither account_level nor parent_id columns exist in the DB. "
                "This command cannot check or fix parent/child consistency at this schema state.\n"
                "Options:\n"
                "  1) Run the migration that creates these columns and then re-run this command (dry-run first).\n"
                "  2) Add a RunPython data migration so the fix runs as part of `migrate` before constraints are added."
            ))
            return

        # Use raw SQL that only references existing columns
        # 1) CHILD without parent (only if both columns exist)
        if has_account_level and has_parent_id:
            try:
                with connection.cursor() as cur:
                    cur.execute(
                        "SELECT id, code, name FROM accounts_account WHERE account_level=%s AND parent_id IS NULL LIMIT %s",
                        ['CHILD', limit]
                    )
                    rows = cur.fetchall()
                    cur.execute(
                        "SELECT COUNT(1) FROM accounts_account WHERE account_level=%s AND parent_id IS NULL",
                        ['CHILD']
                    )
                    total = cur.fetchone()[0]
                self.stdout.write(f"\nCHILD without parent: {total}")
                for r in rows:
                    self.stdout.write(f"  id={r[0]} code={r[1]} name={r[2]}")
            except ProgrammingError as e:
                self.stderr.write(self.style.ERROR(f"SQL error when checking CHILD without parent: {e}"))
        else:
            self.stdout.write("\nSkipping CHILD-without-parent check (requires account_level and parent_id columns).")

        # 2) PARENT with parent set (only if account_level and parent_id exist)
        if has_account_level and has_parent_id:
            try:
                with connection.cursor() as cur:
                    cur.execute(
                        "SELECT id, code, name, parent_id FROM accounts_account WHERE account_level=%s AND parent_id IS NOT NULL LIMIT %s",
                        ['PARENT', limit]
                    )
                    rows = cur.fetchall()
                    cur.execute(
                        "SELECT COUNT(1) FROM accounts_account WHERE account_level=%s AND parent_id IS NOT NULL",
                        ['PARENT']
                    )
                    total = cur.fetchone()[0]
                self.stdout.write(f"\nPARENT with parent set: {total}")
                for r in rows:
                    self.stdout.write(f"  id={r[0]} code={r[1]} name={r[2]} parent_id={r[3]}")
            except ProgrammingError as e:
                self.stderr.write(self.style.ERROR(f"SQL error when checking PARENT-with-parent: {e}"))
        else:
            self.stdout.write("\nSkipping PARENT-with-parent check (requires account_level and parent_id columns).")

        # 3) Child whose parent is not level PARENT (needs account_level and parent row)
        if has_account_level and has_parent_id:
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT c.id, c.code, c.name, p.id, p.code, p.account_level
                        FROM accounts_account c
                        JOIN accounts_account p ON c.parent_id = p.id
                        WHERE c.account_level = %s AND p.account_level != %s
                        LIMIT %s
                    """, ['CHILD', 'PARENT', limit])
                    rows = cur.fetchall()
                    cur.execute("""
                        SELECT COUNT(1)
                        FROM accounts_account c
                        JOIN accounts_account p ON c.parent_id = p.id
                        WHERE c.account_level = %s AND p.account_level != %s
                    """, ['CHILD', 'PARENT'])
                    total = cur.fetchone()[0]
                self.stdout.write(f"\nCHILD with parent that is not PARENT: {total}")
                for r in rows:
                    self.stdout.write(f"  child_id={r[0]} child_code={r[1]} child_name={r[2]} parent_id={r[3]} parent_code={r[4]} parent_level={r[5]}")
            except ProgrammingError as e:
                self.stderr.write(self.style.ERROR(f"SQL error when checking parent levels: {e}"))
        else:
            self.stdout.write("\nSkipping parent-level mismatch check (requires account_level and parent_id columns).")

        # 4) account_type mismatches (needs parent_id and account_type)
        if has_parent_id and has_account_type:
            try:
                with connection.cursor() as cur:
                    cur.execute("""
                        SELECT c.id, c.code, c.account_type, p.id, p.code, p.account_type
                        FROM accounts_account c
                        JOIN accounts_account p ON c.parent_id = p.id
                        WHERE c.parent_id IS NOT NULL AND (c.account_type IS DISTINCT FROM p.account_type)
                        LIMIT %s
                    """, [limit])
                    rows = cur.fetchall()
                    cur.execute("""
                        SELECT COUNT(1)
                        FROM accounts_account c
                        JOIN accounts_account p ON c.parent_id = p.id
                        WHERE c.parent_id IS NOT NULL AND (c.account_type IS DISTINCT FROM p.account_type)
                    """)
                    total = cur.fetchone()[0]
                self.stdout.write(f"\nChild-parent account_type mismatches: {total}")
                for r in rows:
                    self.stdout.write(f"  child_id={r[0]} child_code={r[1]} child_type={r[2]} parent_id={r[3]} parent_code={r[4]} parent_type={r[5]}")
            except ProgrammingError as e:
                self.stderr.write(self.style.ERROR(f"SQL error when checking account_type mismatches: {e}"))
        else:
            self.stdout.write("\nSkipping account_type mismatch check (requires parent_id and account_type columns).")

        if not apply_changes:
            self.stdout.write(self.style.WARNING("\nDry run complete. No changes made. Re-run with --apply to apply fixes."))
            return

        # APPLY fixes (only those supported by detected columns)
        self.stdout.write(self.style.NOTICE("\nApplying fixes inside a transaction..."))
        try:
            with transaction.atomic():
                if has_account_level and has_parent_id:
                    # Convert CHILD without parent -> PARENT
                    with connection.cursor() as cur:
                        cur.execute("UPDATE accounts_account SET account_level=%s, parent_id=NULL WHERE account_level=%s AND parent_id IS NULL", ['PARENT', 'CHILD'])
                        # cur.rowcount may be -1 depending on driver; ignore exact number
                    self.stdout.write(self.style.SUCCESS("Converted orphan CHILD rows to PARENT (if any)."))

                    # Ensure referenced parents are PARENT and clear their parent pointer
                    with connection.cursor() as cur:
                        cur.execute("""
                            UPDATE accounts_account p SET account_level=%s, parent_id=NULL
                            FROM (SELECT DISTINCT parent_id FROM accounts_account WHERE parent_id IS NOT NULL) x(pid)
                            WHERE p.id = x.pid AND p.account_level != %s
                        """, ['PARENT', 'PARENT'])
                    self.stdout.write(self.style.SUCCESS("Ensured referenced parent rows are account_level='PARENT' and cleared parent pointers."))

                    # Clear parent pointer from PARENT rows if any
                    with connection.cursor() as cur:
                        cur.execute("UPDATE accounts_account SET parent_id = NULL WHERE account_level = %s AND parent_id IS NOT NULL", ['PARENT'])
                    self.stdout.write(self.style.SUCCESS("Cleared parent pointers on PARENT rows (if any)."))
                else:
                    self.stdout.write("Skipping account_level-based fixes because necessary columns are missing.")

                if has_parent_id and has_account_type:
                    # Align child.account_type to parent.account_type where mismatched
                    with connection.cursor() as cur:
                        cur.execute("""
                            UPDATE accounts_account AS c
                            SET account_type = p.account_type
                            FROM accounts_account AS p
                            WHERE c.parent_id = p.id AND c.account_type IS DISTINCT FROM p.account_type
                        """)
                    self.stdout.write(self.style.SUCCESS("Aligned child.account_type to parent.account_type (where applicable)."))
                else:
                    self.stdout.write("Skipping account_type alignment (required columns missing).")

            self.stdout.write(self.style.SUCCESS("\nAll available fixes applied."))
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Error while applying fixes: {exc}"))
            raise
