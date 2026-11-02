"""
Read-only: explain why a user's "My recovery target" dashboard card shows (or doesn't). Changes nothing.

Usage:
    python manage.py diagnose_recovery_target --user omotolani            # username, email or part of name
    python manage.py diagnose_recovery_target --user omotolani --month 2026-11

Checks, in the order the card depends on them:
  1. which Staff record the login is linked to (User.staff_profile)
  2. any OTHER Staff records with the same name - a duplicate (e.g. the stub the
     auto_create_staff_profile signal makes when the user's email doesn't match the
     imported staff record) means clients/targets can sit on one record while the
     login points at another
  3. recovery targets for the month on each of those records
  4. assigned clients on each record
  5. what /api/analytics/recovery-targets/mine/ would return for this user today
"""
import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils import timezone


class Command(BaseCommand):
    help = "Read-only: explain why a user's recovery target dashboard card shows or is hidden."

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True, help='Username, email, or part of the first/last name')
        parser.add_argument('--month', help='YYYY-MM (default: current month)')

    def handle(self, *args, **opts):
        from common.managers import set_current_tenant
        from users.models import User
        from hr.models import Staff
        from analytics.models import OfficerRecoveryTarget
        from analytics.views import my_recovery_focus

        today = timezone.localdate()
        month = today.replace(day=1)
        if opts.get('month'):
            try:
                y, m = (int(p) for p in opts['month'].split('-'))
                month = datetime.date(y, m, 1)
            except ValueError:
                raise CommandError('--month must be YYYY-MM')

        q = opts['user'].strip()
        users = list(User.objects.filter(
            Q(username__iexact=q) | Q(email__iexact=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
        )[:10])
        if not users:
            raise CommandError(f'No user matches "{q}".')

        for user in users:
            set_current_tenant(getattr(user, 'tenant', None))
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'\nUser #{user.pk} {user.username} <{user.email}> '
                f'name="{user.first_name} {user.last_name}" tenant={user.tenant_id} branch={user.branch_id}'))

            # all_tenants(): an auto-created stub can have tenant=NULL (login created before
            # its tenant was set), which hides it from every tenant-filtered query.
            every_staff = Staff.all_objects.all_tenants()
            linked = every_staff.filter(user=user).first()
            if linked is None:
                self.stdout.write(self.style.ERROR('  1. Login is NOT linked to any Staff record -> card hidden.'))
            else:
                self.stdout.write(
                    f'  1. Login linked to Staff #{linked.pk} "{linked.first_name} {linked.last_name}" '
                    f'tenant={linked.tenant_id}' + (' (SOFT-DELETED!)' if linked.is_deleted else ''))
                if linked.tenant_id != user.tenant_id:
                    self.stdout.write(self.style.ERROR(
                        f'     Linked Staff tenant ({linked.tenant_id}) != login tenant ({user.tenant_id}) '
                        f'- invisible to normal screens and the admin duplicate check.'))

            candidates = {}
            for first, last in {((user.first_name or '').strip(), (user.last_name or '').strip()),
                                ((linked.first_name or '').strip(), (linked.last_name or '').strip()) if linked else ('', '')}:
                if first and last:
                    for s in every_staff.filter(first_name__iexact=first, last_name__iexact=last):
                        candidates[s.pk] = s
            if user.email:
                for s in every_staff.filter(email__iexact=user.email):
                    candidates[s.pk] = s
            if linked:
                candidates[linked.pk] = linked
            if len(candidates) > 1:
                self.stdout.write(self.style.WARNING(
                    f'  2. {len(candidates)} Staff records share this name - possible duplicate:'))
            else:
                self.stdout.write('  2. No duplicate Staff records by name.')

            for s in candidates.values():
                target = OfficerRecoveryTarget.all_objects.all_tenants().filter(staff=s, month=month).first()
                clients = s.assigned_clients.filter(is_deleted=False).count()
                marker = '<- login' if linked and s.pk == linked.pk else ''
                self.stdout.write(
                    f'     Staff #{s.pk} "{s.first_name} {s.last_name}" email={s.email or "-"} '
                    f'branch={s.branch_id} tenant={s.tenant_id} user={s.user_id} deleted={s.is_deleted} '
                    f'clients={clients} target[{month:%Y-%m}]='
                    f'{(str(target.target_amount) + (" (deleted)" if target.is_deleted else "")) if target else "none"} {marker}')
                if target and target.tenant_id != s.tenant_id:
                    self.stdout.write(self.style.ERROR(
                        f'       target tenant={target.tenant_id} differs from staff tenant={s.tenant_id}'))

            if linked:
                focus = my_recovery_focus(linked, user, today if month == today.replace(day=1) else month)
                if focus is None:
                    self.stdout.write(self.style.ERROR(
                        f'  5. Card: HIDDEN - no target on the linked Staff #{linked.pk} for {month:%Y-%m}.'))
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f"  5. Card: SHOWN - focus={focus['focus']} shortfall={focus['shortfall']} "
                        f"target={focus['target']} recovered_mtd={focus['recovered_mtd']}"))
