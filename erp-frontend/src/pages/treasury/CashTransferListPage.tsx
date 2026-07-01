import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  BadgeCheck,
  CheckCircle,
  Circle,
  Clock,
  LucideIcon,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { cashTransferService } from '../../services/treasuryService';
import { CashTransfer } from '../../types/treasury';

type TransferStatus = CashTransfer['status'];

interface StatusCfg {
  label: string;
  cls: string;
  Icon: LucideIcon;
}

const STATUS_CONFIG: Record<TransferStatus, StatusCfg> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600', Icon: Circle },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700', Icon: Clock },
  approved: { label: 'Approved', cls: 'bg-blue-50 text-blue-700', Icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700', Icon: XCircle },
  posted: { label: 'Posted', cls: 'bg-green-50 text-green-700', Icon: BadgeCheck },
};

const fmt = (v: string | undefined) =>
  v
    ? parseFloat(v).toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
      })
    : '—';

type ModalAction = 'approve' | 'reject';

const CashTransferListPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransferStatus | ''>('');
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['cash-transfers'],
    queryFn: () => cashTransferService.getAll(),
    staleTime: 30_000,
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => cashTransferService.submit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-transfers'] }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      cashTransferService.approve(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-transfers'] });
      closeModal();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      cashTransferService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-transfers'] });
      closeModal();
    },
  });

  const postMutation = useMutation({
    mutationFn: (id: number) => cashTransferService.post(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-transfers'] }),
  });

  const openModal = (action: ModalAction, id: number) => {
    setModalAction(action);
    setSelectedId(id);
    setActionNotes('');
    setActionError('');
  };

  const closeModal = () => {
    setModalAction(null);
    setSelectedId(null);
    setActionNotes('');
    setActionError('');
  };

  const handleModalConfirm = async () => {
    if (!selectedId || !modalAction) return;
    setActionError('');

    if (modalAction === 'reject' && !actionNotes.trim()) {
      setActionError('Rejection reason is required.');
      return;
    }

    try {
      if (modalAction === 'approve') {
        await approveMutation.mutateAsync({
          id: selectedId,
          notes: actionNotes.trim() || undefined,
        });
      } else {
        await rejectMutation.mutateAsync({ id: selectedId, reason: actionNotes.trim() });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed. Please try again.';
      setActionError(msg);
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitMutation.mutateAsync(id);
    } catch {
      /* handled by React Query */
    }
  };

  const handlePost = async (id: number) => {
    try {
      await postMutation.mutateAsync(id);
    } catch {
      /* handled by React Query */
    }
  };

  const filtered = transfers.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.transfer_number.toLowerCase().includes(q) ||
        (t.cashier_name ?? '').toLowerCase().includes(q) ||
        (t.destination_account_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const isPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    postMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowUpCircle className="text-blue-500" size={22} />
            Cash Transfers
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Transfers from cashier accounts to the main bank
          </p>
        </div>
        <Link
          to="/banks/transfers/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Transfer
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            title="Search transfers"
            placeholder="Search transfers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          title="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TransferStatus | '')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-14 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ArrowUpCircle size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No cash transfers found</p>
            <Link
              to="/banks/transfers/new"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Plus size={14} /> Create first transfer
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Transfer #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Cashier</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Destination Account
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => {
                  const cfg = STATUS_CONFIG[t.status];
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {t.transfer_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.cashier_name ?? `Account #${t.cashier_account}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.destination_account_name ?? `Account #${t.destination_account}`}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.transfer_date}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}
                        >
                          <cfg.Icon size={10} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          {t.status === 'draft' && (
                            <button
                              title="Submit for approval"
                              onClick={() => handleSubmit(t.id)}
                              disabled={isPending}
                              className="px-3 py-1 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            >
                              Submit
                            </button>
                          )}
                          {t.status === 'pending' && (
                            <>
                              <button
                                title="Approve transfer"
                                onClick={() => openModal('approve', t.id)}
                                disabled={isPending}
                                className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                title="Reject transfer"
                                onClick={() => openModal('reject', t.id)}
                                disabled={isPending}
                                className="px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {t.status === 'approved' && (
                            <button
                              title="Post to GL"
                              onClick={() => handlePost(t.id)}
                              disabled={isPending}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              Post to GL
                            </button>
                          )}
                          {(t.status === 'rejected' || t.status === 'posted') && (
                            <span className="text-xs text-gray-400">—</span>
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

      {/* Approve / Reject modal */}
      {modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {modalAction === 'approve' ? 'Approve Transfer' : 'Reject Transfer'}
            </h2>

            {actionError && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">
              {modalAction === 'approve' ? 'Approval Notes (optional)' : 'Rejection Reason *'}
            </label>
            <textarea
              title={modalAction === 'approve' ? 'Approval notes' : 'Rejection reason'}
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              placeholder={
                modalAction === 'approve' ? 'Any notes…' : 'State the reason for rejection…'
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                title="Cancel"
                onClick={closeModal}
                disabled={isPending}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                title="Confirm action"
                onClick={handleModalConfirm}
                disabled={isPending}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-colors ${
                  modalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {isPending ? 'Processing…' : modalAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashTransferListPage;
