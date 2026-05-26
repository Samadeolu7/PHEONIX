// Test for enhanced staff detail endpoints in hrService
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hrService } from '../hrService';
import { api } from '../api';
import { ErrorHandler } from '../../utils/errorHandler';

// Mock the dependencies
vi.mock('../api');
vi.mock('../../utils/errorHandler');

const mockApi = api as any;
const mockErrorHandler = ErrorHandler as any;

describe('HRService - Enhanced Staff Detail Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock ErrorHandler.withRetry to just call the function directly
    mockErrorHandler.withRetry.mockImplementation(fn => fn());
  });

  describe('getStaffLeaveBalances', () => {
    it('should fetch staff leave balances without year parameter', async () => {
      const mockLeaveBalances = [
        {
          id: 1,
          staff: 1,
          staff_name: 'John Doe',
          leave_type: 1,
          leave_type_name: 'Annual Leave',
          year: 2026,
          entitled_days: '20.00',
          used_days: '5.00',
          pending_days: '2.00',
          carried_over_days: '0.00',
          available_days: '13.00',
          owner: 1,
          branch: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-02-10T10:00:00Z',
        },
      ];

      mockApi.get.mockResolvedValue(mockLeaveBalances);

      const result = await hrService.getStaffLeaveBalances(1);

      expect(mockApi.get).toHaveBeenCalledWith('/hr/staff/1/leave_balances/', { params: {} });
      expect(result).toEqual(mockLeaveBalances);
      expect(mockErrorHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'fetch-staff-leave-balances'
      );
    });

    it('should fetch staff leave balances with year parameter', async () => {
      const mockLeaveBalances = [];
      mockApi.get.mockResolvedValue(mockLeaveBalances);

      await hrService.getStaffLeaveBalances(1, 2025);

      expect(mockApi.get).toHaveBeenCalledWith('/hr/staff/1/leave_balances/', {
        params: { year: 2025 },
      });
    });
  });

  describe('getStaffAttendanceSummary', () => {
    it('should fetch staff attendance summary with year only', async () => {
      const mockAttendanceSummary = {
        total_days: 31,
        present: 20,
        absent: 2,
        late: 3,
        on_leave: 5,
        total_hours_worked: 160.5,
        total_overtime_hours: 5.0,
      };

      mockApi.get.mockResolvedValue(mockAttendanceSummary);

      const result = await hrService.getStaffAttendanceSummary(1, 2026);

      expect(mockApi.get).toHaveBeenCalledWith('/hr/staff/1/attendance_summary/', {
        params: { year: 2026 },
      });
      expect(result).toEqual(mockAttendanceSummary);
      expect(mockErrorHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'fetch-staff-attendance-summary'
      );
    });

    it('should fetch staff attendance summary with year and month', async () => {
      const mockAttendanceSummary = {
        total_days: 28,
        present: 20,
        absent: 1,
        late: 2,
        on_leave: 4,
        total_hours_worked: 160.0,
        total_overtime_hours: 3.0,
      };

      mockApi.get.mockResolvedValue(mockAttendanceSummary);

      const result = await hrService.getStaffAttendanceSummary(1, 2026, 2);

      expect(mockApi.get).toHaveBeenCalledWith('/hr/staff/1/attendance_summary/', {
        params: { year: 2026, month: 2 },
      });
      expect(result).toEqual(mockAttendanceSummary);
    });
  });

  describe('getStaffSalaryComponents', () => {
    it('should fetch staff salary components', async () => {
      const mockSalaryComponents = [
        {
          id: 1,
          staff: 1,
          staff_name: 'John Doe',
          component: 1,
          component_name: 'Basic Salary',
          amount: '50000.00',
          owner: 1,
          branch: 1,
          created_at: '2026-01-15T10:00:00Z',
          updated_at: '2026-01-15T10:00:00Z',
        },
        {
          id: 2,
          staff: 1,
          staff_name: 'John Doe',
          component: 2,
          component_name: 'Housing Allowance',
          amount: '15000.00',
          owner: 1,
          branch: 1,
          created_at: '2026-01-15T10:00:00Z',
          updated_at: '2026-01-15T10:00:00Z',
        },
      ];

      mockApi.get.mockResolvedValue(mockSalaryComponents);

      const result = await hrService.getStaffSalaryComponents(1);

      expect(mockApi.get).toHaveBeenCalledWith('/hr/staff/1/salary-components/');
      expect(result).toEqual(mockSalaryComponents);
      expect(mockErrorHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        'fetch-staff-salary-components'
      );
    });
  });
});
