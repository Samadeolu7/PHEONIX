import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Test component for stacking behavior
const StackingTestComponent = () => {
  const toast = useToast();

  return (
    <div data-testid="stacking-test">
      <button onClick={() => toast.success('Success toast 1')} data-testid="success-1">
        Success 1
      </button>
      <button onClick={() => toast.success('Success toast 2')} data-testid="success-2">
        Success 2
      </button>
      <button onClick={() => toast.error('Error toast 1')} data-testid="error-1">
        Error 1
      </button>
      <button onClick={() => toast.error('Error toast 2')} data-testid="error-2">
        Error 2
      </button>
      <button onClick={() => toast.info('Info toast')} data-testid="info-1">
        Info 1
      </button>
      <button onClick={() => toast.warning('Warning toast')} data-testid="warning-1">
        Warning 1
      </button>
      <button
        onClick={() => {
          for (let i = 1; i <= 10; i++) {
            toast.success(`Bulk toast ${i}`);
          }
        }}
        data-testid="bulk-add"
      >
        Add 10 Toasts
      </button>
      <button
        onClick={() => {
          toast.success('First');
          setTimeout(() => toast.error('Second'), 100);
          setTimeout(() => toast.info('Third'), 200);
          setTimeout(() => toast.warning('Fourth'), 300);
        }}
        data-testid="timed-sequence"
      >
        Timed Sequence
      </button>
      <button
        onClick={() => {
          // Rapid fire toasts
          for (let i = 0; i < 5; i++) {
            setTimeout(() => toast.success(`Rapid ${i + 1}`), i * 10);
          }
        }}
        data-testid="rapid-fire"
      >
        Rapid Fire
      </button>
    </div>
  );
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>{children}</ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock timers
vi.useFakeTimers();

describe('Toast Stacking Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Basic stacking behavior', () => {
    it('stacks toasts in correct order (newest on top)', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add toasts in sequence
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('error-1'));
      fireEvent.click(screen.getByTestId('info-1'));

      const toasts = screen.getAllByRole('alert');
      expect(toasts).toHaveLength(3);

      // Newest should be first in DOM order (top of stack)
      expect(toasts[0]).toHaveTextContent('Info toast');
      expect(toasts[1]).toHaveTextContent('Error toast 1');
      expect(toasts[2]).toHaveTextContent('Success toast 1');
    });

    it('maintains proper vertical spacing between stacked toasts', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('success-2'));
      fireEvent.click(screen.getByTestId('error-1'));

      const toasts = screen.getAllByRole('alert');
      expect(toasts).toHaveLength(3);

      // Check that toasts have proper spacing classes
      toasts.forEach(toast => {
        const wrapper = toast.parentElement;
        expect(wrapper).toHaveClass('mb-3'); // Margin bottom for spacing
      });
    });

    it('handles mixed toast types in stack', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add different types of toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('error-1'));
      fireEvent.click(screen.getByTestId('warning-1'));
      fireEvent.click(screen.getByTestId('info-1'));

      const toasts = screen.getAllByRole('alert');
      expect(toasts).toHaveLength(4);

      // Verify different toast types are properly styled
      expect(toasts[0]).toHaveClass('bg-blue-50'); // Info (newest)
      expect(toasts[1]).toHaveClass('bg-yellow-50'); // Warning
      expect(toasts[2]).toHaveClass('bg-red-50'); // Error
      expect(toasts[3]).toHaveClass('bg-green-50'); // Success (oldest)
    });
  });

  describe('Stack management and limits', () => {
    it('limits maximum number of visible toasts', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add more toasts than the limit
      fireEvent.click(screen.getByTestId('bulk-add'));

      const toasts = screen.getAllByRole('alert');

      // Should limit to maximum (typically 5)
      expect(toasts.length).toBeLessThanOrEqual(5);

      // Should show the most recent toasts
      expect(toasts[0]).toHaveTextContent('Bulk toast 10');
      expect(toasts[1]).toHaveTextContent('Bulk toast 9');
    });

    it('removes oldest toasts when limit is exceeded', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add toasts one by one to test removal
      for (let i = 1; i <= 7; i++) {
        fireEvent.click(screen.getByTestId('success-1'));
      }

      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(5);

      // Oldest toasts should be removed
      expect(screen.queryByText('Success toast 1')).not.toBeInTheDocument();
    });

    it('handles rapid toast additions efficiently', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      const startTime = performance.now();
      fireEvent.click(screen.getByTestId('rapid-fire'));

      // Fast-forward timers to process all rapid additions
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const endTime = performance.now();

      // Should handle rapid additions quickly
      expect(endTime - startTime).toBeLessThan(100);

      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeGreaterThan(0);
      expect(toasts.length).toBeLessThanOrEqual(5);
    });

    it('maintains performance with frequent stack updates', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Simulate frequent updates
      for (let i = 0; i < 20; i++) {
        fireEvent.click(screen.getByTestId('success-1'));

        // Occasionally dismiss toasts
        if (i % 3 === 0) {
          const closeButtons = screen.getAllByRole('button', { name: /close/i });
          if (closeButtons.length > 0) {
            fireEvent.click(closeButtons[0]);
          }
        }
      }

      // Should maintain reasonable number of toasts
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Stack reordering and animations', () => {
    it('smoothly reorders stack when middle toast is dismissed', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add three toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('error-1'));
      fireEvent.click(screen.getByTestId('info-1'));

      let toasts = screen.getAllByRole('alert');
      expect(toasts).toHaveLength(3);

      // Dismiss middle toast
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeButtons[1]); // Middle toast

      // Wait for animation
      act(() => {
        vi.advanceTimersByTime(250);
      });

      await waitFor(() => {
        toasts = screen.getAllByRole('alert');
        expect(toasts).toHaveLength(2);
      });

      // Remaining toasts should maintain proper order
      expect(toasts[0]).toHaveTextContent('Info toast');
      expect(toasts[1]).toHaveTextContent('Success toast 1');
    });

    it('handles staggered animations for multiple toasts', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts at once
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('success-2'));
      fireEvent.click(screen.getByTestId('error-1'));

      const toasts = screen.getAllByRole('alert');

      // Check for staggered animation delays
      toasts.forEach((toast, index) => {
        const wrapper = toast.parentElement;
        const expectedDelay = index * 50; // 50ms stagger
        expect(wrapper).toHaveStyle(`animation-delay: ${expectedDelay}ms`);
      });
    });

    it('maintains smooth animations during auto-dismissal', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add success toasts (auto-dismiss in 4s)
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('success-2'));

      // Add error toast (manual dismiss only)
      fireEvent.click(screen.getByTestId('error-1'));

      expect(screen.getAllByRole('alert')).toHaveLength(3);

      // Fast-forward to auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Success toasts should be dismissed, error should remain
      await waitFor(() => {
        const remainingToasts = screen.getAllByRole('alert');
        expect(remainingToasts).toHaveLength(1);
        expect(remainingToasts[0]).toHaveTextContent('Error toast 1');
      });
    });

    it('handles exit animations for multiple simultaneous dismissals', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add multiple success toasts (same auto-dismiss time)
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('success-2'));
      fireEvent.click(screen.getByTestId('info-1')); // Also auto-dismisses

      expect(screen.getAllByRole('alert')).toHaveLength(3);

      // Fast-forward to auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // All should be dismissed simultaneously
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Stack behavior with different toast types', () => {
    it('prioritizes error toasts in stack visibility', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Fill stack with success toasts
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('success-1'));
      }

      // Add error toast
      fireEvent.click(screen.getByTestId('error-1'));

      const toasts = screen.getAllByRole('alert');

      // Error toast should be visible (newest on top)
      expect(toasts[0]).toHaveTextContent('Error toast 1');
      expect(toasts[0]).toHaveClass('bg-red-50');
    });

    it('handles mixed auto-dismiss and manual-dismiss toasts', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add mix of toast types
      fireEvent.click(screen.getByTestId('success-1')); // Auto-dismiss 4s
      fireEvent.click(screen.getByTestId('error-1')); // Manual dismiss
      fireEvent.click(screen.getByTestId('warning-1')); // Auto-dismiss 6s
      fireEvent.click(screen.getByTestId('info-1')); // Auto-dismiss 4s

      expect(screen.getAllByRole('alert')).toHaveLength(4);

      // Fast-forward 4 seconds
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Success and info should be dismissed
      await waitFor(() => {
        const remainingToasts = screen.getAllByRole('alert');
        expect(remainingToasts).toHaveLength(2);
        expect(screen.getByText('Error toast 1')).toBeInTheDocument();
        expect(screen.getByText('Warning toast')).toBeInTheDocument();
      });

      // Fast-forward another 2 seconds (total 6s)
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Warning should now be dismissed, only error remains
      await waitFor(() => {
        const remainingToasts = screen.getAllByRole('alert');
        expect(remainingToasts).toHaveLength(1);
        expect(remainingToasts[0]).toHaveTextContent('Error toast 1');
      });
    });

    it('maintains proper ARIA announcements for stacked toasts', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add different types of toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('error-1'));
      fireEvent.click(screen.getByTestId('info-1'));

      // Check polite live region (success, info)
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Success toast 1');
      expect(politeRegion).toHaveTextContent('Info toast');

      // Check assertive live region (error)
      const assertiveRegions = screen.getAllByRole('alert');
      const assertiveRegion = assertiveRegions.find(
        region => region.getAttribute('aria-live') === 'assertive'
      );
      expect(assertiveRegion).toHaveTextContent('Error toast 1');
    });
  });

  describe('Stack persistence and memory management', () => {
    it('cleans up dismissed toasts from memory', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('success-2'));

      expect(screen.getAllByRole('alert')).toHaveLength(2);

      // Dismiss all toasts
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      closeButtons.forEach(button => fireEvent.click(button));

      // Wait for animations
      act(() => {
        vi.advanceTimersByTime(250);
      });

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });

      // Should clean up timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it('handles component unmount with active toast stack', () => {
      const { unmount } = render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('success-1'));
      fireEvent.click(screen.getByTestId('error-1'));
      fireEvent.click(screen.getByTestId('info-1'));

      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount component
      unmount();

      // Should clean up all timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it('prevents memory leaks with rapid stack changes', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Simulate rapid stack changes
      for (let i = 0; i < 50; i++) {
        fireEvent.click(screen.getByTestId('success-1'));

        // Occasionally clear stack
        if (i % 10 === 0) {
          const closeButtons = screen.getAllByRole('button', { name: /close/i });
          closeButtons.forEach(button => fireEvent.click(button));

          act(() => {
            vi.advanceTimersByTime(250);
          });
        }
      }

      // Should not accumulate excessive timers
      expect(vi.getTimerCount()).toBeLessThan(20);
    });
  });

  describe('Stack interaction edge cases', () => {
    it('handles clicking on toasts while animations are running', () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Add toast
      fireEvent.click(screen.getByTestId('success-1'));
      const toast = screen.getByRole('alert');

      // Click on toast while it's animating in
      fireEvent.click(toast);

      // Should dismiss immediately
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles rapid dismiss and add operations', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Rapid sequence of add/dismiss operations
      for (let i = 0; i < 10; i++) {
        fireEvent.click(screen.getByTestId('success-1'));

        const closeButtons = screen.getAllByRole('button', { name: /close/i });
        if (closeButtons.length > 0) {
          fireEvent.click(closeButtons[0]);
        }
      }

      // Should handle without errors
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should have reasonable final state
      const finalToasts = screen.getAllByRole('alert');
      expect(finalToasts.length).toBeLessThanOrEqual(5);
    });

    it('maintains stack integrity during concurrent operations', async () => {
      render(
        <TestWrapper>
          <StackingTestComponent />
        </TestWrapper>
      );

      // Simulate concurrent operations
      const operations = [
        () => fireEvent.click(screen.getByTestId('success-1')),
        () => fireEvent.click(screen.getByTestId('error-1')),
        () => {
          const closeButtons = screen.getAllByRole('button', { name: /close/i });
          if (closeButtons.length > 0) fireEvent.click(closeButtons[0]);
        },
        () => fireEvent.click(screen.getByTestId('info-1')),
      ];

      // Execute operations rapidly
      operations.forEach((op, index) => {
        setTimeout(op, index * 10);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Stack should remain consistent
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeGreaterThan(0);
      expect(toasts.length).toBeLessThanOrEqual(5);

      // All visible toasts should be properly rendered
      toasts.forEach(toast => {
        expect(toast).toBeInTheDocument();
        expect(toast).toHaveAttribute('role', 'alert');
      });
    });
  });
});
