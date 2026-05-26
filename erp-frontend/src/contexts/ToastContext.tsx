import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  memo,
} from 'react';
import {
  Toast,
  ToastState,
  ToastAction,
  ToastContextValue,
  ToastOptions,
  DEFAULT_TOAST_CONFIG,
  TOAST_DURATIONS,
} from '../types/toast';
import { ToastContainer } from '../components/ui/ToastContainer';
import { useToastPerformanceMonitoring } from '../utils/toastPerformance';

/**
 * Generate unique ID for toasts using timestamp and random number
 */
const generateToastId = (): string => {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Toast reducer function for state management
 */
const toastReducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.payload],
        nextId: state.nextId + 1,
      };

    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.id !== action.payload),
      };

    case 'CLEAR_ALL_TOASTS':
      return {
        ...state,
        toasts: [],
      };

    default:
      return state;
  }
};

/**
 * Initial state for toast system
 */
const initialState: ToastState = {
  toasts: [],
  nextId: 1,
};

/**
 * Create ToastContext with React.createContext
 */
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Custom hook to use the ToastContext
 * Provides error handling for when hook is used outside ToastProvider
 */
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};

/**
 * ToastProvider component that provides toast functionality to the app
 * Optimized with proper cleanup for timers and event listeners
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = memo(({ children }) => {
  const [state, dispatch] = useReducer(toastReducer, initialState);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const throttleRef = useRef<Map<string, number>>(new Map());

  // Performance monitoring for memory leak detection
  useToastPerformanceMonitoring(state.toasts.length, timersRef.current.size);

  // Maximum number of toasts to prevent memory issues
  const MAX_TOASTS = 5;
  const THROTTLE_DURATION = 1000; // 1 second throttle for duplicate messages

  /**
   * Add a toast to the state with throttling and limits
   */
  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>): string => {
      // Create throttle key based on message and type
      const throttleKey = `${toast.type}-${toast.message}`;
      const now = Date.now();

      // Check if this message is being throttled
      const lastShown = throttleRef.current.get(throttleKey);
      if (lastShown && now - lastShown < THROTTLE_DURATION) {
        // Return empty string to indicate throttled
        return '';
      }

      // Update throttle timestamp
      throttleRef.current.set(throttleKey, now);

      // Remove oldest toasts if we're at the limit
      if (state.toasts.length >= MAX_TOASTS) {
        const oldestToast = state.toasts[0];
        if (oldestToast) {
          // Clear timer for oldest toast
          const timer = timersRef.current.get(oldestToast.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(oldestToast.id);
          }
          dispatch({ type: 'REMOVE_TOAST', payload: oldestToast.id });
        }
      }

      const id = generateToastId();
      const newToast: Toast = {
        ...toast,
        id,
        duration: toast.duration ?? TOAST_DURATIONS[toast.type],
        dismissible: toast.dismissible ?? DEFAULT_TOAST_CONFIG.dismissible,
        position: toast.position ?? DEFAULT_TOAST_CONFIG.position,
      };

      dispatch({ type: 'ADD_TOAST', payload: newToast });

      // Set up auto-dismissal timer if duration > 0
      // Error toasts have duration 0 and remain visible until manually dismissed
      if (newToast.duration && newToast.duration > 0) {
        const timer = setTimeout(() => {
          dispatch({ type: 'REMOVE_TOAST', payload: id });
          timersRef.current.delete(id);
        }, newToast.duration);

        timersRef.current.set(id, timer);
      }

      return id;
    },
    [state.toasts, MAX_TOASTS, THROTTLE_DURATION]
  );

  /**
   * Remove a specific toast by ID
   */
  const removeToast = useCallback((id: string): void => {
    // Clear any associated timer
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  /**
   * Clear all toasts
   */
  const clearAllToasts = useCallback((): void => {
    // Clear all timers
    timersRef.current.forEach(timer => {
      clearTimeout(timer);
    });
    timersRef.current.clear();

    dispatch({ type: 'CLEAR_ALL_TOASTS' });
  }, []);

  /**
   * Create a success toast
   */
  const success = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'success',
        message,
        ...options,
      });
    },
    [addToast]
  );

  /**
   * Create an error toast
   */
  const error = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'error',
        message,
        ...options,
      });
    },
    [addToast]
  );

  /**
   * Create an info toast
   */
  const info = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'info',
        message,
        ...options,
      });
    },
    [addToast]
  );

  /**
   * Create a warning toast
   */
  const warning = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'warning',
        message,
        ...options,
      });
    },
    [addToast]
  );

  // Cleanup effect to clear all timers when component unmounts
  useEffect(() => {
    return () => {
      // Clear all timers on unmount
      timersRef.current.forEach(timer => {
        clearTimeout(timer);
      });
      timersRef.current.clear();

      // Clear throttle map to prevent memory leaks
      throttleRef.current.clear();
    };
  }, []);

  // Periodic cleanup of old throttle entries to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const entriesToDelete: string[] = [];

      throttleRef.current.forEach((timestamp, key) => {
        if (now - timestamp > THROTTLE_DURATION * 2) {
          entriesToDelete.push(key);
        }
      });

      entriesToDelete.forEach(key => {
        throttleRef.current.delete(key);
      });
    }, THROTTLE_DURATION * 2); // Clean up every 2 seconds

    return () => clearInterval(cleanupInterval);
  }, [THROTTLE_DURATION]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: ToastContextValue = React.useMemo(
    () => ({
      toasts: state.toasts,
      addToast,
      removeToast,
      clearAllToasts,
      success,
      error,
      info,
      warning,
      // Alias for better API naming
      dismiss: removeToast,
    }),
    [state.toasts, addToast, removeToast, clearAllToasts, success, error, info, warning]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Render ToastContainer at the root level */}
      <ToastContainer
        toasts={state.toasts}
        onDismiss={removeToast}
        position={DEFAULT_TOAST_CONFIG.position}
      />
    </ToastContext.Provider>
  );
});

// Add display name for debugging
ToastProvider.displayName = 'ToastProvider';

export default ToastContext;
