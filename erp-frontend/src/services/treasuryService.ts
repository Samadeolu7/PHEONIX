/**
 * Treasury Management API Service
 * Handles cash collections, reconciliations, transfers, and bank reconciliations
 */

import { api } from './api';
import {
  CashierAccount,
  CreateCashierAccountRequest,
  CashCollection,
  CreateCashCollectionRequest,
  CashTransfer,
  CreateCashTransferRequest,
  CashReconciliation,
  CreateCashReconciliationRequest,
  FinanceOfficerSignoffRequest,
  BankReconciliation,
  CreateBankReconciliationRequest,
  TreasurySummary,
  CashierSummary,
  CashCollectionFilters,
  CashReconciliationFilters,
  BankReconciliationFilters,
  TreasuryApiResponse,
} from '../types/treasury';

// Backend uses 'cash-management' as the API namespace for treasury endpoints
const BASE_URL = '/cash-management';

/**
 * Cashier Account Operations
 */
export const cashierAccountService = {
  /**
   * Get all cashier accounts
   */
  getAll: async (): Promise<CashierAccount[]> => {
    const response = await api.get<TreasuryApiResponse<CashierAccount>>(
      `${BASE_URL}/cashier-accounts/`
    );
    return response.data?.results || [];
  },

  /**
   * Get cashier account by ID
   */
  getById: async (id: number): Promise<CashierAccount> => {
    const response = await api.get<CashierAccount>(`${BASE_URL}/cashier-accounts/${id}/`);
    return response.data;
  },

  /**
   * Get active cashier accounts
   */
  getActive: async (): Promise<CashierAccount[]> => {
    const response = await api.get<TreasuryApiResponse<CashierAccount>>(
      `${BASE_URL}/cashier-accounts/?is_active=true&is_suspended=false`
    );
    return response.data?.results || [];
  },

  /**
   * Get cashier accounts needing reconciliation
   */
  getNeedingReconciliation: async (): Promise<CashierAccount[]> => {
    const response = await api.get<TreasuryApiResponse<CashierAccount>>(
      `${BASE_URL}/cashier-accounts/?needs_reconciliation=true`
    );
    return response.data?.results || [];
  },

  /**
   * Create a new cashier account
   */
  create: async (data: CreateCashierAccountRequest): Promise<CashierAccount> => {
    const response = await api.post<CashierAccount>(`${BASE_URL}/cashier-accounts/`, data);
    return response.data;
  },
};

/**
 * Cash Collection Operations
 */
export const cashCollectionService = {
  /**
   * Get all cash collections with optional filters
   */
  getAll: async (filters?: CashCollectionFilters): Promise<CashCollection[]> => {
    const params = new URLSearchParams();

    if (filters) {
      if (filters.cashier_account)
        params.append('cashier_account', filters.cashier_account.toString());
      if (filters.client) params.append('client', filters.client.toString());
      if (filters.collection_date_from)
        params.append('collection_date_from', filters.collection_date_from);
      if (filters.collection_date_to)
        params.append('collection_date_to', filters.collection_date_to);
      if (filters.collection_mode) params.append('collection_mode', filters.collection_mode);
      if (filters.is_posted !== undefined) params.append('is_posted', filters.is_posted.toString());
      if (filters.search) params.append('search', filters.search);
    }

    const response = await api.get<TreasuryApiResponse<CashCollection>>(
      `${BASE_URL}/cash-collections/?${params.toString()}`
    );
    return response.data?.results || [];
  },

  /**
   * Get cash collection by ID
   */
  getById: async (id: number): Promise<CashCollection> => {
    const response = await api.get<CashCollection>(`${BASE_URL}/cash-collections/${id}/`);
    return response.data;
  },

  /**
   * Create new cash collection
   */
  create: async (data: CreateCashCollectionRequest): Promise<CashCollection> => {
    const response = await api.post<CashCollection>(`${BASE_URL}/cash-collections/`, data);
    return response.data;
  },

  /**
   * Update cash collection
   */
  update: async (
    id: number,
    data: Partial<CreateCashCollectionRequest>
  ): Promise<CashCollection> => {
    const response = await api.patch<CashCollection>(`${BASE_URL}/cash-collections/${id}/`, data);
    return response.data;
  },

  /**
   * Delete cash collection
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE_URL}/cash-collections/${id}/`);
  },

  /**
   * Post cash collection to accounts
   */
  post: async (id: number): Promise<CashCollection> => {
    const response = await api.post<CashCollection>(`${BASE_URL}/cash-collections/${id}/post/`);
    return response.data;
  },

  /**
   * Get today's collections for a cashier
   */
  getTodayByCashier: async (cashierId: number): Promise<CashCollection[]> => {
    const today = new Date().toISOString().split('T')[0];
    return cashCollectionService.getAll({
      cashier_account: cashierId,
      collection_date_from: today,
      collection_date_to: today,
    });
  },

  /**
   * Download deposit slip PDF for a cash collection
   */
  downloadDepositSlip: async (id: number): Promise<void> => {
    const { triggerDownload } = await import('./api');
    const blob = await api.getBlob(
      `${BASE_URL}/cash-collections/${id}/deposit-slip/?download=true`
    );
    triggerDownload(blob, `deposit-slip-${id}.pdf`);
  },
};

