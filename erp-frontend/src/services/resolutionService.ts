// src/services/resolutionService.ts
/**
 * Reconciliation resolution cases — maker (officer / branch manager) →
 * branch manager recommends → director approves (and can dissolve).
 * Consumes /api/banks/resolutions/ (banks/views.py, rules in banks/resolution_service.py).
 */
import { api } from './api';

export type ResolutionKind = 'link' | 'dispute' | 'reversal';
export type ResolutionStatus = 'proposed' | 'recommended' | 'approved' | 'rejected' | 'dissolved' | 'cancelled';
export type NameCheck = 'CONFIRMED' | 'UNKNOWN' | 'CONTRADICTED';

export interface ResolutionFacts {
  erp?: {
    payment_id: number;
    amount: string;
    date_claimed: string | null;
    posted_at: string | null;
    description: string;
    reference: string;
    loan_number: string | null;
    client_name: string;
    officer_name: string | null;
  };
  bank?: {
    date: string;
    amount: string;
    narration: string;
    bank_ref: string;
    account: string;
    currently_matched: boolean;
    previously_unmatched_at: string | null;
    previously_unmatched_reason: string;
    matched_to?: { payment_id: number; description: string; date: string | null; officer_name: string | null };
  } | null;
  checks?: {
    amount_equal?: boolean;
    name_check?: NameCheck;
    date_gap_days?: number | null;
    posted_after_bank_line?: boolean;
    reference_in_bank_line?: boolean;
    same_bank_account?: boolean;
  };
  officer_record?: {
    open_not_in_bank?: number;
    disputes_raised?: number;
    disputes_rejected_30d?: number;
    cases_dissolved?: number;
  };
  flags?: string[];
  is_clean?: boolean;
}

export interface ResolutionCase {
  id: number;
  reference_number: string;
  kind: ResolutionKind;
  kind_label: string;
  status: ResolutionStatus;
  status_label: string;
  amount: string;
  reason: string;
  branch_name: string | null;
  bank_account_name: string;
  erp_exception_id: number;
  evidence_url: string | null;
  facts: ResolutionFacts;
  proposed_by_name: string | null;
  proposed_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string;
  dissolved_by_name: string | null;
  dissolved_at: string | null;
  dissolve_reason: string;
  respondent_name: string | null;
  respondent_response: string;
  respondent_responded_at: string | null;
  dispute_wait_until: string | null;
  reversal_reference: string | null;
  actions: {
    can_review: boolean;
    can_approve: boolean;
    waiting_for_respondent: boolean;
    can_reject: boolean;
    can_dissolve: boolean;
    can_respond: boolean;
    can_cancel: boolean;
    is_clean: boolean;
  };
}

export interface MatchCandidate {
  bank_transaction_id: string;
  bank_exception_id?: number;
  date: string;
  amount: string;
  narration: string;
  name_check: NameCheck;
  date_gap_days: number;
}

export type ResolutionQueue = 'review' | 'approve' | 'mine' | 'history';

const BASE = '/banks/resolutions';

export const resolutionService = {
  async list(queue: ResolutionQueue): Promise<ResolutionCase[]> {
    const params: Record<string, string> =
      queue === 'history' ? { status: 'approved,rejected,dissolved,cancelled' } : { queue };
    const res = await api.get(`${BASE}/`, { params });
    return res?.results ?? [];
  },

  async get(id: number): Promise<ResolutionCase> {
    return api.get(`${BASE}/${id}/`);
  },

  async candidates(erpExceptionId: number): Promise<{ unmatched: MatchCandidate[]; matched: MatchCandidate[] }> {
    return api.get(`/banks/pending-repayments/${erpExceptionId}/candidates/`);
  },

  async propose(input: {
    erp_exception_id: number;
    kind: ResolutionKind;
    reason: string;
    bank_exception_id?: number;
    bank_transaction_id?: string;
    evidence?: File | null;
  }): Promise<ResolutionCase> {
    const form = new FormData();
    form.append('erp_exception_id', String(input.erp_exception_id));
    form.append('kind', input.kind);
    form.append('reason', input.reason);
    if (input.bank_exception_id) form.append('bank_exception_id', String(input.bank_exception_id));
    if (input.bank_transaction_id) form.append('bank_transaction_id', input.bank_transaction_id);
    if (input.evidence) form.append('evidence', input.evidence);
    return api.postFormData(`${BASE}/`, form);
  },

  async review(id: number, recommend: boolean, notes: string): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/review/`, { recommend, notes });
  },
  async approve(id: number, notes: string): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/approve/`, { notes });
  },
  async reject(id: number, reason: string): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/reject/`, { reason });
  },
  async dissolve(id: number, reason: string): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/dissolve/`, { reason });
  },
  async respond(id: number, response: string): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/respond/`, { response });
  },
  async cancel(id: number): Promise<ResolutionCase> {
    return api.post(`${BASE}/${id}/cancel/`, {});
  },
  async bulkApprove(ids: number[], notes: string): Promise<{ approved: string[]; skipped: { id: number; reference: string; reason: string }[] }> {
    return api.post(`${BASE}/bulk-approve/`, { ids, notes });
  },
};
