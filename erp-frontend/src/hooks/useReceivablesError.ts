// src/hooks/useReceivablesError.ts
import { useState, useEffect, useCallback } from 'react';
import { useToast } from './useToast';
import {
  ReceivablesErrorHandler,
  ProgressTracker,
  OperationProgress,
  RECEIVABLES_ERROR_CONTEXTS,
} from '../utils/receivablesErrorHandler';
import { LoadingStateManager, ButtonStateManager, ApiError } from '../utils/errorHandler';

export interface UseReceivablesErrorOptions {
  showToast?: boolean;
  logErrors?: boolean;
  trackProgress?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;
}

export interface ReceivablesErrorState {
  // Error state
  error: ApiError | null;
  hasError: boolean;

  // Loading state
  isLoading: boolean;
  loadingOperations: string[];

  // Progress state
  operations: OperationProgress[];
  activeOperations: OperationProgress[];

  // Button state
  disabledButtons: string[];

  // Methods
  clearError: () => void;
  handleError: (error: any, context: string, operationId?: string) => void;
  executeWithErrorHandling: <T>(
    operation: () => Promise<T>,
    context: string,
    operationId?: string,
    options?: {
      showSuccessToast?: boolean;
      successMessage?: string;
      totalItems?: number;
      progressCallback?: (progress: number, message: string) => void;
    }
  ) => Promise<T | null>;
  executeBulkOperation: <T, R>(
    items: T[],
    operation: (item: T, index: number) => Promise<R>,
    context: string,
    operationId: string,
    options?: {
      batchSize?: number;
      continueOnError?: boolean;
      showSuccessToast?: boolean;
      successMessage?: string;
      progressCallback?: (progress: number, message: string, processedItems: number) => void;
    }
  ) => Promise<{ results: R[]; errors: Array<{ item: T; error: ApiError }> } | null>;
  executeFileUpload: <T>(
    file: File,
    uploadOperation: (file: File, progressCallback: (progress: number) => void) => Promise<T>,
    context: string,
    operationId: string,
    options?: {
      showSuccessToast?: boolean;
      successMessage?: string;
    }
  ) => Promise<T | null>;
  isOperationLoading: (operationId: string) => boolean;
  isButtonDisabled: (buttonId: string) => boolean;
  disableButton: (operationId: string, buttonId: string) => void;
  enableButton: (operationId: string, buttonId: string) => void;
  getOperationProgress: (operationId: string) => OperationProgress | undefined;
}