/**
 * Cash Transfer Operations
 */
export const cashTransferService = {
  /**
   * Get all cash transfers
   */
  getAll: async (): Promise<CashTransfer[]> => {
    const response = await api.get<TreasuryApiResponse<CashTransfer>>(
      `${BASE_URL}/cash-transfers/`
    );
    return response.data?.results || [];
  },

  /**
   * Get cash transfer by ID
   */
  getById: async (id: number): Promise<CashTransfer> => {
    const response = await api.get<CashTransfer>(`${BASE_URL}/cash-transfers/${id}/`);
    return response.data;
  },

  /**
   * Create new cash transfer
   */
  create: async (data: CreateCashTransferRequest): Promise<CashTransfer> => {
    const formData = new FormData();

    formData.append('cashier_account', data.cashier_account.toString());
    formData.append('destination_account', data.destination_account.toString());
    formData.append('amount', data.amount);

    if (data.transfer_date) formData.append('transfer_date', data.transfer_date);
    if (data.bank_deposit_slip) formData.append('bank_deposit_slip', data.bank_deposit_slip);
    if (data.bank_reference) formData.append('bank_reference', data.bank_reference);
    if (data.deposit_proof) formData.append('deposit_proof', data.deposit_proof);

    const response = await api.post<CashTransfer>(`${BASE_URL}/cash-transfers/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Submit cash transfer for approval
   */
  submit: async (id: number): Promise<CashTransfer> => {
    const response = await api.post<CashTransfer>(`${BASE_URL}/cash-transfers/${id}/submit/`);
    return response.data;
  },

  /**
   * Approve cash transfer
   */
  approve: async (id: number, notes?: string): Promise<CashTransfer> => {
    const response = await api.post<CashTransfer>(`${BASE_URL}/cash-transfers/${id}/approve/`, {
      approval_notes: notes,
    });
    return response.data;
  },

  /**
   * Reject cash transfer
   */
  reject: async (id: number, reason: string): Promise<CashTransfer> => {
    const response = await api.post<CashTransfer>(`${BASE_URL}/cash-transfers/${id}/reject/`, {
      rejection_reason: reason,
    });
    return response.data;
  },

  /**
   * Post cash transfer to accounts
   */
  post: async (id: number): Promise<CashTransfer> => {
    const response = await api.post<CashTransfer>(`${BASE_URL}/cash-transfers/${id}/post/`);
    return response.data;
  },

  /**
   * Get pending transfers
   */
  getPending: async (): Promise<CashTransfer[]> => {
    const response = await api.get<TreasuryApiResponse<CashTransfer>>(
      `${BASE_URL}/cash-transfers/?status=pending`
    );
    return response.data?.results || [];
  },
};

/**
 * Cash Reconciliation Operations
 */
export const cashReconciliationService = {
  /**
   * Get all cash reconciliations with optional filters
   */
  getAll: async (filters?: CashReconciliationFilters): Promise<CashReconciliation[]> => {
    const params = new URLSearchParams();

    if (filters) {
      if (filters.cashier_account)
        params.append('cashier_account', filters.cashier_account.toString());
      if (filters.reconciliation_date_from)
        params.append('reconciliation_date_from', filters.reconciliation_date_from);
      if (filters.reconciliation_date_to)
        params.append('reconciliation_date_to', filters.reconciliation_date_to);
      if (filters.status) params.append('status', filters.status);
      if (filters.needs_finance_signoff) params.append('needs_finance_signoff', 'true');
    }

    const response = await api.get<TreasuryApiResponse<CashReconciliation>>(
      `${BASE_URL}/cash-reconciliations/?${params.toString()}`
    );
    return response.data?.results || [];
  },

  /**
   * Get cash reconciliation by ID
   */
  getById: async (id: number): Promise<CashReconciliation> => {
    const response = await api.get<CashReconciliation>(`${BASE_URL}/cash-reconciliations/${id}/`);
    return response.data;
  },

  /**
   * Create new cash reconciliation
   */
  create: async (data: CreateCashReconciliationRequest): Promise<CashReconciliation> => {
    const response = await api.post<CashReconciliation>(`${BASE_URL}/cash-reconciliations/`, data);
    return response.data;
  },

  /**
   * Update cash reconciliation
   */
  update: async (
    id: number,
    data: Partial<CreateCashReconciliationRequest>
  ): Promise<CashReconciliation> => {
    const response = await api.patch<CashReconciliation>(
      `${BASE_URL}/cash-reconciliations/${id}/`,
      data
    );
    return response.data;
  },

  /**
   * Finance officer sign-off
   */
  financeSignoff: async (
    id: number,
    data: FinanceOfficerSignoffRequest
  ): Promise<CashReconciliation> => {
    const response = await api.post<CashReconciliation>(
      `${BASE_URL}/cash-reconciliations/${id}/finance_signoff/`,
      data
    );
    return response.data;
  },

  /**
   * Get reconciliations needing finance sign-off
   */
  getNeedingSignoff: async (): Promise<CashReconciliation[]> => {
    return cashReconciliationService.getAll({
      needs_finance_signoff: true,
    });
  },

  /**
   * Get today's reconciliations
   */
  getToday: async (): Promise<CashReconciliation[]> => {
    const today = new Date().toISOString().split('T')[0];
    return cashReconciliationService.getAll({
      reconciliation_date_from: today,
      reconciliation_date_to: today,
    });
  },
};

/**
 * Bank Reconciliation Operations
 */
export const bankReconciliationService = {
  /**
   * Get all bank reconciliations with optional filters
   */
  getAll: async (filters?: BankReconciliationFilters): Promise<BankReconciliation[]> => {
    const params = new URLSearchParams();

    if (filters) {
      if (filters.bank_account) params.append('bank_account', filters.bank_account.toString());
      if (filters.period_from) params.append('period_from', filters.period_from);
      if (filters.period_to) params.append('period_to', filters.period_to);
      if (filters.status) params.append('status', filters.status);
    }

    const response = await api.get<TreasuryApiResponse<BankReconciliation>>(
      `${BASE_URL}/bank-reconciliations/?${params.toString()}`
    );
    return response.data?.results || [];
  },

  /**
   * Get bank reconciliation by ID
   */
  getById: async (id: number): Promise<BankReconciliation> => {
    const response = await api.get<BankReconciliation>(`${BASE_URL}/bank-reconciliations/${id}/`);
    return response.data;
  },

  /**
   * Create new bank reconciliation
   */
  create: async (data: CreateBankReconciliationRequest): Promise<BankReconciliation> => {
    const response = await api.post<BankReconciliation>(`${BASE_URL}/bank-reconciliations/`, data);
    return response.data;
  },

  /**
   * Update bank reconciliation
   */
  update: async (
    id: number,
    data: Partial<CreateBankReconciliationRequest>
  ): Promise<BankReconciliation> => {
    const response = await api.patch<BankReconciliation>(
      `${BASE_URL}/bank-reconciliations/${id}/`,
      data
    );
    return response.data;
  },

  /**
   * Submit for review
   */
  submitForReview: async (id: number): Promise<BankReconciliation> => {
    const response = await api.post<BankReconciliation>(
      `${BASE_URL}/bank-reconciliations/${id}/submit_for_review/`
    );
    return response.data;
  },

  /**
   * Approve bank reconciliation
   */
  approve: async (id: number): Promise<BankReconciliation> => {
    const response = await api.post<BankReconciliation>(
      `${BASE_URL}/bank-reconciliations/${id}/approve/`
    );
    return response.data;
  },

  /**
   * Delete bank reconciliation
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE_URL}/bank-reconciliations/${id}/`);
  },
};

/**
 * Treasury Summary Operations
 */
export const treasurySummaryService = {
  /**
   * Get treasury dashboard summary
   */
  getDashboard: async (): Promise<TreasurySummary | null> => {
    const response = await api.get<TreasurySummary>(`${BASE_URL}/summary/dashboard/`);
    return response.data || null;
  },

  /**
   * Get cashier summaries
   */
  getCashierSummaries: async (): Promise<CashierSummary[]> => {
    const response = await api.get<CashierSummary[]>(`${BASE_URL}/summary/cashiers/`);
    return response.data || [];
  },
};

export default {
  cashierAccount: cashierAccountService,
  cashCollection: cashCollectionService,
  cashTransfer: cashTransferService,
  cashReconciliation: cashReconciliationService,
  bankReconciliation: bankReconciliationService,
  summary: treasurySummaryService,
};
