import React, { useState } from 'react';
import { Search, RotateCcw, AlertCircle, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

interface Transaction {
  id: number;
  series: { id: number; code: string; description: string } | null;
  description: string;
  total_debits: string;
  date: string;
  created_by_name: string | null;
  is_reversed: boolean;
  reference_number: string;
  workflow_reference: string | null;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

export default function TransactionReversalPage() {
  const [reference, setReference] = useState('');
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!reference.trim()) return;
    setLoading(true);
    setError('');
    setTx(null);
    setConfirm(false);
    setSuccess('');
    try {
      const res = await api.get('/transactions/transactions/', {
        params: { reference: reference.trim(), page_size: 1 },
      });
      const items: Transaction[] = Array.isArray(res) ? res : (res as any).results ?? [];
      if (items.length === 0) {
        setError('No transaction found with that reference.');
      } else {
        setTx(items[0]);
      }
    } catch {
      setError('Failed to search for the transaction.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReverse() {
    if (!tx || !reason.trim()) return;
    setReversing(true);
    setError('');
    try {
      await api.post(`/transactions/transactions/${tx.id}/reverse/`, { reason });
      setSuccess(`Transaction #${tx.reference_number} reversed successfully.`);
      setTx(null);
      setReference('');
      setReason('');
      setConfirm(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to reverse transaction. Contact your administrator.');
    } finally {
      setReversing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Transaction Reversal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Search for a transaction by reference number and reverse it. This action requires director-level access.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Caution — Irreversible Action</p>
            <p>Reversing a transaction creates counter-entries in the GL and cannot itself be undone. Ensure you have authorization before proceeding.</p>
          </div>
        </div>

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">
            <CheckCircle className="w-4 h-4 shrink-0" />{success}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
          <form onSubmit={search} className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Enter transaction reference (e.g. SAV-DEP-20240001)…"
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !reference.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {tx && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Transaction Found</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-5">
              {[
                ['Reference', tx.reference_number],
                ['Type', tx.series?.code ?? '—'],
                ['Amount', `₦${fmt(tx.total_debits)}`],
                ['Date', tx.date],
                ['Created By', tx.created_by_name ?? '—'],
                ['Description', tx.description],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-500 text-xs">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>

            {tx.is_reversed ? (
              <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-600 text-center">
                This transaction has already been reversed.
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason for Reversal <span className="text-red-500">*</span></label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder="Explain why this transaction is being reversed…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>

                {!confirm ? (
                  <button
                    onClick={() => setConfirm(true)}
                    disabled={!reason.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" /> Reverse This Transaction
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-red-700 font-semibold text-center">
                      Are you sure? This will create counter GL entries and cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirm(false)}
                        className="flex-1 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReverse}
                        disabled={reversing}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {reversing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        Confirm Reversal
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
