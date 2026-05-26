// src/pages/inventory/AllocationListPage.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  Search,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Pending Payment', cls: 'bg-gray-100 text-gray-700' },
  partial_access: { label: 'Partial Access', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  partially_used: { label: 'Partially Used', cls: 'bg-blue-100 text-blue-700' },
  exhausted: { label: 'Exhausted', cls: 'bg-purple-100 text-purple-700' },
  expired: { label: 'Expired', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'partially_used', label: 'Partially Used' },
  { key: 'pending_payment', label: 'Pending' },
  { key: 'exhausted', label: 'Exhausted' },
  { key: 'expired', label: 'Expired' },
];

const fmt = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(v);
};

const AllocationListPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['allocations', statusFilter, search, page],
    queryFn: () =>
      inventoryService.getAllocations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        page,
        page_size: pageSize,
      }),
    staleTime: 60_000,
  });

  const allocations = data?.results ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="text-blue-600" size={24} />
            Inventory Allocations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Client inventory allocations and entitlements
          </p>
        </div>
        <div className="max-w-7xl mx-auto mt-3 flex gap-1 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
        {/* Search */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search allocation number, client…"
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
          <span className="font-medium text-gray-700">{data?.count ?? 0}</span> allocations found
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} /> Failed to load allocations.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : allocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Layers size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No allocations found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Allocation #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Allocated</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Remaining</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Valid Until</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map(a => {
                  const sb = STATUS_BADGES[a.status] || STATUS_BADGES.active;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">
                        {a.allocation_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.client_name}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">
                        {a.allocation_type?.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {a.allocated_amount ? fmt(a.allocated_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {a.remaining_amount ? fmt(a.remaining_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {a.valid_until ? new Date(a.valid_until).toLocaleDateString('en-GB') : '∞'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sb.cls}`}
                        >
                          {sb.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          to={`/inventory/allocations/${a.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50"
                        >
                          <Eye size={13} /> View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
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

export default AllocationListPage;
