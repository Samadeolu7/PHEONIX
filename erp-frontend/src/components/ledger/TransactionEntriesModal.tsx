// src/components/ledger/TransactionEntriesModal.tsx
// Reusable modal: given a transaction (journal entry) id, shows its debit and
// credit legs, each clickable through to that account's ledger page.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import { journalVoucherService, JournalVoucher } from '../../services/journalVoucherService';

interface TransactionEntriesModalProps {
  transactionId: number;
  onClose: () => void;
}

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    typeof value === 'string' ? parseFloat(value) : value
  );

const TransactionEntriesModal: React.FC<TransactionEntriesModalProps> = ({
  transactionId,
  onClose,
}) => {
  const navigate = useNavigate();
  const [jv, setJv] = useState<JournalVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    journalVoucherService
      .getJournalVoucher(transactionId)
      .then(data => {
        if (!cancelled) setJv(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load transaction entries.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const goToLedger = (accountId: number) => {
    onClose();
    navigate(`/accounts/${accountId}/ledger`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Transaction Entries</h2>
            {jv && <p className="text-xs font-mono text-blue-600 mt-0.5">{jv.reference_number}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-500">{error}</div>
          ) : jv ? (
            <>
              {jv.description && <p className="text-sm text-gray-600 mb-4">{jv.description}</p>}
              <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                {jv.entries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => goToLedger(entry.account.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50 transition-colors group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${
                          entry.side === 'DR'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {entry.side}
                      </span>
                      <span className="font-mono text-xs text-gray-500 flex-shrink-0">
                        {entry.account.code}
                      </span>
                      <span className="text-sm text-gray-700 group-hover:text-blue-600 truncate">
                        {entry.account.name}
                      </span>
                      <ExternalLink
                        size={12}
                        className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity flex-shrink-0"
                      />
                    </span>
                    <span className="font-mono text-sm font-medium text-gray-900 flex-shrink-0 ml-3">
                      {formatCurrency(entry.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TransactionEntriesModal;
