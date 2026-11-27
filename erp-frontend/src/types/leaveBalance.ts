// Types based on HR_API_REFERENCE.md

export interface LeaveBalance {
  id: number;
  staff: {
    id: number;
    full_name: string;
  };
  leave_type: {
    code: string;
    name: string;
  };
  year: number;
  entitled_days: string;
  used_days: string;
  pending_days: string;
  carried_over_days: string;
  available_days: string;
}

export interface LeaveBalancesResponse {
  count: number;
  results: LeaveBalance[];
}

export interface AttendanceRecord {
  id: number;
  staff: number;
  staff_id?: string;
  staff_name?: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  hours_worked: string;
  overtime_hours: string;
  notes: string;
}

export interface AttendanceResponse {
  count: number;
  results: AttendanceRecord[];
}

/**
 * Omit `staff` to clock yourself; passing someone else's id needs HR
 * attendance permission. The server decides the date and time (in the
 * organisation's time zone) — any `date` sent is ignored.
 */
export interface ClockInRequest {
  staff?: number;
  latitude?: number;
  longitude?: number;
  /** Device-reported GPS accuracy in meters; gives imprecise phones some extra room. */
  accuracy?: number;
}

export type ClockOutRequest = ClockInRequest;

export interface MyClockStatus {
  staff: { id: number; staff_id?: string; name: string };
  date: string;
  server_time: string;
  today: AttendanceRecord | null;
  open_record: AttendanceRecord | null;
  is_clocked_in: boolean;
  branch: {
    id: number;
    name: string;
    has_location: boolean;
    attendance_radius_meters: number | null;
  } | null;
}

export interface ClockInResponse {
  id: number;
  staff: number;
  date: string;
  clock_in: string;
  status: string;
}

export interface ClockOutResponse {
  id: number;
  clock_out: string;
  hours_worked: string;
}

export interface BulkAttendanceRecord {
  staff: number;
  clock_in?: string;
  clock_out?: string;
  status: string;
}

export interface BulkAttendanceRequest {
  date: string;
  records: BulkAttendanceRecord[];
}

export interface BulkAttendanceResponse {
  created: number;
  records: AttendanceRecord[];
}
