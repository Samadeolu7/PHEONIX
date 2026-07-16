import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { ReconciliationWaitState } from '../../components/banks/ReconciliationWaitState';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermissions';
import type {
  DailyReconciliation,
  ReconciliationBankTransaction,
  ReconciliationException,
} from '../../types/banks';

const STATUS_STYLES: Record<DailyReconciliation['status'], string> = {
  processing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // ~3 minutes of polling before we consider it stalled

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

const ReconciliationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { hasPageAccess } = usePermission();
  // Director tier: may resolve ANY exception, including amount mismatches.
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');
  // Branch-manager tier: may resolve only "perfect match" exceptions — see
  // ReconciliationException.is_perfect_match / ResolveExceptionView.patch
  // (banks/views.py) for the authoritative backend gate this mirrors.
  const canEditPerfectMatch = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'edit');
  const canResolve = canApprove || canEditPerfectMatch;

  const [recon, setRecon] = useState<DailyReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const pollCountRef = useRef(0);

  // Matched/unmatched bank transactions — previously the exceptions list was
  // the only visibility into a reconciliation, so a cleanly-matched transfer
  // (the common case) was invisible anywhere. Lazy-loaded on first expand
  // since most visits are about resolving exceptions, not browsing matches.
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactions, setTransactions] = useState<ReconciliationBankTransaction[] | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsFilter, setTransactionsFilter] = useState<'all' | 'matched' | 'unmatched'>('all');

  // Returns true once the reconciliation is no longer 'processing' (i.e.
  // polling should stop), or on a fetch error (nothing more to wait for).
  const checkStatus = useCallback(async (reconId: number) => {
    try {
      const data = await reconciliationService.getReconciliation(reconId);
      setRecon(data);
      setError(null);
      return data.status !== 'processing';
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation');
      return true;
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      await checkStatus(Number(id));
      setLoading(false);
    })();
  }, [id, checkStatus]);

  // Poll while the reconciliation is still processing — matches the polling
  // pattern already used in components/WorkflowStatusMonitor.tsx elsewhere
  // in this app (setInterval in a useEffect, cleaned up on unmount/status
  // change, capped rather than polling forever).
  useEffect(() => {
    if (!id || !recon || recon.status !== 'processing' || stalled) return;

    const interval = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current >= MAX_POLLS) {
        clearInterval(interval);
        setStalled(true);
        return;
      }
      await checkStatus(Number(id));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [id, recon?.status, stalled, checkStatus]);

  const handleManualRefresh = async () => {
    if (!id) return;
    pollCountRef.current = 0;
    setStalled(false);
    await checkStatus(Number(id));
  };

  const handleResolve = async (exception: ReconciliationException) => {
    if (!recon) return;
    setResolvingId(exception.id);
    try {
      const updated = await reconciliationService.resolveException(recon.id, exception.id, {
        resolution_notes: notesDraft[exception.id] || '',
      });
      setRecon({
        ...recon,
        exceptions: recon.exceptions?.map((e) => (e.id === exception.id ? updated : e)),
      });
      success('Exception resolved');
    } catch (err: any) {
      showError(err.message || 'Failed to resolve exception');
    } finally {
      setResolvingId(null);
    }
  };

  const loadTransactions = useCallback(async (reconId: number, tFilter: 'all' | 'matched' | 'unmatched') => {
    setTransactionsLoading(true);
    try {
      const matchedParam = tFilter === 'all' ? undefined : tFilter === 'matched';
      const res = await reconciliationService.getTransactions(reconId, matchedParam);
      setTransactions(res.results);
    } catch (err: any) {
      showError(err.message || 'Failed to load transactions');
    } finally {
      setTransactionsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!showTransactions || !recon) return;
    loadTransactions(recon.id, transactionsFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTransactions, transactionsFilter, recon?.id]);

  const handleRerun = async () => {
    if (!recon) return;
    setRerunning(true);
    try {
      const updated = await reconciliationService.rerunReconciliation(recon.id);
      setRecon(updated);
      pollCountRef.current = 0;
      setStalled(false);
      success('Re-matching started');
    } catch (err: any) {
      showError(err.message || 'Failed to re-run reconciliation');
    } finally {
      setRerunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !recon) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Reconciliation not found'}
        </div>
      </div>
    );
  }

  const exceptions = recon.exceptions || [];
  const visibleExceptions = exceptions
    .filter((e) => {
      if (filter === 'unresolved') return !e.resolved;
      if (filter === 'resolved') return e.resolved;
      return true;
    })
    // High-priority "cash the ERP doesn't know about" exceptions surface
    // first — that's the one a director needs to see at a glance, not
    // buried among routine timing noise.
    .sort((a, b) => Number(b.is_high_priority) - Number(a.is_high_priority));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/banks/reconciliations')}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">
            {recon.bank_account_info?.account_name || 'Reconciliation'} —{' '}
            {recon.reconciliation_date}
          </h1>
          <p className="text-gray-600 mt-1">
            {recon.bank_account_info
              ? `${recon.bank_account_info.bank_name} · ${recon.bank_account_info.account_number}`
              : ''}
            {recon.branch_name ? ` · ${recon.branch_name}` : ''}
            {recon.rerun_count > 0 ? ` · Re-run ×${recon.rerun_count}` : ''}
          </p>
        </div>
        {recon.status !== 'processing' && (
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${rerunning ? 'animate-spin' : ''}`} />
            {rerunning ? 'Re-running…' : 'Re-run matching'}
          </button>
        )}
        <span
          className={`px-3 py-1 text-sm font-semibold rounded-full ${STATUS_STYLES[recon.status]}`}
        >
          {recon.status === 'processing'
            ? 'Processing'
            : recon.status === 'completed'
              ? 'Completed'
              : 'Failed'}
        </span>
      </div>

      {recon.status === 'processing' ? (
        stalled ? (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <Clock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Still processing</h3>
            <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
              This is taking longer than expected. It's safe to leave this page — matching
              continues in the background. Check back later, or refresh to see the result now.
            </p>
            <button
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        ) : (
          <ReconciliationWaitState />
        )
      ) : (
        <>
          {recon.status === 'failed' && recon.error_detail && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{recon.error_detail}</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Bank Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{recon.total_bank_transactions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-gray-600">Matched</p>
              </div>
              <p className="text-2xl font-bold text-green-600">{recon.matched_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-gray-600">Bank Only</p>
              </div>
              <p className="text-2xl font-bold text-red-600">{recon.unmatched_bank_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-gray-600">ERP Only</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">{recon.unmatched_erp_count}</p>
            </div>
          </div>

          {/* Exceptions */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Exceptions</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['unresolved', 'resolved', 'all'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1 text-sm rounded-md capitalize ${
                      filter === key ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {visibleExceptions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-600">
                  {filter === 'unresolved'
                    ? 'No unresolved exceptions — everything is matched or already reviewed.'
                    : 'Nothing to show for this filter.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {visibleExceptions.map((exception) => (
                  <li key={exception.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {exception.direction === 'CREDIT' ? (
                          <ArrowDownCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <ArrowUpCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                exception.exception_type === 'bank_only'
                                  ? 'bg-red-100 text-red-800'
                                  : exception.exception_type === 'erp_only'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {exception.exception_type === 'bank_only'
                                ? 'In bank, not in ERP'
                                : exception.exception_type === 'erp_only'
                                  ? 'In ERP, not in bank'
                                  : 'Amount difference'}
                            </span>
                            <span className="text-xs text-gray-400">{exception.direction}</span>
                            {exception.is_high_priority && !exception.resolved && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-600 text-white">
                                <AlertTriangle className="w-3 h-3" />
                                Unexplained Cash
                              </span>
                            )}
                            {exception.resolved && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Resolved
                              </span>
                            )}
                            {exception.officer_name && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                {exception.officer_name}
                                {exception.erp_branch_name ? ` · ${exception.erp_branch_name}` : ''}
                              </span>
                            )}
                            {exception.exception_type !== 'bank_only' && (
                              <span
                                className={`text-xs ${exception.has_bank_reference ? 'text-gray-400' : 'text-red-500 font-medium'}`}
                                title={
                                  exception.has_bank_reference
                                    ? 'A bank reference was entered but no matching bank transaction was found'
                                    : 'No bank reference was entered for this payment'
                                }
                              >
                                {exception.has_bank_reference ? 'Ref entered' : 'No ref entered'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-900 mt-1 truncate">
                            {exception.bank_narration || exception.erp_narration || '—'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {exception.exception_type !== 'erp_only' && (
                              <>Bank: {formatAmount(exception.bank_amount)} on {exception.bank_date}</>
                            )}
                            {exception.exception_type === 'amount_diff' && ' · '}
                            {exception.exception_type !== 'bank_only' && (
                              <>ERP: {formatAmount(exception.erp_amount)} on {exception.erp_date}</>
                            )}
                          </p>
                          {exception.resolved && exception.resolution_notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">
                              "{exception.resolution_notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      {(() => {
                        // Perfect match: branch manager (canResolve) or director may
                        // resolve. Any amount mismatch — including bank_only/erp_only,
                        // which have no counterpart amount at all — needs a director.
                        // Mirrors ResolveExceptionView.patch (banks/views.py).
                        const userCanResolveThis = exception.is_perfect_match ? canResolve : canApprove;
                        const notesRequired = !exception.is_perfect_match;
                        const notes = notesDraft[exception.id] || '';

                        if (exception.resolved) return null;

                        if (!userCanResolveThis) {
                          const lockedForTier = notesRequired && canEditPerfectMatch && !canApprove;
                          return (
                            <span
                              className="flex items-center gap-1 text-xs text-gray-400 shrink-0"
                              title={
                                lockedForTier
                                  ? 'This exception has an amount mismatch — only a director can resolve it'
                                  : 'Only directors or branch managers can resolve reconciliation exceptions'
                              }
                            >
                              <Lock className="w-3.5 h-3.5" />
                              {lockedForTier ? 'Director required' : 'View only'}
                            </span>
                          );
                        }

                        return (
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="text"
                              placeholder={
                                notesRequired ? 'Resolution notes (required)' : 'Resolution notes (optional)'
                              }
                              value={notes}
                              onChange={(e) =>
                                setNotesDraft({ ...notesDraft, [exception.id]: e.target.value })
                              }
                              className="w-48 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                              onClick={() => handleResolve(exception)}
                              disabled={
                                resolvingId === exception.id || (notesRequired && !notes.trim())
                              }
                              title={
                                notesRequired && !notes.trim()
                                  ? 'Resolution notes are required for an amount mismatch'
                                  : undefined
                              }
                              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              {resolvingId === exception.id ? 'Resolving…' : 'Resolve'}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Matched / Unmatched Transactions — previously the exceptions
              list above was the only visibility into a reconciliation, so a
              cleanly-matched transfer (the common case) was invisible
              anywhere in the product. Lazy-loaded on expand. */}
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <button
              onClick={() => setShowTransactions((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                Bank Transactions ({recon.total_bank_transactions})
              </h2>
              <span className="text-sm text-gray-500">{showTransactions ? 'Hide' : 'Show'}</span>
            </button>

            {showTransactions && (
              <>
                <div className="flex items-center justify-between px-6 py-3 border-t border-b border-gray-200 bg-gray-50">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['all', 'matched', 'unmatched'] as const).map((key) => (
                      <button
                        key={key}
                        onClick={() => setTransactionsFilter(key)}
                        className={`px-3 py-1 text-sm rounded-md capitalize ${
                          transactionsFilter === key ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                {transactionsLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : !transactions || transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600">Nothing to show for this filter.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {transactions.map((tx) => (
                      <li key={tx.id} className="px-6 py-4">
                        <div className="flex items-start gap-3 min-w-0">
                          {tx.matched ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  tx.matched ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {tx.matched
                                  ? `Matched${tx.match_confidence ? ` (${tx.match_confidence})` : ''}`
                                  : 'Unmatched'}
                              </span>
                              <span className="text-xs text-gray-400">{tx.direction}</span>
                              {tx.matched_erp_officer_name && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                  {tx.matched_erp_officer_name}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-900 mt-1 truncate">{tx.narration || '—'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Bank: {formatAmount(tx.amount)} on {tx.value_date}
                              {tx.matched && tx.erp_narration && (
                                <>
                                  {' '}
                                  · ERP: {tx.erp_narration}
                                  {tx.erp_date ? ` on ${tx.erp_date}` : ''}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ReconciliationDetailPage;
