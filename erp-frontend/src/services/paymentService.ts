/**
 * Central Payment Service
 *
 * All payment operations in the system flow through this module.
 * Cashier accounts are auto-resolved by the backend from the authenticated
 * user — callers never need to supply a cashier_account_id.
 *
 * If the logged-in user has no cashier account the backend creates one
 * automatically on first use (PaymentRoutingService.get_or_create_cashier_account).
 *
 * Bank-transfer payments require a bank_reference (e.g. sender's transaction ID)
 * and optionally a bank_account_id (company bank GL account; backend falls back
 * to the branch default when omitted).
 */
import { api } from './api';

export type PaymentMode = 'cash' | 'bank_transfer';

// ── Savings deposit ───────────────────────────────────────────────────────────

export interface SavingsDepositParams {
  amount: string;
  date?: string;
  description?: string;
  payment_mode?: PaymentMode;
  bank_reference?: string;
  bank_account_id?: number;
}

export interface SavingsDepositResult {
  id: number;
  account_number: string;
  current_balance: string;
  transaction_reference?: string;
}

export function depositToSavingsAccount(
  accountId: number,
  params: SavingsDepositParams,
): Promise<SavingsDepositResult> {
  const { amount, date, description, payment_mode, bank_reference, bank_account_id } = params;
  return api.post(`/savings/accounts/${accountId}/deposit/`, {
    amount,
    ...(date ? { date } : {}),
    ...(description ? { description } : {}),
    ...(payment_mode ? { payment_mode } : {}),
    ...(bank_reference ? { bank_reference } : {}),
    ...(bank_account_id ? { bank_account_id } : {}),
  });
}

// ── Contribution schedule — mark paid ─────────────────────────────────────────

export interface MarkContributionPaidResult {
  id: number;
  status: string;
  paid_on: string;
}

export function markContributionPaid(
  scheduleId: number,
  params?: { payment_mode?: PaymentMode; bank_reference?: string },
): Promise<MarkContributionPaidResult> {
  return api.post(`/savings/collection/${scheduleId}/mark-paid/`, {
    ...(params?.payment_mode ? { payment_mode: params.payment_mode } : {}),
    ...(params?.bank_reference ? { bank_reference: params.bank_reference } : {}),
  });
}

// ── Loan repayment ────────────────────────────────────────────────────────────

export interface LoanRepaymentParams {
  amount: string;
  payment_date?: string;
  payment_mode?: PaymentMode;
  bank_reference?: string;
  bank_account_id?: number;
}

export interface LoanRepaymentResult {
  loan: Record<string, unknown>;
  schedule: unknown[];
  overpayment_credited?: string;
}

export function repayLoan(
  loanId: number,
  params: LoanRepaymentParams,
): Promise<LoanRepaymentResult> {
  return api.post(`/loans/accounts/${loanId}/repay/`, params);
}

// ── Reconciliation shortfall deduction ───────────────────────────────────────

export interface ReconciliationDeductionParams {
  reconciliation_id: number;
  monthly_installment?: string;
  start_month?: string;
  notes?: string;
}

export interface ReconciliationDeductionResult {
  id: number;
  reference_number: string;
  staff_name: string;
  total_amount: string;
  monthly_installment: string;
  status: string;
  deduction_type: string;
}

export function createReconciliationDeduction(
  params: ReconciliationDeductionParams,
): Promise<ReconciliationDeductionResult> {
  return api.post('/hr/staff-ious/from-reconciliation/', params);
}
