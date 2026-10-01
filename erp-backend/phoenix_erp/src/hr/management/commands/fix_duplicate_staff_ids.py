# hr/management/commands/fix_duplicate_staff_ids.py
"""
Find staff members sharing the same staff ID and give the newer ones a free ID.

Within each tenant, the staff member who has held the ID longest keeps it
(active staff are preferred over soft-deleted ones); every other holder is
moved to the next unused number in the same series (e.g. MML007 → MML019 when
MML018 is the highest in use). Numbers are never reused, including those of
soft-deleted staff.

Usage:
    python manage.py fix_duplicate_staff_ids                # dry-run (show what would change)
    python manage.py fix_duplicate_staff_ids --apply        # actually reassign
    python manage.py fix_duplicate_staff_ids --tenant 3     # limit to one tenant
"""

import re
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from hr.config_models import HRConfig, lock_staff_ids
from hr.models import Staff


class Command(BaseCommand):
    help = "Reassign duplicate staff IDs so every staff member in a tenant has a unique one"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Actually apply the fix. Without this flag the command is a dry-run.",
        )
        parser.add_argument(
            "--tenant",
            type=int,
            default=None,
            help="Only process this tenant id (default: all tenants).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        mode = "APPLYING FIXES" if apply else "DRY-RUN (use --apply to commit)"

        self.stdout.write("=" * 70)
        self.stdout.write(f"FIX DUPLICATE STAFF IDS — {mode}")
        self.stdout.write("=" * 70 + "\n")

        with transaction.atomic():
            by_tenant = self._load_staff(options["tenant"])
            for tenant_id in by_tenant:
                lock_staff_ids(tenant_id)

            total = 0
            for tenant_id, staff_list in sorted(by_tenant.items(), key=lambda kv: kv[0] or 0):
                total += self._fix_tenant(tenant_id, staff_list, apply)

        self.stdout.write("")
        if total == 0:
            self.stdout.write(self.style.SUCCESS("✓ No duplicate staff IDs found."))
        elif apply:
            self.stdout.write(self.style.SUCCESS(f"✓ Reassigned {total} staff ID(s)."))
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"{total} staff ID(s) would be reassigned. "
                    "This was a DRY-RUN. Run with --apply to commit."
                )
            )

    # ──────────────────────────────────────────────────────────────────────
    def _load_staff(self, only_tenant):
        """All staff holding an ID (including soft-deleted), grouped by tenant."""
        qs = (
            Staff.all_objects.all_tenants()
            .exclude(staff_id="")
            .select_related("branch")
            .order_by("pk")
        )
        by_tenant = defaultdict(list)
        for staff in qs:
            # Legacy rows may have no tenant of their own; fall back to the branch's.
            tenant_id = staff.tenant_id or (staff.branch.tenant_id if staff.branch else None)
            if only_tenant is not None and tenant_id != only_tenant:
                continue
            by_tenant[tenant_id].append(staff)
        return by_tenant

    def _fix_tenant(self, tenant_id, staff_list, apply):
        groups = defaultdict(list)
        for staff in staff_list:
            groups[staff.staff_id].append(staff)

        duplicates = {sid: members for sid, members in groups.items() if len(members) > 1}
        if not duplicates:
            return 0

        self.stdout.write(f"─── Tenant {tenant_id} ───")
        taken = set(groups)
        reassigned = 0

        for staff_id, members in sorted(duplicates.items()):
            # Oldest active holder keeps the ID.
            members.sort(key=lambda s: (s.is_deleted, s.created_at, s.pk))
            keeper, others = members[0], members[1:]
            self.stdout.write(f"  {staff_id}")
            self.stdout.write(f"    keeps:   {self._describe(keeper)}")

            for staff in others:
                new_id = self._next_free_id(staff, taken)
                if new_id is None:
                    self.stdout.write(
                        self.style.ERROR(
                            f"    SKIPPED: {self._describe(staff)} — cannot derive a new ID "
                            "(no numeric part and no branch); set one manually."
                        )
                    )
                    continue

                taken.add(new_id)
                self.stdout.write(f"    {new_id}: {self._describe(staff)}")
                if apply:
                    staff.staff_id = new_id
                    staff.save(update_fields=["staff_id", "updated_at"])
                reassigned += 1

        return reassigned

    def _next_free_id(self, staff, taken):
        """Next unused ID in the same series as the staff member's current one."""
        match = re.match(r"^(.*?)(\d+)$", staff.staff_id)
        if match:
            prefix, width = match.group(1), len(match.group(2))
        elif staff.branch:
            config = HRConfig.all_objects.all_tenants().filter(
                branch=staff.branch, is_deleted=False
            ).order_by("id").first()
            if config is None:
                return None
            prefix, width = config.staff_id_prefix, config.staff_id_padding
        else:
            return None

        highest = 0
        for existing in taken:
            tail = existing[len(prefix):]
            if existing.startswith(prefix) and tail.isdigit():
                highest = max(highest, int(tail))
        return f"{prefix}{str(highest + 1).zfill(width)}"

    @staticmethod
    def _describe(staff):
        name = f"{staff.first_name} {staff.last_name}".strip() or "(no name)"
        branch = staff.branch.name if staff.branch else "no branch"
        state = ", DELETED" if staff.is_deleted else ""
        return f"{name} (pk={staff.pk}, {branch}, created {staff.created_at:%Y-%m-%d}{state})"
