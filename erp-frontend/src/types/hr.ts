// HR Types - Based on task7.md API specifications
import { PaginatedResponse } from './inventory';

// ============================================================================
// STAFF MANAGEMENT TYPES
// ============================================================================

export interface Staff {
  id: number;
  user?: number | null; // Optional link to a login user
  full_name: string;
  first_name: string; // <= 100 characters
  last_name: string; // <= 100 characters
  staff_id: string; // Auto-generated branch-scoped ID (e.g. MML001)
  department?: string; // <= 100 characters
  position?: string; // <= 100 characters
  email?: string; // <email> <= 254 characters
  phone?: string; // <= 20 characters
  photo?: string; // <uri>
  pension_number?: string; // Pension fund membership number
  pension_provider?: string; // Pension fund / provider name (PFA)
  // Tax & banking fields
  paye_pin?: string; // PAYE / TIN for FIRS filing
  bank_name?: string; // Bank for salary disbursement
  bank_account_number?: string; // Account number for salary disbursement
  created_at: string; // <date-time>
  updated_at: string; // <date-time>
}

export interface CreateStaffData {
  user?: number | null;
  branch?: number | null;
  first_name: string; // [ 1 .. 100 ] characters
  last_name: string; // [ 1 .. 100 ] characters
  department?: string; // <= 100 characters
  position?: string; // <= 100 characters
  email?: string; // <email> <= 254 characters
  phone?: string; // <= 20 characters
  photo?: File; // <binary>
  pension_number?: string;
  pension_provider?: string;
  paye_pin?: string; // PAYE / TIN for FIRS filing
  bank_name?: string; // Bank name for salary disbursement
  bank_account_number?: string; // Account number for salary disbursement
}

export interface UpdateStaffData extends Partial<CreateStaffData> {}

// ============================================================================
// SALARY COMPONENTS
// ============================================================================

