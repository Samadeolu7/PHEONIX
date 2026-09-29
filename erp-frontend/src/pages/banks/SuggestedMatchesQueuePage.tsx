import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Link2, ShieldAlert, X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermissions';
import { useToast } from '../../hooks/useToast';
import {
  useSuggestedMatchesQueue,
  useBulkConfirmSuggestedMatches,
} from '../../hooks/useReconciliation';
import type { ReconciliationException } from '../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

function resolveAmount(exc: ReconciliationException): string | null {
  return exc.bank_amount ?? exc.erp_amount;
}

const TYPE_LABELS: Record<ReconciliationException['exception_type'], string> = {
  bank_only: 'In bank, not in ERP',
  erp_only: 'In ERP, not in bank',
  amount_diff: 'Amount difference',
};

function describeExc(exc: ReconciliationException): string {
  return exc.exception_type === 'erp_only'
    ? exc.erp_narration || exc.bank_narration || '—'
    : exc.bank_narration || exc.erp_narration || '—';
}

const ExceptionSummary: React.FC<{ exc: ReconciliationException }> = ({ exc }) => (
  <span className="text-sm min-w-0">
    <span className="flex items-center gap-2 flex-wrap">
      <span
        className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
          exc.exception_type === 'bank_only' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {TYPE_LABELS[exc.exception_type]}
      </span>
      <span className="text-xs text-gray-400">{exc.direction}</span>
      {exc.bank_account_name && (
        <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {exc.bank_account_name}
        </span>
      )}
    </span>
    <span className="block text-gray-900 mt-0.5 truncate">{describeExc(exc)}</span>
    <span className="block text-gray-500 text-xs mt-0.5">
      {formatAmount(resolveAmount(exc))} on {exc.bank_date || exc.erp_date}
    </span>
  </span>
);

const SuggestedMatchesQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPageAccess } = usePermission();
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');
  const { success: showSuccess, error: showError } = useToast();

  const { data, isLoading, error: queryError } = useSuggestedMatchesQueue();
  const confirmMutation = useBulkConfirmSuggestedMatches();

  // Safe-tier: keyed by `${exception.id}-${candidate.id}`, tick required per
  // row — deliberately no "select all" here, since same-amount coincidences
  // do happen and this queue exists precisely so an officer still has to
  // notice and confirm each one, not rubber-stamp the whole page.
  const [tickedSafe, setTickedSafe] = useState<Record<string, boolean>>({});
  // Review-tier: one picked candidate id per source exception, plus its own
  // tick — picking a different candidate clears the tick so a stale
  // confirmation can't ride along with a changed selection.
  const [selectedCandidate, setSelectedCandidate] = useState<Record<number, number | null>>({});
  const [tickedReview, setTickedReview] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<{ resolvedCount: number; failedCount: number } | null>(null);

  const safeMatches = data?.safe_matches ?? [];
  const reviewNeeded = data?.review_needed ?? [];

  const confirmations = useMemo(() => {
    const items: { exception_a_id: number; exception_b_id: number }[] = [];
    for (const pair of safeMatches) {
      const key = `${pair.exception.id}-${pair.candidate.id}`;
      if (tickedSafe[key]) {
        items.push({ exception_a_id: pair.exception.id, exception_b_id: pair.candidate.id });
      }
    }
    for (const item of reviewNeeded) {
      const candidateId = selectedCandidate[item.exception.id];
      if (candidateId && tickedReview[item.exception.id]) {
        items.push({ exception_a_id: item.exception.id, exception_b_id: candidateId });
      }
    }
    return items;
  }, [safeMatches, reviewNeeded, tickedSafe, selectedCandidate, tickedReview]);

  const handleConfirm = async () => {
    if (confirmations.length === 0) return;
    setResult(null);
    try {
      const res = await confirmMutation.mutateAsync({ confirmations });
      setResult({ resolvedCount: res.resolved_count, failedCount: res.failed_count });
      if (res.failed_count > 0) {
        showError(
          `${res.resolved_count} confirmed, ${res.failed_count} failed — see details below`
        );
      } else {
        showSuccess(`${res.resolved_count} match${res.resolved_count !== 1 ? 'es' : ''} confirmed and resolved`);
      }
      setTickedSafe({});
      setTickedReview({});
      setSelectedCandidate({});
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to confirm matches');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto pb-28">
      <button
        onClick={() => navigate('/banks/reconciliations')}
        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reconciliations
      </button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Link2 className="w-7 h-7 text-green-600" />
          Suggested Matches
        </h1>
        <p className="text-gray-600 mt-1">
          Unresolved exceptions across every reconciliation that already have a plausible
          link — tick each pair you've reviewed and believe is correct before confirming.
          Nothing here resolves on its own.
        </p>
      </div>

      {!canApprove && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          You can view this queue, but only a director can confirm matches.
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      )}

      {queryError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {queryError instanceof Error ? queryError.message : 'Failed to load suggested matches'}
        </div>
      )}

      {!isLoading && !queryError && safeMatches.length === 0 && reviewNeeded.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600">No suggested matches right now — every unresolved exception is either genuinely alone or already resolved.</p>
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
            {result.resolvedCount} confirmed and resolved
            {result.failedCount > 0 && `, ${result.failedCount} failed (likely already resolved elsewhere — refresh to see the current queue)`}.
          </p>
          <button onClick={() => setResult(null)} className="ml-4 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {safeMatches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Single candidate ({safeMatches.length})
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Both sides agree there's only one plausible partner. Still just a suggestion —
            same-amount coincidences happen — so each one needs its own tick.
          </p>
          <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-lg overflow-hidden">
            {safeMatches.map((pair) => {
              const key = `${pair.exception.id}-${pair.candidate.id}`;
              return (
                <li key={key} className="p-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={!!tickedSafe[key]}
                    disabled={!canApprove}
                    onChange={(e) => setTickedSafe((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="mt-1.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ExceptionSummary exc={pair.exception} />
                    <ExceptionSummary exc={pair.candidate} />
                  </div>
                  {pair.is_fee_pattern && pair.fee_amount && (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800 whitespace-nowrap mt-1.5">
                      Fee ₦{parseFloat(pair.fee_amount).toLocaleString()} — bank charge
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {reviewNeeded.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Needs review ({reviewNeeded.length})
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            More than one plausible candidate (or an internal-movement pairing) — pick the one
            you believe is correct, then tick to confirm it.
          </p>
          <ul className="space-y-3">
            {reviewNeeded.map((item) => {
              const excId = item.exception.id;
              const selected = selectedCandidate[excId] ?? null;
              return (
                <li key={excId} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="mb-2">
                    <ExceptionSummary exc={item.exception} />
                  </div>
                  <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
                    {item.candidates.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name={`candidate-${excId}`}
                            checked={selected === c.id}
                            disabled={!canApprove}
                            onChange={() => {
                              setSelectedCandidate((prev) => ({ ...prev, [excId]: c.id }));
                              setTickedReview((prev) => ({ ...prev, [excId]: false }));
                            }}
                            className="mt-1"
                          />
                          <ExceptionSummary exc={c} />
                        </label>
                      </li>
                    ))}
                  </ul>
                  <label
                    className={`flex items-center gap-2 mt-2 text-sm ${
                      selected ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!tickedReview[excId]}
                      disabled={!canApprove || !selected}
                      onChange={(e) => setTickedReview((prev) => ({ ...prev, [excId]: e.target.checked }))}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    This is the correct match
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(safeMatches.length > 0 || reviewNeeded.length > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
          <div className="max-w-5xl w-full mx-auto flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={!canApprove || confirmations.length === 0 || confirmMutation.isPending}
              className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {confirmMutation.isPending ? 'Confirming…' : `Confirm Ticked (${confirmations.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestedMatchesQueuePage;
