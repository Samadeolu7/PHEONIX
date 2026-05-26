// Types based on HR_API_REFERENCE.md

export interface PAYEBandDetail {
  band: string;
  rate: number | string;
  amount_in_band: number | string; // income falling in this band
  tax_in_band: number | string; // tax charged in this band
  cumulative_balance?: number | string; // remaining income after this band
}

export interface StaffIOUDetail {
  reference_number: string;
  monthly_installment: string | number;
  balance_remaining: string | number;
  balance_after_this_period?: string | number;
  start_month: string;
}

// Allowance can be a plain number (legacy) or a richer object (new format)
export type AllowanceValue =
  | string
  | number
  | { amount: string | number; is_taxable: boolean; is_pensionable?: boolean };

export interface Payslip {
  id: number;
  payslip_number: string;
  /** FK integer — use `payroll_reference` for the human-readable reference */
  payroll: number;
  payroll_reference: string;
  /** FK integer — use `staff_name` / `staff_id` for display */
  staff: number;
  staff_name: string;
  /** Auto-generated branch-scoped ID (e.g. MML001) */
  staff_id: string;
  period_label: string;
  basic_salary: string;
  overtime_pay: string;
  overtime_hours: string;
  allowances: Record<string, AllowanceValue>;
  bonuses: string;
  gross_pay: string;
  taxable_income: string;
  taxable_income_display: string;
  annual_taxable_income: string;
  annual_taxable_display: string;
  paye_breakdown: PAYEBandDetail[];
  tax: string;
  employee_pension: string;
  employer_pension: string;
  deductions: Record<string, string | number>;
  iou_monthly_deduction?: string;
  iou_total_outstanding?: string;
  iou_balance_after_this_period?: string;
  other_deductions_total?: string;
  staff_iou_details?: StaffIOUDetail[];
  total_deductions: string;
  net_pay: string;
  days_worked: string;
  days_absent: string;
  days_on_leave: string;
  status?: string;
  pdf_file?: string | null;
  emailed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PayslipsResponse {
  count: number;
  results: Payslip[];
}

export interface GeneratePDFResponse {
  id: number;
  pdf_file: string;
}

export interface EmailPayslipRequest {
  email: string;
  subject: string;
  message: string;
}

export interface EmailPayslipResponse {
  sent: boolean;
  emailed_at: string;
}

export interface Payroll {
  id: number;
  reference_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  total_gross_pay: string;
  total_deductions: string;
  total_net_pay: string;
  created_at: string;
}

export interface PayrollsResponse {
  count: number;
  results: Payroll[];
}

export interface CalculatePayrollRequest {
  staff_ids: number[];
}

export interface CalculatePayrollResponse {
  status: string;
  payslips_created: number;
  total_gross_pay: string;
  total_deductions: string;
  total_net_pay: string;
}

export interface ApprovePayrollRequest {
  notes: string;
}

export interface ProcessPaymentRequest {
  payment_account: number;
  payment_date: string;
}

export interface HRMetrics {
  total_staff: number;
  active_staff: number;
  staff_on_leave: number;
  pending_leave_requests: number;
  attendance_rate: number;
  current_payroll_status: string;
  monthly_payroll_cost: string;
}
