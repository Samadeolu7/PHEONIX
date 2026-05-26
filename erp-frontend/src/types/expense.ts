// types/expense.ts
// Types for general Expense model (direct cash / postpaid expenses)

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type ExpenseType = 'procurement' | 'direct_cash' | 'reimbursement';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'card';
export type PayeeType = 'supplier' | 'employee' | 'other';

export interface Expense {
  id: number;
  reference_number: string;
  category: number;
  category_name: string;
  expense_date: string;
  description: string;
  amount: string;
  subtotal: string;
  tax_amount_field: string;
  total_amount: string;
  payee_name: string;
  payee_type: PayeeType;
  payment_method: PaymentMethod;
  payment_reference: string;
  // Bank account link (required for bank_transfer / cheque / card payments)
  bank_account: number | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  expense_type: ExpenseType;
  status: ExpenseStatus;
  requires_approval: boolean;
  approved: boolean;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  is_posted: boolean;
  posted_at: string | null;
  receipt_file: string | null;
  origin_reference: string;
  parent_reference: string;
  branch: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpense {
  category: number;
  expense_date: string;
  description: string;
  amount: string | number;
  payee_name?: string;
  payee_type?: PayeeType;
  payment_method?: PaymentMethod;
  payment_reference?: string;
  bank_account?: number | null;
  expense_type?: ExpenseType;
  status?: ExpenseStatus;
}

export interface ExpenseFilters {
  status?: ExpenseStatus;
  category?: number;
  expense_type?: ExpenseType;
  payment_method?: PaymentMethod;
  approved?: boolean;
  is_posted?: boolean;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface ExpenseListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Expense[];
}
