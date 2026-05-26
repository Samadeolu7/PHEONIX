// src/pages/receivables/CollectionsDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receivablesService, CustomerReceivable } from '../../services/receivablesService';
import { userManagementService, User } from '../../services/userManagementService';
import { useReceivablesError, RECEIVABLES_ERROR_CONTEXTS } from '../../hooks/useReceivablesError';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import RetryButton from '../../components/ui/RetryButton';
import {
  RefreshCw,
  AlertTriangle,
  Users,
  TrendingUp,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  UserCheck,
  ArrowUp,
  ArrowDown,
  Calendar,
  DollarSign,
  Target,
  Activity,
  Filter,
  Search,
  ChevronRight,
  Eye,
  UserPlus,
} from 'lucide-react';

interface CollectionMetrics {
  totalOverdue: number;
  overdueCount: number;
  assignedCount: number;
  unassignedCount: number;
  collectionEffectiveness: number;
  averageResolutionDays: number;
  agingBreakdown: {
    '1-30': { amount: number; count: number };
    '31-60': { amount: number; count: number };
    '61-90': { amount: number; count: number };
    '90+': { amount: number; count: number };
  };
  collectorPerformance: Array<{
    collector: User;
    assigned_count: number;
    resolved_count: number;
    total_amount: number;
    effectiveness: number;
  }>;
  escalationQueue: Array<{
    id: number;
    client_name: string;
    balance: number;
    days_overdue: number;
    aging_bucket: string;
    last_contact?: string;
    escalation_level: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  recentActivity: Array<{
    id: number;
    client_name: string;
    activity_type: string;
    amount?: number;
    description: string;
    performed_by?: string;
    created_at: string;
  }>;
}

interface CollectionFilters {
  aging_bucket?: string;
  assigned_to?: number;
  escalation_level?: number;
  priority?: string;
  search?: string;
}

const CollectionsDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<CollectionMetrics | null>(null);
  const [overdueReceivables, setOverdueReceivables] = useState<CustomerReceivable[]>([]);
  const [collectors, setCollectors] = useState<User[]>([]);
  const [filters, setFilters] = useState<CollectionFilters>({});
  const [selectedReceivables, setSelectedReceivables] = useState<number[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTo, setAssigningTo] = useState<number | null>(null);
  const navigate = useNavigate();

  // Enhanced error handling
  const { executeWithErrorHandling, executeBulkOperation, isLoading, hasError, error, clearError } =
    useReceivablesError({
      showToast: true,
      trackProgress: true,
      autoRetry: true,
      maxRetries: 2,
    });

  useEffect(() => {
    loadCollectionsData();
    loadCollectors();
  }, [filters]);