export interface SalaryComponent {
  id: number;
  name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  default_amount: string; // decimal
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSalaryComponentData {
  name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  default_amount: number | string;
}

export interface UpdateSalaryComponentData extends Partial<CreateSalaryComponentData> {}

export interface SalaryComponentFilters {
  search?: string;
  component_type?: 'EARNING' | 'DEDUCTION';
  page?: number;
  page_size?: number;
  ordering?: string;
}

// ============================================================================
// STAFF PAY INFO (SALARY COMPONENTS ASSIGNMENT)
// ============================================================================

export interface StaffPayInfo {
  id: number;
  staff: number;
  staff_name: string;
  component: number;
  component_name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  amount: string;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStaffPayInfoData {
  staff: number;
  component: number;
  amount: number | string;
}

export interface UpdateStaffPayInfoData extends Partial<CreateStaffPayInfoData> {}

export interface StaffPayInfoFilters {
  staff?: number | string;
  component?: number;
  component_type?: 'EARNING' | 'DEDUCTION';
  page?: number;
  page_size?: number;
  ordering?: string;
}

// ============================================================================
// LEAVE TYPES
// ============================================================================

export interface LeaveType {
  id: number;
  name: string; // <= 100 characters
  code: string;
  is_paid?: boolean;
  requires_approval?: boolean;
  requires_medical_certificate?: boolean; // Requires medical certificate (for sick leave)
  default_days_per_year?: number; // [ 0 .. 2147483647 ] Default number of days per year (0 = unlimited)
  allow_carryover?: boolean; // Allow unused days to carry over to next year
  max_carryover_days?: number; // [ 0 .. 2147483647 ] Maximum days that can be carried over
  description?: string;
  created_at: string; // <date-time>
  updated_at: string; // <date-time>
}

export interface CreateLeaveTypeData {
  name: string; // [ 1 .. 100 ] characters
  is_paid?: boolean;
  requires_approval?: boolean;
  requires_medical_certificate?: boolean;
  default_days_per_year?: number; // [ 0 .. 2147483647 ]
  allow_carryover?: boolean;
  max_carryover_days?: number; // [ 0 .. 2147483647 ]
  description?: string;
}

export interface UpdateLeaveTypeData extends Partial<CreateLeaveTypeData> {}

// ============================================================================
// LEAVE BALANCES
// ============================================================================

export interface LeaveBalance {
  id: number;
  staff: number;
  staff_name: string;
  leave_type: number;
  leave_type_name: string;
  year: number;
  entitled_days: string;
  used_days: string;
  pending_days: string;
  carried_over_days: string;
  available_days: string;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// LEAVE REQUESTS
// ============================================================================

export enum LeaveRequestStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  TAKEN = 'taken',
}

export interface LeaveRequest {
  id: number;
  reference_number: string;
  staff: number;
  staff_name: string;
  leave_type: number;
  leave_type_name: string;
  start_date: string; // <date>
  end_date: string; // <date>
  num_days: string; // <decimal> ^-?\d{0,4}(?:\.\d{0,2})?$ Number of leave days (can be fractional for half-days)
  reason: string;
  medical_certificate?: string | null; // <uri> Medical certificate (for sick leave)
  relief_officer?: number | null; // Staff member covering duties
  relief_officer_name: string;
  status: LeaveRequestStatus;
  rejection_reason?: string;
  workflow_run?: number | null;
  workflow_status?: string | null;
  approval_chain: any; // Track all approvers and decisions
  created_at: string; // <date-time>
  updated_at: string; // <date-time>
}

export interface CreateLeaveRequestData {
  staff: number;
  leave_type: number;
  start_date: string; // <date>
  end_date: string; // <date>
  reason: string; // non-empty
  medical_certificate?: string | null; // <string> Medical certificate URL (Cloudinary)
  relief_officer?: number | null; // Staff member covering duties
  rejection_reason?: string;
}

export interface UpdateLeaveRequestData extends Partial<CreateLeaveRequestData> {}

// ============================================================================
// ATTENDANCE
// ============================================================================

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  HALF_DAY = 'half_day',
  ON_LEAVE = 'on_leave',
  PUBLIC_HOLIDAY = 'public_holiday',
  WEEKEND = 'weekend',
}

export interface Attendance {
  id: number;
  staff: number;
  staff_name: string;
  date: string; // <date>
  clock_in?: string | null; // <time>
  clock_out?: string | null; // <time>
  status?: AttendanceStatus;
  hours_worked: string; // <decimal> ^-?\d{0,3}(?:\.\d{0,2})?$
  overtime_hours: string; // <decimal> ^-?\d{0,3}(?:\.\d{0,2})?$
  leave_request?: number | null;
  notes?: string;
  created_at: string; // <date-time>
  updated_at: string; // <date-time>
}

export interface CreateAttendanceData {
  staff: number;
  date: string; // <date>
  clock_in?: string | null; // <time>
  clock_out?: string | null; // <time>
  status?: AttendanceStatus;
  hours_worked?: string; // <decimal>
  overtime_hours?: string; // <decimal>
  leave_request?: number | null;
  notes?: string;
  // GPS coordinates for location validation
  latitude?: number;
  longitude?: number;
}

export interface UpdateAttendanceData extends Partial<CreateAttendanceData> {}

// ============================================================================
// ATTENDANCE SUMMARY
// ============================================================================

export interface AttendanceSummary {
  total_days: number;
  present: number;
  absent: number;
  late: number;
  on_leave: number;
  total_hours_worked: number;
  total_overtime_hours: number;
}

// ============================================================================
// PAYROLL
// ============================================================================

export enum PayrollStatus {
  DRAFT = 'draft',
  CALCULATED = 'calculated',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export interface Payroll {
  id: number;
  reference_number: string;
  period_start: string; // <date>
  period_end: string; // <date>
  pay_date: string; // <date> Date when payment will be made
  status?: PayrollStatus;
  total_gross_pay: string; // <decimal>
  total_deductions: string; // <decimal>
  total_net_pay: string; // <decimal>
  total_employee_pension?: string; // <decimal> Employee 8% pension total
  total_employer_pension?: string; // <decimal> Employer 10% pension total
  total_staff_iou_deductions?: string; // <decimal> Sum of Staff IOU deductions across payslips
  total_other_deductions?: string; // <decimal> Sum of non-IOU deductions across payslips
  payslips_count: string;
  workflow_run?: number | null;
  workflow_status?: string | null;
  notes?: string;

  // Dual-signature approval fields
  first_approved_at?: string | null;
  first_approver?: number | null;
  first_approver_name?: string | null;
  second_approved_at?: string | null;
  second_approver?: number | null;
  second_approver_name?: string | null;

  // Legacy approval fields (backward compatibility)
  approved_at?: string | null;
  approved_by?: number | null;

  // Accounting / journal entry references
  liabilities_journal_entry?: number | null; // Stage 1: DR Salary Expense / CR Payables
  journal_entry?: number | null; // Stage 2: DR Salary Payable / CR Cash/Bank
  pension_expense_journal_entry?: number | null; // DR Pension Expense / CR Employer Pension Payable

  created_at: string; // <date-time>
  updated_at: string; // <date-time>
}

export interface CreatePayrollData {
  period_start: string; // <date>
  period_end: string; // <date>
  pay_date: string; // <date> Date when payment will be made
  status?: PayrollStatus;
  notes?: string;
}

export interface UpdatePayrollData extends Partial<CreatePayrollData> {}

// ============================================================================
// PAYSLIPS
// ============================================================================

export interface Payslip {
  id: number;
  payslip_number: string;
  payroll: number;
  payroll_reference: string;
  staff: number;
  staff_name: string;
  staff_id: string; // Auto-generated branch-scoped staff ID
  basic_salary: string; // <decimal>
  overtime_pay?: string; // <decimal>
  allowances?: any; // Dict of allowance_name: amount
  bonuses?: string; // <decimal>
  gross_pay: string; // <decimal>
  tax?: string; // <decimal>
  employee_pension?: string; // Employee pension deduction (8% of gross)
  employer_pension?: string; // Employer pension contribution (10% of gross)
  deductions?: any; // Dict of deduction_name: amount
  iou_monthly_deduction?: string; // Explicit Staff IOU monthly deduction amount
  iou_total_outstanding?: string; // Outstanding Staff IOU balance as of payroll period
  other_deductions_total?: string; // Sum of non-IOU deductions
  staff_iou_details?: Array<{
    reference_number: string;
    monthly_installment: string | number;
    balance_remaining: string | number;
    start_month: string;
  }>;
  total_deductions: string; // <decimal>
  net_pay: string; // <decimal>
  days_worked?: string;
  days_absent?: string;
  days_on_leave?: string;
  overtime_hours?: string;
  pdf_file?: string | null;
  emailed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollWithPayslips extends Payroll {
  payslips: Payslip[];
}

// ============================================================================
// FILTER AND SEARCH INTERFACES
// ============================================================================

export interface StaffFilters {
  search?: string;
  department?: string;
  position?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface LeaveRequestFilters {
  search?: string;
  staff?: number | string;
  leave_type?: number;
  status?: LeaveRequestStatus;
  start_date?: string;
  end_date?: string;
  page?: number;
  ordering?: string;
}

export interface AttendanceFilters {
  search?: string;
  staff?: number | string;
  date?: string;
  date_from?: string;
  date_to?: string;
  status?: AttendanceStatus;
  page?: number;
  ordering?: string;
}

export interface PayrollFilters {
  search?: string;
  status?: PayrollStatus;
  period_start?: string;
  period_end?: string;
  page?: number;
  ordering?: string;
}

// ============================================================================
// PAYROLL SCHEDULE
// ============================================================================

export type PayrollFrequency = 'MONTHLY' | 'WEEKLY';

export interface PayrollSchedule {
  id: number;
  name: string;
  frequency: PayrollFrequency;
  day_of_month?: number | null; // 1–28, for monthly schedules
  day_of_week?: number | null; // 0=Monday – 6=Sunday, for weekly schedules
  next_run?: string | null; // ISO datetime
  created_at: string;
  updated_at: string;
}

export interface CreatePayrollScheduleData {
  name: string;
  frequency: PayrollFrequency;
  day_of_month?: number | null;
  day_of_week?: number | null;
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const HR_VALIDATION_RULES = {
  staff: {
    first_name: { required: true, minLength: 1, maxLength: 100 },
    last_name: { required: true, minLength: 1, maxLength: 100 },
    department: { maxLength: 100 },
    position: { maxLength: 100 },
    email: { maxLength: 254 },
    phone: { maxLength: 20 },
  },
  leaveType: {
    name: { required: true, minLength: 1, maxLength: 100 },
    default_days_per_year: { min: 0, max: 2147483647 },
    max_carryover_days: { min: 0, max: 2147483647 },
  },
  leaveRequest: {
    reason: { required: true, minLength: 1 },
    start_date: { required: true },
    end_date: { required: true },
  },
  attendance: {
    date: { required: true },
    hours_worked: { min: 0, max: 999.99 },
    overtime_hours: { min: 0, max: 999.99 },
  },
  payroll: {
    period_start: { required: true },
    period_end: { required: true },
    pay_date: { required: true },
  },
} as const;

// ============================================================================
// STATUS HELPERS
// ============================================================================

export const getLeaveRequestStatusColor = (status: LeaveRequestStatus): string => {
  switch (status) {
    case LeaveRequestStatus.DRAFT:
      return 'gray';
    case LeaveRequestStatus.SUBMITTED:
      return 'blue';
    case LeaveRequestStatus.APPROVED:
      return 'green';
    case LeaveRequestStatus.REJECTED:
      return 'red';
    case LeaveRequestStatus.CANCELLED:
      return 'gray';
    case LeaveRequestStatus.TAKEN:
      return 'purple';
    default:
      return 'gray';
  }
};

export const getLeaveRequestStatusLabel = (status: LeaveRequestStatus): string => {
  switch (status) {
    case LeaveRequestStatus.DRAFT:
      return 'Draft';
    case LeaveRequestStatus.SUBMITTED:
      return 'Submitted';
    case LeaveRequestStatus.APPROVED:
      return 'Approved';
    case LeaveRequestStatus.REJECTED:
      return 'Rejected';
    case LeaveRequestStatus.CANCELLED:
      return 'Cancelled';
    case LeaveRequestStatus.TAKEN:
      return 'Taken';
    default:
      return 'Unknown';
  }
};

export const getAttendanceStatusColor = (status: AttendanceStatus): string => {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return 'green';
    case AttendanceStatus.ABSENT:
      return 'red';
    case AttendanceStatus.LATE:
      return 'orange';
    case AttendanceStatus.HALF_DAY:
      return 'yellow';
    case AttendanceStatus.ON_LEAVE:
      return 'blue';
    case AttendanceStatus.PUBLIC_HOLIDAY:
      return 'purple';
    case AttendanceStatus.WEEKEND:
      return 'gray';
    default:
      return 'gray';
  }
};

export const getAttendanceStatusLabel = (status: AttendanceStatus): string => {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return 'Present';
    case AttendanceStatus.ABSENT:
      return 'Absent';
    case AttendanceStatus.LATE:
      return 'Late';
    case AttendanceStatus.HALF_DAY:
      return 'Half Day';
    case AttendanceStatus.ON_LEAVE:
      return 'On Leave';
    case AttendanceStatus.PUBLIC_HOLIDAY:
      return 'Public Holiday';
    case AttendanceStatus.WEEKEND:
      return 'Weekend';
    default:
      return 'Unknown';
  }
};

export const getPayrollStatusColor = (status: PayrollStatus): string => {
  switch (status) {
    case PayrollStatus.DRAFT:
      return 'gray';
    case PayrollStatus.CALCULATED:
      return 'blue';
    case PayrollStatus.APPROVED:
      return 'green';
    case PayrollStatus.PAID:
      return 'purple';
    case PayrollStatus.CANCELLED:
      return 'red';
    default:
      return 'gray';
  }
};

export const getPayrollStatusLabel = (status: PayrollStatus): string => {
  switch (status) {
    case PayrollStatus.DRAFT:
      return 'Draft';
    case PayrollStatus.CALCULATED:
      return 'Calculated';
    case PayrollStatus.APPROVED:
      return 'Approved';
    case PayrollStatus.PAID:
      return 'Paid';
    case PayrollStatus.CANCELLED:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// PERSONNEL CHANGES REPORT
// ============================================================================

export interface PersonnelChange {
  id: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeaveChange {
  id: number;
  staff__first_name: string;
  staff__last_name: string;
  leave_type__name: string;
  start_date: string;
  end_date: string;
  num_days: number;
}

export interface OvertimeRecord {
  staff__id: number;
  staff__first_name: string;
  staff__last_name: string;
  total_overtime_hours: string;
}

export interface PersonnelChangesReport {
  period_start: string;
  period_end: string;
  new_hires: PersonnelChange[];
  terminations: PersonnelChange[];
  leave_taken: LeaveChange[];
  overtime: OvertimeRecord[];
  summary: {
    new_hires_count: number;
    terminations_count: number;
    leave_requests_count: number;
    total_leave_days: number;
    overtime_staff_count: number;
    total_overtime_hours: number;
  };
}
// ============================================================================
// BONUS/DEDUCTION REQUESTS
// ============================================================================

export enum BonusDeductionRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface BonusDeductionRequest {
  id: number;
  reference_number: string;
  staff: number;
  staff_name: string;
  component: number;
  component_name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  amount: string; // decimal
  reason: string;
  for_month: string; // date (YYYY-MM-01 format)
  status: BonusDeductionRequestStatus;
  is_pending: boolean;
  is_approved: boolean;
  is_rejected: boolean;
  requested_by: number;
  requested_by_name: string;
  requested_date: string; // datetime
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_date?: string | null; // datetime
  rejection_reason?: string;
  applied_in_payroll?: number | null;
  owner: number;
  branch: number;
  created_at: string; // datetime
  updated_at: string; // datetime
}

export interface CreateBonusDeductionRequestData {
  staff: number;
  component: number;
  amount: number | string;
  reason: string;
  for_month: string; // YYYY-MM-01 format
}

export interface UpdateBonusDeductionRequestData extends Partial<CreateBonusDeductionRequestData> {}

export interface BonusDeductionApprovalData {
  action: 'approve' | 'reject';
  rejection_reason?: string;
}

export interface BonusDeductionRequestFilters {
  staff?: number;
  status?: BonusDeductionRequestStatus | string;
  for_month?: string;
  component_type?: 'EARNING' | 'DEDUCTION';
  pending_only?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface BonusDeductionApprovalResponse {
  message: string;
  data: BonusDeductionRequest;
}

export interface BonusDeductionPendingCountResponse {
  count: number;
}

// Status helper functions for bonus/deduction requests
export const getBonusDeductionStatusColor = (status: BonusDeductionRequestStatus): string => {
  switch (status) {
    case BonusDeductionRequestStatus.PENDING:
      return 'orange';
    case BonusDeductionRequestStatus.APPROVED:
      return 'green';
    case BonusDeductionRequestStatus.REJECTED:
      return 'red';
    default:
      return 'gray';
  }
};

export const getBonusDeductionStatusLabel = (status: BonusDeductionRequestStatus): string => {
  switch (status) {
    case BonusDeductionRequestStatus.PENDING:
      return 'Pending';
    case BonusDeductionRequestStatus.APPROVED:
      return 'Approved';
    case BonusDeductionRequestStatus.REJECTED:
      return 'Rejected';
    default:
      return 'Unknown';
  }
};

// ============================================================================
// STAFF IOU
// ============================================================================

export type StaffIOUStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface StaffIOU {
  id: number;
  reference_number: string;
  staff: number;
  staff_name: string;
  staff_id_code: string;
  total_amount: string; // decimal string
  monthly_installment: string; // decimal string
  balance_remaining: string; // decimal string
  start_month: string; // date YYYY-MM-DD
  reason: string;
  status: StaffIOUStatus;
  status_display: string;
  installments_paid: number;
  created_by: number;
  created_by_name: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  disbursement_journal?: number | null;
  cash_disbursed?: boolean | null;
  notes: string;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface CreateStaffIOUData {
  staff: number;
  total_amount: number | string;
  monthly_installment: number | string;
  start_month: string; // YYYY-MM-01
  reason: string;
  notes?: string;
}

export interface StaffIOUFilters {
  staff?: number;
  status?: StaffIOUStatus | string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface StaffIOUActionResponse {
  message: string;
  data: StaffIOU;
  journal_entry_id?: number;
}

export const getIOUStatusColor = (status: StaffIOUStatus): string => {
  switch (status) {
    case 'PENDING':
      return 'yellow';
    case 'APPROVED':
      return 'indigo';
    case 'ACTIVE':
      return 'blue';
    case 'COMPLETED':
      return 'green';
    case 'CANCELLED':
      return 'red';
    default:
      return 'gray';
  }
};

// ============================================================================
// HR CONFIGURATION
// ============================================================================

export interface HRConfig {
  id: number;
  branch: number;
  enable_leave_approval: boolean;
  max_consecutive_leave_days: number;
  annual_leave_days: number;
  sick_leave_days: number;
  working_hours_per_day: string; // decimal
  late_arrival_grace_minutes: number;
  enable_attendance_tracking: boolean;
  payroll_currency: string;
  payroll_frequency: 'monthly' | 'bi_weekly' | 'weekly';
  tax_rate_percentage: string; // decimal
  enable_overtime_calculation: boolean;
  overtime_multiplier: string; // decimal
  // Staff ID settings
  staff_id_prefix: string;
  staff_id_padding: number;
  staff_id_current_number: number; // read-only
  // Pension settings
  enable_pension: boolean;
  employee_pension_rate: string; // decimal, default 8.00
  employer_pension_rate: string; // decimal, default 10.00
  pension_provider_name?: string;
  // Workflow references
  default_leave_workflow?: number | null;
  default_leave_workflow_name?: string;
  extended_leave_workflow?: number | null;
  extended_leave_workflow_name?: string;
  payroll_approval_workflow?: number | null;
  payroll_approval_workflow_name?: string;
  created_at: string; // datetime
  updated_at: string; // datetime
}

export interface UpdateHRConfigData {
  enable_leave_approval?: boolean;
  max_consecutive_leave_days?: number;
  annual_leave_days?: number;
  sick_leave_days?: number;
  working_hours_per_day?: string | number;
  late_arrival_grace_minutes?: number;
  enable_attendance_tracking?: boolean;
  payroll_currency?: string;
  payroll_frequency?: 'monthly' | 'bi_weekly' | 'weekly';
  tax_rate_percentage?: string | number;
  enable_overtime_calculation?: boolean;
  overtime_multiplier?: string | number;
  // Staff ID settings
  staff_id_prefix?: string;
  staff_id_padding?: number;
  // Pension settings
  enable_pension?: boolean;
  employee_pension_rate?: string | number;
  employer_pension_rate?: string | number;
  pension_provider_name?: string;
  // Workflows
  default_leave_workflow?: number | null;
  extended_leave_workflow?: number | null;
  payroll_approval_workflow?: number | null;
}

export interface WorkflowTemplate {
  id: number;
  name: string;
  run_sequence: Array<{ step: string }>;
  description: string;
}

export interface AvailableWorkflowsResponse {
  workflows: WorkflowTemplate[];
}
// ============================================================================
// PENSION REMITTANCE
// ============================================================================

export type PensionRemittanceStatus = 'draft' | 'remitted' | 'cancelled';

export interface PensionRemittance {
  id: number;
  reference_number: string;
  period_start: string; // date
  period_end: string; // date
  remittance_date: string; // date
  total_employee_pension: string; // decimal
  total_employer_pension: string; // decimal
  total_amount: string; // decimal — sum of both
  pension_provider?: string;
  status: PensionRemittanceStatus;
  payrolls: number[];
  payroll_references: string[]; // human-readable reference numbers
  payment_account?: number | null;
  journal_entry?: number | null;
  remitted_by?: number | null;
  remitted_by_name?: string | null;
  notes?: string;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePensionRemittanceData {
  period_start: string;
  period_end: string;
  remittance_date: string;
  total_employee_pension: number | string;
  total_employer_pension: number | string;
  pension_provider?: string;
  payrolls?: number[];
  payment_account?: number | null;
  notes?: string;
}

export interface RemitPensionData {
  payment_account: number;
  remittance_date?: string;
  notes?: string;
}

// ============================================================================
// EMPLOYEE DOCUMENTS
// ============================================================================

export type EmployeeDocumentCategory =
  | 'contract'
  | 'id_document'
  | 'certificate'
  | 'medical'
  | 'disciplinary'
  | 'tax'
  | 'pension'
  | 'other';

export interface EmployeeDocument {
  id: number;
  staff: number;
  staff_name: string;
  title: string;
  category: EmployeeDocumentCategory;
  category_display: string;
  file: string; // URL
  description?: string;
  expiry_date?: string | null;
  is_expired: boolean;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocumentFilters {
  staff?: number | string;
  category?: EmployeeDocumentCategory;
  expired?: 'true' | 'false';
  page?: number;
}

export interface DocumentCategoryOption {
  value: string;
  label: string;
}

// -- Statutory Filings (NHF / NSITF) ------------------------------------------

export interface StatutoryFiling {
  id: number;
  payroll: number;
  payroll_period: string;
  filing_type: 'nhf' | 'nsitf';
  status: 'draft' | 'submitted' | 'remitted' | 'rejected' | 'cancelled';
  total_employee_contribution: string;
  total_employer_contribution: string;
  submission_payload: Record<string, unknown> | null;
  submission_response: Record<string, unknown> | null;
  agency_reference: string;
  submitted_by: number | null;
  submitted_by_name: string | null;
  remittance_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStatutoryFilingData {
  payroll: number;
  filing_type: 'nhf' | 'nsitf';
}
