import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, MessageSquare } from 'lucide-react';
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

/**
 * Creates one Discussions thread per officer for exceptions that have no
 * bank-side match anywhere — not the ambiguous/exact/fee-tolerant pairs
 * Clean Up handles (those already have real bank money nearby), but the
 * genuinely unexplained set worth a formal evidence request. Always
 * previews first — this messages real staff, with no per-thread
 * confirmation once the real run starts.
 */
export const CreateOfficerEvidenceThreadsModal: React.FC<CreateOfficerEvidenceThreadsModalProps> = ({
  onClose,
  onSuccess,
  onError,
}) => {
  const [preview, setPreview] = useState<BulkCreateOfficerEvidenceThreadsPreview | null>(null);
  const [result, setResult] = useState<BulkCreateOfficerEvidenceThreadsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reconciliationService
      .bulkCreateOfficerEvidenceThreadsPreview()
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: any) => {
        if (!cancelled) onError(err.message || 'Failed to preview evidence requests');
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
    setSubmitting(true);
    try {
      const data = await reconciliationService.bulkCreateOfficerEvidenceThreads();
      setResult(data);
    } catch (err: any) {
      onError(err.message || 'Failed to create evidence request threads');
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
                already have real bank money nearby). For each officer with any, opens a Discussions
                thread listing their items and asking them to attach evidence (bank slip, transfer
                receipt, client confirmation). Run Clean Up first so this only targets what's
                genuinely left unexplained.
              </p>

              {preview.would_create_count === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing genuinely unexplained right now — every remaining item still has a
                  plausible bank-side match somewhere, or nothing is attributed to an officer at all.
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                    <strong>{preview.would_create_count}</strong> officer(s) would receive an
                    evidence-request thread.
                  </div>
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                    {preview.would_create.map((row) => (
                      <li key={row.officer_id} className="px-3 py-2 text-sm flex items-center justify-between">
                        <span className="min-w-0">
                          <span className="block text-gray-900 truncate">{row.officer_name}</span>
                          <span className="block text-gray-500 text-xs">
                            {row.branch_name || '—'} · {row.item_count} item(s)
                          </span>
                        </span>
                        <span className="font-medium text-amber-700 shrink-0 ml-2">
                          {formatNaira(row.total_amount)}
                        </span>
                      </li>
                    ))}
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
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : `Send ${preview.would_create_count} Evidence Request(s)`}
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
