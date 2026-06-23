/**
 * Defaulters Report Page
 * Lists loans in defaulted status OR with days_in_arrears > 0.
 * Rows are color-coded by arrears severity.
 * Route: /reports/loans/defaulters
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { loanService, LoanAccountList } from '../../../services/loanService';
import { BRAND } from '../../../constants/brand';

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

const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayLabel = () => {
  return new Date().toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** Row background based on days in arrears */
function arrearsRowClass(days: number): string {
  if (days > 90) return 'bg-red-50 hover:bg-red-100';
  if (days > 30) return 'bg-orange-50 hover:bg-orange-100';
  if (days > 0)  return 'bg-yellow-50 hover:bg-yellow-100';
  return 'hover:bg-gray-50';
}

/** Badge colour */
function arrearsBadge(days: number): string {
  if (days > 90) return 'bg-red-100 text-red-700';
  if (days > 30) return 'bg-orange-100 text-orange-700';
  if (days > 0)  return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(loans: LoanAccountList[], asOf: string) {
  const headers = [
    '#', 'Client Name', 'Phone', 'Group', 'Loan #', 'Product',
    'Outstanding Balance (₦)', 'Days in Arrears', 'Last Payment Date',
    'Status', 'Assigned Officer',
  ];
  const rows = loans.map((l, i) => {
    const la = l as unknown as {
      client_phone?: string;
      group_name?: string;
      last_payment_date?: string;
      assigned_officer_name?: string;
    };
    return [
      i + 1,
      l.client_name,
      la.client_phone || '',
      la.group_name || '',
      l.loan_number,
      l.product_name,
      parseFloat(l.outstanding_principal || '0').toFixed(2),
      l.days_in_arrears,
      la.last_payment_date || '',
      l.status,
      la.assigned_officer_name || '',
    ];
  });

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`Defaulters Report - As Of: ${asOf}\n\n`, csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `defaulters-report-${asOf}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DefaultersReportPage() {
  const [loans, setLoans] = useState<LoanAccountList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(todayStr());

  const loadLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch defaulted + active loans that have arrears
      const [defaultedRes, activeRes] = await Promise.all([
        loanService.listLoans({ status: 'defaulted', page: 1, page_size: 500 }),
        loanService.listLoans({ status: 'active', page: 1, page_size: 500 }),
      ]);

      const defaultedArr: LoanAccountList[] = Array.isArray(defaultedRes)
        ? defaultedRes
        : (defaultedRes?.results ?? []);
      const activeArr: LoanAccountList[] = Array.isArray(activeRes)
        ? activeRes
        : (activeRes?.results ?? []);

      // Only include active loans that have any days in arrears
      const activeInArrears = activeArr.filter((l) => l.days_in_arrears > 0);

      // Merge, deduplicate by id, sort by days descending
      const merged = [...defaultedArr, ...activeInArrears];
      const seen = new Set<number>();
      const unique = merged.filter((l) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
      unique.sort((a, b) => b.days_in_arrears - a.days_in_arrears);
      setLoans(unique);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load defaulters report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  // Summary stats
  const totalOutstanding = loans.reduce(
    (s, l) => s + parseFloat(l.outstanding_principal || '0'),
    0
  );
  const avgArrears =
    loans.length > 0
      ? loans.reduce((s, l) => s + (l.days_in_arrears || 0), 0) / loans.length
      : 0;
  const over90 = loans.filter((l) => l.days_in_arrears > 90).length;
  const over30 = loans.filter((l) => l.days_in_arrears > 30 && l.days_in_arrears <= 90).length;
  const under30 = loans.filter((l) => l.days_in_arrears > 0 && l.days_in_arrears <= 30).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      {/* Header */}
      <div
        className="mb-6 rounded-xl p-5 text-white print:rounded-none"
        style={{ background: BRAND.colors.navyPrimary }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Defaulters Report</h1>
            <p className="mt-0.5 text-sm opacity-75">
              {BRAND.companyName} — Overdue &amp; defaulted loans
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <label className="text-xs opacity-75">As of date</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="rounded-lg border-0 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 focus:bg-white/20 focus:outline-none"
              />
            </div>
            <button
              onClick={() => exportCSV(loans, asOf)}
              disabled={loading || loans.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={loadLoans}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total Defaulted Outstanding
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">
            ₦{fmt(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Accounts</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {fmtInt(loans.length)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Avg Days Arrears</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-500">
            {avgArrears.toFixed(0)}d
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-red-400">&gt;90 Days</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">{fmtInt(over90)}</p>
        </div>
        <div className="rounded-xl bg-orange-50 p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-400">31–90 Days</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-500">{fmtInt(over30)}</p>
        </div>
        <div className="rounded-xl bg-yellow-50 p-5 shadow-sm hidden lg:block">
          <p className="text-xs font-medium uppercase tracking-wide text-yellow-500">1–30 Days</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-yellow-600">{fmtInt(under30)}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs print:hidden">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-300" />
          <span className="text-gray-600">&gt;90 days — Critical</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-orange-100 ring-1 ring-orange-300" />
          <span className="text-gray-600">31–90 days — Serious</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-yellow-100 ring-1 ring-yellow-300" />
          <span className="text-gray-600">1–30 days — Watch</span>
        </span>
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
            No defaulters found. Portfolio is performing well.
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
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Loan #</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Outstanding (₦)</th>
                  <th className="px-4 py-3 text-right">Days Arrears</th>
                  <th className="px-4 py-3">Last Payment</th>
                  <th className="px-4 py-3">Officer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loans.map((loan, idx) => {
                  const la = loan as unknown as {
                    client_phone?: string;
                    group_name?: string;
                    last_payment_date?: string;
                    assigned_officer_name?: string;
                  };
                  return (
                    <tr key={loan.id} className={arrearsRowClass(loan.days_in_arrears)}>
                      <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{loan.client_name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{la.client_phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{la.group_name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{loan.loan_number}</td>
                      <td className="px-4 py-3 text-gray-600">{loan.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {fmt(loan.outstanding_principal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${arrearsBadge(
                            loan.days_in_arrears
                          )}`}
                        >
                          {loan.days_in_arrears}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {la.last_payment_date || <span className="text-gray-300">Never</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {la.assigned_officer_name || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2 text-sm font-semibold text-white"
                  style={{ background: BRAND.colors.navyLight }}
                >
                  <td className="px-4 py-3" colSpan={6}>
                    Totals ({fmtInt(loans.length)} accounts)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalOutstanding)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Print footer */}
      <div className="mt-4 hidden text-center text-xs text-gray-400 print:block">
        Defaulters Report — As of {asOf} — Generated by {BRAND.systemLabel} on {todayLabel()}.
        Confidential — for internal use only.
      </div>
    </div>
  );
}
