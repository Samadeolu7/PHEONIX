/**
 * Bank Management Type Definitions
 * Handles banks, bank accounts, and transfers (cashier→bank, bank→bank)
 */

// Matches banks/reconciliation_utils.py's MIN_REASON_LENGTH — the server is
// the source of truth (this is a UX pre-check, not the real validation), so
// keep both in sync if the threshold ever changes.
export const MIN_REASON_LENGTH = 10;

// Matches banks/reconciliation_utils.py's FEE_LINK_MAX_AMOUNT — the largest
// bank_only/erp_only amount difference LinkResolveBankChargeView will treat
// as a bank-deducted transfer fee rather than reject. UX pre-check only;
// the server enforces this independently.
export const FEE_LINK_MAX_AMOUNT = 75;

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
  // director/admin for bank-to-bank, destination cashier OR a director for
  // cashier-to-cashier, destination account manager OR a director for
  // cashier-to-bank. Always false for the transfer's own initiator —
  // maker-checker).
  can_approve?: boolean;
  // Server-computed: can the current user perform the second approval on this
  // transfer right now (mirrors BankTransferViewSet.second_approve() exactly,
  // including the maker-checker exclusion above). Cashier-destined transfers
  // are single-approval only, so this is always false for them.
  can_second_approve?: boolean;
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
  journal_entry_reference?: string | null;
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
  // The bank's own statement reference (ReconciliationBankTransaction.bank_ref)
  // — distinct from bank_transaction_id (Java's internal UUID) and from
  // has_bank_reference (an ERP-narration accountability signal).
  bank_reference: string | null;
  bank_amount: string | null;
  bank_narration: string;
  bank_date: string | null;
  // ERP side (null for 'bank_only')
  loan_payment_id: number | null;
  erp_amount: string | null;
  erp_narration: string;
  erp_date: string | null;
  // Accountability — who actually recorded the ERP-side transaction (null
  // for bank_only, since there's no ERP record to attribute)
  officer: number | null;
  officer_name: string | null;
  erp_branch: number | null;
  erp_branch_name: string | null;
  // A bank_only exception (bank has cash the ERP doesn't know about) is the
  // single most likely "cash collected but not recorded" signature
  is_high_priority: boolean;
  // Whether the officer-entered bank reference is even present — "no
  // reference was entered" vs "reference entered but genuinely no match"
  has_bank_reference: boolean;
  // True only when bank_amount and erp_amount are both present and identical
  // — the one case a branch manager may resolve without a director.
  is_perfect_match: boolean;
  // True whenever is_perfect_match is false — i.e. an amount mismatch or a
  // bank_only/erp_only exception with no counterpart amount at all. Director
  // sign-off (and mandatory resolution_notes) required. See
  // ResolveExceptionView.patch (banks/views.py) for the authoritative gate.
  requires_director: boolean;
  // Set once a branch manager/director posts this bank_only DEBIT exception
  // to expense — see ResolveExceptionToExpenseView. Null until then. The
  // exception resolves automatically once the payment is approved+posted
  // and a later rerun matches it — this field does not mean "resolved".
  pending_bank_payment: number | null;
  pending_bank_payment_info: {
    id: number;
    payment_number: string;
    status: string;
  } | null;
  // Set once a director manually nets this bank_only exception against a
  // bank_only exception of the opposite direction on the same bank account
  // (compensating transfer scenario) — see LinkResolveExceptionsView.
  netted_with: number | null;
  netted_with_info: {
    id: number;
    exception_type: 'bank_only' | 'erp_only' | 'amount_diff';
    direction: 'CREDIT' | 'DEBIT';
    bank_amount: string | null;
    bank_narration: string;
  } | null;
  // Resolution — director required unless is_perfect_match (see ResolveExceptionView)
  resolved: boolean;
  resolved_by: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_notes: string;
  // True when resolve_amount is at/above RECONCILIATION_EXCEPTION_DUAL_APPROVAL_THRESHOLD
  // (excludes perfect matches — see ReconciliationException.requires_dual_approval_to_resolve).
  // A single director's resolve() call only records the first action when
  // this is true; resolved stays false until a second, different director
  // confirms via the /resolve/second/ endpoint.
  requires_dual_approval_to_resolve: boolean;
  // True once the first director has acted but resolved is still false and
  // a second director's confirmation is outstanding.
  awaiting_second_resolution: boolean;
  second_resolved_by: number | null;
  second_resolved_by_name: string | null;
  second_resolved_at: string | null;
  second_resolution_notes: string;
  // Set when a director reopens a standalone-resolved exception (the plain
  // per-row Resolve action used before it was properly paired against its
  // real counterpart) — see UnresolveExceptionView. resolved_by/resolved_at/
  // resolution_notes above are left untouched as history of the original
  // (now-reversed) resolution.
  unresolved_by: number | null;
  unresolved_by_name: string | null;
  unresolved_at: string | null;
  unresolved_reason: string;
  created_at: string;
}

