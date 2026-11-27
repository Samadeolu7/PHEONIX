"""
Staff clock-in / clock-out: self-service, local-time days, GPS fence with
phone-accuracy allowance, hours/overtime, and the office-location guard.
"""
from datetime import datetime, time
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from branches.models import Branch
from hr.models import Attendance, Staff
from hr.utils import validate_attendance_location
from users.models import Tenant

User = get_user_model()

LAGOS = ZoneInfo('Africa/Lagos')
# Office at Lagos; ~0.0045 deg latitude ≈ 500 m north of it.
OFFICE = (Decimal('6.524400'), Decimal('3.379200'))
INSIDE = {'latitude': 6.5246, 'longitude': 3.3792}          # ~22 m
JUST_OUTSIDE = {'latitude': 6.5280, 'longitude': 3.3792}    # ~400 m
FAR = {'latitude': 6.6000, 'longitude': 3.3792}             # ~8.4 km


def at(y, m, d, hh, mm):
    """Patch target returning a fixed Lagos-local 'now' for the clock service."""
    return datetime(y, m, d, hh, mm, tzinfo=LAGOS)


@override_settings(ATTENDANCE_TIME_ZONE='Africa/Lagos')
class ClockInOutTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Clock Co')
        self.branch = Branch.objects.create(
            name='Head Office', code='HO1', tenant=self.tenant,
            latitude=OFFICE[0], longitude=OFFICE[1], attendance_radius_meters=200,
        )
        # Plain staff member: no role, no HR page permissions.
        self.user = User.objects.create_user(
            username='worker', email='w@x.com', password='pw12345678',
            tenant=self.tenant, branch=self.branch,
        )
        self.staff, _ = Staff.objects.update_or_create(
            user=self.user,
            defaults=dict(first_name='Ada', last_name='Obi', department='Ops',
                          position='Teller', branch=self.branch, tenant=self.tenant,
                          owner=self.user),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _now(self, dt):
        return patch('hr.services.attendance_clock.timezone.now', return_value=dt)

    def test_staff_can_clock_themselves_in_without_hr_permission(self):
        with self._now(at(2026, 11, 27, 8, 5)):
            r = self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        rec = Attendance.objects.get(staff=self.staff)
        self.assertEqual(rec.clock_in, time(8, 5))
        self.assertEqual(rec.branch, self.branch)

    def test_day_and_time_are_local_not_utc(self):
        # 00:30 in Lagos is 23:30 UTC the previous day.
        with self._now(at(2026, 11, 27, 0, 30)):
            self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        rec = Attendance.objects.get(staff=self.staff)
        self.assertEqual(rec.date.isoformat(), '2026-11-27')
        self.assertEqual(rec.clock_in, time(0, 30))

    def test_client_supplied_date_is_ignored(self):
        with self._now(at(2026, 11, 27, 8, 0)):
            self.client.post(reverse('hr:attendance-clock-in'),
                             {**INSIDE, 'date': '2026-01-01'}, format='json')
        self.assertEqual(Attendance.objects.get(staff=self.staff).date.isoformat(), '2026-11-27')

    def test_cannot_clock_in_someone_else_without_permission(self):
        other_user = User.objects.create_user(
            username='other', email='o@x.com', password='pw12345678',
            tenant=self.tenant, branch=self.branch,
        )
        other = Staff.objects.get(user=other_user)
        r = self.client.post(reverse('hr:attendance-clock-in'),
                             {**INSIDE, 'staff': other.pk}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Attendance.objects.filter(staff=other).exists())

    def test_far_away_is_rejected(self):
        r = self.client.post(reverse('hr:attendance-clock-in'), FAR, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.data['requires_gps'])
        self.assertIn('Head Office', r.data['error'])

    def test_missing_location_is_rejected_when_branch_has_one(self):
        r = self.client.post(reverse('hr:attendance-clock-in'), {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_gps_accuracy_gives_room_for_imprecise_phones(self):
        # ~400 m away, radius 200 m: rejected with a precise fix ...
        r = self.client.post(reverse('hr:attendance-clock-in'),
                             {**JUST_OUTSIDE, 'accuracy': 10}, format='json')
        self.assertEqual(r.status_code, 400)
        # ... accepted when the phone says it's only accurate to ±250 m.
        r = self.client.post(reverse('hr:attendance-clock-in'),
                             {**JUST_OUTSIDE, 'accuracy': 250}, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_accuracy_allowance_is_capped(self):
        ok, _, msg = validate_attendance_location(self.branch, FAR['latitude'], FAR['longitude'],
                                                  accuracy_m=50000)
        self.assertFalse(ok)
        self.assertIn('accurate to about', msg)

    def test_no_branch_location_skips_gps(self):
        self.branch.latitude = None
        self.branch.longitude = None
        self.branch.save()
        r = self.client.post(reverse('hr:attendance-clock-in'), {}, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_clock_out_records_hours_and_overtime(self):
        with self._now(at(2026, 11, 27, 8, 0)):
            self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        with self._now(at(2026, 11, 27, 18, 30)):
            r = self.client.post(reverse('hr:attendance-clock-out'), INSIDE, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        rec = Attendance.objects.get(staff=self.staff)
        self.assertEqual(rec.clock_out, time(18, 30))
        self.assertEqual(rec.hours_worked, Decimal('10.50'))
        self.assertEqual(rec.overtime_hours, Decimal('2.50'))

    def test_overnight_shift_clocks_out_of_yesterdays_record(self):
        with self._now(at(2026, 11, 27, 22, 0)):
            self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        with self._now(at(2026, 11, 28, 6, 0)):
            r = self.client.post(reverse('hr:attendance-clock-out'), INSIDE, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        rec = Attendance.objects.get(staff=self.staff)
        self.assertEqual(rec.hours_worked, Decimal('8.00'))

    def test_double_clock_in_and_out(self):
        with self._now(at(2026, 11, 27, 8, 0)):
            self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
            r = self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
            self.assertEqual(r.status_code, 400)
            self.assertIn('08:00', r.data['error'])
            self.client.post(reverse('hr:attendance-clock-out'), INSIDE, format='json')
            r = self.client.post(reverse('hr:attendance-clock-out'), INSIDE, format='json')
            self.assertEqual(r.status_code, 400)

    def test_clock_out_without_clock_in(self):
        r = self.client.post(reverse('hr:attendance-clock-out'), INSIDE, format='json')
        self.assertEqual(r.status_code, 404)

    def test_record_keyed_in_by_hr_does_not_block_clock_in(self):
        # HR pre-created today's row (different owner, no clock_in).
        hr_user = User.objects.create_user(
            username='hr', email='h@x.com', password='pw12345678',
            tenant=self.tenant, branch=self.branch, is_system_admin=True,
        )
        with self._now(at(2026, 11, 27, 9, 0)):
            Attendance.objects.create(staff=self.staff, date='2026-11-27', owner=hr_user,
                                      branch=self.branch, tenant=self.tenant, status='absent')
            r = self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Attendance.objects.get(staff=self.staff).status, 'present')

    def test_soft_deleted_record_is_revived(self):
        with self._now(at(2026, 11, 27, 9, 0)):
            Attendance.objects.create(staff=self.staff, date='2026-11-27', clock_in=time(7, 0),
                                      branch=self.branch, tenant=self.tenant, is_deleted=True)
            r = self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        rec = Attendance.objects.get(staff=self.staff)
        self.assertEqual(rec.clock_in, time(9, 0))

    def test_my_status(self):
        with self._now(at(2026, 11, 27, 8, 0)):
            self.client.post(reverse('hr:attendance-clock-in'), INSIDE, format='json')
        with patch('hr.services.attendance_clock.timezone.now', return_value=at(2026, 11, 27, 9, 0)):
            r = self.client.get(reverse('hr:attendance-my-status'))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['is_clocked_in'])
        self.assertEqual(r.data['date'], '2026-11-27')
        self.assertTrue(r.data['branch']['has_location'])
        self.assertEqual(r.data['branch']['attendance_radius_meters'], 200)


class OfficeLocationPermissionTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Loc Co')
        self.branch = Branch.objects.create(name='Ikeja', code='IK1', tenant=self.tenant)
        self.staff_user = User.objects.create_user(
            username='plain', email='p@x.com', password='pw12345678',
            tenant=self.tenant, branch=self.branch,
        )
        self.admin = User.objects.create_user(
            username='admin', email='a@x.com', password='pw12345678',
            tenant=self.tenant, branch=self.branch, is_system_admin=True,
        )
        self.url = reverse('branch-detail', args=[self.branch.pk]) if self._has_route('branch-detail') \
            else f'/api/branches/{self.branch.pk}/'

    @staticmethod
    def _has_route(name):
        try:
            reverse(name, args=[1])
            return True
        except Exception:
            return False

    def test_plain_staff_cannot_move_the_office(self):
        c = APIClient()
        c.force_authenticate(self.staff_user)
        r = c.patch(self.url, {'latitude': 6.5, 'longitude': 3.3}, format='json')
        self.assertEqual(r.status_code, 403)
        self.branch.refresh_from_db()
        self.assertIsNone(self.branch.latitude)

    def test_admin_sets_location_with_full_precision_coordinates(self):
        c = APIClient()
        c.force_authenticate(self.admin)
        r = c.patch(self.url, {'latitude': 6.524412345678901, 'longitude': 3.379198765432101,
                               'attendance_radius_meters': 150}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.branch.refresh_from_db()
        self.assertEqual(self.branch.latitude, Decimal('6.524412'))
        self.assertEqual(self.branch.longitude, Decimal('3.379199'))
        self.assertEqual(self.branch.attendance_radius_meters, 150)
