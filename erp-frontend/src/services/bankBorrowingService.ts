/**
 * Treasury service: bank borrowings, per-branch liquidity forecast and the loan liquidity gate.
 * Backend: erp-backend/phoenix_erp/src/treasury (mounted at /api/treasury/).
 */
import { api } from './api';
import type {
  BranchForecast,
  Borrowing,
  BorrowingInput,
  BorrowingPreview,
  BorrowingSummary,
  BankAccountChoice,
  LiquidityCheck,
  TreasurySettings,
} from '../types/bankBorrowing';

const BASE = '/treasury';

export const bankBorrowingService = {
  async listBorrowings(status?: string): Promise<BorrowingSummary[]> {
    const res = await api.get(`${BASE}/borrowings/`, { params: status ? { status } : undefined });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getBorrowing(id: number): Promise<Borrowing> {
    return api.get(`${BASE}/borrowings/${id}/`);
  },

  async previewBorrowing(data: BorrowingInput): Promise<BorrowingPreview> {
    return api.post(`${BASE}/borrowings/preview/`, data);
  },

  async createBorrowing(data: BorrowingInput): Promise<Borrowing> {
    return api.post(`${BASE}/borrowings/`, data);
  },

  async deleteBorrowing(id: number): Promise<void> {
    await api.delete(`${BASE}/borrowings/${id}/`);
  },

  async listBankAccountChoices(): Promise<BankAccountChoice[]> {
    const res = await api.get(`${BASE}/bank-accounts/`);
    return Array.isArray(res) ? res : [];
  },

  async receiveBorrowing(id: number, receivedOn?: string): Promise<Borrowing> {
    return api.post(`${BASE}/borrowings/${id}/receive/`, receivedOn ? { received_on: receivedOn } : {});
  },

  async sendContribution(id: number, sentOn?: string): Promise<Borrowing> {
    return api.post(`${BASE}/borrowings/contributions/${id}/send/`, sentOn ? { paid_on: sentOn } : {});
  },

  async recordInstalment(id: number, paidOn?: string): Promise<Borrowing> {
    return api.post(`${BASE}/borrowings/instalments/${id}/record/`, paidOn ? { paid_on: paidOn } : {});
  },

  async getForecast(branchId?: number, days?: number): Promise<BranchForecast> {
    return api.get(`${BASE}/forecast/`, { params: { branch: branchId, days } });
  },

  async checkLoan(loanId: number, stage: 'approval' | 'disbursement'): Promise<LiquidityCheck> {
    return api.get(`${BASE}/liquidity-check/loan/${loanId}/`, { params: { stage } });
  },

  async getSettings(): Promise<TreasurySettings> {
    return api.get(`${BASE}/settings/`);
  },

  async updateSettings(data: Partial<TreasurySettings>): Promise<TreasurySettings> {
    return api.patch(`${BASE}/settings/`, data);
  },
};
