import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-800', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
  dispatched: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  acknowledged: { label: 'Acknowledged', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  short_received: {
    label: 'Short Received',
    color: 'bg-amber-100 text-amber-800',
    icon: AlertTriangle,
  },
  disputed: { label: 'Disputed', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  executed: { label: 'Executed (Legacy)', color: 'bg-green-100 text-green-800', icon: Truck },
};

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'dispatched', label: 'In Transit' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'short_received', label: 'Short Received' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'rejected', label: 'Rejected' },
];

const StockTransferListPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['stockTransfers', activeTab, search, page],
    queryFn: () =>
      inventoryService.getStockTransfers({
        status: activeTab !== 'all' ? activeTab : undefined,
        search: search || undefined,
        page,
        page_size: pageSize,
        ordering: '-created_at',
      }),
  });

  const transfers = data?.results ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB');
  const formatCurrency = (amt: string | null | undefined) => {
    if (!amt) return '—';
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amt));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-blue-600" />
            Stock Transfers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage inventory transfers between locations — within a branch or across branches
          </p>
        </div>
        <button
          onClick={() => navigate('/inventory/transfers/create')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New Transfer
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search transfers…"
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm w-full md:w-64 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">Loading…</div>
        ) : transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <ArrowLeftRight className="w-10 h-10 mb-2 text-gray-300" />
            <p className="text-sm">No transfer requests found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Request #</th>
                <th className="px-4 py-3 font-medium text-gray-600">Item</th>
                <th className="px-4 py-3 font-medium text-gray-600">From</th>
                <th className="px-4 py-3 font-medium text-gray-600">To</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Est. Cost</th>
                <th className="px-4 py-3 font-medium text-gray-600">Requested By</th>
                <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {transfers.map(t => {
                const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">
                      <Link to={`/inventory/transfers/${t.id}`}>{t.request_number}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{t.item_name}</div>
                      <div className="text-xs text-gray-500">{t.item_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.from_location_name}
                      {t.from_branch !== t.to_branch && t.from_branch_name && (
                        <div className="text-xs text-gray-400">{t.from_branch_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.to_location_name}
                      {t.from_branch !== t.to_branch && t.to_branch_name && (
                        <div className="text-xs text-gray-400">{t.to_branch_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {parseFloat(t.quantity).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(t.estimated_cost)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{t.requested_by_name}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}
                      >
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/inventory/transfers/${t.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <span className="text-gray-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-gray-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockTransferListPage;