export interface ResolveExceptionToExpenseRequest {
  category: number;
  payee_name?: string;
  description?: string;
}

export interface UnresolveExceptionRequest {
  reason: string;
}

export interface LinkResolveExceptionsRequest {
  exception_a_id: number;
  exception_b_id: number;
  resolution_notes: string;
}

export interface LinkResolveBankChargeRequest {
  bank_only_exception_id: number;
  erp_only_exception_id: number;
  resolution_notes: string;
}

export interface LinkResolveBankChargeResponse {
  bank_only_exception: ReconciliationException;
  erp_only_exception: ReconciliationException;
  fee_amount: string;
  payment_id: number;
}

export interface BulkLinkResolveBankChargeRequest {
  bank_account_id: number;
  resolution_notes?: string;
  dry_run?: boolean;
}

interface BulkLinkResolveBankChargePairResult {
  bank_only_exception_id: number;
  erp_only_exception_id: number;
  fee_amount: string;
}

export interface BulkLinkResolveBankChargePreview {
  would_resolve_count: number;
  would_resolve: BulkLinkResolveBankChargePairResult[];
  total_fee_amount: string;
  ambiguous_count: number;
  ambiguous_bank_only_exception_ids: number[];
  unmatched_count: number;
  unmatched_bank_only_exception_ids: number[];
}

export interface BulkLinkResolveBankChargeResult {
  resolved_count: number;
  resolved: (BulkLinkResolveBankChargePairResult & { payment_id: number })[];
  total_fee_amount: string;
  failed_count: number;
  failed: { bank_only_exception_id: number; erp_only_exception_id: number; detail: string }[];
  ambiguous_count: number;
  ambiguous_bank_only_exception_ids: number[];
  unmatched_count: number;
  unmatched_bank_only_exception_ids: number[];
}

export interface BulkCleanUpStrandedPairsRequest {
  resolution_notes?: string;
  dry_run?: boolean;
}

interface BulkCleanUpStrandedPairResult {
  resolved_exception_id: number;
  unresolved_exception_id: number;
  fee_amount: string | null;
}

export interface StrandedExceptionCandidate {
  id: number;
  exception_type: 'bank_only' | 'erp_only' | 'amount_diff';
  direction: 'CREDIT' | 'DEBIT';
  amount: string | null;
  narration: string;
  date: string | null;
  fee_amount: string | null;
}

export interface AmbiguousStrandedException extends StrandedExceptionCandidate {
  resolved_exception_id: number;
  candidates: StrandedExceptionCandidate[];
}

export interface BulkCleanUpStrandedPairsPreview {
  would_clean_up_count: number;
  would_clean_up: BulkCleanUpStrandedPairResult[];
  ambiguous_count: number;
  ambiguous_exception_ids: number[];
  ambiguous: AmbiguousStrandedException[];
}

export interface BulkCleanUpStrandedPairsResult {
  cleaned_up_count: number;
  cleaned_up: (BulkCleanUpStrandedPairResult & { payment_id: number | null })[];
  failed_count: number;
  failed: { resolved_exception_id: number; unresolved_exception_id: number; detail: string }[];
  ambiguous_count: number;
  ambiguous_exception_ids: number[];
  ambiguous: AmbiguousStrandedException[];
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
  branch?: number | null;
  branch_name?: string | null;
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
  // Whether this run also matched debit transactions (withdrawals,
  // disbursements, bank charges) — off by default. Preserve this when
  // re-running matching, or a debit-enabled recon silently reverts to
  // credit-only (see ReconciliationDetailPage's rerun handler).
  include_debits: boolean;
  error_detail?: string;
  // Incremented each time matching is re-triggered for a reconciliation
  // that already existed — a day is never really "closed."
  rerun_count: number;
  exceptions?: ReconciliationException[];
  created_at: string;
  updated_at?: string;
}

export interface UploadReconciliationRequest {
  bank_account_id: number;
  statement_file: File;
  include_debits?: boolean;
}

