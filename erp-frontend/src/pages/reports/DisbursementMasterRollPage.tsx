/**
 * Disbursement Master Roll
 * Server-side, date-range-scoped roll of every disbursement for the
 * selected period, with real (not client-side-truncated) summary tiles
 * and a per-officer breakdown. Replaces the old DailySummaryReportPage,
 * which computed everything from paginated list() calls and had two
 * tiles (collections, savings) that were always ₦0.00.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { loanService, LoanAccount } from '../../services/loanService';
import {
  dailyOpsReportService,
  DayRangeFilters,
  MasterRollResponse,
} from '../../services/dailyOpsReportService';
import { BRAND } from '../../constants/brand';

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Summary Card ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  title: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  color: 'navy' | 'gold' | 'green' | 'red' | 'blue' | 'purple';
}

const COLOR_MAP: Record<string, { bg: string; text: string; iconBg: string }> = {
  navy:   { bg: 'bg-white border border-gray-200', text: 'text-[#0a1857]',  iconBg: 'bg-[#0a1857]/10' },
  gold:   { bg: 'bg-white border border-gray-200', text: 'text-[#b79758]',  iconBg: 'bg-[#b79758]/10' },
  green:  { bg: 'bg-white border border-gray-200', text: 'text-green-700',   iconBg: 'bg-green-50'     },
  red:    { bg: 'bg-white border border-gray-200', text: 'text-red-700',     iconBg: 'bg-red-50'       },
  blue:   { bg: 'bg-white border border-gray-200', text: 'text-blue-700',    iconBg: 'bg-blue-50'      },
  purple: { bg: 'bg-white border border-gray-200', text: 'text-purple-700',  iconBg: 'bg-purple-50'    },
};

function SummaryCard({ title, value, subtext, icon, color }: SummaryCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className={`rounded-xl p-5 shadow-sm ${c.bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
          <p className={`mt-1 text-2xl font-bold ${c.text}`}>{value}</p>
          {subtext && <p className="mt-0.5 text-xs text-gray-400">{subtext}</p>}
        </div>
        <div className={`rounded-lg p-2.5 ${c.iconBg}`}>
          <span className={c.text}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

// ── Expandable disbursement row (lazy drill-down) ───────────────────────────

function DisbursementRowDetail({ loanId }: { loanId: number }) {
  const [loan, setLoan] = useState<LoanAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loanService.getLoan(loanId)
      .then((l) => { if (!cancelled) setLoan(l); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loanId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-4 text-center">
          <Loader2 size={16} className="mx-auto animate-spin text-gray-400" />
        </td>
      </tr>
    );
  }
  if (!loan) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-4 text-center text-xs text-gray-400">
          Could not load loan detail.
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-gray-50/70">
      <td colSpan={6} className="px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <div><span className="text-gray-400">Product:</span> <span className="text-gray-700">{loan.product_name ?? '—'}</span></div>
          <div><span className="text-gray-400">Disbursed:</span> <span className="text-gray-700">₦{fmt(loan.disbursed_amount)}</span></div>
          <div><span className="text-gray-400">Outstanding:</span> <span className="text-gray-700">₦{fmt(loan.outstanding_principal)}</span></div>
          <div><span className="text-gray-400">Status:</span> <span className="text-gray-700">{loan.status}</span></div>
          <div><span className="text-gray-400">Frequency:</span> <span className="text-gray-700">{loan.repayment_frequency ?? '—'}</span></div>
          <div><span className="text-gray-400">Interest Rate:</span> <span className="text-gray-700">{loan.interest_rate ?? '—'}%</span></div>
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

type RangeMode = 'day' | 'month';

export default function DisbursementMasterRollPage() {
  const [mode, setMode] = useState<RangeMode>('day');
  const [date, setDate] = useState(todayISO());
  const [monthStart, setMonthStart] = useState(firstOfMonthISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MasterRollResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filters: DayRangeFilters = mode === 'day'
    ? { start: date, end: date }
    : { start: monthStart, end: new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0).toISOString().slice(0, 10) };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dailyOpsReportService.getMasterRoll(filters);
      setData(res);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load disbursement master roll.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, monthStart]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(loanId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(loanId)) next.delete(loanId); else next.add(loanId);
      return next;
    });
  }

  function handlePrint() {
    window.print();
  }

  async function handleExport() {
    try {
      await dailyOpsReportService.downloadMasterRollCsv(filters);
    } catch {
      setError('Failed to export CSV.');
    }
  }

  const periodLabel = mode === 'day' ? date : `${filters.start} – ${filters.end}`;

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
              <ClipboardList size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Disbursement Master Roll</h1>
            </div>
            <p className="text-sm text-gray-500">Full disbursement roll with operational summary — day or month view</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6 print:p-4">
        {/* Print header */}
        <div className="mb-6 hidden print:block">
          <h1 className="text-2xl font-bold" style={{ color: BRAND.colors.navyPrimary }}>
            {BRAND.companyName}
          </h1>
          <h2 className="text-lg font-semibold text-gray-700">Disbursement Master Roll</h2>
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
            <Link
              to="/reports/daily-collection-report"
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ClipboardList size={14} />
              Daily Collection Report
            </Link>
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
            <p className="mt-3 text-sm text-gray-500">Loading master roll…</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-3">
              <SummaryCard
                title="Total Disbursed"
                value={`₦${fmt(data.summary.total_disbursed)}`}
                subtext={`${data.summary.disbursements_count} disbursement${data.summary.disbursements_count !== 1 ? 's' : ''}`}
                icon={<TrendingUp size={20} />}
                color="navy"
              />
              <SummaryCard
                title="Loan Collections"
                value={`₦${fmt(data.summary.total_collections)}`}
                subtext={`${data.summary.collections_count} repayment${data.summary.collections_count !== 1 ? 's' : ''}`}
                icon={<TrendingDown size={20} />}
                color="green"
              />
              <SummaryCard
                title="Savings Deposits"
                value={`₦${fmt(data.summary.total_savings_deposits)}`}
                subtext={`${data.summary.savings_deposits_count} deposit${data.summary.savings_deposits_count !== 1 ? 's' : ''}`}
                icon={<TrendingUp size={20} />}
                color="gold"
              />
              <SummaryCard
                title="New Clients"
                value={String(data.summary.new_clients_count)}
                subtext="Registered in period"
                icon={<UserPlus size={20} />}
                color="blue"
              />
              <SummaryCard
                title="Active Loans"
                value={String(data.summary.active_loans_count)}
                subtext="As of period end"
                icon={<Users size={20} />}
                color="purple"
              />
              <SummaryCard
                title="Defaulters"
                value={String(data.summary.defaulters_count)}
                subtext="As of period end"
                icon={<AlertCircle size={20} />}
                color="red"
              />
            </div>

            {/* Disbursements — the master roll */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-700">
                  Disbursements — {periodLabel}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">Click a row to view loan detail.</p>
              </div>
              {data.disbursements.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  No disbursements recorded for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3 w-6" />
                        <th className="px-4 py-3">Loan #</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Officer</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Amount (₦)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.disbursements.map((d) => (
                        <React.Fragment key={d.disbursement_id}>
                          <tr
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleExpand(d.loan_id)}
                          >
                            <td className="px-4 py-2.5 text-gray-400">
                              {expanded.has(d.loan_id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{d.loan_number}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{d.client_name}</td>
                            <td className="px-4 py-2.5 text-gray-600">{d.officer_name}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{d.disbursement_date}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">₦{fmt(d.amount)}</td>
                          </tr>
                          {expanded.has(d.loan_id) && <DisbursementRowDetail loanId={d.loan_id} />}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-gray-50">
                        <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                          Total Disbursed
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          ₦{fmt(data.summary.total_disbursed)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Officer breakdown */}
            <div className="rounded-xl bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-700">Breakdown by Officer</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Disbursements, collections and savings deposits processed per loan officer
                </p>
              </div>
              {data.officer_breakdown.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  No officer-level activity for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3">Officer</th>
                        <th className="px-4 py-3 text-right">Disbursed (₦)</th>
                        <th className="px-4 py-3 text-right">Collections (₦)</th>
                        <th className="px-4 py-3 text-right">Savings (₦)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.officer_breakdown.map((row) => (
                        <tr key={row.officer_id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{row.officer_name}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900">₦{fmt(row.disbursed_total)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900">₦{fmt(row.collections_total)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900">₦{fmt(row.savings_total)}</td>
                        </tr>
                      ))}
                    </tbody>
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
