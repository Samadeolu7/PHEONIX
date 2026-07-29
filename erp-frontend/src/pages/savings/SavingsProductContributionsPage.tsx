/**
 * Savings Product — Client Contribution Amounts
 * Bulk view/edit of each client's own committed contribution amount for all
 * savings accounts under a daily-contribution product. This is the amount
 * swept to income as the first deposit of the month (capped so an officer
 * posting several days' worth on one instrument doesn't over-sweep) — set it
 * here once at account setup, and come back to update it whenever a client's
 * agreed amount changes.
 * Route: /savings/products/:id/contributions
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, AlertCircle, CheckCircle, Save, Search } from 'lucide-react';
import { api as apiClient } from '../../api';
import { useSavingsAccounts, useBulkSetContributionAmounts } from '../../hooks/useSavings';
import type { SavingsAccount } from '../../services/savingsService';

function fmt(v: string | number | null | undefined) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n == null || isNaN(n)) return '0.00';
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SavingsProductContributionsPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();

  const [productName, setProductName] = useState('');
  const [search, setSearch] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get(`/products/products/${productId}/`).then((p: any) => {
      setProductName(p?.name ?? '');
    }).catch(() => {});
  }, [productId]);

  const { data, isLoading, refetch } = useSavingsAccounts(
    { product: productId, status: 'active', page_size: 1000 },
    { enabled: !!productId }
  );

  const accounts: SavingsAccount[] = useMemo(() => {
    const raw = data as any;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : (raw.results ?? []);
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.account_number.toLowerCase().includes(q) || a.client_name.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const bulkMutation = useBulkSetContributionAmounts({
    onSuccess: (res) => {
      setSuccess(`Updated ${res.updated} account(s).`);
      setEdits({});
      refetch();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (e: any) => {
      setError(e?.detail ?? e?.message ?? 'Failed to save changes.');
    },
  });

  function valueFor(acc: SavingsAccount): string {
    if (acc.id in edits) return edits[acc.id];
    return acc.contribution_amount ?? '';
  }

  function isDirty(acc: SavingsAccount): boolean {
    if (!(acc.id in edits)) return false;
    const current = acc.contribution_amount ?? '';
    return edits[acc.id] !== current;
  }

  const dirtyCount = accounts.filter(isDirty).length;

  function applyBulkToBlank() {
    if (bulkValue.trim() === '') return;
    const next = { ...edits };
    for (const acc of filtered) {
      if (!acc.contribution_amount && !(acc.id in edits && edits[acc.id])) {
        next[acc.id] = bulkValue;
      }
    }
    setEdits(next);
  }

  function applyBulkToAll() {
    if (bulkValue.trim() === '') return;
    const next = { ...edits };
    for (const acc of filtered) {
      next[acc.id] = bulkValue;
    }
    setEdits(next);
  }

  function handleSave() {
    setError(null);
    setSuccess(null);
    const updates = accounts
      .filter(isDirty)
      .map(acc => ({
        id: acc.id,
        contribution_amount: edits[acc.id].trim() === '' ? null : edits[acc.id],
      }));
    if (updates.length === 0) return;
    bulkMutation.mutate(updates);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(`/savings/products/${productId}/config`)}
            aria-label="Back to product configuration"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              {productName ? `Client Contribution Amounts — ${productName}` : 'Client Contribution Amounts'}
            </h1>
            <p className="text-xs text-gray-500">
              What each client committed to bring in per cycle. Blank uses the product's default.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={dirtyCount === 0 || bulkMutation.isPending}
            className="flex items-center gap-2 bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-40"
          >
            {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save {dirtyCount > 0 ? `(${dirtyCount})` : ''}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-4 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 mb-4 text-sm text-green-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {success}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by account number or client name"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={bulkValue}
              onChange={e => setBulkValue(e.target.value)}
              placeholder="₦ amount"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <button
              type="button"
              onClick={applyBulkToBlank}
              className="text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Fill blanks
            </button>
            <button
              type="button"
              onClick={applyBulkToAll}
              className="text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Set all visible
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              No active savings accounts found for this product.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Account</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">Client</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500">Product Default</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500">Current Balance</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500">Committed Amount (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(acc => (
                  <tr key={acc.id} className={isDirty(acc) ? 'bg-amber-50' : undefined}>
                    <td className="px-4 py-2.5 text-gray-900 font-medium">{acc.account_number}</td>
                    <td className="px-4 py-2.5 text-gray-700">{acc.client_name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {acc.product_contribution_amount ? `₦${fmt(acc.product_contribution_amount)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">₦{fmt(acc.current_balance)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={valueFor(acc)}
                        onChange={e => setEdits(prev => ({ ...prev, [acc.id]: e.target.value }))}
                        placeholder="Use default"
                        title={`Committed contribution amount for ${acc.account_number}`}
                        className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
