import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Download, Tag } from 'lucide-react';
import { IncomeCategoryRow } from '../../../services/incomeReportsService';
import { useIncomeByCategory } from '../../../hooks/useIncomeReports';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';

// Background refresh so income figures posted by other users / cron jobs
// surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const janFirst = () => `${new Date().getFullYear()}-01-01`;

const fmt = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RateBar: React.FC<{ rate: number }> = ({ rate }) => {
  const pct = Math.min(100, Math.max(0, rate));
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
};

const exportCsv = (rows: IncomeCategoryRow[], dateFrom: string, dateTo: string) => {
  const header = 'Code,Category,Invoiced,Collected,Outstanding,Invoices,Collection Rate\n';
  const body = rows
    .map(r =>
      [
        r.category_code,
        `"${r.category_name}"`,
        r.invoiced,
        r.collected,
        r.outstanding,
        r.invoice_count,
        `${r.collection_rate.toFixed(2)}%`,
      ].join(',')
    )
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `income-by-category_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const IncomeByCategoryPage: React.FC = () => {
  const [dateFrom, setDateFrom] = useState(janFirst());
  const [dateTo, setDateTo] = useState(todayStr());
  const [appliedFilters, setAppliedFilters] = useState({
    date_from: janFirst(),
    date_to: todayStr(),
  });

  const { data, isLoading: loading, error: queryError, refetch } = useIncomeByCategory(appliedFilters);
  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  useAutoRefresh(() => refetch(), AUTO_REFRESH_MS);

  const handleApply = () => setAppliedFilters({ date_from: dateFrom, date_to: dateTo });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <Link
              to="/incomes/reports"
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Income by Category</h1>
                <p className="text-xs text-gray-500">Revenue grouped by income category</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleApply}
              disabled={loading}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                         text-white text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Apply
            </button>
            {data && data.rows.length > 0 && (
              <button
                onClick={() => exportCsv(data.rows, data.date_from, data.date_to)}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50
                           text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
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

        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Invoiced',
                value: `₦${fmt(data.totals.invoiced)}`,
                color: 'text-gray-900',
              },
              {
                label: 'Collected',
                value: `₦${fmt(data.totals.collected)}`,
                color: 'text-green-700',
              },
              {
                label: 'Outstanding',
                value: `₦${fmt(data.totals.outstanding)}`,
                color: 'text-orange-600',
              },
              {
                label: 'Collection Rate',
                value: `${data.totals.collection_rate.toFixed(1)}%`,
                color: 'text-blue-700',
              },
            ].map(kpi => (
              <div
                key={kpi.label}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16 text-gray-400 text-sm">Loading...</div>
        )}

        {!loading && data && data.rows.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
            No income data found for the selected period.
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoiced (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Collected (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">
                    Outstanding (₦)
                  </th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoices</th>
                  <th className="px-5 py-3 font-medium text-gray-600 min-w-[160px]">
                    Collection Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(row => (
                  <tr key={row.category_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{row.category_code}</span>
                        <span className="text-gray-900 font-medium">{row.category_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900 font-medium">
                      {fmt(row.invoiced)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">
                      {fmt(row.collected)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-orange-600">
                      {fmt(row.outstanding)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                      {row.invoice_count}
                    </td>
                    <td className="px-5 py-3">
                      <RateBar rate={row.collection_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td className="px-5 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">
                    {fmt(data.totals.invoiced)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-green-700">
                    {fmt(data.totals.collected)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-orange-600">
                    {fmt(data.totals.outstanding)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-700">
                    {data.rows.reduce((s, r) => s + r.invoice_count, 0)}
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

export default IncomeByCategoryPage;
