// src/pages/accounting/JournalVoucherListPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
  Calendar,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { JournalVoucherListItem, JournalVoucherFilters } from '../../services/journalVoucherService';
import { useJournalVouchers } from '../../hooks/useJournalVouchers';
import { useToast } from '../../hooks/useToast';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ jv: JournalVoucherListItem }> = ({ jv }) => {
  if (jv.is_reversed)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <RotateCcw size={10} /> Reversed
      </span>
    );
  if (jv.is_reversal)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        <RotateCcw size={10} /> Reversal
      </span>
    );
  if (jv.approved)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle size={10} /> Posted
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <XCircle size={10} /> Pending
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

const JournalVoucherListPage: React.FC = () => {
  const navigate = useNavigate();
  const { error: showError } = useToast();

  const [filters, setFilters] = useState<JournalVoucherFilters>({
    ordering: '-date',
    show_reversed: false,
    page: 1,
    page_size: 20,
  });
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading: loading, refetch: loadVouchers } = useJournalVouchers(filters);
  const vouchers = data?.results ?? [];
  const pagination = { count: data?.count ?? 0, currentPage: filters.page ?? 1 };

  const handleSearch = () => {
    setFilters(f => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  const handleFilterChange = (key: keyof JournalVoucherFilters, value: unknown) => {
    setFilters(f => ({ ...f, [key]: value, page: 1 }));
  };

  const totalPages = Math.ceil(pagination.count / (filters.page_size ?? 20));

  // Quick-filter tab helpers
  const pendingCount = vouchers.filter(v => !v.approved && !v.is_reversed).length;
  const activeQuickFilter =
    filters.approved === undefined ? 'all' : filters.approved ? 'posted' : 'pending';
  const setQuickFilter = (tab: 'all' | 'pending' | 'posted') => {
    const approved = tab === 'all' ? undefined : tab === 'posted';
    setFilters(f => ({ ...f, approved, page: 1 }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="text-blue-600" size={24} />
              Journal Vouchers
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Create and manage general ledger journal entries
            </p>
          </div>
          <button
            onClick={() => navigate('/accounting/journal-vouchers/create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            New Journal Voucher
          </button>
        </div>

        {/* Quick-filter tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-1">
          {(
            [
              { key: 'all', label: 'All Vouchers' },
              { key: 'pending', label: 'Pending Approval', highlight: pendingCount > 0 },
              { key: 'posted', label: 'Posted' },
            ] as const
          ).map(tab => (
            <button
              key={tab.key}
              onClick={() => setQuickFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeQuickFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.key === 'pending' && pendingCount > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-xs font-bold px-1 ${
                    activeQuickFilter === 'pending'
                      ? 'bg-white text-blue-700'
                      : 'bg-yellow-400 text-yellow-900'
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* Search & Filter Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search reference, description…"
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
              <Filter size={15} />
              Filters
            </button>
            <button
              onClick={loadVouchers}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={filters.date_from ?? ''}
                  onChange={e => handleFilterChange('date_from', e.target.value || undefined)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={filters.date_to ?? ''}
                  onChange={e => handleFilterChange('date_to', e.target.value || undefined)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={
                    filters.approved === undefined ? 'all' : filters.approved ? 'posted' : 'pending'
                  }
                  onChange={e => {
                    const v = e.target.value;
                    handleFilterChange('approved', v === 'all' ? undefined : v === 'posted');
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="posted">Posted</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Include Reversed
                </label>
                <select
                  value={filters.show_reversed ? 'yes' : 'no'}
                  onChange={e => handleFilterChange('show_reversed', e.target.value === 'yes')}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{pagination.count}</span> vouchers found
          {filters.search && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs">
              "{filters.search}"
              <button
                onClick={() => {
                  setSearchInput('');
                  setFilters(f => ({ ...f, search: undefined, page: 1 }));
                }}
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
          ) : vouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText size={40} className="mb-3 opacity-40" />
              <p className="font-medium">No journal vouchers found</p>
              <p className="text-sm mt-1">Create one to get started</p>
              <button
                onClick={() => navigate('/accounting/journal-vouchers/create')}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} /> New Journal Voucher
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Series</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Debits</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Credits</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vouchers.map(jv => (
                  <tr
                    key={jv.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      jv.is_reversed ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">
                      {jv.reference_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-gray-400" />
                        {new Date(jv.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {jv.description}
                      {jv.workflow_reference && (
                        <span className="ml-2 text-xs text-gray-400">
                          [{jv.workflow_reference}]
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">
                        {jv.series.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {Number(jv.total_debits).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {Number(jv.total_credits).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge jv={jv} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => navigate(`/accounting/journal-vouchers/${jv.id}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                        title="View details"
                      >
                        <Eye size={13} /> View
                      </button>
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
    </div>
  );
};

export default JournalVoucherListPage;
