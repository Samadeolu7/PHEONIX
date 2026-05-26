// src/types/cashflow.ts

/**
 * Cash Flow Statement Method
 */
export type CashFlowMethod = 'direct' | 'indirect';

/**
 * Cash Flow Activity Category
 */
export type CashFlowCategory = 'operating' | 'investing' | 'financing';

/**
 * Cash Flow Activity Item
 * Individual transaction or line item in a cash flow category
 */
export interface CashFlowItem {
  description: string;
  amount: string; // Decimal as string (positive = inflow, negative = outflow)
  date?: string; // ISO date
  reference?: string; // Transaction reference number
  account_code?: string;
  account_name?: string;
}

/**
 * Cash Flow Activity Section
 * Operating, Investing, or Financing activities
 */
export interface CashFlowActivity {
  items: CashFlowItem[];
  subtotal?: string; // Subtotal for this category
  net: string; // Net cash flow for this category
}

/**
 * Cash Flow Statement Period Info
 */
export interface CashFlowPeriod {
  start_date: string; // ISO date
  end_date: string; // ISO date
  method: CashFlowMethod;
  days_in_period?: number;
}

/**
 * Cash Flow Verification Info
 */
export interface CashFlowVerification {
  calculated_ending: string;
  actual_ending: string;
  is_balanced: boolean;
  difference?: string;
}

/**
 * Complete Cash Flow Statement
 */
export interface CashFlowStatement {
  period: CashFlowPeriod;

  // Main sections
  operating_activities: CashFlowActivity;
  investing_activities: CashFlowActivity;
  financing_activities: CashFlowActivity;

  // Summary
  net_change_in_cash: string;
  beginning_cash: string;
  ending_cash: string;

  // Verification
  verification: CashFlowVerification;

  // Optional metadata
  generated_at?: string;
  branch_name?: string;
}

/**
 * Cash Flow Statement Request Parameters
 */
export interface CashFlowStatementParams {
  start_date: string; // Required - YYYY-MM-DD
  end_date?: string; // Optional - defaults to today
  method?: CashFlowMethod; // Optional - defaults to 'direct'
  export_format?: 'json' | 'pdf' | 'excel'; // Optional - defaults to 'json'
}

/**
 * Cash Flow Trend Data Point
 * For displaying cash flow trends over time
 */
export interface CashFlowTrendPoint {
  period: string; // e.g., "Jan 2025", "Q1 2025"
  operating: string;
  investing: string;
  financing: string;
  net_change: string;
  ending_cash: string;
}

/**
 * Cash Flow Summary Statistics
 * For dashboard widgets and quick insights
 */
export interface CashFlowSummary {
  current_period: {
    start_date: string;
    end_date: string;
    net_change: string;
    ending_cash: string;
  };
  previous_period?: {
    start_date: string;
    end_date: string;
    net_change: string;
    ending_cash: string;
  };
  change_from_previous?: string;
  change_percent?: number;

  // Breakdown
  operating_net: string;
  investing_net: string;
  financing_net: string;

  // Ratios and metrics
  cash_flow_margin?: number; // Operating cash flow / Revenue
  free_cash_flow?: string; // Operating - Capital Expenditures
}

/**
 * API Response Wrapper
 */
export interface CashFlowApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
