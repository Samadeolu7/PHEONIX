/**
 * Petty Cash Voucher List Page
 * View and manage all petty cash vouchers with filters
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const safeDate = (val: string | null | undefined, fmt: string) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : format(d, fmt);
};
import {
  FileTextIcon,
  PlusCircleIcon,
  SearchIcon,
  FilterIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  BanknoteIcon,
} from 'lucide-react';
import { usePettyCashVouchers, usePettyCashFunds } from '../../hooks/usePettyCash';
import { PettyCashVoucherFilters } from '../../types/pettyCash';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  disbursed: 'bg-blue-100 text-blue-800',
  retired: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STATUS_ICONS = {
  draft: ClockIcon,
  pending: ClockIcon,
  approved: CheckCircle2Icon,
  rejected: XCircleIcon,
  disbursed: BanknoteIcon,
  retired: CheckCircle2Icon,
  cancelled: XCircleIcon,
};

export const PettyCashVoucherList: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<PettyCashVoucherFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch data
  const { data: vouchers = [], isLoading } = usePettyCashVouchers(filters);
  const { data: funds = [] } = usePettyCashFunds({ is_active: true });

  // Filter vouchers by search term
  const filteredVouchers = vouchers.filter(
    voucher =>
      voucher.voucher_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (voucher.purpose ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (voucher.payee_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFilterChange = (key: keyof PettyCashVoucherFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileTextIcon className="h-8 w-8" />
            Petty Cash Vouchers
          </h1>
          <p className="text-gray-600 mt-1">{filteredVouchers.length} vouchers found</p>
        </div>
        <button
          onClick={() => navigate('/treasury/petty-cash/vouchers/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusCircleIcon className="h-5 w-5" />
          New Voucher
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search vouchers..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${
              activeFiltersCount > 0
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <FilterIcon className="h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status || ''}
                onChange={e => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="disbursed">Disbursed</option>
                <option value="retired">Retired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fund</label>
              <select
                value={filters.fund || ''}
                onChange={e => handleFilterChange('fund', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Funds</option>
                {funds.map(fund => (
                  <option key={fund.id} value={fund.id}>
                    {fund.fund_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.request_date_from || ''}
                onChange={e => handleFilterChange('request_date_from', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={filters.request_date_to || ''}
                onChange={e => handleFilterChange('request_date_to', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vouchers List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredVouchers.length === 0 ? (
          <div className="text-center py-12">
            <FileTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {searchTerm || activeFiltersCount > 0
                ? 'No vouchers match your search'
                : 'No petty cash vouchers yet'}
            </p>
            {!searchTerm && activeFiltersCount === 0 && (
              <button
                onClick={() => navigate('/treasury/petty-cash/vouchers/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Your First Voucher
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voucher #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fund
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredVouchers.map(voucher => {
                  const StatusIcon = STATUS_ICONS[voucher.status as keyof typeof STATUS_ICONS];
                  return (
                    <tr
                      key={voucher.id}
                      onClick={() => navigate(`/treasury/petty-cash/vouchers/${voucher.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-blue-600">{voucher.voucher_number}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{voucher.fund_name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{voucher.payee_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900 line-clamp-2">
                          {voucher.purpose}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">
                          ₦{parseFloat(voucher.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {safeDate(voucher.voucher_date, 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                            STATUS_COLORS[voucher.status as keyof typeof STATUS_COLORS]
                          }`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
