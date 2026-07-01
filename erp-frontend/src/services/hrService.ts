// HR Service - Based on task7.md and MISSING_HR_DETAIL_ENDPOINTS.md
import { api, triggerDownload } from './api';
import { ErrorHandler } from '../utils/errorHandler';
import { sumDecimals, toDecimal, subDecimals } from '../utils/decimal';
import {
  Staff,
  CreateStaffData,
  UpdateStaffData,
  StaffFilters,
  SalaryComponent,
  CreateSalaryComponentData,
  UpdateSalaryComponentData,
  SalaryComponentFilters,
  StaffPayInfo,
  CreateStaffPayInfoData,
  UpdateStaffPayInfoData,
  StaffPayInfoFilters,
  LeaveType,
  CreateLeaveTypeData,
  UpdateLeaveTypeData,
  LeaveBalance,
  LeaveRequest,
  CreateLeaveRequestData,
  UpdateLeaveRequestData,
  LeaveRequestFilters,
  Attendance,
  CreateAttendanceData,
  UpdateAttendanceData,
  AttendanceFilters,
  AttendanceSummary,
  Payroll,
  CreatePayrollData,
  UpdatePayrollData,
  PayrollFilters,
  PayrollWithPayslips,
  HRConfig,
  UpdateHRConfigData,
  WorkflowTemplate,
  AvailableWorkflowsResponse,
  BonusDeductionRequest,
  CreateBonusDeductionRequestData,
  BonusDeductionRequestFilters,
  BonusDeductionApprovalResponse,
  BonusDeductionPendingCountResponse,
  StaffIOU,
  CreateStaffIOUData,
  StaffIOUFilters,
  StaffIOUActionResponse,
  PensionRemittance,
  CreatePensionRemittanceData,
  RemitPensionData,
  PayrollSchedule,
  CreatePayrollScheduleData,
  Payslip,
  EmployeeDocument,
  EmployeeDocumentFilters,
  DocumentCategoryOption,
  StatutoryFiling,
  CreateStatutoryFilingData,
} from '../types/hr';
import { PaginatedResponse } from '../types/inventory';

class HRService {
  // ============================================================================
  // STAFF MANAGEMENT
  // ============================================================================

  async getStaff(params?: StaffFilters): Promise<PaginatedResponse<Staff>> {
    return ErrorHandler.withRetry(() => api.get('/hr/staff/', { params }), 'fetch-staff');
  }

  async getStaffMember(id: number | string): Promise<Staff> {
    return ErrorHandler.withRetry(() => api.get(`/hr/staff/${id}/`), 'fetch-staff-member');
  }

