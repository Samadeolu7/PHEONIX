/**
 * Inter-Branch Transfer List Page
 * Two linked, single-branch JVs per transfer, posted through Due-from/Due-to
 * clearing accounts — see interbranch.services.create_interbranch_transfer
 * on the backend. Creation and reversal are restricted to elevated
 * ("All Branches") users; branch staff see only transfers touching their
 * own branch (enforced server-side by InterBranchTransferViewSet.get_queryset()).
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRightLeft, RotateCcw, Search, RefreshCw } from 'lucide-react';
import { useInterbranchTransfers, useReverseInterbranchTransfer } from '../../hooks/useInterbranch';
import { usePermission } from '../../hooks/usePermissions';
import type { InterBranchTransfer, InterBranchTransferFilters } from '../../types/interbranch';

const STATUS_LABEL: Record<InterBranchTransfer['status'], string> = {
  posted: 'Posted',
  reversed: 'Reversed',
};

const STATUS_BADGE: Record<InterBranchTransfer['status'], string> = {
  posted: 'bg-green-100 text-green-700',
  reversed: 'bg-gray-100 text-gray-600',
};

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    typeof value === 'string' ? parseFloat(value) : value
  );

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const InterbranchTransferListPage: React.FC = () => {
  const { isElevated } = usePermission();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [reverseModal, setReverseModal] = useState<{ open: boolean; transferId: number | null }>({
    open: false,
    transferId: null,
  });
  const [reverseReason, setReverseReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const filters: InterBranchTransferFilters = {
    ...(statusFilter ? { status: statusFilter as InterBranchTransfer['status'] } : {}),
    ...(search ? { search } : {}),
  };

  const { data: transfers = [], isLoading, isFetching, refetch } = useInterbranchTransfers(filters);
  const reverseMutation = useReverseInterbranchTransfer();

  const postedCount = transfers.filter(t => t.status === 'posted').length;
  const reversedCount = transfers.filter(t => t.status === 'reversed').length;

  const openReverseModal = (transferId: number) => {
    setReverseReason('');
    setActionError(null);
    setReverseModal({ open: true, transferId });
  };

  const handleReverseSubmit = async () => {
    if (!reverseModal.transferId || !reverseReason.trim()) return;
    setActionError(null);
    try {
      await reverseMutation.mutateAsync({ id: reverseModal.transferId, reason: reverseReason });
      setReverseModal({ open: false, transferId: null });
      setReverseReason('');
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(e?.details?.error || (err instanceof Error ? err.message : 'Reversal failed'));
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
  };
  const hasFilters = !!(search || statusFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inter-Branch Transfers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Funds moved between branches — each side posts a balanced JV via a Due-from/Due-to
            clearing account
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing…
            </span>
          )}
          {isElevated && (
            <Link
              to="/accounting/interbranch-transfers/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Plus className="h-4 w-4" />
              New Transfer
            </Link>
          )}
        </div>
      </div>

      {!isElevated && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
          Showing transfers involving your branch. Only users with All-Branches access can initiate
          or reverse an inter-branch transfer.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <ArrowRightLeft className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Posted</p>
            <p className="text-2xl font-bold text-green-700">{postedCount}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-gray-50 rounded-lg">
            <RotateCcw className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Reversed</p>
            <p className="text-2xl font-bold text-gray-700">{reversedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by transfer number, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search transfers"
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
              Clear filters
            </button>
          )}

          <button
            onClick={() => refetch()}
            aria-label="Refresh"
            className="ml-auto p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading transfers…</div>
        ) : transfers.length === 0 ? (
          <div className="p-8 text-center">
            <ArrowRightLeft className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {hasFilters ? 'No transfers match the current filters.' : 'No transfers yet.'}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-sm text-blue-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Transfer #</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">From</th>
                  <th className="px-4 py-3 text-left">To</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Initiated By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transfers.map(transfer => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {transfer.transfer_number}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(transfer.date)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                      {transfer.from_branch_name}
                      <div className="text-xs text-gray-400">{transfer.from_account_name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                      {transfer.to_branch_name}
                      <div className="text-xs text-gray-400">{transfer.to_account_name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(transfer.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[transfer.status]}`}
                      >
                        {STATUS_LABEL[transfer.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {transfer.initiated_by_name ||
                        (transfer.initiated_by ? `#${transfer.initiated_by}` : '—')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isElevated && transfer.status === 'posted' && (
                        <button
                          onClick={() => openReverseModal(transfer.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reverse
                        </button>
                      )}
                      {transfer.status === 'reversed' && transfer.reversal_reason && (
                        <span className="text-xs text-gray-400" title={transfer.reversal_reason}>
                          {transfer.reversed_at ? formatDate(transfer.reversed_at) : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reverse Modal */}
      {reverseModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">Reverse Transfer</h2>
              <button
                aria-label="Close"
                onClick={() => setReverseModal({ open: false, transferId: null })}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</div>
              )}
              <p className="text-sm text-gray-600">
                This reverses both legs of the transfer — the source and destination branches&apos;
                books are each restored to their pre-transfer balances.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reversal Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this transfer is being reversed…"
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setReverseModal({ open: false, transferId: null })}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReverseSubmit}
                disabled={!reverseReason.trim() || reverseMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {reverseMutation.isPending ? 'Reversing…' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterbranchTransferListPage;
