// src/pages/liabilities/VendorApAgingPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { listAllPayables } from '../../services/liabilitiesService';
import { AccountsPayableListItem } from '../../types/liabilities';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorAgingRow {
  vendor_name: string;
  vendor_type: 'client' | 'supplier';
  bill_count: number;
  total_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  overdue_count: number;
  oldest_due_date: string | null;
  payables: AccountsPayableListItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n);

const isOverdue = (item: AccountsPayableListItem) => item.is_overdue;

// ─── SortIcon ────────────────────────────────────────────────────────────────

const SortIcon: React.FC<{
  col: keyof VendorAgingRow;
  sortKey: keyof VendorAgingRow;
  sortAsc: boolean;
}> = ({ col, sortKey, sortAsc }) =>
  sortKey === col ? (
    sortAsc ? (
      <ChevronUp size={12} className="inline ml-1" />
    ) : (
      <ChevronDown size={12} className="inline ml-1" />
    )
  ) : null;

// ─── Component ────────────────────────────────────────────────────────────────

const VendorApAgingPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof VendorAgingRow>('amount_outstanding');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [vendorTypeFilter, setVendorTypeFilter] = useState<'all' | 'client' | 'supplier'>('all');

  // Fetch all outstanding payables (exclude paid/cancelled)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payables', 'vendor-aging'],
    queryFn: () => listAllPayables({ ordering: 'vendor_name' }),
    staleTime: 2 * 60 * 1000,
  });

  const allPayables: AccountsPayableListItem[] = data ?? [];

  // Group by vendor_name
  const vendorMap = new Map<string, VendorAgingRow>();
  for (const p of allPayables) {
    if (p.status === 'paid' || p.status === 'cancelled') continue;
    const key = p.vendor_name.trim().toLowerCase();
    if (!vendorMap.has(key)) {
      vendorMap.set(key, {
        vendor_name: p.vendor_name,
        vendor_type: (p.vendor_type as 'client' | 'supplier') || 'supplier',
        bill_count: 0,
        total_amount: 0,
        amount_paid: 0,
        amount_outstanding: 0,
        overdue_count: 0,
        oldest_due_date: null,
        payables: [],
      });
    }
    const row = vendorMap.get(key)!;
    row.bill_count += 1;
    row.total_amount += parseFloat(p.amount) || 0;
    row.amount_paid += parseFloat(p.amount_paid) || 0;
    row.amount_outstanding += parseFloat(p.outstanding_amount) || 0;
    if (isOverdue(p)) row.overdue_count += 1;
    if (!row.oldest_due_date || p.due_date < row.oldest_due_date) {
      row.oldest_due_date = p.due_date;
    }
    row.payables.push(p);
  }

  let rows = Array.from(vendorMap.values());

  // Filter
  if (vendorTypeFilter !== 'all') {
    rows = rows.filter(r => r.vendor_type === vendorTypeFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    rows = rows.filter(r => r.vendor_name.toLowerCase().includes(q));
  }

  // Sort
  rows.sort((a, b) => {
    const av = a[sortKey] as string | number | null;
    const bv = b[sortKey] as string | number | null;
    let cmp = 0;
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = 1;
    else if (bv == null) cmp = -1;
    else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: keyof VendorAgingRow) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const totalOutstanding = rows.reduce((s, r) => s + r.amount_outstanding, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue_count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building className="text-blue-600" size={24} />
              Vendor AP Aging
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Outstanding accounts payable grouped by vendor
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Outstanding</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalOutstanding)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} active vendors</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Overdue Bills</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{totalOverdue}</p>
            <p className="text-xs text-gray-400 mt-0.5">across all vendors</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Open Bills</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {rows.reduce((s, r) => s + r.bill_count, 0)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">pending payment</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 relative min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendor name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'supplier', 'client'] as const).map(t => (
              <button
                key={t}
                onClick={() => setVendorTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  vendorTypeFilter === t
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'all' ? 'All Types' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} />
            Failed to load payables. Please try again.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No outstanding payables</p>
              <p className="text-sm mt-1">All vendor bills are paid or cancelled</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('vendor_name')}
                        className="hover:text-gray-900"
                      >
                        Vendor <SortIcon col="vendor_name" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('bill_count')}
                        className="hover:text-gray-900"
                      >
                        Bills <SortIcon col="bill_count" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('total_amount')}
                        className="hover:text-gray-900"
                      >
                        Total Invoiced{' '}
                        <SortIcon col="total_amount" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('amount_outstanding')}
                        className="hover:text-gray-900"
                      >
                        Outstanding{' '}
                        <SortIcon col="amount_outstanding" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('overdue_count')}
                        className="hover:text-gray-900"
                      >
                        Overdue <SortIcon col="overdue_count" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('oldest_due_date')}
                        className="hover:text-gray-900"
                      >
                        Oldest Due{' '}
                        <SortIcon col="oldest_due_date" sortKey={sortKey} sortAsc={sortAsc} />
                      </button>
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Bills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(row => (
                    <React.Fragment key={row.vendor_name}>
                      <tr
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                          row.overdue_count > 0 ? 'border-l-2 border-l-red-400' : ''
                        }`}
                        onClick={() =>
                          setExpandedVendor(
                            expandedVendor === row.vendor_name ? null : row.vendor_name
                          )
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {expandedVendor === row.vendor_name ? (
                              <ChevronUp size={14} className="text-gray-400" />
                            ) : (
                              <ChevronDown size={14} className="text-gray-400" />
                            )}
                            {row.vendor_name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.vendor_type === 'supplier'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {row.vendor_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{row.bill_count}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {fmt(row.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {fmt(row.amount_outstanding)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.overdue_count > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <AlertTriangle size={10} /> {row.overdue_count}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {row.oldest_due_date
                            ? new Date(row.oldest_due_date).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={`/liabilities/payables?search=${encodeURIComponent(row.vendor_name)}`}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                              e.stopPropagation();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <ExternalLink size={12} /> View
                          </Link>
                        </td>
                      </tr>

                      {/* Expanded detail rows */}
                      {expandedVendor === row.vendor_name && (
                        <tr>
                          <td colSpan={8} className="px-0 py-0 bg-gray-50 border-b border-gray-200">
                            <div className="px-8 py-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                Open Bills for {row.vendor_name}
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left py-1 pr-4 font-medium">Reference</th>
                                    <th className="text-left py-1 pr-4 font-medium">Invoice #</th>
                                    <th className="text-left py-1 pr-4 font-medium">Due Date</th>
                                    <th className="text-right py-1 pr-4 font-medium">Total</th>
                                    <th className="text-right py-1 pr-4 font-medium">Paid</th>
                                    <th className="text-right py-1 pr-4 font-medium">
                                      Outstanding
                                    </th>
                                    <th className="text-center py-1 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {row.payables.map(p => (
                                    <tr key={p.id} className="hover:bg-white transition-colors">
                                      <td className="py-1.5 pr-4">
                                        <Link
                                          to={`/liabilities/payables/${p.id}`}
                                          className="text-blue-600 font-mono hover:underline"
                                        >
                                          #{p.id}
                                        </Link>
                                      </td>
                                      <td className="py-1.5 pr-4 text-gray-700">
                                        {p.invoice_number}
                                      </td>
                                      <td
                                        className={`py-1.5 pr-4 ${
                                          isOverdue(p)
                                            ? 'text-red-600 font-medium'
                                            : 'text-gray-700'
                                        }`}
                                      >
                                        {new Date(p.due_date).toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                        })}
                                      </td>
                                      <td className="py-1.5 pr-4 text-right text-gray-700">
                                        {fmt(parseFloat(p.amount) || 0)}
                                      </td>
                                      <td className="py-1.5 pr-4 text-right text-gray-700">
                                        {fmt(parseFloat(p.amount_paid) || 0)}
                                      </td>
                                      <td className="py-1.5 pr-4 text-right font-semibold text-gray-900">
                                        {fmt(parseFloat(p.outstanding_amount) || 0)}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                            p.is_overdue
                                              ? 'bg-red-100 text-red-700'
                                              : p.status === 'partial'
                                                ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-blue-100 text-blue-700'
                                          }`}
                                        >
                                          {p.is_overdue ? 'overdue' : p.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Footer totals */}
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {rows.length} vendor{rows.length !== 1 ? 's' : ''} with outstanding balances
                </span>
                <div className="flex gap-6 font-semibold text-gray-900">
                  <span>Total: {fmt(totalOutstanding)}</span>
                  {totalOverdue > 0 && (
                    <span className="text-red-600">
                      {totalOverdue} overdue bill{totalOverdue !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorApAgingPage;
