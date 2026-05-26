// src/pages/inventory/SalesOrderListPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { inventoryService, SalesOrderStatus } from '../../services/inventoryService';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SalesOrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', cls: 'bg-yellow-100 text-yellow-700' },
  partially_delivered: { label: 'Partially Delivered', cls: 'bg-indigo-100 text-indigo-700' },
  shipped: { label: 'Shipped', cls: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'Delivered', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

const ALL_TABS: Array<{ key: SalesOrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'delivered', label: 'Delivered' },
];

const fmt = (n: string) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(parseFloat(n));

// ─── Component ────────────────────────────────────────────────────────────────

const SalesOrderListPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<SalesOrderStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales-orders', statusFilter, search, page],
    queryFn: () =>
      inventoryService.getSalesOrders({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        page,
        page_size: pageSize,
        ordering: '-order_date',
      }),
    staleTime: 60_000,
  });

  const orders = data?.results ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleTabChange = (tab: SalesOrderStatus | 'all') => {
    setStatusFilter(tab);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="text-blue-600" size={24} />
              Sales Orders
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage inventory-level sales orders</p>
          </div>
          <button
            onClick={() => navigate('/inventory/sales-orders/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            New Sales Order
          </button>
        </div>

        {/* Status tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-1 overflow-x-auto">
          {ALL_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
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
              placeholder="Search order number, client…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Count */}
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">{data?.count ?? 0}</span> orders found
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} />
            Failed to load sales orders. Please try again.
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ShoppingCart size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No sales orders found</p>
              {statusFilter !== 'all' || search ? (
                <p className="text-sm mt-1">Try adjusting your filters</p>
              ) : (
                <button
                  onClick={() => navigate('/inventory/sales-orders/new')}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} /> Create first order
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Delivery Date</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Items</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => {
                  const sc = STATUS_CONFIG[order.status];
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">
                        {order.so_number || order.order_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                        {order.client_name}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={13} className="text-gray-400" />
                          {new Date(order.order_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {order.expected_delivery_date ? (
                          new Date(order.expected_delivery_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{order.item_count}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmt(order.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}
                        >
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          to={`/inventory/sales-orders/${order.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
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
              Page {page} of {totalPages} ({data?.count} records)
            </span>
            <div className="flex gap-2">
              <button
                title="Previous page"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                title="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
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

export default SalesOrderListPage;
