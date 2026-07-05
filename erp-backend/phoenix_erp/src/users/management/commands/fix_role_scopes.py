"""
One-time fix: align tenant Role.default_scope values with their intended
data-access level.  Safe to re-run — only changes roles whose scope looks wrong.
"""
from django.core.management.base import BaseCommand

ROLE_SCOPE_MAP = {
    # name fragment (case-insensitive) → correct default_scope
    'credit officer':  'assigned_clients',
    'loan officer':    'assigned_clients',
    'field officer':   'assigned_clients',
    'registrar':       'assigned_clients',
    'supervisor':      'ajo_group',
    'branch manager':  'own_branch',
    'operations':      'own_branch',
    'director':        'global',
    'admin':           'global',
    'system admin':    'global',
}


class Command(BaseCommand):
    help = 'Fix Role.default_scope values to match their intended access level'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would change without saving'
        )

    def handle(self, *args, **options):
        from users.models import Role
        dry_run = options['dry_run']
        changed = 0

        for role in Role.objects.all():
            name_lower = role.name.lower()
            target_scope = None
            for fragment, scope in ROLE_SCOPE_MAP.items():
                if fragment in name_lower:
                    target_scope = scope
                    break

            if target_scope and role.default_scope != target_scope:
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}Updating '
                    f'"{role.name}" (tenant={role.tenant.name}): '
                    f'{role.default_scope!r} → {target_scope!r}'
                )
                if not dry_run:
                    role.default_scope = target_scope
                    role.save(update_fields=['default_scope'])
                changed += 1

        if changed == 0:
            self.stdout.write('No roles needed updating.')
        else:
            action = 'Would update' if dry_run else 'Updated'
            self.stdout.write(f'\n{action} {changed} role(s).')
