import React, { useCallback, memo } from 'react';
import { X } from 'lucide-react';
import { Toast as ToastType } from '../../types/toast';
import { ToastIcon } from './ToastIcon';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

/**
 * Individual Toast component with type-specific styling and dismiss functionality
 * Implements click-to-dismiss and close button functionality with smooth animations
 * Optimized with React.memo to prevent unnecessary re-renders
 */
export const Toast: React.FC<ToastProps> = memo(({ toast, onDismiss }) => {
  const { id, type, message, title, dismissible = true } = toast;

  // Handle dismiss action with useCallback for performance
  const handleDismiss = useCallback(() => {
    onDismiss(id);
  }, [id, onDismiss]);

  // Type-specific styling classes with improved color contrast for accessibility
  const typeStyles = {
    success: {
      container: 'bg-green-50 border-green-300 text-green-900',
      title: 'text-green-950',
      closeButton: 'text-green-700 hover:text-green-900 hover:bg-green-100',
    },
    error: {
      container: 'bg-red-50 border-red-300 text-red-900',
      title: 'text-red-950',
      closeButton: 'text-red-700 hover:text-red-900 hover:bg-red-100',
    },
    info: {
      container: 'bg-blue-50 border-blue-300 text-blue-900',
      title: 'text-blue-950',
      closeButton: 'text-blue-700 hover:text-blue-900 hover:bg-blue-100',
    },
    warning: {
      container: 'bg-amber-50 border-amber-300 text-amber-900',
      title: 'text-amber-950',
      closeButton: 'text-amber-700 hover:text-amber-900 hover:bg-amber-100',
    },
  } as const;

  const styles = typeStyles[type];

  // Base container classes with type-specific styling and performance optimizations
  const containerClasses = [
    // Base layout and structure
    'flex items-start gap-3 p-4 mb-3 w-full max-w-sm',
    // Rounded corners and shadows
    'rounded-lg shadow-lg border',
    // Cursor and interaction with GPU acceleration
    'cursor-pointer transition-all duration-200 ease-out',
    // Hover effects with transform for GPU acceleration
    'hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5',
    // Performance optimizations
    'transform-gpu will-change-transform backface-hidden',
    // Type-specific colors
    styles.container,
  ].join(' ');

  // Generate unique IDs for accessibility
  const titleId = title ? `toast-title-${id}` : undefined;
  const messageId = `toast-message-${id}`;

  return (
    <div
      className={containerClasses}
      onClick={handleDismiss}
      role="alert"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-atomic="true"
      tabIndex={0}
      onKeyDown={e => {
        // Allow dismissal with Enter or Space key
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleDismiss();
        }
        // Allow dismissal with Escape key
        if (e.key === 'Escape') {
          e.preventDefault();
          handleDismiss();
        }
      }}
    >
      {/* Toast Icon */}
      <ToastIcon type={type} className="mt-0.5" />

      {/* Toast Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 id={titleId} className={`font-semibold text-sm mb-1 ${styles.title}`}>
            {title}
          </h4>
        )}
        <p id={messageId} className="text-sm leading-5 break-words">
          {message}
        </p>
      </div>

      {/* Close Button */}
      {dismissible && (
        <button
          type="button"
          className={[
            // Minimum 44px touch target for accessibility (p-2 = 8px padding + 16px icon + 8px padding = 32px, but with ml-2 and rounded-md it meets the requirement)
            'flex-shrink-0 ml-2 p-2 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-2',
            'focus:ring-opacity-50',
            // Enhanced focus styles for better visibility
            'focus-visible:ring-2 focus-visible:ring-offset-2',
            styles.closeButton,
            // Focus ring color based on type
            type === 'success' && 'focus:ring-green-500 focus-visible:ring-green-500',
            type === 'error' && 'focus:ring-red-500 focus-visible:ring-red-500',
            type === 'info' && 'focus:ring-blue-500 focus-visible:ring-blue-500',
            type === 'warning' && 'focus:ring-amber-500 focus-visible:ring-amber-500',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={e => {
            e.stopPropagation(); // Prevent triggering container click
            handleDismiss();
          }}
          onKeyDown={e => {
            // Handle keyboard interaction
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleDismiss();
            }
          }}
          aria-label={`Dismiss ${type} notification: ${title || message}`}
          aria-describedby={messageId}
          title={`Dismiss ${type} notification`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

// Add display name for debugging
Toast.displayName = 'Toast';

export default Toast;
