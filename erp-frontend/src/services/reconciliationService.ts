/**
 * Bank Statement Reconciliation Service (auto-match, Bank-Recon Java integration)
 * Handles API calls for uploading bank statements and reviewing match results
 */

import { api } from './api';
import type {
  BulkCleanUpStrandedPairsRequest,
  BulkCleanUpStrandedPairsPreview,
  BulkCleanUpStrandedPairsResult,
  BulkCreateOfficerEvidenceThreadsPreview,
  BulkCreateOfficerEvidenceThreadsResult,
  BulkLinkResolveBankChargeRequest,
  BulkLinkResolveBankChargePreview,
  BulkLinkResolveBankChargeResult,
  BulkRerunReconciliationRequest,
  BulkRerunReconciliationResponse,
  DailyReconciliation,
  LinkResolveBankChargeRequest,
  LinkResolveBankChargeResponse,
  LinkResolveExceptionsRequest,
  ManualOverridesReportFilters,
  ManualOverridesReportResponse,
  MissingMoneySummary,
  MissingMoneySummaryFilters,
  OfficerReconciliationRiskFilters,
  OfficerReconciliationRiskRow,
  PaymentTraceResponse,
  ReconciliationException,
  ReconciliationFilters,
  ReconciliationBankTransaction,
  ReconciliationTransactionsResponse,
  ResolveExceptionToExpenseRequest,
  RerunReconciliationRequest,
  ResolveExceptionRequest,
  SecondResolveExceptionRequest,
  UnmatchTransactionRequest,
  UnresolveExceptionRequest,
  UnresolveExceptionResponse,
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
   * Re-trigger matching for ALL non-processing reconciliations — picks up
   * newly approved/posted ERP payments (expenses, disbursements, bank
   * charges) across all days and bank accounts so they can be auto-matched.
   */
  async bulkRerunReconciliations(data?: BulkRerunReconciliationRequest): Promise<BulkRerunReconciliationResponse> {
    return api.post(`${BASE_URL}/reconciliations/bulk-rerun/`, data ?? {});
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
   * Confirming half of dual-approval resolution — only reachable once a
   * first director has already acted on an exception at/above the dual-
   * approval threshold (requires_dual_approval_to_resolve). Must be a
   * different director from the first; the backend 403s otherwise.
   */
  async secondResolveException(
    reconciliationId: number,
    exceptionId: number,
    data: SecondResolveExceptionRequest
  ): Promise<ReconciliationException> {
    return api.patch(
      `${BASE_URL}/reconciliations/${reconciliationId}/exceptions/${exceptionId}/resolve/second/`,
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
   * Reopen an exception that was resolved standalone (the plain per-row
   * Resolve action) before it was properly paired against its real
   * counterpart — e.g. an erp_only exception resolved with a generic note
   * instead of being Linked to the bank_only line it actually belonged to.
   * Director-only, mandatory reason. Refuses anything resolved via Link/
   * Bulk-Link (netted_with set) or with a pending/posted payment attached
   * — the backend 400s in those cases with an explanation.
   */
  async unresolveException(
    exceptionId: number,
    data: UnresolveExceptionRequest
  ): Promise<UnresolveExceptionResponse> {
    return api.post(`${BASE_URL}/exceptions/${exceptionId}/unresolve/`, data);
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
   * Valid partners for manually linking against the given exception — used
   * to populate the "link to another exception" picker. Covers both
   * bank_only+bank_only (opposite direction, compensating transfer) and
   * bank_only+erp_only (same direction, missed auto-match) pairings; the
   * server computes which apply based on the source exception's own type
   * and direction. Candidates can span different reconciliation dates.
   */
  async getLinkCandidates(exceptionId: number): Promise<ReconciliationException[]> {
    const res = await api.get(`${BASE_URL}/exceptions/${exceptionId}/link-candidates/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Manually link two exceptions on the same bank account together and
   * resolve both at once — either two bank_only exceptions with opposite
   * directions (a compensating transfer) or a bank_only/erp_only pair with
   * the same direction (a missed auto-match). Director-only, exact amount
   * match only — the backend 403s/400s otherwise.
   */
  async linkResolveExceptions(
    data: LinkResolveExceptionsRequest
  ): Promise<{ exception_a: ReconciliationException; exception_b: ReconciliationException }> {
    return api.post(`${BASE_URL}/exceptions/link-resolve/`, data);
  },

  /**
   * Link a bank_only DEBIT exception against an erp_only DEBIT exception
   * whose amount is up to FEE_LINK_MAX_AMOUNT lower — the bank-deducted-
   * transfer-fee pattern (e.g. the MOVEB series) — and resolve both, while
   * also creating a draft "Bank Charges" Expense + pending BankPayment for
   * the fee difference so it still goes through the normal director-gated
   * approval step before posting to the GL. Director-only.
   */
  async linkResolveBankCharge(
    data: LinkResolveBankChargeRequest
  ): Promise<LinkResolveBankChargeResponse> {
    return api.post(`${BASE_URL}/exceptions/link-resolve-bank-charge/`, data);
  },

  /**
   * Batch version of linkResolveBankCharge — auto-pairs every unambiguous
   * bank_only/erp_only DEBIT bank-charge match on one bank account and
   * resolves them all at once. Always call with dry_run: true first to
   * preview what would happen (pairs found, total fee, ambiguous/unmatched
   * counts) — there's no per-pair confirmation once the real run starts.
   */
  async bulkLinkResolveBankChargePreview(
    data: Omit<BulkLinkResolveBankChargeRequest, 'dry_run'>
  ): Promise<BulkLinkResolveBankChargePreview> {
    return api.post(`${BASE_URL}/exceptions/bulk-link-resolve-bank-charge/`, { ...data, dry_run: true });
  },

  async bulkLinkResolveBankCharge(
    data: Omit<BulkLinkResolveBankChargeRequest, 'dry_run'>
  ): Promise<BulkLinkResolveBankChargeResult> {
    return api.post(`${BASE_URL}/exceptions/bulk-link-resolve-bank-charge/`, { ...data, dry_run: false });
  },

  /**
   * Global "Clean Up" scan across every bank account the requesting user
   * can see: finds bank_only/erp_only exceptions resolved standalone (the
   * plain per-row Resolve action, netted_with and pending_bank_payment both
   * still None) whose real counterpart is still unresolved, and previews
   * reopening + properly linking them. Handles both exact-amount matches
   * (no fee) and DEBIT fee-tolerant matches (creates a real "Bank Charges"
   * payment). Structurally can never double-charge an already-linked pair.
   */
  async bulkCleanUpStrandedPairsPreview(): Promise<BulkCleanUpStrandedPairsPreview> {
    return api.post(`${BASE_URL}/exceptions/bulk-clean-up-stranded-pairs/`, { dry_run: true });
  },

  async bulkCleanUpStrandedPairs(
    data: Omit<BulkCleanUpStrandedPairsRequest, 'dry_run'>
  ): Promise<BulkCleanUpStrandedPairsResult> {
    return api.post(`${BASE_URL}/exceptions/bulk-clean-up-stranded-pairs/`, { ...data, dry_run: false });
  },

  /**
   * For every officer with unresolved erp_only exceptions that have NO
   * plausible bank_only counterpart anywhere on their bank account (as
   * opposed to ambiguous/exact/fee-tolerant pairs, which already have real
   * bank money nearby and are Clean Up's job, not an evidence request),
   * creates one Discussions thread addressed to that officer listing every
   * such item and asking them to attach evidence. Run this AFTER Clean Up
   * has closed out everything it safely can.
   */
  async bulkCreateOfficerEvidenceThreadsPreview(): Promise<BulkCreateOfficerEvidenceThreadsPreview> {
    return api.post(`${BASE_URL}/exceptions/bulk-create-officer-evidence-threads/`, { dry_run: true });
  },

  async bulkCreateOfficerEvidenceThreads(
    excludedExceptionIds: number[] = []
  ): Promise<BulkCreateOfficerEvidenceThreadsResult> {
    return api.post(`${BASE_URL}/exceptions/bulk-create-officer-evidence-threads/`, {
      dry_run: false,
      excluded_exception_ids: excludedExceptionIds,
    });
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

  /**
   * Audit trail for the three most abuse-prone manual pathways: unmatch,
   * link-resolve (netting), and resolve-to-expense. Branch-scoped the same
   * way as every other reconciliation endpoint (director sees every
   * branch, everyone else pinned to their own).
   */
  async getManualOverridesReport(
    params?: ManualOverridesReportFilters
  ): Promise<ManualOverridesReportResponse> {
    return api.get(`${BASE_URL}/reports/manual-overrides/`, { params });
  },

  /**
   * How much is actually missing right now, and from whom — unresolved
   * erp_only (attributable to the officer who recorded it) and bank_only
   * (attributable to the bank account) totals, each broken down for
   * drill-down. Branch-scoped like every other reconciliation report.
   */
  async getMissingMoneySummary(
    params?: MissingMoneySummaryFilters
  ): Promise<MissingMoneySummary> {
    return api.get(`${BASE_URL}/reports/missing-money-summary/`, { params });
  },

  /**
   * Every unresolved erp_only exception attributed to one officer — pass
   * 'unattributed' for the no-officer bucket.
   */
  async getMissingMoneyByOfficer(officerId: number | 'unattributed'): Promise<ReconciliationException[]> {
    const res = await api.get(`${BASE_URL}/reports/missing-money-summary/officer/${officerId}/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * Every unresolved bank_only exception on one bank account.
   */
  async getMissingMoneyByBankAccount(bankAccountId: number): Promise<ReconciliationException[]> {
    const res = await api.get(`${BASE_URL}/reports/missing-money-summary/bank-account/${bankAccountId}/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  /**
   * The investigation search: pass a reference number, an exact amount, or
   * free-text narration and get back every payment and every statement
   * line that matches, along with their full linkage/exception story —
   * including lines that USED to claim a payment before an unmatch. Built
   * for "someone came with strong evidence" — a director can see exactly
   * what a payment was wrongly linked to and act with Unmatch/Unresolve/
   * Link, which frees the true counterpart to be found and paired.
   */
  async tracePayment(query: string): Promise<PaymentTraceResponse> {
    return api.get(`${BASE_URL}/reconciliations/payment-trace/`, { params: { q: query } });
  },
};
