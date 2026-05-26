import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, AlertTriangle, RefreshCw, Clock } from 'lucide-react';

interface GracefulDegradationProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  isOnline?: boolean;
  showOfflineMessage?: boolean;
  enableRetry?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const GracefulDegradation: React.FC<GracefulDegradationProps> = ({
  children,
  fallback,
  isOnline = navigator.onLine,
  showOfflineMessage = true,
  enableRetry = true,
  onRetry,
  className = '',
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);

  useEffect(() => {
    if (isOnline) {
      setLastOnlineTime(new Date());
    }
  }, [isOnline]);

  const handleRetry = useCallback(async () => {
    if (onRetry) {
      setIsRetrying(true);
      try {
        await onRetry();
      } finally {
        setIsRetrying(false);
      }
    } else {
      // Default retry behavior - reload the page
      window.location.reload();
    }
  }, [onRetry]);

  if (!isOnline && showOfflineMessage) {
    return (
      <div className={`bg-yellow-50 border border-yellow-200 rounded-md p-4 ${className}`}>
        <div className="flex items-start">
          <WifiOff className="w-5 h-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-800">You're currently offline</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Some features may not be available. We'll automatically reconnect when your connection
              is restored.
            </p>
            {lastOnlineTime && (
              <p className="text-xs text-yellow-600 mt-2 flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                Last online: {lastOnlineTime.toLocaleTimeString()}
              </p>
            )}
            {enableRetry && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="mt-3 inline-flex items-center px-3 py-1 text-xs font-medium text-yellow-800 bg-yellow-100 border border-yellow-300 rounded hover:bg-yellow-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Try Again'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isOnline && fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

// Network status hook
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Show reconnection message
        console.log('Connection restored');
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return { isOnline, wasOffline };
}

// Degraded feature component
export const DegradedFeature: React.FC<{
  children: React.ReactNode;
  isAvailable: boolean;
  reason?: string;
  fallbackMessage?: string;
  className?: string;
}> = ({
  children,
  isAvailable,
  reason = 'This feature is temporarily unavailable',
  fallbackMessage,
  className = '',
}) => {
  if (isAvailable) {
    return <>{children}</>;
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-md p-4 ${className}`}>
      <div className="flex items-start">
        <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-700">Feature Unavailable</h3>
          <p className="text-sm text-gray-600 mt-1">{reason}</p>
          {fallbackMessage && <p className="text-xs text-gray-500 mt-2">{fallbackMessage}</p>}
        </div>
      </div>
    </div>
  );
};

// Cached content component for offline scenarios
export const CachedContent: React.FC<{
  children: React.ReactNode;
  cacheKey: string;
  isOnline: boolean;
  lastUpdated?: Date;
  className?: string;
}> = ({ children, cacheKey, isOnline, lastUpdated, className = '' }) => {
  const [cachedData, setCachedData] = useState<any>(null);

  useEffect(() => {
    // Load cached data from localStorage
    const cached = localStorage.getItem(`cache_${cacheKey}`);
    if (cached) {
      try {
        setCachedData(JSON.parse(cached));
      } catch (error) {
        console.error('Failed to parse cached data:', error);
      }
    }
  }, [cacheKey]);

  useEffect(() => {
    // Cache data when online
    if (isOnline && children) {
      localStorage.setItem(
        `cache_${cacheKey}`,
        JSON.stringify({
          data: children,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }, [isOnline, children, cacheKey]);

  if (!isOnline && cachedData) {
    return (
      <div className={className}>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-4">
          <p className="text-xs text-blue-700 flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            Showing cached content from {new Date(cachedData.timestamp).toLocaleString()}
          </p>
        </div>
        {cachedData.data}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

// Progressive enhancement wrapper
export const ProgressiveEnhancement: React.FC<{
  children: React.ReactNode;
  enhanced: React.ReactNode;
  condition: boolean;
  className?: string;
}> = ({ children, enhanced, condition, className = '' }) => {
  return <div className={className}>{condition ? enhanced : children}</div>;
};
