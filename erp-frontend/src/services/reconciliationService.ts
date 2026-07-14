/**
 * Bank Statement Reconciliation Service (auto-match, Bank-Recon Java integration)
 * Handles API calls for uploading bank statements and reviewing match results
 */

import { api } from './api';
import type {
  DailyReconciliation,
  ReconciliationException,
  ReconciliationFilters,
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
   * Mark a reconciliation exception as resolved, with notes explaining why
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
};
