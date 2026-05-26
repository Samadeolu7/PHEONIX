/**
 * Toast notification system types and interfaces
 */

// Toast position options
export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

// Toast type variants
export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Core Toast interface
export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  dismissible?: boolean;
  position?: ToastPosition;
}

// Options for creating toasts
export interface ToastOptions {
  title?: string;
  duration?: number;
  dismissible?: boolean;
  position?: ToastPosition;
}

// Toast state management
export interface ToastState {
  toasts: Toast[];
  nextId: number;
}

// Toast actions for reducer
export type ToastAction =
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'CLEAR_ALL_TOASTS' };

// Context value interface
export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

// Default configuration constants
export const DEFAULT_TOAST_CONFIG = {
  duration: {
    success: 4000, // 4 seconds
    info: 4000, // 4 seconds
    warning: 6000, // 6 seconds
    error: 8000, // 8 seconds (changed from 0 to auto-dismiss)
  },
  position: 'top-right' as ToastPosition,
  dismissible: true,
  maxToasts: 5,
} as const;

// Duration mapping for toast types
export const TOAST_DURATIONS: Record<ToastType, number> = {
  success: DEFAULT_TOAST_CONFIG.duration.success,
  info: DEFAULT_TOAST_CONFIG.duration.info,
  warning: DEFAULT_TOAST_CONFIG.duration.warning,
  error: DEFAULT_TOAST_CONFIG.duration.error,
};
