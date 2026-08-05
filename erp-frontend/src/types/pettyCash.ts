// Petty Cash Types
export interface PettyCashFund {
  id: number;
  fund_name: string;
  fund_code: string;
  custodian: number;
  custodian_name: string;
  alternate_custodian: number | null;
  alternate_custodian_name: string | null;
  petty_cash_account: number;
  petty_cash_account_name: string;
  petty_cash_account_code: string;
  float_amount: string;
  current_balance: string;
  replenishment_threshold: string;
  single_transaction_limit: string;
  status: 'active' | 'suspended' | 'closed';
  established_date: string;
  last_replenishment_date: string | null;
  last_audit_date: string | null;
  needs_replenishment: boolean;
  disbursed_amount: string;
  pending_vouchers_count: number;
  /** The CashierAccount wrapping this fund's GL account, if one has been set up (see link_cashier_account). */
  cashier_account: {
    id: number;
    account_number: string;
    name: string;
    current_balance: string;
    cashier_name: string | null;
  } | null;
  branch: number;
  branch_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PettyCashVoucherLine {
  id: number;
  expense_category: number;
  expense_category_name: string | null;
  description: string;
  amount: string;
  line_order: number;
}

export interface PettyCashVoucher {
  id: number;
  fund: number;
  fund_name: string;
  voucher_number: string;
  voucher_date: string;
  requested_by: number;
  requested_by_name: string;
  purpose: string;
  amount: string;
  expense_category: number | null;
  expense_category_name: string | null;
  lines: PettyCashVoucherLine[];
  payee_name: string;
  payee_phone: string;
  status:
    | 'draft'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'disbursed'
    | 'retired'
    | 'reversal_pending'
    | 'cancelled';
  submitted_at: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string;
  disbursed_at: string | null;
  disbursed_by: number | null;
  disbursed_by_name: string | null;
  actual_amount_disbursed: string | null;
  receipt_submitted: boolean;
  receipt_amount: string | null;
  receipt_date: string | null;
  receipt_reference: string;
  receipt_attachment: string | null;
  retired_at: string | null;
  retired_by: number | null;
  retired_by_name: string | null;
  variance: string;
  variance_explanation: string;
  replenishment: number | null;
  replenishment_number: string | null;
  reversal_requested_by: number | null;
  reversal_requested_by_name: string | null;
  reversal_requested_at: string | null;
  reversed_at: string | null;
  reversed_by: number | null;
  reversed_by_name: string | null;
  reversal_reason: string;
  reversal_rejected_by: number | null;
  reversal_rejected_by_name: string | null;
  reversal_rejected_at: string | null;
  reversal_rejection_reason: string;
  branch: number;
  branch_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PettyCashReplenishment {
  id: number;
  fund: number;
  fund_name: string;
  replenishment_number: string;
  replenishment_date: string;
  period_start: string;
  period_end: string;
  total_vouchers_amount: string;
  total_receipts_amount: string;
  total_variance: string;
  replenishment_amount: string;
  requested_amount: string | null;
  approved_amount: string | null;
  fund_balance_before: string;
  fund_balance_after: string | null;
  replenishment_source: number;
  replenishment_source_name: string;
  replenishment_source_code: string;
  bank_account: number | null;
  bank_account_number: string | null;
  bank_account_name_display: string | null;
  bank_name: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'posted';
  submitted_by: number;
  submitted_by_name: string;
  submitted_at: string | null;
  verified_by: number | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verification_notes: string;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string;
  posted_at: string | null;
  posted_by: number | null;
  posted_by_name: string | null;
  journal_entry: number | null;
  expense_breakdown: Record<string, { amount: number; vouchers: string[] }>;
  vouchers: number[];
  vouchers_count: number;
  branch: number;
  branch_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

// Create/Update Types
export interface CreatePettyCashFund {
  fund_name: string;
  fund_code: string;
  custodian: number;
  alternate_custodian?: number | null;
  petty_cash_account: number;
  float_amount: string | number;
  replenishment_threshold: string | number;
  single_transaction_limit: string | number;
  status?: 'active' | 'suspended' | 'closed';
  established_date?: string;
  notes?: string;
}

export interface CreatePettyCashVoucherLine {
  expense_category: number;
  description: string;
  amount: string | number;
  line_order?: number;
}

export interface CreatePettyCashVoucher {
  fund: number;
  purpose: string;
  // Either send line-item splits (preferred — each posts to its own GL
  // account on disbursement) or fall back to a single amount/category.
  lines?: CreatePettyCashVoucherLine[];
  amount?: string | number;
  expense_category?: number | null;
  payee_name: string;
  payee_phone?: string;
  voucher_date?: string;
  notes?: string;
}

export interface CreatePettyCashReplenishment {
  fund: number;
  voucher_ids: number[];
  bank_account?: number | null;
  replenishment_date?: string;
  notes?: string;
  // Custodian's explicit requested amount (defaults to auto-calculated sum of vouchers)
  requested_amount?: string | number;
  // Auto-computed by backend from voucher_ids; only needed for legacy edits
  period_start?: string;
  period_end?: string;
  replenishment_amount?: string | number;
  replenishment_source?: number;
}

// Filter Types
export interface PettyCashFundFilters {
  status?: string;
  custodian?: number;
  needs_replenishment?: boolean;
}

export interface PettyCashVoucherFilters {
  fund?: number;
  status?: string;
  requested_by?: number;
  pending_approval?: boolean;
  awaiting_disbursement?: boolean;
  awaiting_retirement?: boolean;
}

export interface PettyCashReplenishmentFilters {
  fund?: number;
  status?: string;
}

// Action Types
export interface VoucherActionData {
  notes?: string;
  reason?: string;
  amount?: string | number;
  receipt_amount?: string | number;
  receipt_date?: string;
  receipt_reference?: string;
  variance_explanation?: string;
}

export interface ReplenishmentActionData {
  notes?: string;
  reason?: string;
  approved_amount?: string | number;
}

// Summary Type
export interface PettyCashFundSummary {
  fund: PettyCashFund;
  statistics: {
    total_vouchers: number;
    pending_vouchers: number;
    approved_vouchers: number;
    disbursed_vouchers: number;
    retired_vouchers: number;
    total_disbursed: string;
    needs_replenishment: boolean;
  };
}

export interface PettyCashReceipt {
  id: number;
  voucher: number;
  file: string;
  file_name: string;
  file_size: number;
  file_type: string;
  description: string;
  uploaded_by: number;
  uploaded_by_name: string;
  uploaded_at: string;
  file_url: string;
}
