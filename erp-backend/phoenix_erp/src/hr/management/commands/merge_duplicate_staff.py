"""
hr/management/commands/merge_duplicate_staff.py

Finds every user whose linked Staff record is a signal-created stub that
duplicates a pre-existing imported Staff, then merges them.

Detection: a user has Staff A linked (user=user) AND there is another Staff B
in the same tenant with the same email OR the same first+last name, with
user=None (unlinked). One of them is the "real" imported Staff; the other is
the signal stub.

Scoring: whichever Staff has more references (assigned clients, groups, HR
records) is treated as the "real" one. Ties go to the record with the lower
pk (older / imported first).

On merge:
  1. Every FK that points to the "stub" is re-pointed to the "real" Staff.
  2. The "real" Staff is linked to the user.
  3. The stub is soft-deleted (is_deleted=True, user=None).

Usage
-----
Dry-run (no DB changes):
    python manage.py merge_duplicate_staff --dry-run

Apply:
    python manage.py merge_duplicate_staff

Limit to one tenant:
    python manage.py merge_duplicate_staff --tenant 1
"""
from __future__ import annotations

import logging
from django.core.management.base import BaseCommand
from django.db import transaction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# All (model, field_name) pairs that carry a FK to hr.Staff.
# Extend this list if new Staff FK fields are added to the codebase.
# ---------------------------------------------------------------------------
_STAFF_FK_FIELDS: list[tuple[str, str]] = [
    # clients app
    ('clients.Client',      'assigned_officer'),
    ('clients.Client',      'account_manager'),
    ('clients.ClientGroup', 'assigned_officer'),
    # hr app (supervisor chain)
    ('hr.Staff',            'reports_to'),
    # hr payroll / leave / attendance
    ('hr.StaffPayInfo',          'staff'),
    ('hr.BonusDeductionRequest', 'staff'),
    ('hr.LeaveBalance',          'staff'),
    ('hr.LeaveRequest',          'staff'),
    ('hr.Attendance',            'staff'),
    ('hr.Payslip',               'staff'),
]


def _get_model(dotted: str):
    from django.apps import apps
    app_label, model_name = dotted.split('.')
    return apps.get_model(app_label, model_name)


def _score(staff) -> int:
    """Higher = more data = more likely to be the 'real' imported Staff."""
    total = 0
    for model_path, field in _STAFF_FK_FIELDS:
        try:
            model = _get_model(model_path)
            total += model.objects.filter(**{field: staff}).count()
        except Exception:
            pass
    return total


def _name_from_username(username: str) -> tuple[str, str]:
    """
    Try to extract (first, last) from a username like 'Funmilola.Ogunwole'
    or 'simon_uche' or 'john doe'.  Returns ('', '') when parsing fails.
    """
    import re
    parts = re.split(r'[.\-_ ]+', username.strip())
    parts = [p for p in parts if p and not p.isdigit()]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return '', ''


def _find_candidate_real(stub, tenant) -> object | None:
    """
    Given a stub Staff (already linked to a user), return an unlinked Staff
    in the same tenant that matches by:
      1. email on the Staff record
      2. email on the linked User account
      3. first + last name on the Staff record
      4. first + last name parsed from the linked User's username
    Returns the best-scoring candidate or None.
    """
    from hr.models import Staff

    qs = Staff.objects.filter(tenant=tenant, user__isnull=True, is_deleted=False)
    seen_pks: list[int] = []
    candidates: list = []

    def _add(new_items):
        for item in new_items:
            if item.pk not in seen_pks:
                seen_pks.append(item.pk)
                candidates.append(item)

    # 1. Email on the Staff record itself
    staff_email = (getattr(stub, 'email', '') or '').strip().lower()
    if staff_email:
        _add(qs.filter(email__iexact=staff_email))

    # 2. Email from the linked User account (covers stubs with no Staff email)
    user = getattr(stub, 'user', None)
    user_email = ((getattr(user, 'email', '') or '') if user else '').strip().lower()
    if user_email and user_email != staff_email:
        _add(qs.filter(email__iexact=user_email))

    # 3. First + last name on the Staff record
    first = (getattr(stub, 'first_name', '') or '').strip()
    last  = (getattr(stub, 'last_name',  '') or '').strip()
    if first and last:
        _add(qs.filter(first_name__iexact=first, last_name__iexact=last))

    # 4. First + last parsed from the User's username
    #    (catches stubs created from accounts with no first/last name set)
    if user:
        u_first, u_last = _name_from_username(getattr(user, 'username', '') or '')
        if u_first and u_last and (u_first.lower() != first.lower() or u_last.lower() != last.lower()):
            _add(qs.filter(first_name__iexact=u_first, last_name__iexact=u_last))

    if not candidates:
        return None

    # Sort: highest score first; break ties by lowest pk (older / imported first)
    candidates.sort(key=lambda s: (-_score(s), s.pk))
    return candidates[0]


