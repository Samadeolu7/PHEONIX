import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Download, Calendar } from 'lucide-react';
import { IncomePeriodRow, PeriodGranularity } from '../../../services/incomeReportsService';
import { useIncomeByPeriod } from '../../../hooks/useIncomeReports';

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fmt = (v: number) =>
  v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPeriodLabel = (dateStr: string, period: PeriodGranularity): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  switch (period) {
    case 'daily':
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    case 'weekly':
      return `W/E ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    case 'monthly':
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    case 'quarterly': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q} ${d.getFullYear()}`;
    }
    case 'yearly':
      return String(d.getFullYear());
    default:
      return dateStr;
  }
};

interface BarChartProps {
  rows: IncomePeriodRow[];
  period: PeriodGranularity;
}

const BarChart: React.FC<BarChartProps> = ({ rows, period }) => {
  const maxVal = useMemo(() => Math.max(...rows.map(r => r.invoiced), 1), [rows]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Income Trend — Invoiced vs Collected
      </h3>
      <div className="overflow-x-auto">
        <div
          className="flex items-end gap-1.5 min-h-[180px]"
          style={{ minWidth: Math.max(rows.length * 44, 300) }}
        >
          {rows.map(row => {
            const invH = (row.invoiced / maxVal) * 160;
            const collH = (row.collected / maxVal) * 160;
            return (
              <div
                key={row.period_date}
                className="flex flex-col items-center flex-1 min-w-[36px] group"
              >
                <div
                  className="mb-1 opacity-0 group-hover:opacity-100 transition-opacity
                                bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none
                                absolute z-10 -translate-y-2 shadow-lg"
                >
                  <div>Invoiced: ₦{fmt(row.invoiced)}</div>
                  <div>Collected: ₦{fmt(row.collected)}</div>
                  <div>Rate: {row.collection_rate.toFixed(1)}%</div>
                </div>
                <div className="relative flex items-end gap-0.5 w-full justify-center">
                  <div
                    className="bg-blue-400 rounded-t w-4 transition-all"
                    style={{ height: `${invH}px` }}
                    title={`Invoiced: ₦${fmt(row.invoiced)}`}
                  />
                  <div
                    className="bg-green-500 rounded-t w-4 transition-all"
                    style={{ height: `${collH}px` }}
                    title={`Collected: ₦${fmt(row.collected)}`}
                  />
                </div>
                <span className="text-[10px] text-gray-500 mt-1 rotate-45 origin-left whitespace-nowrap translate-y-2">
                  {fmtPeriodLabel(row.period_date, period)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-6 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />
            Invoiced
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
            Collected
          </span>
        </div>
      </div>
    </div>
  );
};

const exportCsv = (
  rows: IncomePeriodRow[],
  period: PeriodGranularity,
  dateFrom: string,
  dateTo: string
) => {
  const header = 'Period,Invoiced,Collected,Outstanding,Invoices,Collection Rate\n';
  const body = rows
    .map(r =>
      [
        fmtPeriodLabel(r.period_date, period),
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
  a.download = `income-by-period_${period}_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const PRESETS: {
  label: string;
  from: () => string;
  to: () => string;
  period: PeriodGranularity;
}[] = [
  {
    label: 'This Year',
    from: () => `${new Date().getFullYear()}-01-01`,
    to: todayStr,
    period: 'monthly',
  },
  {
    label: 'Last 6 Months',
    from: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    },
    to: todayStr,
    period: 'monthly',
  },
  {
    label: 'Last 12 Months',
    from: () => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    },
    to: todayStr,
    period: 'monthly',
  },
  {
    label: 'This Month',
    from: () => {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    },
    to: todayStr,
    period: 'daily',
  },
];

const GRANULARITIES: { value: PeriodGranularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const IncomeByPeriodPage: React.FC = () => {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(todayStr());
  const [period, setPeriod] = useState<PeriodGranularity>('monthly');
  const [appliedFilters, setAppliedFilters] = useState({
    date_from: `${new Date().getFullYear()}-01-01`,
    date_to: todayStr(),
    period: 'monthly' as PeriodGranularity,
  });

  const { data, isLoading: loading, error: queryError } = useIncomeByPeriod(appliedFilters);
  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  const handleApply = () => {
    setAppliedFilters({ date_from: dateFrom, date_to: dateTo, period });
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const from = preset.from();
    const to = preset.to();
    setDateFrom(from);
    setDateTo(to);
    setPeriod(preset.period);
    setAppliedFilters({ date_from: from, date_to: to, period: preset.period });
  };

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
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Calendar className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Income Trend by Period</h1>
                <p className="text-xs text-gray-500">
                  Revenue over time — invoiced &amp; collected
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                {p.label}
              </button>
            ))}
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
              <label className="text-xs text-gray-500">Granularity</label>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as PeriodGranularity)}
                title="Period granularity"
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {GRANULARITIES.map(g => (
                  <option key={g.value} value={g.value}>
                    {g.label}
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
                onClick={() => exportCsv(data.rows, data.period, data.date_from, data.date_to)}
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
          <BarChart rows={data.rows} period={data.period} />
        )}

        {!loading && data && data.rows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Period</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoiced (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Collected (₦)</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">
                    Outstanding (₦)
                  </th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Invoices</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map(row => (
                  <tr key={row.period_date} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {fmtPeriodLabel(row.period_date, data.period)}
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
                    <td className="px-5 py-3 text-right tabular-nums text-blue-700 font-medium">
                      {row.collection_rate.toFixed(1)}%
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
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-blue-700">
                    {data.totals.collection_rate.toFixed(1)}%
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

export default IncomeByPeriodPage;
