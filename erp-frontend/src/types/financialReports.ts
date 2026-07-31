// Financial Reports TypeScript Interfaces
// Based on API documentation from .kiro/specs/finanncial/FINANCIAL_REPORTS_FRONTEND_GUIDE.md

// Base account structure
export interface AccountBalance {
  code: string;
  name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'LOAN';
  level: 'PARENT' | 'CHILD';
  debit: string;
  credit: string;
  balance: string;
  children?: AccountBalance[];
  // Present only on consolidated (tenant-wide) trial balance rows — see
  // FinancialStatementService.generate_consolidated_trial_balance.
  branch_id?: number;
  branch_name?: string;
  // True for a reciprocal Due-from/Due-to clearing-account leg — still shown
  // for audit visibility, but excluded from the consolidated totals since
  // its matching pair (on the counterparty branch's books) nets it to zero.
  is_interbranch_eliminated?: boolean;
}

// Trial Balance specific types
export interface TrialBalanceData {
  report_date: string;
  date_range: {
    start: string | null;
    end: string;
  };
  accounts: AccountBalance[];
  totals: {
    total_debits: string;
    total_credits: string;
    difference: string;
  };
  is_balanced: boolean;
}

export interface TrialBalanceParams {
  start_date?: string;
  end_date?: string;
  detail_level?: 'summary' | 'detailed' | 'all';
  include_zero_balances?: boolean;
  export_format?: 'json' | 'pdf' | 'excel';
}

// Consolidated (tenant-wide, elimination) Trial Balance — same shape as
// TrialBalanceData, just sourced from generate_consolidated_trial_balance.
export type ConsolidatedTrialBalanceData = TrialBalanceData;
export type ConsolidatedTrialBalanceParams = TrialBalanceParams;

// Profit & Loss specific types
export interface ProfitLossData {
  period: {
    start: string;
    end: string;
  };
  revenue: {
    total: string;
    accounts: AccountBalance[];
  };
  expenses: {
    total: string;
    accounts: AccountBalance[];
  };
  net_profit: string;
  net_margin_percent: string;
  // Present only when at least one loan product uses deferred/unearned interest
  // income (see LoanProduct.unearned_interest_income_account): net_profit minus
  // the remaining unearned-interest liability, i.e. profit net of interest not
  // yet actually earned.
  real_net_profit?: string;
  comparative?: {
    period: {
      start: string;
      end: string;
    };
    revenue: string;
    expenses: string;
    net_profit: string;
    variance: {
      revenue: string;
      expenses: string;
      net_profit: string;
    };
  };
}

export interface ProfitLossParams {
  start_date: string; // Required
  end_date?: string;
  detail_level?: 'summary' | 'detailed' | 'all';
  comparative?: boolean;
  export_format?: 'json' | 'pdf' | 'excel';
}

// Balance Sheet specific types
export interface BalanceSheetData {
  as_of_date: string;
  assets: {
    current: {
      total: string;
      accounts: AccountBalance[];
    };
    non_current: {
      total: string;
      accounts: AccountBalance[];
    };
    total: string;
  };
  liabilities: {
    current: {
      total: string;
      accounts: AccountBalance[];
    };
    non_current: {
      total: string;
      accounts: AccountBalance[];
    };
    total: string;
  };
  equity: {
    /** Total equity including current-period net profit (before closing entries) */
    total: string;
    /** Sum of equity accounts only, excluding net profit */
    equity_accounts_total?: string;
    /** Current period net profit/loss (positive = profit, negative = loss) */
    net_profit_for_period?: string;
    accounts: AccountBalance[];
  };
  total_liabilities_equity: string;
  is_balanced: boolean;
  comparative?: {
    as_of_date: string;
    assets: { total: string };
    liabilities: { total: string };
    equity: { total: string };
    variance: {
      assets: string;
      liabilities: string;
      equity: string;
    };
  };
}

export interface BalanceSheetParams {
  as_of_date?: string;
  detail_level?: 'summary' | 'detailed' | 'all';
  comparative_date?: string;
  export_format?: 'json' | 'pdf' | 'excel';
}

// Monthly Profit & Loss (spreadsheet-style, month columns) — the format the
// client's prior system used, as opposed to ProfitLossData's single-period
// account tree. Rows are grouped under their parent account (e.g. "Interest
// Income" holding Daily/Weekly/Monthly Loan Interest).
export interface MonthlyPLMonth {
  key: string; // e.g. '2026-01'
  label: string; // e.g. 'January'
}

export interface MonthlyPLAccountRow {
  id: number;
  code: string;
  name: string;
  months: Record<string, string>;
  total: string;
}

export interface MonthlyPLGroup {
  code: string;
  name: string;
  accounts: MonthlyPLAccountRow[];
  months: Record<string, string>;
  total: string;
}

export interface MonthlyPLSection {
  groups: MonthlyPLGroup[];
  months: Record<string, string>;
  total: string;
}

export interface MonthlyProfitLossData {
  year: number;
  months: MonthlyPLMonth[];
  income: MonthlyPLSection;
  expenses: MonthlyPLSection;
  net_profit: {
    months: Record<string, string>;
    total: string;
  };
}

export interface MonthlyProfitLossParams {
  year: number;
}

// Common response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Common filter types
export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  detailLevel?: 'summary' | 'detailed' | 'all';
  includeZeroBalances?: boolean;
  comparative?: boolean;
  comparativeDate?: string;
}

// Export types
export type ExportFormat = 'pdf' | 'excel';

// Report types
export type ReportType = 'trial-balance' | 'profit-loss' | 'balance-sheet';
