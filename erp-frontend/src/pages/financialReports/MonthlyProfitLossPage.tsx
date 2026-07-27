// MonthlyProfitLossPage — Profit & Loss report, spreadsheet-style
//
// The client's prior system rendered P&L as one row per GL income/expense
// line (grouped under a parent, e.g. "Interest Income" holding Daily/Weekly/
// Monthly Loan Interest) with one column per calendar month, so several
// months could be compared side-by-side at a glance. The existing
// ProfitLossPage is a single-period expandable account tree — useful, but
// not this format — so this is a separate report rather than a rework.
//
// Branch scoping is inherited from the global branch switcher in the topbar
// (X-Branch-ID header, injected by services/api.ts's getHeaders()) exactly
// like every other financial report page; there is no in-page branch
// control. Directors/owners see "All Branches" consolidated figures unless
// they've switched to a specific branch.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Download, FileBarChart, Loader2, Printer, RefreshCw } from 'lucide-react';
import { financialReportsService } from '../../services/financialReportsService';
import { MonthlyProfitLossData } from '../../types/financialReports';
import { BRAND } from '../../constants/brand';
import { useAuth } from '../../contexts/AuthContext';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n) ? '0.00' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MonthlyProfitLossPage() {
  const { activeBranch, isDirectorPlus } = useAuth();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MonthlyProfitLossData | null>(null);

  const load = useCallback(async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await financialReportsService.getMonthlyProfitLoss(targetYear);
      setData(res);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to load the Profit & Loss report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [load, year]);

  function handlePrint() {
    window.print();
  }

  async function handleExport() {
    try {
      await financialReportsService.downloadMonthlyProfitLossCsv(year);
    } catch {
      setError('Failed to export CSV.');
    }
  }

  const netProfitTotal = data ? parseFloat(data.net_profit.total) : 0;
  const isProfitable = netProfitTotal >= 0;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/reports" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileBarChart size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Profit and Loss Report</h1>
            </div>
            <p className="text-sm text-gray-500">
              Monthly income and expenses by GL account, for period comparison
              {isDirectorPlus && (
                <span className="ml-1 text-gray-400">
                  · {activeBranch ? activeBranch.name : 'All Branches'}
                </span>
              )}
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
          <h2 className="text-lg font-semibold text-gray-700">Profit and Loss Report — {year}</h2>
          {isDirectorPlus && (
            <p className="text-sm text-gray-500">{activeBranch ? activeBranch.name : 'All Branches'}</p>
          )}
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600" htmlFor="pl-year-select">
              Select Year:
            </label>
            <select
              id="pl-year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => load(year)}
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
            <p className="mt-3 text-sm text-gray-500">Loading Profit and Loss report…</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Net profit summary tile */}
            <div className={`rounded-xl border-2 px-5 py-4 flex items-center justify-between ${isProfitable ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isProfitable ? 'text-green-700' : 'text-red-700'}`}>
                  {isProfitable ? 'Net Profit' : 'Net Loss'} — {year}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Total Income ₦{fmt(data.income.total)} − Total Expenses ₦{fmt(data.expenses.total)}
                </p>
              </div>
              <p className={`text-2xl font-bold font-mono tabular-nums ${isProfitable ? 'text-green-700' : 'text-red-700'}`}>
                ₦{fmt(data.net_profit.total)}
              </p>
            </div>

            {/* Matrix table */}
            <div className="rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: BRAND.colors.navyPrimary }} className="text-left text-xs font-semibold uppercase tracking-wide text-white">
                      <th className="sticky left-0 z-10 whitespace-nowrap px-4 py-3" style={{ backgroundColor: BRAND.colors.navyPrimary }}>Type</th>
                      {data.months.map((m) => (
                        <th key={m.key} className="whitespace-nowrap px-4 py-3 text-right">{m.label}</th>
                      ))}
                      <th className="whitespace-nowrap px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* ── Income ── */}
                    <tr className="bg-blue-50">
                      <td colSpan={data.months.length + 2} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-700 sticky left-0">
                        Income
                      </td>
                    </tr>
                    {data.income.groups.map((group) => (
                      <React.Fragment key={group.code}>
                        <tr className="bg-gray-50 font-semibold text-gray-900">
                          <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2">{group.name}</td>
                          {data.months.map((m) => (
                            <td key={m.key} className="px-4 py-2 text-right tabular-nums">₦{fmt(group.months[m.key])}</td>
                          ))}
                          <td className="px-4 py-2 text-right tabular-nums">₦{fmt(group.total)}</td>
                        </tr>
                        {group.accounts.map((acc) => (
                          <tr key={acc.id} className="hover:bg-gray-50">
                            <td className="sticky left-0 z-10 bg-white pl-8 pr-4 py-2 text-gray-600">{acc.name}</td>
                            {data.months.map((m) => (
                              <td key={m.key} className="px-4 py-2 text-right tabular-nums text-gray-700">₦{fmt(acc.months[m.key])}</td>
                            ))}
                            <td className="px-4 py-2 text-right tabular-nums text-gray-700">₦{fmt(acc.total)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold text-blue-800">
                      <td className="sticky left-0 z-10 bg-blue-50 px-4 py-2.5">Total Income</td>
                      {data.months.map((m) => (
                        <td key={m.key} className="px-4 py-2.5 text-right tabular-nums">₦{fmt(data.income.months[m.key])}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums">₦{fmt(data.income.total)}</td>
                    </tr>

                    {/* ── Expenses ── */}
                    <tr className="bg-red-50">
                      <td colSpan={data.months.length + 2} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-700 sticky left-0">
                        Expenses
                      </td>
                    </tr>
                    {data.expenses.groups.map((group) => (
                      <React.Fragment key={group.code}>
                        <tr className="bg-gray-50 font-semibold text-gray-900">
                          <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2">{group.name}</td>
                          {data.months.map((m) => (
                            <td key={m.key} className="px-4 py-2 text-right tabular-nums">₦{fmt(group.months[m.key])}</td>
                          ))}
                          <td className="px-4 py-2 text-right tabular-nums">₦{fmt(group.total)}</td>
                        </tr>
                        {group.accounts.map((acc) => (
                          <tr key={acc.id} className="hover:bg-gray-50">
                            <td className="sticky left-0 z-10 bg-white pl-8 pr-4 py-2 text-gray-600">{acc.name}</td>
                            {data.months.map((m) => (
                              <td key={m.key} className="px-4 py-2 text-right tabular-nums text-gray-700">₦{fmt(acc.months[m.key])}</td>
                            ))}
                            <td className="px-4 py-2 text-right tabular-nums text-gray-700">₦{fmt(acc.total)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    <tr className="border-t-2 border-red-200 bg-red-50 font-bold text-red-800">
                      <td className="sticky left-0 z-10 bg-red-50 px-4 py-2.5">Total Expenses</td>
                      {data.months.map((m) => (
                        <td key={m.key} className="px-4 py-2.5 text-right tabular-nums">₦{fmt(data.expenses.months[m.key])}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums">₦{fmt(data.expenses.total)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className={`border-t-2 ${isProfitable ? 'bg-green-50' : 'bg-red-50'}`}>
                      <td className={`sticky left-0 z-10 px-4 py-3 font-bold ${isProfitable ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        {isProfitable ? 'Net Profit' : 'Net Loss'}
                      </td>
                      {data.months.map((m) => (
                        <td key={m.key} className={`px-4 py-3 text-right font-bold tabular-nums ${isProfitable ? 'text-green-800' : 'text-red-800'}`}>
                          ₦{fmt(data.net_profit.months[m.key])}
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${isProfitable ? 'text-green-800' : 'text-red-800'}`}>
                        ₦{fmt(data.net_profit.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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
