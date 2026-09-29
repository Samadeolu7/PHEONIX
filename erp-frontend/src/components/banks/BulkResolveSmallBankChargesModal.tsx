import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, AlertTriangle } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import {
  SMALL_BANK_CHARGE_MAX_AMOUNT,
  type BulkResolveSmallBankChargesPreview,
  type BulkResolveSmallBankChargesResult,
} from '../../types/banks';

interface BulkResolveSmallBankChargesModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function formatNaira(value: string): string {
  return `₦${parseFloat(value).toLocaleString()}`;
}

export const BulkResolveSmallBankChargesModal: React.FC<BulkResolveSmallBankChargesModalProps> = ({
  onClose,
  onSuccess,
  onError,
}) => {
  const { data: preview, isLoading: loading } = useQuery<BulkResolveSmallBankChargesPreview>({
    queryKey: ['reconciliation', 'bulkSmallBankChargesPreview'],
    queryFn: () => reconciliationService.bulkResolveSmallBankChargesPreview(),
    staleTime: 60_000,
    throwOnError: false,
  });

  const {
    data: result,
    mutate: confirmResolve,
    isPending: submitting,
  } = useMutation({
    mutationFn: () => reconciliationService.bulkResolveSmallBankCharges(),
    onError: (err: any) => onError(err.message || 'Failed to post small bank charges to expense'),
  });

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Post Small Bank Charges to Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Scanning for small bank_only debits…</p>}

          {!loading && preview && !result && (
            <>
              <p className="text-xs text-gray-500">
                Every unresolved bank_only DEBIT exception at or below ₦
                {SMALL_BANK_CHARGE_MAX_AMOUNT.toLocaleString()} — stamp duty, SMS alert fees, card
                maintenance fees, VAT on charges — is treated as a presumed bank charge, since the
                ERP never expects to record these at all (unlike a fee-tolerant Link, there's no
                erp_only counterpart to find). Confirming posts each one to a draft Expense +
                pending BankPayment against the fixed &quot;Bank Charges&quot; category in one go.
                Each payment still needs its own director approval before it posts to the GL — this
                never moves money directly, and doesn't resolve the exceptions itself; that happens
                automatically once each payment posts and a later rerun matches it.
              </p>

              {preview.would_resolve_count === 0 ? (
                <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                  Nothing at or below this threshold right now.
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
                    <strong>{preview.would_resolve_count}</strong> exception(s) would be posted,
                    totalling <strong>{formatNaira(preview.total_amount)}</strong> in pending bank
                    charges.
                  </div>
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md max-h-52 overflow-y-auto">
                    {preview.would_resolve.map((item) => (
                      <li key={item.exception_id} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-gray-900 truncate">{item.narration || '—'}</span>
                          <span className="block text-gray-500 text-xs">
                            {item.bank_account_name} · {item.date || '—'}
                          </span>
                        </span>
                        <span className="font-medium text-amber-700 whitespace-nowrap">
                          {formatNaira(item.amount)}
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
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900">
                Posted <strong>{result.resolved_count}</strong> exception(s) to expense, totalling{' '}
                <strong>{formatNaira(result.total_amount)}</strong> in pending bank-charge payments
                now awaiting director approval.
              </div>
              {result.failed_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {result.failed_count} exception(s) failed and were skipped — retry those
                    individually via Post to Expense.
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
                  onClick={() => confirmResolve()}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? 'Posting…' : `Post All ${preview.would_resolve_count} to Expense`}
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

export default BulkResolveSmallBankChargesModal;
