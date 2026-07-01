/**
 * Savings Service
 * API calls for savings accounts, contribution schedules, smart savings, and compulsory savings policy.
 * Base URL: /api/savings/
 */

import api from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export type ContributionCycle = 'daily' | 'weekly' | 'monthly';
export type ContributionStatus = 'pending' | 'paid' | 'missed';
export type SavingsAccountStatus = 'active' | 'dormant' | 'frozen' | 'closed';

export interface SavingsAccount {
  id: number;
  account_number: string;
  nickname: string;
  status: SavingsAccountStatus;
  client: number;
  client_name: string;
  product: number;
  product_name: string;
  contribution_cycle: ContributionCycle | null;
  contribution_amount: string | null;
  contribution_day_of_week: number | null;
  interest_rate: string;
  interest_calculation_method: string;
  minimum_balance: string;
  allow_overdraft: boolean;
  overdraft_limit: string;
  auto_renew: boolean;
  statement_frequency: string;
  opened_on: string;
  closed_on: string | null;
  last_transaction_date: string | null;
  current_balance: string;
  available_balance: string;
  smart_savings_active: boolean;
}

export interface ContributionScheduleItem {
  id: number;
  savings_account: number;
  account_number: string;
  client_name: string;
  product_name: string;
  contribution_cycle: ContributionCycle | null;
  expected_date: string;
  expected_amount: string;
  status: ContributionStatus;
  paid_on: string | null;
  paid_by: number | null;
  paid_by_name: string | null;
  savings_transaction: number | null;
}

export interface SmartSavingsAccount {
  id: number;
  savings: number;
  account_number: string;
  client_name: string;
  is_active: boolean;
  start_date: string;
  opening_balance: string | null;
  last_interest_date: string | null;
  maturity_date: string;
  matured: boolean;
}

