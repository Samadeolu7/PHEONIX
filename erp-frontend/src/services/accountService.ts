import { Account } from '../types/accounts';
import { api } from './api';

export const accountService = {
  async getAccounts(params?: {
    account_type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'LOAN' | 'SAVINGS';
    account_level?: 'PARENT' | 'CHILD';
    search?: string;
    is_active?: boolean;
    branch?: number;
    // Scope results to the children of a specific parent/ledger account —
    // used for the JV form's sub-ledger drill-down step.
    parent?: number | string;
    // Per-entity sub-ledger accounts (one row per loan/savings account/
    // cashier till) are excluded by default. Pass `true` to include every
    // kind, or a comma-separated list of kinds ('loan' | 'savings' |
    // 'cashier' | 'asset' | 'supplier') to keep only those visible — only do
    // this for pages that need to pick an *existing* sub-account directly
    // (e.g. "which cashier collected this cash"), not generic GL pickers.
    include_subledgers?: boolean | string;
  }): Promise<Account[]> {
    const response = await api.get('/accounts/', { params });
    return response.results || response.data || response;
  },

  async getAccount(id: string): Promise<Account> {
    const response = await api.get(`/accounts/${id}/`);
    return response;
  },

  async createAccount(data: Partial<Account>): Promise<Account> {
    const response = await api.post('/accounts/', data);
    return response;
  },

  async updateAccount(id: string, data: Partial<Account>): Promise<Account> {
    const response = await api.patch(`/accounts/${id}/`, data);
    return response;
  },

  async deleteAccount(id: string): Promise<void> {
    await api.delete(`/accounts/${id}/`);
  },
};
