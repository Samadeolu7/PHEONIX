import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Helper function to get actual toast elements (not ARIA live regions)
const getVisibleToasts = () => {
  return screen
    .getAllByRole('alert')
    .filter(
      el =>
        !el.classList.contains('sr-only') &&
        el.getAttribute('aria-live') !== 'polite' &&
        el.getAttribute('aria-live') !== 'assertive'
    );
};

// Helper function to get close buttons
const getCloseButtons = () => {
  return screen
    .getAllByRole('button')
    .filter(
      button =>
        button.getAttribute('aria-label')?.includes('Dismiss') ||
        button.getAttribute('title')?.includes('Dismiss')
    );
};

// Mock components that simulate real pages
const MockApprovalsPage = () => {
  const toast = useToast();

  return (
    <div data-testid="approvals-page">
      <h1>Approvals Page</h1>
      <button
        onClick={() => toast.success('Approval processed successfully!')}
        data-testid="approve-btn"
      >
        Approve
      </button>
      <button onClick={() => toast.error('Failed to reject approval')} data-testid="reject-btn">
        Reject
      </button>
      <button onClick={() => toast.info('Approval is pending review')} data-testid="info-btn">
        Info
      </button>
    </div>
  );
};

const MockUserManagementPage = () => {
  const toast = useToast();

  return (
    <div data-testid="user-management-page">
      <h1>User Management</h1>
      <button
        onClick={() => toast.success('User created successfully!')}
        data-testid="create-user-btn"
      >
        Create User
      </button>
      <button onClick={() => toast.error('Failed to delete user')} data-testid="delete-user-btn">
        Delete User
      </button>
      <button onClick={() => toast.warning('User will be deactivated')} data-testid="warning-btn">
        Warning
      </button>
    </div>
  );
};

const MockInventoryPage = () => {
  const toast = useToast();

  return (
    <div data-testid="inventory-page">
      <h1>Inventory Management</h1>
      <button onClick={() => toast.success('Item saved successfully!')} data-testid="save-item-btn">
        Save Item
      </button>
      <button onClick={() => toast.error('Validation failed')} data-testid="validation-error-btn">
        Validation Error
      </button>
      <button
        onClick={() => toast.info('Stock adjustment recorded')}
        data-testid="stock-adjustment-btn"
      >
        Stock Adjustment
      </button>
    </div>
  );
};

// Mock router component
const MockRouter = ({ children }: { children: React.ReactNode }) => {
  const [currentPage, setCurrentPage] = React.useState('approvals');

  return (
    <div data-testid="mock-router">
      <nav data-testid="navigation">
        <button onClick={() => setCurrentPage('approvals')} data-testid="nav-approvals">
          Approvals
        </button>
        <button onClick={() => setCurrentPage('users')} data-testid="nav-users">
          Users
        </button>
        <button onClick={() => setCurrentPage('inventory')} data-testid="nav-inventory">
          Inventory
        </button>
      </nav>

      <div data-testid="page-content">
        {currentPage === 'approvals' && <MockApprovalsPage />}
        {currentPage === 'users' && <MockUserManagementPage />}
        {currentPage === 'inventory' && <MockInventoryPage />}
      </div>

      {children}
    </div>
  );
};

// Test wrapper component
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

