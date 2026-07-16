/**
 * Bank Statement Reconciliation Service (auto-match, Bank-Recon Java integration)
 * Handles API calls for uploading bank statements and reviewing match results
 */

import { api } from './api';
import type {
  DailyReconciliation,
  OfficerReconciliationRiskFilters,
  OfficerReconciliationRiskRow,
  ReconciliationException,
  ReconciliationFilters,
  RerunReconciliationRequest,
  ResolveExceptionRequest,
  UploadReconciliationRequest,
  UploadReconciliationResponse,
} from '../types/banks';

const BASE_URL = '/banks';

export const reconciliationService = {
  /**
   * List daily reconciliations for the authenticated user's branch
   */
  async listReconciliations(params?: ReconciliationFilters): Promise<DailyReconciliation[]> {
    const res = await api.get(`${BASE_URL}/reconciliations/`, { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Get a single reconciliation, including its exceptions
   */
  async getReconciliation(id: number): Promise<DailyReconciliation> {
    return api.get(`${BASE_URL}/reconciliations/${id}/`);
  },

  /**
   * Upload a bank statement (CSV, .xlsx, or .qif). The date(s) reconciled
   * are whatever value dates are actually present in the file — a
   * multi-day statement produces one DailyReconciliation per distinct
   * date, each matched in the background (see banks/tasks.py). The caller
   * is responsible for showing a wait state per reconciliation (see
   * ReconciliationWaitState).
   */
  async uploadStatement(data: UploadReconciliationRequest): Promise<UploadReconciliationResponse> {
    const formData = new FormData();
    formData.append('bank_account_id', String(data.bank_account_id));
    formData.append('statement_file', data.statement_file);
    if (data.include_debits) {
      formData.append('include_debits', 'true');
    }
    return api.postFormData(`${BASE_URL}/reconciliations/upload/`, formData);
  },

  /**
   * Re-trigger matching for an existing reconciliation with no new file —
   * e.g. right after a director resolves exceptions, or when new ERP
   * entries land with no accompanying new statement.
   */
  async rerunReconciliation(id: number, data?: RerunReconciliationRequest): Promise<DailyReconciliation> {
    return api.post(`${BASE_URL}/reconciliations/${id}/rerun/`, data ?? {});
  },

  /**
   * Mark a reconciliation exception as resolved, with notes explaining why.
   * Only directors have this authority — the backend 403s otherwise.
   */
  async resolveException(
    reconciliationId: number,
    exceptionId: number,
    data: ResolveExceptionRequest
  ): Promise<ReconciliationException> {
    return api.patch(
      `${BASE_URL}/reconciliations/${reconciliationId}/exceptions/${exceptionId}/resolve/`,
      data
    );
  },

  /**
   * Per-officer accountability signals — match rate, reference compliance,
   * average posting lag, outstanding high-priority exceptions — across ALL
   * of an officer's reconciliation activity, not just outstanding cases.
   * Branch-scoped server-side the same way as the dashboard analytics
   * endpoints (director sees every branch, optionally narrowed via the
   * X-Branch-ID header already attached by the shared api client).
   */
  async getOfficerRiskReport(
    params?: OfficerReconciliationRiskFilters
  ): Promise<OfficerReconciliationRiskRow[]> {
    const res = await api.get(`${BASE_URL}/reports/officer-reconciliation-risk/`, { params });
    return res?.results ?? [];
  },
};
