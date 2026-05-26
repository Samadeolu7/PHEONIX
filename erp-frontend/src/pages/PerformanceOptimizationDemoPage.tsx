// Performance optimization demo page
import React, { useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  Gauge,
  RefreshCw,
  TrendingUp,
  Zap,
  Settings,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { OptimizedRoleBasedDashboard } from '../components/dashboard/OptimizedRoleBasedDashboard';
import { PerformanceMonitoringDashboard } from '../components/dashboard/PerformanceMonitoringDashboard';
import { RoleBasedDashboard } from '../components/dashboard/RoleBasedDashboard';
import { usePerformanceOptimization } from '../hooks/usePerformanceOptimization';
import { statsPerformanceMonitor } from '../services/statsPerformanceMonitor';
import { dashboardCacheService } from '../services/dashboardCacheService';
import { progressiveLoadingService } from '../services/progressiveLoadingService';

export const PerformanceOptimizationDemoPage: React.FC = () => {
  const [selectedDemo, setSelectedDemo] = useState<'optimized' | 'standard' | 'monitoring'>(
    'optimized'
  );
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [performanceData, setPerformanceData] = useState<any>(null);

  const {
    metrics,
    config,
    updateConfig,
    analyzePerformance,
    autoOptimize,
    isOptimizing,
    getPerformanceReport,
  } = usePerformanceOptimization('PerformanceDemo');

  // Start/stop performance monitoring
  useEffect(() => {
    if (isMonitoring) {
      statsPerformanceMonitor.startMonitoring(2000); // 2 second intervals

      const interval = setInterval(() => {
        const report = getPerformanceReport();
        setPerformanceData(report);
      }, 2000);

      return () => {
        clearInterval(interval);
        statsPerformanceMonitor.stopMonitoring();
      };
    }
  }, [isMonitoring, getPerformanceReport]);

  const handleToggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
  };

  const handleClearCache = () => {
    dashboardCacheService.clear();
    alert('Cache cleared successfully!');
  };

  const handleResetStats = () => {
    statsPerformanceMonitor.resetMetrics();
    progressiveLoadingService.resetStats();
    setPerformanceData(null);
    alert('Performance statistics reset!');
  };

  const handleAutoOptimize = async () => {
    const result = await autoOptimize();
    alert(
      `Auto-optimization complete!\nSuggestions: ${result.suggestions.length}\nOptimized: ${result.isOptimized ? 'Yes' : 'No'}`
    );
  };

  const handleAnalyzePerformance = () => {
    const analysis = analyzePerformance();
    const suggestions =
      analysis.suggestions.length > 0 ? analysis.suggestions.join('\n• ') : 'No issues found';

    alert(
      `Performance Analysis:\n\n• ${suggestions}\n\nRender Time: ${analysis.metrics.renderTime.toFixed(1)}ms\nLoad Time: ${analysis.metrics.loadTime.toFixed(1)}ms`
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Dashboard Performance Optimization Demo
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Experience the difference between optimized and standard dashboard implementations, with
            real-time performance monitoring and optimization insights.
          </p>

          {/* Demo Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Demo Selection */}
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Demo Type:</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  {[
                    { id: 'optimized', label: 'Optimized Dashboard', icon: Zap },
                    { id: 'standard', label: 'Standard Dashboard', icon: Activity },
                    { id: 'monitoring', label: 'Performance Monitor', icon: Gauge },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedDemo(id as any)}
                      className={`px-4 py-2 text-sm font-medium transition-colors flex items-center space-x-2 ${
                        selectedDemo === id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Performance Controls */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleToggleMonitoring}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
                    isMonitoring
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isMonitoring ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{isMonitoring ? 'Stop' : 'Start'} Monitoring</span>
                </button>

                <button
                  onClick={handleAnalyzePerformance}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Analyze</span>
                </button>

                <button
                  onClick={handleAutoOptimize}
                  disabled={isOptimizing}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  <Settings className={`h-4 w-4 ${isOptimizing ? 'animate-spin' : ''}`} />
                  <span>{isOptimizing ? 'Optimizing...' : 'Auto-Optimize'}</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleClearCache}
                    className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors flex items-center space-x-1"
                  >
                    <Database className="h-4 w-4" />
                    <span>Clear Cache</span>
                  </button>

                  <button
                    onClick={handleResetStats}
                    className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center space-x-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Metrics Display */}
          {isMonitoring && performanceData && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Real-time Performance Metrics
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Render Time</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {metrics.renderTime.toFixed(1)}ms
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-blue-600" />
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 font-medium">Load Time</p>
                      <p className="text-2xl font-bold text-green-900">
                        {metrics.loadTime.toFixed(1)}ms
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-600" />
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-600 font-medium">Memory Usage</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
                      </p>
                    </div>
                    <Database className="h-8 w-8 text-purple-600" />
                  </div>
                </div>

                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-600 font-medium">Cache Hit Rate</p>
                      <p className="text-2xl font-bold text-yellow-900">
                        {metrics.cacheHitRate.toFixed(1)}%
                      </p>
                    </div>
                    <RefreshCw className="h-8 w-8 text-yellow-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Configuration Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lazy Loading</label>
                <button
                  onClick={() => updateConfig({ enableLazyLoading: !config.enableLazyLoading })}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.enableLazyLoading
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}
                >
                  {config.enableLazyLoading ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Progressive Loading
                </label>
                <button
                  onClick={() =>
                    updateConfig({ enableProgressiveLoading: !config.enableProgressiveLoading })
                  }
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.enableProgressiveLoading
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}
                >
                  {config.enableProgressiveLoading ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Memoization</label>
                <button
                  onClick={() => updateConfig({ enableMemoization: !config.enableMemoization })}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.enableMemoization
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}
                >
                  {config.enableMemoization ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chunk Size: {config.chunkSize}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={config.chunkSize}
                  onChange={e => updateConfig({ chunkSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Demo Content */}
        <div className="space-y-6">
          {selectedDemo === 'optimized' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Optimized Dashboard with Performance Enhancements
              </h2>
              <OptimizedRoleBasedDashboard
                enablePerformanceMonitoring={isMonitoring}
                enableProgressiveLoading={config.enableProgressiveLoading}
                enableCaching={config.enableMemoization}
              />
            </div>
          )}

          {selectedDemo === 'standard' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Standard Dashboard (No Optimizations)
              </h2>
              <RoleBasedDashboard enablePerformanceOptimization={false} />
            </div>
          )}

          {selectedDemo === 'monitoring' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Performance Monitoring Dashboard
              </h2>
              <PerformanceMonitoringDashboard autoRefresh={isMonitoring} refreshInterval={2000} />
            </div>
          )}
        </div>

        {/* Performance Tips */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Optimization Tips</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Lazy Loading Benefits</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Reduces initial bundle size</li>
                <li>• Faster initial page load</li>
                <li>• Better perceived performance</li>
                <li>• Automatic code splitting</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Progressive Loading Benefits</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Better user experience with large datasets</li>
                <li>• Reduced memory usage</li>
                <li>• Adaptive loading based on network</li>
                <li>• Graceful handling of slow connections</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Caching Benefits</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Reduced API calls</li>
                <li>• Faster subsequent loads</li>
                <li>• Better offline experience</li>
                <li>• Intelligent cache invalidation</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Monitoring Benefits</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Real-time performance insights</li>
                <li>• Proactive issue detection</li>
                <li>• Optimization recommendations</li>
                <li>• Performance trend analysis</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceOptimizationDemoPage;