export interface CompulsorySavingsPolicy {
  id: number;
  amount: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerateScheduleResult {
  created: number;
  year: number;
  month: number;
}

// ── API helpers ────────────────────────────────────────────────────────────

const BASE_ACCOUNTS = '/savings/accounts';
const BASE_COLLECTION = '/savings/collection';
const BASE_POLICY = '/savings/policy';

// Savings Accounts
export interface SavingsAccountsPage {
  count: number;
  results: SavingsAccount[];
}

export const getSavingsAccounts = (params?: {
  client?: number;
  cycle?: ContributionCycle;
  product?: number;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<SavingsAccountsPage | SavingsAccount[]> => api.get(BASE_ACCOUNTS + '/', { params });

export const getSavingsAccount = (id: number): Promise<SavingsAccount> =>
  api.get(`${BASE_ACCOUNTS}/${id}/`);

// Contribution Schedule (per account)
export const getAccountSchedule = (
  accountId: number,
  year?: number,
  month?: number
): Promise<ContributionScheduleItem[]> => {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  if (month) params.month = month;
  return api.get(`${BASE_ACCOUNTS}/${accountId}/schedule/`, { params });
};

export const generateAccountSchedule = (
  accountId: number,
  year?: number,
  month?: number
): Promise<GenerateScheduleResult> => {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  if (month) params.month = month;
  return api.post(`${BASE_ACCOUNTS}/${accountId}/generate-schedule/`, {}, { params });
};

// Smart Savings
export const getSmartSavings = (accountId: number): Promise<SmartSavingsAccount> =>
  api.get(`${BASE_ACCOUNTS}/${accountId}/smart-savings/`);

export const toggleSmartSavings = (
  accountId: number,
  action: 'activate' | 'deactivate'
): Promise<SmartSavingsAccount | { detail: string }> =>
  api.post(`${BASE_ACCOUNTS}/${accountId}/toggle-smart-savings/`, { action });

// Daily Collection Sheet (savings)
export const getSavingsCollectionSheet = async (params: {
  date?: string;
  status?: ContributionStatus;
  savings_account?: number;
  cycle?: ContributionCycle;
  product?: number;
}): Promise<ContributionScheduleItem[]> => {
  const response = await api.get(BASE_COLLECTION + '/', { params });
  if (Array.isArray(response)) return response;
  return (response as { results?: ContributionScheduleItem[] })?.results ?? [];
};

export const markContributionPaid = (
  scheduleId: number,
  cashierAccountId: number
): Promise<ContributionScheduleItem> =>
  api.post(`${BASE_COLLECTION}/${scheduleId}/mark-paid/`, { cashier_account_id: cashierAccountId });

export const generateScheduleForMonth = (
  year?: number,
  month?: number
): Promise<GenerateScheduleResult> => {
  const today = new Date();
  return api.post(`${BASE_COLLECTION}/generate-for-month/`, {
    year: year ?? today.getFullYear(),
    month: month ?? today.getMonth() + 1,
  });
};

// ── Create Savings Account ─────────────────────────────────────────────────

export interface CreateSavingsAccountData {
  client: number;
  product: number;
  nickname?: string;
  opened_on: string;
  interest_rate: string;
  interest_calculation_method: string;
  minimum_balance?: string;
  allow_overdraft?: boolean;
  overdraft_limit?: string;
  auto_renew?: boolean;
  statement_frequency?: string;
  contribution_day_of_week?: number | null;
}

export const createSavingsAccount = (data: CreateSavingsAccountData): Promise<SavingsAccount> =>
  api.post(BASE_ACCOUNTS + '/', data);

// Compulsory Savings Policy
export const getCompulsorySavingsPolicies = async (): Promise<CompulsorySavingsPolicy[]> => {
  const response = await api.get(BASE_POLICY + '/');
  if (Array.isArray(response)) return response;
  return (response as { results?: CompulsorySavingsPolicy[] })?.results ?? [];
};

export const updateCompulsorySavingsPolicy = (
  id: number,
  data: Partial<Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>>
): Promise<CompulsorySavingsPolicy> => api.patch(`${BASE_POLICY}/${id}/`, data);

export const createCompulsorySavingsPolicy = (
  data: Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>
): Promise<CompulsorySavingsPolicy> => api.post(BASE_POLICY + '/', data);

// ── New types for product-driven configuration ─────────────────────────────

export interface SavingsProductConfig {
  id: number;
  product: number;
  product_name?: string;
  interest_expense_account: number | null;
  interest_expense_account_name?: string;
  penalty_income_account: number | null;
  penalty_income_account_name?: string;
  is_daily_contribution: boolean;
  first_deposit_is_income: boolean;
  first_deposit_income_account: number | null;
  first_deposit_income_account_name?: string;
  has_savings_cycle: boolean;
  cycle_length_months: number | null;
  cycle_interest_rate: string | null;
  cycle_break_penalty_rate: string | null;
  cycle_auto_renew: boolean;
  withdrawal_needs_approval: boolean;
  only_account_manager_can_withdraw: boolean;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalApprovalTier {
  id: number;
  tier_name: string;
  min_amount: string;
  max_amount: string | null;
  required_approvers: number;
  approver_roles: string[];
  is_active: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export type WithdrawalStatus =
  | 'pending'
  | 'partially_approved'
  | 'fully_approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface WithdrawalApprovalStep {
  id: number;
  step_number: number;
  approver: number | null;
  approver_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string;
  responded_at: string | null;
}

export interface SavingsWithdrawalRequest {
  id: number;
  savings_account: number;
  account_number?: string;
  client_name?: string;
  client_phone?: string | null;
  client_bank_name?: string | null;
  client_bank_account_name?: string | null;
  client_bank_account_number?: string | null;
  client_bvn?: string | null;
  requested_by: number;
  requested_by_name?: string;
  amount: string;
  status: WithdrawalStatus;
  required_approvals: number;
  approvals_received: number;
  description: string;
  cashier_account: number | null;
  destination_bank_account: number | null;
  destination_bank_name?: string | null;
  destination_account_number?: string | null;
  destination_account_name?: string | null;
  applied_tier: number | null;
  journal_entry: number | null;
  disbursed_by?: number | null;
  disbursed_by_name?: string | null;
  disbursed_at?: string | null;
  created_at: string;
  updated_at: string;
  approval_steps: WithdrawalApprovalStep[];
}

export interface InitiateWithdrawalData {
  savings_account: number;
  amount: string;
  description?: string;
  cashier_account?: number | null;
  destination_bank_account?: number | null;
}

// ── New API helpers ────────────────────────────────────────────────────────

const BASE_PRODUCT_CONFIGS = '/savings/product-configs';
const BASE_WITHDRAWAL_TIERS = '/savings/withdrawal-tiers';
const BASE_WITHDRAWALS = '/savings/withdrawals';

// Savings Product Config
export const getSavingsProductConfig = (productId: number): Promise<SavingsProductConfig[]> =>
  api.get(BASE_PRODUCT_CONFIGS + '/', { params: { product: productId } });

export const createSavingsProductConfig = (
  data: Partial<SavingsProductConfig>
): Promise<SavingsProductConfig> => api.post(BASE_PRODUCT_CONFIGS + '/', data);

export const updateSavingsProductConfig = (
  id: number,
  data: Partial<SavingsProductConfig>
): Promise<SavingsProductConfig> => api.patch(`${BASE_PRODUCT_CONFIGS}/${id}/`, data);

// Withdrawal Approval Tiers
export const getWithdrawalTiers = (params?: {
  is_active?: boolean;
}): Promise<WithdrawalApprovalTier[]> => {
  const res = api.get(BASE_WITHDRAWAL_TIERS + '/', { params });
  return res.then((r: any) => (Array.isArray(r) ? r : (r?.results ?? [])));
};

export const createWithdrawalTier = (
  data: Partial<WithdrawalApprovalTier>
): Promise<WithdrawalApprovalTier> => api.post(BASE_WITHDRAWAL_TIERS + '/', data);

export const updateWithdrawalTier = (
  id: number,
  data: Partial<WithdrawalApprovalTier>
): Promise<WithdrawalApprovalTier> => api.patch(`${BASE_WITHDRAWAL_TIERS}/${id}/`, data);

export const deleteWithdrawalTier = (id: number): Promise<void> =>
  api.delete(`${BASE_WITHDRAWAL_TIERS}/${id}/`);

// Withdrawal Requests
export const initiateWithdrawal = (
  data: InitiateWithdrawalData
): Promise<SavingsWithdrawalRequest> => api.post(BASE_WITHDRAWALS + '/', data);

export interface WithdrawalListPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: SavingsWithdrawalRequest[];
}

export const getWithdrawals = (params?: {
  savings_account?: number;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<WithdrawalListPage> => {
  const res = api.get(BASE_WITHDRAWALS + '/', { params });
  return res.then((r: any) =>
    Array.isArray(r)
      ? { count: r.length, next: null, previous: null, results: r }
      : { count: r?.count ?? 0, next: r?.next ?? null, previous: r?.previous ?? null, results: r?.results ?? r ?? [] }
  );
};

export const getWithdrawal = (id: number): Promise<SavingsWithdrawalRequest> =>
  api.get(`${BASE_WITHDRAWALS}/${id}/`);

export const getPendingMyApproval = (): Promise<SavingsWithdrawalRequest[]> => {
  const res = api.get(`${BASE_WITHDRAWALS}/pending/`);
  return res.then((r: any) => (Array.isArray(r) ? r : (r?.results ?? [])));
};

export const getPendingDisburse = (): Promise<SavingsWithdrawalRequest[]> => {
  const res = api.get(`${BASE_WITHDRAWALS}/pending-disburse/`);
  return res.then((r: any) => (Array.isArray(r) ? r : (r?.results ?? [])));
};

export const approveWithdrawalStep = (
  withdrawalId: number,
  data: { approved: boolean; comment?: string }
): Promise<SavingsWithdrawalRequest> =>
  api.post(`${BASE_WITHDRAWALS}/${withdrawalId}/approve-step/`, data);

export const cancelWithdrawal = (id: number): Promise<SavingsWithdrawalRequest> =>
  api.post(`${BASE_WITHDRAWALS}/${id}/cancel/`, {});

export const disburseWithdrawal = (
  id: number,
  data: { destination_bank_account: number }
): Promise<SavingsWithdrawalRequest> =>
  api.post(`${BASE_WITHDRAWALS}/${id}/disburse/`, data);

// ── Savings Account Transaction Ledger ─────────────────────────────────────

export interface SavingsTransactionRow {
  id: number;
  date: string;
  reference: string;
  description: string;
  debit: string | null;
  credit: string | null;
  balance: string;
}

export interface SavingsTransactionPage {
  count: number;
  page: number;
  page_size: number;
  results: SavingsTransactionRow[];
}

export const getSavingsTransactions = (
  accountId: number,
  page = 1,
  pageSize = 50
): Promise<SavingsTransactionPage> =>
  api.get(`${BASE_ACCOUNTS}/${accountId}/transactions/`, {
    params: { page, page_size: pageSize },
  });

// ── Deposit ────────────────────────────────────────────────────────────────

export interface SavingsDepositPayload {
  amount: string;
  date: string;
  cashier_account_id?: number;
  description?: string;
  payment_mode?: 'cash' | 'bank_transfer';
  bank_reference?: string;
}

export interface SavingsDepositResult {
  id: number;
  savings_account: number;
  account_number: string;
  client_name: string;
  amount: string;
  date: string;
  balance_after: string;
  reference: string;
}

export const depositToSavings = (
  accountId: number,
  data: SavingsDepositPayload
): Promise<SavingsDepositResult> => api.post(`${BASE_ACCOUNTS}/${accountId}/deposit/`, data);
