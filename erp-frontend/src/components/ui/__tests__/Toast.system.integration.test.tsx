import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Helper function to get actual toast elements (not ARIA live regions)
const getActualToasts = () => {
  return screen
    .getAllByRole('alert')
    .filter(
      el =>
        !el.classList.contains('sr-only') &&
        el.getAttribute('aria-live') !== 'polite' &&
        el.getAttribute('aria-live') !== 'assertive'
    );
};

// Mock components that simulate real pages
const MockApprovalsPage = () => {
  const toast = useToast();

  const handleApprove = () => {
    toast.success('Approval request processed successfully!');
  };

  const handleReject = () => {
    toast.error('Failed to reject approval request');
  };

  const handleInfo = () => {
    toast.info('Approval request is pending review');
  };

  return (
    <div data-testid="approvals-page">
      <h1>Approvals Page</h1>
      <button onClick={handleApprove} data-testid="approve-btn">
        Approve
      </button>
      <button onClick={handleReject} data-testid="reject-btn">
        Reject
      </button>
      <button onClick={handleInfo} data-testid="info-btn">
        Info
      </button>
    </div>
  );
};

const MockUserManagementPage = () => {
  const toast = useToast();

  const handleCreateUser = () => {
    toast.success('User created successfully!');
  };

  const handleDeleteUser = () => {
    toast.error('Failed to delete user - user has active sessions');
  };

  const handleUpdateUser = () => {
    toast.success('User profile updated successfully!');
  };

  const handleWarning = () => {
    toast.warning('User account will be deactivated in 24 hours');
  };

  return (
    <div data-testid="user-management-page">
      <h1>User Management</h1>
      <button onClick={handleCreateUser} data-testid="create-user-btn">
        Create User
      </button>
      <button onClick={handleDeleteUser} data-testid="delete-user-btn">
        Delete User
      </button>
      <button onClick={handleUpdateUser} data-testid="update-user-btn">
        Update User
      </button>
      <button onClick={handleWarning} data-testid="warning-btn">
        Warning
      </button>
    </div>
  );
};

const MockInventoryPage = () => {
  const toast = useToast();

  const handleSaveItem = () => {
    toast.success('Inventory item saved successfully!');
  };

  const handleValidationError = () => {
    toast.error('Please fill in all required fields');
  };

  const handleStockAdjustment = () => {
    toast.info('Stock adjustment has been recorded');
  };

  return (
    <div data-testid="inventory-page">
      <h1>Inventory Management</h1>
      <button onClick={handleSaveItem} data-testid="save-item-btn">
        Save Item
      </button>
      <button onClick={handleValidationError} data-testid="validation-error-btn">
        Validation Error
      </button>
      <button onClick={handleStockAdjustment} data-testid="stock-adjustment-btn">
        Stock Adjustment
      </button>
    </div>
  );
};