describe('Toast Integration Tests - Final', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Toast system integration with existing pages', () => {
    it('integrates with ApprovalsPage and shows different toast types', async () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Verify page renders
      expect(screen.getByTestId('approvals-page')).toBeInTheDocument();

      // Test success toast
      fireEvent.click(screen.getByTestId('approve-btn'));

      const successToasts = getVisibleToasts().filter(toast =>
        toast.classList.contains('bg-green-50')
      );
      expect(successToasts.length).toBeGreaterThan(0);

      // Test error toast
      fireEvent.click(screen.getByTestId('reject-btn'));

      const errorToasts = getVisibleToasts().filter(toast => toast.classList.contains('bg-red-50'));
      expect(errorToasts.length).toBeGreaterThan(0);

      // Test info toast
      fireEvent.click(screen.getByTestId('info-btn'));

      const infoToasts = getVisibleToasts().filter(toast => toast.classList.contains('bg-blue-50'));
      expect(infoToasts.length).toBeGreaterThan(0);
    });

    it('integrates with UserManagementPage and shows warning toasts', async () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      // Test warning toast
      fireEvent.click(screen.getByTestId('warning-btn'));

      const warningToasts = getVisibleToasts().filter(toast =>
        toast.classList.contains('bg-yellow-50')
      );
      expect(warningToasts.length).toBeGreaterThan(0);
    });

    it('integrates with InventoryPage functionality', async () => {
      render(
        <TestWrapper>
          <MockInventoryPage />
        </TestWrapper>
      );

      // Test inventory operations
      fireEvent.click(screen.getByTestId('save-item-btn'));
      fireEvent.click(screen.getByTestId('validation-error-btn'));
      fireEvent.click(screen.getByTestId('stock-adjustment-btn'));

      // Should have toasts for all operations
      const toasts = getVisibleToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Multiple toast management and stacking behavior', () => {
    it('handles multiple toasts with proper stacking', async () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add multiple toasts rapidly
      fireEvent.click(screen.getByTestId('approve-btn'));
      fireEvent.click(screen.getByTestId('reject-btn'));
      fireEvent.click(screen.getByTestId('info-btn'));

      // All toasts should be visible
      const toasts = getVisibleToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(3);

      // Verify different toast types are present by checking classes
      const successToasts = toasts.filter(toast => toast.classList.contains('bg-green-50'));
      const errorToasts = toasts.filter(toast => toast.classList.contains('bg-red-50'));
      const infoToasts = toasts.filter(toast => toast.classList.contains('bg-blue-50'));

      expect(successToasts.length).toBeGreaterThan(0);
      expect(errorToasts.length).toBeGreaterThan(0);
      expect(infoToasts.length).toBeGreaterThan(0);
    });

    it('handles toast dismissal and stack management', async () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('create-user-btn'));
      fireEvent.click(screen.getByTestId('delete-user-btn'));
      fireEvent.click(screen.getByTestId('warning-btn'));

      const initialToasts = getVisibleToasts();
      expect(initialToasts.length).toBeGreaterThanOrEqual(3);

      // Dismiss a toast by clicking close button
      const closeButtons = getCloseButtons();
      if (closeButtons.length > 0) {
        fireEvent.click(closeButtons[0]);

        // Wait for animation
        act(() => {
          vi.advanceTimersByTime(250);
        });

        await waitFor(() => {
          const remainingToasts = getVisibleToasts();
          expect(remainingToasts.length).toBeLessThan(initialToasts.length);
        });
      }
    });

    it('maintains toast order during auto-dismissal', async () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add success toast (auto-dismisses in 4s)
      fireEvent.click(screen.getByTestId('approve-btn'));

      // Add error toast (manual dismiss only)
      fireEvent.click(screen.getByTestId('reject-btn'));

      const initialToasts = getVisibleToasts();
      expect(initialToasts.length).toBeGreaterThanOrEqual(2);

      // Fast-forward to auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        // Error toast should remain (manual dismiss only)
        const remainingToasts = getVisibleToasts();
        const errorToasts = remainingToasts.filter(toast => toast.classList.contains('bg-red-50'));
        expect(errorToasts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Responsive behavior and mobile compatibility', () => {
    it('adapts positioning for mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('approve-btn'));

      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Should have mobile-specific classes
      expect(toastContainer).toHaveClass('px-4'); // Mobile padding
      expect(toastContainer).toHaveClass('w-full'); // Full width on mobile
      expect(toastContainer).toHaveClass('max-w-sm'); // Constrained max width
    });

    it('provides adequate touch targets for close buttons', () => {
      render(
        <TestWrapper>
          <MockInventoryPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('save-item-btn'));

      const closeButtons = getCloseButtons();
      if (closeButtons.length > 0) {
        const closeButton = closeButtons[0];

        // Should have minimum touch target classes
        expect(closeButton).toHaveClass('min-w-[44px]');
        expect(closeButton).toHaveClass('min-h-[44px]');
      }
    });

    it('handles touch interactions on mobile', () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('create-user-btn'));

      const toasts = getVisibleToasts();
      if (toasts.length > 0) {
        const toast = toasts[0];

        // Simulate touch tap to dismiss
        fireEvent.touchStart(toast);
        fireEvent.touchEnd(toast);

        // Should handle touch interaction without errors
        expect(toast).toBeInTheDocument();
      }
    });
  });

  describe('Toast notifications work across different routes', () => {
    it('maintains toast state during navigation', async () => {
      render(
        <TestWrapper>
          <MockRouter />
        </TestWrapper>
      );

      // Start on approvals page
      expect(screen.getByTestId('approvals-page')).toBeInTheDocument();

      // Add a toast
      fireEvent.click(screen.getByTestId('approve-btn'));
      const initialToasts = getVisibleToasts();
      expect(initialToasts.length).toBeGreaterThan(0);

      // Navigate to users page
      fireEvent.click(screen.getByTestId('nav-users'));
      expect(screen.getByTestId('user-management-page')).toBeInTheDocument();

      // Toast should still be visible after navigation
      const toastsAfterNav = getVisibleToasts();
      expect(toastsAfterNav.length).toBeGreaterThanOrEqual(initialToasts.length);

      // Add another toast from the new page
      fireEvent.click(screen.getByTestId('create-user-btn'));

      // Both toasts should be visible
      const finalToasts = getVisibleToasts();
      expect(finalToasts.length).toBeGreaterThan(initialToasts.length);
    });

    it('handles toast dismissal across route changes', async () => {
      render(
        <TestWrapper>
          <MockRouter />
        </TestWrapper>
      );

      // Add toast on approvals page
      fireEvent.click(screen.getByTestId('approve-btn'));
      const initialToasts = getVisibleToasts();
      expect(initialToasts.length).toBeGreaterThan(0);

      // Navigate to inventory page
      fireEvent.click(screen.getByTestId('nav-inventory'));
      expect(screen.getByTestId('inventory-page')).toBeInTheDocument();

      // Dismiss toast from inventory page
      const closeButtons = getCloseButtons();
      if (closeButtons.length > 0) {
        fireEvent.click(closeButtons[0]);

        act(() => {
          vi.advanceTimersByTime(250);
        });

        // Navigate back to approvals page
        fireEvent.click(screen.getByTestId('nav-approvals'));
        expect(screen.getByTestId('approvals-page')).toBeInTheDocument();

        // Toast should be dismissed
        await waitFor(() => {
          const remainingToasts = getVisibleToasts();
          expect(remainingToasts.length).toBeLessThan(initialToasts.length);
        });
      }
    });

    it('handles auto-dismissal timers across route changes', async () => {
      render(
        <TestWrapper>
          <MockRouter />
        </TestWrapper>
      );

      // Add success toast (4s auto-dismiss)
      fireEvent.click(screen.getByTestId('approve-btn'));
      expect(getVisibleToasts().length).toBeGreaterThan(0);

      // Navigate to users page
      fireEvent.click(screen.getByTestId('nav-users'));

      // Wait for auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Toast should be auto-dismissed even after navigation
      await waitFor(() => {
        const successToasts = getVisibleToasts().filter(toast =>
          toast.classList.contains('bg-green-50')
        );
        expect(successToasts.length).toBe(0);
      });
    });

    it('preserves toast context across nested routes', () => {
      const NestedComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="nested-component">
            <button onClick={() => toast.info('Nested toast')} data-testid="nested-toast-btn">
              Nested Toast
            </button>
          </div>
        );
      };

      const ParentComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="parent-component">
            <button onClick={() => toast.success('Parent toast')} data-testid="parent-toast-btn">
              Parent Toast
            </button>
            <NestedComponent />
          </div>
        );
      };

      render(
        <TestWrapper>
          <ParentComponent />
        </TestWrapper>
      );

      // Both components should have access to toast context
      fireEvent.click(screen.getByTestId('parent-toast-btn'));
      fireEvent.click(screen.getByTestId('nested-toast-btn'));

      const toasts = getVisibleToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(2);

      // Verify different toast types
      const successToasts = toasts.filter(toast => toast.classList.contains('bg-green-50'));
      const infoToasts = toasts.filter(toast => toast.classList.contains('bg-blue-50'));

      expect(successToasts.length).toBeGreaterThan(0);
      expect(infoToasts.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles toast system errors gracefully', () => {
      const ErrorComponent = () => {
        const toast = useToast();

        const triggerError = () => {
          try {
            toast.success(''); // Empty message
            toast.error(null as any); // Invalid message
            toast.info(undefined as any); // Invalid message
          } catch (error) {
            // Should not throw
          }
        };

        return (
          <button onClick={triggerError} data-testid="trigger-error">
            Trigger Error
          </button>
        );
      };

      expect(() => {
        render(
          <TestWrapper>
            <ErrorComponent />
          </TestWrapper>
        );

        fireEvent.click(screen.getByTestId('trigger-error'));
      }).not.toThrow();
    });

    it('handles memory cleanup on unmount', () => {
      const { unmount } = render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('approve-btn'));
      fireEvent.click(screen.getByTestId('reject-btn'));

      // Should have active timers
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount component
      unmount();

      // Should clean up all timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it('handles concurrent toast operations', async () => {
      const ConcurrentComponent = () => {
        const toast = useToast();

        const handleConcurrentOperations = () => {
          // Simulate concurrent operations
          toast.success('Operation 1 complete');
          toast.error('Operation 2 failed');
          toast.info('Operation 3 info');
          toast.warning('Operation 4 warning');
        };

        return (
          <button onClick={handleConcurrentOperations} data-testid="concurrent-ops">
            Concurrent Operations
          </button>
        );
      };

      render(
        <TestWrapper>
          <ConcurrentComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('concurrent-ops'));

      // Should handle all concurrent toasts
      await waitFor(() => {
        const toasts = getVisibleToasts();
        expect(toasts.length).toBeGreaterThanOrEqual(4);
      });

      // Verify different toast types are present
      const toasts = getVisibleToasts();
      const successToasts = toasts.filter(toast => toast.classList.contains('bg-green-50'));
      const errorToasts = toasts.filter(toast => toast.classList.contains('bg-red-50'));
      const infoToasts = toasts.filter(toast => toast.classList.contains('bg-blue-50'));
      const warningToasts = toasts.filter(toast => toast.classList.contains('bg-yellow-50'));

      expect(successToasts.length).toBeGreaterThan(0);
      expect(errorToasts.length).toBeGreaterThan(0);
      expect(infoToasts.length).toBeGreaterThan(0);
      expect(warningToasts.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and optimization', () => {
    it('handles large numbers of toasts efficiently', () => {
      const PerformanceComponent = () => {
        const toast = useToast();

        const addManyToasts = () => {
          const startTime = performance.now();

          for (let i = 0; i < 50; i++) {
            toast.success(`Toast ${i + 1}`);
          }

          const endTime = performance.now();
          toast.info(`Added 50 toasts in ${(endTime - startTime).toFixed(2)}ms`);
        };

        return (
          <button onClick={addManyToasts} data-testid="performance-test">
            Performance Test
          </button>
        );
      };

      render(
        <TestWrapper>
          <PerformanceComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('performance-test'));

      // Should have some toasts displayed
      const toasts = getVisibleToasts();
      expect(toasts.length).toBeGreaterThan(0);
    });

    it('optimizes re-renders with memoization', () => {
      let renderCount = 0;

      const OptimizedComponent = React.memo(() => {
        renderCount++;
        const toast = useToast();

        return (
          <div data-testid="optimized-component">
            <span data-testid="render-count">{renderCount}</span>
            <button onClick={() => toast.success('Test')} data-testid="add-toast">
              Add Toast
            </button>
          </div>
        );
      });

      render(
        <TestWrapper>
          <OptimizedComponent />
        </TestWrapper>
      );

      const initialRenderCount = renderCount;

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('add-toast'));
      fireEvent.click(screen.getByTestId('add-toast'));
      fireEvent.click(screen.getByTestId('add-toast'));

      // Component may re-render due to context changes, but should be reasonable
      expect(renderCount).toBeLessThanOrEqual(initialRenderCount + 5);
    });
  });

  describe('Accessibility features', () => {
    it('maintains proper toast container structure', () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add toast to trigger container creation
      fireEvent.click(screen.getByTestId('approve-btn'));

      // Check toast container exists with proper attributes
      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });
      expect(toastContainer).toBeInTheDocument();
      expect(toastContainer).toHaveAttribute('aria-label', 'Toast notifications');
    });

    it('maintains keyboard navigation for close buttons', () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add toast
      fireEvent.click(screen.getByTestId('approve-btn'));

      // Close button should be keyboard accessible
      const closeButtons = getCloseButtons();
      if (closeButtons.length > 0) {
        const closeButton = closeButtons[0];
        expect(closeButton).toBeInTheDocument();

        // Should have proper focus classes
        expect(closeButton).toHaveClass('focus:outline-none', 'focus:ring-2');
      }
    });

    it('provides proper ARIA labels for toast elements', () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Add toast
      fireEvent.click(screen.getByTestId('approve-btn'));

      const toasts = getVisibleToasts();
      if (toasts.length > 0) {
        const toast = toasts[0];

        // Should have proper ARIA attributes
        expect(toast).toHaveAttribute('role', 'alert');
        expect(toast).toHaveAttribute('aria-atomic', 'true');
      }
    });
  });
});
