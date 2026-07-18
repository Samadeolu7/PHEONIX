import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { MIN_REASON_LENGTH, type BulkCleanUpStrandedPairsPreview, type BulkCleanUpStrandedPairsResult } from '../../types/banks';

interface CleanUpStrandedPairsModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function formatNaira(value: string): string {
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Global "Clean Up" scan across every bank account the user can see: finds
 * exceptions that were resolved standalone (the plain per-row Resolve
 * action, before it was properly paired against its real counterpart —
 * see UnresolveExceptionView) and reopens + properly links them. Always
 * previews first (dry_run) — this reopens exceptions the team already
 * closed, with no per-pair confirmation once the real run starts.
 */
export const CleanUpStrandedPairsModal: React.FC<CleanUpStrandedPairsModalProps> = ({
  onClose,
  onSuccess,
  onError,
}) => {
  const [preview, setPreview] = useState<BulkCleanUpStrandedPairsPreview | null>(null);
  const [result, setResult] = useState<BulkCleanUpStrandedPairsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reconciliationService
      .bulkCleanUpStrandedPairsPreview()
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: any) => {
        if (!cancelled) onError(err.message || 'Failed to preview the clean-up scan');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    if (notes.trim().length < MIN_REASON_LENGTH) return;
    setSubmitting(true);
    try {
      const data = await reconciliationService.bulkCleanUpStrandedPairs({ resolution_notes: notes });
      setResult(data);
    } catch (err: any) {
      onError(err.message || 'Failed to clean up stranded pairs');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Clean Up Stranded Pairs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Scanning every bank account for stranded pairs…</p>}

          {!loading && preview && !result && (
            <>
              <p className="text-xs text-gray-500">
                Finds exceptions that were resolved standalone — the plain per-row Resolve action,
                before it was properly paired against its real counterpart — while that counterpart
                is still sitting unresolved on the same bank account. Reopens each one and links it
                properly: an exact amount match nets with no fee; a small bank-deducted difference
                creates a real "Bank Charges" payment for a director to approve separately. Only
                unambiguous pairs are touched — anything with more than one plausible match is left
                for manual review. Runs across every bank account at once.
              </p>

              {preview.would_clean_up_count === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing to clean up right now.
                  {preview.ambiguous_count > 0 && (
                    <span className="block mt-1 text-amber-700">
                      {preview.ambiguous_count} standalone-resolved exception(s) have more than one
                      plausible match — review those manually via Unresolve + Link.
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                    <p>
                      <strong>{preview.would_clean_up_count}</strong> pair(s) would be reopened and
                      linked.
                    </p>
                    {preview.ambiguous_count > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {preview.ambiguous_count} left as ambiguous for manual review.
                      </p>
                    )}
                  </div>
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                    {preview.would_clean_up.map((p) => (
                      <li
                        key={`${p.resolved_exception_id}-${p.unresolved_exception_id}`}
                        className="px-3 py-2 text-sm flex justify-between"
                      >
                        <span className="text-gray-700">
                          #{p.resolved_exception_id} ↔ #{p.unresolved_exception_id}
                        </span>
                        <span className="font-medium text-amber-700">
                          {p.fee_amount ? `Fee ${formatNaira(p.fee_amount)}` : 'Exact match'}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={`Explain the clean-up (min ${MIN_REASON_LENGTH} chars) — applied to every pair`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900">
                Reopened and linked <strong>{result.cleaned_up_count}</strong> pair(s).
              </div>
              {result.failed_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {result.failed_count} pair(s) failed and were skipped — retry those individually
                    via Unresolve + Link.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              {preview && preview.would_clean_up_count > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={submitting || notes.trim().length < MIN_REASON_LENGTH}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? 'Cleaning up…' : `Clean Up ${preview.would_clean_up_count} Pair(s)`}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleDone}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CleanUpStrandedPairsModal;
