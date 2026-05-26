import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Eye,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  discountService,
  AppliedDiscount,
  AppliedDiscountListParams,
} from '../../services/discountService';
import { useToast } from '../../hooks/useToast';

const AppliedDiscountsList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [appliedDiscounts, setAppliedDiscounts] = useState<AppliedDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<AppliedDiscountListParams>({});
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });

  const fetchAppliedDiscounts = async (params?: AppliedDiscountListParams) => {
    try {
      setLoading(true);
      const response = await discountService.getAppliedDiscounts(params);
      setAppliedDiscounts(response.results);
      setPagination({
        count: response.count,
        next: response.next,
        previous: response.previous,
        currentPage: params?.page || 1,
      });
    } catch (error) {
      toast.error('Failed to fetch applied discounts');
      console.error('Error fetching applied discounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppliedDiscounts({ ...filters, search: searchTerm });
  }, [filters, searchTerm]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (key: keyof AppliedDiscountListParams, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const getStatusBadge = (discount: AppliedDiscount) => {
    if (discount.is_reversed) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Reversed
        </span>
      );
    }

    if (discount.is_posted) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Posted
        </span>
      );
    }

    return (
      <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const calculateSummary = () => {
    const totalAmount = appliedDiscounts.reduce(
      (sum, discount) => sum + parseFloat(discount.discount_amount),
      0
    );
    const postedAmount = appliedDiscounts
      .filter(d => d.is_posted && !d.is_reversed)
      .reduce((sum, discount) => sum + parseFloat(discount.discount_amount), 0);
    const pendingAmount = appliedDiscounts
      .filter(d => !d.is_posted && !d.is_reversed)
      .reduce((sum, discount) => sum + parseFloat(discount.discount_amount), 0);
    const reversedAmount = appliedDiscounts
      .filter(d => d.is_reversed)
      .reduce((sum, discount) => sum + parseFloat(discount.discount_amount), 0);

    return { totalAmount, postedAmount, pendingAmount, reversedAmount };
  };

  const summary = calculateSummary();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applied Discounts</h1>
          <p className="text-gray-600">View all applied discounts and their accounting status</p>
        </div>
        <button
          onClick={() => fetchAppliedDiscounts({ ...filters, search: searchTerm })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Discounts</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(summary.totalAmount.toString())}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{appliedDiscounts.length} total applications</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Posted</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.postedAmount.toString())}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {appliedDiscounts.filter(d => d.is_posted && !d.is_reversed).length} posted
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(summary.pendingAmount.toString())}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {appliedDiscounts.filter(d => !d.is_posted && !d.is_reversed).length} pending
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Reversed</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.reversedAmount.toString())}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {appliedDiscounts.filter(d => d.is_reversed).length} reversed
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search applied discounts..."
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={filters.is_posted?.toString() || ''}
              onChange={e =>
                handleFilterChange(
                  'is_posted',
                  e.target.value ? e.target.value === 'true' : undefined
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="true">Posted</option>
              <option value="false">Pending</option>
            </select>

            <select
              value={filters.is_reversed?.toString() || ''}
              onChange={e =>
                handleFilterChange(
                  'is_reversed',
                  e.target.value ? e.target.value === 'true' : undefined
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Reversals</option>
              <option value="false">Active</option>
              <option value="true">Reversed</option>
            </select>

            <select
              value={filters.application || ''}
              onChange={e =>
                handleFilterChange(
                  'application',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Applications</option>
              {/* In real app, fetch applications from API */}
              <option value="1">APP-2026-001</option>
              <option value="2">APP-2026-002</option>
              <option value="3">APP-2026-003</option>
            </select>

            <select
              value={filters.receivable || ''}
              onChange={e =>
                handleFilterChange(
                  'receivable',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Receivables</option>
              {/* In real app, fetch receivables from API */}
              <option value="1">INV-2026-001</option>
              <option value="2">INV-2026-002</option>
              <option value="3">ENT-2026-001</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applied Discounts List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {appliedDiscounts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <TrendingUp className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applied discounts found</h3>
            <p className="text-gray-600 mb-4">
              Applied discounts will appear here once discount applications are approved and applied
              to receivables.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receivable
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Discount Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Posted Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reversal Info
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appliedDiscounts.map(discount => (
                  <tr key={discount.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {discount.application_detail?.application_number ||
                            `App #${discount.application}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {discount.application_detail?.program_detail?.name || 'Program details'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {discount.receivable_details?.client_name ||
                            `Receivable #${discount.receivable}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          Balance:{' '}
                          {discount.receivable_details?.balance
                            ? formatCurrency(discount.receivable_details.balance.toString())
                            : 'N/A'}{' '}
                          | Status: {discount.receivable_details?.status || 'Unknown'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        {formatCurrency(discount.discount_amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(discount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {discount.is_posted ? (
                        <div>
                          <div className="text-sm text-gray-900">{discount.posted_by_name}</div>
                          {discount.posted_at && (
                            <div className="text-xs text-gray-500">
                              {new Date(discount.posted_at).toLocaleDateString()}
                            </div>
                          )}
                          {discount.journal_entry && (
                            <div className="text-xs text-blue-600">
                              JE #{discount.journal_entry}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Not posted</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {discount.is_reversed ? (
                        <div>
                          <div className="text-sm text-gray-900">{discount.reversed_by_name}</div>
                          {discount.reversed_at && (
                            <div className="text-xs text-gray-500">
                              {new Date(discount.reversed_at).toLocaleDateString()}
                            </div>
                          )}
                          {discount.reversal_reason && (
                            <div className="text-xs text-red-600 max-w-xs truncate">
                              {discount.reversal_reason}
                            </div>
                          )}
                          {discount.reversal_entry && (
                            <div className="text-xs text-red-600">
                              Reversal JE #{discount.reversal_entry}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Not reversed</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            navigate(`/discounts/applications/${discount.application}`)
                          }
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="View Application"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {discount.journal_entry && (
                          <button
                            onClick={() =>
                              navigate(`/accounting/journal-entries/${discount.journal_entry}`)
                            }
                            className="text-green-600 hover:text-green-900 p-1"
                            title="View Journal Entry"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        {discount.reversal_entry && (
                          <button
                            onClick={() =>
                              navigate(`/accounting/journal-entries/${discount.reversal_entry}`)
                            }
                            className="text-red-600 hover:text-red-900 p-1"
                            title="View Reversal Entry"
                          >
                            <RefreshCw className="h-4 w-4" />
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

      {/* Pagination */}
      {pagination.count > 0 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow-sm">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.previous}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.next}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page <span className="font-medium">{pagination.currentPage}</span> of{' '}
                <span className="font-medium">{Math.ceil(pagination.count / 20)}</span> (
                {pagination.count} total discounts)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.previous}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.next}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppliedDiscountsList;
