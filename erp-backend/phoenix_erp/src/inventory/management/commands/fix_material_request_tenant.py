"""
Management command to backfill missing tenant on MaterialRequest records.

Usage:
    python manage.py fix_material_request_tenant
    python manage.py fix_material_request_tenant --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Backfill tenant (and branch) on MaterialRequest rows that were created "
        "before the tenant field was set in the serializer."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Print what would be changed without saving anything.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from inventory.models_material_request import MaterialRequest

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        total = MaterialRequest.objects.count()
        null_tenant = MaterialRequest.objects.filter(tenant__isnull=True).select_related(
            'requested_by__tenant', 'requested_by__branch'
        )
        null_count = null_tenant.count()

        self.stdout.write(f"Total material requests : {total}")
        self.stdout.write(f"Missing tenant          : {null_count}\n")

        if null_count == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to fix."))
            return

        fixed = 0
        skipped = 0

        for mr in null_tenant:
            user = mr.requested_by
            tenant = getattr(user, 'tenant', None) if user else None
            branch = getattr(user, 'branch', None) if user else None

            if tenant is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"  SKIP  MR id={mr.id} req#{mr.request_number} — "
                        f"requested_by user has no tenant (user_id={getattr(user, 'id', None)})"
                    )
                )
                skipped += 1
                continue

            self.stdout.write(
                f"  FIX   MR id={mr.id} req#{mr.request_number} → "
                f"tenant={tenant.id} branch={getattr(branch, 'id', None)}"
            )

            if not dry_run:
                update_fields = ['tenant']
                mr.tenant = tenant
                if mr.branch is None and branch is not None:
                    mr.branch = branch
                    update_fields.append('branch')
                mr.save(update_fields=update_fields)

            fixed += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f"\nDRY RUN complete. Would fix {fixed}, skip {skipped}."))
        else:
            self.stdout.write(self.style.SUCCESS(f"\nDone. Fixed {fixed}, skipped {skipped}."))
