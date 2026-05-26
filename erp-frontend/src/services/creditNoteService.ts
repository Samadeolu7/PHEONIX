// src/services/creditNoteService.ts
// Standalone credit note service (not nested under invoices)
import { api } from './api';
import { CreditNote } from './invoiceService';

export interface StandaloneCreditNoteFilters {
  status?: 'draft' | 'issued' | 'applied' | 'cancelled';
  applied_to_account?: boolean;
  client?: number;
  original_invoice?: number;
  issue_date?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface CreditNoteListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CreditNote[];
}

export const creditNoteService = {
  /**
   * List all credit notes (across all invoices) via the standalone endpoint.
   */
  async getCreditNotes(filters?: StandaloneCreditNoteFilters): Promise<CreditNoteListResponse> {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.applied_to_account !== undefined)
      params.applied_to_account = filters.applied_to_account;
    if (filters?.client) params.client = filters.client;
    if (filters?.original_invoice) params.original_invoice = filters.original_invoice;
    if (filters?.issue_date) params.issue_date = filters.issue_date;
    if (filters?.search) params.search = filters.search;
    if (filters?.ordering) params.ordering = filters.ordering;
    if (filters?.page) params.page = filters.page;
    if (filters?.page_size) params.page_size = filters.page_size;

    const response = await api.get('/inventory/credit-notes/', { params });
    if (response && typeof response === 'object' && 'results' in response) {
      return response as CreditNoteListResponse;
    }
    const results = Array.isArray(response) ? response : (response?.data ?? []);
    return { count: results.length, next: null, previous: null, results };
  },

  async getCreditNote(id: number): Promise<CreditNote> {
    return api.get(`/inventory/credit-notes/${id}/`);
  },

  async applyCreditNote(id: number, notes?: string): Promise<CreditNote> {
    const response = await api.post(`/inventory/credit-notes/${id}/apply/`, {
      notes: notes ?? '',
    });
    return response?.credit_note ?? response;
  },

  async cancelCreditNote(id: number, cancellation_reason: string): Promise<CreditNote> {
    const response = await api.post(`/inventory/credit-notes/${id}/cancel/`, {
      cancellation_reason,
    });
    return response?.credit_note ?? response;
  },

  async reverseCreditNote(id: number, reversal_reason: string): Promise<CreditNote> {
    const response = await api.post(`/inventory/credit-notes/${id}/reverse/`, {
      reversal_reason,
    });
    return response?.credit_note ?? response;
  },

  async getSummary(): Promise<Record<string, unknown>> {
    return api.get('/inventory/credit-notes/summary/');
  },
};
