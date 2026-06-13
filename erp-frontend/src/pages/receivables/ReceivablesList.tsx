// src/pages/receivables/ReceivablesList.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  receivablesService,
  CustomerReceivable,
  ReceivablesFilters,
} from '../../services/receivablesService';
import { useReceivablesError, RECEIVABLES_ERROR_CONTEXTS } from '../../hooks/useReceivablesError';
import { useAuth } from '../../contexts/AuthContext';
import PaymentRecordingModal from '../../components/modals/PaymentRecordingModal';
import UnifiedPaymentModal from '../../components/modals/UnifiedPaymentModal';
import WorkflowStatusIndicator from '../../components/receivables/WorkflowStatusIndicator';
import VirtualScrollTable from '../../components/ui/VirtualScrollTable';
import { useDataCache, cacheUtils } from '../../hooks/useDataCache';
import { useDebounce, useDebouncedCallback } from '../../hooks/useDebounce';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { invoiceService, Invoice } from '../../services/invoiceService';
import { clientService, ClientOption } from '../../services/clientService';
import {
  CheckSquare,
  Square,
  ChevronDown,
  RefreshCw,
  Calculator,
  AlertTriangle,
  Filter,
  Download,
  UserPlus,
  Eye,
  CreditCard,
  BarChart3,
  Calendar,
  Search,
  X,
  Users,
  TrendingUp,
  Clock,
} from 'lucide-react';

