import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Trash2,
  AlertTriangle,
  FileText,
  XCircle,
} from 'lucide-react';
import { useAssetAcquisitions, useDeleteAssetAcquisition } from '../../hooks/useAssets';
import type { AssetAcquisition } from '../../types/assets';

// ─── Status helpers ──────────────────────────────────────────────────────────

type AcquisitionStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted';

const STATUS_META: Record<
  AcquisitionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-700',
    icon: <Clock className="w-3 h-3" />,
  },
  submitted: {
    label: 'Pending Approval',
    className: 'bg-yellow-100 text-yellow-800',
    icon: <Clock className="w-3 h-3" />,
  },
  approved: {
    label: 'Approved',
    className: 'bg-blue-100 text-blue-800',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800',
    icon: <XCircle className="w-3 h-3" />,
  },
  posted: {
    label: 'Posted',
    className: 'bg-green-100 text-green-800',
    icon: <CheckCircle className="w-3 h-3" />,
  },
};

const StatusBadge: React.FC<{ status: AcquisitionStatus }> = ({ status }) => {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

const AssetAcquisitionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data, isLoading, refetch } = useAssetAcquisitions({
    search: searchQuery || undefined,
    status: statusFilter || undefined,
  });

  const deleteMutation = useDeleteAssetAcquisition();

  const acquisitions: AssetAcquisition[] = data?.results ?? [];

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
    setDeleteConfirm(null);
  };

  const formatCurrency = (value: string | number) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(Number(value));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Purchases</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bulk asset purchases — each posted purchase creates a PO, AP, GL journal, and registers
            the assets
          </p>
        </div>
        <button
          onClick={() => navigate('/assets/acquisitions/new')}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          New Purchase
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by reference number, supplier…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="posted">Posted</option>
        </select>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!isLoading && acquisitions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{acquisitions.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Drafts</p>
            <p className="text-2xl font-bold text-gray-600 mt-1">
              {acquisitions.filter(a => a.status === 'draft').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">
              {acquisitions.filter(a => a.status === 'submitted' || a.status === 'approved').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Posted</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {acquisitions.filter(a => a.status === 'posted').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Spend</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {formatCurrency(acquisitions.reduce((sum, a) => sum + Number(a.total_amount), 0))}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading purchases…
          </div>
        ) : acquisitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ShoppingCart className="w-12 h-12 mb-3" />
            <p className="font-medium">No purchases found</p>
            <p className="text-sm mt-1">
              {searchQuery || statusFilter
                ? 'Try adjusting your filters'
                : 'Create your first bulk asset purchase'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Reference</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Supplier</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Purchase Date</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Lines</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Total Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">PO #</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {acquisitions.map(acq => (
                  <tr key={acq.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-blue-700">
                      {acq.reference_number}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{acq.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(acq.purchase_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {acq.lines?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(acq.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {acq.purchase_order_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={acq.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => navigate(`/assets/acquisitions/${acq.id}`)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                          title="View / Edit"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {acq.status === 'draft' || acq.status === 'rejected' ? 'Edit' : 'View'}
                        </button>
                        {acq.status === 'posted' && acq.journal_entry && (
                          <span
                            className="inline-flex items-center gap-1 text-gray-400 text-xs"
                            title="GL journal posted"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            GL
                          </span>
                        )}
                        {acq.status === 'draft' && (
                          <button
                            onClick={() => setDeleteConfirm(acq.id)}
                            className="inline-flex items-center gap-1 text-red-500 hover:text-red-700 text-xs font-medium"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Delete Acquisition?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete the draft acquisition. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetAcquisitionListPage;
