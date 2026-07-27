/**
 * Disbursement by Product
 *
 * Live successor to the branch's old hand-typed "Disbursement by Product"
 * sheet — a matrix with three fixed rows (Monthly / Weekly / Daily) and a
 * couple of hardcoded month columns that someone re-typed from memory every
 * month. This page is a real pivot over LoanAccount.disbursement_date: rows
 * are whatever loan products actually exist (so a newly-added product shows
 * up on its own, with no code change), columns are a selectable trailing
 * window of months, and every cell carries both the amount disbursed and
 * the number of loans behind it — so a drop in the total is answerable
 * ("fewer loans" vs "smaller loans") straight from the report.
 *
 * See analytics/views.py::DisbursementByProductView for the aggregation.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  dailyOpsReportService,
  DisbursementByProductResponse,
} from '../../services/dailyOpsReportService';
import { BRAND } from '../../constants/brand';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

const AUTO_REFRESH_MS = 3 * 60_000;

// Fixed-order categorical palette (validated for CVD-safe adjacent contrast
// on a light surface — see the dataviz skill's reference palette). Assigned
// by rank (largest product first), never re-cycled when the filter changes.
const SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];
const OTHER_COLOR = '#8a8a86';
const MAX_SERIES = 8;

const MONTH_OPTIONS = [
  { label: '3 mo', value: 3 },
  { label: '6 mo', value: 6 },
  { label: '12 mo', value: 12 },
  { label: '24 mo', value: 24 },
];

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-NG', { notation: 'compact', maximumFractionDigits: 1 });
}

export default function DisbursementByProductPage() {
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DisbursementByProductResponse | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await dailyOpsReportService.getDisbursementByProduct({ months });
      setData(res);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load disbursement by product report.');
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  function handlePrint() {
    window.print();
  }

  async function handleExport() {
    try {
      await dailyOpsReportService.downloadDisbursementByProductCsv({ months });
    } catch {
      setError('Failed to export CSV.');
    }
  }

  // Product rows beyond MAX_SERIES fold into "Other" in the chart only —
  // the table below always lists every product individually.
  const { chartData, chartSeries } = useMemo(() => {
    if (!data || data.products.length === 0) return { chartData: [], chartSeries: [] as string[] };

    const primary = data.products.slice(0, MAX_SERIES);
    const overflow = data.products.slice(MAX_SERIES);
    const series = primary.map((p) => p.product_name);
    if (overflow.length > 0) series.push('Other');

    const points = data.months.map((m) => {
      const point: Record<string, string | number> = { label: m.label };
      for (const p of primary) {
        point[p.product_name] = parseFloat(p.months[m.key]?.amount || '0');
      }
      if (overflow.length > 0) {
        point['Other'] = overflow.reduce(
          (sum, p) => sum + parseFloat(p.months[m.key]?.amount || '0'),
          0,
        );
      }
      return point;
    });

    return { chartData: points, chartSeries: series };
  }, [data]);

  const busiestMonth = useMemo(() => {
    if (!data || data.months.length === 0) return null;
    let best = data.months[0];
    let bestAmount = parseFloat(data.totals.months[best.key]?.amount || '0');
    for (const m of data.months) {
      const amt = parseFloat(data.totals.months[m.key]?.amount || '0');
      if (amt > bestAmount) { best = m; bestAmount = amt; }
    }
    return { ...best, amount: bestAmount };
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/reports"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Layers size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Disbursement by Product</h1>
            </div>
            <p className="text-sm text-gray-500">
              Monthly disbursement volume, broken down by loan product — amount and loan count
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6 print:p-4">
        {/* Print header */}
        <div className="mb-6 hidden print:block">
          <h1 className="text-2xl font-bold" style={{ color: BRAND.colors.navyPrimary }}>
            {BRAND.companyName}
          </h1>
          <h2 className="text-lg font-semibold text-gray-700">Disbursement by Product</h2>
          {data && <p className="text-sm text-gray-500">Period: {data.period.start} – {data.period.end}</p>}
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
              {MONTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMonths(opt.value)}
                  className={`rounded-md px-3 py-1.5 font-medium ${months === opt.value ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  style={months === opt.value ? { backgroundColor: BRAND.colors.navyPrimary } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={!data}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!data}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.colors.navyPrimary }}
            >
              <Printer size={14} />
              Print
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
            <p className="mt-3 text-sm text-gray-500">Loading disbursement by product…</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Disbursed</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: BRAND.colors.navyPrimary }}>
                  ₦{fmtCompact(data.totals.total_amount)}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {data.totals.total_count} loan{data.totals.total_count !== 1 ? 's' : ''} · {months} mo
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Products Tracked</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{data.products.length}</p>
                <p className="mt-0.5 text-xs text-gray-400">Active + historical with activity</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Busiest Month</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{busiestMonth?.label ?? '—'}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {busiestMonth ? `₦${fmtCompact(busiestMonth.amount)} disbursed` : 'No data yet'}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Top Product</p>
                <p className="mt-1 text-lg font-bold text-gray-900">
                  {data.products[0]?.product_name ?? '—'}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {data.products[0] ? `₦${fmtCompact(data.products[0].total_amount)} over ${months} mo` : ''}
                </p>
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-xl bg-white p-5 shadow-sm print:hidden">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">Disbursed Amount by Month</h2>
              {chartData.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No disbursement activity in this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₦${fmtCompact(v)}`}
                      width={64}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [`₦${fmt(value)}`, name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chartSeries.map((name, i) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="disbursed"
                        fill={name === 'Other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]}
                        radius={i === chartSeries.length - 1 ? [4, 4, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Matrix table */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-700">
                  Disbursement Matrix — {data.period.start} to {data.period.end}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">Amount (₦) with loan count below, per product per month.</p>
              </div>
              {data.products.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No loan products found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3">Product</th>
                        {data.months.map((m) => (
                          <th key={m.key} className="px-4 py-3 text-right">{m.label}</th>
                        ))}
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.products.map((row, i) => (
                        <tr key={row.product_id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <span
                              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                              style={{ backgroundColor: i < MAX_SERIES ? SERIES_COLORS[i % SERIES_COLORS.length] : OTHER_COLOR }}
                            />
                            <span className="font-medium text-gray-900">{row.product_name}</span>
                            <span className="ml-1 text-xs capitalize text-gray-400">({row.repayment_frequency})</span>
                          </td>
                          {data.months.map((m) => {
                            const cell = row.months[m.key];
                            return (
                              <td key={m.key} className="px-4 py-2.5 text-right">
                                <div className="text-gray-900">₦{fmt(cell?.amount)}</div>
                                <div className="text-xs text-gray-400">{cell?.count ?? 0} loan{(cell?.count ?? 0) !== 1 ? 's' : ''}</div>
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                            <div>₦{fmt(row.total_amount)}</div>
                            <div className="text-xs font-normal text-gray-400">{row.total_count} loan{row.total_count !== 1 ? 's' : ''}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-gray-50">
                        <td className="px-4 py-3 font-bold text-gray-900">TOTAL</td>
                        {data.months.map((m) => {
                          const cell = data.totals.months[m.key];
                          return (
                            <td key={m.key} className="px-4 py-3 text-right">
                              <div className="font-bold text-gray-900">₦{fmt(cell?.amount)}</div>
                              <div className="text-xs font-normal text-gray-400">{cell?.count ?? 0} loan{(cell?.count ?? 0) !== 1 ? 's' : ''}</div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold" style={{ color: BRAND.colors.navyPrimary }}>₦{fmt(data.totals.total_amount)}</div>
                          <div className="text-xs font-normal text-gray-400">{data.totals.total_count} loans</div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="hidden print:block mt-8 border-t pt-4 text-xs text-gray-400">
              <p>Generated: {new Date().toLocaleString('en-NG')} | {BRAND.companyName}</p>
              <p className="mt-1">{BRAND.motto}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
