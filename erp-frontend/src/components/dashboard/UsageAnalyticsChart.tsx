// Usage Analytics Chart - Chart component for displaying dashboard usage analytics
import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '../../lib/utils';
import { DashboardUsageAnalytics, UsageAnalyticsChartProps } from '../../types/dashboardAssignment';

export const UsageAnalyticsChart: React.FC<UsageAnalyticsChartProps> = ({
  analytics,
  chartType,
  className = '',
}) => {
  // Process analytics data for chart display
  const chartData = React.useMemo(() => {
    // Group analytics by date
    const grouped: Record<
      string,
      {
        date: string;
        views: number;
        users: number;
        interactions: number;
        avgLoadTime: number;
        errorCount: number;
        sessionTime: number;
      }
    > = {};

    analytics.forEach(item => {
      const date = new Date(item.lastAccessed).toISOString().split('T')[0];

      if (!grouped[date]) {
        grouped[date] = {
          date,
          views: 0,
          users: 0,
          interactions: 0,
          avgLoadTime: 0,
          errorCount: 0,
          sessionTime: 0,
        };
      }

      grouped[date].views += item.viewCount;
      grouped[date].users += 1; // Count unique sessions as users

      // Calculate total interactions
      const widgetInteractions = Object.values(item.widgetInteractions).reduce(
        (sum, count) => sum + count,
        0
      );
      const actionClicks = Object.values(item.quickActionClicks).reduce(
        (sum, count) => sum + count,
        0
      );
      grouped[date].interactions += widgetInteractions + actionClicks;

      grouped[date].avgLoadTime += item.loadTime;
      grouped[date].errorCount += item.errorCount;
      grouped[date].sessionTime += item.totalTimeSpent;
    });

    // Convert to array and calculate averages
    return Object.values(grouped)
      .map(item => ({
        ...item,
        avgLoadTime: item.users > 0 ? Math.round(item.avgLoadTime / item.users) : 0,
        avgSessionTime: item.users > 0 ? Math.round(item.sessionTime / item.users / 60) : 0, // Convert to minutes
        date: new Date(item.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // Show last 30 data points
  }, [analytics]);

  const renderUsageChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
        <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="views"
          stackId="1"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.6}
          name="Views"
        />
        <Area
          type="monotone"
          dataKey="users"
          stackId="2"
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.6}
          name="Users"
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderInteractionsChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
        <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend />
        <Bar dataKey="interactions" fill="#f59e0b" name="Interactions" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderPerformanceChart = () => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
        <YAxis
          yAxisId="loadTime"
          orientation="left"
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          yAxisId="sessionTime"
          orientation="right"
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
          formatter={(value, name) => [
            name === 'avgLoadTime'
              ? `${value}ms`
              : name === 'avgSessionTime'
                ? `${value}min`
                : value,
            name === 'avgLoadTime'
              ? 'Avg Load Time'
              : name === 'avgSessionTime'
                ? 'Avg Session Time'
                : name,
          ]}
        />
        <Legend />
        <Line
          yAxisId="loadTime"
          type="monotone"
          dataKey="avgLoadTime"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
          name="Load Time (ms)"
        />
        <Line
          yAxisId="sessionTime"
          type="monotone"
          dataKey="avgSessionTime"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
          name="Session Time (min)"
        />
      </LineChart>
    </ResponsiveContainer>
  );

  if (chartData.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center h-full bg-gray-50 rounded-lg', className)}
      >
        <div className="text-center">
          <div className="text-gray-400 mb-2">📊</div>
          <p className="text-sm text-gray-600">No data available for the selected period</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {chartType === 'usage' && renderUsageChart()}
      {chartType === 'interactions' && renderInteractionsChart()}
      {chartType === 'performance' && renderPerformanceChart()}
    </div>
  );
};

export default UsageAnalyticsChart;
