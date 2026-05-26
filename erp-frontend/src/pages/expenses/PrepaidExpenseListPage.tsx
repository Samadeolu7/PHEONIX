import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Calculator,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { usePrepaidExpenses, useDeletePrepaidExpense } from '../../hooks/usePrepaidExpenses';
import { PrepaidExpenseFilters } from '../../types/prepaidExpense';

const PrepaidExpenseListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PrepaidExpenseFilters>({
    page: 1,
    page_size: 20,
    ordering: '-created_at',
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data: prepaidExpensesData, isLoading, error } = usePrepaidExpenses(filters);
  const deletePrepaidExpense = useDeletePrepaidExpense();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters(prev => ({
      ...prev,
      search: searchTerm,
      page: 1,
    }));
  };

  const handleFilterChange = (key: keyof PrepaidExpenseFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleDelete = async (id: number, referenceName: string) => {
    if (window.confirm(`Are you sure you want to delete prepaid expense "${referenceName}"?`)) {
      try {
        await deletePrepaidExpense.mutateAsync(id);
        alert('Prepaid expense deleted successfully');
      } catch (error) {
        alert('Failed to delete prepaid expense');
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'partially_consumed':
        return <Clock size={16} className="text-yellow-600" />;
      case 'fully_consumed':
        return <XCircle size={16} className="text-gray-600" />;
      case 'expired':
        return <AlertCircle size={16} className="text-red-600" />;
      default:
        return <AlertCircle size={16} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'partially_consumed':
        return 'bg-yellow-100 text-yellow-800';
      case 'fully_consumed':
        return 'bg-gray-100 text-gray-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: string) => {
    return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const calculateProgress = (consumed: string, total: string) => {
    const consumedAmount = parseFloat(consumed);
    const totalAmount = parseFloat(total);
    return totalAmount > 0 ? (consumedAmount / totalAmount) * 100 : 0;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} className="text-red-600" />
            <span className="text-red-800 font-medium">Error loading prepaid expenses</span>
          </div>
          <p className="text-red-700 mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  const prepaidExpenses = prepaidExpensesData?.results || [];
  const totalCount = prepaidExpensesData?.count || 0;
  const totalPages = Math.ceil(totalCount / (filters.page_size || 20));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Prepaid Expenses</h1>
          <p className="text-gray-600">Manage prepaid expenses and track amortization</p>
        </div>
        <button
          onClick={() => navigate('/expenses/prepaid/create')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Create Prepaid Expense
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by reference, description, supplier..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2"
              />
              <button
                type="submit"
                className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
              >
                <Search size={16} />
                Search
              </button>
            </div>
          </form>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="partially_consumed">Partially Consumed</option>
              <option value="fully_consumed">Fully Consumed</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Posted Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Posted</label>
            <select
              value={filters.is_posted?.toString() || ''}
              onChange={e =>
                handleFilterChange(
                  'is_posted',
                  e.target.value ? e.target.value === 'true' : undefined
                )
              }
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Posted</option>
              <option value="false">Not Posted</option>
            </select>
          </div>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setFilters({ page: 1, page_size: 20, ordering: '-created_at' });
              setSearchTerm('');
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <Filter size={16} />
            Clear Filters
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-4">
        <p className="text-gray-600">
          Showing {prepaidExpenses.length} of {totalCount} prepaid expenses
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference & Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {prepaidExpenses.map(expense => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {expense.reference_number}
                      </div>
                      <div className="text-sm text-gray-500">{expense.category_name}</div>
                      {expense.purchase_date && (
                        <div className="text-xs text-gray-400">
                          {new Date(expense.purchase_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {expense.description}
                    </div>
                    {expense.measurable && expense.unit_of_measure && (
                      <div className="text-xs text-gray-500">
                        {expense.remaining_units} {expense.unit_of_measure} remaining
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {formatCurrency(expense.consumed_amount)}
                        </span>
                        <span className="text-gray-900 font-medium">
                          {formatCurrency(expense.total_amount)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${Math.min(calculateProgress(expense.consumed_amount, expense.total_amount), 100)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatCurrency(expense.remaining_amount)} remaining
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(expense.status)}
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(expense.status)}`}
                      >
                        {expense.status.replace('_', ' ')}
                      </span>
                    </div>
                    {expense.is_posted && <div className="text-xs text-green-600 mt-1">Posted</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{expense.supplier_name || 'N/A'}</div>
                    {expense.supplier_invoice && (
                      <div className="text-xs text-gray-500">{expense.supplier_invoice}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/expenses/prepaid/${expense.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/expenses/prepaid/${expense.id}/edit`)}
                        className="text-green-600 hover:text-green-900"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/expenses/prepaid/${expense.id}/amortize`)}
                        className="text-purple-600 hover:text-purple-900"
                        title="Amortize"
                      >
                        <Calculator size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id, expense.reference_number)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                        disabled={deletePrepaidExpense.isPending}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {prepaidExpenses.length === 0 && (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No prepaid expenses found</h3>
            <p className="text-gray-600 mb-4">
              Get started by creating your first prepaid expense.
            </p>
            <button
              onClick={() => navigate('/expenses/prepaid/create')}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              Create Prepaid Expense
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-6">
          <div className="text-sm text-gray-700">
            Page {filters.page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange((filters.page || 1) - 1)}
              disabled={filters.page === 1}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange((filters.page || 1) + 1)}
              disabled={filters.page === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrepaidExpenseListPage;
