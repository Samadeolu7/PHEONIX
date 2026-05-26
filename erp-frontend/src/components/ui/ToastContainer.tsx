import React, { useState, useEffect, memo, useCallback, useRef } from 'react';
import { Toast } from './Toast';
import { Toast as ToastType, ToastPosition } from '../../types/toast';

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: string) => void;
  position?: ToastPosition;
}

interface AnimatedToast extends ToastType {
  isExiting?: boolean;
  animationState?: 'entering' | 'entered' | 'exiting' | 'exited';
}

/**
 * ToastContainer component for positioning and layout of toast notifications
 * Handles fixed positioning, z-index layering, responsive design, vertical stacking,
 * and smooth enter/exit animations with proper stack movement
 * Optimized with React.memo to prevent unnecessary re-renders
 */
export const ToastContainer: React.FC<ToastContainerProps> = memo(
  ({ toasts, onDismiss, position = 'top-right' }) => {
    const [animatedToasts, setAnimatedToasts] = useState<AnimatedToast[]>([]);
    const previousToastsRef = useRef<ToastType[]>([]);
    const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Handle toast changes and animations
    useEffect(() => {
      const previousToasts = previousToastsRef.current;
      const currentToastIds = new Set(toasts.map(t => t.id));
      const previousToastIds = new Set(previousToasts.map(t => t.id));

      // Find new toasts (entering)
      const newToasts = toasts.filter(toast => !previousToastIds.has(toast.id));

      // Find removed toasts (exiting)
      const removedToasts = previousToasts.filter(toast => !currentToastIds.has(toast.id));

      // Update animated toasts state
      setAnimatedToasts(prevAnimated => {
        let updated = [...prevAnimated];

        // Mark removed toasts as exiting
        removedToasts.forEach(removedToast => {
          const index = updated.findIndex(t => t.id === removedToast.id);
          if (index !== -1) {
            updated[index] = { ...updated[index], isExiting: true, animationState: 'exiting' };

            // Remove toast after exit animation completes
            const timeout = setTimeout(() => {
              setAnimatedToasts(current => current.filter(t => t.id !== removedToast.id));
              timeoutsRef.current.delete(removedToast.id);
            }, 250); // Match exit animation duration

            timeoutsRef.current.set(removedToast.id, timeout);
          }
        });

        // Add new toasts with entering state
        newToasts.forEach(newToast => {
          const animatedToast: AnimatedToast = {
            ...newToast,
            isExiting: false,
            animationState: 'entering',
          };
          updated.push(animatedToast);

          // Mark as entered after animation
          const timeout = setTimeout(() => {
            setAnimatedToasts(current =>
              current.map(t => (t.id === newToast.id ? { ...t, animationState: 'entered' } : t))
            );
            timeoutsRef.current.delete(newToast.id);
          }, 300); // Match enter animation duration

          timeoutsRef.current.set(newToast.id, timeout);
        });

        // Update existing toasts that haven't changed
        const existingToasts = toasts.filter(toast => previousToastIds.has(toast.id));
        existingToasts.forEach(existingToast => {
          const index = updated.findIndex(t => t.id === existingToast.id);
          if (index !== -1 && !updated[index].isExiting) {
            updated[index] = { ...existingToast, animationState: updated[index].animationState };
          }
        });

        return updated;
      });

      previousToastsRef.current = toasts;
    }, [toasts]);

    // Cleanup timeouts on unmount and when toasts change
    useEffect(() => {
      return () => {
        // Clear all animation timeouts when component unmounts
        timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        timeoutsRef.current.clear();
      };
    }, []);

    // Additional cleanup when toasts array changes to prevent memory leaks
    useEffect(() => {
      const currentToastIds = new Set(toasts.map(t => t.id));

      // Clear timeouts for toasts that no longer exist
      timeoutsRef.current.forEach((timeout, id) => {
        if (!currentToastIds.has(id)) {
          clearTimeout(timeout);
          timeoutsRef.current.delete(id);
        }
      });
    }, [toasts]);

    // Return null if no toasts to render - but keep hooks consistent
    const shouldRender = animatedToasts.length > 0;

    // Position-specific styling classes
    const getPositionClasses = (pos: ToastPosition): string => {
      const baseClasses = 'fixed pointer-events-none toast-container';

      switch (pos) {
        case 'top-right':
          return `${baseClasses} top-4 right-4 sm:top-6 sm:right-6`;
        case 'top-left':
          return `${baseClasses} top-4 left-4 sm:top-6 sm:left-6`;
        case 'top-center':
          return `${baseClasses} top-4 left-1/2 transform -translate-x-1/2 sm:top-6`;
        case 'bottom-right':
          return `${baseClasses} bottom-4 right-4 sm:bottom-6 sm:right-6`;
        case 'bottom-left':
          return `${baseClasses} bottom-4 left-4 sm:bottom-6 sm:left-6`;
        case 'bottom-center':
          return `${baseClasses} bottom-4 left-1/2 transform -translate-x-1/2 sm:bottom-6`;
        default:
          return `${baseClasses} top-4 right-4 sm:top-6 sm:right-6`;
      }
    };

    // Get animation names based on position and state
    const getAnimationNames = (pos: ToastPosition) => {
      const isBottom = pos.includes('bottom');

      if (pos.includes('left')) {
        return {
          enter: isBottom ? 'toast-slide-in-bottom-left' : 'toast-slide-in-left',
          exit: isBottom ? 'toast-slide-out-bottom-left' : 'toast-slide-out-left',
        };
      } else if (pos.includes('center')) {
        return {
          enter: isBottom ? 'toast-fade-in-bottom' : 'toast-fade-in',
          exit: isBottom ? 'toast-fade-out-bottom' : 'toast-fade-out',
        };
      } else {
        return {
          enter: isBottom ? 'toast-slide-in-bottom' : 'toast-slide-in',
          exit: isBottom ? 'toast-slide-out-bottom' : 'toast-slide-out',
        };
      }
    };

    // Container classes with positioning and z-index
    const containerClasses = [
      getPositionClasses(position),
      // High z-index to appear above all other content (z-50 = 50)
      'z-50',
      // Responsive width constraints
      'w-full max-w-sm',
      // Mobile-specific adjustments - add padding on mobile, remove on larger screens
      'px-4 sm:px-0',
    ].join(' ');

    // Stack direction based on position (top positions stack down, bottom positions stack up)
    const isTopPosition = position.includes('top');
    const stackClasses = isTopPosition
      ? 'flex flex-col' // Top positions: stack downward
      : 'flex flex-col-reverse'; // Bottom positions: stack upward

    const animations = getAnimationNames(position);

    // Enhanced dismiss handler that triggers exit animation
    const handleDismiss = useCallback(
      (id: string) => {
        // Mark toast as exiting to trigger animation
        setAnimatedToasts(current =>
          current.map(toast =>
            toast.id === id ? { ...toast, isExiting: true, animationState: 'exiting' } : toast
          )
        );

        // Call the actual dismiss after animation
        setTimeout(() => {
          onDismiss(id);
        }, 250); // Match exit animation duration
      },
      [onDismiss]
    );

    return (
      <>
        {/* ARIA live regions for screen reader announcements - always rendered */}
        <div
          aria-live="polite"
          aria-atomic="false"
          className="sr-only"
          role="status"
          aria-label="Non-urgent notifications"
        >
          {/* Announce success and info toasts politely */}
          {animatedToasts
            .filter(
              toast => (toast.type === 'success' || toast.type === 'info') && !toast.isExiting
            )
            .map(toast => (
              <div key={`polite-${toast.id}`}>
                {toast.title && `${toast.title}: `}
                {toast.message}
              </div>
            ))}
        </div>

        <div
          aria-live="assertive"
          aria-atomic="false"
          className="sr-only"
          role="alert"
          aria-label="Urgent notifications"
        >
          {/* Announce error and warning toasts assertively */}
          {animatedToasts
            .filter(
              toast => (toast.type === 'error' || toast.type === 'warning') && !toast.isExiting
            )
            .map(toast => (
              <div key={`assertive-${toast.id}`}>
                {toast.title && `${toast.title}: `}
                {toast.message}
              </div>
            ))}
        </div>

        {shouldRender && (
          <div className={containerClasses} role="region" aria-label="Toast notifications">
            {/* Toast stack container with proper spacing and pointer events */}
            <div className={`${stackClasses} pointer-events-auto`}>
              {animatedToasts.map((toast, index) => {
                const isEntering = toast.animationState === 'entering';
                const isExiting = toast.isExiting || toast.animationState === 'exiting';

                // Calculate stagger delay for entering toasts
                const enterDelay = isEntering ? index * 50 : 0;

                return (
                  <div
                    key={toast.id}
                    className={`toast-stack-item toast-item ${isEntering ? 'toast-enter' : ''} ${isExiting ? 'toast-exit' : ''}`}
                    style={{
                      // Apply appropriate animation based on state with delay included
                      animation: isExiting
                        ? `${animations.exit} 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards`
                        : isEntering
                          ? `${animations.enter} 0.3s cubic-bezier(0.4, 0, 0.2, 1) ${enterDelay}ms forwards`
                          : undefined,
                      // Spacing between toasts
                      marginBottom: isTopPosition && !isExiting ? '12px' : undefined,
                      marginTop: !isTopPosition && !isExiting ? '12px' : undefined,
                    }}
                  >
                    <Toast toast={toast} onDismiss={handleDismiss} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }
);

// Add display name for debugging
ToastContainer.displayName = 'ToastContainer';

export default ToastContainer;
