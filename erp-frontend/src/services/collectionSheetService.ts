/**
 * Collection Sheet Service
 * Handles DailyCollectionSheet and CollectionSheetItem API calls.
 * Base URL: /api/cash-management/collection-sheets/
 *           /api/cash-management/collection-sheet-items/
 */

import api from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export type SheetStatus = 'draft' | 'active' | 'submitted' | 'reconciled';
export type PaymentMode = 'cash' | 'bank_transfer' | 'mobile_money';
export type CollectionType = 'loan_repayment' | 'savings_deposit' | 'processing_fee';
export type ItemStatus = 'pending' | 'collected' | 'waived' | 'skipped';
export type TransferConfirmationStatus = 'na' | 'pending' | 'confirmed' | 'rejected';

export interface DailyCollectionSheet {
  id: number;
  credit_officer: number;
  credit_officer_name: string | null;
  collection_date: string;        // 'YYYY-MM-DD'
  status: SheetStatus;
  status_display: string;
  total_expected: string;
  total_collected_cash: string;
  total_confirmed_transfers: string;
  total_unconfirmed_transfers: string;
  total_items: number;
  total_collected: string;
  submitted_at: string | null;
  submitted_to: number | null;
  submitted_to_name: string | null;
  reconciled_at: string | null;
  reconciled_by: number | null;
  reconciled_by_name: string | null;
  overdue_notified: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DailyCollectionSheetDetail extends DailyCollectionSheet {
  items: CollectionSheetItem[];
}

export interface CollectionSheetItem {
  id: number;
  sheet: number;
  client: number;
  client_name: string | null;
  collection_type: CollectionType;
  collection_type_display: string;
  loan_account: number | null;
  loan_installment: number | null;
  savings_account: number | null;
  amount_expected: string;
  amount_collected: string;
  payment_mode: PaymentMode;
  payment_mode_display: string;
  bank_reference: string;
  bank_account_credited: number | null;
  transfer_confirmation_status: TransferConfirmationStatus;
  transfer_status_display: string;
  transfer_confirmed_by: number | null;
  transfer_confirmed_by_name: string | null;
  transfer_confirmed_at: string | null;
  status: ItemStatus;
  status_display: string;
  is_posted: boolean;
  posted_at: string | null;
  journal_entry: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CollectItemPayload {
  amount_collected: string;
  payment_mode: PaymentMode;
  bank_reference?: string;
  bank_account_credited?: number | null;
  status?: ItemStatus;
  notes?: string;
}

export interface SubmitSheetPayload {
  submitted_to: number;
  notes?: string;
}

export interface CreateSheetPayload {
  credit_officer?: number;
  collection_date: string;
  notes?: string;
}

// ── Service ────────────────────────────────────────────────────────────────

const BASE = '/cash-management/collection-sheets';
const ITEMS_BASE = '/cash-management/collection-sheet-items';

export const collectionSheetService = {
  /** List sheets. Optionally filter: status, collection_date, credit_officer */
  async list(params?: Record<string, string>): Promise<DailyCollectionSheet[]> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await api.get(`${BASE}/${query}`);
    const data = res.data;
    return Array.isArray(data) ? data : (data.results ?? []);
  },

  /** Retrieve a sheet with full nested items (detail serializer). */
  async retrieve(id: number): Promise<DailyCollectionSheetDetail> {
    const res = await api.get(`${BASE}/${id}/`);
    return res.data;
  },

  /** Create a new draft sheet. */
  async create(payload: CreateSheetPayload): Promise<DailyCollectionSheet> {
    const res = await api.post(`${BASE}/`, payload);
    return res.data;
  },

  /** Activate a draft sheet (Feature #14: blocked if prior unreconciled sheet). */
  async activate(id: number): Promise<DailyCollectionSheet> {
    const res = await api.post(`${BASE}/${id}/activate/`);
    return res.data;
  },

  /** Auto-generate items from today's loan repayment schedule. */
  async generateFromSchedule(id: number): Promise<{ created: number; skipped: number; message: string }> {
    const res = await api.post(`${BASE}/${id}/generate-from-schedule/`);
    return res.data;
  },

  /** Officer submits EOD sheet to superior. */
  async submit(id: number, payload: SubmitSheetPayload): Promise<DailyCollectionSheet> {
    const res = await api.post(`${BASE}/${id}/submit/`, payload);
    return res.data;
  },

  /**
   * BM/Supervisor reconciles the sheet.
   * Feature #13: This triggers GL sweep (total_collected_cash → branch bank).
   * Frontend shows confirmation modal BEFORE calling this.
   */
  async reconcile(id: number): Promise<DailyCollectionSheet> {
    const res = await api.post(`${BASE}/${id}/reconcile/`);
    return res.data;
  },

  /** Get items with pending bank transfer confirmation. */
  async pendingTransfers(id: number): Promise<CollectionSheetItem[]> {
    const res = await api.get(`${BASE}/${id}/pending-transfers/`);
    return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  },

  // ── Items ────────────────────────────────────────────────────────────────

  /** List items for a specific sheet. */
  async listItems(sheetId: number): Promise<CollectionSheetItem[]> {
    const res = await api.get(`${ITEMS_BASE}/?sheet=${sheetId}`);
    const data = res.data;
    return Array.isArray(data) ? data : (data.results ?? []);
  },

  /**
   * Record what the officer collected (amount + payment mode).
   * Feature #8: The UI restricts payment_mode for CO to cash + bank_transfer only.
   */
  async collectItem(itemId: number, payload: CollectItemPayload): Promise<CollectionSheetItem> {
    const res = await api.post(`${ITEMS_BASE}/${itemId}/collect/`, payload);
    return res.data;
  },

  /** Post a cash collection to the GL. */
  async postPayment(itemId: number): Promise<CollectionSheetItem> {
    const res = await api.post(`${ITEMS_BASE}/${itemId}/post-payment/`);
    return res.data;
  },

  /** Supervisor confirms a bank transfer and posts to GL. */
  async confirmTransfer(itemId: number, bankAccountCredited?: number): Promise<CollectionSheetItem> {
    const payload = bankAccountCredited ? { bank_account_credited: bankAccountCredited } : {};
    const res = await api.post(`${ITEMS_BASE}/${itemId}/confirm-transfer/`, payload);
    return res.data;
  },

  /** Supervisor rejects a pending bank transfer. */
  async rejectTransfer(itemId: number, reason?: string): Promise<CollectionSheetItem> {
    const res = await api.post(`${ITEMS_BASE}/${itemId}/reject-transfer/`, { reason: reason ?? '' });
    return res.data;
  },

  /**
   * Feature #14: Check if the current officer has any unreconciled sheets
   * from before today. Returns prior-day submitted sheets.
   */
  async getUnreconciledPriorSheets(todayDateStr: string): Promise<DailyCollectionSheet[]> {
    const res = await api.get(`${BASE}/?status=submitted`);
    const data = res.data;
    const all: DailyCollectionSheet[] = Array.isArray(data) ? data : (data.results ?? []);
    // Filter to only sheets from before today (collection_date < todayDateStr)
    return all.filter((s) => s.collection_date < todayDateStr);
  },
};
