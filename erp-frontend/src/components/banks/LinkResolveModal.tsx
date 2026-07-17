import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { FEE_LINK_MAX_AMOUNT, MIN_REASON_LENGTH, type ReconciliationException } from '../../types/banks';

interface LinkResolveModalProps {
  exception: ReconciliationException;
  onClose: () => void;
  onSuccess: (result: { exception_a: ReconciliationException; exception_b: ReconciliationException }) => void;
  onError: (message: string) => void;
}

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

// bank_only has only bank_amount, erp_only has only erp_amount — whichever
// is present is the exception's resolve amount (mirrors the backend's
// ReconciliationException.resolve_amount property).
function resolveAmount(exc: ReconciliationException): string | null {
  return exc.bank_amount ?? exc.erp_amount;
}

const TYPE_LABELS: Record<ReconciliationException['exception_type'], string> = {
  bank_only: 'In bank, not in ERP',
  erp_only: 'In ERP, not in bank',
  amount_diff: 'Amount difference',
};

// Fee = bank_only.bank_amount - erp_only.erp_amount, DEBIT only, for a
// bank_only/erp_only pair — the bank-deducted-transfer-fee pattern
// LinkResolveBankChargeView handles. Returns null for anything else
// (bank_only+bank_only netting candidates, exact-amount matches, CREDIT
// direction, or a shortfall where erp_only is larger) — those stay on the
// plain link-resolve path. Mirrors bank_charge_fee (banks/reconciliation_utils.py).
function bankChargeFee(
  a: ReconciliationException,
  b: ReconciliationException
): { bankExc: ReconciliationException; erpExc: ReconciliationException; fee: number } | null {
  if (a.exception_type === b.exception_type) return null;
  const bankExc = a.exception_type === 'bank_only' ? a : b;
  const erpExc = a.exception_type === 'erp_only' ? a : b;
  if (bankExc.exception_type !== 'bank_only' || erpExc.exception_type !== 'erp_only') return null;
  if (bankExc.direction !== 'DEBIT' || erpExc.direction !== 'DEBIT') return null;
  if (bankExc.bank_amount === null || erpExc.erp_amount === null) return null;
  const fee = parseFloat(bankExc.bank_amount) - parseFloat(erpExc.erp_amount);
  if (fee <= 0 || Math.round(fee * 100) === 0) return null;
  return { bankExc, erpExc, fee };
}

/**
 * Manually links this exception against a candidate on the same bank
 * account and resolves both at once — either another bank_only exception
 * of the opposite direction (a compensating transfer: money sent to the
 * wrong bank, then clawed back), or a bank_only/erp_only pair of the same
 * direction (the bank line and the ERP payment plausibly failed to
 * auto-match). The server computes which candidates are valid for this
 * exception's own type/direction — see LinkCandidatesView (banks/views.py).
 */
export const LinkResolveModal: React.FC<LinkResolveModalProps> = ({
  exception,
  onClose,
  onSuccess,
  onError,
}) => {
  const [candidates, setCandidates] = useState<ReconciliationException[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reconciliationService
      .getLinkCandidates(exception.id)
      .then((results) => {
        if (!cancelled) setCandidates(results);
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
  }, [exception.id]);

  const selectedCandidate = candidates?.find((c) => c.id === selectedId) ?? null;
  const selectedFee = selectedCandidate ? bankChargeFee(exception, selectedCandidate) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !selectedCandidate || notes.trim().length < MIN_REASON_LENGTH) return;
    setSubmitting(true);
    try {
      if (selectedFee) {
        const result = await reconciliationService.linkResolveBankCharge({
          bank_only_exception_id: selectedFee.bankExc.id,
          erp_only_exception_id: selectedFee.erpExc.id,
          resolution_notes: notes,
        });
        onSuccess({ exception_a: result.bank_only_exception, exception_b: result.erp_only_exception });
        onClose();
        return;
      }
      const result = await reconciliationService.linkResolveExceptions({
        exception_a_id: exception.id,
        exception_b_id: selectedId,
        resolution_notes: notes,
      });
      onSuccess(result);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to link exceptions together');
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
            Linking normally requires an exact amount match. Two bank_only exceptions of opposite
            directions is a compensating transfer; a bank_only paired with an erp_only of the
            same direction means they're likely the same transaction that failed to auto-match.
            For a DEBIT bank_only/erp_only pair, a candidate up to ₦{FEE_LINK_MAX_AMOUNT} lower is
            also shown — a bank-deducted transfer fee never recorded in the ERP — and linking it
            also creates a pending "Bank Charges" payment for the fee, for a director to approve
            separately. Both exceptions are resolved together either way.
          </p>

          <div className="bg-gray-50 rounded-md p-3 text-sm">
            <p className="text-gray-900">
              {TYPE_LABELS[exception.exception_type]} · {exception.direction}:{' '}
              {exception.bank_narration || exception.erp_narration || '—'}
            </p>
            <p className="text-gray-500 mt-1">
              {formatAmount(resolveAmount(exception))} on{' '}
              {exception.bank_date || exception.erp_date}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select a matching candidate
            </label>
            {loading ? (
              <p className="text-sm text-gray-500">Loading candidates…</p>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-sm text-gray-500">
                No unresolved exceptions with a matching amount (
                {formatAmount(resolveAmount(exception))}) and a valid pairing were found on this
                bank account.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-56 overflow-y-auto">
                {candidates.map((c) => {
                  const fee = bankChargeFee(exception, c);
                  return (
                    <li key={c.id}>
                      <label className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="candidate"
                          checked={selectedId === c.id}
                          onChange={() => setSelectedId(c.id)}
                          className="mt-1"
                        />
                        <span className="text-sm min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
                                c.exception_type === 'bank_only'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {TYPE_LABELS[c.exception_type]}
                            </span>
                            <span className="text-xs text-gray-400">{c.direction}</span>
                            {fee && (
                              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                Fee ₦{fee.fee.toLocaleString()} — bank charge
                              </span>
                            )}
                          </span>
                          <span className="block text-gray-900 mt-0.5 truncate">
                            {c.bank_narration || c.erp_narration || '—'}
                          </span>
                          <span className="block text-gray-500 text-xs mt-0.5">
                            {formatAmount(resolveAmount(c))} on {c.bank_date || c.erp_date}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selectedFee && (
            <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-xs text-purple-900">
              This will resolve both exceptions and create a pending "Bank Charges" payment of{' '}
              <strong>₦{selectedFee.fee.toLocaleString()}</strong> — bank_only #{selectedFee.bankExc.id} (₦
              {selectedFee.bankExc.bank_amount}) vs erp_only #{selectedFee.erpExc.id} (₦
              {selectedFee.erpExc.erp_amount}) — for a director to approve separately before it posts.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Explain why these two are the same event (min ${MIN_REASON_LENGTH} chars)`}
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
              disabled={submitting || !selectedId || notes.trim().length < MIN_REASON_LENGTH}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Linking…' : selectedFee ? 'Link as Bank Charge & Resolve Both' : 'Link & Resolve Both'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkResolveModal;
