"""
One-off migration for the Material Request retirement.

The client + service-invoice Material Request workflow has been retired in
favour of Office Use Requests (staff-only, posts straight to each item's
category expense account — see inventory/models_office_use_request.py).
New material requests can no longer be created (the API returns 410 Gone),
but any request that was still open (draft/submitted/approved) when the
change shipped needs a home to finish its workflow in.

This command copies every open MaterialRequest into an equivalent
OfficeUseRequest (same status, items, approval trail where present) and
marks the original as cancelled with a note pointing at the replacement, so
the old record stays as an audit trail rather than a dead end.

Requests already in a terminal state (fulfilled / rejected / cancelled) are
left untouched.

Usage:
    python manage.py migrate_open_material_requests --dry-run
    python manage.py migrate_open_material_requests
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max


class Command(BaseCommand):
    help = (
        "Migrate open (draft/submitted/approved) MaterialRequest records into "
        "equivalent OfficeUseRequest records, then cancel the originals."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Print what would be migrated without saving anything.",
        )

    def handle(self, *args, **options):
        from inventory.models_material_request import MaterialRequest
        from inventory.models_office_use_request import OfficeUseRequest, OfficeUseRequestItem

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved.\n"))

        open_requests = MaterialRequest.objects.filter(
            status__in=['draft', 'submitted', 'approved']
        ).select_related('requested_by', 'delivery_location', 'client', 'service_invoice').prefetch_related('items__item')

        total = open_requests.count()
        self.stdout.write(f"Open material requests to migrate: {total}\n")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to migrate."))
            return

        migrated = 0
        skipped = 0

        for mr in open_requests:
            if not mr.items.exists():
                self.stdout.write(
                    self.style.WARNING(
                        f"  SKIP  MR {mr.request_number} (id={mr.id}) — no items"
                    )
                )
                skipped += 1
                continue

            context_bits = [f"Migrated from Material Request {mr.request_number}"]
            if mr.client_id:
                context_bits.append(f"client: {mr.client}")
            if mr.service_invoice_id:
                context_bits.append(f"service invoice: {mr.service_invoice.invoice_number}")
            migration_note = " — ".join(context_bits)

            self.stdout.write(
                f"  MIGRATE MR {mr.request_number} (id={mr.id}, status={mr.status}) "
                f"→ new Office Use Request. {migration_note}"
            )

            if dry_run:
                migrated += 1
                continue

            with transaction.atomic():
                tenant = mr.tenant
                base_qs = (
                    OfficeUseRequest.objects.filter(tenant=tenant)
                    if tenant
                    else OfficeUseRequest.objects.all()
                )
                last = base_qs.aggregate(Max('id'))
                next_id = (last['id__max'] or 0) + 1
                request_number = f"OUR-{next_id:06d}"

                our = OfficeUseRequest.objects.create(
                    request_number=request_number,
                    request_date=mr.request_date,
                    requested_by=mr.requested_by,
                    delivery_location=mr.delivery_location,
                    purpose=mr.purpose,
                    notes=f"{mr.notes}\n\n{migration_note}".strip(),
                    status=mr.status,
                    submitted_at=mr.submitted_at,
                    approved_by=mr.approved_by,
                    approved_at=mr.approved_at,
                    approval_notes=mr.approval_notes,
                    owner=mr.owner,
                    branch=mr.branch,
                    tenant=mr.tenant,
                )

                for mr_item in mr.items.all():
                    OfficeUseRequestItem.objects.create(
                        office_use_request=our,
                        item=mr_item.item,
                        quantity=mr_item.quantity,
                        notes=mr_item.notes,
                    )

                mr.status = 'cancelled'
                mr.notes = (
                    f"{mr.notes}\n\nSuperseded by Office Use Request {request_number} "
                    f"(Material Request workflow retired)."
                ).strip()
                mr.save(update_fields=['status', 'notes'])

            migrated += 1

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"\nDRY RUN complete. Would migrate {migrated}, skip {skipped}.")
            )
        else:
            self.stdout.write(self.style.SUCCESS(f"\nDone. Migrated {migrated}, skipped {skipped}."))
