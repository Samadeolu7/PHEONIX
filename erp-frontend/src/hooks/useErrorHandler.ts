import { useState, useCallback } from 'react';

export interface ErrorState {
  error: Error | null;
  isError: boolean;
  retryCount: number;
  isRetrying: boolean;
}

export interface ErrorHandlerOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
  onRetry?: (retryCount: number) => void;
  onMaxRetriesReached?: (error: Error) => void;
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const { maxRetries = 3, retryDelay = 1000, onError, onRetry, onMaxRetriesReached } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    retryCount: 0,
    isRetrying: false,
  });

  const setError = useCallback(
    (error: Error) => {
      setErrorState(prev => ({
        ...prev,
        error,
        isError: true,
      }));

      if (onError) {
        onError(error);
      }
    },
    [onError]
  );

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      retryCount: 0,
      isRetrying: false,
    });
  }, []);

  const retry = useCallback(
    async (retryFn: () => Promise<void> | void) => {
      if (errorState.retryCount >= maxRetries) {
        if (onMaxRetriesReached && errorState.error) {
          onMaxRetriesReached(errorState.error);
        }
        return;
      }

      setErrorState(prev => ({
        ...prev,
        isRetrying: true,
        retryCount: prev.retryCount + 1,
      }));

      if (onRetry) {
        onRetry(errorState.retryCount + 1);
      }

      try {
        // Add delay before retry
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        await retryFn();

        // Success - clear error state
        clearError();
      } catch (error) {
        setErrorState(prev => ({
          ...prev,
          error: error as Error,
          isError: true,
          isRetrying: false,
        }));
      }
    },
    [
      errorState.retryCount,
      errorState.error,
      maxRetries,
      retryDelay,
      onRetry,
      onMaxRetriesReached,
      clearError,
    ]
  );

  const executeWithErrorHandling = useCallback(
    async (asyncFn: () => Promise<void>, options?: { suppressError?: boolean }) => {
      try {
        clearError();
        await asyncFn();
      } catch (error) {
        if (!options?.suppressError) {
          setError(error as Error);
        }
        throw error;
      }
    },
    [setError, clearError]
  );

  return {
    ...errorState,
    setError,
    clearError,
    retry,
    executeWithErrorHandling,
    canRetry: errorState.retryCount < maxRetries,
  };
}

// Network-specific error handler
export function useNetworkErrorHandler() {
  return useErrorHandler({
    maxRetries: 3,
    retryDelay: 2000,
    onError: error => {
      console.error('Network error:', error);
    },
    onMaxRetriesReached: error => {
      console.error('Max network retries reached:', error);
    },
  });
}

// API-specific error handler
export function useApiErrorHandler() {
  return useErrorHandler({
    maxRetries: 2,
    retryDelay: 1500,
    onError: error => {
      console.error('API error:', error);
    },
  });
}
