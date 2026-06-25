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
            roles = list(user.roles.filter(is_active=True))
            self.stdout.write(f'\n=== Tenant Roles ===')
            if roles:
                for r in roles:
                    self.stdout.write(f'  - {r.name} (scope={r.default_scope})')
            else:
                self.stdout.write('  [!] No active roles assigned — user will be treated as own_branch scope')
        except Exception as e:
            self.stdout.write(f'  [!] Could not load roles: {e}')

        # Show assigned clients
        try:
            from clients.models import Client, ClientGroup
            if staff:
                total = Client.objects.filter(tenant=user.tenant, is_deleted=False).count()

                direct = Client.objects.filter(
                    tenant=user.tenant, assigned_officer=staff, is_deleted=False
                ).count()

                via_group = Client.objects.filter(
                    tenant=user.tenant,
                    group__assigned_officer=staff,
                    is_deleted=False,
                ).count()

                groups_assigned = ClientGroup.objects.filter(
                    tenant=user.tenant, assigned_officer=staff, is_deleted=False
                )

                self.stdout.write(f'\n=== Client Assignments ===')
                self.stdout.write(f'  Total clients in tenant        : {total}')
                self.stdout.write(f'  Directly assigned (Client.assigned_officer)   : {direct}')
                self.stdout.write(f'  Via group (ClientGroup.assigned_officer)       : {via_group}')
                self.stdout.write(f'\n=== Groups Assigned to This Staff ===')
                if groups_assigned:
                    for g in groups_assigned:
                        member_count = Client.objects.filter(
                            group=g, is_deleted=False
                        ).count()
                        self.stdout.write(f'  - {g.name} (pk={g.pk}, members={member_count})')
                else:
                    self.stdout.write('  [!] No groups assigned to this staff record')
                    self.stdout.write('      Assign groups via the Groups page or run:')
                    self.stdout.write('      python manage.py assign_officer_clients --staff-pk <pk>')

                effective = direct + via_group
                self.stdout.write(f'\n  Effective visible clients (direct + via group): {effective}')
        except Exception as e:
            self.stdout.write(f'  [!] Could not check client assignments: {e}')

        self.stdout.write('')
