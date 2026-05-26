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
  staff: {
    id: number;
    full_name: string;
  };
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

export interface ClockInRequest {
  staff: number;
  date?: string;
  latitude?: number;
  longitude?: number;
}

export interface ClockOutRequest {
  staff: number;
  date?: string;
  latitude?: number;
  longitude?: number;
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
