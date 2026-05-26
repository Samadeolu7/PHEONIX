// src/pages/sales/StandaloneCreditNotesList.tsx
// Global credit notes list – accessible without being nested under a specific invoice
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
  CreditCard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { creditNoteService, StandaloneCreditNoteFilters } from '../../services/creditNoteService';
import { CreditNote } from '../../services/invoiceService';
import { useToast } from '../../hooks/useToast';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: CreditNote['status'] }> = ({ status }) => {
  const map: Record<CreditNote['status'], { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
    issued: { label: 'Issued', cls: 'bg-blue-100 text-blue-700' },
    applied: { label: 'Applied', cls: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? map.draft;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
};

// ─── Action Modal ─────────────────────────────────────────────────────────────

interface ActionModalProps {
  type: 'apply' | 'cancel';
  creditNote: CreditNote;
  onConfirm: (data: { notes?: string; cancellation_reason?: string }) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

const ActionModal: React.FC<ActionModalProps> = ({
  type,
  creditNote,
  onConfirm,
  onClose,
  loading,
}) => {
  const [notes, setNotes] = useState('');
  const isApply = type === 'apply';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {isApply ? 'Apply Credit Note' : 'Cancel Credit Note'}
        </h3>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-mono text-blue-600">{creditNote.credit_note_number}</span>
          {' — '}
          {creditNote.client?.name}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Amount:{' '}
          <strong>
            {Number(creditNote.total_amount).toLocaleString('en-NG', {
              minimumFractionDigits: 2,
            })}
          </strong>
        </p>
        {isApply ? (
          <div className="mb-4">
            <p className="text-xs text-gray-500 bg-blue-50 rounded p-2 mb-3">
              Applying this credit note will create a GL journal entry:
              <br />
              <span className="font-semibold">DR</span> Sales Returns &amp; Allowances |{' '}
              <span className="font-semibold">CR</span> Accounts Receivable
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for this application…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for cancelling this credit note…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(isApply ? { notes } : { cancellation_reason: notes })}
            disabled={loading || (!isApply && !notes.trim())}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              isApply ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? 'Processing…' : isApply ? 'Apply Credit' : 'Cancel Credit Note'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StandaloneCreditNotesList: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ count: 0, currentPage: 1 });
  const [filters, setFilters] = useState<StandaloneCreditNoteFilters>({
    ordering: '-created_at',
    page: 1,
    page_size: 20,
  });
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [actionModal, setActionModal] = useState<{
    type: 'apply' | 'cancel';
    creditNote: CreditNote;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadCreditNotes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await creditNoteService.getCreditNotes(filters);
      setCreditNotes(data.results);
      setPagination({ count: data.count, currentPage: filters.page ?? 1 });
    } catch (err) {
      console.error(err);
      showError('Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  }, [filters, showError]);

  useEffect(() => {
    loadCreditNotes();
  }, [loadCreditNotes]);

  const handleSearch = () => setFilters(f => ({ ...f, search: searchInput || undefined, page: 1 }));

  const handleAction = async (data: { notes?: string; cancellation_reason?: string }) => {
    if (!actionModal) return;
    try {
      setActionLoading(true);
      if (actionModal.type === 'apply') {
        await creditNoteService.applyCreditNote(actionModal.creditNote.id, data.notes);
        success(
          `Credit note ${actionModal.creditNote.credit_note_number} applied — GL entry created`
        );
      } else {
        await creditNoteService.cancelCreditNote(
          actionModal.creditNote.id,
          data.cancellation_reason!
        );
        success(`Credit note ${actionModal.creditNote.credit_note_number} cancelled`);
      }
      setActionModal(null);
      loadCreditNotes();
    } catch (err) {
      console.error(err);
      showError(`Failed to ${actionModal.type} credit note`);
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(pagination.count / (filters.page_size ?? 20));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="text-blue-600" size={24} />
              Credit Notes
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              All credit notes across invoices — view, apply, and manage
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Search & Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search credit note number, client, reason…"
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
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm transition-colors ${
                showFilters
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter size={15} /> Filters
            </button>
            <button
              onClick={loadCreditNotes}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={filters.status ?? ''}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      status: (e.target.value as CreditNote['status']) || undefined,
                      page: 1,
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                  <option value="applied">Applied</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Applied to Account
                </label>
                <select
                  value={
                    filters.applied_to_account === undefined
                      ? ''
                      : filters.applied_to_account
                        ? 'yes'
                        : 'no'
                  }
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      applied_to_account:
                        e.target.value === '' ? undefined : e.target.value === 'yes',
                      page: 1,
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="yes">Applied</option>
                  <option value="no">Not Applied</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={filters.issue_date ?? ''}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      issue_date: e.target.value || undefined,
                      page: 1,
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{pagination.count}</span> credit notes
          {filters.status && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs">
              {filters.status}
              <button
                onClick={() => setFilters(f => ({ ...f, status: undefined, page: 1 }))}
                className="ml-1 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Loading…
            </div>
          ) : creditNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CreditCard size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No credit notes found</p>
              <p className="text-sm mt-1">Credit notes are created from within an invoice</p>
              <button
                onClick={() => navigate('/sales/invoices')}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                <FileText size={14} /> Go to Invoices
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    CN #
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Client
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Invoice
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Reason
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Amount
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Status
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    GL Posted
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 text-xs uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {creditNotes.map(cn => (
                  <tr
                    key={cn.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      cn.status === 'cancelled' ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium whitespace-nowrap">
                      {cn.credit_note_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{cn.client?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/sales/invoices/${cn.original_invoice.id}/view`)}
                        className="text-xs font-mono text-blue-500 hover:text-blue-700 underline"
                      >
                        {cn.original_invoice.invoice_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-1 text-gray-700">
                        <Calendar size={12} className="text-gray-400" />
                        {new Date(cn.issue_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate text-xs">
                      {cn.reason}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {Number(cn.total_amount).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={cn.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {cn.applied_to_account ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle size={12} /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                          <XCircle size={12} /> No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() =>
                            navigate(
                              `/sales/invoices/${cn.original_invoice.id}/credit-notes/${cn.id}/view`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                          title="View"
                        >
                          <Eye size={11} /> View
                        </button>
                        {cn.status === 'issued' && !cn.applied_to_account && (
                          <button
                            onClick={() => setActionModal({ type: 'apply', creditNote: cn })}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded text-xs hover:bg-green-100 transition-colors"
                            title="Apply to GL"
                          >
                            <CheckCircle size={11} /> Apply
                          </button>
                        )}
                        {(cn.status === 'draft' || cn.status === 'issued') &&
                          !cn.applied_to_account && (
                            <button
                              onClick={() => setActionModal({ type: 'cancel', creditNote: cn })}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded text-xs hover:bg-red-100 transition-colors"
                              title="Cancel"
                            >
                              <RotateCcw size={11} /> Cancel
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
            <span className="text-sm text-gray-500">
              Page {pagination.currentPage} of {totalPages} ({pagination.count} records)
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.currentPage <= 1}
                onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={pagination.currentPage >= totalPages}
                onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action modal */}
      {actionModal && (
        <ActionModal
          type={actionModal.type}
          creditNote={actionModal.creditNote}
          onConfirm={handleAction}
          onClose={() => setActionModal(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default StandaloneCreditNotesList;