export interface UploadReconciliationResponse {
  reconciliations: DailyReconciliation[];
  reconciliations_rerun: DailyReconciliation[];
  skipped_dates: string[];
}

export interface RerunReconciliationRequest {
  include_debits?: boolean;
}

export interface ReconciliationFilters {
  bank_account?: number;
  status?: 'processing' | 'completed' | 'failed';
  branch?: number;
}

export interface ResolveExceptionRequest {
  resolution_notes: string;
}

export interface SecondResolveExceptionRequest {
  resolution_notes: string;
}

/**
 * One bank-statement line ingested for a reconciliation, matched or not.
 * Previously the only visibility into a reconciliation was its exceptions
 * list — a cleanly-matched transfer (the common case) was invisible
 * anywhere in the product. See MatchedTransactionsView (banks/views.py).
 */
export interface ReconciliationBankTransaction {
  id: string;
  bank_ref: string;
  value_date: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  narration: string;
  balance_after: string | null;
  matched: boolean;
  match_confidence: string;
  matched_erp_payment_id: number | null;
  matched_at: string | null;
  matched_erp_officer_name: string | null;
  matched_erp_had_reference: boolean | null;
  posting_lag_days: number | null;
  // Set when a director manually undid an incorrect auto-match. The
  // matched_* fields above are deliberately preserved (not cleared) as a
  // historical record of what this line was wrongly matched to.
  unmatched_by_name: string | null;
  unmatched_at: string | null;
  unmatched_reason: string;
  // ERP-side transaction description/date, resolved server-side from
  // matched_erp_payment_id — null for unmatched lines.
  erp_narration: string | null;
  erp_date: string | null;
}

export interface UnmatchTransactionRequest {
  reason: string;
}

export interface ReconciliationTransactionsResponse {
  results: ReconciliationBankTransaction[];
  matched_count: number;
  unmatched_count: number;
}

/**
 * One row of the Officer Reconciliation Risk report — accountability
 * signals aggregated across ALL of an officer's reconciliation activity
 * (matched transactions + erp_only exceptions, regardless of whether the
 * latter have since been resolved), not just outstanding cases.
 */
export interface OfficerReconciliationRiskRow {
  officer_id: number;
  officer_name: string;
  branch_name: string | null;
  matched_count: number;
  erp_only_count: number;
  unresolved_erp_only_count: number;
  high_priority_count: number;
  total_considered: number;
  match_rate: number | null;
  reference_compliance_rate: number | null;
  avg_posting_lag_days: number | null;
  late_posting_count: number;
}

export interface OfficerReconciliationRiskFilters {
  date_from?: string;
  date_to?: string;
}

/**
 * One event in the Manual Overrides report — audit trail for the three
 * most abuse-prone manual pathways (unmatch, netting, resolve-to-expense).
 * See ManualOverridesReportView (banks/views.py).
 */
export interface ManualOverrideEvent {
  type: 'unmatch' | 'netted' | 'resolve_to_expense';
  action_at: string;
  actor_id: number | null;
  actor_name: string | null;
  reason: string | null;
  amount: string | null;
  direction: 'CREDIT' | 'DEBIT';
  narration: string;
  bank_account_id: number;
  bank_account_name: string | null;
  reference_id: string | number;
  // 'netted' only
  netted_with_id?: number;
  // 'resolve_to_expense' only
  payment_number?: string;
  payment_status?: string;
  exception_resolved?: boolean;
}

export interface ManualOverridesReportResponse {
  results: ManualOverrideEvent[];
  count: number;
}

export interface ManualOverridesReportFilters {
  date_from?: string;
  date_to?: string;
}

/**
 * A single bank_only/erp_only totals bucket in the Missing Money Summary
 * report. See MissingMoneySummaryView (banks/views.py).
 */
export interface MissingMoneyTotal {
  count: number;
  amount: string;
}

export interface MissingMoneyOfficerRow {
  officer_id: number | null; // null = unattributed
  officer_name: string;
  branch_name: string | null;
  count: number;
  amount: string;
}

export interface MissingMoneyBankAccountRow {
  bank_account_id: number;
  bank_account_name: string | null;
  count: number;
  amount: string;
}

export interface MissingMoneySummary {
  totals: {
    erp_only: MissingMoneyTotal;
    bank_only: MissingMoneyTotal;
    grand_total_amount: string;
  };
  by_officer: MissingMoneyOfficerRow[];
  by_bank_account: MissingMoneyBankAccountRow[];
}

export interface MissingMoneySummaryFilters {
  date_from?: string;
  date_to?: string;
}
