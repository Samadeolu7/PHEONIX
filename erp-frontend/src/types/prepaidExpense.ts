// Prepaid Expense Types
export interface PrepaidExpense {
  id: number;
  reference_number: string;
  category: number;
  category_name: string;
  purchase_date?: string;
  description: string;
  total_amount: string;
  consumed_amount: string;
  remaining_amount: string;
  measurable?: boolean;
  unit_of_measure?: string;
  total_units?: string;
  consumed_units?: string;
  remaining_units: string;
  unit_cost?: string;
  supplier?: number;
  supplier_name?: string;
  supplier_name_display?: string;
  supplier_invoice?: string;
  accounts_payable_id?: number | null;
  status: 'active' | 'partially_consumed' | 'fully_consumed' | 'expired';
  is_posted: boolean;
  posted_at: string | null;
  branch: number | null;
  owner: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePrepaidExpense {
  category: number;
  purchase_date?: string;
  description: string;
  total_amount: string;
  measurable?: boolean;
  unit_of_measure?: string;
  total_units?: string;
  consumed_units?: string;
  unit_cost?: string;
  supplier?: number;
  supplier_name?: string;
  supplier_invoice?: string;
}

export interface UpdatePrepaidExpense {
  category?: number;
  purchase_date?: string;
  description?: string;
  total_amount?: string;
  measurable?: boolean;
  unit_of_measure?: string;
  total_units?: string;
  consumed_units?: string;
  unit_cost?: string;
  supplier?: number;
  supplier_name?: string;
  supplier_invoice?: string;
}

export interface PrepaidExpenseListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PrepaidExpense[];
}

export interface PrepaidExpenseFilters {
  search?: string;
  category?: number;
  status?: 'active' | 'partially_consumed' | 'fully_consumed' | 'expired';
  is_posted?: boolean;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface AmortizePrepaidExpense {
  // Amortization specific fields
  amount: string;
  period_end_date: string;
  notes?: string;
}

// Full expense data for amortization API (as per API documentation)
export interface AmortizePrepaidExpensePayload {
  category: number;
  purchase_date?: string;
  description: string;
  total_amount: string;
  measurable?: boolean;
  unit_of_measure?: string;
  total_units?: string;
  consumed_units?: string;
  unit_cost?: string;
  supplier_name?: string;
  supplier_invoice?: string;
  // Amortization fields
  amount: string;
  period_end_date: string;
  notes?: string;
}

export interface PostToAccountsResponse {
  success: boolean;
  message: string;
  journal_entry_id: number;
  accounts_payable_id: number;
  amount: string;
  supplier: string;
}

export interface ValidationError {
  [key: string]: string[];
}
