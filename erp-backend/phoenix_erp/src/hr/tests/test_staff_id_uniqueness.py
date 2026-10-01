# hr/tests/test_staff_id_uniqueness.py
"""
Regression tests: two staff members must never end up with the same staff ID.
"""
from io import StringIO

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase

from branches.models import Branch
from common.managers import set_current_tenant
from hr.config_models import HRConfig
from hr.models import Staff
from users.models import Tenant


class StaffIdUniquenessTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
        set_current_tenant(self.tenant)
        self.addCleanup(set_current_tenant, None)
        self.branch_a = Branch.objects.create(name="Branch A", code="BA", tenant=self.tenant)
        self.branch_b = Branch.objects.create(name="Branch B", code="BB", tenant=self.tenant)

    def _staff(self, branch, name, **extra):
        return Staff.objects.create(
            first_name=name, last_name="Test", branch=branch, tenant=self.tenant, **extra
        )

    def _duplicate(self, staff, staff_id):
        """Force a duplicate ID the way pre-fix data has it, bypassing the guard."""
        Staff.objects.filter(pk=staff.pk).update(staff_id=staff_id)
        staff.refresh_from_db()

    def test_sequential_ids_in_one_branch(self):
        ids = [self._staff(self.branch_a, f"S{i}").staff_id for i in range(3)]
        self.assertEqual(ids, ["STF001", "STF002", "STF003"])
        # The config is created once and reused, not recreated per staff.
        self.assertEqual(HRConfig.objects.filter(branch=self.branch_a).count(), 1)

    def test_branches_sharing_a_prefix_do_not_collide(self):
        first = self._staff(self.branch_a, "A")
        second = self._staff(self.branch_b, "B")
        self.assertEqual(first.staff_id, "STF001")
        self.assertEqual(second.staff_id, "STF002")

    def test_generator_skips_manually_assigned_ids(self):
        self._staff(self.branch_a, "Imported", staff_id="STF001")
        self._staff(self.branch_a, "Imported2", staff_id="STF002")
        self.assertEqual(self._staff(self.branch_a, "Auto").staff_id, "STF003")

    def test_generator_skips_ids_of_deleted_staff(self):
        gone = self._staff(self.branch_a, "Gone")
        Staff.objects.filter(pk=gone.pk).delete()  # soft delete
        HRConfig.objects.filter(branch=self.branch_a).update(staff_id_current_number=1)
        self.assertEqual(self._staff(self.branch_a, "New").staff_id, "STF002")

    def test_manual_duplicate_is_rejected_on_create(self):
        self._staff(self.branch_a, "First", staff_id="MML001")
        with self.assertRaises(ValidationError):
            self._staff(self.branch_b, "Second", staff_id="MML001")

    def test_changing_to_a_taken_id_is_rejected(self):
        self._staff(self.branch_a, "First")
        second = self._staff(self.branch_a, "Second")
        second.staff_id = "STF001"
        with self.assertRaises(ValidationError):
            second.save()
        with self.assertRaises(ValidationError):
            second.full_clean()

    def test_existing_duplicates_remain_editable(self):
        first = self._staff(self.branch_a, "First")
        second = self._staff(self.branch_a, "Second")
        self._duplicate(second, first.staff_id)
        second.phone = "08000000000"
        second.save()
        second.refresh_from_db()
        self.assertEqual(second.phone, "08000000000")

    def test_other_tenants_may_reuse_an_id(self):
        self._staff(self.branch_a, "First", staff_id="MML001")
        other = Tenant.objects.create(name="Other Tenant", slug="other-tenant")
        other_branch = Branch.objects.create(name="Other", code="OT", tenant=other)
        set_current_tenant(other)
        staff = Staff.objects.create(
            first_name="X", last_name="Y", branch=other_branch, tenant=other, staff_id="MML001"
        )
        self.assertEqual(staff.staff_id, "MML001")


class FixDuplicateStaffIdsCommandTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
        set_current_tenant(self.tenant)
        self.addCleanup(set_current_tenant, None)
        self.branch = Branch.objects.create(name="Branch A", code="BA", tenant=self.tenant)
        self.staff = [
            Staff.objects.create(
                first_name=f"S{i}", last_name="Test", branch=self.branch, tenant=self.tenant
            )
            for i in range(3)
        ]  # STF001..STF003
        # The newest staff member shares the oldest one's ID.
        Staff.objects.filter(pk=self.staff[2].pk).update(staff_id="STF001")

    def _ids(self):
        return list(Staff.objects.order_by("pk").values_list("staff_id", flat=True))

    def test_dry_run_changes_nothing(self):
        out = StringIO()
        call_command("fix_duplicate_staff_ids", stdout=out)
        self.assertEqual(self._ids(), ["STF001", "STF002", "STF001"])
        self.assertIn("DRY-RUN", out.getvalue())

    def test_apply_moves_the_newer_staff_to_a_free_id(self):
        call_command("fix_duplicate_staff_ids", "--apply", stdout=StringIO())
        self.assertEqual(self._ids(), ["STF001", "STF002", "STF003"])

        # Running again is a no-op, and new staff carry on after the repaired ID.
        call_command("fix_duplicate_staff_ids", "--apply", stdout=StringIO())
        self.assertEqual(self._ids(), ["STF001", "STF002", "STF003"])
        new = Staff.objects.create(
            first_name="New", last_name="Test", branch=self.branch, tenant=self.tenant
        )
        self.assertEqual(new.staff_id, "STF004")

    def test_three_way_duplicate_gets_distinct_ids(self):
        Staff.objects.filter(pk=self.staff[1].pk).update(staff_id="STF001")
        call_command("fix_duplicate_staff_ids", "--apply", stdout=StringIO())
        self.assertEqual(self._ids(), ["STF001", "STF002", "STF003"])
