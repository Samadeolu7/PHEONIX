/**
 * Bank Statement Reconciliation Service (auto-match, Bank-Recon Java integration)
 * Handles API calls for uploading bank statements and reviewing match results
 */

import { api } from './api';
import type {
  DailyReconciliation,
  LinkResolveExceptionsRequest,
  OfficerReconciliationRiskFilters,
  OfficerReconciliationRiskRow,
  ReconciliationException,
  ReconciliationFilters,
  ReconciliationBankTransaction,
  ReconciliationTransactionsResponse,
  ResolveExceptionToExpenseRequest,
  RerunReconciliationRequest,
  ResolveExceptionRequest,
  UnmatchTransactionRequest,
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
   * Every bank-statement line ingested for this reconciliation's bank
   * account/date — matched and unmatched alike. Pass `matched: true/false`
   * to filter to one side; omit for everything. Previously the only
   * visibility into a reconciliation was its exceptions list, so a
   * cleanly-matched transfer (the common case) was invisible anywhere.
   */
  async getTransactions(
    reconciliationId: number,
    matched?: boolean
  ): Promise<ReconciliationTransactionsResponse> {
    return api.get(`${BASE_URL}/reconciliations/${reconciliationId}/transactions/`, {
      params: matched === undefined ? undefined : { matched: String(matched) },
    });
  },

  /**
   * Manually undo an incorrect auto-match so a genuinely outstanding
   * transaction isn't hidden behind a bad match. Director-only, mandatory
   * reason — the backend 403s/400s otherwise. Never touches the underlying
   * GL entry, only the reconciliation-side linkage.
   */
  async unmatchTransaction(
    reconciliationId: number,
    transactionId: string,
    data: UnmatchTransactionRequest
  ): Promise<ReconciliationBankTransaction> {
    return api.post(
      `${BASE_URL}/reconciliations/${reconciliationId}/transactions/${transactionId}/unmatch/`,
      data
    );
  },

  /**
   * Post a bank-only DEBIT exception (e.g. stamp duty, bank charges)
   * straight to a draft expense + pending payment. Branch manager or
   * director may initiate — the real control point is the separate bank
   * payment approval step. Does NOT resolve the exception; it resolves
   * automatically once the payment is approved+posted and a later rerun
   * matches it (see pending_bank_payment_info on the returned exception).
   */
  async resolveExceptionToExpense(
    reconciliationId: number,
    exceptionId: number,
    data: ResolveExceptionToExpenseRequest
  ): Promise<ReconciliationException> {
    return api.post(
      `${BASE_URL}/reconciliations/${reconciliationId}/exceptions/${exceptionId}/resolve-to-expense/`,
      data
    );
  },

  /**
   * Unresolved bank_only exceptions for a bank account, optionally narrowed
   * to one direction — used to populate the "link to another exception"
   * netting picker. Exceptions can span different reconciliation dates.
   */
  async listUnresolvedBankOnlyExceptions(
    bankAccountId: number,
    direction?: 'CREDIT' | 'DEBIT'
  ): Promise<ReconciliationException[]> {
    const res = await api.get(`${BASE_URL}/exceptions/`, {
      params: { bank_account: bankAccountId, ...(direction ? { direction } : {}) },
    });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Manually net a bank_only CREDIT exception against a bank_only DEBIT
   * exception on the same bank account (compensating-transfer scenario).
   * Director-only, exact amount match only — the backend 403s/400s otherwise.
   */
  async linkResolveExceptions(
    data: LinkResolveExceptionsRequest
  ): Promise<{ exception_a: ReconciliationException; exception_b: ReconciliationException }> {
    return api.post(`${BASE_URL}/exceptions/link-resolve/`, data);
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
