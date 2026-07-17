import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { MIN_REASON_LENGTH, type BulkLinkResolveBankChargePreview, type BulkLinkResolveBankChargeResult } from '../../types/banks';

interface BulkLinkBankChargeModalProps {
  bankAccountId: number;
  bankAccountName: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function formatNaira(value: string): string {
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Auto-pairs and resolves every unambiguous bank_only/erp_only DEBIT
 * bank-charge match on one bank account in a single action — the batch
 * equivalent of using LinkResolveModal's "Link as Bank Charge" one pair at
 * a time. Always previews first (dry_run) since there's no per-pair
 * confirmation once the real run starts; ambiguous/unmatched candidates
 * are never guessed at server-side and still need the ordinary Link picker.
 */
export const BulkLinkBankChargeModal: React.FC<BulkLinkBankChargeModalProps> = ({
  bankAccountId,
  bankAccountName,
  onClose,
  onSuccess,
  onError,
}) => {
  const [preview, setPreview] = useState<BulkLinkResolveBankChargePreview | null>(null);
  const [result, setResult] = useState<BulkLinkResolveBankChargeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reconciliationService
      .bulkLinkResolveBankCharge({ bank_account_id: bankAccountId, dry_run: true })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: any) => {
        if (!cancelled) onError(err.message || 'Failed to preview bulk bank-charge linking');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountId]);

  const handleConfirm = async () => {
    if (notes.trim().length < MIN_REASON_LENGTH) return;
    setSubmitting(true);
    try {
      const data = await reconciliationService.bulkLinkResolveBankCharge({
        bank_account_id: bankAccountId,
        resolution_notes: notes,
        dry_run: false,
      });
      setResult(data);
    } catch (err: any) {
      onError(err.message || 'Failed to bulk-link bank charges');
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
          <h2 className="text-lg font-semibold text-gray-900">Bulk-Link Bank Charges — {bankAccountName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Scanning for unambiguous bank-charge pairs…</p>}

          {!loading && preview && !result && (
            <>
              <p className="text-xs text-gray-500">
                Finds every bank_only/erp_only DEBIT pair on this account that differ by a small,
                plausible bank-deducted fee and links+resolves them all at once. Only pairs where
                each side is unambiguously the other's single match are included — anything with
                more than one plausible candidate is left for manual review via the ordinary Link
                action. Each pair still creates its own pending "Bank Charges" payment requiring
                separate director approval before it posts.
              </p>

              {preview.would_resolve_count === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing to auto-link right now.
                  {preview.ambiguous_count > 0 && (
                    <span className="block mt-1 text-amber-700">
                      {preview.ambiguous_count} bank_only exception(s) have more than one plausible
                      match — use Link on those individually.
                    </span>
                  )}
                  {preview.unmatched_count > 0 && (
                    <span className="block mt-1 text-gray-500">
                      {preview.unmatched_count} bank_only exception(s) have no fee-tolerant match at all.
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-sm text-purple-900">
                    <p>
                      <strong>{preview.would_resolve_count}</strong> pair(s) would be linked and resolved,
                      totalling <strong>{formatNaira(preview.total_fee_amount)}</strong> in pending bank
                      charges.
                    </p>
                    {(preview.ambiguous_count > 0 || preview.unmatched_count > 0) && (
                      <p className="mt-1 text-xs text-purple-700">
                        {preview.ambiguous_count > 0 && `${preview.ambiguous_count} left as ambiguous. `}
                        {preview.unmatched_count > 0 && `${preview.unmatched_count} left unmatched.`}
                      </p>
                    )}
                  </div>
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                    {preview.would_resolve.map((p) => (
                      <li key={`${p.bank_only_exception_id}-${p.erp_only_exception_id}`} className="px-3 py-2 text-sm flex justify-between">
                        <span className="text-gray-700">
                          #{p.bank_only_exception_id} ↔ #{p.erp_only_exception_id}
                        </span>
                        <span className="font-medium text-purple-700">{formatNaira(p.fee_amount)}</span>
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
                      placeholder={`Explain the bulk link (min ${MIN_REASON_LENGTH} chars) — applied to every pair`}
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
                Linked and resolved <strong>{result.resolved_count}</strong> pair(s), totalling{' '}
                <strong>{formatNaira(result.total_fee_amount)}</strong> in pending bank-charge payments
                now awaiting director approval.
              </div>
              {result.failed_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {result.failed_count} pair(s) failed and were skipped — retry those individually via Link.
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
              {preview && preview.would_resolve_count > 0 && (
                <button
                  onClick={handleConfirm}
                  disabled={submitting || notes.trim().length < MIN_REASON_LENGTH}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {submitting ? 'Linking…' : `Link All ${preview.would_resolve_count} Pair(s)`}
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

export default BulkLinkBankChargeModal;
