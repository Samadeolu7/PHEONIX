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
