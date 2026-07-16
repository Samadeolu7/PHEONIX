/**
 * Bank Transfer List Page (BNK-01)
 * Full history of all bank transfers with status filters, search, and approval actions.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle, XCircle, Clock, ArrowRightLeft, Search, RefreshCw, Trash2 } from 'lucide-react';
import {
  useBankTransfers,
  useSubmitBankTransfer,
  useDeleteBankTransfer,
  useApproveBankTransfer,
  useRejectBankTransfer,
} from '../../hooks/useBanks';
import type { BankTransfer, TransferFilters } from '../../types/banks';
import TransactionEntriesModal from '../../components/ledger/TransactionEntriesModal';

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-200 text-red-800',
};

const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    typeof value === 'string' ? parseFloat(value) : value
  );

const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ─── Component ──────────────────────────────────────────────────────────────

const BankTransferListPage: React.FC = () => {
  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal state for rejection
  const [rejectModal, setRejectModal] = useState<{ open: boolean; transferId: number | null }>({
    open: false,
    transferId: null,
  });
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [entriesModalTxnId, setEntriesModalTxnId] = useState<number | null>(null);

  // Build filters for the query
  const filters: TransferFilters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(fromDate ? { from_date: fromDate } : {}),
    ...(toDate ? { to_date: toDate } : {}),
    ...(search ? { search } : {}),
  };

  const { data: transfers = [], isLoading, isFetching, refetch } = useBankTransfers(filters);

  const submitMutation = useSubmitBankTransfer();
  const deleteMutation = useDeleteBankTransfer();
  const approveMutation = useApproveBankTransfer();
  const rejectMutation = useRejectBankTransfer();

  // Quick stats
  const pendingCount = transfers.filter(t => t.status === 'pending').length;
  const draftCount = transfers.filter(t => t.status === 'draft').length;
  const completedCount = transfers.filter(t => t.status === 'completed').length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSubmit = async (transfer: BankTransfer) => {
    setActionError(null);
    try {
      await submitMutation.mutateAsync(transfer.id);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(e?.details?.error || (err instanceof Error ? err.message : 'Submit failed'));
    }
  };

  const handleDelete = async (transfer: BankTransfer) => {
    if (!window.confirm(`Delete transfer ${transfer.transfer_number}? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(transfer.id);
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(e?.details?.error || (err instanceof Error ? err.message : 'Delete failed'));
    }
  };

  const handleApprove = async (transfer: BankTransfer) => {
    setActionError(null);
    try {
      await approveMutation.mutateAsync({ id: transfer.id });
    } catch (err: unknown) {
      const e = err as {
        details?: { error?: string; non_field_errors?: string[] };
        message?: string;
      };
      setActionError(
        e?.details?.error ||
          e?.details?.non_field_errors?.join(' ') ||
          (err instanceof Error ? err.message : 'Approval failed')
      );
    }
  };

  const openRejectModal = (transferId: number) => {
    setRejectReason('');
    setActionError(null);
    setRejectModal({ open: true, transferId });
  };

  const handleRejectSubmit = async () => {
    if (!rejectModal.transferId || !rejectReason.trim()) return;
    setActionError(null);
    try {
      await rejectMutation.mutateAsync({ id: rejectModal.transferId, reason: rejectReason });
      setRejectModal({ open: false, transferId: null });
      setRejectReason('');
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(
        e?.details?.error || (err instanceof Error ? err.message : 'Rejection failed')
      );
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
  };

  const hasFilters = !!(search || statusFilter || fromDate || toDate);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Transfers</h1>
          <p className="text-sm text-gray-500 mt-1">
            All inter-account and cashier-to-bank transfers
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Refreshing…
            </span>
          )}
          <Link
            to="/banks/transfers/approvals"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Clock className="h-4 w-4" />
            Approvals{pendingCount > 0 && ` (${pendingCount})`}
          </Link>
          <Link
            to="/banks/transfers/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="h-4 w-4" />
            New Transfer
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-yellow-50 rounded-lg">
            <Clock className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Pending Approval</p>
            <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-gray-50 rounded-lg">
            <ArrowRightLeft className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Drafts</p>
            <p className="text-2xl font-bold text-gray-700">{draftCount}</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-green-700">{completedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by number, reference, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search transfers"
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status filter */}
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

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              aria-label="From date"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              aria-label="To date"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear
            </button>
          )}

          <button
            onClick={() => refetch()}
            className="ml-auto p-2 text-gray-500 hover:text-gray-700"
            aria-label="Refresh"
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
                    {/* Transfer Number */}
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {transfer.transfer_number}
                      {transfer.reference_number && (
                        <div className="text-xs text-gray-400">{transfer.reference_number}</div>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(transfer.transfer_date)}
                    </td>

                    {/* From */}
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                      {transfer.source_display ||
                        transfer.source_cashier_name ||
                        transfer.source_bank_account_number ||
                        '—'}
                    </td>

                    {/* To */}
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                      {transfer.destination_display ||
                        transfer.destination_bank_account_number ||
                        transfer.destination_cashier_name ||
                        '—'}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(transfer.amount)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[transfer.status]}`}
                      >
                        {STATUS_LABEL[transfer.status]}
                      </span>
                    </td>

                    {/* Initiated By */}
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {transfer.initiated_by_name || `#${transfer.initiated_by}`}
                      <div className="text-gray-400">{formatDate(transfer.initiated_at)}</div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Submit for approval (draft) */}
                        {transfer.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleSubmit(transfer)}
                              disabled={submitMutation.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => handleDelete(transfer)}
                              disabled={deleteMutation.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                              title="Delete draft"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}

                        {/* Approve / Reject (pending, approver only). Gated solely by the
                            server-computed transfer.can_approve (mirrors approve()'s actual
                            permission branches exactly) — no rank-based fallback. A director
                            without an explicit RolePermissionPolicy grant should not see this.
                            Cashier-to-cashier transfers can be approved by the destination
                            cashier OR a director (business decision: senior staff can hold a
                            cashier float too, so requiring the literal destination cashier —
                            who may be junior — to be the only approver was unworkable). */}
                        {transfer.status === 'pending' && transfer.can_approve && (
                          <>
                            <button
                              onClick={() => handleApprove(transfer)}
                              disabled={approveMutation.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              onClick={() => openRejectModal(transfer.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}

                        {/* Completed / approved — view GL entries (both legs, linked to their ledgers) */}
                        {(transfer.status === 'completed' || transfer.status === 'approved') &&
                          transfer.journal_entry &&
                          transfer.journal_entry_reference && (
                            <button
                              onClick={() => setEntriesModalTxnId(transfer.journal_entry!)}
                              className="text-xs text-blue-600 hover:underline font-mono"
                              title="View debit/credit entries"
                            >
                              GL: {transfer.journal_entry_reference}
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

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold text-gray-900">Reject Transfer</h2>
              <button
                aria-label="Close"
                onClick={() => setRejectModal({ open: false, transferId: null })}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="text-sm text-red-600 bg-red-50 rounded p-2">{actionError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this transfer is being rejected…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setRejectModal({ open: false, transferId: null })}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL Entries Modal */}
      {entriesModalTxnId != null && (
        <TransactionEntriesModal
          transactionId={entriesModalTxnId}
          onClose={() => setEntriesModalTxnId(null)}
        />
      )}
    </div>
  );
};

export default BankTransferListPage;
