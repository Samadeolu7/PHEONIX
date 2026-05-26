// src/components/ui/RetryButton.tsx
import React, { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface RetryButtonProps {
  onRetry: () => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
  maxRetries?: number;
  currentRetries?: number;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showRetryCount?: boolean;
  autoRetry?: boolean;
  autoRetryDelay?: number;
  className?: string;
  children?: React.ReactNode;
}

const RetryButton: React.FC<RetryButtonProps> = ({
  onRetry,
  disabled = false,
  loading = false,
  maxRetries = 3,
  currentRetries = 0,
  variant = 'primary',
  size = 'md',
  showRetryCount = true,
  autoRetry = false,
  autoRetryDelay = 3000,
  className = '',
  children,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(currentRetries);
  const [lastRetryTime, setLastRetryTime] = useState<Date | null>(null);
  const [autoRetryTimeout, setAutoRetryTimeout] = useState<NodeJS.Timeout | null>(null);

  const canRetry = retryCount < maxRetries && !disabled && !loading;

  const getVariantClasses = () => {
    const baseClasses =
      'inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors';

    switch (variant) {
      case 'primary':
        return `${baseClasses} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300`;
      case 'secondary':
        return `${baseClasses} text-white bg-gray-600 hover:bg-gray-700 focus:ring-gray-500 disabled:bg-gray-300`;
      case 'outline':
        return `${baseClasses} text-blue-600 bg-white border border-blue-600 hover:bg-blue-50 focus:ring-blue-500 disabled:text-blue-300 disabled:border-blue-300`;
      case 'ghost':
        return `${baseClasses} text-gray-600 bg-transparent hover:bg-gray-100 focus:ring-gray-500 disabled:text-gray-300`;
      default:
        return `${baseClasses} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300`;
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-sm';
      case 'lg':
        return 'px-6 py-3 text-lg';
      case 'md':
      default:
        return 'px-4 py-2 text-base';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 'h-4 w-4';
      case 'lg':
        return 'h-6 w-6';
      case 'md':
      default:
        return 'h-5 w-5';
    }
  };

  const handleRetry = async () => {
    if (!canRetry) return;

    setIsRetrying(true);
    setLastRetryTime(new Date());

    try {
      await onRetry();
      // Reset retry count on successful retry
      setRetryCount(0);
    } catch (error) {
      // Increment retry count on failed retry
      setRetryCount(prev => prev + 1);

      // Setup auto-retry if enabled and we haven't exceeded max retries
      if (autoRetry && retryCount + 1 < maxRetries) {
        const timeout = setTimeout(() => {
          handleRetry();
        }, autoRetryDelay);
        setAutoRetryTimeout(timeout);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  // Clear auto-retry timeout on unmount
  React.useEffect(() => {
    return () => {
      if (autoRetryTimeout) {
        clearTimeout(autoRetryTimeout);
      }
    };
  }, [autoRetryTimeout]);

  const renderIcon = () => {
    const iconClasses = `${getIconSize()} mr-2`;

    if (isRetrying || loading) {
      return <RefreshCw className={`${iconClasses} animate-spin`} />;
    }

    if (retryCount >= maxRetries) {
      return <AlertCircle className={iconClasses} />;
    }

    if (retryCount > 0 && canRetry) {
      return <RefreshCw className={iconClasses} />;
    }

    return <RefreshCw className={iconClasses} />;
  };

  const renderText = () => {
    if (children) {
      return children;
    }

    if (isRetrying || loading) {
      return 'Retrying...';
    }

    if (retryCount >= maxRetries) {
      return 'Max retries reached';
    }

    if (retryCount > 0) {
      return showRetryCount ? `Retry (${retryCount}/${maxRetries})` : 'Retry';
    }

    return 'Retry';
  };

  const renderRetryInfo = () => {
    if (!showRetryCount || retryCount === 0) return null;

    return (
      <div className="mt-2 text-xs text-gray-500">
        {retryCount > 0 && (
          <div>
            Attempts: {retryCount}/{maxRetries}
            {lastRetryTime && (
              <span className="ml-2">Last retry: {lastRetryTime.toLocaleTimeString()}</span>
            )}
          </div>
        )}
        {autoRetry && canRetry && retryCount > 0 && (
          <div className="text-blue-600">Auto-retry in {autoRetryDelay / 1000}s...</div>
        )}
      </div>
    );
  };

  return (
    <div className="inline-block">
      <button
        onClick={handleRetry}
        disabled={!canRetry || isRetrying}
        className={`${getVariantClasses()} ${getSizeClasses()} ${className} disabled:cursor-not-allowed`}
        title={
          retryCount >= maxRetries
            ? 'Maximum retry attempts reached'
            : canRetry
              ? 'Click to retry the operation'
              : 'Retry not available'
        }
      >
        {renderIcon()}
        {renderText()}
      </button>
      {renderRetryInfo()}
    </div>
  );
};

export default RetryButton;
