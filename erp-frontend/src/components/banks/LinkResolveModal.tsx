import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import type { ReconciliationException } from '../../types/banks';

interface LinkResolveModalProps {
  bankAccountId: number;
  exception: ReconciliationException;
  onClose: () => void;
  onSuccess: (result: { exception_a: ReconciliationException; exception_b: ReconciliationException }) => void;
  onError: (message: string) => void;
}

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Manually nets a bank_only exception against another bank_only exception
 * of the opposite direction on the same bank account — e.g. money sent to
 * the wrong bank (DEBIT) then clawed back with a compensating transfer
 * (CREDIT), possibly on a different reconciliation date. Director-only,
 * exact amount match only — see LinkResolveExceptionsView (banks/views.py).
 */
export const LinkResolveModal: React.FC<LinkResolveModalProps> = ({
  bankAccountId,
  exception,
  onClose,
  onSuccess,
  onError,
}) => {
  const oppositeDirection = exception.direction === 'CREDIT' ? 'DEBIT' : 'CREDIT';
  const [candidates, setCandidates] = useState<ReconciliationException[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reconciliationService
      .listUnresolvedBankOnlyExceptions(bankAccountId, oppositeDirection)
      .then((results) => {
        if (!cancelled) {
          setCandidates(results.filter((c) => c.id !== exception.id));
        }
      })
      .catch((err: any) => {
        if (!cancelled) onError(err.message || 'Failed to load candidates');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountId, oppositeDirection, exception.id]);

  const exactMatches = (candidates || []).filter((c) => c.bank_amount === exception.bank_amount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !notes.trim()) return;
    setSubmitting(true);
    try {
      const result = await reconciliationService.linkResolveExceptions({
        exception_a_id: exception.id,
        exception_b_id: selectedId,
        resolution_notes: notes,
      });
      onSuccess(result);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to net exceptions together');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Link to Another Exception</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Netting requires an exact amount match — e.g. a compensating transfer that
            reverses money sent to the wrong bank. Both exceptions are resolved together.
          </p>

          <div className="bg-gray-50 rounded-md p-3 text-sm">
            <p className="text-gray-900">
              {exception.direction}: {exception.bank_narration || '—'}
            </p>
            <p className="text-gray-500 mt-1">
              {formatAmount(exception.bank_amount)} on {exception.bank_date}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select the matching {oppositeDirection.toLowerCase()} exception
            </label>
            {loading ? (
              <p className="text-sm text-gray-500">Loading candidates…</p>
            ) : exactMatches.length === 0 ? (
              <p className="text-sm text-gray-500">
                No unresolved {oppositeDirection.toLowerCase()} exceptions with a matching
                amount ({formatAmount(exception.bank_amount)}) were found on this bank account.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-56 overflow-y-auto">
                {exactMatches.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="candidate"
                        checked={selectedId === c.id}
                        onChange={() => setSelectedId(c.id)}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="block text-gray-900">{c.bank_narration || '—'}</span>
                        <span className="block text-gray-500 text-xs mt-0.5">
                          {formatAmount(c.bank_amount)} on {c.bank_date}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain why these two are the same event"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedId || !notes.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Linking…' : 'Net & Resolve Both'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkResolveModal;
