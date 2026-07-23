import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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

function resolveAmount(exc: ReconciliationException): string | null {
  return exc.bank_amount ?? exc.erp_amount;
}

const TYPE_LABELS: Record<ReconciliationException['exception_type'], string> = {
  bank_only: 'In bank, not in ERP',
  erp_only: 'In ERP, not in bank',
  amount_diff: 'Amount difference',
};

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

export const LinkResolveModal: React.FC<LinkResolveModalProps> = ({
  exception,
  onClose,
  onSuccess,
  onError,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const { data: candidates, isLoading: loading } = useQuery({
    queryKey: ['reconciliation', 'linkCandidates', exception.id],
    queryFn: () => reconciliationService.getLinkCandidates(exception.id),
    staleTime: 60_000,
    throwOnError: false,
  });

  const selectedCandidate = candidates?.find((c) => c.id === selectedId) ?? null;
  const selectedFee = selectedCandidate ? bankChargeFee(exception, selectedCandidate) : null;
  const selectedPhantomTransfer =
    selectedCandidate &&
    exception.exception_type === 'erp_only' &&
    selectedCandidate.exception_type === 'erp_only' &&
    selectedCandidate.bank_account_name !== exception.bank_account_name
      ? selectedCandidate
      : null;

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !selectedCandidate || notes.trim().length < MIN_REASON_LENGTH) return;
      if (selectedFee) {
        const result = await reconciliationService.linkResolveBankCharge({
          bank_only_exception_id: selectedFee.bankExc.id,
          erp_only_exception_id: selectedFee.erpExc.id,
          resolution_notes: notes,
        });
        return { exception_a: result.bank_only_exception, exception_b: result.erp_only_exception };
      }
      return reconciliationService.linkResolveExceptions({
        exception_a_id: exception.id,
        exception_b_id: selectedId,
        resolution_notes: notes,
      });
    },
    onSuccess: (result) => {
      if (result) {
        onSuccess(result);
        onClose();
      }
    },
    onError: (err: any) => onError(err.message || 'Failed to link exceptions together'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    linkMutation.mutate();
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
            same direction means they're likely the same transaction that failed to auto-match;
            two erp_only exceptions of opposite directions are the legs of an internal or
            inter-bank movement that never reached a bank statement. For a DEBIT
            bank_only/erp_only pair, a candidate up to ₦{FEE_LINK_MAX_AMOUNT} lower is also
            shown — a bank-deducted transfer fee never recorded in the ERP — and linking it also
            creates a pending "Bank Charges" payment for the fee, for a director to approve
            separately. Both exceptions are resolved together either way.
          </p>

          <div className="bg-gray-50 rounded-md p-3 text-sm">
            <p className="text-gray-900">
              {TYPE_LABELS[exception.exception_type]} · {exception.direction}:{' '}
              {/* erp_only rows carry the last claimant bank line's narration in
                  bank_narration (unmatch bookkeeping) — the payment's own
                  description must win or a no-reference payment masquerades as
                  one whose reference matches a bank line verbatim. */}
              {exception.exception_type === 'erp_only'
                ? exception.erp_narration || exception.bank_narration || '—'
                : exception.bank_narration || exception.erp_narration || '—'}
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
                            {c.bank_account_name && c.bank_account_name !== exception.bank_account_name && (
                              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                {c.bank_account_name}
                              </span>
                            )}
                            {fee && (
                              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                Fee ₦{fee.fee.toLocaleString()} — bank charge
                              </span>
                            )}
                          </span>
                          <span className="block text-gray-900 mt-0.5 truncate">
                            {c.exception_type === 'erp_only'
                              ? c.erp_narration || c.bank_narration || '—'
                              : c.bank_narration || c.erp_narration || '—'}
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

          {selectedPhantomTransfer && (
            <div className="bg-amber-50 border border-amber-300 rounded-md p-3 text-xs text-amber-900">
              These two are the legs of a recorded transfer between{' '}
              <strong>{exception.bank_account_name}</strong> and{' '}
              <strong>{selectedPhantomTransfer.bank_account_name}</strong> that never appeared in
              either bank statement. Resolving them will also <strong>post counter entries</strong>{' '}
              (a reversal of the recorded transaction) so both bank GLs return to matching the real
              banks. If the money actually moved some other way, re-record the movement correctly
              afterwards.
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
              disabled={linkMutation.isPending || !selectedId || notes.trim().length < MIN_REASON_LENGTH}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {linkMutation.isPending ? 'Linking…' : selectedFee ? 'Link as Bank Charge & Resolve Both' : 'Link & Resolve Both'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkResolveModal;
