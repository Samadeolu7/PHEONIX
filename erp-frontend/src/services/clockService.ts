import {
  AttendanceRecord,
  AttendanceResponse,
  ClockInRequest,
  ClockOutRequest,
  ClockInResponse,
  ClockOutResponse,
  BulkAttendanceRequest,
  BulkAttendanceResponse,
} from '../types/leaveBalance';
import { api } from './api';

export const clockService = {
  // Attendance CRUD
  async getAttendance(params?: {
    staff?: number;
    date?: string;
    date__gte?: string;
    date__lte?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<AttendanceResponse> {
    const response = await api.get('/hr/attendance/', { params });
    return response;
  },

  async getAttendanceRecord(id: number): Promise<AttendanceRecord> {
    const response = await api.get(`/hr/attendance/${id}/`);
    return response;
  },

  // Clock In/Out
  async clockIn(data: ClockInRequest): Promise<ClockInResponse> {
    const response = await api.post('/hr/attendance/clock_in/', data);
    return response;
  },

  async clockOut(data: ClockOutRequest): Promise<ClockOutResponse> {
    const response = await api.post('/hr/attendance/clock_out/', data);
    return response;
  },

  // Bulk attendance
  async bulkCreateAttendance(data: BulkAttendanceRequest): Promise<BulkAttendanceResponse> {
    const response = await api.post('/hr/attendance/bulk_create/', data);
    return response;
  },

  // Get current attendance status for a staff member
  async getCurrentAttendanceStatus(
    staffId: number,
    date?: string
  ): Promise<AttendanceRecord | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const response = await api.get('/hr/attendance/', {
      params: {
        staff: staffId,
        date: targetDate,
        page_size: 1,
      },
    });
    return response.results && response.results.length > 0 ? response.results[0] : null;
  },
};
