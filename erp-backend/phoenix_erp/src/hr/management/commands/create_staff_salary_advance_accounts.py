"""
Management command: create_staff_salary_advance_accounts

Ensures every active staff member has their own dedicated "Salary Advance"
GL sub-account (a CHILD account nested under one shared "Salary Advance"
parent — see accounts/utils/account_creation.py::
get_or_create_staff_salary_advance_account). This is a pre-provisioning
step: it does NOT post any journal entries or move any money. It only
guarantees the account exists so an admin can then post manual journal
vouchers (JVs) crediting whichever source account they choose, against
each staff member's own individual balance, instead of everything being
pooled into one shared account.

SAFETY (this touches a live production chart of accounts)
-----------------------------------------------------------------------
- Defaults to a DRY RUN. Nothing is written to the database unless
  --apply is explicitly passed.
- Even with --apply, an interactive confirmation is required showing
  exactly how many staff will be affected, unless --yes is also passed
  (for non-interactive/scripted use).
- Idempotent and safe to re-run: staff who already have a
  salary_advance_account are detected up front and skipped without
  calling into account creation at all.
- Each staff member is processed in their own transaction.atomic() block.
  A failure for one staff member is caught, logged, and does NOT stop
  processing of the remaining staff or roll back accounts already created
  for others.
- Supports --tenant, --branch, and --staff-ids filters so a rollout can be
  restricted to a single branch (or even a single test staff member) as a
  canary before running against everyone.
- Supports --export-csv to write a staff -> account code -> account name
  mapping file, which the admin will need on hand to actually select the
  right account when posting JVs afterward.

Usage
-----
    # Preview only — always safe, makes no changes
    python manage.py create_staff_salary_advance_accounts

    # Preview scoped to one branch
    python manage.py create_staff_salary_advance_accounts --branch 3

    # Actually create the accounts (prompts for confirmation)
    python manage.py create_staff_salary_advance_accounts --apply

    # Actually create, no interactive prompt (e.g. run via CI/script)
    python manage.py create_staff_salary_advance_accounts --apply --yes

    # Canary run against two specific staff first
    python manage.py create_staff_salary_advance_accounts --apply --staff-ids 42,57

    # Apply and write a CSV the admin can use for JV entry
    python manage.py create_staff_salary_advance_accounts --apply --yes \\
        --export-csv /tmp/salary_advance_accounts.csv
"""
import csv

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Ensure every active staff member has their own dedicated Salary Advance "
        "GL sub-account, so an admin can post manual JVs against individual staff "
        "balances. Defaults to a dry run — pass --apply to actually create accounts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant', type=str, default=None,
            help='Limit to a single tenant by slug (default: all tenants).',
        )
        parser.add_argument(
            '--branch', type=int, default=None,
            help='Limit to a single branch by ID (default: all branches).',
        )
        parser.add_argument(
            '--staff-ids', type=str, default=None,
            help='Comma-separated Staff primary keys to limit to (e.g. for a canary run).',
        )
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually create accounts. Without this flag, only a preview is printed.',
        )
        parser.add_argument(
            '--yes', action='store_true',
            help='Skip the interactive confirmation prompt when --apply is given.',
        )
        parser.add_argument(
            '--export-csv', type=str, default=None,
            help='Write a staff -> account code -> account name mapping CSV to this path.',
        )

    def handle(self, *args, **options):
        from hr.models import Staff

        apply_changes = options['apply']
        skip_confirm = options['yes']
        export_csv_path = options['export_csv']

        qs = Staff.objects.all_tenants().select_related('tenant', 'branch', 'owner', 'salary_advance_account')

        if options['tenant']:
            qs = qs.filter(tenant__slug=options['tenant'])
        if options['branch']:
            qs = qs.filter(branch_id=options['branch'])
        if options['staff_ids']:
            try:
                ids = [int(x.strip()) for x in options['staff_ids'].split(',') if x.strip()]
            except ValueError:
                raise CommandError("--staff-ids must be a comma-separated list of integers.")
            qs = qs.filter(pk__in=ids)

        qs = qs.order_by('branch_id', 'id')
        staff_list = list(qs)

        if not staff_list:
            self.stdout.write(self.style.WARNING('No matching staff found. Nothing to do.'))
            return

        already_have = [s for s in staff_list if s.salary_advance_account_id]
        need_one = [s for s in staff_list if not s.salary_advance_account_id]

        self.stdout.write(
            f"Matched {len(staff_list)} staff member(s): "
            f"{len(already_have)} already have a Salary Advance account, "
            f"{len(need_one)} need one created."
        )

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — no accounts will be created. Pass --apply to make changes.\n"
            ))
            for staff in need_one:
                self.stdout.write(f"  [would create] {self._label(staff)}")
            for staff in already_have:
                self.stdout.write(
                    f"  [already exists] {self._label(staff)}: "
                    f"{staff.salary_advance_account.code} — {staff.salary_advance_account.name}"
                )
            self.stdout.write(self.style.WARNING(
                f"\nDry run complete. {len(need_one)} account(s) would be created. "
                f"Re-run with --apply to actually create them."
            ))
            return

        if not need_one:
            self.stdout.write(self.style.SUCCESS(
                "Every matched staff member already has a Salary Advance account. Nothing to create."
            ))
        elif not skip_confirm:
            confirm = input(
                f"\nThis will create {len(need_one)} GL 'Salary Advance' sub-account(s) "
                f"in the LIVE database. Type 'yes' to continue: "
            )
            if confirm.strip().lower() != 'yes':
                self.stdout.write(self.style.ERROR('Aborted — no changes made.'))
                return

        created, failed = [], []

        for staff in need_one:
            try:
                with transaction.atomic():
                    from accounts.utils.account_creation import get_or_create_staff_salary_advance_account
                    account = get_or_create_staff_salary_advance_account(staff, staff.owner, staff.branch)
                created.append((staff, account))
                self.stdout.write(self.style.SUCCESS(
                    f"  [created] {self._label(staff)}: {account.code} — {account.name}"
                ))
            except Exception as exc:
                failed.append((staff, exc))
                self.stdout.write(self.style.ERROR(f"  [FAILED] {self._label(staff)}: {exc}"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Done. Created: {len(created)}, Already existed: {len(already_have)}, Failed: {len(failed)}"
        ))
        if failed:
            self.stdout.write(self.style.ERROR(
                f"{len(failed)} staff member(s) failed — this command is safe to re-run; "
                f"staff who already succeeded will be skipped automatically next time."
            ))

        if export_csv_path:
            rows = [(s, s.salary_advance_account) for s in already_have] + created
            rows.sort(key=lambda r: (r[0].branch_id or 0, r[0].id))
            with open(export_csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['staff_id', 'staff_name', 'branch', 'account_code', 'account_name'])
                for staff, account in rows:
                    writer.writerow([
                        staff.staff_id or staff.pk,
                        f"{staff.first_name} {staff.last_name}",
                        staff.branch.name if staff.branch else '',
                        account.code,
                        account.name,
                    ])
            self.stdout.write(self.style.SUCCESS(
                f"Wrote {len(rows)} row(s) to {export_csv_path} for JV reference."
            ))

    @staticmethod
    def _label(staff):
        return f"{staff.staff_id or f'#{staff.pk}'} — {staff.first_name} {staff.last_name} (branch: {staff.branch.name if staff.branch else 'n/a'})"
