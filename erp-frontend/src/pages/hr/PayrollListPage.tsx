// Payroll List Page - List payroll periods with filters and inline actions
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  Edit,
  Trash2,
  Calculator,
  CheckCircle,
  Play,
  Download,
} from 'lucide-react';
import { PayrollStatusBadge } from '../../components/hr/PayrollStatusBadge';
import { PayrollActions } from '../../components/hr/PayrollActions';
import { hrService } from '../../services/hrService';
import { useToast } from '../../hooks/useToast';
import { Payroll, PayrollFilters, PayrollStatus } from '../../types/hr';

const PayrollListPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Filter state (no URL params)
  const [filters, setFilters] = useState<PayrollFilters>({
    search: '',
    status: undefined,
    period_start: '',
    period_end: '',
    page: 1,
    ordering: '-created_at',
  });

  const [showFilters, setShowFilters] = useState(false);

  // React Query for fetching payrolls
  const {
    data: payrolls,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['payrolls', filters],
    queryFn: () => hrService.getPayrolls(filters),
    keepPreviousData: true,
  });

  // Mutations for payroll actions
  const calculateMutation = useMutation({
    mutationFn: (payrollId: number) => hrService.calculatePayroll(payrollId),
    onSuccess: (data, payrollId) => {
      toast.success('Payroll calculated successfully!');
      queryClient.invalidateQueries(['payrolls']);
    },
    onError: () => {
      toast.error('Failed to calculate payroll. Please try again.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (payrollId: number) => hrService.approvePayroll(payrollId),
    onSuccess: (data, payrollId) => {
      toast.success('Payroll approved successfully!');
      queryClient.invalidateQueries(['payrolls']);
    },
    onError: () => {
      toast.error('Failed to approve payroll. Please try again.');
    },
  });

  const processMutation = useMutation({
    mutationFn: (payrollId: number) => hrService.processPayroll(payrollId),
    onSuccess: (data, payrollId) => {
      toast.success('Payroll processed successfully!');
      queryClient.invalidateQueries(['payrolls']);
    },
    onError: () => {
      toast.error('Failed to process payroll. Please try again.');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (payrollId: number) => hrService.markPayrollPaid(payrollId),
    onSuccess: () => {
      toast.success('Payroll marked as paid successfully!');
      queryClient.invalidateQueries(['payrolls']);
    },
    onError: () => {
      toast.error('Failed to mark payroll as paid. Please try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (payrollId: number) => hrService.deletePayroll(payrollId),
    onSuccess: () => {
      toast.success('Payroll deleted successfully!');
      queryClient.invalidateQueries(['payrolls']);
    },
    onError: () => {
      toast.error('Failed to delete payroll. Please try again.');
    },
  });

  const handleFilterChange = (key: keyof PayrollFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handlePayrollAction = async (
    payrollId: number,
    action: 'calculate' | 'approve' | 'process' | 'mark_paid'
  ) => {
    switch (action) {
      case 'calculate':
        calculateMutation.mutate(payrollId);
        break;
      case 'approve':
        approveMutation.mutate(payrollId);
        break;
      case 'process':
        processMutation.mutate(payrollId);
        break;
      case 'mark_paid':
        markPaidMutation.mutate(payrollId);
        break;
    }
  };

  const handleDelete = async (id: number) => {
    const payroll = payrolls?.results.find(p => p.id === id);
    if (!payroll) return;

    if (!window.confirm(`Are you sure you want to delete payroll "${payroll.reference_number}"?`)) {
      return;
    }

    deleteMutation.mutate(id);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      page: 1,
      ordering: '-created_at',
    });
  };

  const formatCurrency = (amount: string | number | null | undefined) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(String(amount || 0)));
  };

  const escapeCsv = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const exportPayrollListCsv = () => {
    if (!payrolls?.results?.length) {
      toast.info('No payroll rows to export for the current filters.');
      return;
    }

    const headers = [
      'Reference',
      'Period Start',
      'Period End',
      'Pay Date',
      'Payslips',
      'Gross Pay',
      'Total Deductions',
      'Staff IOU Deductions',
      'Other Deductions',
      'Net Pay',
      'Status',
    ];

    const rows = payrolls.results.map(payroll => [
      payroll.reference_number,
      payroll.period_start,
      payroll.period_end,
      payroll.pay_date,
      payroll.payslips_count,
      payroll.total_gross_pay,
      payroll.total_deductions,
      payroll.total_staff_iou_deductions ?? '0',
      payroll.total_other_deductions ?? '0',
      payroll.total_net_pay,
      payroll.status ?? '',
    ]);

    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_list_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Payroll list CSV exported.');
  };

  // Get loading state for specific actions
  const getActionLoading = (payrollId: number) => {
    if (calculateMutation.isLoading && calculateMutation.variables === payrollId)
      return 'calculate';
    if (approveMutation.isLoading && approveMutation.variables === payrollId) return 'approve';
    if (processMutation.isLoading && processMutation.variables === payrollId) return 'process';
    if (markPaidMutation.isLoading && markPaidMutation.variables === payrollId) return 'mark_paid';
    return '';
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Payrolls</h2>
          <p className="text-gray-600 mb-4">Failed to load payroll records. Please try again.</p>
          <button
            onClick={() => queryClient.invalidateQueries(['payrolls'])}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
            <p className="text-gray-600">Manage payroll periods, calculations, and processing</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportPayrollListCsv}
              className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </button>
            <Link
              to="/hr/payroll/create"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Payroll
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Payrolls</p>
                <p className="text-xl font-semibold text-gray-900">{payrolls?.count || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Calculator className="h-8 w-8 text-orange-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Draft</p>
                <p className="text-xl font-semibold text-gray-900">
                  {payrolls?.results.filter(p => p.status === PayrollStatus.DRAFT).length || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Approved</p>
                <p className="text-xl font-semibold text-gray-900">
                  {payrolls?.results.filter(p => p.status === PayrollStatus.APPROVED).length || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Processed</p>
                <p className="text-xl font-semibold text-gray-900">
                  {payrolls?.results.filter(p => p.status === PayrollStatus.PAID).length || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search by reference number..."
                    value={filters.search || ''}
                    onChange={e => handleFilterChange('search', e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Quick Status Filters */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleFilterChange('status', PayrollStatus.DRAFT)}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    filters.status === PayrollStatus.DRAFT
                      ? 'bg-orange-100 border-orange-300 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => handleFilterChange('status', PayrollStatus.APPROVED)}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    filters.status === PayrollStatus.APPROVED
                      ? 'bg-green-100 border-green-300 text-green-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  <Filter className="h-4 w-4 mr-1" />
                  Filters
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="p-4 bg-gray-50 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={filters.status || ''}
                    onChange={e => handleFilterChange('status', e.target.value || undefined)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Statuses</option>
                    <option value={PayrollStatus.DRAFT}>Draft</option>
                    <option value={PayrollStatus.CALCULATED}>Calculated</option>
                    <option value={PayrollStatus.APPROVED}>Approved</option>
                    <option value={PayrollStatus.PAID}>Paid</option>
                    <option value={PayrollStatus.CANCELLED}>Cancelled</option>
                  </select>
                </div>

                {/* Period Start */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period Start From
                  </label>
                  <input
                    type="date"
                    value={filters.period_start || ''}
                    onChange={e => handleFilterChange('period_start', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Period End */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period End To
                  </label>
                  <input
                    type="date"
                    value={filters.period_end || ''}
                    onChange={e => handleFilterChange('period_end', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Ordering */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                  <select
                    value={filters.ordering || ''}
                    onChange={e => handleFilterChange('ordering', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="-created_at">Newest First</option>
                    <option value="created_at">Oldest First</option>
                    <option value="-period_start">Period Start (Latest)</option>
                    <option value="period_start">Period Start (Earliest)</option>
                    <option value="-total_net_pay">Net Pay (Highest)</option>
                    <option value="total_net_pay">Net Pay (Lowest)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Payroll Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pay Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payslips
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Net Pay
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff IOU Deductions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Other Deductions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : !payrolls?.results || payrolls.results.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                      No payroll records found
                    </td>
                  </tr>
                ) : (
                  payrolls.results.map(payroll => (
                    <tr key={payroll.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {payroll.reference_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div>{new Date(payroll.period_start).toLocaleDateString()}</div>
                          <div className="text-gray-500">
                            to {new Date(payroll.period_end).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(payroll.pay_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payroll.payslips_count} payslips
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium">{formatCurrency(payroll.total_net_pay)}</div>
                        <div className="text-gray-500 text-xs">
                          Gross: {formatCurrency(payroll.total_gross_pay)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium text-red-700">
                          {formatCurrency(payroll.total_staff_iou_deductions)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-medium text-red-600">
                          {formatCurrency(payroll.total_other_deductions)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PayrollStatusBadge status={payroll.status!} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          {/* Workflow Actions */}
                          <PayrollActions
                            payroll={payroll}
                            onAction={action => handlePayrollAction(payroll.id, action)}
                            loading={getActionLoading(payroll.id)}
                          />

                          {/* Standard Actions */}
                          <Link
                            to={`/hr/payroll/${payroll.id}/view`}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>

                          {payroll.status === PayrollStatus.DRAFT && (
                            <>
                              <Link
                                to={`/hr/payroll/${payroll.id}/edit`}
                                className="text-green-600 hover:text-green-900"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Link>
                              <button
                                onClick={() => handleDelete(payroll.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {payrolls && payrolls.count > 0 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handlePageChange(filters.page! - 1)}
                  disabled={!payrolls.previous}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(filters.page! + 1)}
                  disabled={!payrolls.next}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(filters.page! - 1) * 20 + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(filters.page! * 20, payrolls.count)}
                    </span>{' '}
                    of <span className="font-medium">{payrolls.count}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => handlePageChange(filters.page! - 1)}
                      disabled={!payrolls.previous}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(filters.page! + 1)}
                      disabled={!payrolls.next}
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
      </div>
    </div>
  );
};

export default PayrollListPage;
