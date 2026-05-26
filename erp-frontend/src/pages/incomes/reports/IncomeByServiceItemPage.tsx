// Income by Service Item Report
// Detailed breakdown per service/fee item with quantity, price, collection metrics

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Download, Package } from 'lucide-react';
import {
  incomeReportsService,
  IncomeByServiceItemData,
  IncomeServiceItemRow,
  IncomeReportParams,
} from '../../../services/incomeReportsService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const janFirst = () => `${new Date().getFullYear()}-01-01`;

const fmt = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (v: number) => v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const RateBar: React.FC<{ rate: number }> = ({ rate }) => {
  const pct = Math.min(100, Math.max(0, rate));
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
};

const exportCsv = (rows: IncomeServiceItemRow[], dateFrom: string, dateTo: string) => {
  const header = 'Code,Service Item,Category,Qty Invoiced,Default Price,Invoiced,Collected,Outstanding,Collection Rate\n';
  const body = rows
    .map(r =>
      [
        r.service_item_code,
        `"${r.service_item_name}"`,
        `"${r.category_name}"`,
        r.quantity_invoiced,
        r.default_price,
        r.invoiced,
        r.collected,
        r.outstanding,
        `${r.collection_rate.toFixed(2)}%`,
      ].join(',')
    )
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `income-by-service-item_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const IncomeByServiceItemPage: React.FC = () => {
  const [dateFrom,    setDateFrom]    = useState(janFirst());
  const [dateTo,      setDateTo]      = useState(todayStr());
  const [categoryId,  setCategoryId]  = useState('');
  const [search,      setSearch]      = useState('');
  const [data,        setData]        = useState<IncomeByServiceItemData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async (params: IncomeReportParams) => {
    setLoading(true);
    setError(null);
    try {
      setData(await incomeReportsService.getByServiceItem(params));
    } catch (e: any) {
      setError(e?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load({ date_from: dateFrom, date_to: dateTo }); }, []);

  const handleApply = () =>
    load({ date_from: dateFrom, date_to: dateTo, category_id: categoryId || undefined });

  const filteredRows = data?.rows.filter(r =>
    !search ||
    r.service_item_name.toLowerCase().includes(search.toLowerCase()) ||
    r.service_item_code.toLowerCase().includes(search.toLowerCase()) ||
    r.category_name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/incomes/reports" className="text-gray-400 hover:text-gray-700 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Income by Service Item</h1>
                <p className="text-xs text-gray-500">Revenue per service / fee line item</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleApply} disabled={loading}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                         text-white text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Apply
            </button>
            {data && data.rows.length > 0 && (
              <button onClick={() => exportCsv(data.rows, data.date_from, data.date_to)}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50
                           text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Invoiced',  value: `₦${fmt(data.totals.invoiced)}`,    color: 'text-gray-900' },
              { label: 'Collected',        value: `₦${fmt(data.totals.collected)}`,   color: 'text-green-700' },
              { label: 'Outstanding',      value: `₦${fmt(data.totals.outstanding)}`, color: 'text-orange-600' },
              { label: 'Collection Rate',  value: `${data.totals.collection_rate.toFixed(1)}%`, color: 'text-blue-700' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{kpi.label}</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16 text-gray-400 text-sm">Loading...</div>
        )}

        {!loading && data && filteredRows.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
            {search ? 'No items match your search.' : 'No income data found for the selected period.'}
          </div>
        )}

        {!loading && data && filteredRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Service Item</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Qty Invoiced</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Default Price</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoiced (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Collected (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Outstanding (₦)</th>
                  <th className="px-5 py-3 font-medium text-gray-600 min-w-[150px]">Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map(row => (
                  <tr key={row.service_item_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div>
                        <span className="font-medium text-gray-900">{row.service_item_name}</span>
                        <span className="ml-2 font-mono text-xs text-gray-400">{row.service_item_code}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{row.category_name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                      {fmtQty(row.quantity_invoiced)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                      {fmt(row.default_price)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-900">
                      {fmt(row.invoiced)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">
                      {fmt(row.collected)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-orange-600">
                      {fmt(row.outstanding)}
                    </td>
                    <td className="px-5 py-3">
                      <RateBar rate={row.collection_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="px-5 py-3 font-bold text-gray-900">
                    Total ({filteredRows.length} items)
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-700">
                    {fmtQty(filteredRows.reduce((s, r) => s + r.quantity_invoiced, 0))}
                  </td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">
                    {fmt(filteredRows.reduce((s, r) => s + r.invoiced, 0))}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-green-700">
                    {fmt(filteredRows.reduce((s, r) => s + r.collected, 0))}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-orange-600">
                    {fmt(filteredRows.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                  <td className="px-5 py-3">
                    <RateBar rate={data.totals.collection_rate} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomeByServiceItemPage;
