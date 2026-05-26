// src/pages/receivables/PaymentTrends.tsx
import React, { useState, useEffect } from 'react';
import { receivablesService } from '../../services/receivablesService';
import { useToast } from '../../hooks/useToast';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Users,
  AlertTriangle,
  Target,
  Clock,
  CreditCard,
  BarChart3,
  RefreshCw,
  Download,
  Filter,
  Eye,
} from 'lucide-react';

interface PaymentTrendsData {
  payment_volume_trend: Array<{
    period: string;
    total_payments: string;
    payment_count: number;
    average_payment: string;
  }>;
  collection_effectiveness: Array<{
    period: string;
    invoices_created: number;
    invoices_paid: number;
    effectiveness_rate: number;
    average_days_to_collect: number;
  }>;
  customer_payment_patterns: Array<{
    client_id: number;
    client_name: string;
    total_invoices: number;
    total_paid: number;
    average_days_to_pay: number;
    payment_consistency: number;
    preferred_payment_method: string;
  }>;
  aging_trend: Array<{
    period: string;
    current: string;
    overdue_1_30: string;
    overdue_31_60: string;
    overdue_61_90: string;
    overdue_90_plus: string;
  }>;
  payment_method_breakdown: Array<{
    method: string;
    count: number;
    total_amount: string;
    percentage: number;
  }>;
  predictive_analytics: {
    expected_collections_next_30_days: string;
    at_risk_receivables: Array<{
      client_id: number;
      client_name: string;
      amount: string;
      risk_score: number;
      predicted_collection_date: string;
    }>;
    seasonal_trends: Array<{
      month: string;
      historical_average: string;
      current_year: string;
      variance_percentage: number;
    }>;
  };
}

interface Filters {
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  start_date: string;
  end_date: string;
  client?: number;
  branch?: number;
}

