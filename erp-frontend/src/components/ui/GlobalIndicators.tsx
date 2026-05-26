import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, RefreshCw, WifiOff, CheckCircle } from 'lucide-react';
import {
  useErrorAndLoading,
  useGlobalLoading,
  useGlobalError,
} from '../../contexts/ErrorAndLoadingContext';

// Global loading indicator
export const GlobalLoadingIndicator: React.FC = () => {
  const { isAnyLoading, loadingStates } = useGlobalLoading();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isAnyLoading) {
      // Show loading indicator after a short delay to avoid flashing
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isAnyLoading]);

  if (!visible || !isAnyLoading) return null;

  const currentLoading = loadingStates.find(l => l.isLoading);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-3">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">{currentLoading?.message || 'Loading...'}</span>
        {currentLoading?.progress !== undefined && (
          <div className="w-16 bg-blue-500 rounded-full h-1">
            <div
              className="bg-white h-1 rounded-full transition-all duration-300"
              style={{ width: `${currentLoading.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Global error notifications
export const GlobalErrorNotifications: React.FC = () => {
  const { errors, dismissError, retryErrorAction } = useGlobalError();
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set());

  const visibleErrors = errors.filter(error => !dismissedErrors.has(error.id));

  const handleDismiss = (id: string) => {
    setDismissedErrors(prev => new Set([...prev, id]));
    // Remove from global state after animation
    setTimeout(() => {
      dismissError(id);
      setDismissedErrors(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }, 300);
  };

  const handleRetry = (id: string) => {
    retryErrorAction(id);
    handleDismiss(id);
  };

  if (visibleErrors.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-50 space-y-2 max-w-md">
      {visibleErrors.map(errorState => (
        <ErrorNotification
          key={errorState.id}
          error={errorState}
          onDismiss={() => handleDismiss(errorState.id)}
          onRetry={() => handleRetry(errorState.id)}
        />
      ))}
    </div>
  );
};

// Individual error notification
interface ErrorNotificationProps {
  error: {
    id: string;
    error: Error;
    component?: string;
    retryCount: number;
  };
  onDismiss: () => void;
  onRetry: () => void;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({ error, onDismiss, onRetry }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
      }`}
    >
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">
              {error.component ? `${error.component} Error` : 'Error'}
            </h4>
            <p className="text-sm text-red-700 mt-1">{error.error.message}</p>
            {error.retryCount > 0 && (
              <p className="text-xs text-red-600 mt-1">Retry attempt: {error.retryCount}</p>
            )}
            <div className="flex items-center space-x-2 mt-3">
              <button
                onClick={onRetry}
                className="text-xs font-medium text-red-800 bg-red-100 border border-red-300 rounded px-2 py-1 hover:bg-red-200 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-2 text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Network status indicator
export const NetworkStatusIndicator: React.FC = () => {
  const { state } = useErrorAndLoading();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!state.isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.isOnline, wasOffline]);

  // Show reconnected message
  if (showReconnected) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-3">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Connection restored</span>
        </div>
      </div>
    );
  }

  // Show offline indicator
  if (!state.isOnline) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-3">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">You're offline</span>
        </div>
      </div>
    );
  }

  return null;
};

// Combined global indicators component
export const GlobalIndicators: React.FC = () => {
  return (
    <>
      <GlobalLoadingIndicator />
      <GlobalErrorNotifications />
      <NetworkStatusIndicator />
    </>
  );
};
