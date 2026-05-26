import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Search,
  Filter,
  Eye,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Users,
  Calendar,
  Plus,
  Edit,
} from 'lucide-react';
import {
  entitlementService,
  FeeEntitlement,
  EntitlementFilters,
} from '../services/entitlementService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import UnifiedPaymentModal from '../components/modals/UnifiedPaymentModal';
import { CustomerReceivable } from '../services/receivablesService';

const EntitlementsList: React.FC = () => {
  const navigate = useNavigate();
  const [entitlements, setEntitlements] = useState<FeeEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<EntitlementFilters>({});
  const [selectedEntitlement, setSelectedEntitlement] = useState<FeeEntitlement | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    current_page: 1,
    total_pages: 1,
  });

  const { success, error: showError } = useToast();
  const { selectedRole } = useAuth();

  // Check if current user role can create entitlements
  const canCreateEntitlements = selectedRole && selectedRole !== 'Principal';

  // Check if current user role can record payments (mark as paid)
  const canRecordPayments = selectedRole && !['Administrator'].includes(selectedRole);

  useEffect(() => {
    fetchEntitlements();
  }, [filters]);

  const fetchEntitlements = async () => {
    try {
      setLoading(true);
      const response = await entitlementService.getEntitlements({
        ...filters,
        search: searchTerm || undefined,
        page: filters.page || 1,
      });

      setEntitlements(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        current_page: filters.page || 1,
        total_pages: Math.ceil((response.count || 0) / 20),
      });
    } catch (error: any) {
      console.error('Failed to fetch entitlements:', error);
      showError('Failed to load entitlements');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, page: 1 });
    fetchEntitlements();
  };

  const handleFilterChange = (key: keyof EntitlementFilters, value: any) => {
    setFilters({ ...filters, [key]: value, page: 1 });
  };

  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        icon: Clock,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        label: 'Pending',
      },
      active: {
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Active',
      },
      suspended: {
        icon: AlertCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Suspended',
      },
      completed: {
        icon: CheckCircle,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'Completed',
      },
      cancelled: {
        icon: XCircle,
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        label: 'Cancelled',
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        <StatusIcon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const getAccessLevelBadge = (level: string) => {
    const levelConfig = {
      none: {
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'No Access',
      },
      partial: {
        color: 'text-yellow-600',
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        label: 'Partial Access',
      },
      full: {
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Full Access',
      },
    };

    const config = levelConfig[level as keyof typeof levelConfig] || levelConfig.none;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        {config.label}
      </span>
    );
  };

  const getPaymentPercentageColor = (percentage: string | number) => {
    const numPercentage = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
    if (numPercentage >= 80) return 'text-green-600';
    if (numPercentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleRecordPayment = (entitlement: FeeEntitlement) => {
    // Convert entitlement to receivable format for UnifiedPaymentModal
    const receivable: CustomerReceivable = {
      id: entitlement.id,
      client: entitlement.client,
      client_name: entitlement.client_name,
      receivable_type: 'entitlement',
      object_id: entitlement.id,
      content_type: 0, // Will be set by backend
      content_type_name: 'entitlement',
      reference_number: `ENT-${entitlement.id}`,
      original_amount: entitlement.total_amount,
      amount_paid: entitlement.amount_paid,
      balance: entitlement.balance,
      due_date: entitlement.valid_until || '',
      aging_bucket: 'current',
      days_overdue: 0,
      status: entitlement.status === 'active' ? 'partial' : 'pending',
      overdue_interest_rate: '0.00',
      accrued_interest: '0.00',
      last_reminder_sent: undefined,
      reminder_count: 0,
      assigned_to: undefined,
      created_at: entitlement.valid_from,
      updated_at: entitlement.created_at,
    };

    setSelectedEntitlement(entitlement);
    setShowPaymentModal(true);
  };

  const handlePaymentRecorded = () => {
    setShowPaymentModal(false);
    setSelectedEntitlement(null);
    fetchEntitlements();
    success('Payment recorded successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <GraduationCap className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fee Entitlements</h1>
            <p className="text-gray-600">Manage client fee entitlements and access levels</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {canCreateEntitlements && (
            <button
              onClick={() => navigate('/incomes/entitlements/create')}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Entitlement
            </button>
          )}
          <span className="text-sm text-gray-500">{pagination.count} total entitlements</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by client name, invoice number..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearch()}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center space-x-4">
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={filters.current_access_level || ''}
              onChange={e =>
                handleFilterChange('current_access_level', e.target.value || undefined)
              }
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Access Levels</option>
              <option value="none">No Access</option>
              <option value="partial">Partial Access</option>
              <option value="full">Full Access</option>
            </select>

            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Filter className="h-4 w-4 mr-2" />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Entitlements Table */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client & Fee Structure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Access Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Validity Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entitlements.map(entitlement => (
                <tr key={entitlement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="flex items-center">
                        <Users className="h-4 w-4 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">
                          {entitlement.client_name}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {entitlement.fee_structure_name}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">ID: {entitlement.id}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {new Intl.NumberFormat('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                            minimumFractionDigits: 0,
                          }).format(parseFloat(entitlement.amount_paid))}
                        </span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-900 font-medium">
                          {new Intl.NumberFormat('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                            minimumFractionDigits: 0,
                          }).format(parseFloat(entitlement.total_amount))}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            parseFloat(entitlement.payment_percentage) >= 80
                              ? 'bg-green-500'
                              : parseFloat(entitlement.payment_percentage) >= 50
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.min(parseFloat(entitlement.payment_percentage), 100)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-medium ${getPaymentPercentageColor(entitlement.payment_percentage)}`}
                        >
                          {parseFloat(entitlement.payment_percentage).toFixed(1)}%
                        </span>
                        <span className="text-gray-500">
                          Balance:{' '}
                          {new Intl.NumberFormat('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                            minimumFractionDigits: 0,
                          }).format(parseFloat(entitlement.balance))}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getAccessLevelBadge(entitlement.current_access_level)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(entitlement.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-1" />
                        {new Date(entitlement.valid_from).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        to{' '}
                        {entitlement.valid_until
                          ? new Date(entitlement.valid_until).toLocaleDateString()
                          : 'No end date'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate(`/incomes/entitlements/${entitlement.id}/view`)}
                        className="text-blue-600 hover:text-blue-900 flex items-center"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/incomes/entitlements/${entitlement.id}/edit`)}
                        className="text-gray-600 hover:text-gray-900 flex items-center"
                        title="Edit Entitlement"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {parseFloat(entitlement.balance) > 0 && canRecordPayments && (
                        <button
                          onClick={() => handleRecordPayment(entitlement)}
                          className="text-green-600 hover:text-green-900 flex items-center"
                          title="Record Payment"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {entitlements.length === 0 && (
          <div className="text-center py-12">
            <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No entitlements found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || Object.keys(filters).length > 0
                ? 'Try adjusting your search or filters'
                : 'No fee entitlements have been created yet'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(pagination.current_page - 1)}
              disabled={!pagination.previous}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.current_page + 1)}
              disabled={!pagination.next}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">{(pagination.current_page - 1) * 20 + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(pagination.current_page * 20, pagination.count)}
                </span>{' '}
                of <span className="font-medium">{pagination.count}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={!pagination.previous}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === pagination.current_page
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => handlePageChange(pagination.current_page + 1)}
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

      {/* Payment Modal */}
      {showPaymentModal && selectedEntitlement && (
        <UnifiedPaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedEntitlement(null);
          }}
          receivable={{
            id: selectedEntitlement.id,
            client: selectedEntitlement.client,
            client_name: selectedEntitlement.client_name,
            receivable_type: 'entitlement',
            object_id: selectedEntitlement.id,
            content_type: 0,
            content_type_name: 'entitlement',
            reference_number: `ENT-${selectedEntitlement.id}`,
            original_amount: selectedEntitlement.total_amount,
            amount_paid: selectedEntitlement.amount_paid,
            balance: selectedEntitlement.balance,
            due_date: selectedEntitlement.valid_until || '',
            aging_bucket: 'current',
            days_overdue: 0,
            status: selectedEntitlement.status === 'active' ? 'partial' : 'pending',
            overdue_interest_rate: '0.00',
            accrued_interest: '0.00',
            last_reminder_sent: undefined,
            reminder_count: 0,
            assigned_to: undefined,
            created_at: selectedEntitlement.valid_from,
            updated_at: selectedEntitlement.created_at,
          }}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  );
};

export default EntitlementsList;