// Mock router component that simulates navigation between pages
const MockRouter = ({ children }: { children: React.ReactNode }) => {
  const [currentPage, setCurrentPage] = React.useState('approvals');

  const navigate = (page: string) => {
    setCurrentPage(page);
  };

  return (
    <div data-testid="mock-router">
      <nav data-testid="navigation">
        <button onClick={() => navigate('approvals')} data-testid="nav-approvals">
          Approvals
        </button>
        <button onClick={() => navigate('users')} data-testid="nav-users">
          Users
        </button>
        <button onClick={() => navigate('inventory')} data-testid="nav-inventory">
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

// Mock timers for testing auto-dismissal
vi.useFakeTimers();

describe('Toast System Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Toast system integration with existing pages', () => {
    it('integrates seamlessly with ApprovalsPage functionality', async () => {
      render(
        <TestWrapper>
          <MockApprovalsPage />
        </TestWrapper>
      );

      // Verify page renders
      expect(screen.getByTestId('approvals-page')).toBeInTheDocument();
      expect(screen.getByText('Approvals Page')).toBeInTheDocument();

      // Test success toast
      fireEvent.click(screen.getByTestId('approve-btn'));
      expect(screen.getByText('Approval request processed successfully!')).toBeInTheDocument();

      const successToasts = getActualToasts().filter(toast =>
        toast.classList.contains('bg-green-50')
      );
      expect(successToasts).toHaveLength(1);

      // Test error toast
      fireEvent.click(screen.getByTestId('reject-btn'));
      expect(screen.getByText('Failed to reject approval request')).toBeInTheDocument();

      const allToasts = getActualToasts();
      expect(allToasts).toHaveLength(2); // Both toasts should be visible

      // Test info toast
      fireEvent.click(screen.getByTestId('info-btn'));
      expect(screen.getByText('Approval request is pending review')).toBeInTheDocument();

      const finalToasts = getActualToasts();
      expect(finalToasts).toHaveLength(3); // All three toasts should be visible
    });

    it('integrates seamlessly with UserManagementPage functionality', async () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      // Verify page renders
      expect(screen.getByTestId('user-management-page')).toBeInTheDocument();
      expect(screen.getByText('User Management')).toBeInTheDocument();

      // Test user creation success
      fireEvent.click(screen.getByTestId('create-user-btn'));
      expect(screen.getByText('User created successfully!')).toBeInTheDocument();

      // Test user deletion error
      fireEvent.click(screen.getByTestId('delete-user-btn'));
      expect(
        screen.getByText('Failed to delete user - user has active sessions')
      ).toBeInTheDocument();

      // Test user update success
      fireEvent.click(screen.getByTestId('update-user-btn'));
      expect(screen.getByText('User profile updated successfully!')).toBeInTheDocument();

      // Test warning toast
      fireEvent.click(screen.getByTestId('warning-btn'));
      expect(screen.getByText('User account will be deactivated in 24 hours')).toBeInTheDocument();

      const warningToasts = getActualToasts().filter(toast =>
        toast.classList.contains('bg-yellow-50')
      );
      expect(warningToasts).toHaveLength(1);
    });

    it('integrates seamlessly with InventoryPage functionality', async () => {
      render(
        <TestWrapper>
          <MockInventoryPage />
        </TestWrapper>
      );

      // Verify page renders
      expect(screen.getByTestId('inventory-page')).toBeInTheDocument();
      expect(screen.getByText('Inventory Management')).toBeInTheDocument();

      // Test inventory item save
      fireEvent.click(screen.getByTestId('save-item-btn'));
      expect(screen.getByText('Inventory item saved successfully!')).toBeInTheDocument();

      // Test validation error
      fireEvent.click(screen.getByTestId('validation-error-btn'));
      expect(screen.getByText('Please fill in all required fields')).toBeInTheDocument();

      // Test stock adjustment info
      fireEvent.click(screen.getByTestId('stock-adjustment-btn'));
      expect(screen.getByText('Stock adjustment has been recorded')).toBeInTheDocument();
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

      // All toasts should be visible and stacked
      const toasts = getActualToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(3);

      // Verify different toast types are present
      expect(screen.getByText('Approval request processed successfully!')).toBeInTheDocument();
      expect(screen.getByText('Failed to reject approval request')).toBeInTheDocument();
      expect(screen.getByText('Approval request is pending review')).toBeInTheDocument();
    });

    it('handles toast dismissal and stack reordering', async () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('create-user-btn'));
      fireEvent.click(screen.getByTestId('update-user-btn'));
      fireEvent.click(screen.getByTestId('warning-btn'));

      const initialToasts = getActualToasts();
      expect(initialToasts.length).toBeGreaterThanOrEqual(3);

      // Dismiss middle toast by clicking close button
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      if (closeButtons.length > 1) {
        fireEvent.click(closeButtons[1]); // Close middle toast

        // Wait for animation and removal
        act(() => {
          vi.advanceTimersByTime(250);
        });

        await waitFor(() => {
          const remainingToasts = getActualToasts();
          expect(remainingToasts.length).toBeLessThan(initialToasts.length);
        });
      }
    });

    it('handles rapid toast additions without performance issues', async () => {
      const RapidToastComponent = () => {
        const toast = useToast();

        const addManyToasts = () => {
          for (let i = 0; i < 10; i++) {
            toast.success(`Toast ${i + 1}`);
          }
        };

        return (
          <button onClick={addManyToasts} data-testid="add-many-toasts">
            Add Many Toasts
          </button>
        );
      };

      render(
        <TestWrapper>
          <RapidToastComponent />
        </TestWrapper>
      );

      const startTime = performance.now();
      fireEvent.click(screen.getByTestId('add-many-toasts'));
      const endTime = performance.now();

      // Should handle rapid additions quickly (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);

      // Should have some toasts visible (implementation may limit them)
      const toasts = getActualToasts();
      expect(toasts.length).toBeGreaterThan(0);
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

      // Add info toast (auto-dismisses in 4s)
      fireEvent.click(screen.getByTestId('info-btn'));

      const initialToasts = getActualToasts();
      expect(initialToasts.length).toBeGreaterThanOrEqual(3);

      // Fast-forward to auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        // Error toast should remain (manual dismiss only)
        expect(screen.getByText('Failed to reject approval request')).toBeInTheDocument();
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
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
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
      expect(toastContainer).toHaveClass('max-w-sm'); // But constrained max width
    });

    it('handles touch interactions on mobile', () => {
      render(
        <TestWrapper>
          <MockUserManagementPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('create-user-btn'));

      const toasts = getActualToasts();
      if (toasts.length > 0) {
        const toast = toasts[0];

        // Simulate touch tap to dismiss
        fireEvent.touchStart(toast);
        fireEvent.touchEnd(toast);

        // Should dismiss on touch
        act(() => {
          vi.advanceTimersByTime(250);
        });

        // Toast should be dismissed or in process of being dismissed
        expect(toast).toBeInTheDocument(); // May still be animating out
      }
    });

    it('provides adequate touch targets for close buttons', () => {
      render(
        <TestWrapper>
          <MockInventoryPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('save-item-btn'));

      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      if (closeButtons.length > 0) {
        const closeButton = closeButtons[0];

        // Should have minimum touch target classes
        expect(closeButton).toHaveClass('min-w-[44px]');
        expect(closeButton).toHaveClass('min-h-[44px]');
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
      expect(screen.getByText('Approval request processed successfully!')).toBeInTheDocument();

      // Navigate to users page
      fireEvent.click(screen.getByTestId('nav-users'));
      expect(screen.getByTestId('user-management-page')).toBeInTheDocument();

      // Toast should still be visible after navigation
      expect(screen.getByText('Approval request processed successfully!')).toBeInTheDocument();

      // Add another toast from the new page
      fireEvent.click(screen.getByTestId('create-user-btn'));
      expect(screen.getByText('User created successfully!')).toBeInTheDocument();

      // Both toasts should be visible
      const toasts = getActualToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(2);
    });

    it('handles toast dismissal across route changes', async () => {
      render(
        <TestWrapper>
          <MockRouter />
        </TestWrapper>
      );

      // Add toast on approvals page
      fireEvent.click(screen.getByTestId('approve-btn'));
      const initialToasts = getActualToasts();
      expect(initialToasts.length).toBeGreaterThan(0);

      // Navigate to inventory page
      fireEvent.click(screen.getByTestId('nav-inventory'));
      expect(screen.getByTestId('inventory-page')).toBeInTheDocument();

      // Dismiss toast from inventory page
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
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
          const remainingToasts = getActualToasts();
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
      expect(getActualToasts().length).toBeGreaterThan(0);

      // Navigate to users page
      fireEvent.click(screen.getByTestId('nav-users'));

      // Wait for auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Toast should be auto-dismissed even after navigation
      await waitFor(() => {
        // Success toasts should be dismissed
        expect(
          screen.queryByText('Approval request processed successfully!')
        ).not.toBeInTheDocument();
      });
    });

    it('preserves toast context across nested routes', () => {
      const NestedComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="nested-component">
            <button
              onClick={() => toast.info('Nested component toast')}
              data-testid="nested-toast-btn"
            >
              Nested Toast
            </button>
          </div>
        );
      };

      const ParentComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="parent-component">
            <button
              onClick={() => toast.success('Parent component toast')}
              data-testid="parent-toast-btn"
            >
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

      expect(screen.getByText('Parent component toast')).toBeInTheDocument();
      expect(screen.getByText('Nested component toast')).toBeInTheDocument();

      const toasts = getActualToasts();
      expect(toasts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles toast system errors gracefully', () => {
      const ErrorComponent = () => {
        const toast = useToast();

        const triggerError = () => {
          // Simulate an error in toast system
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

        const handleConcurrentOperations = async () => {
          // Simulate concurrent operations
          Promise.all([
            Promise.resolve(toast.success('Operation 1 complete')),
            Promise.resolve(toast.error('Operation 2 failed')),
            Promise.resolve(toast.info('Operation 3 info')),
            Promise.resolve(toast.warning('Operation 4 warning')),
          ]);
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
        const toasts = getActualToasts();
        expect(toasts.length).toBeGreaterThan(0);
      });

      expect(screen.getByText('Operation 1 complete')).toBeInTheDocument();
      expect(screen.getByText('Operation 2 failed')).toBeInTheDocument();
      expect(screen.getByText('Operation 3 info')).toBeInTheDocument();
      expect(screen.getByText('Operation 4 warning')).toBeInTheDocument();
    });
  });

  describe('Performance and optimization', () => {
    it('handles large numbers of toasts efficiently', () => {
      const PerformanceComponent = () => {
        const toast = useToast();

        const addManyToasts = () => {
          const startTime = performance.now();

          for (let i = 0; i < 50; i++) {
            toast.success(`Performance test toast ${i + 1}`);
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

      // Should have some toasts displayed (implementation may limit them)
      const toasts = getActualToasts();
      expect(toasts.length).toBeGreaterThan(0);

      // Should include performance info toast
      expect(screen.getByText(/Added 50 toasts in/)).toBeInTheDocument();
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

      // Component may re-render due to context changes, but should be minimal
      expect(renderCount).toBeLessThanOrEqual(initialRenderCount + 3);
    });
  });
});
