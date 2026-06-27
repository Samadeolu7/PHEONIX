/**
 * Loan Service
 * Handles API calls for loan products, loan accounts, collateral, guarantors,
 * verification requests, and disbursements.
 * Backend: /api/loans/ (loans app — Django)
 */

import { api } from './api';
import { PaginatedResponse } from '../types/inventory';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermUnit = 'days' | 'weeks' | 'months';

export interface LoanProduct {
  id: number;
  product: number;          // FK to Product
  name: string;             // from product.name
  code: string;             // from product.code
  description: string;      // from product.description
  min_loan_amount: string;
  max_loan_amount: string;
  term_unit: TermUnit;
  min_term_months: number;  // min term in term_unit
  max_term_months: number;  // max term in term_unit
  first_repayment_buffer_days: number;
  default_interest_rate: string;
  interest_calculation_method: 'straight_line' | 'flat' | 'reducing_balance' | 'compound';
  allowed_repayment_frequencies: string[];
  processing_fee_type: 'fixed' | 'percentage';
  processing_fee_amount: string;
  processing_fee_percentage: string;
  insurance_rate: string;
  insurance_income_account: number | null;
  late_payment_penalty_type: 'fixed' | 'percentage';
  late_payment_penalty: string;
  grace_period_days: number;
  requires_collateral: boolean;
  collateral_percentage: string;
  requires_guarantor: boolean;
  min_guarantors: number;
  requires_approval: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoanAccountList {
  id: number;
  loan_number: string;
  client: number;
  client_name: string;
  product: number;
  product_name: string;
  requested_amount: string;
  disbursed_amount: string;
  outstanding_principal: string;
  processing_fee: string;
  insurance_amount: string;
  repayment_frequency: 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'approved' | 'disbursed' | 'active' | 'defaulted' | 'paid_off' | 'written_off' | 'rejected' | 'cancelled';
  risk_classification: 'performing' | 'watch' | 'substandard' | 'doubtful' | 'loss';
  days_in_arrears: number;
  arrears_amount: string;
  application_date: string;
  disbursement_date: string | null;
  maturity_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChargesSummary {
  processing_fee: string;
  insurance_amount: string;
  total_charges: string;
}

export interface LoanAccount extends LoanAccountList {
  product_requires_guarantor: boolean;
  product_min_guarantors: number;
  client_bank_name: string | null;
  client_bank_account_name: string | null;
  client_bank_account_number: string | null;
  client_bvn: string | null;
  interest_rate: string;
  interest_method: string;
  term_months: number;
  term_unit: TermUnit;
  requested_amount: string;
  approved_amount: string;
  outstanding_interest: string;
  outstanding_fees: string;
  outstanding_penalties: string;
  total_outstanding: string;
  total_paid: string;
  total_repaid: string;  // alias for total_paid
  principal_paid: string;
  interest_paid: string;
  fees_paid: string;
  penalties_paid: string;
  installments_paid: number;
  number_of_installments: number;
  installment_amount: string;
  total_charges: string;
  charges_summary: ChargesSummary;
  next_due_date: string | null;
  last_payment_date: string | null;
  application_notes: string;
  approval_date: string | null;
  approved_by: number | null;
  first_payment_date: string | null;
  closed_date: string | null;
  last_batch_processed_at: string | null;
  batch_accrual_posted: boolean;
  // CBN compliance
  interest_suspended: boolean;
  interest_suspended_at: string | null;
  provision_pct: string;
  provision_amount: string;
  contractual_interest_total: string;
  restructures: LoanRestructure[];
  repayment_schedule: LoanRepaymentSchedule[];
  collaterals: LoanCollateral[];
  guarantors: LoanGuarantor[];
}

export interface LoanRepaymentSchedule {
  id: number;
  loan: number;
  installment_number: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  fees_due: string;
  total_due: string;
  principal_paid: string;
  interest_paid: string;
  fees_paid: string;
  total_paid: string;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  payment_date: string | null;
  days_late: number;
}

export interface LoanCollateral {
  id: number;
  loan: number;
  collateral_type: string;
  description: string;
  estimated_value: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GuarantorStatus = 'pending' | 'approved' | 'rejected';

export interface LoanGuarantor {
  id: number;
  loan: number;
  guarantor: number;           // Client PK
  guarantor_name: string;
  guarantor_client_id: string;
  guarantor_phone: string;
  guarantor_occupation: string | null;
  guarantor_address: string | null;
  guaranteed_amount: string;
  status: GuarantorStatus;
  approval_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddGuarantorPayload {
  loan: number;
  guarantor: number;
  guaranteed_amount: string;
}

// ── Verification Request ───────────────────────────────────────────────────────

export type VerificationVerdict = 'pending' | 'pass' | 'refer' | 'decline';

export interface LoanVerificationRequest {
  id: number;
  loan: number;
  loan_number: string;
  branch: number;
  nin_used: string;
  active_loans_elsewhere: number;
  total_active_exposure: string;
  default_rate_pct: string;
  flags: string[];
  recommended_amount: string;
  verdict: VerificationVerdict;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Disbursement ────────────────────────────────────────────────────────────────

export type DisbursementStatus = 'pending_approval' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';

export interface LoanDisbursement {
  id: number;
  loan: number;
  loan_number: string;
  client_name: string;
  client_phone: string;
  loan_amount: string;
  requested_by: number;
  requested_by_name: string;
  status: DisbursementStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string;
  disbursement_account: number | null;
  disbursement_account_name: string | null;
  disbursement_account_number: string | null;
  disbursement_bank_name: string | null;
  disbursement_date: string | null;
  disbursed_by: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface LoanAccountFilters {
  status?: string;
  risk_classification?: string;
  repayment_frequency?: string;
  client?: number;
  product?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface RepayLoanPayload {
  amount: string;
  payment_date?: string;
  payment_mode?: 'cash' | 'bank_transfer';
  bank_reference?: string;
  cashier_account_id?: number;
  bank_account_id?: number;
}

export interface RepayLoanResult {
  loan: LoanAccount;
  schedule: LoanRepaymentSchedule[];
  spillover_to_savings?: string;
  /** @deprecated renamed to spillover_to_savings */
  overpayment_credited?: string;
}

export interface GroupCollectionRow {
  client_id: number;
  client_name: string;
  loan_account_id: number;
  loan_number: string;
  next_due_date: string;
  total_due: string;
  total_paid: string;
  remaining: string;
  principal_due: string;
  interest_due: string;
  fees_due: string;
  status: 'pending' | 'partial' | 'overdue';
}

export interface BulkRepayPayment {
  loan_account_id: number;
  amount: string;
  payment_date?: string;
}

export interface BulkRepayResult {
  succeeded: number;
  failed: { loan_account_id: number; error: string }[];
}

export interface CreateLoanAccountData {
  client: number;
  product: number;
  requested_amount: string;
  repayment_frequency: string;
  term_months: number;
  term_unit?: TermUnit;
  application_date: string;
  purpose?: string;
  cashier_account_id?: number | null;
  /** keyed by fee id (as string) */
  fee_routing?: Record<string, FeeRouting>;
}

// ── Loan GL Ledger ────────────────────────────────────────────────────────────

export interface LoanTransactionRow {
  id: number;
  date: string;
  reference: string;
  description: string;
  debit: string | null;
  credit: string | null;
  balance: string;
}

export interface LoanTransactionPage {
  count: number;
  page: number;
  page_size: number;
  results: LoanTransactionRow[];
}

// ── Service ───────────────────────────────────────────────────────────────────

const BASE = '/loans';

export const loanService = {

  // ===== LOAN PRODUCTS =====

  async listProducts(params?: { is_active?: boolean; search?: string }): Promise<LoanProduct[]> {
    const res = await api.get(`${BASE}/products/`, params);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getProduct(id: number): Promise<LoanProduct> {
    return api.get(`${BASE}/products/${id}/`);
  },

  async createProduct(data: Partial<LoanProduct>): Promise<LoanProduct> {
    return api.post(`${BASE}/products/`, data);
  },

  async updateProduct(id: number, data: Partial<LoanProduct>): Promise<LoanProduct> {
    return api.patch(`${BASE}/products/${id}/`, data);
  },

  // ===== LOAN ACCOUNTS =====

  async listLoans(params?: LoanAccountFilters): Promise<PaginatedResponse<LoanAccountList>> {
    return api.get(`${BASE}/accounts/`, { params });
  },

  async getLoan(id: number): Promise<LoanAccount> {
    return api.get(`${BASE}/accounts/${id}/`);
  },

  async createLoan(data: CreateLoanAccountData): Promise<LoanAccount> {
    return api.post(`${BASE}/accounts/`, data);
  },

  async updateLoan(id: number, data: Partial<CreateLoanAccountData>): Promise<LoanAccount> {
    return api.patch(`${BASE}/accounts/${id}/`, data);
  },

  async getLoanSchedule(id: number): Promise<LoanRepaymentSchedule[]> {
    const res = await api.get(`${BASE}/accounts/${id}/schedule/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async approveLoan(id: number): Promise<LoanAccount> {
    return api.post(`${BASE}/accounts/${id}/approve/`);
  },

  async rejectLoan(id: number, reason: string): Promise<LoanAccount> {
    return api.post(`${BASE}/accounts/${id}/reject/`, { reason });
  },

  async repayLoan(id: number, data: RepayLoanPayload): Promise<RepayLoanResult> {
    return api.post(`${BASE}/accounts/${id}/repay/`, data);
  },

  async getGroupCollection(groupId: number, date?: string): Promise<GroupCollectionRow[]> {
    const params: Record<string, string | number> = { group_id: groupId };
    if (date) params.date = date;
    const res = await api.get(`${BASE}/accounts/group-collection/`, { params });
    return Array.isArray(res) ? res : [];
  },

  async bulkRepay(data: {
    payments: BulkRepayPayment[];
    payment_mode?: 'cash' | 'bank_transfer';
    bank_reference?: string;
    bank_account_id?: number;
  }): Promise<BulkRepayResult> {
    return api.post(`${BASE}/accounts/bulk-repay/`, data);
  },

  async requestDisbursement(loanId: number, notes?: string): Promise<LoanDisbursement> {
    return api.post(`${BASE}/accounts/${loanId}/request-disbursement/`, { notes: notes ?? '' });
  },

  async requestSavingsRepayment(
    loanId: number,
    data: { amount: string; savings_account_id: number; payment_date?: string; notes?: string }
  ): Promise<LoanRepaymentRequest> {
    return api.post(`${BASE}/accounts/${loanId}/request-savings-repayment/`, data);
  },

  // ===== REPAYMENT REQUESTS (director approval) =====

  async listRepaymentRequests(params?: { status?: string }): Promise<LoanRepaymentRequest[]> {
    const res = await api.get(`${BASE}/repayment-requests/`, { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async approveRepaymentRequest(id: number): Promise<LoanRepaymentRequest> {
    return api.post(`${BASE}/repayment-requests/${id}/approve/`);
  },

  async rejectRepaymentRequest(id: number, rejection_reason: string): Promise<LoanRepaymentRequest> {
    return api.post(`${BASE}/repayment-requests/${id}/reject/`, { rejection_reason });
  },

  // ===== COLLATERAL =====

  async listCollateral(loanId: number): Promise<LoanCollateral[]> {
    const res = await api.get(`${BASE}/collateral/`, { params: { loan: loanId } });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async addCollateral(data: Omit<LoanCollateral, 'id' | 'verified_at' | 'created_at' | 'updated_at'>): Promise<LoanCollateral> {
    return api.post(`${BASE}/collateral/`, data);
  },

  async updateCollateral(id: number, data: Partial<LoanCollateral>): Promise<LoanCollateral> {
    return api.patch(`${BASE}/collateral/${id}/`, data);
  },

  async deleteCollateral(id: number): Promise<void> {
    return api.delete(`${BASE}/collateral/${id}/`);
  },

  // ===== GUARANTORS =====

  async listGuarantors(loanId: number): Promise<LoanGuarantor[]> {
    const res = await api.get(`${BASE}/guarantors/`, { params: { loan: loanId } });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async addGuarantor(data: AddGuarantorPayload): Promise<LoanGuarantor> {
    return api.post(`${BASE}/guarantors/`, data);
  },

  async deleteGuarantor(id: number): Promise<void> {
    return api.delete(`${BASE}/guarantors/${id}/`);
  },

  // ===== VERIFICATION REQUESTS =====

  async listVerificationRequests(params?: { loan?: number; verdict?: string }): Promise<LoanVerificationRequest[]> {
    const res = await api.get(`${BASE}/verification-requests/`, { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getVerificationRequest(id: number): Promise<LoanVerificationRequest> {
    return api.get(`${BASE}/verification-requests/${id}/`);
  },

  async runVerificationCheck(id: number): Promise<LoanVerificationRequest> {
    return api.post(`${BASE}/verification-requests/${id}/run-check/`);
  },

  async updateVerdict(id: number, verdict: VerificationVerdict): Promise<LoanVerificationRequest> {
    return api.patch(`${BASE}/verification-requests/${id}/verdict/`, { verdict });
  },

  // ===== DISBURSEMENTS =====

  async listDisbursements(params?: { loan?: number; status?: string }): Promise<LoanDisbursement[]> {
    const res = await api.get(`${BASE}/disbursements/`, { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getDisbursement(id: number): Promise<LoanDisbursement> {
    return api.get(`${BASE}/disbursements/${id}/`);
  },

  async approveDisbursement(id: number): Promise<LoanDisbursement> {
    return api.post(`${BASE}/disbursements/${id}/approve/`);
  },

  async executeDisbursement(
    id: number,
    data: { disbursement_account: number; notes?: string }
  ): Promise<LoanDisbursement> {
    return api.post(`${BASE}/disbursements/${id}/execute/`, data);
  },

  async rejectDisbursement(id: number, reason: string): Promise<LoanDisbursement> {
    return api.post(`${BASE}/disbursements/${id}/reject/`, { reason });
  },

  async disburseLoan(
    id: number,
    data: { disbursement_account: number; notes?: string }
  ): Promise<LoanDisbursement> {
    return api.post(`${BASE}/disbursements/${id}/disburse/`, data);
  },

  // ===== LOAN PRODUCT FEES =====

  async listProductFees(loanProductId: number): Promise<LoanProductFee[]> {
    const res = await api.get(`${BASE}/product-fees/`, { params: { loan_product: loanProductId } });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async createProductFee(data: Partial<LoanProductFee>): Promise<LoanProductFee> {
    return api.post(`${BASE}/product-fees/`, data);
  },

  async updateProductFee(id: number, data: Partial<LoanProductFee>): Promise<LoanProductFee> {
    return api.patch(`${BASE}/product-fees/${id}/`, data);
  },

  async deleteProductFee(id: number): Promise<void> {
    return api.delete(`${BASE}/product-fees/${id}/`);
  },

  async previewFees(loanProductId: number, amount: number): Promise<FeePreviewItem[]> {
    const res = await api.get(`${BASE}/fees-preview/`, { params: { loan_product: loanProductId, amount } });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  // ===== LOAN PRODUCT SAVINGS REQUIREMENTS =====

  async listSavingsRequirements(loanProductId: number): Promise<LoanProductSavingsRequirement[]> {
    const res = await api.get(`${BASE}/product-savings-requirements/`, { params: { loan_product: loanProductId } });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async createSavingsRequirement(data: Partial<LoanProductSavingsRequirement>): Promise<LoanProductSavingsRequirement> {
    return api.post(`${BASE}/product-savings-requirements/`, data);
  },

  async updateSavingsRequirement(id: number, data: Partial<LoanProductSavingsRequirement>): Promise<LoanProductSavingsRequirement> {
    return api.patch(`${BASE}/product-savings-requirements/${id}/`, data);
  },

  async deleteSavingsRequirement(id: number): Promise<void> {
    return api.delete(`${BASE}/product-savings-requirements/${id}/`);
  },

  // ===== CBN COMPLIANCE =====

  async restructureLoan(id: number, data: RestructureLoanPayload): Promise<RestructureLoanResult> {
    return api.post(`${BASE}/accounts/${id}/restructure/`, data);
  },

  async getLoanStatement(id: number): Promise<LoanStatement> {
    return api.get(`${BASE}/accounts/${id}/statement/`);
  },

  async getLoanTransactions(
    id: number,
    page = 1,
    pageSize = 50,
  ): Promise<LoanTransactionPage> {
    return api.get(`${BASE}/accounts/${id}/transactions/`, {
      params: { page, page_size: pageSize },
    });
  },

  async getPARSummary(): Promise<PARSummary> {
    return api.get(`${BASE}/accounts/par-summary/`);
  },

  async getCBNReturns(asOf?: string): Promise<CBNReturns> {
    return api.get(`${BASE}/accounts/cbn-returns/`, { params: asOf ? { as_of: asOf } : undefined });
  },

  async getContractualInterestSummary(): Promise<ContractualInterestSummary> {
    return api.get(`${BASE}/accounts/contractual-interest-summary/`);
  },
};

export default loanService;

// ── New types for product-driven configuration ─────────────────────────────

export interface LoanProductFee {
  id: number;
  loan_product: number;
  name: string;
  fee_type: 'fixed' | 'percentage';
  fixed_amount: string;
  percentage: string;
  gl_income_account: number | null;
  gl_income_account_name?: string;
  posting_trigger: 'registration' | 'approval' | 'disbursement';
  debit_destination: 'cashier' | 'savings' | 'user_choice';
  default_savings_product: number | null;
  default_savings_product_name?: string | null;
  is_active: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface LoanProductSavingsRequirement {
  id: number;
  loan_product: number;
  savings_product: number | null;
  savings_product_name?: string;
  requirement_type: 'percentage' | 'fixed';
  value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeePreviewItem {
  id: number;
  name: string;
  fee_type: 'fixed' | 'percentage';
  posting_trigger: 'registration' | 'approval' | 'disbursement';
  calculated_amount: string;
  debit_destination: 'cashier' | 'savings' | 'user_choice';
  default_savings_product_id: number | null;
  default_savings_product_name: string | null;
}

/** Per-fee routing choice submitted with the loan application. */
export interface FeeRouting {
  destination: 'cashier' | 'savings';
  savings_account_id?: number | null;
}

export interface LoanRepaymentRequest {
  id: number;
  loan: number;
  loan_number: string;
  client_name: string;
  savings_account: number;
  savings_account_number: string;
  amount: string;
  payment_date: string;
  notes: string;
  requested_by: number;
  requested_by_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  journal_entry: number | null;
  owner: number;
  branch: number;
  created_at: string;
  updated_at: string;
}

// ── CBN Compliance types ───────────────────────────────────────────────────

export interface LoanRestructure {
  id: number;
  loan: number;
  effective_date: string;
  restructured_by: number | null;
  restructured_by_name: string | null;
  reason: string;
  notes: string;
  old_term: number;
  old_term_unit: string;
  old_interest_rate: string;
  old_repayment_frequency: string;
  old_outstanding_principal: string;
  old_installment_amount: string;
  old_maturity_date: string | null;
  new_term: number;
  new_term_unit: string;
  new_interest_rate: string;
  new_repayment_frequency: string;
  new_installment_amount: string;
  new_maturity_date: string | null;
  created_at: string;
}

export interface RestructureLoanPayload {
  new_term: number;
  new_term_unit: 'days' | 'weeks' | 'months';
  new_interest_rate: string;
  new_repayment_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  effective_date?: string;
  reason?: string;
  notes?: string;
}

export interface RestructureLoanResult {
  restructure: LoanRestructure;
  loan: LoanAccount;
}

export interface LoanStatement {
  loan: LoanAccount;
  schedule: LoanRepaymentSchedule[];
  summary: {
    total_contractual_interest: string;
    interest_paid: string;
    interest_outstanding: string;
    principal_paid: string;
    principal_outstanding: string;
    total_paid: string;
    restructure_count: number;
  };
}

export interface PARBucket {
  key: string;
  label: string;
  loan_count: number;
  outstanding_balance: string;
  par_pct: string;
}

export interface PARSummary {
  glp: string;
  buckets: PARBucket[];
  par_ratios: {
    par30: string;
    par90: string;
    npl_ratio: string;
  };
}

export interface CBNClassificationRow {
  classification: string;
  provision_rate_pct: string;
  loan_count: number;
  outstanding_principal: string;
  outstanding_interest: string;
  required_provision: string;
}

export interface CBNReturns {
  as_of: string;
  gross_loan_portfolio: string;
  total_active_loans: number;
  classification_breakdown: CBNClassificationRow[];
  total_required_provision: string;
  total_interest_income_at_risk: string;
  contractual_interest_receivable: string;
  written_off_loan_count: number;
  par_30: string;
  npl_ratio_pct: string;
}

export interface ContractualInterestSummary {
  total_contractual_interest: string;
  interest_collected: string;
  interest_receivable: string;
  interest_suspended_loans: number;
  interest_at_risk: string;
}
