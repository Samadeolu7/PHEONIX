import { Account } from '../types/accounts';
import { api } from './api';

export const accountService = {
  async getAccounts(params?: {
    account_type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    search?: string;
    is_active?: boolean;
    branch?: number;
    // Per-entity sub-ledger accounts (one row per loan/savings account/
    // cashier till) are excluded by default — only pass true for pages that
    // need to pick an *existing* cashier/loan/savings sub-account directly
    // (e.g. "which cashier collected this cash"), not generic GL pickers.
    include_subledgers?: boolean;
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
