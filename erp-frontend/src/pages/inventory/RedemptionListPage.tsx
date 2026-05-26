// src/pages/inventory/RedemptionListPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RotateCcw,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const fmt = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(v);
};

const RedemptionListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['redemptions', statusFilter, search, page],
    queryFn: () =>
      inventoryService.getRedemptions({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        page,
        page_size: pageSize,
      }),
    staleTime: 60_000,
  });

  const redemptions = data?.results ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="text-blue-600" size={24} />
            Redemptions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Allocation redemption history</p>
        </div>
        <div className="max-w-7xl mx-auto mt-3 flex gap-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'completed', label: 'Completed' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search redemption number, client…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setSearch(searchInput);
                  setPage(1);
                }
              }}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Search
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">{data?.count ?? 0}</span> redemptions
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} /> Failed to load redemptions.
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : redemptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <RotateCcw size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No redemptions found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Redemption #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Allocation</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {redemptions.map(r => {
                  const sb = STATUS_BADGES[r.status ?? 'completed'] || STATUS_BADGES.completed;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">
                        {r.redemption_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {r.allocation_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.client_name}</td>
                      <td className="px-4 py-3 text-gray-600 flex items-center gap-1">
                        <Calendar size={13} className="text-gray-400" />
                        {r.redemption_date
                          ? new Date(r.redemption_date).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {r.amount_redeemed ? fmt(r.amount_redeemed) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.location_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sb.cls}`}
                        >
                          {sb.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          to={`/inventory/allocations/${r.allocation}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50"
                        >
                          <Eye size={13} /> Allocation
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RedemptionListPage;
