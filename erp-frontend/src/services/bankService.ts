/**
 * Bank Management Service
 * Handles API calls for banks, bank accounts, and transfers
 */

import { api } from './api';
import type {
  Bank,
  CreateBankRequest,
  BankAccount,
  CreateBankAccountRequest,
  BankTransfer,
  CreateBankTransferRequest,
  BankTransferActionRequest,
  BankAccountSummary,
  BankSummary,
  LedgerEntry,
  TransferFilters,
  BankAccountBalanceLog,
  BankPayment,
  CreateBankPaymentRequest,
  BankPaymentFilters,
  ApplyAdvanceRequest,
  ApplyAdvanceResult,
  BankFeedConsent,
  CreateFeedConsentRequest,
} from '../types/banks';

const BASE_URL = '/banks';

/**
 * Bank API Service
 */
export const bankService = {
  // ============= BANKS =============

  /**
   * List all banks
   */
  async listBanks(params?: { is_active?: boolean; search?: string }): Promise<Bank[]> {
    const res = await api.get(`${BASE_URL}/banks/`, params);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Get bank by ID
   */
  async getBank(id: number): Promise<Bank> {
    return api.get(`${BASE_URL}/banks/${id}/`);
  },

  /**
   * Create bank
   */
  async createBank(data: CreateBankRequest): Promise<Bank> {
    return api.post(`${BASE_URL}/banks/`, data);
  },

  /**
   * Update bank
   */
  async updateBank(id: number, data: Partial<CreateBankRequest>): Promise<Bank> {
    return api.patch(`${BASE_URL}/banks/${id}/`, data);
  },

  /**
   * Delete bank
   */
  async deleteBank(id: number): Promise<void> {
    return api.delete(`${BASE_URL}/banks/${id}/`);
  },

  /**
   * Get bank accounts list
   */
  async getBankAccounts(bankId: number): Promise<BankAccount[]> {
    return api.get(`${BASE_URL}/banks/${bankId}/accounts/`);
  },

  /**
   * Get bank summary
   */
  async getBankSummary(bankId: number): Promise<BankSummary> {
    return api.get(`${BASE_URL}/banks/${bankId}/summary/`);
  },

  // ============= BANK ACCOUNTS =============

  /**
   * List all bank accounts
   */
  async listBankAccounts(params?: {
    bank?: number;
    is_active?: boolean;
    is_cashier_collection_account?: boolean;
    search?: string;
  }): Promise<BankAccount[]> {
    const res = await api.get(`${BASE_URL}/bank-accounts/`, params);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Get bank account by ID
   */
  async getBankAccount(id: number): Promise<BankAccount> {
    return api.get(`${BASE_URL}/bank-accounts/${id}/`);
  },

  /**
   * Create bank account
   */
  async createBankAccount(data: CreateBankAccountRequest): Promise<BankAccount> {
    return api.post(`${BASE_URL}/bank-accounts/`, data);
  },

  /**
   * Update bank account
   */
  async updateBankAccount(
    id: number,
    data: Partial<CreateBankAccountRequest>
  ): Promise<BankAccount> {
    return api.patch(`${BASE_URL}/bank-accounts/${id}/`, data);
  },

  /**
   * Delete bank account
   */
  async deleteBankAccount(id: number): Promise<void> {
    return api.delete(`${BASE_URL}/bank-accounts/${id}/`);
  },

  /**
   * Get bank account ledger
   */
  async getBankAccountLedger(
    accountId: number,
    params?: { from_date?: string; to_date?: string; limit?: number }
  ): Promise<LedgerEntry[]> {
    return api.get(`${BASE_URL}/bank-accounts/${accountId}/ledger/`, params);
  },

  /**
   * Get bank account summary
   */
  async getBankAccountSummary(accountId: number): Promise<BankAccountSummary> {
    return api.get(`${BASE_URL}/bank-accounts/${accountId}/summary/`);
  },

  /**
   * Suspend bank account
   */
  async suspendBankAccount(accountId: number, reason: string): Promise<BankAccount> {
    return api.post(`${BASE_URL}/bank-accounts/${accountId}/suspend/`, { reason });
  },

  /**
   * Activate bank account
   */
  async activateBankAccount(accountId: number): Promise<BankAccount> {
    return api.post(`${BASE_URL}/bank-accounts/${accountId}/activate/`);
  },

  /**
   * Get balance logs for bank account
   */
  async getBankAccountBalanceLogs(
    accountId: number,
    params?: { limit?: number; offset?: number }
  ): Promise<{ count: number; results: BankAccountBalanceLog[] }> {
    return api.get(`${BASE_URL}/bank-accounts/${accountId}/balance-logs/`, params);
  },

  // ============= BANK TRANSFERS =============

  /**
   * List bank transfers
   */
  async listBankTransfers(filters?: TransferFilters): Promise<BankTransfer[]> {
    const res = await api.get(`${BASE_URL}/bank-transfers/`, filters);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Get bank transfer by ID
   */
  async getBankTransfer(id: number): Promise<BankTransfer> {
    return api.get(`${BASE_URL}/bank-transfers/${id}/`);
  },

  /**
   * Create bank transfer
   */
  async createBankTransfer(data: CreateBankTransferRequest): Promise<BankTransfer> {
    // Handle file upload if attachment exists
    if (data.attachment) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });
      return api.postFormData(`${BASE_URL}/bank-transfers/`, formData);
    }
    return api.post(`${BASE_URL}/bank-transfers/`, data);
  },

  /**
   * Update bank transfer
   */
  async updateBankTransfer(
    id: number,
    data: Partial<CreateBankTransferRequest>
  ): Promise<BankTransfer> {
    if (data.attachment) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });
      return api.patchFormData(`${BASE_URL}/bank-transfers/${id}/`, formData);
    }
    return api.patch(`${BASE_URL}/bank-transfers/${id}/`, data);
  },

  /**
   * Delete bank transfer
   */
  async deleteBankTransfer(id: number): Promise<void> {
    return api.delete(`${BASE_URL}/bank-transfers/${id}/`);
  },

  /**
   * Submit transfer for approval
   */
  async submitTransfer(id: number): Promise<BankTransfer> {
    return api.post(`${BASE_URL}/bank-transfers/${id}/submit/`);
  },

  /**
   * Approve transfer (first approval)
   */
  async approveTransfer(id: number, notes?: string): Promise<BankTransfer> {
    return api.post(`${BASE_URL}/bank-transfers/${id}/approve/`, { notes });
  },

  /**
   * Second approve transfer (dual approval)
   */
  async secondApproveTransfer(id: number, notes?: string): Promise<BankTransfer> {
    return api.post(`${BASE_URL}/bank-transfers/${id}/second_approve/`, { notes });
  },

  /**
   * Reject transfer
   */
  async rejectTransfer(id: number, reason: string): Promise<BankTransfer> {
    return api.post(`${BASE_URL}/bank-transfers/${id}/reject/`, { reason });
  },

  /**
   * Get pending approvals for current user
   */
  async getPendingApprovals(): Promise<BankTransfer[]> {
    return api.get(`${BASE_URL}/bank-transfers/pending-approvals/`);
  },

  /**
   * Get my transfers (initiated by current user)
   */
  async getMyTransfers(filters?: TransferFilters): Promise<BankTransfer[]> {
    return api.get(`${BASE_URL}/bank-transfers/my_transfers/`, filters);
  },

  // ============= BANK PAYMENTS =============

  /**
   * List bank payments
   */
  async listBankPayments(filters?: BankPaymentFilters): Promise<BankPayment[]> {
    const res = await api.get(`${BASE_URL}/bank-payments/`, filters);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Get bank payment by ID
   */
  async getBankPayment(id: number): Promise<BankPayment> {
    return api.get(`${BASE_URL}/bank-payments/${id}/`);
  },

  /**
   * Create bank payment
   */
  async createBankPayment(data: CreateBankPaymentRequest): Promise<BankPayment> {
    return api.post(`${BASE_URL}/bank-payments/`, data);
  },

  /**
   * Approve a bank payment (bank account manager only)
   */
  async approveBankPayment(id: number, notes?: string): Promise<BankPayment> {
    return api.post(`${BASE_URL}/bank-payments/${id}/approve/`, { notes: notes ?? '' });
  },

  /**
   * Reject a bank payment (bank account manager only)
   */
  async rejectBankPayment(id: number, reason: string): Promise<BankPayment> {
    return api.post(`${BASE_URL}/bank-payments/${id}/reject/`, { reason });
  },

  /**
   * Get payments pending current user's approval
   */
  async getPendingPaymentApprovals(): Promise<BankPayment[]> {
    const res = await api.get(`${BASE_URL}/bank-payments/pending-approvals/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Apply an on-account advance to an Accounts Payable record.
   * Posts: Dr Accounts Payable / Cr Supplier Advances
   */
  async applyAdvanceToPayable(id: number, data: ApplyAdvanceRequest): Promise<ApplyAdvanceResult> {
    return api.post(`${BASE_URL}/bank-payments/${id}/apply-advance/`, data);
  },

  /**
   * Perform transfer action (submit, approve, reject)
   */
  async performTransferAction(
    id: number,
    action: BankTransferActionRequest
  ): Promise<BankTransfer> {
    const endpoint = {
      submit: 'submit',
      approve: 'approve',
      second_approve: 'second_approve',
      reject: 'reject',
    }[action.action];

    return api.post(`${BASE_URL}/bank-transfers/${id}/${endpoint}/`, action);
  },

  // ===== BANK FEED CONSENTS (Open Banking — App 3) =====

  async listFeedConsents(params?: { client?: number; status?: string }): Promise<BankFeedConsent[]> {
    const res = await api.get(`${BASE_URL}/feed-consents/`, params);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getFeedConsent(id: number): Promise<BankFeedConsent> {
    return api.get(`${BASE_URL}/feed-consents/${id}/`);
  },

  async createFeedConsent(data: CreateFeedConsentRequest): Promise<BankFeedConsent> {
    return api.post(`${BASE_URL}/feed-consents/`, data);
  },

  async revokeConsent(id: number): Promise<BankFeedConsent> {
    return api.post(`${BASE_URL}/feed-consents/${id}/revoke/`);
  },
};

export default bankService;
