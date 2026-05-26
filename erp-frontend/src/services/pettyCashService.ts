import { api } from './api';
import {
  PettyCashFund,
  PettyCashVoucher,
  PettyCashReplenishment,
  PettyCashReceipt,
  CreatePettyCashFund,
  CreatePettyCashVoucher,
  CreatePettyCashReplenishment,
  PettyCashFundFilters,
  PettyCashVoucherFilters,
  PettyCashReplenishmentFilters,
  VoucherActionData,
  ReplenishmentActionData,
  PettyCashFundSummary,
} from '../types/pettyCash';

export const pettyCashService = {
  // ============================================
  // PETTY CASH FUNDS
  // ============================================

  async getFunds(filters?: PettyCashFundFilters): Promise<PettyCashFund[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.custodian) params.append('custodian', filters.custodian.toString());
    if (filters?.needs_replenishment !== undefined)
      params.append('needs_replenishment', filters.needs_replenishment.toString());

    const response = await api.get(`/cash-management/petty-cash-funds/?${params.toString()}`);
    return Array.isArray(response) ? response : (response?.results ?? []);
  },

  async getFund(id: number): Promise<PettyCashFund> {
    const response = await api.get(`/cash-management/petty-cash-funds/${id}/`);
    return response;
  },

  async createFund(data: CreatePettyCashFund): Promise<PettyCashFund> {
    const response = await api.post('/cash-management/petty-cash-funds/', data);
    return response;
  },

  async updateFund(id: number, data: Partial<CreatePettyCashFund>): Promise<PettyCashFund> {
    const response = await api.patch(`/cash-management/petty-cash-funds/${id}/`, data);
    return response;
  },

  async deleteFund(id: number): Promise<void> {
    await api.delete(`/cash-management/petty-cash-funds/${id}/`);
  },

  async setupFund(id: number, sourceAccountId: number): Promise<PettyCashFund> {
    const response = await api.post(`/cash-management/petty-cash-funds/${id}/setup/`, {
      source_account: sourceAccountId,
    });
    return response;
  },

  async getFundSummary(id: number): Promise<PettyCashFundSummary> {
    const response = await api.get(`/cash-management/petty-cash-funds/${id}/summary/`);
    return response;
  },

  /**
   * Get (or auto-create) the single petty cash fund.
   * Calls the backend /default/ endpoint which provisions the fund
   * against the 1102 Petty Cash GL account if none exists yet.
   */
  async getDefaultFund(): Promise<PettyCashFund> {
    const response = await api.get('/cash-management/petty-cash-funds/default/');
    return response;
  },

  // ============================================
  // PETTY CASH VOUCHERS
  // ============================================

  async getVouchers(filters?: PettyCashVoucherFilters): Promise<PettyCashVoucher[]> {
    const params = new URLSearchParams();
    if (filters?.fund) params.append('fund', filters.fund.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.requested_by) params.append('requested_by', filters.requested_by.toString());
    if (filters?.pending_approval !== undefined)
      params.append('pending_approval', filters.pending_approval.toString());
    if (filters?.awaiting_disbursement !== undefined)
      params.append('awaiting_disbursement', filters.awaiting_disbursement.toString());
    if (filters?.awaiting_retirement !== undefined)
      params.append('awaiting_retirement', filters.awaiting_retirement.toString());

    const response = await api.get(`/cash-management/petty-cash-vouchers/?${params.toString()}`);
    return Array.isArray(response) ? response : (response?.results ?? []);
  },

  async getVoucher(id: number): Promise<PettyCashVoucher> {
    const response = await api.get(`/cash-management/petty-cash-vouchers/${id}/`);
    return response;
  },

  async createVoucher(data: CreatePettyCashVoucher): Promise<PettyCashVoucher> {
    const response = await api.post('/cash-management/petty-cash-vouchers/', data);
    return response;
  },

  async updateVoucher(
    id: number,
    data: Partial<CreatePettyCashVoucher>
  ): Promise<PettyCashVoucher> {
    const response = await api.patch(`/cash-management/petty-cash-vouchers/${id}/`, data);
    return response;
  },

  async deleteVoucher(id: number): Promise<void> {
    await api.delete(`/cash-management/petty-cash-vouchers/${id}/`);
  },

  // Workflow Actions
  async submitVoucher(id: number): Promise<PettyCashVoucher> {
    const response = await api.post(`/cash-management/petty-cash-vouchers/${id}/submit/`, {});
    return response;
  },

  async approveVoucher(id: number, data: VoucherActionData): Promise<PettyCashVoucher> {
    const response = await api.post(`/cash-management/petty-cash-vouchers/${id}/approve/`, data);
    return response;
  },

  async rejectVoucher(id: number, data: VoucherActionData): Promise<PettyCashVoucher> {
    const response = await api.post(`/cash-management/petty-cash-vouchers/${id}/reject/`, data);
    return response;
  },

  async disburseVoucher(id: number, data: VoucherActionData): Promise<PettyCashVoucher> {
    const response = await api.post(`/cash-management/petty-cash-vouchers/${id}/disburse/`, data);
    return response;
  },

  async retireVoucher(id: number, data: VoucherActionData): Promise<PettyCashVoucher> {
    const response = await api.post(`/cash-management/petty-cash-vouchers/${id}/retire/`, data);
    return response;
  },

  // ============================================
  // PETTY CASH REPLENISHMENTS
  // ============================================

  async getReplenishments(
    filters?: PettyCashReplenishmentFilters
  ): Promise<PettyCashReplenishment[]> {
    const params = new URLSearchParams();
    if (filters?.fund) params.append('fund', filters.fund.toString());
    if (filters?.status) params.append('status', filters.status);

    const response = await api.get(
      `/cash-management/petty-cash-replenishments/?${params.toString()}`
    );
    return Array.isArray(response) ? response : (response?.results ?? []);
  },

  async getReplenishment(id: number): Promise<PettyCashReplenishment> {
    const response = await api.get(`/cash-management/petty-cash-replenishments/${id}/`);
    return response;
  },

  async createReplenishment(data: CreatePettyCashReplenishment): Promise<PettyCashReplenishment> {
    const response = await api.post('/cash-management/petty-cash-replenishments/', data);
    return response;
  },

  async updateReplenishment(
    id: number,
    data: Partial<CreatePettyCashReplenishment>
  ): Promise<PettyCashReplenishment> {
    const response = await api.patch(`/cash-management/petty-cash-replenishments/${id}/`, data);
    return response;
  },

  async deleteReplenishment(id: number): Promise<void> {
    await api.delete(`/cash-management/petty-cash-replenishments/${id}/`);
  },

  // Workflow Actions
  async submitReplenishment(id: number): Promise<PettyCashReplenishment> {
    const response = await api.post(`/cash-management/petty-cash-replenishments/${id}/submit/`, {});
    return response;
  },

  async verifyReplenishment(
    id: number,
    data: ReplenishmentActionData
  ): Promise<PettyCashReplenishment> {
    const response = await api.post(
      `/cash-management/petty-cash-replenishments/${id}/verify/`,
      data
    );
    return response;
  },

  async approveReplenishment(
    id: number,
    data: ReplenishmentActionData
  ): Promise<PettyCashReplenishment> {
    const response = await api.post(
      `/cash-management/petty-cash-replenishments/${id}/approve/`,
      data
    );
    return response;
  },

  async rejectReplenishment(
    id: number,
    data: ReplenishmentActionData
  ): Promise<PettyCashReplenishment> {
    const response = await api.post(
      `/cash-management/petty-cash-replenishments/${id}/reject/`,
      data
    );
    return response;
  },

  async postReplenishment(id: number): Promise<PettyCashReplenishment> {
    const response = await api.post(`/cash-management/petty-cash-replenishments/${id}/post/`, {});
    return response;
  },

  // Receipt operations
  async uploadReceipt(
    voucherId: number,
    file: File,
    description?: string
  ): Promise<PettyCashReceipt> {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }

    const response = await api.post(
      `/cash-management/petty-cash-vouchers/${voucherId}/upload_receipt/`,
      formData
    );
    return response;
  },

  async getVoucherReceipts(voucherId: number): Promise<PettyCashReceipt[]> {
    const response = await api.get(`/cash-management/petty-cash-vouchers/${voucherId}/receipts/`);
    return response;
  },

  async deleteReceipt(voucherId: number, receiptId: number): Promise<void> {
    await api.delete(`/cash-management/petty-cash-vouchers/${voucherId}/receipts/${receiptId}/`);
  },
};
