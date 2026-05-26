// src/hooks/useAsyncOperation.ts
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ErrorHandler,
  ApiError,
  LoadingStateManager,
  ButtonStateManager,
} from '../utils/errorHandler';
import { useToast } from './useToast';

export interface AsyncOperationState {
  isLoading: boolean;
  error: ApiError | null;
  isSuccess: boolean;
  data: any;
}

export interface AsyncOperationOptions {
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  successMessage?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: ApiError) => void;
  retryConfig?: {
    maxRetries?: number;
    baseDelay?: number;
  };
  // New options for enhanced UX
  operationId?: string; // Unique ID for tracking this operation
  disableButtons?: string[]; // Button IDs to disable during operation
  showRetryButton?: boolean; // Show retry button on error
  autoRetryOnNetworkError?: boolean; // Auto-retry network errors
}

/**
 * Hook for managing async operations with loading states, error handling, and user feedback
 */
export const useAsyncOperation = <T = any>(
  operation: (...args: any[]) => Promise<T>,
  context: string,
  options: AsyncOperationOptions = {}
) => {
  const {
    showSuccessToast = false,
    showErrorToast = true,
    successMessage,
    onSuccess,
    onError,
    retryConfig,
    operationId,
    disableButtons = [],
    showRetryButton = true,
    autoRetryOnNetworkError = false,
  } = options;

  const toast = useToast();
  const [state, setState] = useState<AsyncOperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
    data: null,
  });

  // Use ref to track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const operationIdRef = useRef(operationId || `${context}-${Date.now()}`);
  const retryCountRef = useRef(0);

  const execute = useCallback(
    async (...args: any[]): Promise<T | undefined> => {
      if (!isMountedRef.current) return;

      const currentOperationId = operationIdRef.current;

      // Start loading state
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        isSuccess: false,
      }));

      // Track loading state globally
      LoadingStateManager.addOperation(currentOperationId);

      // Disable specified buttons
      disableButtons.forEach(buttonId => {
        ButtonStateManager.disableButton(currentOperationId, buttonId);
      });

      try {
        const result = await ErrorHandler.withRetry(() => operation(...args), context, retryConfig);

        if (!isMountedRef.current) return;

        // Success state
        setState(prev => ({
          ...prev,
          isLoading: false,
          isSuccess: true,
          data: result,
        }));

        // Reset retry count on success
        retryCountRef.current = 0;

        // Show success toast if enabled
        if (showSuccessToast && successMessage) {
          toast.success(successMessage);
        }

        // Call success callback
        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (error) {
        if (!isMountedRef.current) return;

        const classifiedError = ErrorHandler.classifyError(error);

        setState(prev => ({
          ...prev,
          isLoading: false,
          error: classifiedError,
          isSuccess: false,
        }));

        // Handle authentication errors
        if (ErrorHandler.shouldRedirectToLogin(classifiedError)) {
          ErrorHandler.handleAuthenticationError();
          return;
        }

        // Auto-retry network errors if enabled
        if (
          autoRetryOnNetworkError &&
          classifiedError.code === 'NETWORK' &&
          retryCountRef.current < (retryConfig?.maxRetries || 3)
        ) {
          retryCountRef.current++;
          console.log(`Auto-retrying network error (attempt ${retryCountRef.current})`);

          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCountRef.current));

          if (isMountedRef.current) {
            return execute(...args);
          }
          return;
        }

        // Show error toast if enabled
        if (showErrorToast) {
          const userMessage = ErrorHandler.getUserFriendlyMessage(classifiedError, context);

          if (classifiedError.retryable && showRetryButton) {
            toast.error(userMessage, {
              action: {
                label: 'Retry',
                onClick: () => execute(...args),
              },
            });
          } else {
            toast.error(userMessage);
          }
        }

        // Log error
        ErrorHandler.logError(classifiedError, context);

        // Call error callback
        if (onError) {
          onError(classifiedError);
        }

        throw classifiedError;
      } finally {
        // Cleanup loading and button states
        LoadingStateManager.removeOperation(currentOperationId);
        disableButtons.forEach(buttonId => {
          ButtonStateManager.enableButton(currentOperationId, buttonId);
        });
      }
    },
    [
      operation,
      context,
      showSuccessToast,
      showErrorToast,
      successMessage,
      onSuccess,
      onError,
      retryConfig,
      disableButtons,
      showRetryButton,
      autoRetryOnNetworkError,
      toast,
    ]
  );

  const reset = useCallback(() => {
    if (!isMountedRef.current) return;

    setState({
      isLoading: false,
      error: null,
      isSuccess: false,
      data: null,
    });
  }, []);

  const retry = useCallback(
    (...args: any[]) => {
      return execute(...args);
    },
    [execute]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    retry,
  };
};

/**
 * Hook specifically for form submissions with enhanced UX
 */
export const useFormSubmission = <T = any>(
  submitOperation: (data: any) => Promise<T>,
  context: string,
  options: AsyncOperationOptions & {
    resetFormOnSuccess?: boolean;
    resetForm?: () => void;
  } = {}
) => {
  const { resetFormOnSuccess = false, resetForm, ...asyncOptions } = options;

  const asyncOp = useAsyncOperation(submitOperation, context, {
    ...asyncOptions,
    showSuccessToast: asyncOptions.showSuccessToast ?? true,
    onSuccess: data => {
      if (resetFormOnSuccess && resetForm) {
        resetForm();
      }
      if (asyncOptions.onSuccess) {
        asyncOptions.onSuccess(data);
      }
    },
  });

  return {
    ...asyncOp,
    submit: asyncOp.execute,
    isSubmitting: asyncOp.isLoading,
  };
};

/**
 * Hook for data fetching with loading states
 */
export const useDataFetching = <T = any>(
  fetchOperation: () => Promise<T>,
  context: string,
  options: AsyncOperationOptions & {
    fetchOnMount?: boolean;
  } = {}
) => {
  const { fetchOnMount = false, ...asyncOptions } = options;

  const asyncOp = useAsyncOperation(fetchOperation, context, {
    ...asyncOptions,
    showErrorToast: asyncOptions.showErrorToast ?? true,
  });

  // Auto-fetch on mount if enabled
  React.useEffect(() => {
    if (fetchOnMount) {
      asyncOp.execute();
    }
  }, [fetchOnMount]);

  return {
    ...asyncOp,
    fetch: asyncOp.execute,
    isFetching: asyncOp.isLoading,
    refetch: asyncOp.retry,
  };
};

export default useAsyncOperation;
