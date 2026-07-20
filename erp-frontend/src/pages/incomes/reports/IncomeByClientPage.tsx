import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Download, Users, ChevronDown } from 'lucide-react';
import { IncomeClientRow, ClientSortField } from '../../../services/incomeReportsService';
import { useIncomeByClient } from '../../../hooks/useIncomeReports';

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const janFirst = () => `${new Date().getFullYear()}-01-01`;

const fmt = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RateBadge: React.FC<{ rate: number }> = ({ rate }) => {
  const pct = Math.min(100, Math.max(0, rate));
  const cls =
    pct >= 90
      ? 'bg-green-100 text-green-800'
      : pct >= 60
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${cls}`}
    >
      {pct.toFixed(1)}%
    </span>
  );
};

const MiniBar: React.FC<{ collected: number; invoiced: number }> = ({ collected, invoiced }) => {
  const pct = invoiced > 0 ? Math.min(100, (collected / invoiced) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
};

const exportCsv = (rows: IncomeClientRow[], dateFrom: string, dateTo: string) => {
  const header = 'Client,Invoices,Invoiced,Collected,Outstanding,Collection Rate\n';
  const body = rows
    .map(r =>
      [
        `"${r.client_name}"`,
        r.invoice_count,
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
  a.download = `income-by-client_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

interface SortHeaderProps {
  field: ClientSortField;
  label: string;
  current: ClientSortField;
  onSort: (f: ClientSortField) => void;
}
const SortHeader: React.FC<SortHeaderProps> = ({ field, label, current, onSort }) => (
  <th
    className="text-right px-5 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors"
    onClick={() => onSort(field)}
  >
    <span className="inline-flex items-center justify-end gap-1">
      {label}
      {current === field && <ChevronDown className="h-3 w-3" />}
    </span>
  </th>
);

const LIMIT_OPTIONS = [10, 25, 50, 100];

const IncomeByClientPage: React.FC = () => {
  const [dateFrom, setDateFrom] = useState(janFirst());
  const [dateTo, setDateTo] = useState(todayStr());
  const [sortBy, setSortBy] = useState<ClientSortField>('invoiced');
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    date_from: janFirst(),
    date_to: todayStr(),
    sort: 'invoiced' as ClientSortField,
    limit: 50,
  });

  const { data, isLoading: loading, error: queryError } = useIncomeByClient(appliedFilters);
  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  const handleApply = () => {
    setAppliedFilters({ date_from: dateFrom, date_to: dateTo, sort: sortBy, limit });
  };

  const handleSort = (field: ClientSortField) => {
    setSortBy(field);
    setAppliedFilters(prev => ({ ...prev, sort: field }));
  };

  const filteredRows =
    data?.rows.filter(r => !search || r.client_name.toLowerCase().includes(search.toLowerCase())) ??
    [];

  const maxInvoiced = filteredRows.length > 0 ? filteredRows[0].invoiced : 1;

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
              <div className="p-2 bg-orange-100 rounded-lg">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Income by Client</h1>
                <p className="text-xs text-gray-500">Revenue ranked by client</p>
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
                title="Date from"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                title="Date to"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">Show top</label>
              <select
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                title="Number of clients to show"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {LIMIT_OPTIONS.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
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
            <input
              type="text"
              placeholder="Search clients..."
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
              { label: 'Clients Listed', value: `${data.rows.length}`, color: 'text-blue-700' },
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

        {!loading && data && filteredRows.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
            {search
              ? 'No clients match your search.'
              : 'No income data found for the selected period.'}
          </div>
        )}

        {!loading && data && filteredRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600 w-8">#</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoices</th>
                  <SortHeader
                    field="invoiced"
                    label="Invoiced (₦)"
                    current={sortBy}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="collected"
                    label="Collected (₦)"
                    current={sortBy}
                    onSort={handleSort}
                  />
                  <SortHeader
                    field="outstanding"
                    label="Outstanding (₦)"
                    current={sortBy}
                    onSort={handleSort}
                  />
                  <th className="text-left px-5 py-3 font-medium text-gray-600 min-w-[140px]">
                    Collection
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row, idx) => (
                  <tr key={row.client_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="font-medium text-gray-900">{row.client_name}</span>
                          <div className="mt-1 h-1 bg-gray-200 rounded-full w-32 overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${(row.invoiced / maxInvoiced) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                      {row.invoice_count}
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
                      <div className="flex items-center gap-2">
                        <MiniBar collected={row.collected} invoiced={row.invoiced} />
                        <RateBadge rate={row.collection_rate} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="px-5 py-3 font-bold text-gray-900">
                    Total ({filteredRows.length} clients)
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-700">
                    {filteredRows.reduce((s, r) => s + r.invoice_count, 0)}
                  </td>
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
                    <RateBadge rate={data.totals.collection_rate} />
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

export default IncomeByClientPage;