  const loadCollectionsData = async (isRefresh = false) => {
    const operationId = `load-collections-${Date.now()}`;

    const response = await executeWithErrorHandling(
      async () => {
        // Load overdue receivables with filters
        const receivablesResponse = await receivablesService.getReceivablesWithErrorHandling({
          status: 'overdue',
          ordering: '-days_overdue,-balance',
          ...filters,
        });

        return receivablesResponse;
      },
      RECEIVABLES_ERROR_CONTEXTS.LOAD_COLLECTIONS_DATA,
      operationId,
      {
        showSuccessToast: isRefresh,
        successMessage: 'Collections data refreshed',
      }
    );

    if (response) {
      const overdueData = response.results || [];
      setOverdueReceivables(overdueData);

      // Calculate collection metrics
      const totalOverdue = overdueData.reduce(
        (sum: number, r: CustomerReceivable) => sum + parseFloat(r.balance),
        0
      );

      const overdueCount = overdueData.length;
      const assignedCount = overdueData.filter(r => r.assigned_to).length;
      const unassignedCount = overdueCount - assignedCount;

      // Calculate aging breakdown
      const agingBreakdown = {
        '1-30': { amount: 0, count: 0 },
        '31-60': { amount: 0, count: 0 },
        '61-90': { amount: 0, count: 0 },
        '90+': { amount: 0, count: 0 },
      };

      overdueData.forEach((r: CustomerReceivable) => {
        const bucket = r.aging_bucket as keyof typeof agingBreakdown;
        if (bucket !== 'current') {
          agingBreakdown[bucket].amount += parseFloat(r.balance);
          agingBreakdown[bucket].count += 1;
        }
      });

      // Calculate collector performance
      const collectorMap = new Map();
      overdueData.forEach((r: CustomerReceivable) => {
        if (r.assigned_to) {
          const collectorId = r.assigned_to.id;
          if (!collectorMap.has(collectorId)) {
            collectorMap.set(collectorId, {
              collector: r.assigned_to,
              assigned_count: 0,
              resolved_count: 0, // Would need activity logs to calculate
              total_amount: 0,
              effectiveness: 0,
            });
          }
          const collector = collectorMap.get(collectorId);
          collector.assigned_count += 1;
          collector.total_amount += parseFloat(r.balance);
        }
      });

      const collectorPerformance = Array.from(collectorMap.values());

      // Create escalation queue (high priority overdue items)
      const escalationQueue = overdueData
        .filter(r => r.days_overdue > 30 || parseFloat(r.balance) > 500000)
        .slice(0, 10)
        .map(r => ({
          id: r.id,
          client_name: r.client_name,
          balance: parseFloat(r.balance),
          days_overdue: r.days_overdue,
          aging_bucket: r.aging_bucket,
          last_contact: r.last_reminder_sent,
          escalation_level: r.days_overdue > 90 ? 3 : r.days_overdue > 60 ? 2 : 1,
          priority:
            r.days_overdue > 90 || parseFloat(r.balance) > 1000000
              ? ('high' as const)
              : r.days_overdue > 60 || parseFloat(r.balance) > 500000
                ? ('medium' as const)
                : ('low' as const),
        }));

      // Mock recent activity (would come from activity logs API)
      const recentActivity = [
        {
          id: 1,
          client_name: 'Sample Client',
          activity_type: 'contact_attempt',
          description: 'Phone call attempted - no answer',
          performed_by: 'John Collector',
          created_at: new Date().toISOString(),
        },
      ];

      setMetrics({
        totalOverdue,
        overdueCount,
        assignedCount,
        unassignedCount,
        collectionEffectiveness: assignedCount > 0 ? (assignedCount / overdueCount) * 100 : 0,
        averageResolutionDays: 45, // Mock value
        agingBreakdown,
        collectorPerformance,
        escalationQueue,
        recentActivity,
      });
    }
  };

  const loadCollectors = async () => {
    await executeWithErrorHandling(
      async () => {
        try {
          const response = await userManagementService.getUsers();

          // Handle different response formats
          let users = [];
          if (Array.isArray(response)) {
            users = response;
          } else if (response && Array.isArray(response.results)) {
            users = response.results;
          } else if (response && Array.isArray(response.data)) {
            users = response.data;
          } else {
            console.warn('Unexpected users response format:', response);
            users = [];
          }

          // Filter for active users who can be collectors
          const activeCollectors = users.filter(
            user =>
              user &&
              user.is_active &&
              user.role_names &&
              (user.role_names.includes('Collections') || user.role_names.includes('Finance'))
          );

          setCollectors(activeCollectors);
          return activeCollectors;
        } catch (error) {
          console.error('Error loading collectors:', error);
          setCollectors([]);
          return [];
        }
      },
      'load-collectors',
      `load-collectors-${Date.now()}`,
      {
        showSuccessToast: false,
      }
    );
  };

  const handleAssignCollector = async (receivableIds: number[], collectorId: number) => {
    const collector = collectors.find(c => c.id === collectorId);
    if (!collector) {
      return;
    }

    const operationId = `assign-collector-${Date.now()}`;

    const result = await executeBulkOperation(
      receivableIds,
      async receivableId => {
        await receivablesService.assignCollector(receivableId, {
          assigned_to: collectorId,
          notes: `Assigned to ${collector.full_name} for collection follow-up`,
        });
        return receivableId;
      },
      RECEIVABLES_ERROR_CONTEXTS.BULK_ASSIGN_COLLECTOR,
      operationId,
      {
        batchSize: 3,
        continueOnError: true,
        showSuccessToast: true,
        successMessage: `Receivables assigned to ${collector.full_name}`,
      }
    );

    if (result) {
      setSelectedReceivables([]);
      setShowAssignModal(false);
      loadCollectionsData(true);
    }
  };

