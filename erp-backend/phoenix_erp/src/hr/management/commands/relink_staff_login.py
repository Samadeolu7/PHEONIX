"""
Point a user login at the RIGHT Staff record when it was auto-linked to a duplicate stub.

Why this happens: hr.signals.auto_create_staff_profile runs when a login is created. If it
can't match an existing Staff record by email/name (or the login has no tenant yet), it
creates a stub Staff and links the login to that. The real Staff record - the one holding
the officer's clients, recovery targets, payroll etc. - stays unlinked, and trying to link it
in the admin fails with "duplicate key ... hr_staff_user_id_key" (a Staff can't share a login).
If the stub has tenant=NULL it is also invisible to normal screens and to the admin's own
duplicate check, which is why the admin crashes instead of showing a form error.

Dry run by default - prints the plan and changes nothing:
    python manage.py relink_staff_login --user 14 --staff 16
Apply:
    python manage.py relink_staff_login --user 14 --staff 16 --apply

--user   login id, username or email
--staff  id of the REAL Staff record (the one with the clients/targets)

On --apply, in one transaction:
  1. unlink the login from the stub, link it to --staff (and align --staff's tenant if unset)
  2. move every record that points at the stub (attendance, leave, etc.) onto --staff,
     relation by relation; a relation that would break a uniqueness rule (e.g. both records
     already have attendance for the same day) is left on the stub and reported
  3. soft-delete the stub only if nothing points at it any more
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.db.models import Q


class Command(BaseCommand):
    help = 'Re-point a login from an auto-created duplicate Staff stub to the real Staff record.'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True)
        parser.add_argument('--staff', required=True, type=int)
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **opts):
        from users.models import User
        from hr.models import Staff

        q = opts['user'].strip()
        user = User.objects.filter(
            Q(username__iexact=q) | Q(email__iexact=q) | (Q(pk=int(q)) if q.isdigit() else Q(pk=None))
        ).first()
        if user is None:
            raise CommandError(f'No login matches "{q}".')

        every = Staff.all_objects.all_tenants()
        target = every.filter(pk=opts['staff']).first()
        if target is None:
            raise CommandError(f'Staff #{opts["staff"]} not found.')
        stub = every.filter(user=user).first()

        self.stdout.write(f'Login   : #{user.pk} {user.username} <{user.email}> tenant={user.tenant_id} branch={user.branch_id}')
        self.stdout.write(f'Real    : Staff #{target.pk} "{target.first_name} {target.last_name}" '
                          f'tenant={target.tenant_id} branch={target.branch_id} user={target.user_id} deleted={target.is_deleted}')
        if target.is_deleted:
            raise CommandError('The target Staff record is soft-deleted - pick the live record.')
        if target.user_id and target.user_id != user.pk:
            raise CommandError(f'Staff #{target.pk} is already linked to a different login (#{target.user_id}).')
        if stub and stub.pk == target.pk:
            self.stdout.write(self.style.SUCCESS('Already linked correctly - nothing to do.'))
            return
        if stub:
            self.stdout.write(f'Current : Staff #{stub.pk} "{stub.first_name} {stub.last_name}" '
                              f'tenant={stub.tenant_id} branch={stub.branch_id} deleted={stub.is_deleted}  <- will be unlinked')
        else:
            self.stdout.write('Current : login is not linked to any Staff record.')
        if user.tenant_id and target.tenant_id and user.tenant_id != target.tenant_id:
            raise CommandError('Login and target Staff belong to different tenants - refusing.')

        relations = self._relations(Staff)
        moves = []
        if stub:
            self.stdout.write('\nRecords pointing at the stub:')
            for model, field in relations:
                n = model._base_manager.filter(**{field: stub}).count()
                if n:
                    moves.append((model, field, n))
                    self.stdout.write(f'  {model._meta.label}.{field}: {n}')
            if not moves:
                self.stdout.write('  none - the stub is empty.')

        if not opts['apply']:
            self.stdout.write(self.style.WARNING('\nDry run - nothing changed. Re-run with --apply.'))
            return

        left_behind = []
        with transaction.atomic():
            if stub:
                Staff.all_objects.all_tenants().filter(pk=stub.pk).update(user=None)
            updates = {'user': user}
            if target.tenant_id is None and user.tenant_id:
                updates['tenant_id'] = user.tenant_id
            Staff.all_objects.all_tenants().filter(pk=target.pk).update(**updates)

            for model, field, n in moves:
                try:
                    with transaction.atomic():
                        moved = model._base_manager.filter(**{field: stub}).update(**{field: target})
                    self.stdout.write(f'  moved {moved} {model._meta.label}.{field}')
                except IntegrityError as exc:
                    left_behind.append((model, field, n))
                    self.stdout.write(self.style.ERROR(
                        f'  NOT moved {model._meta.label}.{field} ({n}) - would break a uniqueness rule: {exc}'))

            if stub and not left_behind:
                Staff.all_objects.all_tenants().filter(pk=stub.pk).update(is_deleted=True)
                self.stdout.write(f'  stub Staff #{stub.pk} soft-deleted')
            elif stub:
                self.stdout.write(self.style.WARNING(
                    f'  stub Staff #{stub.pk} kept (unlinked) because some records could not be moved - review them.'))

        self.stdout.write(self.style.SUCCESS(f'\nLogin #{user.pk} is now linked to Staff #{target.pk}.'))

    @staticmethod
    def _relations(Staff):
        """Every concrete FK / one-to-one on any model that points at Staff (excluding Staff.user itself)."""
        out = []
        for rel in Staff._meta.related_objects:
            if rel.many_to_many or not rel.field.concrete:
                continue
            out.append((rel.related_model, rel.field.name))
        return out
