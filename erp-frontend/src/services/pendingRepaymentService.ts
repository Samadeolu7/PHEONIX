// src/services/pendingRepaymentService.ts
/**
 * Pending Bank Repayments — open repayment gaps from statement reconciliation,
 * visible to every member of the branch:
 *   bank_only — money reached the bank, no repayment recorded in the ERP
 *   erp_only  — repayment recorded in the ERP, money never reached the bank
 * Consumes /api/banks/pending-repayments/ (banks/views.py::PendingRepaymentsView).
 */
import { api } from './api';

export type PendingRepaymentKind = 'bank_only' | 'erp_only';

export interface PendingRepayment {
  id: number;
  kind: PendingRepaymentKind;
  reconciliation_id: number;
  date: string | null;
  days_pending: number | null;
  amount: string;
  narration: string;
  /** erp_only: who recorded the repayment in the ERP */
  recorded_by_name: string | null;
  recorded_by_me: boolean;
  bank_account_id: number;
  bank_account_name: string;
  branch_name: string | null;
  claimed_by: number | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  claim_note: string;
  claimed_by_me: boolean;
}

export interface PendingRepaymentKindTotals {
  count: number;
  amount: string;
  unclaimed_count: number;
  unclaimed_amount: string;
  claimed_by_me_count: number;
  oldest_days: number | null;
}

export interface PendingRepaymentTotals extends PendingRepaymentKindTotals {
  bank_only: PendingRepaymentKindTotals;
  erp_only: PendingRepaymentKindTotals & { recorded_by_me_count: number };
}

export type PendingRepaymentStatus = 'all' | 'unclaimed' | 'claimed' | 'mine';

const BASE = '/banks/pending-repayments';

export const pendingRepaymentService = {
  async list(
    kind: PendingRepaymentKind,
    status: PendingRepaymentStatus = 'all',
  ): Promise<{ totals: PendingRepaymentTotals; results: PendingRepayment[] }> {
    return api.get(`${BASE}/`, { params: { kind, status: status === 'all' ? undefined : status } });
  },

  async summary(): Promise<PendingRepaymentTotals> {
    return api.get(`${BASE}/summary/`);
  },

  async claim(id: number, note = ''): Promise<PendingRepayment> {
    return api.post(`${BASE}/${id}/claim/`, { note });
  },

  async release(id: number): Promise<PendingRepayment> {
    return api.delete(`${BASE}/${id}/claim/`);
  },
};
