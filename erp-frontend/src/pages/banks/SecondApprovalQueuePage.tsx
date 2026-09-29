import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock, ShieldAlert, UserCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermissions';
import { useToast } from '../../hooks/useToast';
import {
  useSecondApprovalQueue,
  useBulkSecondResolveExceptions,
} from '../../hooks/useReconciliation';
import { MIN_REASON_LENGTH, type ReconciliationException } from '../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

const TYPE_LABELS: Record<ReconciliationException['exception_type'], string> = {
  bank_only: 'In bank, not in ERP',
  erp_only: 'In ERP, not in bank',
  amount_diff: 'Amount difference',
};

const SecondApprovalQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPageAccess } = usePermission();
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');
  const { success: showSuccess, error: showError } = useToast();

  const { data, isLoading, error: queryError } = useSecondApprovalQueue();
  const bulkMutation = useBulkSecondResolveExceptions();

  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<{ resolvedCount: number; failedCount: number } | null>(null);

  const rows = data?.results ?? [];
  // A row this same user first-resolved will always fail server-side (the
  // second approver must be a different director) — excluded from
  // select-all up front so it doesn't silently eat a shared comment for
  // nothing, though the checkbox itself stays disabled either way.
  const eligibleRows = useMemo(() => rows.filter((r) => r.resolved_by !== user?.id), [rows, user?.id]);
  const allEligibleSelected = eligibleRows.length > 0 && eligibleRows.every((r) => selected[r.id]);

  const selectedIds = useMemo(
    () => eligibleRows.filter((r) => selected[r.id]).map((r) => r.id),
    [eligibleRows, selected]
  );

  const toggleAll = () => {
    if (allEligibleSelected) {
      setSelected({});
    } else {
      const next: Record<number, boolean> = {};
      for (const r of eligibleRows) next[r.id] = true;
      setSelected(next);
    }
  };

  const handleApprove = async () => {
    if (selectedIds.length === 0 || notes.trim().length < MIN_REASON_LENGTH) return;
    setResult(null);
    try {
      const res = await bulkMutation.mutateAsync({
        exception_ids: selectedIds,
        resolution_notes: notes,
      });
      setResult({ resolvedCount: res.resolved_count, failedCount: res.failed_count });
      if (res.failed_count > 0) {
        showError(`${res.resolved_count} approved, ${res.failed_count} failed — see details below`);
      } else {
        showSuccess(`${res.resolved_count} exception${res.resolved_count !== 1 ? 's' : ''} approved`);
      }
      setSelected({});
      setNotes('');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to approve exceptions');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto pb-40">
      <button
        onClick={() => navigate('/banks/reconciliations')}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reconciliations
      </button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <UserCheck className="w-7 h-7 text-purple-600" />
          Second Approval Queue
        </h1>
        <p className="text-gray-600 mt-1">
          Exceptions a first director already resolved and documented, now awaiting a second,
          different director's confirmation. Select as many as you're satisfied with and approve
          them together with one comment.
        </p>
      </div>

      {!canApprove && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          You can view this queue, but only a director can provide the second approval.
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      )}

      {queryError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {queryError instanceof Error ? queryError.message : 'Failed to load the second approval queue'}
        </div>
      )}

      {!isLoading && !queryError && rows.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600">Nothing waiting on a second approval right now.</p>
        </div>
      )}

      {result && (
        <div
          className={`px-4 py-3 rounded-lg mb-4 flex items-start justify-between text-sm ${
            result.failedCount > 0
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}
        >
          <p>
            {result.resolvedCount} approved
            {result.failedCount > 0 && `, ${result.failedCount} failed (see the queue for what's still outstanding)`}.
          </p>
          <button onClick={() => setResult(null)} className="ml-4 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200">
            <input
              type="checkbox"
              checked={allEligibleSelected}
              disabled={!canApprove || eligibleRows.length === 0}
              onChange={toggleAll}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Select all ({eligibleRows.length} eligible)
            </span>
          </div>
          <ul className="divide-y divide-gray-200">
            {rows.map((exc) => {
              const isFirstResolver = exc.resolved_by === user?.id;
              return (
                <li key={exc.id} className="p-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={!!selected[exc.id]}
                    disabled={!canApprove || isFirstResolver}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [exc.id]: e.target.checked }))}
                    className="mt-1.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
                          exc.exception_type === 'bank_only'
                            ? 'bg-red-100 text-red-800'
                            : exc.exception_type === 'erp_only'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {TYPE_LABELS[exc.exception_type]}
                      </span>
                      <span className="text-xs text-gray-400">{exc.direction}</span>
                      {isFirstResolver && (
                        <span
                          className="flex items-center gap-1 text-xs text-amber-600"
                          title="You resolved this first — a different director must confirm"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Awaiting another director
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 mt-0.5">
                      {formatAmount(exc.bank_amount ?? exc.erp_amount)} on{' '}
                      {exc.bank_date || exc.erp_date}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      First resolved by <strong>{exc.resolved_by_name || '—'}</strong>:{' '}
                      {exc.resolution_notes || '—'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Comment for all selected <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={`Applies to every exception ticked above (min ${MIN_REASON_LENGTH} chars)`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleApprove}
              disabled={
                !canApprove ||
                selectedIds.length === 0 ||
                notes.trim().length < MIN_REASON_LENGTH ||
                bulkMutation.isPending
              }
              className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              {bulkMutation.isPending ? 'Approving…' : `Approve Selected (${selectedIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecondApprovalQueuePage;
