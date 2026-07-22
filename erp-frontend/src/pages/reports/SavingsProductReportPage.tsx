import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Loader2, AlertCircle, PiggyBank, TrendingUp, Users, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { getSavingsAccounts, getSavingsProductConfig, type SavingsAccount, type SavingsProductConfig } from '../../services/savingsService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so account balances updated by backend cron jobs
// (interest posting) surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

interface Product {
  id: number;
  name: string;
  code: string;
  product_type: string;
  is_active: boolean;
}

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  dormant:  'bg-yellow-100 text-yellow-700',
  closed:   'bg-gray-100 text-gray-600',
  frozen:   'bg-blue-100 text-blue-700',
  inactive: 'bg-red-100 text-red-700',
};

export default function SavingsProductReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productConfig, setProductConfig] = useState<SavingsProductConfig | null>(null);
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Load all SAVINGS products on mount
  useEffect(() => {
    api.get('/products/products/', { params: { product_type: 'SAVINGS', is_active: true, page_size: 200 } })
      .then((res: any) => {
        const list: Product[] = Array.isArray(res) ? res : (res.results ?? []);
        setProducts(list);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // Load accounts + config when product changes
  const loadAccounts = useCallback((background = false) => {
    if (!selectedProduct) { setAccounts([]); setProductConfig(null); return; }
    if (!background) setLoading(true);
    setError('');
    Promise.all([
      getSavingsAccounts({ product: selectedProduct.id }),
      getSavingsProductConfig(selectedProduct.id),
    ])
      .then(([accts, configs]) => {
        setAccounts(Array.isArray(accts) ? accts : (accts as any).results ?? []);
        const cfgList = Array.isArray(configs) ? configs : [configs].filter(Boolean);
        setProductConfig(cfgList[0] ?? null);
      })
      .catch(() => setError('Failed to load product data.'))
      .finally(() => setLoading(false));
  }, [selectedProduct]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  useAutoRefresh(() => loadAccounts(true), AUTO_REFRESH_MS, !!selectedProduct);

  const filtered = accounts.filter(a =>
    !search ||
    a.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.account_number?.includes(search)
  );

  const active  = filtered.filter(a => a.status === 'active');
  const dormant = filtered.filter(a => a.status === 'dormant');
  const closed  = filtered.filter(a => !['active', 'dormant'].includes(a.status));

  const totalBalance = active.reduce((s, a) => s + parseFloat(a.current_balance || '0'), 0);
  const avgBalance   = active.length > 0 ? totalBalance / active.length : 0;

  const isDaily = productConfig?.is_daily_contribution ?? false;
  const isCycle = productConfig?.has_savings_cycle ?? false;
  const cycleLabel = isDaily ? 'Daily Contribution' : isCycle ? 'Cycle Savings' : 'Regular Savings';

  function exportCSV() {
    const header = 'Client,Account Number,Balance,Status,Opened,Product';
    const rows = filtered.map(a =>
      `"${a.client_name}",${a.account_number},${a.current_balance},${a.status},${a.opened_on},${selectedProduct?.name ?? ''}`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `savings-${selectedProduct?.code ?? 'report'}-${new Date().toISOString().split('T')[0]}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Savings Product Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select a product to see portfolio health, account breakdown, and balance insights.
            </p>
          </div>
          {selectedProduct && !loading && filtered.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
        </div>

        {/* Product selector */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Savings Product</label>
          {loadingProducts ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading products…
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-500">No active savings products found.</p>
          ) : (
            <select
              value={selectedProduct?.id ?? ''}
              onChange={e => {
                const p = products.find(x => x.id === Number(e.target.value)) ?? null;
                setSelectedProduct(p);
                setSearch('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Choose a product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          )}
        </div>

        {/* Product type badge */}
        {selectedProduct && productConfig && (
          <div className="flex gap-2 mb-5 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isDaily ? 'bg-blue-100 text-blue-700' : isCycle ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
              {cycleLabel}
            </span>
            {isDaily && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                First Deposit = Income
              </span>
            )}
            {isCycle && productConfig.cycle_length_months && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                {productConfig.cycle_length_months}-month cycle · {productConfig.cycle_interest_rate}% interest
              </span>
            )}
          </div>
        )}

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading product data…</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-5">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* Metrics */}
        {!loading && selectedProduct && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <MetricCard label="Total Accounts" value={filtered.length} icon={Users} color="bg-blue-500" />
              <MetricCard label="Active" value={active.length} sub={`${dormant.length} dormant · ${closed.length} closed`} icon={CheckCircle} color="bg-green-500" />
              <MetricCard label="Total Balance" value={`₦${fmt(totalBalance)}`} sub="Active accounts only" icon={PiggyBank} color="bg-indigo-500" />
              <MetricCard label="Average Balance" value={`₦${fmt(avgBalance)}`} sub="Per active account" icon={TrendingUp} color="bg-purple-500" />
            </div>

            {/* Adherence note for DC products */}
            {isDaily && active.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
                <strong>Daily Contribution product</strong> — first deposit each calendar month is posted as income.
                Use the <strong>Savings Collection Sheet</strong> to view and mark today's contributions for this product.
              </div>
            )}

            {/* Search + table */}
            {accounts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by client name or account number…"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => { setSearch(''); setLoading(true); getSavingsAccounts({ product: selectedProduct.id }).then(d => setAccounts(Array.isArray(d) ? d : (d as any).results ?? [])).catch(() => {}).finally(() => setLoading(false)); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Client', 'Account #', 'Balance', 'Status', 'Opened'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No accounts match your search.</td>
                        </tr>
                      ) : filtered.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">{a.client_name}</td>
                          <td className="px-4 py-3 font-mono text-gray-700">{a.account_number}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">₦{fmt(a.current_balance)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[a.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{a.opened_on}</td>
                        </tr>
                      ))}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                            {filtered.length} account{filtered.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            ₦{fmt(filtered.reduce((s, a) => s + parseFloat(a.current_balance || '0'), 0))}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {accounts.length === 0 && !loading && (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <XCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No savings accounts exist under this product yet.</p>
              </div>
            )}
          </>
        )}

        {!selectedProduct && !loadingProducts && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <PiggyBank className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Select a savings product above to view its portfolio.</p>
          </div>
        )}
      </div>
    </div>
  );
}