def _merge(stub, real, dry: bool, stdout) -> int:
    """
    Re-point all FKs from stub → real, link real to stub.user, delete stub.
    Returns the number of rows updated.
    """
    total_updated = 0

    for model_path, field in _STAFF_FK_FIELDS:
        try:
            model = _get_model(model_path)
            affected = model.objects.filter(**{field: stub})
            count = affected.count()
            if count:
                stdout.write(
                    f'      {model_path}.{field}: {count} row(s) → Staff pk={real.pk}'
                )
                if not dry:
                    affected.update(**{field: real})
                total_updated += count
        except Exception as exc:
            stdout.write(f'      WARNING: could not migrate {model_path}.{field}: {exc}')

    return total_updated


class Command(BaseCommand):
    help = 'Detect and merge signal-created stub Staff records with their imported originals'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would happen without writing any changes',
        )
        parser.add_argument(
            '--tenant',
            default=None,
            help='Restrict to a single tenant (pk or slug)',
        )

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from hr.models import Staff

        dry = options['dry_run']
        User = get_user_model()

        if dry:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be written.\n'))

        # ── Resolve tenant filter ───────────────────────────────────────────
        tenant_filter = {}
        tenant_arg = options.get('tenant')
        if tenant_arg:
            from users.models import Tenant
            try:
                tenant_obj = Tenant.objects.get(pk=int(tenant_arg))
            except (ValueError, Tenant.DoesNotExist):
                tenant_obj = Tenant.objects.filter(slug=tenant_arg).first()
            if not tenant_obj:
                self.stderr.write(f'Tenant {tenant_arg!r} not found.')
                return
            tenant_filter['tenant'] = tenant_obj

        # ── Iterate users who have a Staff profile ──────────────────────────
        linked_staff_qs = Staff.objects.filter(
            user__isnull=False, is_deleted=False, **tenant_filter
        ).select_related('user', 'tenant')

        pairs_found = 0
        pairs_merged = 0

        for stub in linked_staff_qs:
            user = stub.user
            tenant = stub.tenant
            if not tenant:
                continue

            real = _find_candidate_real(stub, tenant)
            if real is None:
                continue

            pairs_found += 1
            stub_score = _score(stub)
            real_score  = _score(real)

            # Decide which is actually the stub (lower score = stub)
            # If the "real" candidate has fewer refs than the linked one,
            # swap roles so we always migrate from lower-score to higher-score.
            if stub_score > real_score:
                stub, real = real, stub

            self.stdout.write(
                f'\nUser: {user.email or user.username} (pk={user.pk})'
            )
            self.stdout.write(
                f'  Stub  Staff pk={stub.pk} "{stub.first_name} {stub.last_name}" '
                f'score={stub_score}'
            )
            self.stdout.write(
                f'  Real  Staff pk={real.pk} "{real.first_name} {real.last_name}" '
                f'score={real_score}'
            )

            if dry:
                rows = _merge(stub, real, dry=True, stdout=self.stdout)
                self.stdout.write(
                    f'  Would re-point {rows} FK reference(s) and link real→user'
                )
            else:
                try:
                    with transaction.atomic():
                        rows = _merge(stub, real, dry=False, stdout=self.stdout)
                        # Link the real Staff to the user
                        real.user = user
                        real.save(update_fields=['user'])
                        # Unlink and soft-delete the stub
                        stub.user = None
                        stub.is_deleted = True
                        stub.save(update_fields=['user', 'is_deleted'])
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  ✓ Merged: {rows} FK(s) moved, '
                                f'real pk={real.pk} linked to user, '
                                f'stub pk={stub.pk} soft-deleted'
                            )
                        )
                        pairs_merged += 1
                except Exception as exc:
                    self.stdout.write(
                        self.style.ERROR(f'  ✗ Failed to merge: {exc}')
                    )

        self.stdout.write('')
        if dry:
            self.stdout.write(
                self.style.WARNING(
                    f'Found {pairs_found} duplicate pair(s). '
                    'Re-run without --dry-run to apply.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Done. Merged {pairs_merged}/{pairs_found} duplicate pair(s).'
                )
            )
            if pairs_found == 0:
                self.stdout.write('No duplicate Staff pairs found.')
