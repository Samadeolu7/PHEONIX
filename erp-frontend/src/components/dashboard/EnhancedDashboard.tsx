import React, { useEffect, useState } from 'react';
import { DollarSign, Users, Package, TrendingUp, AlertCircle } from 'lucide-react';
import ComponentErrorBoundary from '../error/ComponentErrorBoundary';
import {
  GracefulDegradation,
  useNetworkStatus,
  DegradedFeature,
} from '../error/GracefulDegradation';
import {
  LoadingOverlay,
  MetricCardWithLoading,
  DashboardGridSkeleton,
  ProgressiveLoader,
} from '../ui/LoadingStates';
import { useLoadingState, useProgressiveLoading } from '../../hooks/useLoadingState';
import { useErrorHandler } from '../../hooks/useErrorHandler';

interface DashboardMetric {
  id: string;
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
  };
  icon: React.ComponentType<{ className?: string }>;
  critical?: boolean;
}

interface EnhancedDashboardProps {
  className?: string;
}

const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({ className = '' }) => {
  const { isOnline } = useNetworkStatus();
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);

  // Progressive loading stages
  const stages = ['user-data', 'financial-metrics', 'operational-metrics', 'activity-feed'];
  const progressiveLoader = useProgressiveLoading(stages);

  // Individual loading states for each metric
  const financialMetrics = useLoadingState<DashboardMetric[]>({
    timeout: 10000,
    onTimeout: () => console.warn('Financial metrics loading timed out'),
  });

  const operationalMetrics = useLoadingState<DashboardMetric[]>({
    timeout: 10000,
  });

  // Error handlers
  const networkErrorHandler = useErrorHandler({
    maxRetries: 3,
    retryDelay: 2000,
  });

  // Mock data loading functions
  const loadFinancialMetrics = async (): Promise<DashboardMetric[]> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate occasional failures for demo
    if (Math.random() < 0.2) {
      throw new Error('Failed to load financial metrics');
    }

    return [
      {
        id: 'revenue',
        title: 'Total Revenue',
        value: '₦2,450,000',
        change: { value: 12.5, type: 'increase' },
        icon: DollarSign,
      },
      {
        id: 'receivables',
        title: 'Outstanding Receivables',
        value: '₦850,000',
        change: { value: 5.2, type: 'decrease' },
        icon: TrendingUp,
        critical: true,
      },
    ];
  };

  const loadOperationalMetrics = async (): Promise<DashboardMetric[]> => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (Math.random() < 0.15) {
      throw new Error('Failed to load operational metrics');
    }

    return [
      {
        id: 'students',
        title: 'Active Students',
        value: '1,245',
        change: { value: 3.1, type: 'increase' },
        icon: Users,
      },
      {
        id: 'inventory',
        title: 'Inventory Items',
        value: '456',
        change: { value: 2.8, type: 'decrease' },
        icon: Package,
      },
    ];
  };

  // Load dashboard data with progressive loading
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // Stage 1: User data (instant)
        await progressiveLoader.executeStage('user-data', async () => {
          // User data is already available from context
        });

        // Stage 2: Financial metrics
        await progressiveLoader.executeStage('financial-metrics', async () => {
          const financial = await financialMetrics.execute(loadFinancialMetrics);
          setMetrics(prev => [...prev, ...financial]);
        });

        // Stage 3: Operational metrics
        await progressiveLoader.executeStage('operational-metrics', async () => {
          const operational = await operationalMetrics.execute(loadOperationalMetrics);
          setMetrics(prev => [...prev, ...operational]);
        });

        // Stage 4: Activity feed
        await progressiveLoader.executeStage('activity-feed', async () => {
          // Load activity feed data
          await new Promise(resolve => setTimeout(resolve, 800));
        });
      } catch (error) {
        console.error('Dashboard loading error:', error);
      }
    };

    loadDashboardData();
  }, []);

  // Retry handlers
  const retryFinancialMetrics = async () => {
    try {
      const financial = await financialMetrics.execute(loadFinancialMetrics);
      setMetrics(prev => {
        const filtered = prev.filter(m => !['revenue', 'receivables'].includes(m.id));
        return [...filtered, ...financial];
      });
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  const retryOperationalMetrics = async () => {
    try {
      const operational = await operationalMetrics.execute(loadOperationalMetrics);
      setMetrics(prev => {
        const filtered = prev.filter(m => !['students', 'inventory'].includes(m.id));
        return [...filtered, ...operational];
      });
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  // Show progressive loader if still loading initial stages
  if (progressiveLoader.isLoading && !progressiveLoader.completedStages.has('financial-metrics')) {
    return (
      <div className={className}>
        <ProgressiveLoader
          stages={stages.map(stage => ({
            name: stage.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            ...progressiveLoader.getStageStatus(stage),
          }))}
        />
      </div>
    );
  }

  return (
    <GracefulDegradation
      isOnline={isOnline}
      className={className}
      fallback={
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Limited Functionality</h3>
              <p className="text-sm text-yellow-700">
                Dashboard is running in offline mode with cached data.
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Dashboard Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {!isOnline && (
            <div className="flex items-center text-sm text-yellow-600">
              <AlertCircle className="w-4 h-4 mr-1" />
              Offline Mode
            </div>
          )}
        </div>

        {/* Metrics Grid */}
        <ComponentErrorBoundary
          componentName="Metrics Grid"
          fallback={
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-700">
                Unable to load dashboard metrics. Please refresh the page.
              </p>
            </div>
          }
        >
          <LoadingOverlay
            isLoading={financialMetrics.isLoading && operationalMetrics.isLoading}
            message="Loading dashboard metrics..."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.length === 0 &&
              (financialMetrics.isLoading || operationalMetrics.isLoading) ? (
                <DashboardGridSkeleton />
              ) : (
                metrics.map(metric => (
                  <MetricCardWithLoading
                    key={metric.id}
                    title={metric.title}
                    value={metric.value}
                    change={metric.change}
                    icon={metric.icon}
                    isLoading={false}
                    error={
                      (['revenue', 'receivables'].includes(metric.id) &&
                        financialMetrics.error?.message) ||
                      (['students', 'inventory'].includes(metric.id) &&
                        operationalMetrics.error?.message) ||
                      undefined
                    }
                    onRetry={
                      ['revenue', 'receivables'].includes(metric.id)
                        ? retryFinancialMetrics
                        : ['students', 'inventory'].includes(metric.id)
                          ? retryOperationalMetrics
                          : undefined
                    }
                  />
                ))
              )}
            </div>
          </LoadingOverlay>
        </ComponentErrorBoundary>

        {/* Enhanced Features Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Real-time Activity Feed */}
          <ComponentErrorBoundary componentName="Activity Feed">
            <DegradedFeature
              isAvailable={isOnline}
              reason="Activity feed requires internet connection"
              fallbackMessage="Reconnect to see real-time updates"
            >
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">New payment received - ₦50,000</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Invoice #INV-2024-001 generated</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Requisition pending approval</span>
                  </div>
                </div>
              </div>
            </DegradedFeature>
          </ComponentErrorBoundary>

          {/* Quick Actions */}
          <ComponentErrorBoundary componentName="Quick Actions">
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="text-sm font-medium text-gray-900">Create Invoice</div>
                  <div className="text-xs text-gray-500">Generate new invoice</div>
                </button>
                <button className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="text-sm font-medium text-gray-900">Record Payment</div>
                  <div className="text-xs text-gray-500">Process payment</div>
                </button>
                <button className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="text-sm font-medium text-gray-900">New Requisition</div>
                  <div className="text-xs text-gray-500">Create purchase request</div>
                </button>
                <button className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="text-sm font-medium text-gray-900">View Reports</div>
                  <div className="text-xs text-gray-500">Financial reports</div>
                </button>
              </div>
            </div>
          </ComponentErrorBoundary>
        </div>
      </div>
    </GracefulDegradation>
  );
};

export default EnhancedDashboard;
