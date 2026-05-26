// Types for HR Salary Components

export interface SalaryComponent {
  id: number;
  name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  default_amount: string;
  /**
   * For EARNING components: whether this component is included in the PAYE
   * taxable-income calculation.  Set to false for statutory non-taxable
   * allowances (e.g. Leave Allowance under the Nigerian PIT Act).
   * DEDUCTION components always have is_taxable=false.
   */
  is_taxable: boolean;
  /**
   * For EARNING components: whether this component is included in the pension
   * contribution base (Nigerian Pension Reform Act).
   * Only Basic Salary, Housing Allowance, and Transport Allowance should be true.
   * DEDUCTION components always have is_pensionable=false.
   */
  is_pensionable: boolean;
  description?: string;
  /** For DEDUCTION components: the GL account (balance-sheet) that tracks this deduction type. */
  gl_account?: number | null;
  gl_account_name?: string;
  gl_account_code?: string;
  /**
   * For DEDUCTION components only. Set True when this deduction represents a cash advance
   * physically disbursed to the staff member at approval time (e.g. Salary Advance, Staff Loan).
   * When True, approving a BonusDeductionRequest posts: DR gl_account / CR Bank.
   * Leave False for payroll-only reductions (cooperative dues, levies, etc.).
   */
  is_advance?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateSalaryComponentRequest {
  name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  default_amount: string;
  is_taxable?: boolean;
  is_pensionable?: boolean;
  description?: string;
  gl_account?: number | null;
  /** For DEDUCTION components only. True = cash advance disbursed at approval. */
  is_advance?: boolean;
}

export interface UpdateSalaryComponentRequest {
  name?: string;
  component_type?: 'EARNING' | 'DEDUCTION';
  default_amount?: string;
  is_taxable?: boolean;
  is_pensionable?: boolean;
  description?: string;
  gl_account?: number | null;
  /** For DEDUCTION components only. True = cash advance disbursed at approval. */
  is_advance?: boolean;
}

export interface SalaryComponentsResponse {
  count: number;
  results: SalaryComponent[];
}

// ── Staff Pay Info ──────────────────────────────────────────────────────────

export interface StaffPayInfo {
  id: number;
  staff: number;
  component: SalaryComponent;
  /** The staff-specific override amount (may differ from component default) */
  amount: string;
  staff_name?: string;
  component_name?: string;
}

export interface CreateStaffPayInfoRequest {
  staff: number;
  component: number;
  amount: string;
}

export interface StaffPayInfoResponse {
  count: number;
  results: StaffPayInfo[];
}

export interface StaffWithPayInfo {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  photo?: string;
  user: number;
  staff_id: string;
  created_at: string;
  pay_info: StaffPayInfo[];
}

// ── Pay Component Removal Requests ─────────────────────────────────────────

export type PayComponentRemovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PayComponentRemovalRequest {
  id: number;
  reference_number: string;
  staff_pay_info: number;
  staff_id: number;
  staff_name: string;
  component_id: number;
  component_name: string;
  component_type: 'EARNING' | 'DEDUCTION';
  current_amount: string;
  reason: string;
  status: PayComponentRemovalStatus;
  requested_by: number;
  requested_by_name: string;
  requested_date: string;
  approved_by?: number | null;
  approved_by_name?: string;
  approved_date?: string | null;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreatePayComponentRemovalRequest {
  staff_pay_info: number;
  reason: string;
}

export interface PayComponentRemovalListResponse {
  count: number;
  results: PayComponentRemovalRequest[];
}

// ── PAYE band breakdown (stored on Payslip) ─────────────────────────────────

export interface PAYEBandDetail {
  band: string;
  rate: number;
  amount_in_band: number;
  tax_in_band: number;
  cumulative_balance: number;
}

// ── Allowance entry (new dict-of-dicts format) ───────────────────────────────

export interface AllowanceEntry {
  amount: number;
  is_taxable: boolean;
}

// ── Payslip ─────────────────────────────────────────────────────────────────

export interface Payslip {
  id: number;
  payslip_number: string;
  payroll: number;
  payroll_reference: string;
  staff: number;
  staff_name: string;
  staff_id: string;
  period_label: string;

  // Earnings
  basic_salary: string;
  overtime_pay: string;
  /** {component_name: {amount, is_taxable}} or legacy {component_name: amount} */
  allowances: Record<string, AllowanceEntry | number>;
  bonuses: string;
  gross_pay: string;

  // PAYE
  taxable_income: string;
  annual_taxable_income: string;
  paye_breakdown: PAYEBandDetail[];
  tax: string;

  // Pension
  employee_pension: string;
  employer_pension: string;

  // Other deductions
  deductions: Record<string, number>;
  total_deductions: string;

  // Net
  net_pay: string;

  // Attendance
  days_worked: string;
  days_absent: string;
  days_on_leave: string;
  overtime_hours: string;

  // File
  pdf_file: string | null;
  emailed_at: string | null;

  created_at: string;
  updated_at: string;
}
