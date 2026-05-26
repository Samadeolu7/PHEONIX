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
export const getSavingsAccounts = (params?: {
  client?: number;
  cycle?: ContributionCycle;
}): Promise<SavingsAccount[]> =>
  api.get(BASE_ACCOUNTS + '/', { params });

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
export const getSavingsCollectionSheet = (params: {
  date?: string;
  status?: ContributionStatus;
  savings_account?: number;
  cycle?: ContributionCycle;
}): Promise<ContributionScheduleItem[]> =>
  api.get(BASE_COLLECTION + '/', { params });

export const markContributionPaid = (
  scheduleId: number,
  cashierAccountId: number
): Promise<ContributionScheduleItem> =>
  api.post(`${BASE_COLLECTION}/${scheduleId}/mark-paid/`, {
    cashier_account_id: cashierAccountId,
  });

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

// Compulsory Savings Policy
export const getCompulsorySavingsPolicies = (): Promise<CompulsorySavingsPolicy[]> =>
  api.get(BASE_POLICY + '/');

export const updateCompulsorySavingsPolicy = (
  id: number,
  data: Partial<Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>>
): Promise<CompulsorySavingsPolicy> =>
  api.patch(`${BASE_POLICY}/${id}/`, data);

export const createCompulsorySavingsPolicy = (
  data: Pick<CompulsorySavingsPolicy, 'amount' | 'enabled'>
): Promise<CompulsorySavingsPolicy> =>
  api.post(BASE_POLICY + '/', data);
