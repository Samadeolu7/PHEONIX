/** Types for bank borrowings and the liquidity gate (backend treasury app; unrelated to the cash-management types in types/treasury.ts): bank borrowings + the per-branch liquidity gate. */

export type BorrowingStatus = 'draft' | 'active' | 'paid_off';

export interface BorrowingAllocation {
  id: number;
  branch: number;
  branch_name: string;
  amount: string;
  bank_account: number;
  bank_account_name: string;
  share: number;
}

export interface BorrowingContribution {
  id: number;
  branch: number;
  branch_name: string;
  principal_part: string;
  interest_part: string;
  amount: string;
  due_date: string;
  status: 'pending' | 'sent';
  sent_at: string | null;
  transfer: number | null;
}

export interface BorrowingInstalment {
  id: number;
  number: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  total_due: string;
  status: 'pending' | 'paid';
  paid_at: string | null;
  contributions: BorrowingContribution[];
}

export interface BorrowingSummary {
  id: number;
  lender_name: string;
  reference: string;
  principal: string;
  monthly_rate: string;
  tenor_months: number;
  first_due_date: string;
  status: BorrowingStatus;
  debit_branch: number;
  debit_branch_name: string;
  received_on: string | null;
  paid_instalments: number;
  next_due_date: string | null;
}

export interface Borrowing extends BorrowingSummary {
  debit_bank_account: number;
  debit_bank_account_name: string;
  contribution_lead_days: number;
  notes: string;
  allocations: BorrowingAllocation[];
  instalments: BorrowingInstalment[];
}

export interface BorrowingAllocationInput {
  branch: number;
  amount: string;
  bank_account: number;
}

export interface BorrowingInput {
  lender_name: string;
  reference?: string;
  principal: string;
  monthly_rate: string;
  tenor_months: number;
  first_due_date: string;
  debit_branch: number;
  debit_bank_account: number;
  contribution_lead_days?: number;
  notes?: string;
  allocations: BorrowingAllocationInput[];
}

export interface BorrowingPreviewContribution {
  branch_id: number;
  branch_name: string;
  principal_part: string;
  interest_part: string;
  amount: string;
  due_date: string;
}

export interface BorrowingPreviewInstalment {
  number: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  total_due: string;
  contributions: BorrowingPreviewContribution[];
}

export interface BorrowingPreview {
  allocation_total: string;
  allocation_matches_principal: boolean;
  total_repayment: string;
  total_interest: string;
  contribution_lead_days: number;
  instalments: BorrowingPreviewInstalment[];
}

// ── Liquidity ───────────────────────────────────────────────────────────────

export interface LiquidityObligation {
  type: string;
  description: string;
  amount: string;
  overdue: boolean;
  /** Approved loans only: days since approval. */
  age_days?: number | null;
}

export interface CashAccountLine {
  account_id: number;
  code: string;
  name: string;
  kind: 'bank' | 'till' | 'other';
  balance: string;
  reason?: string;
}

export interface LiquidityBreach {
  date: string;
  shortfall: string;
  obligations: LiquidityObligation[];
}

export interface LiquidityAssessment {
  ok: boolean;
  stage?: 'approval' | 'disbursement';
  loan_number?: string;
  branch_id?: number;
  branch_name: string;
  amount: string;
  available_today: string;
  shortfall_today?: string;
  earliest_available_date?: string | null;
  worst_shortfall?: string;
  breaches: LiquidityBreach[];
  cash_now?: string;
  collection_rate?: string;
  expected_inflows_total?: string;
  expected_scheduled_total?: string;
  expected_recovery_total?: string;
  arrears_outstanding?: string;
  recovery_rate?: string;
  committed_outflows_total?: string;
  lookahead_days: number;
  advice: string[];
  override?: {
    by: string | null;
    reason: string;
    at: string;
    available_then: string;
  };
}

export interface LiquidityCheck {
  stage: 'approval' | 'disbursement';
  is_director: boolean;
  assessment: LiquidityAssessment;
  override: { by: string | null; by_id: number | null; reason: string; at: string } | null;
}

/** 409 body returned by loan approve / disburse when the liquidity gate stops the action. */
export interface LiquidityGatePayload {
  code:
    | 'liquidity_blocked'
    | 'liquidity_override_required'
    | 'liquidity_director_required'
    | 'liquidity_same_director'
    | 'liquidity_ack_required';
  detail: string;
  assessment: LiquidityAssessment;
}

export interface ForecastDay {
  date: string;
  opening: string;
  inflow: string;
  outflow: string;
  closing: string;
  outflows: LiquidityObligation[];
}

export interface BranchForecast {
  branch_id: number;
  branch_name: string;
  today: string;
  lookahead_days: number;
  reserve_buffer_days?: number;
  cash_now: string;
  collection_rate: string;
  /** Measured rate before the safety cap is applied. */
  measured_collection_rate?: string;
  /** Expected money in, split by source. */
  expected_scheduled_total?: string;
  expected_recovery_total?: string;
  /** Unpaid amount on instalments already overdue today. */
  arrears_outstanding?: string;
  /** Share of old arrears recovered over the history window (capped / as measured). */
  recovery_rate?: string;
  measured_recovery_rate?: string;
  recovered_in_window?: string;
  arrears_at_window_start?: string;
  /** Accounts that make up cash_now, and cash-type accounts deliberately left out. */
  cash_accounts?: CashAccountLine[];
  cash_accounts_excluded?: CashAccountLine[];
  /** Unpaid schedule amounts ignored because they exceed what the loans actually owe. */
  schedule_excess?: string;
  loans_with_schedule_excess?: number;
  collected: string;
  scheduled: string;
  expected_inflows_total: string;
  committed_outflows_total: string;
  available_today: string;
  days: ForecastDay[];
}

/** A bank account option for the borrowing form (all branches, ignores the branch switcher). */
export interface BankAccountChoice {
  id: number;
  branch: number;
  branch_name: string;
  account_name: string;
  account_number: string;
  bank_name: string;
}

export interface TreasurySettings {
  lookahead_days: number;
  smart_savings_notice_days: number;
  collection_rate_window_days: number;
  default_contribution_lead_days: number;
  max_collection_rate_pct: number;
  include_arrears_recovery: boolean;
  /** Days before the due date that each obligation must be fully covered (0 = on the due date). */
  reserve_buffer_days: number;
}

/** Narrow an unknown thrown API error to the gate payload, when it is one. */
export function asLiquidityGate(err: unknown): LiquidityGatePayload | null {
  const e = err as { status?: number; details?: Partial<LiquidityGatePayload> };
  if (e?.status === 409 && e.details?.code && String(e.details.code).startsWith('liquidity_') && e.details.assessment) {
    return e.details as LiquidityGatePayload;
  }
  return null;
}
