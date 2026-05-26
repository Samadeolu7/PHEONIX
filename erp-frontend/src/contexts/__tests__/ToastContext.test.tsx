import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast as useToastContext } from '../ToastContext';
import { useToast } from '../../hooks/useToast';
import { TOAST_DURATIONS } from '../../types/toast';

// Mock timers for testing auto-dismissal
vi.useFakeTimers();

// Test component to use the toast context
const TestComponent: React.FC = () => {
  const { success, error, info, warning, toasts, removeToast, clearAllToasts, addToast } =
    useToast();

  return (
    <div>
      <button onClick={() => success('Success message')}>Success</button>
      <button onClick={() => error('Error message')}>Error</button>
      <button onClick={() => info('Info message')}>Info</button>
      <button onClick={() => warning('Warning message')}>Warning</button>
      <button onClick={() => success('Custom success', { duration: 8000, title: 'Custom Title' })}>
        Custom Success
      </button>
      <button onClick={() => addToast({ type: 'info', message: 'Direct add' })}>Direct Add</button>
      <button onClick={() => clearAllToasts()}>Clear All</button>
      <div data-testid="toast-count">{toasts.length}</div>
      {toasts.map(toast => (
        <div key={toast.id} data-testid={`toast-${toast.type}-${toast.id}`}>
          <span data-testid={`message-${toast.id}`}>{toast.message}</span>
          {toast.title && <span data-testid={`title-${toast.id}`}>{toast.title}</span>}
          <span data-testid={`duration-${toast.id}`}>{toast.duration}</span>
          <button onClick={() => removeToast(toast.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
};

describe('ToastProvider and ToastContext', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Provider Setup and Context', () => {
    it('should provide toast functionality to child components', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Info')).toBeInTheDocument();
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should throw error when useToast is used outside provider', () => {
      const TestComponentWithoutProvider = () => {
        const { success } = useToast();
        return <button onClick={() => success('test')}>Test</button>;
      };

      expect(() => render(<TestComponentWithoutProvider />)).toThrow(
        'useToast must be used within a ToastProvider'
      );
    });

    it('should render ToastContainer as part of the provider', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add a toast to make container visible
      fireEvent.click(screen.getByText('Success'));

      // Check that ToastContainer is rendered
      const toastContainer = container.querySelector(
        '[role="region"][aria-label="Toast notifications"]'
      );
      expect(toastContainer).toBeInTheDocument();
    });
  });

  describe('Toast State Management', () => {
    it('should add toasts to state when methods are called', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      // Add success toast
      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Add error toast
      fireEvent.click(screen.getByText('Error'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');

      // Add info toast
      fireEvent.click(screen.getByText('Info'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      // Add warning toast
      fireEvent.click(screen.getByText('Warning'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('4');
    });

    it('should generate unique IDs for each toast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple toasts of the same type
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));

      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      // Check that all toasts have unique IDs
      const toastElements = screen.getAllByTestId(/^toast-success-/);
      expect(toastElements).toHaveLength(3);

      const ids = toastElements.map(el => el.getAttribute('data-testid'));
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should remove specific toasts by ID', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));
      fireEvent.click(screen.getByText('Info'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      // Remove the error toast
      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[1]); // Remove second toast (error)

      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
      expect(screen.queryByTestId(/toast-error-/)).not.toBeInTheDocument();
      expect(screen.getByTestId(/toast-success-/)).toBeInTheDocument();
      expect(screen.getByTestId(/toast-info-/)).toBeInTheDocument();
    });

    it('should clear all toasts when clearAllToasts is called', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));
      fireEvent.click(screen.getByText('Info'));
      fireEvent.click(screen.getByText('Warning'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('4');

      // Clear all toasts
      fireEvent.click(screen.getByText('Clear All'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('should handle addToast method with proper defaults', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Direct Add'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const toastElement = screen.getByTestId(/toast-info-/);
      expect(toastElement).toBeInTheDocument();
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Direct add');
    });
  });

  describe('Toast Configuration and Options', () => {
    it('should apply default durations based on toast type', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Test each toast type gets correct default duration
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));
      fireEvent.click(screen.getByText('Info'));
      fireEvent.click(screen.getByText('Warning'));

      // Find duration elements by looking for elements that contain the expected durations
      const durationElements = screen.getAllByTestId(/duration-/);
      const durations = durationElements.map(el => el.textContent);

      expect(durations).toContain(TOAST_DURATIONS.success.toString());
      expect(durations).toContain(TOAST_DURATIONS.error.toString());
      expect(durations).toContain(TOAST_DURATIONS.info.toString());
      expect(durations).toContain(TOAST_DURATIONS.warning.toString());
    });

    it('should accept custom options for toasts', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Custom Success'));

      expect(screen.getByTestId(/title-/)).toHaveTextContent('Custom Title');
      expect(screen.getByTestId(/duration-/)).toHaveTextContent('8000');
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Custom success');
    });

    it('should apply default dismissible and position properties', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));

      // Check that toast has default properties applied
      const toastElement = screen.getByTestId(/toast-success-/);
      expect(toastElement).toBeInTheDocument();

      // The toast should be dismissible by default (has remove button)
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });
  });

  describe('Auto-dismissal Timing', () => {
    it('should auto-dismiss success toasts after 4 seconds', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 4 seconds
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should auto-dismiss info toasts after 4 seconds', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Info'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 4 seconds
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should auto-dismiss warning toasts after 6 seconds', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Warning'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 5 seconds (should still be there)
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 1 more second (total 6 seconds)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should NOT auto-dismiss error toasts', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Error'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Error toast should still be there
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
      expect(screen.getByTestId(/toast-error-/)).toBeInTheDocument();
    });

    it('should respect custom duration in options', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Custom Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 7 seconds (should still be there)
      act(() => {
        vi.advanceTimersByTime(7000);
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Fast-forward time by 1 more second (total 8 seconds)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('should clear timer when toast is manually dismissed', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Manually remove the toast before auto-dismiss
      fireEvent.click(screen.getByText('Remove'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      // Fast-forward time to ensure no issues with cleared timer
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('should clear all timers when clearAllToasts is called', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple toasts with different durations
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Warning'));
      fireEvent.click(screen.getByText('Custom Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      // Clear all toasts
      fireEvent.click(screen.getByText('Clear All'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      // Fast-forward time to ensure no timers are still running
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should clean up timers on component unmount', () => {
      const { unmount } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add toasts with timers
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Warning'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');

      // Unmount the component
      unmount();

      // Fast-forward time to ensure timers are cleaned up
      vi.advanceTimersByTime(10000);

      // No errors should occur from timer callbacks
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should handle multiple rapid toast additions without memory leaks', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Rapidly add and remove toasts
      for (let i = 0; i < 10; i++) {
        fireEvent.click(screen.getByText('Success'));
        fireEvent.click(screen.getByText('Clear All'));
      }

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      // Clear any remaining timers
      act(() => {
        vi.runAllTimers();
      });

      // Should not have accumulated timers
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('Method Stability and Performance', () => {
    it('should provide stable method references with useCallback', () => {
      let renderCount = 0;
      const TestStabilityComponent = () => {
        renderCount++;
        const { success, error, info, warning, removeToast, clearAllToasts } = useToast();

        // Store references to check stability
        React.useEffect(() => {
          (window as any).toastMethods = {
            success,
            error,
            info,
            warning,
            removeToast,
            clearAllToasts,
          };
        });

        return <div data-testid="render-count">{renderCount}</div>;
      };

      const { rerender } = render(
        <ToastProvider>
          <TestStabilityComponent />
        </ToastProvider>
      );

      const initialMethods = (window as any).toastMethods;

      // Force re-render
      rerender(
        <ToastProvider>
          <TestStabilityComponent />
        </ToastProvider>
      );

      const afterRerender = (window as any).toastMethods;

      // Methods should be the same reference (stable)
      expect(initialMethods.success).toBe(afterRerender.success);
      expect(initialMethods.error).toBe(afterRerender.error);
      expect(initialMethods.info).toBe(afterRerender.info);
      expect(initialMethods.warning).toBe(afterRerender.warning);
      expect(initialMethods.removeToast).toBe(afterRerender.removeToast);
      expect(initialMethods.clearAllToasts).toBe(afterRerender.clearAllToasts);

      // Clean up
      delete (window as any).toastMethods;
    });
  });
});
