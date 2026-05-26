import React, { useState, useCallback, useRef } from 'react';

export interface LoadingState {
  isLoading: boolean;
  error: Error | null;
  data: any;
}

export interface LoadingOptions {
  initialLoading?: boolean;
  timeout?: number;
  onTimeout?: () => void;
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

export function useLoadingState<T = any>(options: LoadingOptions = {}) {
  const {
    initialLoading = false,
    timeout = 30000, // 30 seconds default timeout
    onTimeout,
    onError,
    onSuccess,
  } = options;

  const [state, setState] = useState<LoadingState>({
    isLoading: initialLoading,
    error: null,
    data: null,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setLoading = useCallback(
    (loading: boolean) => {
      setState(prev => ({
        ...prev,
        isLoading: loading,
        error: loading ? null : prev.error, // Clear error when starting new load
      }));

      if (loading && timeout > 0) {
        // Set timeout for loading operation
        timeoutRef.current = setTimeout(() => {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: new Error('Operation timed out'),
          }));
          if (onTimeout) {
            onTimeout();
          }
        }, timeout);
      } else if (timeoutRef.current) {
        // Clear timeout if loading is done
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    [timeout, onTimeout]
  );

  const setError = useCallback(
    (error: Error | null) => {
      setState(prev => ({
        ...prev,
        error,
        isLoading: false,
      }));

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (error && onError) {
        onError(error);
      }
    },
    [onError]
  );

  const setData = useCallback(
    (data: T) => {
      setState(prev => ({
        ...prev,
        data,
        isLoading: false,
        error: null,
      }));

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (onSuccess) {
        onSuccess(data);
      }
    },
    [onSuccess]
  );

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      data: null,
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const execute = useCallback(
    async (asyncFn: () => Promise<T>) => {
      setLoading(true);
      try {
        const result = await asyncFn();
        setData(result);
        return result;
      } catch (error) {
        setError(error as Error);
        throw error;
      }
    },
    [setLoading, setData, setError]
  );

  return {
    ...state,
    setLoading,
    setError,
    setData,
    reset,
    execute,
  };
}

// Enhanced Button Hook
export interface EnhancedButtonOptions {
  showSpinner?: boolean;
  disabledText?: string;
  loadingText?: string;
}

export function useEnhancedButton(buttonId: string, options: EnhancedButtonOptions = {}) {
  const { showSpinner = true, disabledText, loadingText } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const getButtonProps = useCallback(
    (props: any = {}) => {
      return {
        ...props,
        disabled: isDisabled || isLoading || props.disabled,
        'data-button-id': buttonId,
      };
    },
    [buttonId, isDisabled, isLoading]
  );

  const getButtonText = useCallback(
    (originalText: string) => {
      if (isLoading && loadingText) {
        return loadingText;
      }
      if (isDisabled && disabledText) {
        return disabledText;
      }
      return originalText;
    },
    [isLoading, isDisabled, loadingText, disabledText]
  );

  const getSpinnerElement = useCallback(() => {
    if (!isLoading || !showSpinner) {
      return null;
    }

    return React.createElement('div', {
      style: {
        width: '16px',
        height: '16px',
        border: '2px solid transparent',
        borderTop: '2px solid currentColor',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      },
    });
  }, [isLoading, showSpinner]);

  return {
    isLoading,
    isDisabled,
    setIsLoading,
    setIsDisabled,
    getButtonProps,
    getButtonText,
    getSpinnerElement,
  };
}

// Multiple loading states manager
export function useMultipleLoadingStates() {
  const [states, setStates] = useState<Record<string, LoadingState>>({});

  const setLoadingState = useCallback((key: string, state: Partial<LoadingState>) => {
    setStates(prev => ({
      ...prev,
      [key]: {
        isLoading: false,
        error: null,
        data: null,
        ...prev[key],
        ...state,
      },
    }));
  }, []);

  const getLoadingState = useCallback(
    (key: string): LoadingState => {
      return (
        states[key] || {
          isLoading: false,
          error: null,
          data: null,
        }
      );
    },
    [states]
  );

  const isAnyLoading = useCallback(() => {
    return Object.values(states).some(state => state.isLoading);
  }, [states]);

  const hasAnyError = useCallback(() => {
    return Object.values(states).some(state => state.error);
  }, [states]);

  const executeForKey = useCallback(
    async <T>(key: string, asyncFn: () => Promise<T>) => {
      setLoadingState(key, { isLoading: true, error: null });
      try {
        const result = await asyncFn();
        setLoadingState(key, { isLoading: false, data: result });
        return result;
      } catch (error) {
        setLoadingState(key, { isLoading: false, error: error as Error });
        throw error;
      }
    },
    [setLoadingState]
  );

  return {
    states,
    setLoadingState,
    getLoadingState,
    isAnyLoading,
    hasAnyError,
    executeForKey,
  };
}

// Progressive loading hook for dashboard components
export function useProgressiveLoading(stages: string[]) {
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Error>>({});

  const startStage = useCallback((stage: string) => {
    setCurrentStage(stage);
  }, []);

  const completeStage = useCallback((stage: string) => {
    setCompletedStages(prev => new Set([...prev, stage]));
    setCurrentStage(null);
  }, []);

  const failStage = useCallback((stage: string, error: Error) => {
    setErrors(prev => ({ ...prev, [stage]: error }));
    setCurrentStage(null);
  }, []);

  const executeStage = useCallback(
    async (stage: string, asyncFn: () => Promise<void>) => {
      startStage(stage);
      try {
        await asyncFn();
        completeStage(stage);
      } catch (error) {
        failStage(stage, error as Error);
        throw error;
      }
    },
    [startStage, completeStage, failStage]
  );

  const getStageStatus = useCallback(
    (stage: string) => {
      return {
        completed: completedStages.has(stage),
        loading: currentStage === stage,
        error: errors[stage] || null,
      };
    },
    [completedStages, currentStage, errors]
  );

  const isComplete = completedStages.size === stages.length;
  const isLoading = currentStage !== null;
  const hasErrors = Object.keys(errors).length > 0;

  return {
    completedStages,
    currentStage,
    errors,
    isComplete,
    isLoading,
    hasErrors,
    startStage,
    completeStage,
    failStage,
    executeStage,
    getStageStatus,
  };
}
