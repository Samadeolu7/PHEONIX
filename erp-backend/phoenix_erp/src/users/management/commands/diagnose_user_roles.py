from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Diagnose role/staff setup for a user to debug access-scoping issues'

    def add_arguments(self, parser):
        parser.add_argument('identifier', help='User email or username')

    def handle(self, *args, **options):
        ident = options['identifier']
        try:
            user = User.objects.get(email=ident)
        except User.DoesNotExist:
            try:
                user = User.objects.get(username=ident)
            except User.DoesNotExist:
                self.stderr.write(f'User not found: {ident}')
                return

        self.stdout.write(f'\n=== User: {user.email} (pk={user.pk}) ===')
        self.stdout.write(f'  is_active       : {user.is_active}')
        self.stdout.write(f'  is_system_admin : {getattr(user, "is_system_admin", "N/A")}')
        self.stdout.write(f'  is_owner()      : {user.is_owner() if callable(getattr(user, "is_owner", None)) else "N/A"}')
        self.stdout.write(f'  tenant          : {getattr(user, "tenant", None)}')
        self.stdout.write(f'  branch          : {getattr(user, "branch", None)}')

        try:
            staff = user.staff_profile
            self.stdout.write(f'\n=== Linked Staff record (pk={staff.pk}) ===')
            self.stdout.write(f'  role_level  : {staff.role_level!r}')
            self.stdout.write(f'  reports_to  : {staff.reports_to}')
            self.stdout.write(f'  branch      : {staff.branch}')
        except Exception as e:
            self.stdout.write(f'\n  [!] No staff_profile linked: {e}')
            self.stdout.write('  --> _apply_officer_scope will now return qs.none() (after latest fix)')

        # Show tenant roles
        try:
            from users.models import Role
            roles = user.roles.all() if hasattr(user, 'roles') else []
            if roles:
                self.stdout.write(f'\n=== Tenant Roles ===')
                for r in roles:
                    self.stdout.write(f'  - {r.name} (scope={r.default_scope})')
        except Exception:
            pass

        self.stdout.write('')
