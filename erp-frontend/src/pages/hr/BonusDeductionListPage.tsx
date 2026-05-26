import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  DollarSign,
  Calendar,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  MinusCircle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { hrService } from '../../services/hrService';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import {
  BonusDeductionRequest,
  BonusDeductionRequestFilters,
  BonusDeductionRequestStatus,
  getBonusDeductionStatusColor,
  getBonusDeductionStatusLabel,
} from '../../types/hr';
import { PayComponentRemovalRequest, PayComponentRemovalStatus } from '../../types/salaryComponent';
import {
  usePayComponentRemovals,
  usePayComponentRemovalPendingCount,
  useApprovePayComponentRemoval,
  useRejectPayComponentRemoval,
} from '../../hooks/useSalaryComponents';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

const BonusDeductionListPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { canUserApprove } = useApprovalGuard();

  const [filters, setFilters] = useState<BonusDeductionRequestFilters>({
    staff: searchParams.get('staff') ? Number(searchParams.get('staff')) : undefined,
    status: (searchParams.get('status') as BonusDeductionRequestStatus) || undefined,
    component_type: (searchParams.get('component_type') as 'EARNING' | 'DEDUCTION') || undefined,
    for_month: searchParams.get('for_month') || undefined,
    page: 1,
    ordering: '-created_at',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BonusDeductionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Component removal state
  const [activeTab, setActiveTab] = useState<'bonus-deduction' | 'component-removals'>(
    searchParams.get('tab') === 'removals' ? 'component-removals' : 'bonus-deduction'
  );
  const [selectedRemoval, setSelectedRemoval] = useState<PayComponentRemovalRequest | null>(null);
  const [removalRejectionReason, setRemovalRejectionReason] = useState('');
  const [showRemovalRejectModal, setShowRemovalRejectModal] = useState(false);
  const [removalStatusFilter, setRemovalStatusFilter] = useState<string>('PENDING');

  // Component removal hooks
  const { data: removalData, isLoading: removalLoading } = usePayComponentRemovals({
    status: removalStatusFilter || undefined,
  });
  const { data: removalPendingCount } = usePayComponentRemovalPendingCount();
  const approveRemoval = useApprovePayComponentRemoval();
  const rejectRemoval = useRejectPayComponentRemoval();

  const handleApproveRemoval = async (removal: PayComponentRemovalRequest) => {
    if (!confirm(`Approve removal of "${removal.component_name}" from ${removal.staff_name}?`))
      return;
    approveRemoval.mutate(removal.id);
  };

  const handleRejectRemovalClick = (removal: PayComponentRemovalRequest) => {
    setSelectedRemoval(removal);
    setRemovalRejectionReason('');
    setShowRemovalRejectModal(true);
  };

  const handleRejectRemovalSubmit = () => {
    if (!selectedRemoval || !removalRejectionReason.trim()) return;
    rejectRemoval.mutate(
      { id: selectedRemoval.id, rejectionReason: removalRejectionReason },
      {
        onSuccess: () => {
          setShowRemovalRejectModal(false);
          setSelectedRemoval(null);
        },
      }
    );
  };

  // Fetch bonus/deduction requests data
  const { data, isLoading, error } = useQuery({
    queryKey: ['bonus-deduction-requests', filters],
    queryFn: () => hrService.getBonusDeductionRequests(filters),
    keepPreviousData: true,
  });

  // Fetch staff for dropdown
  const { data: staffOptions } = useQuery({
    queryKey: ['staff-dropdown'],
    queryFn: () => hrService.getStaffForDropdown(),
  });

  // Fetch pending count for badge
  const { data: pendingCount } = useQuery({
    queryKey: ['bonus-deduction-pending-count'],
    queryFn: () => hrService.getPendingBonusDeductionCount(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  const handleSearch = (searchValue: string) => {
    setSearchTerm(searchValue);
    setFilters(prev => ({
      ...prev,
      page: 1,
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleSort = (field: string) => {
    const currentOrdering = filters.ordering || '';
    let newOrdering = field;

    if (currentOrdering === field) {
      newOrdering = `-${field}`;
    } else if (currentOrdering === `-${field}`) {
      newOrdering = field;
    }

    setFilters(prev => ({ ...prev, ordering: newOrdering }));
  };

  const getSortIcon = (field: string) => {
    const currentOrdering = filters.ordering || '';
    if (currentOrdering === field) return '↑';
    if (currentOrdering === `-${field}`) return '↓';
    return '';
  };

  const handleApprove = async (request: BonusDeductionRequest) => {
    if (
      !confirm(
        `Approve ${request.component_type === 'EARNING' ? 'bonus' : 'deduction'} of ₦${parseFloat(request.amount).toLocaleString()} for ${request.staff_name}?`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.approveBonusDeductionRequest(request.id);
      success('Request approved successfully');
      queryClient.invalidateQueries(['bonus-deduction-requests']);
      queryClient.invalidateQueries(['bonus-deduction-pending-count']);
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectClick = (request: BonusDeductionRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest) return;

    if (!rejectionReason.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.rejectBonusDeductionRequest(selectedRequest.id, rejectionReason);
      success('Request rejected');
      setShowRejectModal(false);
      setSelectedRequest(null);
      queryClient.invalidateQueries(['bonus-deduction-requests']);
      queryClient.invalidateQueries(['bonus-deduction-pending-count']);
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: BonusDeductionRequestStatus) => {
    switch (status) {
      case BonusDeductionRequestStatus.APPROVED:
        return <CheckCircle className="h-4 w-4" />;
      case BonusDeductionRequestStatus.REJECTED:
        return <XCircle className="h-4 w-4" />;
      case BonusDeductionRequestStatus.PENDING:
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getComponentTypeIcon = (componentType: 'EARNING' | 'DEDUCTION') => {
    return componentType === 'EARNING' ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const getComponentTypeColor = (componentType: 'EARNING' | 'DEDUCTION') => {
    return componentType === 'EARNING' ? 'text-green-600' : 'text-red-600';
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Requests</h2>
          <p className="text-gray-600">Please try again later.</p>
        </div>
      </div>
    );
  }

  const breadcrumbItems = [
    { label: 'HR & Payroll', href: '/hr' },
    { label: 'Bonus & Deduction Requests', current: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">HR Approval Requests</h1>
              {pendingCount && pendingCount.count > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  {pendingCount.count} bonus/deduction pending
                </span>
              )}
              {removalPendingCount && removalPendingCount.count > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {removalPendingCount.count} removal pending
                </span>
              )}
            </div>
            <p className="text-sm sm:text-base text-gray-600">
              Manage salary adjustments and component removal approvals
            </p>
          </div>
          {activeTab === 'bonus-deduction' && (
            <Link
              to="/hr/bonus-deduction/create"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center text-sm sm:text-base touch-manipulation"
              style={{ minHeight: '44px' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </Link>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('bonus-deduction')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200 flex items-center gap-2 ${
              activeTab === 'bonus-deduction'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Bonus & Deduction Requests
            {pendingCount && pendingCount.count > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                {pendingCount.count}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('component-removals')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200 flex items-center gap-2 ${
              activeTab === 'component-removals'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <MinusCircle className="h-4 w-4" />
            Component Removal Requests
            {removalPendingCount && removalPendingCount.count > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {removalPendingCount.count}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'bonus-deduction' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                  </div>
                  <div className="ml-3 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-500">Pending</p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {pendingCount?.count || 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  </div>
                  <div className="ml-3 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-500">Bonuses</p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {data?.results?.filter(r => r.component_type === 'EARNING').length || 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
                  </div>
                  <div className="ml-3 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-500">Deductions</p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {data?.results?.filter(r => r.component_type === 'DEDUCTION').length || 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  </div>
                  <div className="ml-3 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-500">Total</p>
                    <p className="text-lg sm:text-xl font-semibold text-gray-900">
                      {data?.count || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow mb-6 p-4">
              <div className="flex flex-col gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search by staff name, component, or reference number..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      value={searchTerm}
                      onChange={e => handleSearch(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center justify-center text-sm sm:text-base touch-manipulation"
                  style={{ minHeight: '44px' }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </button>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Staff Member
                      </label>
                      <select
                        value={filters.staff || ''}
                        onChange={e =>
                          setFilters(prev => ({
                            ...prev,
                            staff: e.target.value ? Number(e.target.value) : undefined,
                            page: 1,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      >
                        <option value="">All Staff</option>
                        {staffOptions?.map(staff => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name} {staff.department && `(${staff.department})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={filters.status || ''}
                        onChange={e =>
                          setFilters(prev => ({
                            ...prev,
                            status: (e.target.value as BonusDeductionRequestStatus) || undefined,
                            page: 1,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      >
                        <option value="">All Statuses</option>
                        {Object.values(BonusDeductionRequestStatus).map(status => (
                          <option key={status} value={status}>
                            {getBonusDeductionStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={filters.component_type || ''}
                        onChange={e =>
                          setFilters(prev => ({
                            ...prev,
                            component_type:
                              (e.target.value as 'EARNING' | 'DEDUCTION') || undefined,
                            page: 1,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      >
                        <option value="">All Types</option>
                        <option value="EARNING">Bonus</option>
                        <option value="DEDUCTION">Deduction</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        For Month
                      </label>
                      <input
                        type="month"
                        value={filters.for_month ? filters.for_month.substring(0, 7) : ''}
                        onChange={e =>
                          setFilters(prev => ({
                            ...prev,
                            for_month: e.target.value ? `${e.target.value}-01` : undefined,
                            page: 1,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setFilters({ page: 1, ordering: '-created_at' });
                          setSearchTerm('');
                        }}
                        className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm sm:text-base touch-manipulation"
                        style={{ minHeight: '40px' }}
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Requests Table/Cards */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading requests...</p>
                </div>
              ) : data?.results?.length === 0 ? (
                <div className="p-8 text-center">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No requests found</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || filters.staff || filters.status || filters.component_type
                      ? 'No requests match your search criteria.'
                      : 'No bonus or deduction requests have been submitted yet.'}
                  </p>
                  <Link
                    to="/hr/bonus-deduction/create"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 inline-flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Request
                  </Link>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('reference_number')}
                          >
                            Reference {getSortIcon('reference_number')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('staff_name')}
                          >
                            Staff Member {getSortIcon('staff_name')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('component_name')}
                          >
                            Component {getSortIcon('component_name')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('amount')}
                          >
                            Amount {getSortIcon('amount')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('for_month')}
                          >
                            For Month {getSortIcon('for_month')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('status')}
                          >
                            Status {getSortIcon('status')}
                          </th>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('requested_date')}
                          >
                            Requested {getSortIcon('requested_date')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Payroll
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data?.results?.map((request: BonusDeductionRequest) => (
                          <tr key={request.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {request.reference_number}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <User className="h-4 w-4 text-gray-400 mr-2" />
                                <div className="text-sm font-medium text-gray-900">
                                  {request.staff_name}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {getComponentTypeIcon(request.component_type)}
                                <div className="ml-2">
                                  <div className="text-sm font-medium text-gray-900">
                                    {request.component_name}
                                  </div>
                                  <div
                                    className={`text-xs ${getComponentTypeColor(request.component_type)}`}
                                  >
                                    {request.component_type === 'EARNING' ? 'Bonus' : 'Deduction'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div
                                className={`text-sm font-semibold ${getComponentTypeColor(request.component_type)}`}
                              >
                                ${parseFloat(request.amount).toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                                <div className="text-sm text-gray-900">
                                  {new Date(request.for_month).toLocaleDateString('en-US', {
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${getBonusDeductionStatusColor(request.status)}-100 text-${getBonusDeductionStatusColor(request.status)}-800`}
                              >
                                {getStatusIcon(request.status)}
                                <span className="ml-1">
                                  {getBonusDeductionStatusLabel(request.status)}
                                </span>
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {new Date(request.requested_date).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-gray-500">
                                by {request.requested_by_name}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {request.applied_in_payroll ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  <CheckCircle className="h-3 w-3" />
                                  In Payroll
                                </span>
                              ) : request.status === BonusDeductionRequestStatus.APPROVED ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  <Clock className="h-3 w-3" />
                                  Pending Payroll
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => navigate(`/hr/bonus-deduction/${request.id}/view`)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded"
                                  title="View Details"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                {canUserApprove && request.is_pending && (
                                  <>
                                    <button
                                      onClick={() => handleApprove(request)}
                                      disabled={isProcessing}
                                      className="text-green-600 hover:text-green-900 p-1 rounded disabled:opacity-50"
                                      title="Approve"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleRejectClick(request)}
                                      disabled={isProcessing}
                                      className="text-red-600 hover:text-red-900 p-1 rounded disabled:opacity-50"
                                      title="Reject"
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="lg:hidden divide-y divide-gray-200">
                    {data?.results?.map((request: BonusDeductionRequest) => (
                      <div key={request.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {getComponentTypeIcon(request.component_type)}
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {request.reference_number}
                              </div>
                              <div
                                className={`text-xs ${getComponentTypeColor(request.component_type)}`}
                              >
                                {request.component_type === 'EARNING' ? 'Bonus' : 'Deduction'}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${getBonusDeductionStatusColor(request.status)}-100 text-${getBonusDeductionStatusColor(request.status)}-800`}
                          >
                            {getStatusIcon(request.status)}
                            <span className="ml-1">
                              {getBonusDeductionStatusLabel(request.status)}
                            </span>
                          </span>
                        </div>

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center text-sm">
                            <User className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-gray-900 font-medium">{request.staff_name}</span>
                          </div>

                          <div className="flex items-center text-sm">
                            <DollarSign className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-gray-600">{request.component_name}</span>
                            <span
                              className={`ml-2 font-semibold ${getComponentTypeColor(request.component_type)}`}
                            >
                              ${parseFloat(request.amount).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center text-sm">
                            <Calendar className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-gray-600">
                              {new Date(request.for_month).toLocaleDateString('en-US', {
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                          </div>

                          <div className="flex items-center text-sm">
                            <Clock className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-gray-600">
                              {new Date(request.requested_date).toLocaleDateString()} by{' '}
                              {request.requested_by_name}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => navigate(`/hr/bonus-deduction/${request.id}/view`)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium touch-manipulation"
                            style={{ minHeight: '44px' }}
                          >
                            View Details
                          </button>

                          {canUserApprove && request.is_pending && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={isProcessing}
                                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium touch-manipulation"
                                style={{ minHeight: '40px' }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectClick(request)}
                                disabled={isProcessing}
                                className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium touch-manipulation"
                                style={{ minHeight: '40px' }}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {data && data.count > 0 && (
                    <div className="bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-gray-200">
                      <div className="text-sm text-gray-700 text-center sm:text-left">
                        Showing{' '}
                        <span className="font-medium">{((filters.page || 1) - 1) * 20 + 1}</span> to{' '}
                        <span className="font-medium">
                          {Math.min((filters.page || 1) * 20, data.count)}
                        </span>{' '}
                        of <span className="font-medium">{data.count}</span> results
                      </div>
                      <div className="flex justify-center sm:justify-end">
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                          <button
                            onClick={() => handlePageChange((filters.page || 1) - 1)}
                            disabled={!data.previous}
                            className="relative inline-flex items-center px-4 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                            style={{ minHeight: '44px' }}
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => handlePageChange((filters.page || 1) + 1)}
                            disabled={!data.next}
                            className="relative inline-flex items-center px-4 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                            style={{ minHeight: '44px' }}
                          >
                            Next
                          </button>
                        </nav>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Component Removal Requests Tab */}
        {activeTab === 'component-removals' && (
          <div>
            {/* Status Filter */}
            <div className="flex gap-2 mb-4">
              {['PENDING', 'APPROVED', 'REJECTED', ''].map(s => (
                <button
                  key={s}
                  onClick={() => setRemovalStatusFilter(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    removalStatusFilter === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === '' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              {removalLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading removal requests...</p>
                </div>
              ) : !removalData?.results?.length ? (
                <div className="p-8 text-center">
                  <MinusCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No removal requests found
                  </h3>
                  <p className="text-gray-600">
                    Component removal requests submitted by staff managers will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {removalData.results.map((removal: PayComponentRemovalRequest) => (
                    <div key={removal.id} className="p-4 hover:bg-gray-50">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-500">
                              {removal.reference_number}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                removal.status === 'PENDING'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : removal.status === 'APPROVED'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {removal.status === 'PENDING' ? (
                                <Clock className="h-3 w-3 mr-1" />
                              ) : removal.status === 'APPROVED' ? (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              {removal.status}
                            </span>
                          </div>
                          <div className="mt-1">
                            <Link
                              to={`/hr/staff/${removal.staff_id}/pay-components`}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                              {removal.staff_name}
                            </Link>
                            <span className="text-gray-500 text-sm mx-1">—</span>
                            <span className="text-sm font-medium text-gray-900">
                              {removal.component_name}
                            </span>
                            <span
                              className={`ml-2 text-xs px-1.5 py-0.5 rounded ${removal.component_type === 'EARNING' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                            >
                              {removal.component_type === 'EARNING' ? 'Earning' : 'Deduction'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">Current amount:</span> ₦
                            {parseFloat(removal.current_amount || '0').toLocaleString()}
                          </p>
                          {removal.reason && (
                            <p className="text-sm text-gray-600 mt-0.5">
                              <span className="font-medium">Reason:</span> {removal.reason}
                            </p>
                          )}
                          {removal.rejection_reason && (
                            <p className="text-sm text-red-600 mt-0.5">
                              <span className="font-medium">Rejection reason:</span>{' '}
                              {removal.rejection_reason}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Requested by {removal.requested_by_name} ·{' '}
                            {new Date(removal.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {removal.status === 'PENDING' && canUserApprove && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleApproveRemoval(removal)}
                              disabled={approveRemoval.isLoading}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectRemovalClick(removal)}
                              disabled={rejectRemoval.isLoading}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Request</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to reject the{' '}
                {selectedRequest.component_type === 'EARNING' ? 'bonus' : 'deduction'} request for{' '}
                <span className="font-medium">{selectedRequest.staff_name}</span>. Please provide a
                reason for rejection.
              </p>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="Enter rejection reason..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRejectSubmit}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {isProcessing ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Component Removal Reject Modal */}
      {showRemovalRejectModal && selectedRemoval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Removal Request</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to reject the removal of{' '}
                <span className="font-medium">{selectedRemoval.component_name}</span> from{' '}
                <span className="font-medium">{selectedRemoval.staff_name}</span>. Please provide a
                reason.
              </p>
              <textarea
                value={removalRejectionReason}
                onChange={e => setRemovalRejectionReason(e.target.value)}
                rows={4}
                placeholder="Enter rejection reason..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRejectRemovalSubmit}
                  disabled={rejectRemoval.isLoading || !removalRejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {rejectRemoval.isLoading ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button
                  onClick={() => setShowRemovalRejectModal(false)}
                  disabled={rejectRemoval.isLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BonusDeductionListPage;
