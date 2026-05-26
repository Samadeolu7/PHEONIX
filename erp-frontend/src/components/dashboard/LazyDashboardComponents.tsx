// Lazy loading components for dashboard performance optimization
import React, { Suspense, lazy, ComponentType, Component, ReactNode } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// Import ErrorInfo type from React types
interface ErrorInfo {
  componentStack: string;
}

// Simple Error Boundary class component
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent: ComponentType<{
    error: Error;
    resetErrorBoundary: () => void;
    componentName?: string;
    className?: string;
  }>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const { FallbackComponent } = this.props;
      return (
        <FallbackComponent error={this.state.error} resetErrorBoundary={this.resetErrorBoundary} />
      );
    }

    return this.props.children;
  }
}

// Lazy load dashboard components
export const LazyStatsCard = lazy(() =>
  import('./StatsCard').then(module => ({ default: module.StatsCard }))
);

export const LazyActivityFeed = lazy(() =>
  import('./ActivityFeed').then(module => ({ default: module.ActivityFeed }))
);

export const LazyRoleBasedDashboardTemplate = lazy(() =>
  import('./RoleBasedDashboardTemplate').then(module => ({
    default: module.RoleBasedDashboardTemplate,
  }))
);

export const LazyDashboardBuilder = lazy(() =>
  import('./DashboardBuilder').then(module => ({ default: module.DashboardBuilder }))
);

export const LazyDashboardAssignmentManager = lazy(() =>
  import('./DashboardAssignmentManager').then(module => ({
    default: module.DashboardAssignmentManager,
  }))
);

// Loading fallback components
interface LoadingFallbackProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  className?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({
  size = 'medium',
  message = 'Loading...',
  className = '',
}) => {
  const sizeClasses = {
    small: 'h-16',
    medium: 'h-32',
    large: 'h-64',
  };

  const iconSizes = {
    small: 'h-4 w-4',
    medium: 'h-6 w-6',
    large: 'h-8 w-8',
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      <div className="text-center">
        <Loader2 className={`${iconSizes[size]} text-blue-500 animate-spin mx-auto mb-2`} />
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
};

// Skeleton loading components
export const StatsCardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 animate-pulse ${className}`}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="h-4 bg-gray-200 rounded w-24"></div>
      <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
    </div>
    <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-16"></div>
  </div>
);

export const ActivityFeedSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 ${className}`}>
    <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-start space-x-3 animate-pulse">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex-shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const DashboardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    {/* Welcome banner skeleton */}
    <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 animate-pulse">
      <div className="h-8 bg-white/20 rounded w-64 mb-2"></div>
      <div className="h-4 bg-white/20 rounded w-96 mb-4"></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white/10 rounded-lg p-4">
            <div className="h-3 bg-white/20 rounded w-20 mb-2"></div>
            <div className="h-6 bg-white/20 rounded w-16"></div>
          </div>
        ))}
      </div>
    </div>

    {/* Stats cards skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>

    {/* Activity feed skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <ActivityFeedSkeleton />
      </div>
      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-24 mb-4"></div>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Error fallback component
interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
  componentName?: string;
  className?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
  componentName = 'Component',
  className = '',
}) => (
  <div className={`bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6 ${className}`}>
    <div className="flex items-start space-x-3">
      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-medium text-red-800 mb-1">Failed to load {componentName}</h3>
        <p className="text-sm text-red-700 mb-3">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={resetErrorBoundary}
          className="inline-flex items-center space-x-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-md transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try again</span>
        </button>
      </div>
    </div>
  </div>
);

// Higher-order component for lazy loading with error boundary
interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<any>;
  errorFallback?: React.ComponentType<ErrorFallbackProps>;
  componentName?: string;
  className?: string;
}

export const LazyWrapper: React.FC<LazyWrapperProps> = ({
  children,
  fallback: FallbackComponent = LoadingFallback,
  errorFallback: ErrorFallbackComponent = ErrorFallback,
  componentName = 'Component',
  className = '',
}) => (
  <ErrorBoundary
    FallbackComponent={props => (
      <ErrorFallbackComponent {...props} componentName={componentName} className={className} />
    )}
    onError={(error, errorInfo) => {
      console.error(`Error in ${componentName}:`, error, errorInfo);
    }}
  >
    <Suspense fallback={<FallbackComponent className={className} />}>{children}</Suspense>
  </ErrorBoundary>
);

// Utility function to create lazy component with wrapper
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  componentName: string,
  fallbackComponent?: React.ComponentType<any>
) {
  const LazyComponent = lazy(importFn);

  return React.forwardRef<any, React.ComponentProps<T>>((props, ref) => (
    <LazyWrapper fallback={fallbackComponent} componentName={componentName}>
      <LazyComponent {...props} ref={ref} />
    </LazyWrapper>
  ));
}

// Progressive loading hook
export function useProgressiveLoading<T>(
  loadFn: () => Promise<T>,
  dependencies: React.DependencyList = []
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setProgress(prev => Math.min(prev + 10, 90));
        }, 100);

        const result = await loadFn();

        clearInterval(progressInterval);

        if (!cancelled) {
          setProgress(100);
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setLoading(false);
          setProgress(0);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, dependencies);

  const retry = React.useCallback(() => {
    setError(null);
    setData(null);
    // Trigger re-run by updating a dependency
  }, []);

  return { data, loading, error, progress, retry };
}

// Performance monitoring wrapper
interface PerformanceWrapperProps {
  children: React.ReactNode;
  componentName: string;
  onPerformanceData?: (data: {
    componentName: string;
    renderTime: number;
    mountTime: number;
  }) => void;
}

export const PerformanceWrapper: React.FC<PerformanceWrapperProps> = ({
  children,
  componentName,
  onPerformanceData,
}) => {
  const mountTimeRef = React.useRef<number>(Date.now());
  const renderTimeRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const mountTime = Date.now() - mountTimeRef.current;
    const renderTime = Date.now() - renderTimeRef.current;

    if (onPerformanceData) {
      onPerformanceData({
        componentName,
        renderTime,
        mountTime,
      });
    }

    // Log performance data in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 ${componentName} Performance:`, {
        renderTime: `${renderTime}ms`,
        mountTime: `${mountTime}ms`,
      });
    }
  }, [componentName, onPerformanceData]);

  React.useLayoutEffect(() => {
    renderTimeRef.current = Date.now();
  });

  return <>{children}</>;
};

export default {
  LazyStatsCard,
  LazyActivityFeed,
  LazyRoleBasedDashboardTemplate,
  LazyDashboardBuilder,

  LazyDashboardAssignmentManager,
  LoadingFallback,
  StatsCardSkeleton,
  ActivityFeedSkeleton,
  DashboardSkeleton,
  ErrorFallback,
  LazyWrapper,
  createLazyComponent,
  useProgressiveLoading,
  PerformanceWrapper,
};
