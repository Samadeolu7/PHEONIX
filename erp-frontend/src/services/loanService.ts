/**
 * Loan Service
 * Handles API calls for loan products, loan accounts, collateral, guarantors,
 * verification requests, and disbursements.
 * Backend: /api/loans/ (loans app — Django)
 */

import { api } from './api';
import { PaginatedResponse } from '../types/inventory';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoanProduct {
  id: number;
  name: string;
  code: string;
  description: string;
  min_loan_amount: string;
  max_loan_amount: string;
  min_term_months: number;
  max_term_months: number;
  default_interest_rate: string;
  interest_calculation_method: 'flat' | 'reducing_balance';
  allowed_repayment_frequencies: string[];
  processing_fee_amount: string;
  processing_fee_percentage: string;
  insurance_rate: string;
  insurance_income_account: number | null;
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
  disbursed_amount: string;
  outstanding_principal: string;
  processing_fee: string;
  insurance_amount: string;
  repayment_frequency: 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'approved' | 'disbursed' | 'active' | 'closed' | 'written_off' | 'rejected';
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
  interest_rate: string;
  interest_method: 'flat' | 'reducing_balance';
  term_months: number;
  total_outstanding: string;
  accrued_interest: string;
  total_repaid: string;
  total_charges: string;
  charges_summary: ChargesSummary;
  next_due_date: string | null;
  last_payment_date: string | null;
  approved_by: number | null;
  approved_at: string | null;
  last_batch_processed_at: string | null;
  batch_accrual_posted: boolean;
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
  paid_date: string | null;
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

export interface LoanGuarantor {
  id: number;
  loan: number;
  name: string;
  relationship: string;
  phone: string;
  occupation: string;
  home_address: string;
  office_address: string;
  created_at: string;
  updated_at: string;
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
  requested_by: number;
  requested_by_name: string;
  status: DisbursementStatus;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string;
  disbursement_account: number | null;
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
}

export interface CreateLoanAccountData {
  client: number;
  product: number;
  requested_amount: string;
  repayment_frequency: string;
  term_months: number;
  application_date: string;
  purpose?: string;
  cashier_account_id?: number | null;
  /** keyed by fee id (as string) */
  fee_routing?: Record<string, FeeRouting>;
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

  async addGuarantor(data: Omit<LoanGuarantor, 'id' | 'created_at' | 'updated_at'>): Promise<LoanGuarantor> {
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
