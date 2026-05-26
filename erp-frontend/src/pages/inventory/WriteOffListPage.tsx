// src/pages/inventory/WriteOffListPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  LucideIcon,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { inventoryService, WriteOffRequest, WriteOffStatus } from '../../services/inventoryService';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WriteOffStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  pending: { label: 'Pending', cls: 'bg-yellow-50 text-yellow-700', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-blue-50 text-blue-700', Icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700', Icon: XCircle },
  executed: { label: 'Executed', cls: 'bg-green-50 text-green-700', Icon: CheckCircle },
};

const TABS: Array<{ key: WriteOffStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
];

// ─── Approval/Reject Modal ────────────────────────────────────────────────────

interface ActionModal {
  open: boolean;
  type: 'approve' | 'reject' | 'execute' | null;
  target: WriteOffRequest | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const WriteOffListPage: React.FC = () => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<WriteOffStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ActionModal>({ open: false, type: null, target: null });
  const [actionNotes, setActionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['write-offs', statusFilter, search, page],
    queryFn: () =>
      inventoryService.getWriteOffs({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: prev => prev,
  });

  const requests = data?.results ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  // ── Mutations ────────────────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      inventoryService.approveWriteOff(id, notes),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      inventoryService.rejectWriteOff(id, notes),
  });

  const executeMutation = useMutation({
    mutationFn: (id: number) => inventoryService.executeWriteOff(id),
  });

  const isPending =
    approveMutation.isPending || rejectMutation.isPending || executeMutation.isPending;

  const openModal = (type: ActionModal['type'], target: WriteOffRequest) => {
    setModal({ open: true, type, target });
    setActionNotes('');
    setActionError(null);
  };

  const closeModal = () => setModal({ open: false, type: null, target: null });

  const handleAction = async () => {
    if (!modal.target || !modal.type) return;
    setActionError(null);
    try {
      if (modal.type === 'approve') {
        await approveMutation.mutateAsync({ id: modal.target.id, notes: actionNotes });
      } else if (modal.type === 'reject') {
        await rejectMutation.mutateAsync({ id: modal.target.id, notes: actionNotes });
      } else {
        await executeMutation.mutateAsync(modal.target.id);
      }
      qc.invalidateQueries({ queryKey: ['write-offs'] });
      closeModal();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setActionError(
        e?.response?.data?.detail ?? (err instanceof Error ? err.message : 'Action failed')
      );
    }
  };

  const fmt = (val: string | number) =>
    parseFloat(String(val)).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Trash2 className="text-red-500" size={22} />
              Inventory Write-Offs
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Request and approve write-offs for damaged, expired or obsolete stock
            </p>
          </div>
          <Link
            to="/inventory/write-offs/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> New Write-Off
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              title={`Show ${t.label} requests`}
              onClick={() => {
                setStatusFilter(t.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === t.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            title="Search write-off requests"
            placeholder="Search item, SKU, reason…"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Trash2 size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No write-off requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Request #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Est. Cost</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Requested By</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requests.map(r => {
                    const sc = STATUS_CONFIG[r.status];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {r.request_number}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{r.item_name}</div>
                          <div className="text-xs text-gray-400">{r.item_sku}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.location_name}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {fmt(r.estimated_cost)}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="text-gray-600 truncate" title={r.reason}>
                            {r.reason}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}
                          >
                            <sc.Icon size={11} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.requested_by_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {r.status === 'pending' && (
                              <>
                                <button
                                  title="Approve write-off"
                                  onClick={() => openModal('approve', r)}
                                  className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                                >
                                  <CheckCircle size={15} />
                                </button>
                                <button
                                  title="Reject write-off"
                                  onClick={() => openModal('reject', r)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <XCircle size={15} />
                                </button>
                              </>
                            )}
                            {r.status === 'approved' && (
                              <button
                                title="Execute write-off (deduct stock)"
                                onClick={() => openModal('execute', r)}
                                className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                              >
                                Execute
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
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

      {/* Action Modal */}
      {modal.open && modal.target && modal.type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`p-2 rounded-full ${
                  modal.type === 'approve'
                    ? 'bg-green-100'
                    : modal.type === 'reject'
                      ? 'bg-red-100'
                      : 'bg-indigo-100'
                }`}
              >
                {modal.type === 'approve' && <CheckCircle size={18} className="text-green-600" />}
                {modal.type === 'reject' && <XCircle size={18} className="text-red-600" />}
                {modal.type === 'execute' && <Trash2 size={18} className="text-indigo-600" />}
              </div>
              <h2 className="text-base font-semibold text-gray-900 capitalize">
                {modal.type} Write-Off
              </h2>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {modal.type === 'execute'
                ? `Execute write-off for ${modal.target.quantity} × ${modal.target.item_name}? Stock will be permanently deducted.`
                : `${modal.type === 'approve' ? 'Approve' : 'Reject'} request ${modal.target.request_number} for ${modal.target.item_name}?`}
            </p>

            {modal.type !== 'execute' && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notes {modal.type === 'reject' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  title="Approval/rejection notes"
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder={
                    modal.type === 'approve' ? 'Optional notes…' : 'Reason for rejection…'
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-4">
                <AlertTriangle size={13} className="flex-shrink-0" />
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={isPending || (modal.type === 'reject' && !actionNotes.trim())}
                className={`px-4 py-2 text-white rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
                  modal.type === 'approve' || modal.type === 'execute'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isPending
                  ? 'Processing…'
                  : modal.type === 'approve'
                    ? 'Approve'
                    : modal.type === 'reject'
                      ? 'Reject'
                      : 'Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WriteOffListPage;