export const useReceivablesError = (
  options: UseReceivablesErrorOptions = {}
): ReceivablesErrorState => {
  const {
    showToast = true,
    logErrors = true,
    trackProgress = true,
    autoRetry = true,
    maxRetries = 2,
  } = options;

  const { error: showErrorToast, success: showSuccessToast } = useToast();

  // State
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingOperations, setLoadingOperations] = useState<string[]>([]);
  const [operations, setOperations] = useState<OperationProgress[]>([]);
  const [disabledButtons, setDisabledButtons] = useState<string[]>([]);

  // Subscribe to loading state changes
  useEffect(() => {
    const unsubscribeLoading = LoadingStateManager.subscribe(operations => {
      setLoadingOperations(Array.from(operations));
    });

    const unsubscribeProgress = ProgressTracker.subscribe(operationsMap => {
      setOperations(Array.from(operationsMap.values()));
    });

    const unsubscribeButtons = ButtonStateManager.subscribe(buttonsMap => {
      const allDisabled = new Set<string>();
      for (const buttons of buttonsMap.values()) {
        buttons.forEach(button => allDisabled.add(button));
      }
      setDisabledButtons(Array.from(allDisabled));
    });

    return () => {
      unsubscribeLoading();
      unsubscribeProgress();
      unsubscribeButtons();
    };
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Handle error
  const handleError = useCallback(
    (error: any, context: string, operationId?: string) => {
      const classifiedError = ReceivablesErrorHandler.handleReceivablesError(
        error,
        context,
        operationId
      );
      setError(classifiedError);

      if (showToast) {
        const userMessage = ReceivablesErrorHandler.getReceivablesUserMessage(
          classifiedError,
          context
        );
        showErrorToast(userMessage);
      }

      return classifiedError;
    },
    [showToast, showErrorToast]
  );

  // Execute operation with error handling
  const executeWithErrorHandling = useCallback(
    async <T>(
      operation: () => Promise<T>,
      context: string,
      operationId?: string,
      options: {
        showSuccessToast?: boolean;
        successMessage?: string;
        totalItems?: number;
        progressCallback?: (progress: number, message: string) => void;
      } = {}
    ): Promise<T | null> => {
      const {
        showSuccessToast: showSuccess = false,
        successMessage = 'Operation completed successfully',
        totalItems,
        progressCallback,
      } = options;

      clearError();

      try {
        let result: T;

        if (trackProgress && operationId) {
          result = await ReceivablesErrorHandler.executeWithProgress(
            operation,
            context,
            operationId,
            totalItems,
            progressCallback
          );
        } else {
          result = await ReceivablesErrorHandler.withRetry(operation, context, {
            maxRetries: autoRetry ? maxRetries : 0,
          });
        }

        if (showSuccess && showToast) {
          showSuccessToast(successMessage);
        }

        return result;
      } catch (error) {
        handleError(error, context, operationId);
        return null;
      }
    },
    [clearError, trackProgress, autoRetry, maxRetries, showToast, showSuccessToast, handleError]
  );

  // Execute bulk operation
  const executeBulkOperation = useCallback(
    async <T, R>(
      items: T[],
      operation: (item: T, index: number) => Promise<R>,
      context: string,
      operationId: string,
      options: {
        batchSize?: number;
        continueOnError?: boolean;
        showSuccessToast?: boolean;
        successMessage?: string;
        progressCallback?: (progress: number, message: string, processedItems: number) => void;
      } = {}
    ): Promise<{ results: R[]; errors: Array<{ item: T; error: ApiError }> } | null> => {
      const {
        batchSize = 10,
        continueOnError = true,
        showSuccessToast: showSuccess = true,
        successMessage,
        progressCallback,
      } = options;

      clearError();

      try {
        const result = await ReceivablesErrorHandler.executeBulkOperation(
          items,
          operation,
          context,
          operationId,
          {
            batchSize,
            continueOnError,
            progressCallback,
          }
        );

        if (showSuccess && showToast) {
          const message =
            successMessage ||
            `Processed ${result.results.length} items successfully${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`;
          showSuccessToast(message);
        }

        return result;
      } catch (error) {
        handleError(error, context, operationId);
        return null;
      }
    },
    [clearError, showToast, showSuccessToast, handleError]
  );

  // Execute file upload
  const executeFileUpload = useCallback(
    async <T>(
      file: File,
      uploadOperation: (file: File, progressCallback: (progress: number) => void) => Promise<T>,
      context: string,
      operationId: string,
      options: {
        showSuccessToast?: boolean;
        successMessage?: string;
      } = {}
    ): Promise<T | null> => {
      const {
        showSuccessToast: showSuccess = true,
        successMessage = 'File uploaded successfully',
      } = options;

      clearError();

      try {
        const result = await ReceivablesErrorHandler.executeFileUpload(
          file,
          uploadOperation,
          context,
          operationId
        );

        if (showSuccess && showToast) {
          showSuccessToast(successMessage);
        }

        return result;
      } catch (error) {
        handleError(error, context, operationId);
        return null;
      }
    },
    [clearError, showToast, showSuccessToast, handleError]
  );

  // Utility methods
  const isOperationLoading = useCallback((operationId: string) => {
    return LoadingStateManager.isLoading(operationId);
  }, []);

  const isButtonDisabled = useCallback((buttonId: string) => {
    return ButtonStateManager.isButtonDisabled(buttonId);
  }, []);

  const disableButton = useCallback((operationId: string, buttonId: string) => {
    ButtonStateManager.disableButton(operationId, buttonId);
  }, []);

  const enableButton = useCallback((operationId: string, buttonId: string) => {
    ButtonStateManager.enableButton(operationId, buttonId);
  }, []);

  const getOperationProgress = useCallback((operationId: string) => {
    return ProgressTracker.getOperation(operationId);
  }, []);

  // Computed values
  const hasError = error !== null;
  const isLoading = loadingOperations.length > 0;
  const activeOperations = operations.filter(op => op.status === 'in_progress');

  return {
    // Error state
    error,
    hasError,

    // Loading state
    isLoading,
    loadingOperations,

    // Progress state
    operations,
    activeOperations,

    // Button state
    disabledButtons,

    // Methods
    clearError,
    handleError,
    executeWithErrorHandling,
    executeBulkOperation,
    executeFileUpload,
    isOperationLoading,
    isButtonDisabled,
    disableButton,
    enableButton,
    getOperationProgress,
  };
};

// Export error contexts for easy access
export { RECEIVABLES_ERROR_CONTEXTS };

export default useReceivablesError;
