/**
 * Debtors Report Page
 * Full portfolio snapshot — all active/disbursed loans with outstanding balances.
 * Route: /reports/loans/debtors
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { loanService, LoanAccountList } from '../../../services/loanService';
import { BRAND } from '../../../constants/brand';
import { useAutoRefresh } from '../../../hooks/useAutoRefresh';

// Background refresh so loan status changes from the daily loan-status cron
// (arrears/risk/penalties) surface without a manual refresh.
const AUTO_REFRESH_MS = 3 * 60_000;

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-NG');
}

const today = () => {
  const d = new Date();
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_BADGE: Record<string, string> = {
  pending:     'bg-yellow-100 text-yellow-700',
  approved:    'bg-blue-100 text-blue-700',
  disbursed:   'bg-indigo-100 text-indigo-700',
  active:      'bg-green-100 text-green-700',
  defaulted:   'bg-orange-100 text-orange-700',
  paid_off:    'bg-gray-100 text-gray-600',
  written_off: 'bg-red-100 text-red-700',
  rejected:    'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-500',
};

const FILTER_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'defaulted', label: 'Defaulted' },
];

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(loans: LoanAccountList[]) {
  const headers = [
    '#', 'Client Name', 'Loan Number', 'Product',
    'Disbursed Amount (₦)', 'Outstanding Balance (₦)', 'Total Paid (₦)',
    'Next Due Date', 'Days in Arrears', 'Status', 'Officer',
  ];
  const rows = loans.map((l, i) => [
    i + 1,
    l.client_name,
    l.loan_number,
    l.product_name,
    parseFloat(l.disbursed_amount || '0').toFixed(2),
    parseFloat(l.total_outstanding || l.outstanding_principal || '0').toFixed(2),
    parseFloat((l as unknown as { total_paid?: string }).total_paid || '0').toFixed(2),
    (l as unknown as { next_due_date?: string }).next_due_date || '',
    l.days_in_arrears,
    l.status,
    (l as unknown as { assigned_officer_name?: string }).assigned_officer_name || '',
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debtors-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DebtorsReportPage() {
  const [loans, setLoans] = useState<LoanAccountList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch all active+disbursed loans (large page size for full snapshot).
  // `background` refreshes keep the current table visible instead of
  // flashing the loading spinner over it.
  const loadLoans = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page_size: 500 };
      if (statusFilter) {
        params.status = statusFilter;
      }
      if (search) {
        params.search = search;
      }
      // When no filter set, fetch active AND disbursed
      if (!statusFilter) {
        // Fetch active and disbursed separately and merge
        const [activeRes, disbursedRes] = await Promise.all([
          loanService.listLoans({ status: 'active', page: 1, page_size: 500 }),
          loanService.listLoans({ status: 'disbursed', page: 1, page_size: 500 }),
        ]);
        const activeArr = Array.isArray(activeRes) ? activeRes : (activeRes?.results ?? []);
        const disbursedArr = Array.isArray(disbursedRes) ? disbursedRes : (disbursedRes?.results ?? []);
        const merged = [...activeArr, ...disbursedArr];
        const filtered = search
          ? merged.filter(
              (l) =>
                l.client_name.toLowerCase().includes(search.toLowerCase()) ||
                l.loan_number.toLowerCase().includes(search.toLowerCase())
            )
          : merged;
        setLoans(filtered);
      } else {
        const res = await loanService.listLoans({
          status: statusFilter,
          search: search || undefined,
          page: 1,
          page_size: 500,
        });
        const arr = Array.isArray(res) ? res : (res?.results ?? []);
        setLoans(arr);
      }
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load debtors report.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  useAutoRefresh(() => loadLoans(true), AUTO_REFRESH_MS);

  // Summary stats
  // Outstanding = principal + interest (recognized at disbursement) + fees + penalties.
  const totalOutstanding = loans.reduce(
    (s, l) => s + parseFloat(l.total_outstanding || l.outstanding_principal || '0'),
    0
  );
  const avgArrears =
    loans.length > 0
      ? loans.reduce((s, l) => s + (l.days_in_arrears || 0), 0) / loans.length
      : 0;

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0" ref={printRef}>
      {/* Header */}
      <div
        className="mb-6 rounded-xl p-5 text-white print:rounded-none"
        style={{ background: BRAND.colors.navyPrimary }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Debtors Report</h1>
            <p className="mt-0.5 text-sm opacity-75">
              {BRAND.companyName} — Portfolio snapshot as at {today()}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => exportCSV(loans)}
              disabled={loading || loans.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            >
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total Outstanding
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            ₦{fmt(totalOutstanding)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">Sum of all outstanding balances</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Clients</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {fmtInt(loans.length)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">Active loan accounts</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Avg Days in Arrears
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              avgArrears > 30 ? 'text-red-600' : avgArrears > 0 ? 'text-orange-500' : 'text-green-600'
            }`}
          >
            {avgArrears.toFixed(1)} days
          </p>
          <p className="mt-0.5 text-xs text-gray-400">Across all accounts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search client name or loan #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {FILTER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={loadLoans}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : loans.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">
            No debtors found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left text-xs font-semibold uppercase tracking-wide text-white"
                  style={{ background: BRAND.colors.navyPrimary }}
                >
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Client Name</th>
                  <th className="px-4 py-3">Loan #</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Disbursed (₦)</th>
                  <th className="px-4 py-3 text-right">Outstanding (₦)</th>
                  <th className="px-4 py-3 text-right">Total Paid (₦)</th>
                  <th className="px-4 py-3">Next Due Date</th>
                  <th className="px-4 py-3 text-right">Days Arrears</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Officer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loans.map((loan, idx) => {
                  const loanAny = loan as unknown as {
                    next_due_date?: string;
                    total_paid?: string;
                    assigned_officer_name?: string;
                  };
                  return (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{loan.client_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{loan.loan_number}</td>
                      <td className="px-4 py-3 text-gray-600">{loan.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {fmt(loan.disbursed_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {fmt(loan.total_outstanding ?? loan.outstanding_principal)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {fmt(loanAny.total_paid)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {loanAny.next_due_date || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {loan.days_in_arrears > 0 ? (
                          <span className="font-medium text-red-600">{loan.days_in_arrears}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            STATUS_BADGE[loan.status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {loan.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {loanAny.assigned_officer_name || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr
                  className="border-t-2 text-sm font-semibold text-white"
                  style={{ background: BRAND.colors.navyLight }}
                >
                  <td className="px-4 py-3" colSpan={4}>
                    Totals ({fmtInt(loans.length)} accounts)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(loans.reduce((s, l) => s + parseFloat(l.disbursed_amount || '0'), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(totalOutstanding)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(
                      loans.reduce(
                        (s, l) =>
                          s + parseFloat((l as unknown as { total_paid?: string }).total_paid || '0'),
                        0
                      )
                    )}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Print footer */}
      <div className="mt-4 hidden text-center text-xs text-gray-400 print:block">
        Generated by {BRAND.systemLabel} — {today()}. Confidential — for internal use only.
      </div>
    </div>
  );
}
