"""
Staff clock-in / clock-out.

One Attendance row per staff per calendar day (unique on staff+date). The
"day" and the recorded times are in the organisation's local time zone
(settings.ATTENDANCE_TIME_ZONE) — not UTC — so a 08:05 arrival in Lagos is
stored as 08:05 on today's date, not 07:05 (or, just after midnight UTC,
on yesterday's date).

The server's clock decides the time; the client's clock and the client's
"date" are never trusted, so staff can't back- or forward-date themselves.
The GPS check is done against the branch the staff member is acting in
(clock-in) or the branch they clocked in at (clock-out), allowing extra room
for the phone's reported GPS accuracy (see hr.utils.validate_attendance_location).
"""
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from hr.models import Attendance
from hr.utils import validate_attendance_location


class ClockError(Exception):
    """A clock-in/out request that can't be honoured; carries the HTTP status."""

    def __init__(self, message, status_code=400, **extra):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.extra = extra

    def as_response_data(self):
        return {'error': self.message, **self.extra}


def attendance_tz():
    name = getattr(settings, 'ATTENDANCE_TIME_ZONE', None) or settings.TIME_ZONE
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo('UTC')


def attendance_now():
    """Current time in the attendance time zone, to the second."""
    return timezone.now().astimezone(attendance_tz()).replace(microsecond=0)


def _fmt(t):
    return t.strftime('%H:%M') if t else ''


def _check_location(branch, latitude, longitude, accuracy):
    is_valid, distance, message = validate_attendance_location(
        branch, latitude, longitude, accuracy_m=accuracy,
    )
    if not is_valid:
        raise ClockError(
            message,
            distance=f"{distance:.2f}" if distance else None,
            distance_meters=round(distance * 1000) if distance else None,
            requires_gps=True,
        )


def _working_hours_per_day(branch):
    try:
        from hr.config_models import HRConfig
        if branch is not None:
            return Decimal(str(HRConfig.get_for_branch(branch).working_hours_per_day))
    except Exception:
        pass
    return Decimal('8.00')


def refresh_hours(attendance):
    """Recompute hours_worked / overtime_hours from clock_in / clock_out."""
    if not attendance.clock_in or not attendance.clock_out:
        attendance.hours_worked = Decimal('0')
        attendance.overtime_hours = Decimal('0')
        return
    hours = Decimal(str(attendance.calculate_hours_worked())).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    standard = _working_hours_per_day(attendance.branch)
    attendance.hours_worked = hours
    attendance.overtime_hours = max(Decimal('0'), hours - standard).quantize(Decimal('0.01'))


def get_today_record(staff):
    today = attendance_now().date()
    return Attendance.objects.filter(staff=staff, date=today).first()


def get_open_record(staff):
    """Today's or yesterday's (overnight shift) record that is clocked in but not out."""
    today = attendance_now().date()
    return (
        Attendance.objects.filter(
            staff=staff,
            date__in=[today, today - timedelta(days=1)],
            clock_in__isnull=False,
            clock_out__isnull=True,
        )
        .order_by('-date')
        .first()
    )


def clock_in(*, staff, branch, actor, latitude=None, longitude=None, accuracy=None):
    _check_location(branch, latitude, longitude, accuracy)

    now = attendance_now()
    today = now.date()

    try:
        with transaction.atomic():
            record = (
                Attendance.all_objects.select_for_update()
                .filter(staff=staff, date=today)
                .first()
            )
            if record is not None and not record.is_deleted and record.clock_in:
                raise ClockError(f'Already clocked in today at {_fmt(record.clock_in)}.')

            if record is None:
                record = Attendance(
                    tenant=getattr(staff, 'tenant', None) or getattr(actor, 'tenant', None),
                    staff=staff,
                    date=today,
                    owner=actor,
                    created_by=actor,
                )
            elif record.is_deleted:
                # A deleted row still holds the (staff, date) unique slot —
                # bring it back as a fresh record instead of failing.
                record.is_deleted = False
                record.clock_out = None
                record.leave_request = None
                record.notes = ''

            record.clock_in = now.time()
            record.status = 'present'
            record.branch = branch or record.branch or staff.branch
            refresh_hours(record)
            record.save()
    except IntegrityError:
        # Two clock-in taps raced each other; the other one won.
        raise ClockError('Already clocked in today.')
    return record


def clock_out(*, staff, actor, latitude=None, longitude=None, accuracy=None):
    record = get_open_record(staff)
    if record is None:
        today_record = get_today_record(staff)
        if today_record and today_record.clock_out:
            raise ClockError(f'Already clocked out today at {_fmt(today_record.clock_out)}.')
        raise ClockError("You haven't clocked in today.", status_code=404)

    # Clock out against the branch they clocked in at.
    _check_location(record.branch or staff.branch, latitude, longitude, accuracy)

    with transaction.atomic():
        record = Attendance.objects.select_for_update().get(pk=record.pk)
        if record.clock_out:
            raise ClockError(f'Already clocked out at {_fmt(record.clock_out)}.')
        record.clock_out = attendance_now().time()
        refresh_hours(record)
        record.save()
    return record