const ReceivablesList: React.FC = () => {
  const navigate = useNavigate();

  // Performance monitoring
  usePerformanceMonitor('ReceivablesList', {
    enabled: process.env.NODE_ENV === 'development',
    threshold: 100, // Log renders over 100ms
  });

  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReceivablesFilters>({});
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [useVirtualScrolling, setUseVirtualScrolling] = useState(false);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });

  // Debounced search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Cached data fetching
  const cacheKey = useMemo(
    () => `receivables-${JSON.stringify(filters)}-${debouncedSearchTerm}`,
    [filters, debouncedSearchTerm]
  );

  const {
    data: cachedReceivables,
    loading: cacheLoading,
    error: cacheError,
    refresh: refreshCache,
    isStale,
  } = useDataCache(
    cacheKey,
    () =>
      receivablesService.getReceivablesWithErrorHandling({
        ...filters,
        search: debouncedSearchTerm || undefined,
      }),
    { ttl: 2 * 60 * 1000, staleWhileRevalidate: true } // 2 minutes cache
  );

  // Enhanced state for new features
  const [agingSummary, setAgingSummary] = useState<{
    current: { amount: number; count: number };
    '1-30': { amount: number; count: number };
    '31-60': { amount: number; count: number };
    '61-90': { amount: number; count: number };
    '90+': { amount: number; count: number };
  } | null>(null);

  // Batch operations state
  const [selectedReceivables, setSelectedReceivables] = useState<Set<number>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchModal, setBatchModal] = useState<{
    isOpen: boolean;
    type: 'aging' | 'interest' | 'assign' | 'export';
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: 'aging',
    title: '',
    description: '',
  });
  const [interestRate, setInterestRate] = useState('5.0');
  const [assignToCollector, setAssignToCollector] = useState('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    receivable: CustomerReceivable | null;
    invoice: Invoice | null;
  }>({
    isOpen: false,
    receivable: null,
    invoice: null,
  });

  // Navigation handler for view details
  const handleViewDetails = (receivable: CustomerReceivable) => {
    if (receivable.receivable_type === 'entitlement') {
      // Navigate to entitlement detail page
      navigate(`/entitlements/${receivable.source_id}/view`);
    } else if (receivable.receivable_type === 'invoice') {
      // Navigate to invoice detail page
      navigate(`/sales/invoices/${receivable.source_id}/view`);
    } else {
      // Default navigation for other types
      navigate(`/receivables/${receivable.id}`);
    }
  };

  // Check if current user role can record payments (mark as paid)
  // const canRecordPayments = selectedRole && !['Administrator'].includes(selectedRole);
  // Enhanced error handling
  const { executeWithErrorHandling, executeBulkOperation, isLoading, hasError, error, clearError } =
    useReceivablesError({
      showToast: true,
      trackProgress: true,
      autoRetry: true,
      maxRetries: 2,
    });

  useEffect(() => {
    loadReceivables();
  }, [filters]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoadingClients(true);
      const clientOptions = await clientService.getClientOptions({ status: 'active' });
      setClients(clientOptions);
    } catch {
      // Keep filter functional with an empty list when client lookup fails.
      setClients([]);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadReceivables = async () => {
    setLoading(true);

    const response = await executeWithErrorHandling(
      () => receivablesService.getReceivablesWithErrorHandling(filters),
      RECEIVABLES_ERROR_CONTEXTS.LOAD_RECEIVABLES,
      `load-receivables-${Date.now()}`
    );

    if (response) {
      const receivablesData = response.results || [];
      setReceivables(receivablesData);

      // Calculate aging summary for visualization
      const summary = {
        current: { amount: 0, count: 0 },
        '1-30': { amount: 0, count: 0 },
        '31-60': { amount: 0, count: 0 },
        '61-90': { amount: 0, count: 0 },
        '90+': { amount: 0, count: 0 },
      };

      receivablesData.forEach((r: CustomerReceivable) => {
        const bucket = r.aging_bucket;
        summary[bucket].amount += parseFloat(r.balance);
        summary[bucket].count += 1;
      });

      setAgingSummary(summary);

      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    }

    setLoading(false);
  };

  // Payment handling functions
  const handlePaymentClick = (receivable: CustomerReceivable) => {
    // Use UnifiedPaymentModal for all receivable types
    setPaymentModal({
      isOpen: true,
      receivable,
      invoice: null, // Not needed for unified modal
    });
  };

  const handlePaymentRecorded = () => {
    // Refresh the receivables list after payment is recorded
    loadReceivables();
  };

  const closePaymentModal = () => {
    setPaymentModal({ isOpen: false, receivable: null, invoice: null });
  };

  const handleFilterChange = (key: keyof ReceivablesFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getStatusBadge = (status: CustomerReceivable['status']) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      partial: { color: 'bg-blue-100 text-blue-800', label: 'Partial' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
      written_off: { color: 'bg-gray-100 text-gray-800', label: 'Written Off' },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getAgingBadge = (bucket: CustomerReceivable['aging_bucket']) => {
    const bucketConfig = {
      current: { color: 'bg-green-100 text-green-800', label: 'Current' },
      '1-30': { color: 'bg-yellow-100 text-yellow-800', label: '1-30 days' },
      '31-60': { color: 'bg-orange-100 text-orange-800', label: '31-60 days' },
      '61-90': { color: 'bg-red-100 text-red-800', label: '61-90 days' },
      '90+': { color: 'bg-red-200 text-red-900', label: '90+ days' },
    };

    const config = bucketConfig[bucket];
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  // Batch operations functions
  const handleSelectAll = () => {
    if (selectedReceivables.size === receivables.length) {
      setSelectedReceivables(new Set());
    } else {
      setSelectedReceivables(new Set(receivables.map(r => r.id)));
    }
  };

  const handleSelectReceivable = (id: number) => {
    const newSelected = new Set(selectedReceivables);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedReceivables(newSelected);
  };

  const openBatchModal = (type: 'aging' | 'interest' | 'assign' | 'export') => {
    const modalConfig = {
      aging: {
        title: 'Recalculate Aging',
        description: `This will recalculate aging buckets for ${selectedReceivables.size} selected receivables. This process may take a few moments.`,
      },
      interest: {
        title: 'Apply Interest',
        description: `This will apply interest charges to ${selectedReceivables.size} selected overdue receivables. Please specify the interest rate.`,
      },
      assign: {
        title: 'Assign to Collector',
        description: `This will assign ${selectedReceivables.size} selected receivables to a collection agent for follow-up.`,
      },
      export: {
        title: 'Export Receivables',
        description: `This will export ${selectedReceivables.size} selected receivables to a file for external processing.`,
      },
    };

    setBatchModal({
      isOpen: true,
      type,
      ...modalConfig[type],
    });
  };

  const handleBatchOperation = async () => {
    if (selectedReceivables.size === 0) {
      return;
    }

    const operationId = `batch-${batchModal.type}-${Date.now()}`;
    const selectedReceivableObjects = receivables.filter(r => selectedReceivables.has(r.id));

    let result;
    switch (batchModal.type) {
      case 'aging':
        result = await executeBulkOperation(
          selectedReceivableObjects,
          async receivable => {
            await receivablesService.updateAgingWithErrorHandling(receivable.id);
            return receivable;
          },
          RECEIVABLES_ERROR_CONTEXTS.BULK_AGING_UPDATE,
          operationId,
          {
            batchSize: 5,
            continueOnError: true,
            showSuccessToast: true,
            successMessage: `Aging recalculated for receivables`,
          }
        );
        break;

      case 'interest':
        const overdueReceivables = selectedReceivableObjects.filter(
          r => r.status === 'overdue' || r.days_overdue > 0
        );
        if (overdueReceivables.length === 0) {
          return;
        }

        result = await executeBulkOperation(
          overdueReceivables,
          async receivable => {
            await receivablesService.applyInterest(receivable.id);
            return receivable;
          },
          RECEIVABLES_ERROR_CONTEXTS.BULK_INTEREST_APPLICATION,
          operationId,
          {
            batchSize: 3,
            continueOnError: true,
            showSuccessToast: true,
            successMessage: `Interest applied to overdue receivables`,
          }
        );
        break;

      case 'assign':
        // Mock assignment functionality - would need actual API endpoint
        result = await executeWithErrorHandling(
          async () => {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
              success: true,
              processed_count: selectedReceivables.size,
              message: `Assigned ${selectedReceivables.size} receivables to collector`,
            };
          },
          RECEIVABLES_ERROR_CONTEXTS.BULK_ASSIGN_COLLECTOR,
          operationId,
          {
            showSuccessToast: true,
            successMessage: `Assigned ${selectedReceivables.size} receivables to collector`,
          }
        );
        break;

      case 'export':
        result = await executeWithErrorHandling(
          async () => {
            const csvContent = generateCSVContent(selectedReceivableObjects);
            downloadFile(
              csvContent,
              `receivables_export_${new Date().toISOString().split('T')[0]}.csv`,
              'text/csv'
            );
            return {
              success: true,
              processed_count: selectedReceivables.size,
              message: `Exported ${selectedReceivables.size} receivables`,
            };
          },
          RECEIVABLES_ERROR_CONTEXTS.EXPORT_REPORT,
          operationId,
          {
            showSuccessToast: true,
            successMessage: `Exported ${selectedReceivables.size} receivables`,
          }
        );
        break;

      default:
        return;
    }

    if (result) {
      setSelectedReceivables(new Set());
      if (batchModal.type !== 'export') {
        loadReceivables(); // Reload data for operations that modify data
      }
    }

    setBatchModal({ ...batchModal, isOpen: false });
  };

  const getBatchOperationSuccessMessage = (type: string) => {
    switch (type) {
      case 'aging':
        return 'Aging recalculated';
      case 'interest':
        return 'Interest applied';
      case 'assign':
        return 'Receivables assigned';
      case 'export':
        return 'Receivables exported';
      default:
        return 'Operation completed';
    }
  };

  const generateCSVContent = (data: CustomerReceivable[]) => {
    const headers = [
      'Reference Number',
      'Client Name',
      'Type',
      'Original Amount',
      'Balance',
      'Due Date',
      'Days Overdue',
      'Aging Bucket',
      'Status',
    ];

    const rows = data.map(r => [
      r.reference_number,
      r.client_name,
      r.receivable_type,
      r.original_amount,
      r.balance,
      r.due_date,
      r.days_overdue.toString(),
      r.aging_bucket,
      r.status,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const getOverdueReceivables = () => {
    return receivables.filter(
      r => selectedReceivables.has(r.id) && (r.status === 'overdue' || r.days_overdue > 0)
    );
  };

  const getTypeIcon = (type: CustomerReceivable['receivable_type']) => {
    const typeConfig = {
      invoice: { icon: '📄', label: 'Invoice' },
      entitlement: { icon: '🎓', label: 'Fee' },
      loan: { icon: '💰', label: 'Loan' },
      other: { icon: '📋', label: 'Other' },
    };

    return typeConfig[type];
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-2 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">All Receivables</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Unified view of invoices, fees, and loans
            </p>
          </div>

          {/* Current Filter Indicators */}
          <div className="flex flex-wrap gap-2">
            {filters.aging_bucket && (
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <Clock className="h-4 w-4 mr-1" />
                Aging:{' '}
                {filters.aging_bucket === 'current'
                  ? 'Current'
                  : filters.aging_bucket === '1-30'
                    ? '1-30 days'
                    : filters.aging_bucket === '31-60'
                      ? '31-60 days'
                      : filters.aging_bucket === '61-90'
                        ? '61-90 days'
                        : filters.aging_bucket === '90+'
                          ? '90+ days'
                          : filters.aging_bucket}
                <button
                  onClick={() => handleFilterChange('aging_bucket', undefined)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                  title="Clear aging filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {filters.status && (
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                Status: {filters.status}
                <button
                  onClick={() => handleFilterChange('status', undefined)}
                  className="ml-2 text-green-600 hover:text-green-800"
                  title="Clear status filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {filters.receivable_type && (
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                Type: {filters.receivable_type}
                <button
                  onClick={() => handleFilterChange('receivable_type', undefined)}
                  className="ml-2 text-purple-600 hover:text-purple-800"
                  title="Clear type filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aging Bucket Visualization */}
      {agingSummary && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 space-y-2 sm:space-y-0">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">Aging Analysis</h3>
            <div className="text-sm text-gray-600">
              Total:{' '}
              {formatCurrency(
                Object.values(agingSummary)
                  .reduce((sum, bucket) => sum + bucket.amount, 0)
                  .toString()
              )}
            </div>
          </div>

          {/* Visual Bar Chart */}
          <div className="mb-4">
            <div className="flex h-4 sm:h-6 rounded-lg overflow-hidden">
              {Object.entries(agingSummary).map(([bucket, data]) => {
                const totalAmount = Object.values(agingSummary).reduce(
                  (sum, b) => sum + b.amount,
                  0
                );
                const percentage = totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0;
                const minWidth = percentage > 0 ? Math.max(percentage, 2) : 0;

                return (
                  <div
                    key={bucket}
                    className={`flex items-center justify-center text-white text-xs font-medium ${
                      bucket === 'current'
                        ? 'bg-green-500'
                        : bucket === '1-30'
                          ? 'bg-yellow-500'
                          : bucket === '31-60'
                            ? 'bg-orange-500'
                            : bucket === '61-90'
                              ? 'bg-red-500'
                              : 'bg-red-700'
                    }`}
                    style={{ width: `${minWidth}%` }}
                    title={`${bucket}: ${formatCurrency(data.amount.toString())} (${data.count} items)`}
                  >
                    {percentage > 12 && <span className="hidden sm:inline">{bucket}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            {Object.entries(agingSummary).map(([bucket, data]) => {
              const totalAmount = Object.values(agingSummary).reduce((sum, b) => sum + b.amount, 0);
              const percentage = totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0;

              return (
                <div key={bucket} className="text-center">
                  <div
                    className={`inline-block w-3 h-3 sm:w-4 sm:h-4 rounded mb-2 ${
                      bucket === 'current'
                        ? 'bg-green-500'
                        : bucket === '1-30'
                          ? 'bg-yellow-500'
                          : bucket === '31-60'
                            ? 'bg-orange-500'
                            : bucket === '61-90'
                              ? 'bg-red-500'
                              : 'bg-red-700'
                    }`}
                  ></div>
                  <p className="text-xs sm:text-sm font-medium text-gray-900">
                    {bucket === 'current' ? 'Current' : `${bucket} days`}
                  </p>
                  <p className="text-sm sm:text-lg font-bold text-gray-900 truncate">
                    {formatCurrency(data.amount.toString())}
                  </p>
                  <p className="text-xs text-gray-500">
                    {data.count} items ({percentage.toFixed(1)}%)
                  </p>
                  <button
                    onClick={() => handleFilterChange('aging_bucket', bucket)}
                    className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                  >
                    Filter
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center">
              <Filter className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Advanced Filters</h3>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 transform transition-transform ${
                showAdvancedFilters ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Date Range Filters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date From
                </label>
                <input
                  type="date"
                  value={filters.due_date__gte || ''}
                  onChange={e => handleFilterChange('due_date__gte', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date To</label>
                <input
                  type="date"
                  value={filters.due_date__lte || ''}
                  onChange={e => handleFilterChange('due_date__lte', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Amount Range Filters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.balance__gte || ''}
                  onChange={e => handleFilterChange('balance__gte', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
                <input
                  type="number"
                  placeholder="1000000"
                  value={filters.balance__lte || ''}
                  onChange={e => handleFilterChange('balance__lte', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Assigned Collector Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                <select
                  value={filters.assigned_to || ''}
                  onChange={e => handleFilterChange('assigned_to', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">All Collectors</option>
                  <option value="unassigned">Unassigned</option>
                  <option value="1">John Smith</option>
                  <option value="2">Jane Doe</option>
                  <option value="3">Mike Johnson</option>
                </select>
              </div>

              {/* Branch Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select
                  value={filters.branch || ''}
                  onChange={e => handleFilterChange('branch', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">All Branches</option>
                  <option value="1">Main Branch</option>
                  <option value="2">North Branch</option>
                  <option value="3">South Branch</option>
                </select>
              </div>

              {/* Client Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select
                  value={filters.client || ''}
                  onChange={e =>
                    handleFilterChange(
                      'client',
                      e.target.value ? parseInt(e.target.value, 10) : undefined
                    )
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Client"
                  title="Client"
                  disabled={loadingClients}
                >
                  <option value="">
                    {loadingClients ? 'Loading clients...' : 'All clients'}
                  </option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.client_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ordering */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  value={filters.ordering || ''}
                  onChange={e => handleFilterChange('ordering', e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Default</option>
                  <option value="balance">Balance (Low to High)</option>
                  <option value="-balance">Balance (High to Low)</option>
                  <option value="due_date">Due Date (Oldest First)</option>
                  <option value="-due_date">Due Date (Newest First)</option>
                  <option value="days_overdue">Days Overdue (Low to High)</option>
                  <option value="-days_overdue">Days Overdue (High to Low)</option>
                  <option value="client_name">Client Name (A-Z)</option>
                  <option value="-client_name">Client Name (Z-A)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-3 sm:px-6 py-3 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900">
                    Receivables ({pagination.count})
                  </h3>
                  {selectedReceivables.size > 0 && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">
                        {selectedReceivables.size} selected
                      </span>
                      <div className="relative">
                        <button
                          onClick={() => setShowBatchActions(!showBatchActions)}
                          disabled={true}
                          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-400 bg-gray-300 rounded-md cursor-not-allowed"
                        >
                          <span className="hidden sm:inline">Batch Actions</span>
                          <span className="sm:hidden">Actions</span>
                          <ChevronDown className="ml-1 h-4 w-4" />
                        </button>
                        {showBatchActions && (
                          <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                            <div className="py-1">
                              <button
                                onClick={() => {
                                  openBatchModal('aging');
                                  setShowBatchActions(false);
                                }}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Recalculate Aging
                              </button>
                              <button
                                onClick={() => {
                                  const overdueCount = getOverdueReceivables().length;
                                  if (overdueCount === 0) {
                                    return;
                                  }
                                  openBatchModal('interest');
                                  setShowBatchActions(false);
                                }}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Calculator className="mr-2 h-4 w-4" />
                                Apply Interest ({getOverdueReceivables().length} overdue)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  {/* {canRecordPayments && (
                    <button
                      onClick={() => window.location.href = '/receivables/payments/record'}
                      className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 text-center"
                    >
                      <span className="sm:hidden">Record Payment</span>
                      <span className="hidden sm:inline">Record Payment</span>
                    </button>
                  )}
                  {canRecordPayments && (
                    <button
                      onClick={() => navigate('/receivables/bulk-payment-upload')}
                      className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 text-center"
                    >
                      <span className="sm:hidden">Bulk Upload</span>
                      <span className="hidden sm:inline">Bulk Payment Upload</span>
                    </button>
                  )} */}
                  <button
                    onClick={() => navigate('/receivables/aging-report')}
                    className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-center"
                  >
                    <span className="sm:hidden">Aging Report</span>
                    <span className="hidden sm:inline">Aging Report</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile-Responsive Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center space-x-2 text-gray-500 hover:text-gray-700"
                      >
                        {selectedReceivables.size === receivables.length &&
                        receivables.length > 0 ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        <span>Select</span>
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Original Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aging
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
                  {receivables.map(receivable => (
                    <tr key={receivable.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedReceivables.has(receivable.id)}
                          onChange={() => handleSelectReceivable(receivable.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receivable.reference_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {receivable.client_name}
                        </div>
                        <div className="text-sm text-gray-500">ID: {receivable.client}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="mr-2">
                            {getTypeIcon(receivable.receivable_type).icon}
                          </span>
                          <span className="text-sm text-gray-900">
                            {getTypeIcon(receivable.receivable_type).label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {formatCurrency(receivable.original_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {formatCurrency(receivable.balance)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(receivable.due_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getAgingBadge(receivable.aging_bucket)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(receivable.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewDetails(receivable)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {receivable.status === 'pending' && (
                            <button
                              onClick={() => handlePaymentClick(receivable)}
                              className="text-green-600 hover:text-green-900"
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

            {/* Mobile Card View */}
            <div className="sm:hidden">
              {receivables.map(receivable => (
                <div key={receivable.id} className="border-b border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedReceivables.has(receivable.id)}
                        onChange={() => handleSelectReceivable(receivable.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-lg">
                            {getTypeIcon(receivable.receivable_type).icon}
                          </span>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {receivable.client_name}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">{receivable.reference_number}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewDetails(receivable)}
                        className="text-blue-600 hover:text-blue-900 p-1"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {receivable.status === 'pending' && (
                        <button
                          onClick={() => handlePaymentClick(receivable)}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Record Payment"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Balance</p>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(receivable.balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Due Date</p>
                      <p className="text-gray-900">{formatDate(receivable.due_date)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex space-x-2">
                      {getAgingBadge(receivable.aging_bucket)}
                      {getStatusBadge(receivable.status)}
                    </div>
                    {/* <WorkflowStatusIndicator 
                      receivable={receivable}
                      size="sm"
                    /> */}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.currentPage} of {Math.ceil(pagination.count / 20)}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {receivables.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-4xl mb-4">📋</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No receivables found</h3>
                  <p className="text-gray-600">
                    Try adjusting your filters or create a new invoice.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Modals */}
      {paymentModal.isOpen && paymentModal.receivable && (
        <UnifiedPaymentModal
          isOpen={paymentModal.isOpen}
          onClose={closePaymentModal}
          receivable={paymentModal.receivable}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}

      {/* Batch Operation Modal */}
      {batchModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center mb-4">
              {batchModal.type === 'aging' ? (
                <RefreshCw className="h-6 w-6 text-blue-600 mr-3" />
              ) : (
                <Calculator className="h-6 w-6 text-orange-600 mr-3" />
              )}
              <h3 className="text-lg font-medium text-gray-900">{batchModal.title}</h3>
            </div>

            <p className="text-sm text-gray-600 mb-6">{batchModal.description}</p>

            {batchModal.type === 'interest' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interest Rate (% per annum)
                </label>
                <input
                  type="number"
                  value={interestRate}
                  onChange={e => setInterestRate(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5.0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Interest will be calculated based on days overdue and applied to{' '}
                  {getOverdueReceivables().length} overdue receivables.
                </p>
              </div>
            )}

            {batchModal.type === 'aging' && (
              <div className="mb-6 p-4 bg-blue-50 rounded-md">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-blue-600 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800">What this does:</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Recalculates aging buckets (Current, 1-30, 31-60, 61-90, 90+ days) based on
                      current due dates.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setBatchModal({ ...batchModal, isOpen: false })}
                disabled={batchLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchOperation}
                disabled={
                  batchLoading ||
                  (batchModal.type === 'interest' &&
                    (!interestRate || parseFloat(interestRate) <= 0))
                }
                className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  batchModal.type === 'aging'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {batchLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    {batchModal.type === 'aging' ? (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    ) : (
                      <Calculator className="h-4 w-4 mr-2" />
                    )}
                    {getBatchOperationSuccessMessage(batchModal.type)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivablesList;
