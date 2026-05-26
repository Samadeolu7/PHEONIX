/**
 * Treasury Management Type Definitions
 * Handles cash collections, reconciliations, transfers, and bank reconciliations
 */

/**
 * Cashier Account - Virtual cash account for users collecting cash
 *
 * Links: User (cashier) → Child Account (ASSET) → Parent Account (Cash/Bank)
 * This enables balanced double-entry transactions.
 */
export interface CashierAccount {
  id: number;
  account_number: string;
  name: string;
  cashier: number;
  cashier_name?: string;
  account: number;
  account_name?: string;
  account_code?: string;
  parent_account_name?: string;
  parent_account_code?: string;
  current_balance: string;
  daily_collection_limit?: string;
  requires_dual_approval: boolean;
  is_active: boolean;
  is_suspended: boolean;
  last_reconciled_at?: string;
  last_reconciled_by?: number;
  branch: number;
  branch_name?: string;
  needs_reconciliation?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a cashier account
 */
export interface CreateCashierAccountRequest {
  account_number: string;
  name: string;
  cashier: number;
  account: number;
  daily_collection_limit?: string;
  requires_dual_approval?: boolean;
  is_active?: boolean;
}

/**
 * Cash Collection - Individual cash receipt from client
 * Step 1 of Cash Process
 *
 * The income account is automatically derived from the receivable (invoice/entitlement/loan) being paid.
 * Double-entry accounting: Debit Cashier Account (ASSET), Credit Income Account (INCOME)
 */
export interface CashCollection {
  id: number;
  receipt_number: string;
  cashier_account: number;
  cashier_name?: string;
  client?: number;
  client_name?: string;
  receivable?: number;
  receivable_reference?: string;
  income_account_name?: string;
  collection_date: string;
  amount_due: string;
  amount_collected: string;
  variance: string;
  variance_action: 'none' | 'savings' | 'debt' | 'waive' | 'refund';
  payment_purpose: string;
  reference_number?: string;
  collection_mode: 'cash' | 'mobile_money' | 'bank_deposit' | 'cheque';
  is_posted: boolean;
  posted_at?: string;
  posted_by?: number;
  posted_by_name?: string;
  journal_entry?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a cash collection
 * The income account is automatically derived from the receivable (invoice/entitlement/loan)
 */
export interface CreateCashCollectionRequest {
  cashier_account: number;
  client?: number;
  receivable: number; // Required: Reference to the invoice/entitlement/loan being paid
  collection_date?: string;
  amount_due: string;
  amount_collected: string;
  variance_action?: 'none' | 'savings' | 'debt' | 'waive' | 'refund';
  payment_purpose: string;
  reference_number?: string;
  collection_mode?: 'cash' | 'mobile_money' | 'bank_deposit' | 'cheque';
  notes?: string;
}

/**
 * Cash Transfer - Transfer from cashier to main bank
 * Step 2 of Cash Process
 */
export interface CashTransfer {
  id: number;
  transfer_number: string;
  cashier_account: number;
  cashier_name?: string;
  destination_account: number;
  destination_account_name?: string;
  transfer_date: string;
  amount: string;
  bank_deposit_slip?: string;
  bank_reference?: string;
  deposit_proof?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'posted';
  submitted_at?: string;
  submitted_by?: number;
  approved_at?: string;
  approved_by?: number;
  approval_notes?: string;
  second_approved_at?: string;
  second_approved_by?: number;
  rejected_at?: string;
  rejected_by?: number;
  rejection_reason?: string;
  posted_at?: string;
  posted_by?: number;
  journal_entry?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a cash transfer
 */
export interface CreateCashTransferRequest {
  cashier_account: number;
  destination_account: number;
  transfer_date?: string;
  amount: string;
  bank_deposit_slip?: string;
  bank_reference?: string;
  deposit_proof?: File;
}

/**
 * Cash Reconciliation - Daily reconciliation of cashier account
 * Step 3 of Cash Process
 */
export interface CashReconciliation {
  id: number;
  cashier_account: number;
  cashier_name?: string;
  reconciliation_date: string;
  system_balance: string;
  physical_count: string;
  variance: string;
  denomination_details?: {
    [key: string]: number; // e.g., "1000": 5, "500": 10
  };
  total_collections: string;
  total_transfers: string;
  status: 'balanced' | 'variance' | 'resolved';
  variance_explanation?: string;
  reconciled_by?: number;
  reconciled_by_name?: string;
  finance_officer_signoff?: number;
  finance_officer_signoff_name?: string;
  finance_officer_signoff_at?: string;
  finance_officer_notes?: string;
  deposit_required: boolean;
  deposit_completed: boolean;
  deposit_slip_number?: string;
  deposit_timestamp?: string;
  journal_entry?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create cash reconciliation
 */
export interface CreateCashReconciliationRequest {
  cashier_account: number;
  reconciliation_date?: string;
  physical_count: string;
  denomination_details?: {
    [key: string]: number;
  };
  variance_explanation?: string;
  deposit_slip_number?: string;
}

/**
 * Request for finance officer sign-off
 */
export interface FinanceOfficerSignoffRequest {
  finance_officer_notes?: string;
}

/**
 * Bank Reconciliation - Monthly reconciliation of bank account
 * Step 4 of Cash Process
 */
export interface BankReconciliation {
  id: number;
  bank_account: number;
  bank_account_name?: string;
  reconciliation_period_start: string;
  reconciliation_period_end: string;
  reconciliation_date: string;
  bank_opening_balance: string;
  gl_opening_balance: string;
  bank_closing_balance: string;
  gl_closing_balance: string;
  deposits_in_transit: string;
  outstanding_checks: string;
  bank_charges: string;
  bank_interest: string;
  bank_errors: string;
  gl_errors: string;
  reconciled_balance: string;
  variance: string;
  status: 'draft' | 'in_progress' | 'completed' | 'approved';
  prepared_by?: number;
  prepared_by_name?: string;
  reviewed_by?: number;
  reviewed_by_name?: string;
  reviewed_at?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create bank reconciliation
 */
export interface CreateBankReconciliationRequest {
  bank_account: number;
  reconciliation_period_start: string;
  reconciliation_period_end: string;
  bank_opening_balance: string;
  gl_opening_balance: string;
  bank_closing_balance: string;
  gl_closing_balance: string;
  deposits_in_transit?: string;
  outstanding_checks?: string;
  bank_charges?: string;
  bank_interest?: string;
  bank_errors?: string;
  gl_errors?: string;
  notes?: string;
}

/**
 * Treasury Summary Statistics
 */
export interface TreasurySummary {
  total_collections_today: string;
  total_transfers_today: string;
  pending_reconciliations: number;
  pending_transfers: number;
  undeposited_cash: string;
  active_cashiers: number;
  collections_requiring_approval: number;
}

/**
 * Cashier Summary
 */
export interface CashierSummary {
  cashier_account: number;
  cashier_name: string;
  current_balance: string;
  collections_today: number;
  collections_amount_today: string;
  last_reconciled: string | null;
  needs_reconciliation: boolean;
}

/**
 * Filter options for cash collections
 */
export interface CashCollectionFilters {
  cashier_account?: number;
  client?: number;
  collection_date_from?: string;
  collection_date_to?: string;
  collection_mode?: string;
  is_posted?: boolean;
  search?: string;
}

/**
 * Filter options for cash reconciliations
 */
export interface CashReconciliationFilters {
  cashier_account?: number;
  reconciliation_date_from?: string;
  reconciliation_date_to?: string;
  status?: string;
  needs_finance_signoff?: boolean;
}

/**
 * Filter options for bank reconciliations
 */
export interface BankReconciliationFilters {
  bank_account?: number;
  period_from?: string;
  period_to?: string;
  status?: string;
}

/**
 * Denomination breakdown for cash counting
 */
export interface DenominationBreakdown {
  denomination: string;
  count: number;
  total: number;
}

/**
 * API Response wrapper
 */
export interface TreasuryApiResponse<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}
