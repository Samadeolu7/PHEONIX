export interface ExpenseCategory {
  id: number;
  name: string;
  code: string;
  description?: string;
  expense_account: number;
  expense_account_name: string;
  prepaid_account?: number | null;
  prepaid_account_name?: string;
  product?: number | null;
  requires_approval: boolean;
  approval_threshold?: string;
  budget_amount?: string | null;
  budget_period?: 'monthly' | 'quarterly' | 'yearly';
  branch?: number | null;
  owner?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseCategory {
  name: string;
  code: string;
  description?: string;
  expense_account: number;
  prepaid_account?: number | null;
  product?: number | null;
  requires_approval: boolean;
  approval_threshold?: string;
  budget_amount?: string | null;
  budget_period?: 'monthly' | 'quarterly' | 'yearly';
}

export interface UpdateExpenseCategory {
  name?: string;
  code?: string;
  description?: string;
  expense_account?: number;
  prepaid_account?: number | null;
  product?: number | null;
  requires_approval?: boolean;
  approval_threshold?: string;
  budget_amount?: string | null;
  budget_period?: 'monthly' | 'quarterly' | 'yearly';
}

export interface ExpenseCategoryListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: ExpenseCategory[];
}

export interface ExpenseCategoryFilters {
  search?: string;
  requires_approval?: boolean;
  expense_account?: number;
  prepaid_account?: number;
  page?: number;
  page_size?: number;
}
