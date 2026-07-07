/**
 * Bank Management Type Definitions
 * Handles banks, bank accounts, and transfers (cashier→bank, bank→bank)
 */

/**
 * Bank - Physical banking institution
 */
export interface Bank {
  id: number;
  bank_name: string;
  bank_code: string;
  branch_name: string;
  address: string;
  phone: string;
  email: string;
  account_manager_name: string;
  account_manager_phone: string;
  account_manager_email: string;
  is_active: boolean;
  notes: string;
  branch: number;
  branch_name?: string;
  // Computed fields
  accounts_count?: number;
  total_balance?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBankRequest {
  bank_name: string;
  bank_code?: string;
  branch_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  account_manager_name?: string;
  account_manager_phone?: string;
  account_manager_email?: string;
  is_active?: boolean;
  notes?: string;
}

/**
 * BankAccount - Organization's account at a bank
 */
export interface BankAccount {
  id: number;
  bank: number;
  bank_name?: string;
  bank_details?: Bank;
  account_number: string;
  account_name: string;
  account_type: 'savings' | 'current' | 'fixed_deposit' | 'domiciliary';
  currency: string;
  gl_account: number;
  gl_account_name?: string;
  gl_account_code?: string;
  account_manager: number;
  account_manager_name?: string;
  current_balance: string;
  daily_withdrawal_limit?: string;
  monthly_transaction_limit?: string;
  requires_dual_approval: boolean;
  dual_approval_threshold?: string;
  is_active: boolean;
  is_suspended: boolean;
  is_cashier_collection_account: boolean;
  iban: string;
  swift_code: string;
  date_opened?: string;
  notes: string;
  branch: number;
  branch_name?: string;
  // Computed fields
  available_balance?: string;
  pending_transfers_count?: number;
  recent_transactions?: any[];
  created_at: string;
  updated_at: string;
}

export interface CreateBankAccountRequest {
  bank: number;
  account_number: string;
  account_name: string;
  account_type?: 'savings' | 'current' | 'fixed_deposit' | 'domiciliary';
  currency?: string;
  gl_account: number;
  account_manager: number;
  daily_withdrawal_limit?: string;
  monthly_transaction_limit?: string;
  requires_dual_approval?: boolean;
  dual_approval_threshold?: string;
  is_active?: boolean;
  is_cashier_collection_account?: boolean;
  iban?: string;
  swift_code?: string;
  date_opened?: string;
  notes?: string;
}

/**
 * BankTransfer - Transfer between accounts (cashier→bank, bank→bank)
 * Replaces CashTransfer with more comprehensive functionality
 */
export interface BankTransfer {
  id: number;
  transfer_number: string;
  transfer_date: string;
  // Source
  source_type: 'cashier' | 'bank';
  source_cashier_account?: number;
  source_cashier_name?: string;
  source_bank_account?: number;
  source_bank_account_number?: string;
  source_display?: string;
  // Destination
  destination_type: 'cashier' | 'bank';
  destination_bank_account?: number;
  destination_bank_account_number?: string;
  destination_bank_name?: string;
  destination_cashier_account?: number;
  destination_cashier_name?: string;
  destination_display?: string;
  // Amount and details
  amount: string;
  description: string;
  reference_number: string;
  // Workflow
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  // Server-computed: can the current user approve this transfer right now
  // (mirrors BankTransferViewSet.approve()'s permission branches exactly —
  // director/admin for bank-to-bank, destination cashier for cashier-to-
  // cashier, destination account manager for cashier-to-bank).
  can_approve?: boolean;
  initiated_by: number;
  initiated_by_name?: string;
  initiated_at: string;
  // First approval
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  approval_notes?: string;
  // Second approval (dual approval)
  second_approved_by?: number;
  second_approved_by_name?: string;
  second_approved_at?: string;
  second_approval_notes?: string;
  // Rejection
  rejected_by?: number;
  rejected_by_name?: string;
  rejected_at?: string;
  rejection_reason?: string;
  // Completion
  completed_by?: number;
  completed_by_name?: string;
  completed_at?: string;
  // Journal entry
  journal_entry?: number;
  journal_entry_reference?: string;
  // Attachment
  attachment?: string;
  branch: number;
  branch_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBankTransferRequest {
  source_type: 'cashier' | 'bank';
  source_cashier_account?: number;
  source_bank_account?: number;
  destination_type: 'cashier' | 'bank';
  destination_bank_account?: number;
  destination_cashier_account?: number;
  transfer_date?: string;
  amount: string;
  description: string;
  reference_number?: string;
  attachment?: File;
}

export interface BankTransferActionRequest {
  action: 'submit' | 'approve' | 'second_approve' | 'reject';
  notes?: string;
  reason?: string;
}

/**
 * Bank Account Balance Log - Audit trail
 */
export interface BankAccountBalanceLog {
  id: number;
  bank_account: number;
  previous_balance: string;
  new_balance: string;
  change_amount: string;
  transaction_type: string;
  reference_number: string;
  changed_by?: number;
  changed_by_name?: string;
  created_at: string;
}

/**
 * Bank Account Summary
 */
export interface BankAccountSummary {
  account: BankAccount;
  current_balance: string;
  available_balance: string;
  pending_incoming: string;
  pending_outgoing: string;
  today_transactions: number;
  today_volume: string;
  week_transactions: number;
  week_volume: string;
  month_transactions: number;
  month_volume: string;
}

/**
 * Bank Summary
 */
export interface BankSummary {
  bank: Bank;
  total_accounts: number;
  active_accounts: number;
  total_balance: string;
  accounts: BankAccount[];
}

/**
 * Ledger Entry (for bank account ledgers)
 */
export interface LedgerEntry {
  id: number;
  date: string;
  reference_number: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  transaction_type: string;
}

/**
 * Transfer filters
 */
export interface TransferFilters {
  status?: string;
  source_type?: 'cashier' | 'bank';
  from_date?: string;
  to_date?: string;
  min_amount?: string;
  max_amount?: string;
  search?: string;
}

// ================= BANK PAYMENTS =================

export interface BankPayment {
  id: number;
  payment_number: string;
  payment_date: string;
  bank_account: number;
  bank_account_display?: string;
  amount: string;
  description: string;
  reference_number?: string;
  accounts_payable?: number | null;
  accounts_payable_reference?: string | null;
  accounts_payable_vendor?: string | null;
  expense?: number | null;
  expense_reference?: string | null;
  expense_description?: string | null;
  supplier?: number | null;
  supplier_name?: string | null;
  /** Amount of this advance that has already been applied to AP records */
  advance_applied?: string | null;
  /** Remaining unapplied balance (advance only) */
  advance_remaining?: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'posted' | 'failed';
  status_display?: string;
  posted_by?: number | null;
  posted_at?: string | null;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  rejection_reason?: string;
  journal_entry?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApplyAdvanceRequest {
  accounts_payable: number;
  amount: string;
  notes?: string;
  bypass_validation?: boolean;
}

export interface ApplyAdvanceResult {
  payment: BankPayment;
  application: {
    journal_entry_id: number;
    amount_applied: string;
    advance_remaining: string;
    ap_amount_due: string;
    ap_status: string;
  };
}

export interface CreateBankPaymentRequest {
  payment_date?: string;
  bank_account: number;
  amount: string;
  description: string;
  reference_number?: string;
  accounts_payable?: number;
  expense?: number;
  supplier?: number;
  posting_notes?: string;
  bypass_validation?: boolean;
}

export interface BankPaymentFilters {
  status?: string;
  bank_account?: number;
  payment_type?: 'payable' | 'expense' | 'on_account';
  date_from?: string;
  date_to?: string;
  search?: string;
}

// ── Bank Feed Consent (Open Banking — App 3 integration) ──────────────────────

export interface BankFeedConsent {
  id: number;
  client: number;
  client_name: string;
  bank_account: number | null;
  bank_account_display: string | null;
  institution_name: string;
  institution_id: string;
  consent_reference: string;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'error';
  granted_at: string | null;
  expires_at: string | null;
  last_sync_at: string | null;
  next_sync_at: string | null;
  sync_status: 'idle' | 'syncing' | 'success' | 'failed';
  last_sync_error: string | null;
  recorded_by: number;
  recorded_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFeedConsentRequest {
  client: number;
  bank_account?: number | null;
  institution_name: string;
  institution_id: string;
  consent_reference: string;
  granted_at?: string | null;
  expires_at?: string | null;
}

// ── Daily Reconciliation (Bank-Recon Java integration — auto-match) ──────────

export interface ReconciliationException {
  id: number;
  exception_type: 'bank_only' | 'erp_only' | 'amount_diff';
  direction: 'CREDIT' | 'DEBIT';
  // Bank side (null for 'erp_only')
  bank_transaction_id: string | null;
  bank_amount: string | null;
  bank_narration: string;
  bank_date: string | null;
  // ERP side (null for 'bank_only')
  loan_payment_id: number | null;
  erp_amount: string | null;
  erp_narration: string;
  erp_date: string | null;
  // Resolution
  resolved: boolean;
  resolved_by: number | null;
  resolved_at: string | null;
  resolution_notes: string;
  created_at: string;
}

export interface DailyReconciliation {
  id: number;
  bank_account: number;
  bank_account_info?: {
    id: number;
    account_number: string;
    account_name: string;
    bank_name: string;
  };
  reconciliation_date: string;
  uploaded_by: number;
  uploaded_by_name?: string;
  uploaded_at: string;
  statement_file?: string;
  status: 'processing' | 'completed' | 'failed';
  total_bank_transactions: number;
  matched_count: number;
  unmatched_bank_count: number;
  unmatched_erp_count: number;
  error_detail?: string;
  exceptions?: ReconciliationException[];
  created_at: string;
  updated_at?: string;
}

export interface UploadReconciliationRequest {
  bank_account_id: number;
  reconciliation_date: string;
  statement_file: File;
  include_debits?: boolean;
}

export interface ReconciliationFilters {
  bank_account?: number;
  status?: 'processing' | 'completed' | 'failed';
}

export interface ResolveExceptionRequest {
  resolution_notes: string;
}
