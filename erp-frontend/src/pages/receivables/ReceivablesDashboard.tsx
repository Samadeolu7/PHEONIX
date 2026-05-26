// src/pages/receivables/ReceivablesDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receivablesService, CustomerReceivable } from '../../services/receivablesService';
import { useToast } from '../../hooks/useToast';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Users,
  Calendar,
  FileText,
  Eye,
  CreditCard,
  BarChart3,
  Plus,
} from 'lucide-react';
import UnifiedPaymentModal from '../../components/modals/UnifiedPaymentModal';

interface DashboardMetrics {
  totalReceivables: number;
  currentAmount: number;
  overdueAmount: number;
  collectionEffectiveness: number;
  averageDaysToCollect: number;
  agingBreakdown: {
    current: { amount: number; percentage: number; count: number };
    '1-30': { amount: number; percentage: number; count: number };
    '31-60': { amount: number; percentage: number; count: number };
    '61-90': { amount: number; percentage: number; count: number };
    '90+': { amount: number; percentage: number; count: number };
  };
  topOverdueCustomers: Array<{
    id: number;
    client_name: string;
    balance: number;
    days_overdue: number;
    aging_bucket: string;
    last_payment_date?: string;
  }>;
  recentActivity: Array<{
    id: number;
    client_name: string;
    amount: number;
    activity_date: string;
    activity_type: string;
    description: string;
  }>;
  monthlyTrend: Array<{
    month: string;
    collected: number;
    outstanding: number;
  }>;
}

const ReceivablesDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<CustomerReceivable | null>(null);
  const navigate = useNavigate();
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    loadDashboardData();

    // Set up auto-refresh every 5 minutes for real-time aging
    const interval = setInterval(
      () => {
        loadDashboardData(true);
      },
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Load receivables data with proper error handling
      // Trust backend-computed aging, status, and balance instead of recalculating on frontend
      const receivablesResponse = await receivablesService.getReceivables({
        page: 1,
        ordering: '-days_overdue,-balance',
      });

      const updatedReceivables = receivablesResponse.results || [];

      // Calculate comprehensive metrics
      const totalReceivables = updatedReceivables.reduce(
        (sum: number, r: CustomerReceivable) => sum + parseFloat(r.balance),
        0
      );

      const currentAmount = updatedReceivables
        .filter((r: CustomerReceivable) => r.aging_bucket === 'current')
        .reduce((sum: number, r: CustomerReceivable) => sum + parseFloat(r.balance), 0);

      const overdueAmount = totalReceivables - currentAmount;

      // Calculate aging breakdown with counts
      const agingBuckets = ['current', '1-30', '31-60', '61-90', '90+'] as const;
      const agingBreakdown = agingBuckets.reduce(
        (acc, bucket) => {
          const bucketReceivables = updatedReceivables.filter(
            (r: CustomerReceivable) => r.aging_bucket === bucket
          );
          const amount = bucketReceivables.reduce(
            (sum: number, r: CustomerReceivable) => sum + parseFloat(r.balance),
            0
          );

          acc[bucket] = {
            amount,
            percentage: totalReceivables > 0 ? (amount / totalReceivables) * 100 : 0,
            count: bucketReceivables.length,
          };
          return acc;
        },
        {} as DashboardMetrics['agingBreakdown']
      );

      // Get top overdue customers with enhanced data
      const topOverdueCustomers = updatedReceivables
        .filter((r: CustomerReceivable) => r.status === 'overdue')
        .sort(
          (a: CustomerReceivable, b: CustomerReceivable) =>
            parseFloat(b.balance) - parseFloat(a.balance)
        )
        .slice(0, 5)
        .map((r: CustomerReceivable) => ({
          id: r.id,
          client_name: r.client_name,
          balance: parseFloat(r.balance),
          days_overdue: r.days_overdue,
          aging_bucket: r.aging_bucket,
          last_payment_date: r.updated_at, // Placeholder - would need payment history
        }));

      // Calculate collection effectiveness (mock calculation)
      const paidReceivables = updatedReceivables.filter(r => r.status === 'paid').length;
      const collectionEffectiveness =
        updatedReceivables.length > 0 ? (paidReceivables / updatedReceivables.length) * 100 : 0;

      // Calculate average days to collect (mock calculation)
      const averageDaysToCollect =
        updatedReceivables
          .filter(r => r.status === 'paid')
          .reduce((sum, r) => sum + r.days_overdue, 0) / Math.max(paidReceivables, 1);

      // Mock recent activity data (would come from activity logs API)
      const recentActivity = [
        {
          id: 1,
          client_name: 'Sample Client',
          amount: 50000,
          activity_date: new Date().toISOString(),
          activity_type: 'payment',
          description: 'Payment received',
        },
      ];

      // Mock monthly trend data
      const monthlyTrend = [
        { month: 'Jan', collected: 2500000, outstanding: 1200000 },
        { month: 'Feb', collected: 2800000, outstanding: 1100000 },
        { month: 'Mar', collected: 2600000, outstanding: 1300000 },
      ];

      setMetrics({
        totalReceivables,
        currentAmount,
        overdueAmount,
        collectionEffectiveness,
        averageDaysToCollect,
        agingBreakdown,
        topOverdueCustomers,
        recentActivity,
        monthlyTrend,
      });

      if (isRefresh) {
        showSuccess('Dashboard data refreshed');
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      showError('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getAgingBarWidth = (percentage: number) => {
    return Math.max(percentage, 2); // Minimum 2% for visibility
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'view-receivables':
        navigate('/receivables');
        break;
      case 'record-payment':
        navigate('/receivables/payments');
        break;
      case 'aging-report':
        navigate('/receivables/aging-report');
        break;
      case 'create-invoice':
        navigate('/sales/invoices/create');
        break;
      case 'statements':
        navigate('/receivables/statements');
        break;
      case 'collections':
        navigate('/receivables/collections');
        break;
      default:
        console.warn('Unknown action:', action);
    }
  };

  const refreshDashboard = () => {
    loadDashboardData(true);
  };

  const handleRecordPayment = (customer: any) => {
    // Convert the customer data to a CustomerReceivable format for the modal
    const receivable: CustomerReceivable = {
      id: customer.id,
      client: customer.id, // Assuming client ID is the same as customer ID
      client_name: customer.client_name,
      receivable_type: 'invoice', // Default to invoice type
      content_type: 0,
      content_type_name: 'invoice',
      object_id: customer.id,
      reference_number: `REC-${customer.id}`, // Generate a reference number
      original_amount: customer.balance.toString(),
      amount_paid: '0.00',
      balance: customer.balance.toString(),
      due_date: new Date().toISOString().split('T')[0], // Default to today
      status: 'overdue',
      aging_bucket: customer.aging_bucket as CustomerReceivable['aging_bucket'],
      days_overdue: customer.days_overdue,
      overdue_interest_rate: '0.00',
      accrued_interest: '0.00',
      last_reminder_sent: undefined,
      reminder_count: 0,
      assigned_to: undefined,
      collection_notes: '',
      activity_logs: [],
      owner: 0,
      branch: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSelectedReceivable(receivable);
    setPaymentModalOpen(true);
  };

  const handlePaymentRecorded = () => {
    // Refresh dashboard data after payment is recorded
    loadDashboardData(true);
    setPaymentModalOpen(false);
    setSelectedReceivable(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600">Unable to load receivables data.</p>
          <button
            onClick={() => loadDashboardData()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-gray-200 pb-4 space-y-3 sm:space-y-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Receivables Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Real-time view of all customer receivables
          </p>
        </div>
        <button
          onClick={refreshDashboard}
          disabled={refreshing}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">
                Total Receivables
              </h3>
              <p className="text-lg sm:text-2xl font-bold text-blue-600 truncate">
                {formatCurrency(metrics.totalReceivables)}
              </p>
            </div>
            <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Current</h3>
              <p className="text-lg sm:text-2xl font-bold text-green-600 truncate">
                {formatCurrency(metrics.currentAmount)}
              </p>
              <p className="text-xs text-gray-500">
                {metrics.totalReceivables > 0
                  ? ((metrics.currentAmount / metrics.totalReceivables) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </div>
            <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Overdue</h3>
              <p className="text-lg sm:text-2xl font-bold text-red-600 truncate">
                {formatCurrency(metrics.overdueAmount)}
              </p>
              <p className="text-xs text-gray-500">
                {metrics.totalReceivables > 0
                  ? ((metrics.overdueAmount / metrics.totalReceivables) * 100).toFixed(1)
                  : 0}
                % of total
              </p>
            </div>
            <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600 flex-shrink-0 ml-2" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Collection Rate</h3>
              <p className="text-lg sm:text-2xl font-bold text-purple-600">
                {metrics.collectionEffectiveness.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                Avg {metrics.averageDaysToCollect.toFixed(0)} days to collect
              </p>
            </div>
            <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 flex-shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* Aging Breakdown */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Aging Breakdown</h3>

        {/* Visual Bar Chart */}
        <div className="mb-4 sm:mb-6">
          <div className="flex h-6 sm:h-8 rounded-lg overflow-hidden">
            <div
              className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${getAgingBarWidth(metrics.agingBreakdown.current.percentage)}%` }}
            >
              {metrics.agingBreakdown.current.percentage > 15 && (
                <span className="hidden sm:inline">Current</span>
              )}
            </div>
            <div
              className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${getAgingBarWidth(metrics.agingBreakdown['1-30'].percentage)}%` }}
            >
              {metrics.agingBreakdown['1-30'].percentage > 15 && (
                <span className="hidden sm:inline">1-30</span>
              )}
            </div>
            <div
              className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${getAgingBarWidth(metrics.agingBreakdown['31-60'].percentage)}%` }}
            >
              {metrics.agingBreakdown['31-60'].percentage > 15 && (
                <span className="hidden sm:inline">31-60</span>
              )}
            </div>
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${getAgingBarWidth(metrics.agingBreakdown['61-90'].percentage)}%` }}
            >
              {metrics.agingBreakdown['61-90'].percentage > 15 && (
                <span className="hidden sm:inline">61-90</span>
              )}
            </div>
            <div
              className="bg-red-700 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${getAgingBarWidth(metrics.agingBreakdown['90+'].percentage)}%` }}
            >
              {metrics.agingBreakdown['90+'].percentage > 15 && (
                <span className="hidden sm:inline">90+</span>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {Object.entries(metrics.agingBreakdown).map(([bucket, data]) => (
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
                {formatCurrency(data.amount)}
              </p>
              <p className="text-xs text-gray-500">{data.percentage.toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout for Overdue Customers and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Overdue Customers */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">
              Top Overdue Customers
            </h3>
            <button
              onClick={() => handleQuickAction('collections')}
              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800"
            >
              View All
            </button>
          </div>
          {metrics.topOverdueCustomers.length > 0 ? (
            <div className="space-y-3">
              {metrics.topOverdueCustomers.map((customer, index) => (
                <div
                  key={customer.id}
                  className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-red-50 rounded-lg border-l-4 border-red-500 hover:bg-red-100 cursor-pointer transition-colors space-y-2 sm:space-y-0"
                  onClick={() => navigate(`/receivables/${customer.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{customer.client_name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-red-600">{customer.days_overdue} days overdue</span>
                      <span className="text-gray-400 hidden sm:inline">•</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          customer.aging_bucket === '1-30'
                            ? 'bg-yellow-100 text-yellow-800'
                            : customer.aging_bucket === '31-60'
                              ? 'bg-orange-100 text-orange-800'
                              : customer.aging_bucket === '61-90'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-red-200 text-red-900'
                        }`}
                      >
                        {customer.aging_bucket} days
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between sm:block sm:text-right">
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(customer.balance)}
                    </p>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleRecordPayment(customer);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 sm:mt-1"
                    >
                      Record Payment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-8 w-8 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm sm:text-base text-gray-500">No overdue customers</p>
              <p className="text-xs sm:text-sm text-gray-400">Great job on collections!</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900">Recent Activity</h3>
            <button
              onClick={() => handleQuickAction('view-receivables')}
              className="text-xs sm:text-sm text-blue-600 hover:text-blue-800"
            >
              View All
            </button>
          </div>
          {metrics.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {metrics.recentActivity.map(activity => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div
                    className={`p-2 rounded-full flex-shrink-0 ${
                      activity.activity_type === 'payment'
                        ? 'bg-green-100 text-green-600'
                        : activity.activity_type === 'invoice'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {activity.activity_type === 'payment' ? (
                      <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : activity.activity_type === 'invoice' ? (
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : (
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                      {activity.client_name}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(activity.activity_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`font-medium text-sm sm:text-base ${
                        activity.activity_type === 'payment' ? 'text-green-600' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(activity.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-8 w-8 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm sm:text-base text-gray-500">No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <button
            onClick={() => handleQuickAction('view-receivables')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            <Eye className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">
              View All
            </span>
            <span className="text-xs text-gray-500 hidden sm:block">Receivables</span>
          </button>

          <button
            onClick={() => handleQuickAction('record-payment')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors"
          >
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">Record</span>
            <span className="text-xs text-gray-500 hidden sm:block">Payment</span>
          </button>

          <button
            onClick={() => handleQuickAction('aging-report')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-orange-50 hover:border-orange-300 transition-colors"
          >
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">Aging</span>
            <span className="text-xs text-gray-500 hidden sm:block">Report</span>
          </button>

          <button
            onClick={() => handleQuickAction('create-invoice')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
          >
            <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">Create</span>
            <span className="text-xs text-gray-500 hidden sm:block">Invoice</span>
          </button>

          <button
            onClick={() => handleQuickAction('statements')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
          >
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">
              Customer
            </span>
            <span className="text-xs text-gray-500 hidden sm:block">Statements</span>
          </button>

          <button
            onClick={() => handleQuickAction('collections')}
            className="flex flex-col items-center p-3 sm:p-4 border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors"
          >
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 mb-2" />
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">
              Collections
            </span>
            <span className="text-xs text-gray-500 hidden sm:block">Management</span>
          </button>
        </div>
      </div>

      {/* Unified Payment Modal */}
      {paymentModalOpen && selectedReceivable && (
        <UnifiedPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setSelectedReceivable(null);
          }}
          receivable={selectedReceivable}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  );
};

export default ReceivablesDashboard;
