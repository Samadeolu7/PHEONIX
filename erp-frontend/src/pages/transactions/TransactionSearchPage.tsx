// src/pages/transactions/TransactionSearchPage.tsx
// Dedicated page for finding a GL transaction by reference number or
// description (e.g. "SVWDR-20260911-0125") — replaces the navbar's inline
// expanding search popover, which crowded out the rest of the nav.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Calendar,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  XCircle,
  RotateCcw,
  Eye,
} from 'lucide-react';
import {
  JournalVoucherListItem,
  JournalVoucherFilters,
} from '../../services/journalVoucherService';
import { useJournalVouchers } from '../../hooks/useJournalVouchers';

const StatusBadge: React.FC<{ jv: JournalVoucherListItem }> = ({ jv }) => {
  if (jv.is_reversed)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <RotateCcw size={10} /> Reversed
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

const TransactionSearchPage: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<JournalVoucherFilters>({
    ordering: '-date',
    show_reversed: true,
    page: 1,
    page_size: 20,
  });
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading: loading, refetch } = useJournalVouchers(filters);
  const transactions = data?.results ?? [];
  const count = data?.count ?? 0;
  const currentPage = filters.page ?? 1;
  const totalPages = Math.ceil(count / (filters.page_size ?? 20));

  const handleSearch = () => {
    setFilters(f => ({ ...f, search: searchInput.trim() || undefined, page: 1 }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="text-blue-600" size={24} />
            Transaction Search
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Find any posted transaction by reference number or description — e.g.
            SVWDR-20260911-0125
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {/* Search Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                autoFocus
                placeholder="Search by reference number or description…"
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
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{count}</span> transactions found
          {filters.search && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs">
              &quot;{filters.search}&quot;
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

        {/* Results */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" />
              Searching…
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Search size={40} className="mb-3 opacity-40" />
              <p className="font-medium">
                {filters.search
                  ? `No transactions found for "${filters.search}"`
                  : 'Search for a transaction'}
              </p>
              <p className="text-sm mt-1">Try a reference number, e.g. SVWDR-20260911-0125</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(txn => (
                  <tr
                    key={txn.id}
                    onClick={() => navigate(`/transactions/${txn.id}`)}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                      txn.is_reversed ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 font-medium">
                      {txn.reference_number}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-gray-400" />
                        {new Date(txn.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-md truncate">{txn.description}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge jv={txn} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/transactions/${txn.id}`);
                        }}
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
              Page {currentPage} of {totalPages} ({count} records)
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="p-1.5 border border-gray-200 rounded text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={currentPage >= totalPages}
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

export default TransactionSearchPage;
