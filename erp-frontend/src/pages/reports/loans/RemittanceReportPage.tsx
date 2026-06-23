/**
 * Remittance Report (Daily Transactions) Page
 * Shows all collections received on a given date.
 * Uses the DailyCollectionSheet (cash-management) API as the primary source.
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
} from 'lucide-react';
import {
  collectionSheetService,
  CollectionSheetItem,
  DailyCollectionSheet,
} from '../../../services/collectionSheetService';
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

const todayLabel = () =>
  new Date().toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const PAYMENT_MODE_BADGE: Record<string, string> = {
  cash:          'bg-green-100 text-green-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  mobile_money:  'bg-purple-100 text-purple-700',
};

const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  mobile_money:  'Mobile Money',
};

// ── Row type ───────────────────────────────────────────────────────────────────

interface RemittanceRow {
  id: number;
  client_name: string;
  loan_number: string;
  amount_collected: string;
  payment_mode: string;
  collection_date: string;
  officer_name: string;
  collection_type: string;
  sheet_id: number;
  status: string;
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(rows: RemittanceRow[], date: string) {
  const headers = [
    '#', 'Client Name', 'Loan #', 'Amount Paid (₦)',
    'Payment Mode', 'Collection Type', 'Date', 'Officer', 'Status',
  ];
  const data = rows.map((r, i) => [
    i + 1,
    r.client_name,
    r.loan_number,
    parseFloat(r.amount_collected || '0').toFixed(2),
    PAYMENT_MODE_LABEL[r.payment_mode] || r.payment_mode,
    r.collection_type,
    r.collection_date,
    r.officer_name,
    r.status,
  ]);

  const csv = [headers, ...data]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`Remittance Report - Date: ${date}\n\n`, csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remittance-report-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RemittanceReportPage() {
  const [rows, setRows] = useState<RemittanceRow[]>([]);
  const [sheets, setSheets] = useState<DailyCollectionSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all collection sheets for the selected date
      const sheetList = await collectionSheetService.list({ collection_date: date });
      setSheets(sheetList);

      if (sheetList.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch items from every sheet in parallel
      const itemArrays = await Promise.all(
        sheetList.map((s) => collectionSheetService.listItems(s.id))
      );

      // Flatten and build display rows
      const allRows: RemittanceRow[] = [];
      sheetList.forEach((sheet, si) => {
        const items: CollectionSheetItem[] = itemArrays[si] ?? [];
        items
          .filter((item) => parseFloat(item.amount_collected || '0') > 0)
          .forEach((item) => {
            allRows.push({
              id: item.id,
              client_name: item.client_name ?? '—',
              loan_number: item.loan_account
                ? `L-${String(item.loan_account).padStart(6, '0')}`
                : '—',
              amount_collected: item.amount_collected,
              payment_mode: item.payment_mode,
              collection_date: sheet.collection_date,
              officer_name: sheet.credit_officer_name ?? '—',
              collection_type: item.collection_type_display || item.collection_type,
              sheet_id: sheet.id,
              status: item.status_display || item.status,
            });
          });
      });

      setRows(allRows);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load remittance data.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Summary stats
  const totalCollected = rows.reduce(
    (s, r) => s + parseFloat(r.amount_collected || '0'),
    0
  );
  const cashRows = rows.filter((r) => r.payment_mode === 'cash');
  const transferRows = rows.filter((r) => r.payment_mode === 'bank_transfer');
  const uniqueOfficers = new Set(rows.map((r) => r.officer_name)).size;
  const totalCash = cashRows.reduce(
    (s, r) => s + parseFloat(r.amount_collected || '0'),
    0
  );
  const totalTransfer = transferRows.reduce(
    (s, r) => s + parseFloat(r.amount_collected || '0'),
    0
  );

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
              {BRAND.companyName} — Daily collections &amp; transactions
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
              onClick={() => exportCSV(rows, date)}
              disabled={loading || rows.length === 0}
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
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total Collected
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            ₦{fmt(totalCollected)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">For {date}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            # Transactions
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {fmtInt(rows.length)}
          </p>
        </div>
        <div className="rounded-xl bg-green-50 p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-green-600">
            <Banknote size={12} /> Cash
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-green-700">
            {fmtInt(cashRows.length)} · ₦{fmt(totalCash)}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-blue-600">
            <CreditCard size={12} /> Bank Transfer
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-blue-700">
            {fmtInt(transferRows.length)} · ₦{fmt(totalTransfer)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <Users size={12} /> Officers
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {fmtInt(uniqueOfficers)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{fmtInt(sheets.length)} sheet(s)</p>
        </div>
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
        ) : rows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">
            No collections recorded for {date}.
            {sheets.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">No collection sheets found for this date.</p>
            )}
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
                  <th className="px-4 py-3">Collection Type</th>
                  <th className="px-4 py-3 text-right">Amount Paid (₦)</th>
                  <th className="px-4 py-3">Payment Mode</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.client_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.loan_number}</td>
                    <td className="px-4 py-3 text-xs capitalize text-gray-600">
                      {row.collection_type}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {fmt(row.amount_collected)}
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
                    <td className="px-4 py-3 text-xs text-gray-600">{row.collection_date}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{row.officer_name}</td>
                    <td className="px-4 py-3 text-xs capitalize text-gray-500">{row.status}</td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr
                  className="border-t-2 text-sm font-semibold text-white"
                  style={{ background: BRAND.colors.navyLight }}
                >
                  <td className="px-4 py-3" colSpan={4}>
                    Totals ({fmtInt(rows.length)} transactions)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(totalCollected)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Officer breakdown (if multiple sheets) */}
      {sheets.length > 1 && !loading && (
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          <div
            className="px-5 py-3 text-sm font-semibold text-white"
            style={{ background: BRAND.colors.navyPrimary }}
          >
            Breakdown by Credit Officer
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3 text-right"># Transactions</th>
                <th className="px-5 py-3 text-right">Cash (₦)</th>
                <th className="px-5 py-3 text-right">Bank Transfer (₦)</th>
                <th className="px-5 py-3 text-right">Total Collected (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sheets.map((s) => {
                const officerRows = rows.filter((r) => r.officer_name === (s.credit_officer_name ?? '—'));
                const officerTotal = parseFloat(s.total_collected || '0');
                const officerCash  = parseFloat(s.total_collected_cash || '0');
                const officerTx    = parseFloat(s.total_confirmed_transfers || '0') +
                                     parseFloat(s.total_unconfirmed_transfers || '0');
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {s.credit_officer_name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                      {fmtInt(officerRows.length)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">
                      {fmt(officerCash)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-blue-700">
                      {fmt(officerTx)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {fmt(officerTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Print footer */}
      <div className="mt-6 hidden text-center text-xs text-gray-400 print:block">
        Remittance Report — Date: {date} — Generated by {BRAND.systemLabel} on {todayLabel()}.
        Confidential — for internal use only.
      </div>
    </div>
  );
}
