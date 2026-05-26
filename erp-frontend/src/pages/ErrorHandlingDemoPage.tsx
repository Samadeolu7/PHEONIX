import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react';
import ComponentErrorBoundary from '../components/error/ComponentErrorBoundary';
import {
  GracefulDegradation,
  useNetworkStatus,
  DegradedFeature,
} from '../components/error/GracefulDegradation';
import {
  LoadingSpinner,
  LoadingOverlay,
  MetricCardWithLoading,
  ProgressiveLoader,
  DashboardGridSkeleton,
} from '../components/ui/LoadingStates';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useLoadingState, useProgressiveLoading } from '../hooks/useLoadingState';
import { useGlobalLoading, useGlobalError } from '../contexts/ErrorAndLoadingContext';
import EnhancedDashboard from '../components/dashboard/EnhancedDashboard';

// Component that throws errors for testing
const ErrorProneComponent: React.FC<{ shouldError: boolean }> = ({ shouldError }) => {
  if (shouldError) {
    throw new Error('This is a test error from ErrorProneComponent');
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <p className="text-green-700">This component is working correctly!</p>
    </div>
  );
};

// Component that simulates async operations
const AsyncOperationDemo: React.FC = () => {
  const { startLoading, stopLoading } = useGlobalLoading();
  const { reportError } = useGlobalError();
  const errorHandler = useErrorHandler({
    maxRetries: 2,
    retryDelay: 1000,
  });

  const simulateAsyncOperation = async (shouldFail: boolean = false) => {
    const operationId = `async-op-${Date.now()}`;
    startLoading(operationId, 'Processing async operation...');

    try {
      await errorHandler.executeWithErrorHandling(async () => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (shouldFail) {
          throw new Error('Simulated async operation failure');
        }
      });

      stopLoading(operationId);
    } catch (error) {
      stopLoading(operationId);
      reportError(operationId, error as Error, 'AsyncOperationDemo');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Async Operation Demo</h3>
      <div className="flex space-x-3">
        <button
          onClick={() => simulateAsyncOperation(false)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Success Operation
        </button>
        <button
          onClick={() => simulateAsyncOperation(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Failing Operation
        </button>
      </div>

      {errorHandler.isError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-700 text-sm">Error: {errorHandler.error?.message}</p>
          {errorHandler.canRetry && (
            <button
              onClick={() => errorHandler.retry(() => simulateAsyncOperation(false))}
              disabled={errorHandler.isRetrying}
              className="mt-2 text-sm text-red-800 bg-red-100 border border-red-300 rounded px-2 py-1 hover:bg-red-200 disabled:opacity-50"
            >
              {errorHandler.isRetrying ? 'Retrying...' : `Retry (${errorHandler.retryCount}/${3})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Progressive loading demo
const ProgressiveLoadingDemo: React.FC = () => {
  const stages = ['initialization', 'data-fetch', 'processing', 'rendering'];
  const progressiveLoader = useProgressiveLoading(stages);
  const [isRunning, setIsRunning] = useState(false);

  const runProgressiveLoad = async () => {
    setIsRunning(true);

    try {
      for (const stage of stages) {
        await progressiveLoader.executeStage(stage, async () => {
          await new Promise(resolve => setTimeout(resolve, 1500));
        });
      }
    } catch (error) {
      console.error('Progressive loading failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Progressive Loading Demo</h3>
        <button
          onClick={runProgressiveLoad}
          disabled={isRunning}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Start Progressive Load'}
        </button>
      </div>

      <ProgressiveLoader
        stages={stages.map(stage => ({
          name: stage.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          ...progressiveLoader.getStageStatus(stage),
        }))}
      />
    </div>
  );
};

const ErrorHandlingDemoPage: React.FC = () => {
  const [shouldError, setShouldError] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showLoadingDemo, setShowLoadingDemo] = useState(false);
  const { isOnline } = useNetworkStatus();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Error Handling & Loading States Demo
          </h1>
          <p className="text-gray-600">
            Comprehensive demonstration of error boundaries, loading states, and graceful
            degradation.
          </p>

          <div className="flex items-center space-x-4 mt-4">
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Demo Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setShouldError(!shouldError)}
              className={`p-4 rounded-lg border-2 transition-colors ${
                shouldError
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
              <div className="text-sm font-medium">
                {shouldError ? 'Disable' : 'Enable'} Component Errors
              </div>
            </button>

            <button
              onClick={() => setIsOfflineMode(!isOfflineMode)}
              className={`p-4 rounded-lg border-2 transition-colors ${
                isOfflineMode
                  ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <WifiOff className="w-6 h-6 mx-auto mb-2" />
              <div className="text-sm font-medium">
                {isOfflineMode ? 'Disable' : 'Enable'} Offline Mode
              </div>
            </button>

            <button
              onClick={() => setShowLoadingDemo(!showLoadingDemo)}
              className={`p-4 rounded-lg border-2 transition-colors ${
                showLoadingDemo
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Loader2 className="w-6 h-6 mx-auto mb-2" />
              <div className="text-sm font-medium">
                {showLoadingDemo ? 'Hide' : 'Show'} Loading Demo
              </div>
            </button>
          </div>
        </div>

        {/* Error Boundary Demo */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Component Error Boundary</h2>
          <ComponentErrorBoundary componentName="Demo Component" showRetry={true}>
            <ErrorProneComponent shouldError={shouldError} />
          </ComponentErrorBoundary>
        </div>

        {/* Graceful Degradation Demo */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Graceful Degradation</h2>
          <GracefulDegradation
            isOnline={!isOfflineMode}
            fallback={
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-700">
                  This feature is running in offline mode with limited functionality.
                </p>
              </div>
            }
          >
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-700">This feature is fully functional when online!</p>
            </div>
          </GracefulDegradation>
        </div>

        {/* Degraded Feature Demo */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Feature Availability</h2>
          <div className="space-y-4">
            <DegradedFeature
              isAvailable={!isOfflineMode}
              reason="This feature requires internet connection"
              fallbackMessage="Please reconnect to access this feature"
            >
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-700">✅ Advanced analytics feature is available</p>
              </div>
            </DegradedFeature>

            <DegradedFeature
              isAvailable={!shouldError}
              reason="This feature is temporarily disabled due to system errors"
              fallbackMessage="Our team is working to restore this feature"
            >
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-700">✅ Real-time notifications are working</p>
              </div>
            </DegradedFeature>
          </div>
        </div>

        {/* Loading States Demo */}
        {showLoadingDemo && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Loading States</h2>
            <div className="space-y-6">
              {/* Loading Skeletons */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Loading Skeletons</h3>
                <DashboardGridSkeleton />
              </div>

              {/* Metric Cards with Loading */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Metric Cards</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MetricCardWithLoading
                    title="Revenue"
                    value="₦2,450,000"
                    change={{ value: 12.5, type: 'increase' }}
                    icon={({ className }) => <div className={`bg-blue-500 rounded ${className}`} />}
                    isLoading={false}
                  />
                  <MetricCardWithLoading
                    title="Loading Metric"
                    icon={({ className }) => <div className={`bg-gray-300 rounded ${className}`} />}
                    isLoading={true}
                  />
                  <MetricCardWithLoading
                    title="Error Metric"
                    icon={({ className }) => <div className={`bg-red-500 rounded ${className}`} />}
                    error="Failed to load data"
                    onRetry={() => console.log('Retrying...')}
                  />
                </div>
              </div>

              {/* Progressive Loading */}
              <ProgressiveLoadingDemo />

              {/* Async Operations */}
              <AsyncOperationDemo />
            </div>
          </div>
        )}

        {/* Enhanced Dashboard Demo */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Enhanced Dashboard</h2>
          <p className="text-gray-600 mb-4">
            This dashboard demonstrates all error handling and loading state features working
            together.
          </p>
          <EnhancedDashboard />
        </div>
      </div>
    </div>
  );
};

export default ErrorHandlingDemoPage;
