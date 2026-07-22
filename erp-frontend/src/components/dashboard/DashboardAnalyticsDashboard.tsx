// Dashboard Analytics Dashboard - Analytics and usage metrics for dashboard assignments
import React, { useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  MousePointer,
  Eye,
  Activity,
  Zap,
  AlertCircle,
  Download,
  Calendar,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserRole } from '../../types/roles';
import {
  DashboardUsageAnalytics,
  DashboardAnalyticsDashboardProps,
} from '../../types/dashboardAssignment';
import { dashboardAnalyticsService } from '../../services/dashboardAssignmentService';
import { UsageAnalyticsChart } from './UsageAnalyticsChart';
import { useQuery } from '@tanstack/react-query';

interface DateRange {
  from: Date;
  to: Date;
}

export const DashboardAnalyticsDashboard: React.FC<DashboardAnalyticsDashboardProps> = ({
  className = '',
  templateId,
  roleId,
  dateRange: initialDateRange,
}) => {
  const [dateRange, setDateRange] = useState<DateRange>(
    initialDateRange || {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date(),
    }
  );

  const [selectedMetric, setSelectedMetric] = useState<'usage' | 'interactions' | 'performance'>(
    'usage'
  );
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const { data: analytics = [], isLoading: isLoadingAnalytics, error: analyticsError } = useQuery({
    queryKey: ['dashboard', 'analytics', templateId, roleId, dateRange],
    queryFn: async () => {
      if (templateId) {
        return dashboardAnalyticsService.getDashboardUsageAnalytics(templateId, dateRange);
      } else if (roleId) {
        return dashboardAnalyticsService.getRoleUsageAnalytics(roleId, dateRange);
      } else {
        return dashboardAnalyticsService.getDashboardUsageAnalytics('director-template', dateRange);
      }
    },
  });

  const { data: popularWidgets = [] } = useQuery({
    queryKey: ['dashboard', 'analytics', 'popularWidgets', templateId, roleId],
    queryFn: async () => {
      const result = await dashboardAnalyticsService.getPopularWidgets(templateId, roleId);
      return result.slice(0, 10);
    },
  });

  const { data: popularActions = [] } = useQuery({
    queryKey: ['dashboard', 'analytics', 'popularActions', templateId, roleId],
    queryFn: async () => {
      const result = await dashboardAnalyticsService.getPopularQuickActions(templateId, roleId);
      return result.slice(0, 10);
    },
  });

  const { data: performanceMetrics = { avgLoadTime: 0, errorRate: 0, userSatisfaction: 0 } } = useQuery({
    queryKey: ['dashboard', 'analytics', 'performance', templateId],
    queryFn: async () => {
      if (templateId) {
        return dashboardAnalyticsService.getDashboardPerformanceMetrics(templateId);
      }
      return { avgLoadTime: 0, errorRate: 0, userSatisfaction: 0 };
    },
    enabled: !!templateId,
  });

  const isLoading = isLoadingAnalytics;
  const error = analyticsError?.message || null;

  const handleDateRangeChange = useCallback((newRange: DateRange) => {
    setDateRange(newRange);
  }, []);

  const handleExportData = useCallback(() => {
    const data = {
      analytics,
      popularWidgets,
      popularActions,
      performanceMetrics,
      dateRange,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-analytics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analytics, popularWidgets, popularActions, performanceMetrics, dateRange]);

  // Calculate summary metrics
  const summaryMetrics = React.useMemo(() => {
    const totalViews = analytics.reduce((sum, a) => sum + a.viewCount, 0);
    const totalUsers = new Set(analytics.map(a => a.userId)).size;
    const totalTimeSpent = analytics.reduce((sum, a) => sum + a.totalTimeSpent, 0);
    const avgSessionTime = totalViews > 0 ? totalTimeSpent / totalViews : 0;

    const totalInteractions = analytics.reduce((sum, a) => {
      const widgetInteractions = Object.values(a.widgetInteractions).reduce((s, c) => s + c, 0);
      const actionClicks = Object.values(a.quickActionClicks).reduce((s, c) => s + c, 0);
      return sum + widgetInteractions + actionClicks;
    }, 0);

    return {
      totalViews,
      totalUsers,
      avgSessionTime: Math.round(avgSessionTime / 60),
      totalInteractions,
      engagementRate: totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0,
    };
  }, [analytics]);

  // Group analytics data by time period
  const groupedAnalytics = React.useMemo(() => {
    const grouped: Record<string, DashboardUsageAnalytics[]> = {};

    analytics.forEach(item => {
      let key: string;
      const date = new Date(item.lastAccessed);

      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        }
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    });

    return grouped;
  }, [analytics, groupBy]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        <div className="flex items-center space-x-2 text-gray-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Dashboard Analytics</h3>
          <p className="text-sm text-gray-600">
            Usage metrics and performance insights
            {templateId && ` for ${templateId}`}
            {roleId && ` for ${roleId} role`}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Date Range Selector */}
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={`${Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / (24 * 60 * 60 * 1000))}`}
              onChange={e => {
                const days = parseInt(e.target.value);
                const to = new Date();
                const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
                handleDateRangeChange({ from, to });
              }}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>

          {/* Group By Selector */}
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>

          <button
            onClick={handleExportData}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="ml-3 text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center">
            <Eye className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-900">Total Views</p>
              <p className="text-2xl font-bold text-blue-600">
                {summaryMetrics.totalViews.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-900">Active Users</p>
              <p className="text-2xl font-bold text-green-600">{summaryMetrics.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-purple-900">Avg Session</p>
              <p className="text-2xl font-bold text-purple-600">{summaryMetrics.avgSessionTime}m</p>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4">
          <div className="flex items-center">
            <MousePointer className="h-8 w-8 text-orange-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-orange-900">Interactions</p>
              <p className="text-2xl font-bold text-orange-600">
                {summaryMetrics.totalInteractions.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-lg p-4">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-indigo-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-indigo-900">Engagement</p>
              <p className="text-2xl font-bold text-indigo-600">
                {summaryMetrics.engagementRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      {templateId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Avg Load Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {performanceMetrics.avgLoadTime.toFixed(0)}ms
                </p>
              </div>
              <Zap
                className={cn(
                  'h-8 w-8',
                  performanceMetrics.avgLoadTime < 1000
                    ? 'text-green-500'
                    : performanceMetrics.avgLoadTime < 2000
                      ? 'text-yellow-500'
                      : 'text-red-500'
                )}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Error Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {performanceMetrics.errorRate.toFixed(1)}%
                </p>
              </div>
              <AlertCircle
                className={cn(
                  'h-8 w-8',
                  performanceMetrics.errorRate < 1
                    ? 'text-green-500'
                    : performanceMetrics.errorRate < 5
                      ? 'text-yellow-500'
                      : 'text-red-500'
                )}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">User Satisfaction</p>
                <p className="text-2xl font-bold text-gray-900">
                  {performanceMetrics.userSatisfaction.toFixed(0)}%
                </p>
              </div>
              <Activity
                className={cn(
                  'h-8 w-8',
                  performanceMetrics.userSatisfaction > 80
                    ? 'text-green-500'
                    : performanceMetrics.userSatisfaction > 60
                      ? 'text-yellow-500'
                      : 'text-red-500'
                )}
              />
            </div>
          </div>
        </div>
      )}

      {/* Chart Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-gray-900">Usage Trends</h4>
          <div className="flex items-center space-x-2">
            {[
              { id: 'usage', label: 'Usage', icon: Eye },
              { id: 'interactions', label: 'Interactions', icon: MousePointer },
              { id: 'performance', label: 'Performance', icon: Zap },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSelectedMetric(id as any)}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors',
                  selectedMetric === id
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <UsageAnalyticsChart
          analytics={analytics}
          chartType={selectedMetric}
          className="h-64"
        />
      </div>

      {/* Popular Widgets and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Widgets */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Popular Widgets</h4>
          <div className="space-y-3">
            {popularWidgets.slice(0, 8).map((widget, index) => (
              <div key={widget.widgetId} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs font-medium mr-3">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{widget.widgetId}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {widget.interactionCount} interactions
                  </span>
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (widget.interactionCount / Math.max(...popularWidgets.map(w => w.interactionCount))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Popular Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Popular Quick Actions</h4>
          <div className="space-y-3">
            {popularActions.slice(0, 8).map((action, index) => (
              <div key={action.actionId} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full text-xs font-medium mr-3">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{action.actionId}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">{action.clickCount} clicks</span>
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (action.clickCount / Math.max(...popularActions.map(a => a.clickCount))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* No Data State */}
      {analytics.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No analytics data</h3>
          <p className="mt-1 text-sm text-gray-500">
            Analytics data will appear here once users start interacting with dashboards.
          </p>
        </div>
      )}
    </div>
  );
};

export default DashboardAnalyticsDashboard;
