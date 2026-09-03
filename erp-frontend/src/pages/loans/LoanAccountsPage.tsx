/**
 * Loan Accounts Page
 * Lists all loan accounts with filtering by status, risk, and search.
 * Data is scoped server-side to clients assigned to the logged-in officer.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Wrench,
  X,
  CheckCircle,
} from 'lucide-react';
import { LoanAccountList, loanService, BulkScheduleRepairSummary } from '../../services/loanService';
import { useLoanAccounts } from '../../hooks/useLoans';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import { usePermission } from '../../hooks/usePermissions';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  approved:   'bg-blue-100 text-blue-700',
  disbursed:  'bg-indigo-100 text-indigo-700',
  active:     'bg-green-100 text-green-700',
  defaulted:  'bg-orange-100 text-orange-700',
  paid_off:   'bg-gray-100 text-gray-600',
  written_off:'bg-red-100 text-red-700',
  rejected:   'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

const RISK_BADGE: Record<string, string> = {
  performing:   'bg-green-100 text-green-700',
  watch:        'bg-yellow-100 text-yellow-700',
  substandard:  'bg-orange-100 text-orange-700',
  doubtful:     'bg-red-100 text-red-700',
  loss:         'bg-red-200 text-red-800',
};

const LOAN_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'active', label: 'Active' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'paid_off', label: 'Paid Off' },
  { value: 'written_off', label: 'Written Off' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RISK_LEVELS = [
  { value: '', label: 'All Risk Levels' },
  { value: 'performing', label: 'Performing' },
  { value: 'watch', label: 'Watch' },
  { value: 'substandard', label: 'Substandard' },
  { value: 'doubtful', label: 'Doubtful' },
  { value: 'loss', label: 'Loss' },
];

// ── Bulk Repair Schedule Modal ───────────────────────────────────────────
// Book-wide version of the single-loan "Repair Schedule" action (loan
// detail page) — runs schedule_repair_service.repair_schedule() across
// every active/disbursed/defaulted loan via a background Celery task
// (loans/tasks.py: bulk_repair_loan_schedules), since it can't be relied on
// to finish inside one HTTP request for a large book. Same safety
// guarantees per loan apply here too: a loan that isn't actually broken is
// left byte-for-byte untouched, so this always dry-runs first.

const BULK_REPAIR_MIN_REASON_LENGTH = 15;
const POLL_INTERVAL_MS = 3000;

function BulkRepairScheduleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'polling-preview' | 'preview' | 'polling-apply' | 'applied'>('idle');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<BulkScheduleRepairSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'polling-preview' && phase !== 'polling-apply') return;
    let cancelled = false;
    let taskId: string | null = null;

    async function poll(id: string) {
      while (!cancelled) {
        const status = await loanService.getBulkScheduleRepairStatus(id);
        if (status.status === 'SUCCESS' && status.result) {
          if (cancelled) return;
          setSummary(status.result);
          setPhase((p) => (p === 'polling-preview' ? 'preview' : 'applied'));
          return;
        }
        if (status.status === 'FAILURE') {
          if (cancelled) return;
          setError('The bulk repair job failed unexpectedly — nothing further was applied for the loans it hadn\'t already reached.');
          setPhase('idle');
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    (async () => {
      try {
        const queued = await loanService.queueBulkScheduleRepair(
          phase === 'polling-preview', phase === 'polling-apply' ? reason.trim() : undefined,
        );
        taskId = queued.task_id;
        await poll(queued.task_id);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Could not queue the bulk repair job.');
          setPhase('idle');
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'polling-preview', phase === 'polling-apply']);

  const reasonReady = reason.trim().length >= BULK_REPAIR_MIN_REASON_LENGTH;

  function handleDone() {
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Bulk Repair Schedules</h2>
        <p className="mb-4 text-xs text-gray-500">
          Runs the same backward-fill + retire-stale repair as the per-loan "Repair Schedule" action
          across every active, disbursed, or defaulted loan. A loan that isn't actually broken is left
          untouched — this only changes loans the tool can verify need it.
        </p>

        {phase === 'idle' && !summary && (
          <>
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />{error}
              </div>
            )}
            <button type="button" onClick={() => { setError(null); setPhase('polling-preview'); }}
              className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
              Scan the Loan Book (Preview)
            </button>
          </>
        )}

        {(phase === 'polling-preview' || phase === 'polling-apply') && (
          <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" />
            {phase === 'polling-preview' ? 'Scanning every eligible loan…' : 'Applying the repair…'}
          </div>
        )}

        {phase === 'preview' && summary && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
              <div>Loans scanned<br /><span className="font-medium text-gray-900">{summary.total_considered}</span></div>
              <div>Need repair<br /><span className="font-medium text-amber-700">{summary.changed_count}</span></div>
              <div>Already fine<br /><span className="font-medium text-gray-900">{summary.no_op_count}</span></div>
              <div>Need manual review<br /><span className="font-medium text-red-700">{summary.needs_review_count}</span></div>
            </div>

            {summary.changed_count === 0 ? (
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                Nothing to repair — every loan the tool could act on already reconciles.
              </div>
            ) : (
              <>
                <ul className="mb-4 max-h-48 divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200 text-sm">
                  {summary.changed.slice(0, 20).map((c) => (
                    <li key={c.loan_number} className="flex items-center justify-between px-3 py-2">
                      <span className="font-medium text-gray-900">{c.loan_number}</span>
                      <span className="text-xs text-gray-500">
                        {c.retired_count > 0 && `${c.retired_count} row(s) retired`}
                        {c.retired_count > 0 && c.flat_installment && ' · '}
                        {c.flat_installment && `₦${fmt(c.flat_installment)}/installment`}
                      </span>
                    </li>
                  ))}
                </ul>
                {summary.changed_count > 20 && (
                  <p className="mb-3 text-xs text-gray-500">…and {summary.changed_count - 20} more.</p>
                )}

                <div className="mb-3">
                  <label htmlFor="bulk-repair-reason" className="mb-1 block text-sm font-medium text-gray-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea id="bulk-repair-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder={`Explain why this bulk repair is needed (min ${BULK_REPAIR_MIN_REASON_LENGTH} characters) — applied to every loan listed above`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </>
            )}

            {summary.needs_review_count > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  {summary.needs_review_count} loan(s) need manual review and were skipped — open them
                  individually via Repair Schedule for the specific reason.
                </span>
              </div>
            )}
            {summary.errors_count > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{summary.errors_count} loan(s) hit an unexpected error and were skipped.</span>
              </div>
            )}
          </>
        )}

        {phase === 'applied' && summary && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Bulk repair applied</p>
            <p className="mt-1 text-sm text-gray-500">
              {summary.changed_count} loan(s) repaired, {summary.needs_review_count} left for manual
              review, {summary.errors_count} error(s).
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          {phase === 'preview' && summary && (
            <>
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              {summary.changed_count > 0 && (
                <button type="button" onClick={() => setPhase('polling-apply')} disabled={!reasonReady}
                  className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                  Apply to {summary.changed_count} Loan(s)
                </button>
              )}
            </>
          )}
          {phase === 'applied' && (
            <button type="button" onClick={handleDone}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoanAccountsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showBulkRepairModal, setShowBulkRepairModal] = useState(false);
  const { hasPageAccess } = usePermission();
  const canRepairSchedules = hasPageAccess('loans', 'loan-accounts', 'approve');

  // Keep the URL's ?status= in sync so links like the Loan Pipeline tiles
  // pre-filter this list, and manual dropdown changes update the URL too.
  useEffect(() => {
    const urlStatus = searchParams.get('status') ?? '';
    if (urlStatus !== statusFilter) setStatusFilter(urlStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(statusFilter ? { status: statusFilter } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const { data: res, isLoading: loading, error, refetch } = useLoanAccounts({
    search: search || undefined,
    status: statusFilter || undefined,
    risk_classification: riskFilter || undefined,
    page,
  });

  const loans: LoanAccountList[] = Array.isArray(res) ? res : (res?.results ?? []);
  const totalCount = Array.isArray(res) ? res.length : (res?.count ?? 0);
  const hasNext = !Array.isArray(res) && !!res?.next;
  const hasPrev = !Array.isArray(res) && !!res?.previous;
  const showPagination = hasNext || hasPrev || page > 1;

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, riskFilter]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loan Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage client loan accounts — applications, approvals, and repayments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canRepairSchedules && (
            <button
              type="button"
              onClick={() => setShowBulkRepairModal(true)}
              title="Backward-fill payments and retire stale schedule rows across every eligible loan (director approval required)"
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <Wrench size={14} />
              Bulk Repair Schedules
            </button>
          )}
          <Link
            to="/loans/accounts/create"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Application
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search name, loan # or client ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
          />
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {LOAN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          aria-label="Filter by risk level"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {RISK_LEVELS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {(error as any)?.response?.data?.detail || error.message || 'Failed to load loan accounts.'}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : loans.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No loan accounts found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Loan #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Disbursed</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3 text-right">Arrears</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loans.map((loan) => (
                <tr
                  key={loan.id}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => navigate(`/loans/accounts/${loan.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                    {loan.loan_number}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="flex items-center gap-2">
                      <ClientAvatar image={loan.client_image} name={loan.client_name} size="xs" />
                      {loan.client_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{loan.product_name}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    ₦{fmt(loan.disbursed_amount)}
                    {['pending', 'approved'].includes(loan.status) && (
                      <div className="text-xs text-gray-400 font-normal">
                        ₦{fmt(loan.requested_amount)} req.
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ₦{fmt(loan.total_outstanding ?? loan.outstanding_principal)}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {loan.repayment_frequency}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[loan.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {loan.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RISK_BADGE[loan.risk_classification] ?? 'bg-gray-100 text-gray-600'}`}>
                      {loan.risk_classification}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {loan.days_in_arrears > 0 ? (
                      <span className="text-red-600 font-medium">
                        {loan.days_in_arrears}d / ₦{fmt(loan.arrears_amount)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/loans/accounts/${loan.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 border border-blue-200"
                    >
                      <Eye size={11} />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && showPagination && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-gray-500">
              Page {page} ({totalCount} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrev}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={12} /> Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showBulkRepairModal && (
        <BulkRepairScheduleModal
          onClose={() => setShowBulkRepairModal(false)}
          onSuccess={() => {
            toast.success('Bulk schedule repair applied.');
            refetch();
          }}
        />
      )}
    </div>
  );
}
