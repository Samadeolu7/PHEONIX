/**
 * Daily Collection Report
 * Digitized version of the branch's paper collection sheet: one row per
 * (client, date), Group / Officer / Customer, Savings Collection
 * (Savings / Registration / Risk Premium / Loan form / ID Card) and Loan
 * Collection (Amount Due / Amount Collected / Total Collection).
 * See analytics/views.py DailyCollectionReportView for data sourcing.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  AlertCircle,
  ArrowLeft,
  ClipboardList,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  dailyOpsReportService,
  DayRangeFilters,
  CollectionReportRow,
} from '../../services/dailyOpsReportService';
import { BRAND } from '../../constants/brand';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Background refresh so savings/loan collections posted by backend cron jobs
// surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function sum(rows: CollectionReportRow[], key: keyof CollectionReportRow): number {
  return rows.reduce((s, r) => s + parseFloat(String(r[key] ?? '0')), 0);
}

function fmtPct(rate: number | null): string {
  return rate === null ? '—' : `${rate.toFixed(1)}%`;
}

interface OfficerSummary {
  officer_id: number | null;
  officer_name: string;
  clientCount: number;
  savings: number;
  fees: number;
  amountDue: number;
  amountCollected: number;
  totalCollection: number;
  collectionRate: number | null;
}

function buildOfficerSummaries(rows: CollectionReportRow[]): OfficerSummary[] {
  const map = new Map<string, OfficerSummary & { clients: Set<number> }>();
  for (const r of rows) {
    const key = r.officer_id != null ? String(r.officer_id) : 'unassigned';
    let entry = map.get(key);
    if (!entry) {
      entry = {
        officer_id: r.officer_id, officer_name: r.officer_name || 'Unassigned',
        clientCount: 0, clients: new Set(), savings: 0, fees: 0,
        amountDue: 0, amountCollected: 0, totalCollection: 0, collectionRate: null,
      };
      map.set(key, entry);
    }
    entry.clients.add(r.client_id);
    entry.savings += parseFloat(r.savings || '0');
    entry.fees += parseFloat(r.registration || '0') + parseFloat(r.risk_premium || '0')
      + parseFloat(r.loan_form || '0') + parseFloat(r.id_card || '0');
    entry.amountDue += parseFloat(r.amount_due || '0');
    entry.amountCollected += parseFloat(r.amount_collected || '0');
    entry.totalCollection += parseFloat(r.total_collection || '0');
  }
  return Array.from(map.values())
    .map((e) => ({
      ...e,
      clientCount: e.clients.size,
      collectionRate: e.amountDue > 0 ? (e.amountCollected / e.amountDue) * 100 : null,
    }))
    .sort((a, b) => b.totalCollection - a.totalCollection);
}

type RangeMode = 'day' | 'month';
type ViewMode = 'summary' | 'detail';

export default function DailyCollectionReportPage() {
  const [mode, setMode] = useState<RangeMode>('day');
  const [view, setView] = useState<ViewMode>('summary');
  const [date, setDate] = useState(todayISO());
  const [monthStart, setMonthStart] = useState(firstOfMonthISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CollectionReportRow[]>([]);

  const filters: DayRangeFilters = mode === 'day'
    ? { start: date, end: date }
    : { start: monthStart, end: new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0).toISOString().slice(0, 10) };

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await dailyOpsReportService.getCollectionReport(filters);
      setRows(res.results);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load daily collection report.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, monthStart]);

  useEffect(() => { load(); }, [load]);

  useAutoRefresh(() => load(true), AUTO_REFRESH_MS);

  function handlePrint() {
    window.print();
  }

  async function handleExport() {
    try {
      await dailyOpsReportService.downloadCollectionReportCsv(filters);
    } catch {
      setError('Failed to export CSV.');
    }
  }

  const periodLabel = mode === 'day' ? date : `${filters.start} – ${filters.end}`;

  const totals = {
    savings: sum(rows, 'savings'),
    registration: sum(rows, 'registration'),
    riskPremium: sum(rows, 'risk_premium'),
    loanForm: sum(rows, 'loan_form'),
    idCard: sum(rows, 'id_card'),
    amountDue: sum(rows, 'amount_due'),
    amountCollected: sum(rows, 'amount_collected'),
    totalCollection: sum(rows, 'total_collection'),
  };

  const officerSummaries = useMemo(() => buildOfficerSummaries(rows), [rows]);
  const uniqueClients = useMemo(() => new Set(rows.map((r) => r.client_id)).size, [rows]);
  const activeOfficers = officerSummaries.filter((o) => o.officer_id != null).length;
  const overallCollectionRate = totals.amountDue > 0 ? (totals.amountCollected / totals.amountDue) * 100 : null;
  const totalFees = totals.registration + totals.riskPremium + totals.loanForm + totals.idCard;
  const maxOfficerTotal = Math.max(1, ...officerSummaries.map((o) => o.totalCollection));

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/reports/disbursement-master-roll"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Daily Collection Report</h1>
            </div>
            <p className="text-sm text-gray-500">Group / officer / customer collection sheet — savings &amp; loan repayments</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6 print:p-4">
        {/* Print header */}
        <div className="mb-4 hidden print:block text-center">
          <h1 className="text-xl font-bold" style={{ color: BRAND.colors.navyPrimary }}>
            {BRAND.companyName}
          </h1>
          <h2 className="text-lg font-semibold text-gray-700">Daily Collection Report</h2>
          <p className="text-sm text-gray-500">Period: {periodLabel}</p>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setMode('day')}
                className={`rounded-md px-3 py-1.5 font-medium ${mode === 'day' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                style={mode === 'day' ? { backgroundColor: BRAND.colors.navyPrimary } : undefined}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setMode('month')}
                className={`rounded-md px-3 py-1.5 font-medium ${mode === 'month' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                style={mode === 'month' ? { backgroundColor: BRAND.colors.navyPrimary } : undefined}
              >
                Month
              </button>
            </div>
            {mode === 'day' ? (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Report date"
              />
            ) : (
              <input
                type="month"
                value={monthStart.slice(0, 7)}
                onChange={(e) => setMonthStart(`${e.target.value}-01`)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Report month"
              />
            )}
            <button
              type="button"
              onClick={load}
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
              disabled={rows.length === 0}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.colors.navyPrimary }}
            >
              <Printer size={14} />
              Print
            </button>
          </div>
        </div>

        {/* Summary / Full Detail toggle */}
        {rows.length > 0 && (
          <div className="mb-6 flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm print:hidden w-fit">
            <button
              type="button"
              onClick={() => setView('summary')}
              className={`rounded-md px-4 py-1.5 font-medium ${view === 'summary' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              style={view === 'summary' ? { backgroundColor: BRAND.colors.navyPrimary } : undefined}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setView('detail')}
              className={`rounded-md px-4 py-1.5 font-medium ${view === 'detail' ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              style={view === 'detail' ? { backgroundColor: BRAND.colors.navyPrimary } : undefined}
            >
              Full Detail ({rows.length})
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
            <p className="mt-3 text-sm text-gray-500">Loading collection report…</p>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="rounded-xl bg-white py-16 text-center text-sm text-gray-400 shadow-sm">
            No collection activity recorded for this period.
          </div>
        )}

        {rows.length > 0 && (
          <div className={`space-y-6 print:hidden ${view === 'summary' ? '' : 'hidden'}`}>
            {/* General summary tiles */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Collection</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: BRAND.colors.navyPrimary }}>
                  {fmt(totals.totalCollection)}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">{uniqueClients} client{uniqueClients !== 1 ? 's' : ''} served</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Collection Rate</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{fmtPct(overallCollectionRate)}</p>
                <p className="mt-0.5 text-xs text-gray-400">{fmt(totals.amountCollected)} of {fmt(totals.amountDue)} due</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Savings Collected</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{fmt(totals.savings)}</p>
                <p className="mt-0.5 text-xs text-gray-400">Registration/Risk/Form/ID fees: {fmt(totalFees)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Officers Active</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{activeOfficers}</p>
                <p className="mt-0.5 text-xs text-gray-400">Recorded a collection this period</p>
              </div>
            </div>

            {/* Per-officer summary */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b px-5 py-4">
                <Users size={16} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-700">Collection by Officer</h2>
              </div>
              {officerSummaries.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No officer-level activity for this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3">Officer</th>
                        <th className="px-4 py-3 text-right">Clients</th>
                        <th className="px-4 py-3 text-right">Savings</th>
                        <th className="px-4 py-3 text-right">Fees</th>
                        <th className="px-4 py-3 text-right">Due</th>
                        <th className="px-4 py-3 text-right">Collected</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Total Collection</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {officerSummaries.map((o, i) => (
                        <tr key={o.officer_id ?? 'unassigned'} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 font-medium text-gray-900">
                              {i === 0 && o.totalCollection > 0 && (
                                <Award size={14} style={{ color: BRAND.colors.gold }} />
                              )}
                              {o.officer_name}
                            </div>
                            <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(o.totalCollection / maxOfficerTotal) * 100}%`,
                                  backgroundColor: BRAND.colors.navyPrimary,
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{o.clientCount}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(o.savings)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(o.fees)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(o.amountDue)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(o.amountCollected)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmtPct(o.collectionRate)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(o.totalCollection)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-4 py-3">TOTAL</td>
                        <td className="px-4 py-3 text-right">{uniqueClients}</td>
                        <td className="px-4 py-3 text-right">{fmt(totals.savings)}</td>
                        <td className="px-4 py-3 text-right">{fmt(totalFees)}</td>
                        <td className="px-4 py-3 text-right">{fmt(totals.amountDue)}</td>
                        <td className="px-4 py-3 text-right">{fmt(totals.amountCollected)}</td>
                        <td className="px-4 py-3 text-right">{fmtPct(overallCollectionRate)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: BRAND.colors.navyPrimary }}>
                          {fmt(totals.totalCollection)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className={`overflow-x-auto rounded-xl bg-white shadow-sm ${view === 'detail' ? '' : 'hidden print:block'}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-50 text-left font-semibold uppercase tracking-wide text-gray-500">
                  <th rowSpan={2} className="border-r px-3 py-2 align-bottom">Date</th>
                  <th rowSpan={2} className="border-r px-3 py-2 align-bottom">Group</th>
                  <th rowSpan={2} className="border-r px-3 py-2 align-bottom">Credit Officer</th>
                  <th rowSpan={2} className="border-r px-3 py-2 align-bottom">Customer</th>
                  <th colSpan={5} className="border-r px-3 py-2 text-center">Savings Collection</th>
                  <th colSpan={3} className="px-3 py-2 text-center">Loan Collection</th>
                </tr>
                <tr className="border-b-2 border-gray-300 bg-gray-50 text-right font-semibold uppercase tracking-wide text-gray-500">
                  <th className="border-r px-3 py-2">Savings</th>
                  <th className="px-3 py-2">Registration</th>
                  <th className="px-3 py-2">Risk Premium</th>
                  <th className="px-3 py-2">Loan Form</th>
                  <th className="border-r px-3 py-2">ID Card</th>
                  <th className="px-3 py-2">Amount Due</th>
                  <th className="px-3 py-2">Amount Collected</th>
                  <th className="px-3 py-2">Total Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={`${r.client_id}-${r.date}`} className="hover:bg-gray-50">
                    <td className="border-r px-3 py-2 text-gray-500">{r.date}</td>
                    <td className="border-r px-3 py-2 text-gray-700">{r.group_name || '—'}</td>
                    <td className="border-r px-3 py-2 text-gray-700">{r.officer_name || '—'}</td>
                    <td className="border-r px-3 py-2 font-medium text-gray-900">{r.client_name}</td>
                    <td className="border-r px-3 py-2 text-right text-gray-700">{fmt(r.savings)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(r.registration)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(r.risk_premium)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(r.loan_form)}</td>
                    <td className="border-r px-3 py-2 text-right text-gray-700">{fmt(r.id_card)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(r.amount_due)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(r.amount_collected)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(r.total_collection)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
                  <td colSpan={4} className="border-r px-3 py-2 text-right">Totals</td>
                  <td className="border-r px-3 py-2 text-right">{fmt(totals.savings)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.registration)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.riskPremium)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.loanForm)}</td>
                  <td className="border-r px-3 py-2 text-right">{fmt(totals.idCard)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.amountDue)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.amountCollected)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: BRAND.colors.navyPrimary }}>
                    {fmt(totals.totalCollection)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="hidden print:block mt-8 border-t pt-4 text-xs text-gray-400">
          <p>Generated: {new Date().toLocaleString('en-NG')} | {BRAND.companyName}</p>
          <p className="mt-1">{BRAND.motto}</p>
        </div>
      </div>
    </div>
  );
}
