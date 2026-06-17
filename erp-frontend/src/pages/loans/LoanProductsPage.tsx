/**
 * Loan Products Page
 * Lists all loan products configured in the system.
 * Finance/Admin staff use this to manage interest rates, terms, and fees per product.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw, Landmark, Settings2 } from 'lucide-react';
import { loanService, LoanProduct } from '../../services/loanService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n)
    ? '—'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const METHOD_LABEL: Record<string, string> = {
  straight_line: 'Straight Line',
  flat: 'Straight Line',        // legacy alias
  reducing_balance: 'Reducing Balance',
  compound: 'Compound',
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoanProductsPage() {
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loanService.listProducts(activeOnly ? { is_active: true } : undefined);
      setProducts(data);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load loan products.');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Loan Products</h1>
              <p className="text-xs text-gray-500">Configure interest rates, terms, and fee structures</p>
            </div>
          </div>
          <button
            onClick={loadProducts}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={e => setActiveOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show active only
          </label>
          <span className="text-xs text-gray-400">{products.length} product{products.length !== 1 ? 's' : ''}</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
          </div>
        )}

        {!loading && products.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <Landmark className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No loan products found</p>
            <p className="text-xs text-gray-400 mt-1">Loan products are created by administrators.</p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Min Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Max Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Term (months)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate (%)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Processing Fee</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.min_loan_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.max_loan_amount)}</td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {p.min_term_months}–{p.max_term_months}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.default_interest_rate)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {METHOD_LABEL[p.interest_calculation_method] ?? p.interest_calculation_method}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {parseFloat(p.processing_fee_percentage) > 0
                        ? `${fmt(p.processing_fee_percentage)}%`
                        : fmt(p.processing_fee_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/loans/products/${p.id}/config`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Configure
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Loan products are managed by administrators. Contact your system admin to add or modify products.
        </p>
      </div>
    </div>
  );
}
