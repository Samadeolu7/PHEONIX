import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, AlertTriangle, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import type {
  BulkCreateOfficerEvidenceThreadsPreview,
  BulkCreateOfficerEvidenceThreadsResult,
} from '../../types/banks';

interface CreateOfficerEvidenceThreadsModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function formatNaira(value: string): string {
  return `₦${parseFloat(value).toLocaleString()}`;
}

export const CreateOfficerEvidenceThreadsModal: React.FC<CreateOfficerEvidenceThreadsModalProps> = ({
  onClose,
  onSuccess,
  onError,
}) => {
  const [expandedOfficerId, setExpandedOfficerId] = useState<number | null>(null);
  const [excludedItemIds, setExcludedItemIds] = useState<Set<number>>(new Set());

  const { data: preview, isLoading: loading } = useQuery<BulkCreateOfficerEvidenceThreadsPreview>({
    queryKey: ['reconciliation', 'evidencePreview'],
    queryFn: () => reconciliationService.bulkCreateOfficerEvidenceThreadsPreview(),
    staleTime: 60_000,
    throwOnError: false,
  });

  const { data: result, mutate: confirmCreate, isPending: submitting } = useMutation({
    mutationFn: () => reconciliationService.bulkCreateOfficerEvidenceThreads(Array.from(excludedItemIds)),
    onError: (err: any) => onError(err.message || 'Failed to create evidence request threads'),
  });

  const toggleItem = (itemId: number) => {
    setExcludedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleConfirm = () => {
    confirmCreate();
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  const selectedItemCountFor = (row: BulkCreateOfficerEvidenceThreadsPreview['would_create'][number]) =>
    row.items.filter((item) => !excludedItemIds.has(item.id)).length;

  const officersStillIncluded = preview
    ? preview.would_create.filter((row) => selectedItemCountFor(row) > 0).length
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Request Evidence From Officers</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Scanning for genuinely unexplained items…</p>}

          {!loading && preview && !result && (
            <>
              <p className="text-xs text-gray-500">
                Finds unresolved erp_only exceptions with no plausible bank_only match anywhere on
                the account — not the ambiguous/exact/fee-tolerant pairs Clean Up handles (those
                already have real bank money nearby). Click a row to review the individual items
                before sending — uncheck any you want to leave out (e.g. one you already know the
                answer for). Run Clean Up first so this only targets what's genuinely left
                unexplained.
              </p>

              {preview.would_create_count === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing genuinely unexplained right now — every remaining item still has a
                  plausible bank-side match somewhere, or nothing is attributed to an officer at all.
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                    <strong>{officersStillIncluded}</strong> of {preview.would_create_count} officer(s)
                    would receive an evidence-request thread.
                  </div>
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-96 overflow-y-auto">
                    {preview.would_create.map((row) => {
                      const selectedCount = selectedItemCountFor(row);
                      const expanded = expandedOfficerId === row.officer_id;
                      return (
                        <li key={row.officer_id}>
                          <button
                            type="button"
                            onClick={() => setExpandedOfficerId(expanded ? null : row.officer_id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                              <span className="min-w-0">
                                <span className={`block text-left truncate ${selectedCount === 0 ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                  {row.officer_name}
                                </span>
                                <span className="block text-left text-gray-500 text-xs">
                                  {row.branch_name || '—'} · {selectedCount} of {row.item_count} item(s) selected
                                </span>
                              </span>
                            </span>
                            <span className="font-medium text-amber-700 shrink-0 ml-2">
                              {formatNaira(row.total_amount)}
                            </span>
                          </button>

                          {expanded && (
                            <ul className="bg-gray-50 divide-y divide-gray-200 px-3 py-2 space-y-1">
                              {row.items.map((item) => (
                                <label
                                  key={item.id}
                                  className="flex items-start gap-2 py-1.5 cursor-pointer text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={!excludedItemIds.has(item.id)}
                                    onChange={() => toggleItem(item.id)}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between">
                                      <span className="text-gray-900">{formatNaira(item.amount || '0')}</span>
                                      <span className="text-gray-500 text-xs">{item.date || '—'}</span>
                                    </span>
                                    <span className="block text-gray-500 truncate">{item.narration || '—'}</span>
                                  </span>
                                </label>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900 flex gap-2">
                <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Created <strong>{result.created_count}</strong> evidence-request thread(s).
                  {result.skipped_count > 0 && (
                    <> Skipped {result.skipped_count} officer(s) whose items were all left out.</>
                  )}
                </span>
              </div>
              {result.failed_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{result.failed_count} thread(s) failed to create — see logs for detail.</span>
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
              {preview && preview.would_create_count > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={submitting || officersStillIncluded === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : `Send ${officersStillIncluded} Evidence Request(s)`}
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

export default CreateOfficerEvidenceThreadsModal;
