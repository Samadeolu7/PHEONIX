export interface Account {
  id: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  code: string;
  description?: string;
  balance: number;
  isActive: boolean;
  parentId?: string;
  account_level?: 'parent' | 'child';
  can_post_transactions?: boolean;
  is_category_account?: boolean;
  children_count?: number;
  total_children_balance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountChildSummary {
  parent_account: {
    id: number;
    code: string;
    name: string;
    account_type: string;
  };
  children: Account[];
  summary: {
    total_children: number;
    total_debit_balance: number;
    total_credit_balance: number;
    net_balance: number;
  };
}

export interface Product {
  id?: number;
  name: string;
  description?: string;
  daily_transaction_limit?: number | null;
  minimum_balance?: number | null;
  monthly_transaction_limit?: number | null;
  overdraft_limit?: number | null;
  interest_rate?: number | null;
  allow_overdraft?: boolean;
  is_recurring?: boolean;
  term_months?: number | null;
  repayment_frequency?: string;
  income_category?: string;
}
