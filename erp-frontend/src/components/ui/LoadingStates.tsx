import React from 'react';
import { Loader2, TrendingUp, Users, DollarSign, Package } from 'lucide-react';

// Generic loading spinner
export const LoadingSpinner: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />;
};

// Loading skeleton for cards
export const CardSkeleton: React.FC<{
  className?: string;
  showIcon?: boolean;
}> = ({ className = '', showIcon = true }) => (
  <div className={`bg-white rounded-lg border p-6 animate-pulse ${className}`}>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        {showIcon && <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>}
        <div>
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
      <div className="h-6 bg-gray-200 rounded w-12"></div>
    </div>
    <div className="h-8 bg-gray-200 rounded w-20"></div>
  </div>
);

// Loading skeleton for stats cards
export const StatsCardSkeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg border p-6 animate-pulse ${className}`}>
    <div className="flex items-center justify-between">
      <div>
        <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-24"></div>
      </div>
      <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
    </div>
  </div>
);

// Loading skeleton for dashboard grid
export const DashboardGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {Array.from({ length: 4 }).map((_, index) => (
      <StatsCardSkeleton key={index} />
    ))}
  </div>
);

// Loading skeleton for activity feed
export const ActivityFeedSkeleton: React.FC = () => (
  <div className="space-y-4">
    {Array.from({ length: 5 }).map((_, index) => (
      <div key={index} className="flex items-start space-x-3 animate-pulse">
        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
          <div className="h-3 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    ))}
  </div>
);

// Loading skeleton for table rows
export const TableRowSkeleton: React.FC<{
  columns: number;
  rows?: number;
}> = ({ columns, rows = 5 }) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <td key={colIndex} className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
          </td>
        ))}
      </tr>
    ))}
  </>
);

// Loading overlay for components
export const LoadingOverlay: React.FC<{
  isLoading: boolean;
  children: React.ReactNode;
  message?: string;
  className?: string;
}> = ({ isLoading, children, message = 'Loading...', className = '' }) => (
  <div className={`relative ${className}`}>
    {children}
    {isLoading && (
      <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
        <div className="flex flex-col items-center space-y-2">
          <LoadingSpinner size="lg" className="text-blue-600" />
          <p className="text-sm text-gray-600">{message}</p>
        </div>
      </div>
    )}
  </div>
);

// Progressive loading component
export const ProgressiveLoader: React.FC<{
  stages: Array<{
    name: string;
    completed: boolean;
    loading: boolean;
  }>;
  className?: string;
}> = ({ stages, className = '' }) => (
  <div className={`bg-white rounded-lg border p-6 ${className}`}>
    <h3 className="text-lg font-medium text-gray-900 mb-4">Loading Dashboard</h3>
    <div className="space-y-3">
      {stages.map((stage, index) => (
        <div key={index} className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {stage.completed ? (
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            ) : stage.loading ? (
              <LoadingSpinner size="sm" className="text-blue-600" />
            ) : (
              <div className="w-5 h-5 bg-gray-200 rounded-full"></div>
            )}
          </div>
          <span
            className={`text-sm ${stage.completed ? 'text-green-700' : stage.loading ? 'text-blue-600' : 'text-gray-500'}`}
          >
            {stage.name}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// Metric card with loading state
export const MetricCardWithLoading: React.FC<{
  title: string;
  value?: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
  };
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
}> = ({ title, value, change, icon: Icon, isLoading, error, onRetry }) => {
  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Icon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">{title}</h3>
              <p className="text-xs text-red-600">Failed to load</p>
            </div>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="text-xs text-blue-600 hover:text-blue-800">
              Retry
            </button>
          )}
        </div>
        <p className="text-2xl font-bold text-gray-400">--</p>
      </div>
    );
  }

  if (isLoading) {
    return <StatsCardSkeleton />;
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            {change && (
              <p
                className={`text-xs ${change.type === 'increase' ? 'text-green-600' : 'text-red-600'}`}
              >
                {change.type === 'increase' ? '+' : '-'}
                {Math.abs(change.value)}%
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
};
