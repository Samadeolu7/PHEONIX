// src/components/ui/LoadingOverlay.tsx
import React from 'react';
import { Loader2, Clock, AlertCircle } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  progress?: number;
  showProgress?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse';
  overlay?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message = 'Loading...',
  progress,
  showProgress = false,
  size = 'md',
  variant = 'spinner',
  overlay = true,
  className = '',
  children,
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-4 w-4';
      case 'lg':
        return 'h-8 w-8';
      case 'md':
      default:
        return 'h-6 w-6';
    }
  };

  const getTextSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'text-sm';
      case 'lg':
        return 'text-lg';
      case 'md':
      default:
        return 'text-base';
    }
  };

  const renderLoadingIndicator = () => {
    const sizeClasses = getSizeClasses();

    switch (variant) {
      case 'dots':
        return (
          <div className="flex space-x-1">
            <div
              className={`${sizeClasses.replace('h-', 'h-2 w-2 h-').replace('w-', '')} bg-blue-600 rounded-full animate-bounce`}
              style={{ animationDelay: '0ms' }}
            ></div>
            <div
              className={`${sizeClasses.replace('h-', 'h-2 w-2 h-').replace('w-', '')} bg-blue-600 rounded-full animate-bounce`}
              style={{ animationDelay: '150ms' }}
            ></div>
            <div
              className={`${sizeClasses.replace('h-', 'h-2 w-2 h-').replace('w-', '')} bg-blue-600 rounded-full animate-bounce`}
              style={{ animationDelay: '300ms' }}
            ></div>
          </div>
        );

      case 'pulse':
        return <div className={`${sizeClasses} bg-blue-600 rounded-full animate-pulse`}></div>;

      case 'spinner':
      default:
        return <Loader2 className={`${sizeClasses} animate-spin text-blue-600`} />;
    }
  };

  const renderProgressBar = () => {
    if (!showProgress || progress === undefined) return null;

    return (
      <div className="w-full max-w-xs mt-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-600">Progress</span>
          <span className="text-xs text-gray-600">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          ></div>
        </div>
      </div>
    );
  };

  const loadingContent = (
    <div className={`flex flex-col items-center justify-center p-6 ${className}`}>
      {renderLoadingIndicator()}
      <p className={`mt-3 text-gray-600 text-center ${getTextSizeClasses()}`}>{message}</p>
      {renderProgressBar()}
    </div>
  );

  if (!isLoading) {
    return <>{children}</>;
  }

  if (overlay) {
    return (
      <div className="relative">
        {children}
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
          {loadingContent}
        </div>
      </div>
    );
  }

  return loadingContent;
};

// Inline loading component for buttons and small spaces
export const InlineLoading: React.FC<{
  isLoading: boolean;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ isLoading, size = 'sm', className = '' }) => {
  if (!isLoading) return null;

  const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return <Loader2 className={`${sizeClass} animate-spin ${className}`} />;
};

// Loading skeleton component
export const LoadingSkeleton: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className = '' }) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`bg-gray-200 rounded h-4 mb-2 ${index === lines - 1 ? 'w-3/4' : 'w-full'}`}
        ></div>
      ))}
    </div>
  );
};

// Loading card component
export const LoadingCard: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={`bg-white rounded-lg shadow p-6 animate-pulse ${className}`}>
      <div className="flex items-center space-x-4">
        <div className="rounded-full bg-gray-200 h-10 w-10"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded"></div>
        <div className="h-3 bg-gray-200 rounded w-5/6"></div>
      </div>
    </div>
  );
};

// Loading table component
export const LoadingTable: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-50 rounded-t-lg p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-b-lg divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-4">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div key={colIndex} className="h-4 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export { LoadingOverlay };
export default LoadingOverlay;
