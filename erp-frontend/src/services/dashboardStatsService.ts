// src/services/dashboardStatsService.ts
/**
 * Microfinance dashboard analytics service.
 * Consumes the /api/analytics/ endpoints created in analytics/views.py.
 */
import { api } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MicrofinanceDashboardStats {
  // Clients
  total_clients: number;
  active_clients: number;
  new_clients_this_month: number;

  // Loan portfolio
  active_loans: number;
  total_loan_book: string;          // total outstanding principal
  total_disbursed_this_month: string;
  overdue_loans: number;
  loan_repayment_rate: number;       // percentage 0-100

  // Fee / income collection
  total_invoiced: string;
  total_collected: string;
  outstanding_fees: string;
  overdue_invoice_count: number;

  // Receivables
  total_outstanding_receivables: string;

  // Savings
  total_savings: string;

  // Approvals & tickets
  pending_approvals: number;
  pending_tickets: number;

  // Staff / HR
  total_staff: number;
  pending_leave_requests: number;
  staff_on_leave_today: number;
  last_payroll_status: string | null;
  last_payroll_period: string | null;
  last_payroll_net_pay: string;

  // Procurement
  pending_requisitions: number;
  pending_purchase_orders: number;

  // Operational period
  active_financial_year: string | null;
  active_period: string | null;
  period_progress_pct: number;
}

/** @deprecated Use MicrofinanceDashboardStats */
export type SchoolDashboardStats = MicrofinanceDashboardStats;

export interface FeeCollectionTrendPoint {
  month: string; // "2026-01"
  label: string; // "Jan 2026"
  invoiced: number;
  collected: number;
}

export interface StudentEnrollmentRow {
  class_name: string;
  student_status: string;
  count: number;
}

export interface StaffAttendanceSummary {
  date: string;
  total_staff: number;
  present: number;
  absent: number;
  late: number;
  on_leave: number;
  attendance_rate: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const dashboardStatsService = {
  /**
   * Fetch all KPIs for the microfinance dashboard at once.
   * Falls back to a zeroed-out object on any network/auth error so the
   * dashboard still renders without crashing.
   */
  async getStats(): Promise<MicrofinanceDashboardStats> {
    try {
      const response = await api.get('/analytics/dashboard-stats/');
      const data = response.data?.data || response.data;
      return data as MicrofinanceDashboardStats;
    } catch (error) {
      console.warn('[dashboardStatsService] getStats failed:', error);
      return {
        total_clients: 0,
        active_clients: 0,
        new_clients_this_month: 0,
        active_loans: 0,
        total_loan_book: '0.00',
        total_disbursed_this_month: '0.00',
        overdue_loans: 0,
        loan_repayment_rate: 0,
        total_invoiced: '0.00',
        total_collected: '0.00',
        outstanding_fees: '0.00',
        overdue_invoice_count: 0,
        total_outstanding_receivables: '0.00',
        total_savings: '0.00',
        pending_approvals: 0,
        pending_tickets: 0,
        total_staff: 0,
        pending_leave_requests: 0,
        staff_on_leave_today: 0,
        last_payroll_status: null,
        last_payroll_period: null,
        last_payroll_net_pay: '0.00',
        pending_requisitions: 0,
        pending_purchase_orders: 0,
        active_financial_year: null,
        active_period: null,
        period_progress_pct: 0,
      };
    }
  },

  /** @deprecated Use getStats() */
  async getSchoolStats(): Promise<MicrofinanceDashboardStats> {
    return this.getStats();
  },

  /**
   * Monthly fee invoiced vs. collected trend for bar/line charts.
   */
  async getFeeCollectionTrend(months = 6): Promise<FeeCollectionTrendPoint[]> {
    try {
      const response = await api.get(`/analytics/fee-collection-trend/?months=${months}`);
      return response.data?.data || [];
    } catch {
      return [];
    }
  },

  /**
   * Student counts per class and status.
   */
  async getStudentEnrollment(): Promise<StudentEnrollmentRow[]> {
    try {
      const response = await api.get('/analytics/student-enrollment/');
      return response.data?.data || [];
    } catch {
      return [];
    }
  },

  /**
   * Staff attendance summary for a given date (default: today).
   */
  async getStaffAttendance(date?: string): Promise<StaffAttendanceSummary> {
    try {
      const params = date ? `?date=${date}` : '';
      const response = await api.get(`/analytics/staff-attendance/${params}`);
      return response.data?.data;
    } catch {
      return {
        date: date || new Date().toISOString().split('T')[0],
        total_staff: 0,
        present: 0,
        absent: 0,
        late: 0,
        on_leave: 0,
        attendance_rate: 0,
      };
    }
  },
};

// ── Helper formatters ─────────────────────────────────────────────────────────

/** Format a decimal string from the backend as a Nigerian naira amount. */
export function formatNaira(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '₦0.00';
  return `₦${num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a percentage to one decimal place. */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