const PaymentTrends: React.FC = () => {
  const [data, setData] = useState<PaymentTrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'patterns' | 'predictive'>(
    'overview'
  );
  const [filters, setFilters] = useState<Filters>({
    period: 'monthly',
    start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });
  const [showFilters, setShowFilters] = useState(false);
  const { error: showError, success: showSuccess } = useToast();

  useEffect(() => {
    loadPaymentTrends();
  }, [filters]);

  const loadPaymentTrends = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const trendsData = await receivablesService.getPaymentTrends(filters);
      setData(trendsData);

      if (isRefresh) {
        showSuccess('Payment trends data refreshed');
      }
    } catch (error) {
      console.error('Error loading payment trends:', error);
      showError('Failed to load payment trends data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const refreshData = () => {
    loadPaymentTrends(true);
  };

  const exportData = () => {
    if (!data) return;

    // Create CSV data
    const csvData = [
      ['Payment Trends Report'],
      ['Generated:', new Date().toLocaleDateString()],
      ['Period:', `${filters.start_date} to ${filters.end_date}`],
      [''],
      ['Payment Volume Trend'],
      ['Period', 'Total Payments', 'Payment Count', 'Average Payment'],
      ...data.payment_volume_trend.map(item => [
        item.period,
        item.total_payments,
        item.payment_count.toString(),
        item.average_payment,
      ]),
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-trends-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showSuccess('Payment trends data exported');
  };

  // Chart colors
  const colors = {
    primary: '#3B82F6',
    secondary: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    purple: '#8B5CF6',
    indigo: '#6366F1',
  };

  const pieColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600">Unable to load payment trends data.</p>
          <button
            onClick={() => loadPaymentTrends()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Trends & Analytics</h1>
          <p className="text-gray-600">
            Comprehensive analysis of payment patterns and collection effectiveness
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={refreshData}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Filter Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
              <select
                value={filters.period}
                onChange={e => setFilters({ ...filters, period: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={e => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={e => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setShowFilters(false)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'trends', label: 'Payment Trends', icon: TrendingUp },
              { id: 'patterns', label: 'Customer Patterns', icon: Users },
              { id: 'predictive', label: 'Predictive Analytics', icon: Target },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium opacity-90 mb-1">Total Collections</h3>
                      <p className="text-2xl font-bold">
                        {formatCurrency(
                          data.payment_volume_trend.reduce(
                            (sum, item) => sum + parseFloat(item.total_payments),
                            0
                          )
                        )}
                      </p>
                      <p className="text-xs opacity-75 mt-1">Last 12 months</p>
                    </div>
                    <DollarSign className="h-8 w-8 opacity-80" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium opacity-90 mb-1">Collection Rate</h3>
                      <p className="text-2xl font-bold">
                        {formatPercentage(
                          data.collection_effectiveness.reduce(
                            (sum, item) => sum + item.effectiveness_rate,
                            0
                          ) / data.collection_effectiveness.length
                        )}
                      </p>
                      <p className="text-xs opacity-75 mt-1">Average effectiveness</p>
                    </div>
                    <Target className="h-8 w-8 opacity-80" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium opacity-90 mb-1">Avg Days to Collect</h3>
                      <p className="text-2xl font-bold">
                        {Math.round(
                          data.collection_effectiveness.reduce(
                            (sum, item) => sum + item.average_days_to_collect,
                            0
                          ) / data.collection_effectiveness.length
                        )}
                      </p>
                      <p className="text-xs opacity-75 mt-1">Days average</p>
                    </div>
                    <Clock className="h-8 w-8 opacity-80" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium opacity-90 mb-1">At Risk Amount</h3>
                      <p className="text-2xl font-bold">
                        {formatCurrency(
                          data.predictive_analytics.at_risk_receivables.reduce(
                            (sum, item) => sum + parseFloat(item.amount),
                            0
                          )
                        )}
                      </p>
                      <p className="text-xs opacity-75 mt-1">High risk receivables</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 opacity-80" />
                  </div>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Methods</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={data.payment_method_breakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ method, percentage }) => `${method}: ${percentage}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="percentage"
                      >
                        {data.payment_method_breakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Method Details</h3>
                  <div className="space-y-3">
                    {data.payment_method_breakdown.map((method, index) => (
                      <div
                        key={method.method}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: pieColors[index % pieColors.length] }}
                          ></div>
                          <div>
                            <p className="font-medium text-gray-900">{method.method}</p>
                            <p className="text-sm text-gray-600">{method.count} transactions</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
                            {formatCurrency(method.total_amount)}
                          </p>
                          <p className="text-sm text-gray-600">{method.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment Trends Tab */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              {/* Payment Volume Trend */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Volume Trend</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={data.payment_volume_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="total_payments"
                      stroke={colors.primary}
                      fill={colors.primary}
                      fillOpacity={0.3}
                      name="Total Payments"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Collection Effectiveness */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Collection Effectiveness</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={data.collection_effectiveness}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="invoices_created"
                      fill={colors.secondary}
                      name="Invoices Created"
                    />
                    <Bar dataKey="invoices_paid" fill={colors.primary} name="Invoices Paid" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Aging Trend */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Aging Trend Analysis</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={data.aging_trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="current"
                      stackId="1"
                      stroke="#10B981"
                      fill="#10B981"
                      name="Current"
                    />
                    <Area
                      type="monotone"
                      dataKey="overdue_1_30"
                      stackId="1"
                      stroke="#F59E0B"
                      fill="#F59E0B"
                      name="1-30 Days"
                    />
                    <Area
                      type="monotone"
                      dataKey="overdue_31_60"
                      stackId="1"
                      stroke="#F97316"
                      fill="#F97316"
                      name="31-60 Days"
                    />
                    <Area
                      type="monotone"
                      dataKey="overdue_61_90"
                      stackId="1"
                      stroke="#EF4444"
                      fill="#EF4444"
                      name="61-90 Days"
                    />
                    <Area
                      type="monotone"
                      dataKey="overdue_90_plus"
                      stackId="1"
                      stroke="#DC2626"
                      fill="#DC2626"
                      name="90+ Days"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Customer Patterns Tab */}
          {activeTab === 'patterns' && (
            <div className="space-y-6">
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Customer Payment Patterns
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Invoices
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Days to Pay
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Consistency
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Preferred Method
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.customer_payment_patterns.map(customer => (
                        <tr key={customer.client_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {customer.client_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {customer.total_paid}/{customer.total_invoices}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatPercentage(
                                (customer.total_paid / customer.total_invoices) * 100
                              )}{' '}
                              paid
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{
                                    width: `${(customer.total_paid / customer.total_invoices) * 100}%`,
                                  }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-900">
                                {formatPercentage(
                                  (customer.total_paid / customer.total_invoices) * 100
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                customer.average_days_to_pay <= 20
                                  ? 'bg-green-100 text-green-800'
                                  : customer.average_days_to_pay <= 35
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {customer.average_days_to_pay} days
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    customer.payment_consistency >= 90
                                      ? 'bg-green-600'
                                      : customer.payment_consistency >= 75
                                        ? 'bg-yellow-600'
                                        : 'bg-red-600'
                                  }`}
                                  style={{ width: `${customer.payment_consistency}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-900">
                                {customer.payment_consistency}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <CreditCard className="h-3 w-3" />
                              {customer.preferred_payment_method.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button className="text-blue-600 hover:text-blue-900 flex items-center gap-1">
                              <Eye className="h-4 w-4" />
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Predictive Analytics Tab */}
          {activeTab === 'predictive' && (
            <div className="space-y-6">
              {/* Expected Collections */}
              <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium mb-2">
                      Expected Collections (Next 30 Days)
                    </h3>
                    <p className="text-3xl font-bold">
                      {formatCurrency(data.predictive_analytics.expected_collections_next_30_days)}
                    </p>
                    <p className="text-sm opacity-90 mt-2">
                      Based on historical payment patterns and current receivables
                    </p>
                  </div>
                  <Target className="h-12 w-12 opacity-80" />
                </div>
              </div>

              {/* At Risk Receivables */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">At Risk Receivables</h3>
                <div className="space-y-4">
                  {data.predictive_analytics.at_risk_receivables.map(receivable => (
                    <div
                      key={receivable.client_id}
                      className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-2 rounded-full ${
                            receivable.risk_score >= 80
                              ? 'bg-red-100 text-red-600'
                              : receivable.risk_score >= 70
                                ? 'bg-orange-100 text-orange-600'
                                : 'bg-yellow-100 text-yellow-600'
                          }`}
                        >
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{receivable.client_name}</p>
                          <p className="text-sm text-gray-600">
                            Risk Score: {receivable.risk_score}% | Predicted Collection:{' '}
                            {new Date(receivable.predicted_collection_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">
                          {formatCurrency(receivable.amount)}
                        </p>
                        <button className="text-sm text-blue-600 hover:text-blue-800">
                          Take Action
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seasonal Trends */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Seasonal Trends Analysis</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={data.predictive_analytics.seasonal_trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="historical_average"
                      fill={colors.secondary}
                      name="Historical Average"
                    />
                    <Bar dataKey="current_year" fill={colors.primary} name="Current Year" />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.predictive_analytics.seasonal_trends.map(trend => (
                    <div key={trend.month} className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium text-gray-900">{trend.month}</p>
                      <p
                        className={`text-sm font-medium ${
                          trend.variance_percentage > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {trend.variance_percentage > 0 ? '+' : ''}
                        {formatPercentage(trend.variance_percentage)}
                      </p>
                      <p className="text-xs text-gray-500">vs historical</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentTrends;
