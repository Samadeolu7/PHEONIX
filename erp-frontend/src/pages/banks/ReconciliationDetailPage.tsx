import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
} from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { ReconciliationWaitState } from '../../components/banks/ReconciliationWaitState';
import { useToast } from '../../hooks/useToast';
import type { DailyReconciliation, ReconciliationException } from '../../types/banks';

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

  const [recon, setRecon] = useState<DailyReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const pollCountRef = useRef(0);

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
  const visibleExceptions = exceptions.filter((e) => {
    if (filter === 'unresolved') return !e.resolved;
    if (filter === 'resolved') return e.resolved;
    return true;
  });

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
          </p>
        </div>
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
                            {exception.resolved && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Resolved
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

                      {!exception.resolved && (
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            placeholder="Resolution notes (optional)"
                            value={notesDraft[exception.id] || ''}
                            onChange={(e) =>
                              setNotesDraft({ ...notesDraft, [exception.id]: e.target.value })
                            }
                            className="w-48 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => handleResolve(exception)}
                            disabled={resolvingId === exception.id}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {resolvingId === exception.id ? 'Resolving…' : 'Resolve'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ReconciliationDetailPage;
