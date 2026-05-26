// Performance monitoring dashboard for dashboard optimization insights
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  Gauge,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Zap,
  HardDrive,
  Wifi,
  Eye,
  Settings,
} from 'lucide-react';
import { statsPerformanceMonitor } from '../../services/statsPerformanceMonitor';
import { dashboardCacheService } from '../../services/dashboardCacheService';
import { progressiveLoadingService } from '../../services/progressiveLoadingService';
import { StatsCard } from './StatsCard';

interface PerformanceMonitoringDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const PerformanceMonitoringDashboard: React.FC<PerformanceMonitoringDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 5000,
}) => {
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'cache' | 'loading' | 'alerts'>(
    'overview'
  );

  // Fetch performance data
  const fetchPerformanceData = useCallback(async () => {
    setIsRefreshing(true);

    try {
      // Get performance metrics
      const metrics = statsPerformanceMonitor.getMetrics();
      const performanceAlerts = statsPerformanceMonitor.getAlerts(true); // Unacknowledged only
      const report = statsPerformanceMonitor.generatePerformanceReport();

      // Get cache statistics
      const cacheMetrics = dashboardCacheService.getStats();

      // Get loading statistics
      const loadingMetrics = progressiveLoadingService.getLoadingStats();

      setPerformanceData({
        metrics,
        report,
        timestamp: new Date(),
      });

      setCacheStats(cacheMetrics);
      setLoadingStats(loadingMetrics);
      setAlerts(performanceAlerts);
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Auto-refresh setup
  useEffect(() => {
    fetchPerformanceData();

    if (autoRefresh) {
      const interval = setInterval(fetchPerformanceData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchPerformanceData, autoRefresh, refreshInterval]);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration to human readable
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Get health status color
  const getHealthColor = (health: string): string => {
    switch (health) {
      case 'excellent':
        return 'text-green-600 bg-green-100';
      case 'good':
        return 'text-blue-600 bg-blue-100';
      case 'fair':
        return 'text-yellow-600 bg-yellow-100';
      case 'poor':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!performanceData) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading performance data...</p>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, report } = performanceData;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Performance Monitoring</h2>
            <p className="text-gray-600">
              Real-time dashboard performance insights and optimization recommendations
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div
              className={`px-3 py-1 rounded-full text-sm font-medium ${getHealthColor(report.summary.overallHealth)}`}
            >
              {report.summary.overallHealth.charAt(0).toUpperCase() +
                report.summary.overallHealth.slice(1)}
            </div>
            <button
              onClick={fetchPerformanceData}
              disabled={isRefreshing}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: Gauge },
              { id: 'cache', label: 'Cache Performance', icon: Database },
              { id: 'loading', label: 'Loading Performance', icon: Zap },
              { id: 'alerts', label: 'Alerts', icon: AlertTriangle, badge: alerts.length },
            ].map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => setSelectedTab(id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors relative ${
                  selectedTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  {badge && badge > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  id="avg-load-time"
                  title="Avg Load Time"
                  value={formatDuration(metrics.averageLoadTime)}
                  icon="Clock"
                  color={
                    metrics.averageLoadTime > 2000
                      ? 'red'
                      : metrics.averageLoadTime > 1000
                        ? 'yellow'
                        : 'green'
                  }
                  change={{
                    value: -12,
                    type: 'decrease',
                    period: 'vs last hour',
                  }}
                />
                <StatsCard
                  id="cache-hit-rate"
                  title="Cache Hit Rate"
                  value={`${metrics.cacheHitRate.toFixed(1)}%`}
                  icon="Database"
                  color={
                    metrics.cacheHitRate > 80
                      ? 'green'
                      : metrics.cacheHitRate > 60
                        ? 'yellow'
                        : 'red'
                  }
                  change={{
                    value: 5,
                    type: 'increase',
                    period: 'vs last hour',
                  }}
                />
                <StatsCard
                  id="error-rate"
                  title="Error Rate"
                  value={`${metrics.errorRate.toFixed(1)}%`}
                  icon="AlertTriangle"
                  color={metrics.errorRate > 5 ? 'red' : metrics.errorRate > 2 ? 'yellow' : 'green'}
                  change={{
                    value: -2,
                    type: 'decrease',
                    period: 'vs last hour',
                  }}
                />
                <StatsCard
                  id="memory-usage"
                  title="Memory Usage"
                  value={formatBytes(metrics.memoryUsage)}
                  icon="HardDrive"
                  color={
                    metrics.memoryUsage > 100 * 1024 * 1024
                      ? 'red'
                      : metrics.memoryUsage > 50 * 1024 * 1024
                        ? 'yellow'
                        : 'green'
                  }
                />
              </div>

              {/* Performance Trends */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Request Performance</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Requests</span>
                      <span className="font-medium">{metrics.totalRequests.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Successful</span>
                      <span className="font-medium text-green-600">
                        {metrics.successfulRequests.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Failed</span>
                      <span className="font-medium text-red-600">
                        {metrics.failedRequests.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Retries</span>
                      <span className="font-medium text-yellow-600">
                        {metrics.retryCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Response Times</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average</span>
                      <span className="font-medium">{formatDuration(metrics.averageLoadTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Median</span>
                      <span className="font-medium">{formatDuration(metrics.medianLoadTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Maximum</span>
                      <span className="font-medium text-red-600">
                        {formatDuration(metrics.maxLoadTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Minimum</span>
                      <span className="font-medium text-green-600">
                        {formatDuration(metrics.minLoadTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cache Tab */}
          {selectedTab === 'cache' && cacheStats && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  id="cache-size"
                  title="Cache Size"
                  value={formatBytes(cacheStats.totalSize)}
                  icon="Database"
                  color="blue"
                />
                <StatsCard
                  id="cache-entries"
                  title="Cache Entries"
                  value={cacheStats.totalEntries.toLocaleString()}
                  icon="FileText"
                  color="green"
                />
                <StatsCard
                  id="cache-hit-rate-detailed"
                  title="Hit Rate"
                  value={`${cacheStats.hitRate.toFixed(1)}%`}
                  icon="TrendingUp"
                  color={
                    cacheStats.hitRate > 80 ? 'green' : cacheStats.hitRate > 60 ? 'yellow' : 'red'
                  }
                />
                <StatsCard
                  id="cache-evictions"
                  title="Evictions"
                  value={cacheStats.evictionCount.toLocaleString()}
                  icon="RefreshCw"
                  color="yellow"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Top Accessed Cache Keys</h3>
                <div className="space-y-2">
                  {cacheStats.topAccessedKeys.slice(0, 5).map((item: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0"
                    >
                      <span className="text-sm text-gray-600 truncate flex-1 mr-4">{item.key}</span>
                      <span className="text-sm font-medium">{item.accessCount} hits</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading Tab */}
          {selectedTab === 'loading' && loadingStats && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                  id="loading-success-rate"
                  title="Success Rate"
                  value={`${loadingStats.successRate.toFixed(1)}%`}
                  icon="CheckCircle"
                  color={
                    loadingStats.successRate > 95
                      ? 'green'
                      : loadingStats.successRate > 90
                        ? 'yellow'
                        : 'red'
                  }
                />
                <StatsCard
                  id="loading-avg-time"
                  title="Avg Load Time"
                  value={formatDuration(loadingStats.averageLoadTime)}
                  icon="Clock"
                  color={
                    loadingStats.averageLoadTime > 2000
                      ? 'red'
                      : loadingStats.averageLoadTime > 1000
                        ? 'yellow'
                        : 'green'
                  }
                />
                <StatsCard
                  id="loading-cache-hit"
                  title="Cache Hit Rate"
                  value={`${loadingStats.cacheHitRate.toFixed(1)}%`}
                  icon="Database"
                  color={
                    loadingStats.cacheHitRate > 70
                      ? 'green'
                      : loadingStats.cacheHitRate > 50
                        ? 'yellow'
                        : 'red'
                  }
                />
                <StatsCard
                  id="loading-total-requests"
                  title="Total Requests"
                  value={loadingStats.totalRequests.toLocaleString()}
                  icon="Activity"
                  color="blue"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Request Breakdown</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Successful</span>
                      <span className="font-medium text-green-600">
                        {loadingStats.successfulRequests}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Failed</span>
                      <span className="font-medium text-red-600">
                        {loadingStats.failedRequests}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Cache Hits</span>
                      <span className="font-medium text-blue-600">{loadingStats.cacheHits}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Cache Misses</span>
                      <span className="font-medium text-yellow-600">
                        {loadingStats.cacheMisses}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Load Time</span>
                      <span className="font-medium">
                        {formatDuration(loadingStats.totalLoadTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average per Request</span>
                      <span className="font-medium">
                        {formatDuration(loadingStats.averageLoadTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts Tab */}
          {selectedTab === 'alerts' && (
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
                  <p className="text-gray-500">
                    All performance metrics are within acceptable ranges.
                  </p>
                </div>
              ) : (
                alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border-l-4 ${
                      alert.type === 'critical'
                        ? 'bg-red-50 border-red-400'
                        : alert.type === 'error'
                          ? 'bg-red-50 border-red-400'
                          : 'bg-yellow-50 border-yellow-400'
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <AlertTriangle
                          className={`h-5 w-5 ${
                            alert.type === 'critical' || alert.type === 'error'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                          }`}
                        />
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-gray-900">
                          {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Alert
                        </h3>
                        <p className="text-sm text-gray-700 mt-1">{alert.message}</p>
                        <div className="mt-2 text-xs text-gray-500">
                          <span>Metric: {alert.metric}</span>
                          <span className="mx-2">•</span>
                          <span>Current: {alert.currentValue}</span>
                          <span className="mx-2">•</span>
                          <span>Threshold: {alert.threshold}</span>
                          <span className="mx-2">•</span>
                          <span>{alert.timestamp.toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          statsPerformanceMonitor.acknowledgeAlert(alert.id);
                          setAlerts(prev => prev.filter(a => a.id !== alert.id));
                        }}
                        className="ml-3 text-gray-400 hover:text-gray-600"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Optimization Suggestions */}
      {report.details.suggestions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Optimization Suggestions</h3>
          <div className="space-y-4">
            {report.details.suggestions.slice(0, 3).map((suggestion, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                <div className="flex-shrink-0">
                  <Settings className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-900">{suggestion.title}</h4>
                  <p className="text-sm text-blue-700 mt-1">{suggestion.description}</p>
                  <div className="mt-2 text-xs text-blue-600">
                    <span className="font-medium">Impact:</span> {suggestion.impact}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      suggestion.priority === 'high'
                        ? 'bg-red-100 text-red-800'
                        : suggestion.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {suggestion.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitoringDashboard;
