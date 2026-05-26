// src/services/journalVoucherService.ts
import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionSeries {
  id: number;
  code: string;
  description: string;
}

export interface TransactionEntryAccount {
  id: number;
  code: string;
  name: string;
}

export interface TransactionEntry {
  id: number;
  account: TransactionEntryAccount;
  side: 'DR' | 'CR';
  amount: string;
  signed_amount: string;
}

export interface JournalVoucher {
  id: number;
  series: TransactionSeries;
  date: string;
  reference_number: string;
  workflow_reference?: string;
  description: string;
  approved: boolean;
  approved_by_name?: string;
  approved_at?: string;
  is_reversed: boolean;
  reversed_at?: string;
  reversed_by_name?: string;
  reversal_reason?: string;
  reversal_transaction_ref?: string;
  is_reversal: boolean;
  reverses_transaction_ref?: string;
  entries: TransactionEntry[];
  total_debits: string;
  total_credits: string;
  is_balanced: boolean;
  entry_count?: number;
  created_at: string;
  updated_at: string;
}

export interface JournalVoucherListItem extends Omit<JournalVoucher, 'entries'> {
  entry_count: number;
}

export interface CreateJournalVoucherEntry {
  account_id: number;
  side: 'DR' | 'CR';
  amount: string;
}

export interface CreateJournalVoucherData {
  series: number;
  date: string;
  description: string;
  workflow_reference?: string;
  entries: CreateJournalVoucherEntry[];
}

export interface JournalVoucherFilters {
  search?: string;
  date_from?: string;
  date_to?: string;
  approved?: boolean;
  show_reversed?: boolean;
  account?: number;
  workflow_reference?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export interface JournalVoucherListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: JournalVoucherListItem[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const journalVoucherService = {
  // ---------- Journal Vouchers ----------

  async getJournalVouchers(filters?: JournalVoucherFilters): Promise<JournalVoucherListResponse> {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters?.search) params.search = filters.search;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;
    if (filters?.approved !== undefined) params.approved = filters.approved;
    if (filters?.show_reversed !== undefined) params.show_reversed = filters.show_reversed;
    if (filters?.account) params.account = filters.account;
    if (filters?.workflow_reference) params.workflow_reference = filters.workflow_reference;
    if (filters?.page) params.page = filters.page;
    if (filters?.page_size) params.page_size = filters.page_size;
    if (filters?.ordering) params.ordering = filters.ordering;

    const response = await api.get('/transactions/', { params });
    // The API may return paginated or plain list
    if (response && typeof response === 'object' && 'results' in response) {
      return response as JournalVoucherListResponse;
    }
    // Wrap plain array
    const results = Array.isArray(response) ? response : (response?.data ?? []);
    return { count: results.length, next: null, previous: null, results };
  },

  async getJournalVoucher(id: number): Promise<JournalVoucher> {
    const response = await api.get(`/transactions/${id}/`);
    return response;
  },

  async createJournalVoucher(data: CreateJournalVoucherData): Promise<JournalVoucher> {
    const response = await api.post('/transactions/', data);
    return response;
  },

  async approveJournalVoucher(id: number): Promise<JournalVoucher> {
    const response = await api.post(`/transactions/${id}/approve/`, {});
    return response?.data ?? response;
  },

  async reverseJournalVoucher(
    id: number,
    reason: string
  ): Promise<{ original: JournalVoucher; reversal: JournalVoucher }> {
    const response = await api.post(`/transactions/${id}/reverse/`, { reason });
    return response?.data ?? response;
  },

  // ---------- Transaction Series ----------

  async getTransactionSeries(): Promise<TransactionSeries[]> {
    const response = await api.get('/transactions/transaction-series/');
    if (Array.isArray(response)) return response;
    return response?.results ?? response?.data ?? [];
  },

  async createTransactionSeries(data: {
    code: string;
    description: string;
  }): Promise<TransactionSeries> {
    const response = await api.post('/transactions/transaction-series/', data);
    return response;
  },
};
