// src/services/bankStatementService.ts
/**
 * Bank Statement Reconciliation Service
 * Feature #2 — Bank Statement Upload & Reconciliation
 * Endpoints: /api/banks/statement-uploads/
 */
import { api } from './api';

export type MatchStatus = 'unmatched' | 'auto_matched' | 'manual_matched' | 'exception';
export type UploadStatus = 'uploaded' | 'processing' | 'processed' | 'failed';

export interface BankStatementLine {
  id: number;
  upload: number;
  line_date: string;
  description: string;
  debit_amount: string;
  credit_amount: string;
  running_balance: string;
  reference: string;
  match_status: MatchStatus;
  matched_transaction: number | null;
  matched_transaction_ref: string | null;
  match_confidence: string;
}

export interface BankStatementUpload {
  id: number;
  bank_account: number;
  bank_account_number: string;
  uploaded_by: number;
  uploaded_by_name: string | null;
  statement_date_from: string;
  statement_date_to: string;
  status: UploadStatus;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  error_detail: string;
  file: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStatementUploadData {
  bank_account: number;
  statement_date_from: string;
  statement_date_to: string;
  lines: Omit<BankStatementLine, 'id' | 'upload' | 'match_status' | 'matched_transaction' | 'matched_transaction_ref' | 'match_confidence'>[];
}

export interface ManualMatchData {
  line_id: number;
  transaction_id: number;
}

const BASE = '/banks/statement-uploads';

export const bankStatementService = {

  async listUploads(): Promise<BankStatementUpload[]> {
    const res = await api.get(`${BASE}/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getUpload(id: number): Promise<BankStatementUpload> {
    return api.get(`${BASE}/${id}/`);
  },

  async createUpload(data: CreateStatementUploadData): Promise<BankStatementUpload> {
    return api.post(`${BASE}/`, data);
  },

  async getUploadLines(id: number, match_status?: MatchStatus): Promise<BankStatementLine[]> {
    const res = await api.get(`${BASE}/${id}/lines/`, { params: match_status ? { match_status } : undefined });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getUnmatchedLines(id: number): Promise<BankStatementLine[]> {
    const res = await api.get(`${BASE}/${id}/unmatched-lines/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async matchLine(id: number, data: ManualMatchData): Promise<BankStatementLine> {
    return api.post(`${BASE}/${id}/match-line/`, data);
  },
};

export default bankStatementService;
