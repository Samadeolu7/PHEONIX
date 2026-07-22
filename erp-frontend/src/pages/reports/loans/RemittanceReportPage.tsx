/**
 * Remittance Report (Daily Transactions) Page
 * Shows what's due today and what's actually been collected today.
 *
 * Sourced from LoanAccountViewSet.remittance_report — a single endpoint that
 * unions LoanRepaymentSchedule (due dates) with FinancialAuditLog collection
 * events, so every repayment path (direct repay, bulk-repay, repayment
 * requests, offline/field collections, and collection-sheet postings) shows
 * up here, not just officers who use the daily collection sheet workflow.
 * Route: /reports/daily-transactions
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  Banknote,
  CreditCard,
  Users,
  CalendarClock,
} from 'lucide-react';
import {
  loanService,
  RemittanceReport,
  RemittanceDueRow,
  RemittanceLoanCollectionRow,
  RemittanceSavingsCollectionRow,
} from '../../../services/loanService';
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

const todayStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayLabel = () =>
  new Date().toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const PAYMENT_MODE_BADGE: Record<string, string> = {
  cash:          'bg-green-100 text-green-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  other:         'bg-gray-100 text-gray-600',
};

const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  other:         'Other',
};

const DUE_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  paid:    'bg-green-100 text-green-700',
};

// ── Row type (flattened collections for the table) ────────────────────────────

interface CollectionRow {
  key: string;
  client_name: string;
  loan_or_account: string;
  collection_type: 'Loan Repayment' | 'Savings Deposit';
  amount: string;
  payment_mode: string;
  officer_name: string;
  acted_by_name: string;
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function exportCSV(report: RemittanceReport, rows: CollectionRow[]) {
  const dueCsv = toCsv(
    ['#', 'Client Name', 'Loan #', 'Officer', 'Due Date', 'Amount Due (₦)', 'Amount Paid (₦)', 'Remaining (₦)', 'Status'],
    report.due.map((r, i) => [
      i + 1, r.client_name, r.loan_number, r.officer_name, r.due_date,
      parseFloat(r.total_due).toFixed(2), parseFloat(r.total_paid).toFixed(2),
      parseFloat(r.remaining).toFixed(2), r.status,
    ])
  );

  const collectedCsv = toCsv(
    ['#', 'Client Name', 'Loan/Account #', 'Type', 'Amount Paid (₦)', 'Payment Mode', 'Officer', 'Recorded By'],
    rows.map((r, i) => [
      i + 1, r.client_name, r.loan_or_account, r.collection_type,
      parseFloat(r.amount || '0').toFixed(2),
      PAYMENT_MODE_LABEL[r.payment_mode] || r.payment_mode,
      r.officer_name, r.acted_by_name,
    ])
  );

  const csv =
    `Remittance Report - Date: ${report.date}\n\n` +
    `DUE TODAY\n${dueCsv}\n\n` +
    `COLLECTED TODAY\n${collectedCsv}\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remittance-report-${report.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RemittanceReportPage() {
  const [report, setReport] = useState<RemittanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());

  const loadData = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const data = await loanService.getRemittanceReport(date);
      setReport(data);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load remittance data.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useAutoRefresh(() => loadData(true), AUTO_REFRESH_MS);

  const due: RemittanceDueRow[] = report?.due ?? [];
  const loanCollections: RemittanceLoanCollectionRow[] = report?.loan_collections ?? [];
  const savingsCollections: RemittanceSavingsCollectionRow[] = report?.savings_collections ?? [];

  const rows: CollectionRow[] = [
    ...loanCollections.map((r, i) => ({
      key: `loan-${i}`,
      client_name: r.client_name,
      loan_or_account: r.loan_number,
      collection_type: 'Loan Repayment' as const,
      amount: r.amount,
      payment_mode: r.payment_mode,
      officer_name: r.officer_name,
      acted_by_name: r.acted_by_name,
    })),
    ...savingsCollections.map((r, i) => ({
      key: `savings-${i}`,
      client_name: r.client_name,
      loan_or_account: r.account_number,
      collection_type: 'Savings Deposit' as const,
      amount: r.amount,
      payment_mode: r.payment_mode,
      officer_name: '—',
      acted_by_name: r.acted_by_name,
    })),
  ];

  const summary = report?.summary;
  const totalCollected = parseFloat(summary?.total_collected ?? '0');
  const totalDue = parseFloat(summary?.total_due ?? '0');
  const totalCash = parseFloat(summary?.total_cash ?? '0');
  const totalBank = parseFloat(summary?.total_bank ?? '0');
  const cashCount = rows.filter((r) => r.payment_mode === 'cash').length;
  const bankCount = rows.filter((r) => r.payment_mode === 'bank_transfer').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      {/* Header */}
      <div
        className="mb-6 rounded-xl p-5 text-white print:rounded-none"
        style={{ background: BRAND.colors.navyPrimary }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Remittance Report</h1>
            <p className="mt-0.5 text-sm opacity-75">
              {BRAND.companyName} — Due dates &amp; daily collections
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <label className="text-xs opacity-75">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border-0 bg-white/10 px-3 py-1.5 text-sm text-white focus:bg-white/20 focus:outline-none"
              />
            </div>
            <button
              onClick={() => report && exportCSV(report, rows)}
              disabled={loading || !report}
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
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <CalendarClock size={12} /> Due Today
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">₦{fmt(totalDue)}</p>
          <p className="mt-0.5 text-xs text-gray-400">{fmtInt(due.length)} installment(s)</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total Collected
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            ₦{fmt(totalCollected)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{fmtInt(rows.length)} transaction(s)</p>
        </div>
        <div className="rounded-xl bg-green-50 p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-green-600">
            <Banknote size={12} /> Cash
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-green-700">
            {fmtInt(cashCount)} · ₦{fmt(totalCash)}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-blue-600">
            <CreditCard size={12} /> Bank Transfer
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-blue-700">
            {fmtInt(bankCount)} · ₦{fmt(totalBank)}
          </p>
        </div>
        <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm sm:col-span-1">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Users size={12} /> Officers
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {fmtInt(summary?.officer_count ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">collected today</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Due Today */}
      <div className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div
          className="px-5 py-3 text-sm font-semibold text-white"
          style={{ background: BRAND.colors.navyPrimary }}
        >
          Due Today — use this to inform clients of their due date
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : due.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No installments due on {date}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Client Name</th>
                  <th className="px-4 py-3">Loan #</th>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3 text-right">Amount Due (₦)</th>
                  <th className="px-4 py-3 text-right">Paid So Far (₦)</th>
                  <th className="px-4 py-3 text-right">Remaining (₦)</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {due.map((r, idx) => (
                  <tr key={`${r.loan_number}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.client_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.loan_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.officer_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {fmt(r.total_due)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {fmt(r.total_paid)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {fmt(r.remaining)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          DUE_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collected Today */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div
          className="px-5 py-3 text-sm font-semibold text-white"
          style={{ background: BRAND.colors.navyLight }}
        >
          Collected Today
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">
            No collections recorded for {date}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Client Name</th>
                  <th className="px-4 py-3">Loan/Account #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Amount Paid (₦)</th>
                  <th className="px-4 py-3">Payment Mode</th>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={row.key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.client_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.loan_or_account}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{row.collection_type}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {fmt(row.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          PAYMENT_MODE_BADGE[row.payment_mode] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {PAYMENT_MODE_LABEL[row.payment_mode] || row.payment_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{row.officer_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{row.acted_by_name}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2 text-sm font-semibold text-white"
                  style={{ background: BRAND.colors.navyLight }}
                >
                  <td className="px-4 py-3" colSpan={4}>
                    Totals ({fmtInt(rows.length)} transactions)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCollected)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Print footer */}
      <div className="mt-6 hidden text-center text-xs text-gray-400 print:block">
        Remittance Report — Date: {date} — Generated by {BRAND.systemLabel} on {todayLabel()}.
        Confidential — for internal use only.
      </div>
    </div>
  );
}