  async createStaff(data: CreateStaffData): Promise<Staff> {
    // Handle file upload for photo
    const formData = new FormData();

    // Add all fields to FormData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'photo' && value instanceof File) {
          formData.append(key, value);
        } else {
          formData.append(key, String(value));
        }
      }
    });

    return ErrorHandler.withRetry(() => api.postFormData('/hr/staff/', formData), 'create-staff');
  }

  async updateStaff(id: number | string, data: UpdateStaffData): Promise<Staff> {
    // Handle file upload for photo
    const formData = new FormData();

    // Add all fields to FormData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'photo' && value instanceof File) {
          formData.append(key, value);
        } else {
          formData.append(key, String(value));
        }
      }
    });

    return ErrorHandler.withRetry(
      () => api.patchFormData(`/hr/staff/${id}/`, formData),
      'update-staff'
    );
  }

  async deleteStaff(id: number | string): Promise<void> {
    return ErrorHandler.withRetry(() => api.delete(`/hr/staff/${id}/`), 'delete-staff');
  }

  // ============================================================================
  // ENHANCED STAFF DETAIL ENDPOINTS
  // ============================================================================

  async getStaffLeaveBalances(staffId: number | string, year?: number): Promise<LeaveBalance[]> {
    const params = year ? { year } : {};
    return ErrorHandler.withRetry(
      () => api.get(`/hr/staff/${staffId}/leave_balances/`, { params }),
      'fetch-staff-leave-balances'
    );
  }

  async getStaffAttendanceSummary(
    staffId: number | string,
    year: number,
    month?: number
  ): Promise<AttendanceSummary> {
    const params: { year: number; month?: number } = { year };
    if (month) {
      params.month = month;
    }
    return ErrorHandler.withRetry(
      () => api.get(`/hr/staff/${staffId}/attendance_summary/`, { params }),
      'fetch-staff-attendance-summary'
    );
  }

  async getStaffSalaryComponents(staffId: number | string): Promise<StaffPayInfo[]> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/staff/${staffId}/salary-components/`),
      'fetch-staff-salary-components'
    );
  }

  async downloadPayrollExcel(period?: string): Promise<void> {
    const params: Record<string, string> = {};
    if (period) params.period = period;
    const blob = await api.getBlob('/hr/staff/export-payroll/', { params });
    const periodSlug = (
      period || new Date().toLocaleString('en-NG', { month: 'long', year: 'numeric' })
    ).replace(/\s+/g, '_');
    triggerDownload(blob, `payroll_${periodSlug}.xlsx`);
  }

  // ============================================================================
  // LEAVE TYPES MANAGEMENT
  // ============================================================================

  async getLeaveTypes(params?: {
    search?: string;
    page?: number;
    ordering?: string;
  }): Promise<PaginatedResponse<LeaveType>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/leave-types/', { params }),
      'fetch-leave-types'
    );
  }

  async getLeaveType(id: number): Promise<LeaveType> {
    return ErrorHandler.withRetry(() => api.get(`/hr/leave-types/${id}/`), 'fetch-leave-type');
  }

  async createLeaveType(data: CreateLeaveTypeData): Promise<LeaveType> {
    return ErrorHandler.withRetry(() => api.post('/hr/leave-types/', data), 'create-leave-type');
  }

  async updateLeaveType(id: number, data: UpdateLeaveTypeData): Promise<LeaveType> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/leave-types/${id}/`, data),
      'update-leave-type'
    );
  }

  async deleteLeaveType(id: number): Promise<void> {
    return ErrorHandler.withRetry(() => api.delete(`/hr/leave-types/${id}/`), 'delete-leave-type');
  }

  // ============================================================================
  // LEAVE REQUESTS MANAGEMENT
  // ============================================================================

  async getLeaveRequests(params?: LeaveRequestFilters): Promise<PaginatedResponse<LeaveRequest>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/leave-requests/', { params }),
      'fetch-leave-requests'
    );
  }

  async getLeaveRequest(id: number): Promise<LeaveRequest> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/leave-requests/${id}/`),
      'fetch-leave-request'
    );
  }

  async createLeaveRequest(data: CreateLeaveRequestData): Promise<LeaveRequest> {
    // Use regular JSON data - medical certificate is a string (Cloudinary URL)
    const jsonData = {
      staff: data.staff,
      leave_type: data.leave_type,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: data.reason,
      relief_officer: data.relief_officer,
      medical_certificate: data.medical_certificate || null,
    };

    return ErrorHandler.withRetry(
      () => api.post('/hr/leave-requests/', jsonData),
      'create-leave-request'
    );
  }

  async updateLeaveRequest(id: number, data: UpdateLeaveRequestData): Promise<LeaveRequest> {
    // Use regular JSON data - medical certificate is a string (Cloudinary URL)
    const jsonData = {
      staff: data.staff,
      leave_type: data.leave_type,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: data.reason,
      relief_officer: data.relief_officer,
      medical_certificate: data.medical_certificate || null,
    };

    return ErrorHandler.withRetry(
      () => api.patch(`/hr/leave-requests/${id}/`, jsonData),
      'update-leave-request'
    );
  }

  async deleteLeaveRequest(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/hr/leave-requests/${id}/`),
      'delete-leave-request'
    );
  }

  // Leave Request Workflow Actions
  async submitLeaveRequest(id: number, data?: UpdateLeaveRequestData): Promise<LeaveRequest> {
    // Only send the fields that the backend expects for submission
    const submitData = data
      ? {
          staff: data.staff,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          medical_certificate: data.medical_certificate || null,
          relief_officer: data.relief_officer,
          rejection_reason: data.rejection_reason,
        }
      : {};

    return ErrorHandler.withRetry(
      () => api.post(`/hr/leave-requests/${id}/submit/`, submitData),
      'submit-leave-request'
    );
  }

  async approveLeaveRequest(id: number, data?: UpdateLeaveRequestData): Promise<LeaveRequest> {
    // Only send the fields that the backend expects for approval
    const approveData = data
      ? {
          staff: data.staff,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          medical_certificate: data.medical_certificate || null,
          relief_officer: data.relief_officer,
          rejection_reason: data.rejection_reason,
        }
      : {};

    return ErrorHandler.withRetry(
      () => api.post(`/hr/leave-requests/${id}/approve/`, approveData),
      'approve-leave-request'
    );
  }

  async rejectLeaveRequest(id: number, data: { rejection_reason: string }): Promise<LeaveRequest> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/leave-requests/${id}/reject/`, data),
      'reject-leave-request'
    );
  }

  async cancelLeaveRequest(id: number, data?: UpdateLeaveRequestData): Promise<LeaveRequest> {
    // Only send the fields that the backend expects for cancellation
    const cancelData = data
      ? {
          staff: data.staff,
          leave_type: data.leave_type,
          start_date: data.start_date,
          end_date: data.end_date,
          reason: data.reason,
          medical_certificate: data.medical_certificate || null,
          relief_officer: data.relief_officer,
          rejection_reason: data.rejection_reason,
        }
      : {};

    return ErrorHandler.withRetry(
      () => api.post(`/hr/leave-requests/${id}/cancel/`, cancelData),
      'cancel-leave-request'
    );
  }

  /**
   * Get leave requests for calendar view (unpaginated, date-range filtered)
   */
  async getLeaveCalendar(
    startDate: string,
    endDate: string,
    filters?: {
      department?: number;
      leave_type?: number;
      staff?: number;
    }
  ): Promise<LeaveRequest[]> {
    const params = {
      start_date: startDate,
      end_date: endDate,
      ...filters,
    };
    return ErrorHandler.withRetry(
      () => api.get('/hr/leave-requests/calendar/', { params }),
      'fetch-leave-calendar'
    );
  }

  // ============================================================================
  // ATTENDANCE MANAGEMENT
  // ============================================================================

  async getAttendance(params?: AttendanceFilters): Promise<PaginatedResponse<Attendance>> {
    return ErrorHandler.withRetry(() => api.get('/hr/attendance/', { params }), 'fetch-attendance');
  }

  async getAttendanceRecord(id: number): Promise<Attendance> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/attendance/${id}/`),
      'fetch-attendance-record'
    );
  }

  async createAttendance(data: CreateAttendanceData): Promise<Attendance> {
    return ErrorHandler.withRetry(() => api.post('/hr/attendance/', data), 'create-attendance');
  }

  async updateAttendance(id: number, data: UpdateAttendanceData): Promise<Attendance> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/attendance/${id}/`, data),
      'update-attendance'
    );
  }

  async deleteAttendance(id: number): Promise<void> {
    return ErrorHandler.withRetry(() => api.delete(`/hr/attendance/${id}/`), 'delete-attendance');
  }

  // ============================================================================
  // PAYROLL MANAGEMENT
  // ============================================================================

  async getPayrolls(params?: PayrollFilters): Promise<PaginatedResponse<Payroll>> {
    return ErrorHandler.withRetry(() => api.get('/hr/payroll/', { params }), 'fetch-payrolls');
  }

  async getPayroll(id: number): Promise<Payroll> {
    return ErrorHandler.withRetry(() => api.get(`/hr/payroll/${id}/`), 'fetch-payroll');
  }

  async createPayroll(data: CreatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(() => api.post('/hr/payroll/', data), 'create-payroll');
  }

  async updatePayroll(id: number, data: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(() => api.patch(`/hr/payroll/${id}/`, data), 'update-payroll');
  }

  async deletePayroll(id: number): Promise<void> {
    return ErrorHandler.withRetry(() => api.delete(`/hr/payroll/${id}/`), 'delete-payroll');
  }

  // Payroll Workflow Actions
  async calculatePayroll(id: number, data?: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/calculate/`, data || {}),
      'calculate-payroll'
    );
  }

  async recalculatePayroll(id: number, data?: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/recalculate/`, data || {}),
      'recalculate-payroll'
    );
  }

  async approvePayroll(id: number, data?: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/approve/`, data || {}),
      'approve-payroll'
    );
  }

  async processPayroll(id: number, data?: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/process/`, data || {}),
      'process-payroll'
    );
  }

  async markPayrollPaid(id: number, data?: UpdatePayrollData): Promise<Payroll> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/mark_paid/`, data || {}),
      'mark-payroll-paid'
    );
  }

  async generatePayslips(id: number): Promise<{ generated: number; message: string }> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/payroll/${id}/generate_payslips/`, {}),
      'generate-payslips'
    );
  }

  async downloadBankFile(id: number, payrollNumber?: string): Promise<void> {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const baseUrl =
      (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE_URL || '/api';
    const res = await fetch(`${baseUrl}/hr/payroll/${id}/download_bank_file/`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error('Failed to download bank file');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = payrollNumber ? `bank_transfer_${payrollNumber}.csv` : 'bank_transfer.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  // ============================================================================
  // PAYSLIPS MANAGEMENT
  // ============================================================================
  async getPayslips(params?: {
    search?: string;
    staff?: number;
    payroll?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Payslip>> {
    return ErrorHandler.withRetry(() => api.get('/hr/payslips/', { params }), 'fetch-payslips');
  }

  async getPayrollWithPayslips(id: number): Promise<PayrollWithPayslips> {
    return ErrorHandler.withRetry(() => api.get(`/hr/payroll/${id}/`), 'fetch-payroll-payslips');
  }

  async getPayslip(id: number): Promise<Payslip> {
    return ErrorHandler.withRetry(() => api.get(`/hr/payslips/${id}/`), 'fetch-payslip');
  }

  async downloadPayslipPdf(id: number): Promise<Blob> {
    return ErrorHandler.withRetry(
      () => api.getBlob(`/hr/payslips/${id}/download/`),
      'download-payslip'
    );
  }

  async emailPayslip(id: number): Promise<{ message: string }> {
    return ErrorHandler.withRetry(() => api.post(`/hr/payslips/${id}/email/`, {}), 'email-payslip');
  }

  // ============================================================================
  // PAYROLL SCHEDULE MANAGEMENT (HR-02)
  // ============================================================================

  async getPayrollSchedules(params?: {
    search?: string;
    page?: number;
  }): Promise<PaginatedResponse<PayrollSchedule>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/payroll-schedules/', { params }),
      'fetch-payroll-schedules'
    );
  }

  async getPayrollSchedule(id: number): Promise<PayrollSchedule> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/payroll-schedules/${id}/`),
      'fetch-payroll-schedule'
    );
  }

  async createPayrollSchedule(data: CreatePayrollScheduleData): Promise<PayrollSchedule> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/payroll-schedules/', data),
      'create-payroll-schedule'
    );
  }

  async updatePayrollSchedule(
    id: number,
    data: Partial<CreatePayrollScheduleData>
  ): Promise<PayrollSchedule> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/payroll-schedules/${id}/`, data),
      'update-payroll-schedule'
    );
  }

  async deletePayrollSchedule(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/hr/payroll-schedules/${id}/`),
      'delete-payroll-schedule'
    );
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  // Get staff for dropdowns — fetches ALL pages so the dropdown is never truncated
  async getStaffForDropdown(): Promise<Array<{ id: number; name: string; department?: string }>> {
    const allStaff: Staff[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getStaff({ page });
      allStaff.push(...response.results);
      hasMore = !!response.next;
      page += 1;
    }
    return allStaff.map(staff => ({
      id: staff.id,
      name: staff.full_name,
      department: staff.department,
    }));
  }

  // Get leave types for dropdowns
  async getLeaveTypesForDropdown(): Promise<Array<{ id: number; name: string; code: string }>> {
    const allLeaveTypes: LeaveType[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getLeaveTypes({ page });
      allLeaveTypes.push(...response.results);
      hasMore = !!response.next;
      page += 1;
    }
    return allLeaveTypes.map(leaveType => ({
      id: leaveType.id,
      name: leaveType.name,
      code: leaveType.code,
    }));
  }

  // Calculate leave days between dates
  calculateLeaveDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
    return daysDiff;
  }

  // Calculate hours worked
  calculateHoursWorked(clockIn: string, clockOut: string): number {
    if (!clockIn || !clockOut) return 0;

    const [inHours, inMinutes] = clockIn.split(':').map(Number);
    const [outHours, outMinutes] = clockOut.split(':').map(Number);

    const inTime = inHours * 60 + inMinutes;
    const outTime = outHours * 60 + outMinutes;

    const diffMinutes = outTime - inTime;
    return Math.max(0, diffMinutes / 60);
  }

  // Get personnel changes report for payroll period
  async getPersonnelChangesReport(periodStart: string, periodEnd: string) {
    return ErrorHandler.withRetry(
      () =>
        api.get('/hr/payroll/personnel_changes_report/', {
          params: {
            period_start: periodStart,
            period_end: periodEnd,
          },
        }),
      'fetch-personnel-changes-report'
    );
  }

  // ============================================================================
  // HR CONFIGURATION MANAGEMENT
  // ============================================================================

  async getHRConfig(): Promise<HRConfig> {
    return ErrorHandler.withRetry(() => api.get('/hr/config/for_branch/'), 'fetch-hr-config');
  }

  async updateHRConfig(id: number, data: UpdateHRConfigData): Promise<HRConfig> {
    return ErrorHandler.withRetry(() => api.patch(`/hr/config/${id}/`, data), 'update-hr-config');
  }

  async getAvailableWorkflows(): Promise<WorkflowTemplate[]> {
    const response = (await ErrorHandler.withRetry(
      () => api.get('/hr/config/available_workflows/'),
      'fetch-available-workflows'
    )) as AvailableWorkflowsResponse;
    return response.workflows;
  }

  // ============================================================================
  // SALARY COMPONENTS MANAGEMENT
  // ============================================================================

  /**
   * Get list of salary components with filtering options
   * @param params - Filter parameters for salary components
   * @returns Paginated list of salary components
   */
  async getSalaryComponents(
    params?: SalaryComponentFilters
  ): Promise<PaginatedResponse<SalaryComponent>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/salary-components/', { params }),
      'fetch-salary-components'
    );
  }

  /**
   * Get details of a specific salary component
   * @param id - Component ID
   * @returns Salary component details
   */
  async getSalaryComponent(id: number): Promise<SalaryComponent> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/salary-components/${id}/`),
      'fetch-salary-component'
    );
  }

  /**
   * Create a new salary component
   * @param data - Component creation data
   * @returns Created salary component
   */
  async createSalaryComponent(data: CreateSalaryComponentData): Promise<SalaryComponent> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/salary-components/', data),
      'create-salary-component'
    );
  }

  /**
   * Update an existing salary component
   * @param id - Component ID to update
   * @param data - Component update data
   * @returns Updated salary component
   */
  async updateSalaryComponent(
    id: number,
    data: UpdateSalaryComponentData
  ): Promise<SalaryComponent> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/salary-components/${id}/`, data),
      'update-salary-component'
    );
  }

  /**
   * Delete a salary component
   * @param id - Component ID to delete
   */
  async deleteSalaryComponent(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/hr/salary-components/${id}/`),
      'delete-salary-component'
    );
  }

  /**
   * Get salary components for dropdowns, separated by type
   * @returns Object with earnings and deductions arrays
   */
  async getSalaryComponentsForDropdown(): Promise<{
    earnings: Array<{ id: number; name: string; default_amount: string }>;
    deductions: Array<{ id: number; name: string; default_amount: string }>;
  }> {
    const allComponents: SalaryComponent[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getSalaryComponents({ page });
      allComponents.push(...response.results);
      hasMore = !!response.next;
      page += 1;
    }

    const earnings = allComponents
      .filter(component => component.component_type === 'EARNING')
      .map(component => ({
        id: component.id,
        name: component.name,
        default_amount: component.default_amount,
      }));

    const deductions = allComponents
      .filter(component => component.component_type === 'DEDUCTION')
      .map(component => ({
        id: component.id,
        name: component.name,
        default_amount: component.default_amount,
      }));

    return { earnings, deductions };
  }

  // ============================================================================
  // STAFF PAY INFO MANAGEMENT
  // ============================================================================

  /**
   * Get list of staff pay info (component assignments) with filtering options
   * @param params - Filter parameters for staff pay info
   * @returns Paginated list of staff pay info
   */
  async getStaffPayInfo(params?: StaffPayInfoFilters): Promise<PaginatedResponse<StaffPayInfo>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/staff-pay-info/', { params }),
      'fetch-staff-pay-info'
    );
  }

  /**
   * Get details of a specific staff pay info record
   * @param id - Pay info ID
   * @returns Staff pay info details
   */
  async getStaffPayInfoRecord(id: number): Promise<StaffPayInfo> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/staff-pay-info/${id}/`),
      'fetch-staff-pay-info-record'
    );
  }

  /**
   * Assign a salary component to a staff member
   * @param data - Assignment data
   * @returns Created staff pay info record
   */
  async assignComponentToStaff(data: CreateStaffPayInfoData): Promise<StaffPayInfo> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/staff-pay-info/', data),
      'assign-component-to-staff'
    );
  }

  /**
   * Update staff pay info (change component amount)
   * @param id - Pay info ID to update
   * @param data - Update data
   * @returns Updated staff pay info
   */
  async updateStaffPayInfo(id: number, data: UpdateStaffPayInfoData): Promise<StaffPayInfo> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/staff-pay-info/${id}/`, data),
      'update-staff-pay-info'
    );
  }

  /**
   * Remove a component assignment from staff
   * @param id - Pay info ID to remove
   */
  async removeComponentFromStaff(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/hr/staff-pay-info/${id}/`),
      'remove-component-from-staff'
    );
  }

  /**
   * Get all salary components assigned to a specific staff member
   * @param staffId - Staff member ID
   * @returns List of assigned components
   */
  async getStaffAssignedComponents(staffId: number): Promise<StaffPayInfo[]> {
    const response = await this.getStaffPayInfo({ staff: staffId });
    return response.results;
  }

  /**
   * Calculate staff salary totals
   * @param staffId - Staff member ID
   * @returns Salary calculation summary
   */
  async calculateStaffSalaryTotals(staffId: number): Promise<{
    totalEarnings: number;
    totalDeductions: number;
    netSalary: number;
    components: StaffPayInfo[];
  }> {
    const components = await this.getStaffAssignedComponents(staffId);

    const earningAmounts = components
      .filter(c => c.component_type === 'EARNING')
      .map(c => c.amount);
    const deductionAmounts = components
      .filter(c => c.component_type === 'DEDUCTION')
      .map(c => c.amount);

    const totalEarningsDecimal = sumDecimals(earningAmounts);
    const totalDeductionsDecimal = sumDecimals(deductionAmounts);
    const netSalaryDecimal = subDecimals(totalEarningsDecimal, totalDeductionsDecimal);

    const totalEarnings = totalEarningsDecimal.toNumber();
    const totalDeductions = totalDeductionsDecimal.toNumber();
    const netSalary = netSalaryDecimal.toNumber();

    return {
      totalEarnings,
      totalDeductions,
      netSalary,
      components,
    };
  }

  // ============================================================================
  // BONUS/DEDUCTION REQUESTS
  // ============================================================================

  /**
   * Get list of bonus/deduction requests with filtering options
   * @param params - Filter parameters for bonus/deduction requests
   * @returns Paginated list of bonus/deduction requests
   */
  async getBonusDeductionRequests(
    params?: BonusDeductionRequestFilters
  ): Promise<PaginatedResponse<BonusDeductionRequest>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/bonus-deduction-requests/', { params }),
      'fetch-bonus-deduction-requests'
    );
  }

  /**
   * Get details of a specific bonus/deduction request
   * @param id - Request ID
   * @returns Bonus/deduction request details
   */
  async getBonusDeductionRequest(id: number): Promise<BonusDeductionRequest> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/bonus-deduction-requests/${id}/`),
      'fetch-bonus-deduction-request'
    );
  }

  /**
   * Create a new bonus/deduction request
   * @param data - Request creation data
   * @returns Created bonus/deduction request
   */
  async createBonusDeductionRequest(
    data: CreateBonusDeductionRequestData
  ): Promise<BonusDeductionRequest> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/bonus-deduction-requests/', data),
      'create-bonus-deduction-request'
    );
  }

  /**
   * Approve a bonus/deduction request
   * @param id - Request ID to approve
   * @returns Approval response with updated request data
   */
  async approveBonusDeductionRequest(id: number): Promise<BonusDeductionApprovalResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/bonus-deduction-requests/${id}/approve/`, {}),
      'approve-bonus-deduction-request'
    );
  }

  /**
   * Reject a bonus/deduction request with reason
   * @param id - Request ID to reject
   * @param rejectionReason - Reason for rejection
   * @returns Rejection response with updated request data
   */
  async rejectBonusDeductionRequest(
    id: number,
    rejectionReason: string
  ): Promise<BonusDeductionApprovalResponse> {
    return ErrorHandler.withRetry(
      () =>
        api.post(`/hr/bonus-deduction-requests/${id}/reject/`, {
          action: 'reject',
          rejection_reason: rejectionReason,
        }),
      'reject-bonus-deduction-request'
    );
  }

  /**
   * Get bonus/deduction requests created by current user
   * @param params - Pagination parameters
   * @returns Paginated list of user's requests
   */
  async getMyBonusDeductionRequests(params?: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<BonusDeductionRequest>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/bonus-deduction-requests/my_requests/', { params }),
      'fetch-my-bonus-deduction-requests'
    );
  }

  /**
   * Get count of pending bonus/deduction requests (for notification badges)
   * @returns Count of pending requests
   */
  async getPendingBonusDeductionCount(): Promise<BonusDeductionPendingCountResponse> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/bonus-deduction-requests/pending_count/'),
      'fetch-pending-bonus-deduction-count'
    );
  }

  /**
   * Get pending bonus/deduction requests (shortcut for pending_only=true filter)
   * @param params - Additional filter parameters
   * @returns Paginated list of pending requests
   */
  async getPendingBonusDeductionRequests(
    params?: Omit<BonusDeductionRequestFilters, 'pending_only'>
  ): Promise<PaginatedResponse<BonusDeductionRequest>> {
    return this.getBonusDeductionRequests({
      ...params,
      pending_only: true,
    });
  }

  /**
   * Get bonus/deduction requests for a specific staff member
   * @param staffId - Staff member ID
   * @param params - Additional filter parameters
   * @returns Paginated list of staff's requests
   */
  async getStaffBonusDeductionRequests(
    staffId: number,
    params?: Omit<BonusDeductionRequestFilters, 'staff'>
  ): Promise<PaginatedResponse<BonusDeductionRequest>> {
    return this.getBonusDeductionRequests({
      ...params,
      staff: staffId,
    });
  }

  /**
   * Get bonus/deduction requests for a specific month
   * @param month - Month in YYYY-MM-01 format
   * @param params - Additional filter parameters
   * @returns Paginated list of requests for the month
   */
  async getBonusDeductionRequestsForMonth(
    month: string,
    params?: Omit<BonusDeductionRequestFilters, 'for_month'>
  ): Promise<PaginatedResponse<BonusDeductionRequest>> {
    return this.getBonusDeductionRequests({
      ...params,
      for_month: month,
    });
  }

  // ============================================================================
  // BONUS/DEDUCTION REQUEST UTILITY METHODS
  // ============================================================================

  /**
   * Format month for bonus/deduction requests (ensures YYYY-MM-01 format)
   * @param year - Year
   * @param month - Month (1-12)
   * @returns Formatted month string
   */
  formatBonusDeductionMonth(year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    return `${year}-${monthStr}-01`;
  }

  /**
   * Validate bonus/deduction request data before submission
   * @param data - Request data to validate
   * @returns Validation result with errors if any
   */
  validateBonusDeductionRequest(data: CreateBonusDeductionRequestData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.staff || data.staff <= 0) {
      errors.push('Staff member is required');
    }

    if (!data.component || data.component <= 0) {
      errors.push('Salary component is required');
    }

    const amount = typeof data.amount === 'string' ? parseFloat(data.amount) : data.amount;
    if (!amount || amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!data.reason || data.reason.trim().length === 0) {
      errors.push('Reason is required');
    }

    if (!data.for_month || !data.for_month.match(/^\d{4}-\d{2}-01$/)) {
      errors.push('Month must be in YYYY-MM-01 format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get bonus/deduction request statistics for dashboard
   * @returns Request statistics
   */
  async getBonusDeductionRequestStats(): Promise<{
    totalRequests: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    thisMonthRequests: number;
  }> {
    try {
      // Get pending count
      const pendingResponse = await this.getPendingBonusDeductionCount();
      const pendingCount = pendingResponse.count;

      // Get all requests for statistics
      const allRequestsResponse = await this.getBonusDeductionRequests({ page_size: 1000 });
      const allRequests = allRequestsResponse.results;

      const approvedCount = allRequests.filter(r => r.status === 'APPROVED').length;
      const rejectedCount = allRequests.filter(r => r.status === 'REJECTED').length;

      // Get this month's requests
      const currentDate = new Date();
      const thisMonth = this.formatBonusDeductionMonth(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1
      );
      const thisMonthResponse = await this.getBonusDeductionRequestsForMonth(thisMonth, {
        page_size: 1000,
      });
      const thisMonthRequests = thisMonthResponse.count || thisMonthResponse.results.length;

      return {
        totalRequests: allRequests.length,
        pendingCount,
        approvedCount,
        rejectedCount,
        thisMonthRequests,
      };
    } catch (error) {
      console.error('Error fetching bonus/deduction request stats:', error);
      return {
        totalRequests: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        thisMonthRequests: 0,
      };
    }
  }

  /**
   * Bulk approve multiple bonus/deduction requests
   * @param requestIds - Array of request IDs to approve
   * @returns Array of approval results
   */
  async bulkApproveBonusDeductionRequests(requestIds: number[]): Promise<{
    successful: BonusDeductionApprovalResponse[];
    failed: Array<{ id: number; error: string }>;
  }> {
    const successful: BonusDeductionApprovalResponse[] = [];
    const failed: Array<{ id: number; error: string }> = [];

    for (const id of requestIds) {
      try {
        const result = await this.approveBonusDeductionRequest(id);
        successful.push(result);
      } catch (error: any) {
        failed.push({
          id,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Get available salary components for bonus/deduction requests
   * @param componentType - Filter by component type
   * @returns Available components for requests
   */
  async getAvailableComponentsForRequests(componentType?: 'EARNING' | 'DEDUCTION'): Promise<
    Array<{
      id: number;
      name: string;
      component_type: 'EARNING' | 'DEDUCTION';
      default_amount: string;
    }>
  > {
    const response = await this.getSalaryComponents({
      component_type: componentType,
      page_size: 1000,
    });

    return response.results.map(component => ({
      id: component.id,
      name: component.name,
      component_type: component.component_type,
      default_amount: component.default_amount,
    }));
  }

  // ============================================================================
  // PENSION REMITTANCE
  // ============================================================================

  async getPensionRemittances(params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<PaginatedResponse<PensionRemittance>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/pension-remittances/', { params }),
      'fetch-pension-remittances'
    );
  }

  async getPensionRemittance(id: number): Promise<PensionRemittance> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/pension-remittances/${id}/`),
      'fetch-pension-remittance'
    );
  }

  async createPensionRemittance(data: CreatePensionRemittanceData): Promise<PensionRemittance> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/pension-remittances/', data),
      'create-pension-remittance'
    );
  }

  async remitPension(id: number, data: RemitPensionData): Promise<PensionRemittance> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/pension-remittances/${id}/remit/`, data),
      'remit-pension'
    );
  }

  async cancelPensionRemittance(id: number): Promise<PensionRemittance> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/pension-remittances/${id}/cancel/`, {}),
      'cancel-pension-remittance'
    );
  }

  // ============================================================================
  // EMPLOYEE DOCUMENTS
  // ============================================================================

  async getEmployeeDocuments(
    params?: EmployeeDocumentFilters
  ): Promise<PaginatedResponse<EmployeeDocument>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/employee-documents/', { params }),
      'get-employee-documents'
    );
  }

  async getEmployeeDocument(id: number): Promise<EmployeeDocument> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/employee-documents/${id}/`),
      'get-employee-document'
    );
  }

  async uploadEmployeeDocument(data: FormData): Promise<EmployeeDocument> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/employee-documents/', data),
      'upload-employee-document'
    );
  }

  async updateEmployeeDocument(id: number, data: FormData): Promise<EmployeeDocument> {
    return ErrorHandler.withRetry(
      () => api.patch(`/hr/employee-documents/${id}/`, data),
      'update-employee-document'
    );
  }

  async deleteEmployeeDocument(id: number): Promise<void> {
    return ErrorHandler.withRetry(
      () => api.delete(`/hr/employee-documents/${id}/`),
      'delete-employee-document'
    );
  }

  async getExpiringSoonDocuments(): Promise<EmployeeDocument[]> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/employee-documents/expiring_soon/'),
      'get-expiring-documents'
    );
  }

  async getDocumentCategories(): Promise<DocumentCategoryOption[]> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/employee-documents/categories/'),
      'get-document-categories'
    );
  }

  // ============================================================================
  // EMPLOYEE SELF-SERVICE
  // ============================================================================

  /**
   * Get the staff profile linked to the currently authenticated user
   */
  async getMyProfile(): Promise<Staff> {
    return ErrorHandler.withRetry(() => api.get('/hr/staff/my-profile/'), 'fetch-my-profile');
  }

  /**
   * Get own payslips
   */
  async getMyPayslips(): Promise<Payslip[]> {
    return ErrorHandler.withRetry(() => api.get('/hr/payslips/my-payslips/'), 'fetch-my-payslips');
  }

  /**
   * Get own leave requests
   */
  async getMyLeaveRequests(): Promise<LeaveRequest[]> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/leave-requests/my-leave-requests/'),
      'fetch-my-leave-requests'
    );
  }

  /**
   * Get own leave balances
   */
  async getMyLeaveBalances(year?: number): Promise<LeaveBalance[]> {
    const params = year ? { year } : {};
    return ErrorHandler.withRetry(
      () => api.get('/hr/leave-balances/my-balances/', { params }),
      'fetch-my-leave-balances'
    );
  }

  /**
   * Get own attendance records
   */
  async getMyAttendance(): Promise<Attendance[]> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/attendance/my-attendance/'),
      'fetch-my-attendance'
    );
  }

  // ============================================================================
  // STAFF IOU MANAGEMENT
  // ============================================================================

  async getStaffIOUs(params?: StaffIOUFilters): Promise<PaginatedResponse<StaffIOU>> {
    return ErrorHandler.withRetry(() => api.get('/hr/staff-ious/', { params }), 'fetch-staff-ious');
  }

  async getStaffIOU(id: number): Promise<StaffIOU> {
    return ErrorHandler.withRetry(() => api.get(`/hr/staff-ious/${id}/`), 'fetch-staff-iou');
  }

  async createStaffIOU(data: CreateStaffIOUData): Promise<StaffIOU> {
    return ErrorHandler.withRetry(() => api.post('/hr/staff-ious/', data), 'create-staff-iou');
  }

  async cancelStaffIOU(id: number): Promise<StaffIOUActionResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/staff-ious/${id}/cancel/`, {}),
      'cancel-staff-iou'
    );
  }

  async approveStaffIOU(id: number): Promise<StaffIOUActionResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/staff-ious/${id}/approve/`, {}),
      'approve-staff-iou'
    );
  }

  async disburseStaffIOU(
    id: number,
    options: {
      type: 'payroll_only' | 'cash';
      credit_account_id?: number;
      description_override?: string;
    }
  ): Promise<StaffIOUActionResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/staff-ious/${id}/disburse/`, options),
      'disburse-staff-iou'
    );
  }

  async adjustStaffIOUBalance(
    id: number,
    data: { new_total_amount: number; reason: string }
  ): Promise<StaffIOUActionResponse> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/staff-ious/${id}/adjust_balance/`, data),
      'adjust-staff-iou-balance'
    );
  }

  async bulkDebitStaffIOU(payload: {
    credit_account_id: number;
    description?: string;
    date?: string;
    entries: Array<{
      staff: number;
      amount: number;
      monthly_installment: number;
      start_month: string;
      reason: string;
      notes?: string;
    }>;
  }): Promise<{
    message: string;
    journal_entry_id: number;
    total_amount: string;
    credit_account: string;
    ious: StaffIOU[];
  }> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/staff-ious/bulk-debit/', payload),
      'bulk-debit-staff-iou'
    );
  }

  // ===== STATUTORY FILINGS (NHF / NSITF — App 2 integration) =====

  async listStatutoryFilings(params?: {
    filing_type?: 'nhf' | 'nsitf';
    status?: 'draft' | 'submitted' | 'remitted' | 'rejected' | 'cancelled';
  }): Promise<PaginatedResponse<StatutoryFiling>> {
    return ErrorHandler.withRetry(
      () => api.get('/hr/statutory-filings/', { params }),
      'list-statutory-filings'
    );
  }

  async getStatutoryFiling(id: number): Promise<StatutoryFiling> {
    return ErrorHandler.withRetry(
      () => api.get(`/hr/statutory-filings/${id}/`),
      'get-statutory-filing'
    );
  }

  async createStatutoryFiling(data: CreateStatutoryFilingData): Promise<StatutoryFiling> {
    return ErrorHandler.withRetry(
      () => api.post('/hr/statutory-filings/', data),
      'create-statutory-filing'
    );
  }

  async markStatutoryFilingRemitted(
    id: number,
    payload: { agency_reference?: string; remittance_date?: string }
  ): Promise<StatutoryFiling> {
    return ErrorHandler.withRetry(
      () => api.post(`/hr/statutory-filings/${id}/mark_remitted/`, payload),
      'mark-statutory-remitted'
    );
  }
}

export const hrService = new HRService();
export default hrService;
