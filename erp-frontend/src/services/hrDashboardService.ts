import { HRMetrics } from '../types/payslip';
import { api } from './api';

export const hrDashboardService = {
  async getHRMetrics(): Promise<HRMetrics> {
    // This would typically be a dedicated endpoint, but we'll simulate it
    // by aggregating data from multiple endpoints
    const [staffResponse, leaveRequestsResponse, attendanceResponse] = await Promise.all([
      api.get('/hr/staff/', { params: { page_size: 1 } }),
      api.get('/hr/leave-requests/', { params: { status: 'submitted', page_size: 1 } }),
      api.get('/hr/attendance/', {
        params: {
          date: new Date().toISOString().split('T')[0],
          page_size: 1,
        },
      }),
    ]);

    return {
      total_staff: staffResponse.count || 0,
      active_staff: staffResponse.count || 0, // Simplified
      staff_on_leave: 0, // Would need additional logic
      pending_leave_requests: leaveRequestsResponse.count || 0,
      attendance_rate: 85.5, // Mock data
      current_payroll_status: 'draft',
      monthly_payroll_cost: '2500000.00',
    };
  },

  async getLeaveAnalytics(params?: { start_date?: string; end_date?: string }) {
    // Mock analytics data - in real implementation, this would come from backend
    return {
      leave_usage_by_type: [
        { name: 'Annual Leave', value: 45 },
        { name: 'Sick Leave', value: 23 },
        { name: 'Maternity Leave', value: 8 },
        { name: 'Emergency Leave', value: 12 },
      ],
      monthly_trends: [
        { month: 'Jan', requests: 15, approved: 12 },
        { month: 'Feb', requests: 18, approved: 16 },
        { month: 'Mar', requests: 22, approved: 20 },
        { month: 'Apr', requests: 19, approved: 17 },
        { month: 'May', requests: 25, approved: 23 },
        { month: 'Jun', requests: 28, approved: 25 },
      ],
    };
  },

  async getAttendanceAnalytics(params?: { start_date?: string; end_date?: string }) {
    // Mock analytics data
    return {
      attendance_rates: [
        { department: 'Engineering', rate: 92.5 },
        { department: 'HR', rate: 88.3 },
        { department: 'Finance', rate: 95.1 },
        { department: 'Marketing', rate: 87.9 },
      ],
      daily_trends: [
        { date: '2025-01-20', present: 42, absent: 3, late: 2 },
        { date: '2025-01-21', present: 44, absent: 1, late: 2 },
        { date: '2025-01-22', present: 43, absent: 2, late: 3 },
        { date: '2025-01-23', present: 45, absent: 0, late: 2 },
        { date: '2025-01-24', present: 41, absent: 4, late: 2 },
      ],
    };
  },

  async getPayrollAnalytics(params?: { start_date?: string; end_date?: string }) {
    // Mock analytics data
    return {
      cost_breakdown: [
        { component: 'Basic Salary', amount: 1800000 },
        { component: 'Allowances', amount: 450000 },
        { component: 'Overtime', amount: 120000 },
        { component: 'Bonuses', amount: 80000 },
      ],
      monthly_costs: [
        { month: 'Jan', gross: 2400000, deductions: 360000, net: 2040000 },
        { month: 'Feb', gross: 2450000, deductions: 367500, net: 2082500 },
        { month: 'Mar', gross: 2380000, deductions: 357000, net: 2023000 },
        { month: 'Apr', gross: 2520000, deductions: 378000, net: 2142000 },
        { month: 'May', gross: 2480000, deductions: 372000, net: 2108000 },
        { month: 'Jun', gross: 2550000, deductions: 382500, net: 2167500 },
      ],
    };
  },
};
