"""
Bulk-assign unassigned clients to a staff member, with optional group filtering.

Usage examples:
  # Assign all unassigned clients in the tenant to staff pk=6
  python manage.py assign_officer_clients --staff-pk 6

  # Assign only clients in groups 8,11,29 to staff pk=6
  python manage.py assign_officer_clients --staff-pk 6 --groups 8,11,29

  # Preview without saving
  python manage.py assign_officer_clients --staff-pk 6 --dry-run

  # Assign all clients (including already-assigned ones) to staff pk=6
  python manage.py assign_officer_clients --staff-pk 6 --overwrite
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Bulk-assign clients to a credit officer Staff record'

    def add_arguments(self, parser):
        parser.add_argument('--staff-pk', required=True, type=int,
                            help='Primary key of the Staff record to assign clients to')
        parser.add_argument('--groups', default='',
                            help='Comma-separated group IDs to limit assignment (default: all)')
        parser.add_argument('--overwrite', action='store_true',
                            help='Also reassign clients already assigned to another officer')
        parser.add_argument('--dry-run', action='store_true',
                            help='Print what would change without saving')

    def handle(self, *args, **options):
        from hr.models import Staff
        from clients.models import Client

        try:
            staff = Staff.objects.get(pk=options['staff_pk'])
        except Staff.DoesNotExist:
            raise CommandError(f"Staff pk={options['staff_pk']} not found")

        self.stdout.write(
            f'Staff: {staff} (pk={staff.pk}, branch={staff.branch}, role={staff.role_level})'
        )
        if staff.user:
            self.stdout.write(f'  Linked user: {staff.user.email}')

        qs = Client.objects.filter(tenant=staff.tenant, is_deleted=False)

        group_ids = [g.strip() for g in options['groups'].split(',') if g.strip()]
        if group_ids:
            qs = qs.filter(group_id__in=group_ids)
            self.stdout.write(f'Filtering to groups: {group_ids}')

        if not options['overwrite']:
            qs = qs.filter(assigned_officer__isnull=True)

        count = qs.count()
        self.stdout.write(f'\nClients to assign: {count}')

        if count == 0:
            self.stdout.write('Nothing to do.')
            return

        if options['dry_run']:
            self.stdout.write('[DRY RUN] No changes saved.')
            for c in qs[:20]:
                self.stdout.write(f'  Would assign: {c.client_id} {c.full_name}')
            if count > 20:
                self.stdout.write(f'  ... and {count - 20} more')
            return

        updated = qs.update(assigned_officer=staff)
        self.stdout.write(f'Done. Assigned {updated} client(s) to {staff}.')