  const handleSendReminder = async (receivableId: number) => {
    const operationId = `send-reminder-${receivableId}-${Date.now()}`;

    const result = await executeWithErrorHandling(
      () =>
        receivablesService.sendReminderWithErrorHandling(receivableId, {
          reminder_type: 'email',
          template: 'overdue_reminder',
          custom_message:
            'Please settle your outstanding balance to avoid further collection action.',
        }),
      RECEIVABLES_ERROR_CONTEXTS.SEND_REMINDER,
      operationId,
      {
        showSuccessToast: true,
        successMessage: 'Reminder sent successfully',
      }
    );

    if (result) {
      loadCollectionsData(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-100';
      case 'medium':
        return 'text-orange-600 bg-orange-100';
      case 'low':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case '1-30':
        return 'text-yellow-600 bg-yellow-100';
      case '31-60':
        return 'text-orange-600 bg-orange-100';
      case '61-90':
        return 'text-red-600 bg-red-100';
      case '90+':
        return 'text-red-800 bg-red-200';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // Enhanced error handling with loading overlay
  if (isLoading) {
    return (
      <LoadingOverlay
        isLoading={true}
        message="Loading collections data..."
        size="lg"
        variant="spinner"
        overlay={false}
      />
    );
  }

  // Error state with retry functionality
  if (hasError && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to Load Collections Data
          </h2>
          <p className="text-gray-600 mb-4">
            {error?.message || 'Unable to load collections dashboard.'}
          </p>
          <div className="space-y-3">
            <RetryButton
              onRetry={() => loadCollectionsData()}
              variant="primary"
              size="lg"
              maxRetries={3}
              showRetryCount={true}
            >
              Retry Loading
            </RetryButton>
            <div>
              <button
                onClick={() => navigate('/receivables')}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Go to Receivables List
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-gray-200 pb-4 space-y-3 sm:space-y-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Collections Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage overdue receivables and collection activities
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => loadCollectionsData(true)}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {selectedReceivables.length > 0 && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Assign ({selectedReceivables.length})</span>
              <span className="sm:hidden">Assign</span>
            </button>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Total Overdue</h3>
              <p className="text-lg sm:text-2xl font-bold text-red-600 truncate">
                {metrics ? formatCurrency(metrics.totalOverdue) : '?0'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">
                {metrics ? `${metrics.overdueCount} accounts` : '0 accounts'}
              </p>
            </div>
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Assigned</h3>
              <p className="text-lg sm:text-2xl font-bold text-blue-600 truncate">
                {metrics ? metrics.assignedCount : 0}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">
                {metrics ? `${metrics.unassignedCount} unassigned` : '0 unassigned'}
              </p>
            </div>
            <UserCheck className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Collection Rate</h3>
              <p className="text-lg sm:text-2xl font-bold text-green-600 truncate">
                {metrics ? `${metrics.collectionEffectiveness.toFixed(1)}%` : '0%'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">
                {metrics ? `${metrics.averageResolutionDays} avg days` : '0 avg days'}
              </p>
            </div>
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">This Month</h3>
              <p className="text-lg sm:text-2xl font-bold text-purple-600 truncate">
                {metrics ? formatCurrency(metrics.totalOverdue * 0.15) : '?0'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">collected</p>
            </div>
            <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* Aging Breakdown */}
      {metrics && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Overdue Aging Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(metrics.agingBreakdown).map(([bucket, data]) => (
              <div key={bucket} className="text-center p-4 border rounded-lg">
                <div
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${getAgingColor(bucket)}`}
                >
                  {bucket} days
                </div>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(data.amount)}</p>
                <p className="text-sm text-gray-500">{data.count} accounts</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Escalation Queue */}
        {metrics && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Escalation Queue</h3>
              <span className="text-sm text-gray-500">
                {metrics.escalationQueue?.length || 0} items
              </span>
            </div>
            {metrics.escalationQueue && metrics.escalationQueue.length > 0 ? (
              <div className="space-y-3">
                {metrics.escalationQueue.slice(0, 5).map(item => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/receivables/${item.id}`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900">{item.client_name}</p>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}
                        >
                          {item.priority.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{item.days_overdue} days overdue</span>
                        <span>�</span>
                        <span>Level {item.escalation_level}</span>
                        {item.last_contact && (
                          <>
                            <span>�</span>
                            <span>
                              Last contact: {new Date(item.last_contact).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">
                        {formatCurrency(item.balance)}
                      </p>
                      <ChevronRight className="h-4 w-4 text-gray-400 inline" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No items in escalation queue</p>
              </div>
            )}
          </div>
        )}

        {/* Collector Performance */}
        {metrics && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Collector Performance</h3>
              <button
                onClick={() => navigate('/receivables/collectors')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View All
              </button>
            </div>
            {metrics.collectorPerformance && metrics.collectorPerformance.length > 0 ? (
              <div className="space-y-3">
                {metrics.collectorPerformance.slice(0, 5).map(collector => (
                  <div
                    key={collector.collector.id}
                    className="flex justify-between items-center p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{collector.collector.full_name}</p>
                      <p className="text-sm text-gray-600">
                        {collector.assigned_count} assigned � {collector.resolved_count} resolved
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(collector.total_amount)}
                      </p>
                      <p className="text-sm text-green-600">
                        {collector.effectiveness.toFixed(1)}% effective
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No collector assignments yet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overdue Receivables List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Overdue Receivables</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={filters.search || ''}
                  onChange={e => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filters.aging_bucket || ''}
                onChange={e =>
                  setFilters({ ...filters, aging_bucket: e.target.value || undefined })
                }
              >
                <option value="">All Ages</option>
                <option value="1-30">1-30 days</option>
                <option value="31-60">31-60 days</option>
                <option value="61-90">61-90 days</option>
                <option value="90+">90+ days</option>
              </select>
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filters.assigned_to || ''}
                onChange={e =>
                  setFilters({
                    ...filters,
                    assigned_to: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              >
                <option value="">All Collectors</option>
                <option value="0">Unassigned</option>
                {collectors.map(collector => (
                  <option key={collector.id} value={collector.id}>
                    {collector.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={
                      selectedReceivables.length === overdueReceivables.length &&
                      overdueReceivables.length > 0
                    }
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedReceivables(overdueReceivables.map(r => r.id));
                      } else {
                        setSelectedReceivables([]);
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Overdue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {overdueReceivables.map(receivable => (
                <tr key={receivable.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedReceivables.includes(receivable.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedReceivables([...selectedReceivables, receivable.id]);
                        } else {
                          setSelectedReceivables(
                            selectedReceivables.filter(id => id !== receivable.id)
                          );
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{receivable.client_name}</p>
                      <p className="text-sm text-gray-500">{receivable.reference_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-bold text-red-600">
                      {formatCurrency(parseFloat(receivable.balance))}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getAgingColor(receivable.aging_bucket)}`}
                    >
                      {receivable.days_overdue} days
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {receivable.assigned_to ? (
                      <p className="text-sm text-gray-900">{receivable.assigned_to.full_name}</p>
                    ) : (
                      <span className="text-sm text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {receivable.last_reminder_sent ? (
                      <p className="text-sm text-gray-600">
                        {new Date(receivable.last_reminder_sent).toLocaleDateString()}
                      </p>
                    ) : (
                      <span className="text-sm text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/receivables/${receivable.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleSendReminder(receivable.id)}
                        className="text-orange-600 hover:text-orange-900"
                        title="Send Reminder"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedReceivables([receivable.id]);
                          setShowAssignModal(true);
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="Assign Collector"
                      >
                        <UserPlus className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {overdueReceivables.length === 0 && (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Overdue Receivables</h3>
            <p className="text-gray-500">
              All receivables are current or there are no receivables matching your filters.
            </p>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Assign Collector ({selectedReceivables.length} receivable
              {selectedReceivables.length !== 1 ? 's' : ''})
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Collector
                </label>
                <select
                  value={assigningTo || ''}
                  onChange={e => setAssigningTo(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose a collector...</option>
                  {collectors.map(collector => (
                    <option key={collector.id} value={collector.id}>
                      {collector.full_name} ({collector.role_names.join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setAssigningTo(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (assigningTo) {
                    handleAssignCollector(selectedReceivables, assigningTo);
                  }
                }}
                disabled={!assigningTo}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionsDashboard;
