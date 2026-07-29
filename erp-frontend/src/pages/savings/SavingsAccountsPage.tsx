/**
 * Savings Accounts Page
 * Lists all savings accounts with filtering by status and contribution cycle.
 * Data is scoped server-side to clients assigned to the logged-in officer.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useSavingsAccounts } from '../../hooks/useSavings';
import type { ContributionCycle, SavingsAccountStatus } from '../../services/savingsService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<SavingsAccountStatus, string> = {
  active:  'bg-green-100 text-green-700',
  dormant: 'bg-yellow-100 text-yellow-700',
  frozen:  'bg-blue-100 text-blue-700',
  closed:  'bg-gray-100 text-gray-600',
};

const CYCLE_BADGE: Record<ContributionCycle, string> = {
  daily:   'bg-blue-100 text-blue-700',
  weekly:  'bg-purple-100 text-purple-700',
  monthly: 'bg-teal-100 text-teal-700',
};

const ACCOUNT_STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'closed', label: 'Closed' },
];

const CYCLES: { value: string; label: string }[] = [
  { value: '', label: 'All Cycles' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const PAGE_SIZE = 25;

// ── Page ───────────────────────────────────────────────────────────────────

export default function SavingsAccountsPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [page, setPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error, refetch } = useSavingsAccounts({
    cycle: cycleFilter ? (cycleFilter as ContributionCycle) : undefined,
    status: statusFilter || undefined,
    search: search || undefined,
    page,
    page_size: PAGE_SIZE,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  };

  useEffect(() => {
    setPage(1);
  }, [cycleFilter, statusFilter, search]);

  const accounts = Array.isArray(data) ? data : (data?.results ?? []);
  const totalCount = Array.isArray(data) ? data.length : (data?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const errorMsg = error?.detail ?? error?.message ?? null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Savings Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage client savings accounts and contribution schedules.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/savings/collection"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Collection Sheet
          </Link>
          <Link
            to="/savings/accounts/create"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Account
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search name, account # or client ID…"
            value={searchInput}
            onChange={handleSearchChange}
            className="rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
          />
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          aria-label="Filter by contribution cycle"
          value={cycleFilter}
          onChange={(e) => { setCycleFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CYCLES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No savings accounts found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Account #</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3 text-right">Contribution</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => (
                <tr
                  key={acc.id}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => navigate(`/savings/accounts/${acc.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                    {acc.account_number}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{acc.client_name}</td>
                  <td className="px-4 py-3 text-gray-600">{acc.product_name}</td>
                  <td className="px-4 py-3">
                    {acc.contribution_cycle ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CYCLE_BADGE[acc.contribution_cycle]}`}>
                        {acc.contribution_cycle}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {acc.effective_contribution_amount ? `₦${fmt(acc.effective_contribution_amount)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₦{fmt(acc.current_balance)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[acc.status]}`}>
                      {acc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{acc.opened_on}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/savings/accounts/${acc.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 border border-blue-200"
                    >
                      <Eye size={11} />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
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
