/**
 * Loan Accounts Page
 * Lists all loan accounts with filtering by status, risk, and search.
 * Data is scoped server-side to clients assigned to the logged-in officer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { loanService, LoanAccountList } from '../../services/loanService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  approved:   'bg-blue-100 text-blue-700',
  disbursed:  'bg-indigo-100 text-indigo-700',
  active:     'bg-green-100 text-green-700',
  defaulted:  'bg-orange-100 text-orange-700',
  paid_off:   'bg-gray-100 text-gray-600',
  written_off:'bg-red-100 text-red-700',
  rejected:   'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

const RISK_BADGE: Record<string, string> = {
  performing:   'bg-green-100 text-green-700',
  watch:        'bg-yellow-100 text-yellow-700',
  substandard:  'bg-orange-100 text-orange-700',
  doubtful:     'bg-red-100 text-red-700',
  loss:         'bg-red-200 text-red-800',
};

const LOAN_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'active', label: 'Active' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: 'paid_off', label: 'Paid Off' },
  { value: 'written_off', label: 'Written Off' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RISK_LEVELS = [
  { value: '', label: 'All Risk Levels' },
  { value: 'performing', label: 'Performing' },
  { value: 'watch', label: 'Watch' },
  { value: 'substandard', label: 'Substandard' },
  { value: 'doubtful', label: 'Doubtful' },
  { value: 'loss', label: 'Loss' },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoanAccountsPage() {
  const [loans, setLoans] = useState<LoanAccountList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const PAGE_SIZE = 25;

  const loadLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loanService.listLoans({
        search: search || undefined,
        status: statusFilter || undefined,
        risk_classification: riskFilter || undefined,
        page,
      });
      const results = Array.isArray(res) ? res : (res?.results ?? []);
      const count = Array.isArray(res) ? res.length : (res?.count ?? 0);
      setLoans(results);
      setTotalCount(count);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to load loan accounts.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, riskFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, riskFilter]);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loan Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage client loan accounts — applications, approvals, and repayments.
          </p>
        </div>
        <Link
          to="/loans/accounts/create"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Application
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search loan number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {LOAN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          aria-label="Filter by risk level"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {RISK_LEVELS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        <button
          onClick={loadLoans}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : loans.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No loan accounts found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Loan #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Disbursed</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3 text-right">Arrears</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loans.map((loan) => (
                <tr key={loan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                    {loan.loan_number}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{loan.client_name}</td>
                  <td className="px-4 py-3 text-gray-600">{loan.product_name}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    ₦{fmt(loan.disbursed_amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ₦{fmt(loan.outstanding_principal)}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {loan.repayment_frequency}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[loan.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {loan.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RISK_BADGE[loan.risk_classification] ?? 'bg-gray-100 text-gray-600'}`}>
                      {loan.risk_classification}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {loan.days_in_arrears > 0 ? (
                      <span className="text-red-600 font-medium">
                        {loan.days_in_arrears}d / ₦{fmt(loan.arrears_amount)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/loans/accounts/${loan.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-gray-500">
              Showing page {page} of {totalPages} ({totalCount} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={12} /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
