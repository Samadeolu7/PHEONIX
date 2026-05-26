// src/types/budgets.ts

/**
 * Budget Period Status
 */
export type BudgetStatus = 'draft' | 'approved' | 'active' | 'closed';

/**
 * Budget Variance Status
 */
export type VarianceStatus = 'over' | 'under' | 'on_track';

/**
 * Account Type for grouping
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/**
 * Budget Period
 * Represents a fiscal period (year, quarter, month, custom) for budget tracking
 */
export interface BudgetPeriod {
  id: number;
  name: string;
  start_date: string; // ISO date format
  end_date: string; // ISO date format
  status: BudgetStatus;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string; // ISO datetime
  notes?: string;

  // Computed fields
  total_budget?: string; // Decimal as string
  total_actual?: string; // Decimal as string
  total_variance?: string; // Decimal as string
  variance_percent?: number;
  utilization_percent?: number;

  // Related data
  budget_lines?: BudgetLine[];
  line_count?: number;

  // Metadata
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Budget Line
 * Individual account allocation within a budget period
 */
export interface BudgetLine {
  id: number;
  budget_period: number;
  budget_period_name?: string;
  account: number;
  account_code?: string;
  account_name?: string;
  account_type?: AccountType;
  department?: number;
  department_name?: string;
  amount: string; // Decimal as string
  notes?: string;

  // Computed fields
  actual?: string; // Actual spending
  variance?: string; // Budget - Actual
  variance_percent?: number;
  utilization_percent?: number;
  variance_status?: VarianceStatus;

  // Metadata
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Budget Period Summary for List Views
 */
export interface BudgetPeriodListItem {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: BudgetStatus;
  total_budget: string;
  total_actual: string;
  total_variance: string;
  variance_percent: number;
  utilization_percent: number;
  line_count: number;
}

/**
 * Variance Report Summary
 */
export interface VarianceReportSummary {
  total_budget: string;
  total_actual: string;
  total_variance: string;
  variance_percent: number;
  utilization_percent: number;
  line_count: number;
  over_budget_count: number;
  under_budget_count: number;
}

/**
 * Variance by Department
 */
export interface VarianceByDepartment {
  department_id: number | null;
  department_name: string;
  budget: string;
  actual: string;
  variance: string;
  variance_percent: number;
  utilization_percent: number;
  line_count: number;
}

/**
 * Variance by Account Type
 */
export interface VarianceByAccountType {
  account_type: AccountType;
  account_type_display: string;
  budget: string;
  actual: string;
  variance: string;
  variance_percent: number;
  utilization_percent: number;
  line_count: number;
}

/**
 * Budget Variance Report Response
 */
export interface BudgetVarianceReport {
  period: {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    status: BudgetStatus;
  };
  summary: VarianceReportSummary;
  by_department: VarianceByDepartment[];
  by_account_type: VarianceByAccountType[];
  lines: BudgetLine[];
}

/**
 * Budget Period Form Data
 */
export interface BudgetPeriodFormData {
  name: string;
  start_date: string;
  end_date: string;
  notes?: string;
  budget_lines?: BudgetLineFormData[];
}

/**
 * Budget Line Form Data
 */
export interface BudgetLineFormData {
  account: number;
  amount: string;
  notes?: string;
}

/**
 * Variance Report Filter Options
 */
export interface VarianceReportFilters {
  department_id?: number;
  account_type?: AccountType;
  threshold?: number; // Only show variances >= this percentage
  group_by?: 'department' | 'account_type';
}

/**
 * API Response Wrapper
 */
export interface BudgetApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
