from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Fix clients with NULL tenant or NULL branch by assigning them to the "
        "single existing tenant and branch. Safe to run when there is exactly one "
        "tenant and one branch in the system."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without making any changes.',
        )

    def handle(self, *args, **options):
        from users.models import Tenant
        from branches.models import Branch
        from clients.models import Client

        dry_run = options['dry_run']

        # ── Validate prerequisites ────────────────────────────────────────────
        tenant_count = Tenant.objects.count()
        branch_count = Branch.objects.all_tenants().count()

        if tenant_count != 1:
            self.stderr.write(
                self.style.ERROR(
                    f"Expected exactly 1 tenant, found {tenant_count}. "
                    "Aborting — this command is only safe for single-tenant setups."
                )
            )
            return

        if branch_count == 0:
            self.stderr.write(
                self.style.ERROR("No branches found. Aborting.")
            )
            return

        if branch_count > 1:
            self.stderr.write(
                self.style.WARNING(
                    f"Found {branch_count} branches. "
                    "Will use the first (oldest) branch for orphaned clients."
                )
            )

        tenant = Tenant.objects.first()
        branch = Branch.objects.all_tenants().order_by('id').first()

        self.stdout.write(f"Target tenant : {tenant} (id={tenant.pk})")
        self.stdout.write(f"Target branch : {branch} (id={branch.pk})")

        # ── Count orphaned records ────────────────────────────────────────────
        # Use all_tenants() to bypass tenant-scoping so we can see every
        # non-deleted row in the table (mirrors what the Django admin shows).
        all_qs = Client.objects.all_tenants()

        no_tenant = all_qs.filter(tenant__isnull=True)
        no_branch = all_qs.filter(branch__isnull=True).exclude(tenant__isnull=True)
        either_null = all_qs.filter(tenant__isnull=True) | all_qs.filter(branch__isnull=True)

        self.stdout.write(f"\nTotal clients in DB        : {all_qs.count()}")
        self.stdout.write(f"Clients with NULL tenant   : {no_tenant.count()}")
        self.stdout.write(f"Clients with NULL branch   : {no_branch.count()}")
        self.stdout.write(f"Clients needing fix (union): {either_null.count()}")

        if either_null.count() == 0:
            self.stdout.write(self.style.SUCCESS("\nNo orphaned clients found. Nothing to do."))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN] No changes written."))
            return

        # ── Apply fix ─────────────────────────────────────────────────────────
        with transaction.atomic():
            fixed_tenant = all_qs.filter(tenant__isnull=True).update(tenant=tenant)
            fixed_branch = all_qs.filter(branch__isnull=True).update(branch=branch)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nFixed {fixed_tenant} client(s) missing tenant, "
                f"{fixed_branch} client(s) missing branch."
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                "All clients are now scoped to the correct tenant and branch."
            )
        )
