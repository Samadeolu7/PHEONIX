// Optimized Role-Based Dashboard with performance enhancements and backend integration
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/roles';
import {
  LazyWrapper,
  DashboardSkeleton,
  PerformanceWrapper,
  useProgressiveLoading,
} from './LazyDashboardComponents';
import { usePerformanceOptimization } from '../../hooks/usePerformanceOptimization';
import { useDashboardIntegration } from '../../hooks/useDashboardIntegration';
import { dashboardCacheService } from '../../services/dashboardCacheService';
import { statsPerformanceMonitor } from '../../services/statsPerformanceMonitor';
import {
  dashboardTemplateEngine,
  moduleVisibilityService,
} from '../../services/dashboardTemplateEngine';
import { DashboardTemplate, StatsCard } from '../../types/dashboardTemplates';
import { StatsCardData } from './StatsCard';
import { ActivityItem } from './ActivityFeed';

// Lazy load components
const LazyRoleBasedDashboardTemplate = React.lazy(() =>
  import('./RoleBasedDashboardTemplate').then(module => ({
    default: module.RoleBasedDashboardTemplate,
  }))
);

const LazyStatsCard = React.lazy(() =>
  import('./StatsCard').then(module => ({ default: module.StatsCard }))
);

const LazyActivityFeed = React.lazy(() =>
  import('./ActivityFeed').then(module => ({ default: module.ActivityFeed }))
);

interface OptimizedRoleBasedDashboardProps {
  role?: UserRole;
  className?: string;
  enablePerformanceMonitoring?: boolean;
  enableProgressiveLoading?: boolean;
  enableCaching?: boolean;
}

export const OptimizedRoleBasedDashboard: React.FC<OptimizedRoleBasedDashboardProps> = ({
  role: propRole,
  className = '',
  enablePerformanceMonitoring = true,
  enableProgressiveLoading = true,
  enableCaching = true,
}) => {
  const { user, selectedRole } = useAuth();
  const navigate = useNavigate();

  // Determine the role to use
  const effectiveRole = propRole || selectedRole || 'Officer';

  // Dashboard integration hook - this replaces the manual template generation
  const {
    state: dashboardState,
    actions: dashboardActions,
    stats,
    quickActions,
    isCompatibilityMode,
    migrationStatus,
  } = useDashboardIntegration({
    role: effectiveRole,
    enableBackendIntegration: true,
    enableCompatibilityLayer: true,
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Performance optimization hook
  const {
    config: perfConfig,
    metrics,
    startMeasurement,
    endMeasurement,
    loadDataProgressively,
    memoize,
    analyzePerformance,
    getPerformanceReport,
  } = usePerformanceOptimization('OptimizedRoleBasedDashboard', {
    enableLazyLoading: true,
    enableProgressiveLoading,
    enableMemoization: enableCaching,
    chunkSize: 5,
    loadingDelay: 50,
  });

  // Legacy state management (kept for backward compatibility)
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Memoized module filtering (still needed for navigation)
  const getFilteredModules = useMemo(
    () =>
      memoize(
        (role: UserRole) => {
          return moduleVisibilityService.filterModulesByRole(role);
        },
        role => `modules-${role}`
      ),
    [memoize]
  );

  // Mock activities (this would typically come from backend)
  const mockActivities: ActivityItem[] = useMemo(
    () => [
      {
        id: '1',
        type: 'invoice',
        title: 'New invoice created',
        description: 'Invoice #INV-2024-001 created for John Doe - ₦125,000',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        user: 'Sarah Johnson',
        status: 'success',
        actionUrl: '/sales/invoices/1',
      },
      {
        id: '2',
        type: 'payment',
        title: 'Payment received',
        description: 'Payment of ₦50,000 received from Jane Smith',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        user: 'Michael Brown',
        status: 'success',
        actionUrl: '/receivables/payments/2',
      },
    ],
    []
  );

  // Update activities state
  useEffect(() => {
    setActivities(mockActivities);
  }, [mockActivities]);

  // Performance monitoring
  useEffect(() => {
    if (enablePerformanceMonitoring) {
      statsPerformanceMonitor.startMonitoring();

      return () => {
        const report = getPerformanceReport();
        console.log('Dashboard Performance Report:', report);
      };
    }
  }, [enablePerformanceMonitoring, getPerformanceReport]);

  // Navigation handlers
  const handleModuleNavigation = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  const handleActionClick = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate]
  );

  const handleMetricClick = useCallback(
    (statsCard: StatsCard) => {
      if (statsCard.onClick) {
        navigate(statsCard.onClick);
      }
    },
    [navigate]
  );

  // Error handling
  if (dashboardState.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg
              className="h-12 w-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load dashboard</h3>
          <p className="text-gray-500 mb-4">{dashboardState.error}</p>
          <div className="space-x-2">
            <button
              onClick={() => dashboardActions.refreshDashboard()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            {isCompatibilityMode && (
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state with progress
  if (dashboardState.isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        {enableProgressiveLoading && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Loading dashboard...</span>
              <span>{Math.round(loadingProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}
        <DashboardSkeleton />
      </div>
    );
  }

  if (!user || !dashboardState.template) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Initializing dashboard...</p>
          {isCompatibilityMode && (
            <p className="text-xs text-gray-400 mt-2">Running in compatibility mode</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <PerformanceWrapper
      componentName="OptimizedRoleBasedDashboard"
      onPerformanceData={data => {
        if (enablePerformanceMonitoring) {
          console.log('Dashboard render performance:', data);
        }
      }}
    >
      <div className={`space-y-4 sm:space-y-6 ${className}`}>
        {/* Performance metrics display (development only) */}
        {process.env.NODE_ENV === 'development' && enablePerformanceMonitoring && (
          <div className="bg-gray-100 rounded-lg p-4 text-xs">
            <h4 className="font-medium mb-2">Performance Metrics</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>Render: {metrics.renderTime.toFixed(1)}ms</div>
              <div>Load: {metrics.loadTime.toFixed(1)}ms</div>
              <div>Memory: {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</div>
              <div>Cache: {metrics.cacheHitRate.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* Main dashboard content */}
        <LazyWrapper componentName="RoleBasedDashboardTemplate" className={className}>
          <LazyRoleBasedDashboardTemplate role={effectiveRole} className={className} />
        </LazyWrapper>

        {/* Performance analysis button (development only) */}
        {process.env.NODE_ENV === 'development' && enablePerformanceMonitoring && (
          <div className="fixed bottom-4 right-4">
            <button
              onClick={() => {
                const analysis = analyzePerformance();
                console.log('Performance Analysis:', analysis);
                alert(
                  `Performance Analysis:\n${analysis.suggestions.join('\n') || 'No issues found'}`
                );
              }}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors shadow-lg"
            >
              Analyze Performance
            </button>
          </div>
        )}
      </div>
    </PerformanceWrapper>
  );
};

export default OptimizedRoleBasedDashboard;
