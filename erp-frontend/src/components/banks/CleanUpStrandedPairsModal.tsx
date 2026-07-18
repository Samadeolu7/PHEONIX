import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import {
  MIN_REASON_LENGTH,
  type AmbiguousStrandedException,
  type BulkCleanUpStrandedPairsPreview,
  type BulkCleanUpStrandedPairsResult,
} from '../../types/banks';

interface CleanUpStrandedPairsModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function formatNaira(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Global "Clean Up" scan across every bank account the user can see: finds
 * exceptions that were resolved standalone (the plain per-row Resolve
 * action, before it was properly paired against its real counterpart —
 * see UnresolveExceptionView) and reopens + properly links them. Always
 * previews first (dry_run) — this reopens exceptions the team already
 * closed, with no per-pair confirmation once the real run starts.
 *
 * Ambiguous exceptions (more than one plausible candidate) are never
 * auto-linked — that's exactly the case a wrong guess could misfile real
 * money. Instead each one is listed with its full candidate set so a
 * director can review and manually pick+link the right one, right here,
 * without hunting the exception down elsewhere in the app.
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

  const [ambiguousList, setAmbiguousList] = useState<AmbiguousStrandedException[]>([]);
  const [showAmbiguous, setShowAmbiguous] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Record<number, number>>({});
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [manuallyLinkedCount, setManuallyLinkedCount] = useState(0);
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());

  const toggleExcluded = (resolvedExceptionId: number) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resolvedExceptionId)) next.delete(resolvedExceptionId);
      else next.add(resolvedExceptionId);
      return next;
    });
  };

  const loadPreview = () => {
    setLoading(true);
    return reconciliationService
      .bulkCleanUpStrandedPairsPreview()
      .then((data) => {
        setPreview(data);
        setAmbiguousList(data.ambiguous);
      })
      .catch((err: any) => {
        onError(err.message || 'Failed to preview the clean-up scan');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    if (notes.trim().length < MIN_REASON_LENGTH) return;
    setSubmitting(true);
    try {
      const data = await reconciliationService.bulkCleanUpStrandedPairs({
        resolution_notes: notes,
        excluded_resolved_exception_ids: Array.from(excludedIds),
      });
      setResult(data);
    } catch (err: any) {
      onError(err.message || 'Failed to clean up stranded pairs');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualLink = async (row: AmbiguousStrandedException) => {
    const candidateId = selectedCandidate[row.resolved_exception_id];
    const candidate = row.candidates.find((c) => c.id === candidateId);
    if (!candidate || notes.trim().length < MIN_REASON_LENGTH) return;

    setLinkingId(row.resolved_exception_id);
    try {
      await reconciliationService.unresolveException(row.resolved_exception_id, {
        reason: `Manually reviewed via Clean Up: ${notes}`,
      });

      if (candidate.fee_amount) {
        const bankOnlyId = row.exception_type === 'bank_only' ? row.resolved_exception_id : candidate.id;
        const erpOnlyId = row.exception_type === 'erp_only' ? row.resolved_exception_id : candidate.id;
        await reconciliationService.linkResolveBankCharge({
          bank_only_exception_id: bankOnlyId,
          erp_only_exception_id: erpOnlyId,
          resolution_notes: notes,
        });
      } else {
        await reconciliationService.linkResolveExceptions({
          exception_a_id: row.resolved_exception_id,
          exception_b_id: candidate.id,
          resolution_notes: notes,
        });
      }

      setAmbiguousList((prev) => prev.filter((r) => r.resolved_exception_id !== row.resolved_exception_id));
      setManuallyLinkedCount((n) => n + 1);
    } catch (err: any) {
      onError(err.message || 'Failed to link this pair');
    } finally {
      setLinkingId(null);
    }
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  const notesReady = notes.trim().length >= MIN_REASON_LENGTH;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                creates a real "Bank Charges" payment for a director to approve separately. Runs
                across every bank account at once.
              </p>

              {preview.would_clean_up_count === 0 && ambiguousList.length === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing to clean up right now.
                </div>
              ) : (
                <>
                  {preview.would_clean_up_count > 0 && (
                    <>
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                        <strong>{preview.would_clean_up_count - excludedIds.size}</strong> of{' '}
                        {preview.would_clean_up_count} unambiguous pair(s) selected — "unambiguous"
                        means exactly one candidate was found, not that it's necessarily correct.
                        Uncheck any you disagree with; they'll be left untouched for manual review.
                      </div>
                      <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                        {preview.would_clean_up.map((p) => {
                          const excluded = excludedIds.has(p.resolved_exception_id);
                          return (
                            <li
                              key={`${p.resolved_exception_id}-${p.unresolved_exception_id}`}
                              className={`px-3 py-2 text-sm flex items-start gap-2 ${excluded ? 'opacity-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={!excluded}
                                onChange={() => toggleExcluded(p.resolved_exception_id)}
                                className="mt-1 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500 text-xs">
                                    #{p.resolved_exception_id} (was resolved) ↔ #{p.unresolved_exception_id} (unresolved)
                                  </span>
                                  <span className="font-medium text-amber-700 shrink-0 ml-2">
                                    {p.fee_amount ? `Fee ${formatNaira(p.fee_amount)}` : 'Exact match'}
                                  </span>
                                </div>
                                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                                  <div className="min-w-0">
                                    <p className="text-gray-900 truncate">{p.resolved_exception.narration || '—'}</p>
                                    <p className="text-gray-500 text-xs">
                                      {formatNaira(p.resolved_exception.amount)} on {p.resolved_exception.date || '—'} ·{' '}
                                      {p.resolved_exception.exception_type} {p.resolved_exception.direction}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-gray-900 truncate">{p.unresolved_exception.narration || '—'}</p>
                                    <p className="text-gray-500 text-xs">
                                      {formatNaira(p.unresolved_exception.amount)} on {p.unresolved_exception.date || '—'} ·{' '}
                                      {p.unresolved_exception.exception_type} {p.unresolved_exception.direction}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={`Explain the clean-up (min ${MIN_REASON_LENGTH} chars) — applied to every pair you confirm or link below`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {ambiguousList.length > 0 && (
                <div className="border border-amber-200 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAmbiguous((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 text-sm font-medium text-amber-900"
                  >
                    <span className="flex items-center gap-1.5">
                      {showAmbiguous ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {ambiguousList.length} ambiguous — needs manual review
                    </span>
                    {manuallyLinkedCount > 0 && (
                      <span className="text-green-700">{manuallyLinkedCount} linked this session</span>
                    )}
                  </button>

                  {showAmbiguous && (
                    <ul className="divide-y divide-gray-200 max-h-72 overflow-y-auto">
                      {ambiguousList.map((row) => (
                        <li key={row.resolved_exception_id} className="p-3">
                          <p className="text-sm text-gray-900">
                            #{row.resolved_exception_id} · {row.exception_type} {row.direction} ·{' '}
                            {formatNaira(row.amount)} on {row.date || '—'}
                          </p>
                          <p className="text-xs text-gray-500 truncate mb-2">{row.narration || '—'}</p>

                          <div className="space-y-1">
                            {row.candidates.map((c) => (
                              <label
                                key={c.id}
                                className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm"
                              >
                                <input
                                  type="radio"
                                  name={`candidate-${row.resolved_exception_id}`}
                                  checked={selectedCandidate[row.resolved_exception_id] === c.id}
                                  onChange={() =>
                                    setSelectedCandidate({ ...selectedCandidate, [row.resolved_exception_id]: c.id })
                                  }
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="block text-gray-900 truncate">
                                    #{c.id} · {formatNaira(c.amount)} on {c.date || '—'}
                                    {c.fee_amount && (
                                      <span className="text-purple-700 font-medium"> · Fee {formatNaira(c.fee_amount)}</span>
                                    )}
                                  </span>
                                  <span className="block text-gray-500 truncate">{c.narration || '—'}</span>
                                </span>
                              </label>
                            ))}
                          </div>

                          <button
                            onClick={() => handleManualLink(row)}
                            disabled={
                              linkingId === row.resolved_exception_id ||
                              !selectedCandidate[row.resolved_exception_id] ||
                              !notesReady
                            }
                            title={!notesReady ? 'Fill in Notes above first' : undefined}
                            className="mt-2 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                          >
                            {linkingId === row.resolved_exception_id ? 'Linking…' : 'Unresolve & Link Selected'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900">
                Reopened and linked <strong>{result.cleaned_up_count}</strong> pair(s) automatically
                {manuallyLinkedCount > 0 && <> plus <strong>{manuallyLinkedCount}</strong> linked manually above</>}.
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
                onClick={manuallyLinkedCount > 0 ? handleDone : onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {manuallyLinkedCount > 0 ? 'Close' : 'Cancel'}
              </button>
              {preview && preview.would_clean_up_count > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={submitting || !notesReady || preview.would_clean_up_count - excludedIds.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting
                    ? 'Cleaning up…'
                    : `Clean Up ${preview.would_clean_up_count - excludedIds.size} Pair(s)`}
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
