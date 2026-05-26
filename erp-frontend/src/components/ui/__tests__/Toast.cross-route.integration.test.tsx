import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Mock pages that simulate real application routes
const HomePage = () => {
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div data-testid="home-page">
      <h1>Home Page</h1>
      <button
        onClick={() => toast.success('Welcome to the application!')}
        data-testid="welcome-toast"
      >
        Show Welcome
      </button>
      <button onClick={() => navigate('/dashboard')} data-testid="nav-dashboard">
        Go to Dashboard
      </button>
    </div>
  );
};

const DashboardPage = () => {
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div data-testid="dashboard-page">
      <h1>Dashboard</h1>
      <button
        onClick={() => toast.info('Dashboard loaded successfully')}
        data-testid="dashboard-info"
      >
        Dashboard Info
      </button>
      <button onClick={() => navigate('/users')} data-testid="nav-users">
        Go to Users
      </button>
      <button onClick={() => navigate('/')} data-testid="nav-home">
        Go Home
      </button>
    </div>
  );
};

const UsersPage = () => {
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div data-testid="users-page">
      <h1>Users Management</h1>
      <button onClick={() => toast.error('Failed to load users')} data-testid="users-error">
        Trigger Error
      </button>
      <button onClick={() => toast.warning('Some users are inactive')} data-testid="users-warning">
        Show Warning
      </button>
      <button onClick={() => navigate('/dashboard')} data-testid="nav-dashboard">
        Back to Dashboard
      </button>
    </div>
  );
};

const NestedRoutePage = () => {
  const toast = useToast();
  const location = useLocation();

  return (
    <div data-testid="nested-route-page">
      <h1>Nested Route</h1>
      <p data-testid="current-path">{location.pathname}</p>
      <button
        onClick={() => toast.success(`Toast from ${location.pathname}`)}
        data-testid="nested-toast"
      >
        Add Nested Toast
      </button>
    </div>
  );
};

const TestApp = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/nested/*" element={<NestedRoutePage />} />
      <Route path="/nested/deep/route" element={<NestedRoutePage />} />
    </Routes>
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

// Mock timers for testing
vi.useFakeTimers();

describe('Toast Cross-Route Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    // Reset window location
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Toast persistence across route navigation', () => {
    it('maintains toasts when navigating between routes', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Start on home page
      expect(screen.getByTestId('home-page')).toBeInTheDocument();

      // Add a toast on home page
      fireEvent.click(screen.getByTestId('welcome-toast'));
      expect(screen.getByText('Welcome to the application!')).toBeInTheDocument();

      // Navigate to dashboard
      fireEvent.click(screen.getByTestId('nav-dashboard'));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // Toast should persist after navigation
      expect(screen.getByText('Welcome to the application!')).toBeInTheDocument();

      // Add another toast on dashboard
      fireEvent.click(screen.getByTestId('dashboard-info'));
      expect(screen.getByText('Dashboard loaded successfully')).toBeInTheDocument();

      // Both toasts should be visible
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });

    it('handles toast auto-dismissal during navigation', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Add success toast (auto-dismisses in 4s)
      fireEvent.click(screen.getByTestId('welcome-toast'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Navigate to dashboard
      fireEvent.click(screen.getByTestId('nav-dashboard'));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // Fast-forward time to trigger auto-dismissal
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      // Toast should be auto-dismissed even after navigation
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    it('preserves error toasts (manual dismiss only) across routes', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Navigate to users page
      fireEvent.click(screen.getByTestId('nav-dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('nav-users'));
      await waitFor(() => {
        expect(screen.getByTestId('users-page')).toBeInTheDocument();
      });

      // Add error toast (manual dismiss only)
      fireEvent.click(screen.getByTestId('users-error'));
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();

      // Navigate back to dashboard
      fireEvent.click(screen.getByTestId('nav-dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // Error toast should still be visible
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();

      // Fast-forward time (error toasts don't auto-dismiss)
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Error toast should still be visible
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });

    it('handles multiple route changes with mixed toast types', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Home -> Dashboard -> Users -> Dashboard -> Home
      const navigationSequence = [
        { page: 'nav-dashboard', expectedPage: 'dashboard-page', action: 'dashboard-info' },
        { page: 'nav-users', expectedPage: 'users-page', action: 'users-warning' },
        { page: 'nav-dashboard', expectedPage: 'dashboard-page', action: null },
        { page: 'nav-home', expectedPage: 'home-page', action: 'welcome-toast' },
      ];

      for (const { page, expectedPage, action } of navigationSequence) {
        fireEvent.click(screen.getByTestId(page));

        await waitFor(() => {
          expect(screen.getByTestId(expectedPage)).toBeInTheDocument();
        });

        if (action) {
          fireEvent.click(screen.getByTestId(action));
        }
      }

      // Should have accumulated toasts from different pages
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeGreaterThan(1);

      // Check for specific toast messages
      expect(screen.getByText('Dashboard loaded successfully')).toBeInTheDocument();
      expect(screen.getByText('Some users are inactive')).toBeInTheDocument();
      expect(screen.getByText('Welcome to the application!')).toBeInTheDocument();
    });
  });

  describe('Toast behavior with nested routes', () => {
    it('handles toasts in nested route structures', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Navigate to nested route
      window.history.pushState({}, '', '/nested/deep/route');

      // Force re-render to reflect route change
      fireEvent(window, new PopStateEvent('popstate'));

      await waitFor(() => {
        expect(screen.getByTestId('nested-route-page')).toBeInTheDocument();
        expect(screen.getByTestId('current-path')).toHaveTextContent('/nested/deep/route');
      });

      // Add toast from nested route
      fireEvent.click(screen.getByTestId('nested-toast'));
      expect(screen.getByText('Toast from /nested/deep/route')).toBeInTheDocument();

      // Navigate to different nested route
      window.history.pushState({}, '', '/nested');
      fireEvent(window, new PopStateEvent('popstate'));

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/nested');
      });

      // Toast should persist across nested route changes
      expect(screen.getByText('Toast from /nested/deep/route')).toBeInTheDocument();

      // Add another toast from different nested route
      fireEvent.click(screen.getByTestId('nested-toast'));
      expect(screen.getByText('Toast from /nested')).toBeInTheDocument();

      // Both toasts should be visible
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });

    it('maintains toast context in deeply nested components', () => {
      const DeepNestedComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="deep-nested">
            <button onClick={() => toast.info('Deep nested toast')} data-testid="deep-nested-toast">
              Deep Nested Toast
            </button>
          </div>
        );
      };

      const MiddleComponent = () => (
        <div data-testid="middle-component">
          <DeepNestedComponent />
        </div>
      );

      const TopComponent = () => {
        const toast = useToast();

        return (
          <div data-testid="top-component">
            <button onClick={() => toast.success('Top level toast')} data-testid="top-level-toast">
              Top Level Toast
            </button>
            <MiddleComponent />
          </div>
        );
      };

      render(
        <TestWrapper>
          <TopComponent />
        </TestWrapper>
      );

      // Both nested levels should have access to toast context
      fireEvent.click(screen.getByTestId('top-level-toast'));
      fireEvent.click(screen.getByTestId('deep-nested-toast'));

      expect(screen.getByText('Top level toast')).toBeInTheDocument();
      expect(screen.getByText('Deep nested toast')).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
  });

  describe('Toast state management across browser navigation', () => {
    it('handles browser back/forward navigation', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Add toast on home page
      fireEvent.click(screen.getByTestId('welcome-toast'));
      expect(screen.getByText('Welcome to the application!')).toBeInTheDocument();

      // Navigate to dashboard
      fireEvent.click(screen.getByTestId('nav-dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // Add toast on dashboard
      fireEvent.click(screen.getByTestId('dashboard-info'));
      expect(screen.getAllByRole('alert')).toHaveLength(2);

      // Simulate browser back button
      act(() => {
        window.history.back();
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });

      // Toasts should persist after browser navigation
      expect(screen.getAllByRole('alert')).toHaveLength(2);
      expect(screen.getByText('Welcome to the application!')).toBeInTheDocument();
      expect(screen.getByText('Dashboard loaded successfully')).toBeInTheDocument();
    });

    it('handles page refresh with toast state reset', () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Add toasts
      fireEvent.click(screen.getByTestId('welcome-toast'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Simulate page refresh by unmounting and remounting
      const { unmount } = render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // After refresh, toasts should be cleared
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      unmount();
    });

    it('handles rapid navigation without memory leaks', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Rapid navigation sequence
      const rapidNavigation = async () => {
        for (let i = 0; i < 10; i++) {
          fireEvent.click(screen.getByTestId('nav-dashboard'));
          await waitFor(() => {
            expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
          });

          fireEvent.click(screen.getByTestId('nav-users'));
          await waitFor(() => {
            expect(screen.getByTestId('users-page')).toBeInTheDocument();
          });

          fireEvent.click(screen.getByTestId('nav-dashboard'));
          await waitFor(() => {
            expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
          });

          fireEvent.click(screen.getByTestId('nav-home'));
          await waitFor(() => {
            expect(screen.getByTestId('home-page')).toBeInTheDocument();
          });
        }
      };

      await rapidNavigation();

      // Should not have excessive timers after rapid navigation
      expect(vi.getTimerCount()).toBeLessThan(10);
    });
  });

  describe('Toast positioning consistency across routes', () => {
    it('maintains consistent positioning across different pages', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      const pages = [
        { nav: 'nav-dashboard', page: 'dashboard-page', action: 'dashboard-info' },
        { nav: 'nav-users', page: 'users-page', action: 'users-warning' },
      ];

      for (const { nav, page, action } of pages) {
        fireEvent.click(screen.getByTestId(nav));

        await waitFor(() => {
          expect(screen.getByTestId(page)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId(action));

        // Check toast container positioning
        const toastContainer = screen.getByRole('region', { name: /toast notifications/i });
        expect(toastContainer).toHaveClass('fixed', 'top-4', 'right-4');
        expect(toastContainer).toHaveClass('z-50'); // Consistent z-index
      }
    });

    it('handles toast overflow with consistent behavior across routes', async () => {
      const OverflowTestPage = () => {
        const toast = useToast();

        const addManyToasts = () => {
          for (let i = 0; i < 10; i++) {
            toast.success(`Toast ${i + 1}`);
          }
        };

        return (
          <div data-testid="overflow-test-page">
            <button onClick={addManyToasts} data-testid="add-many">
              Add Many Toasts
            </button>
          </div>
        );
      };

      render(
        <TestWrapper>
          <OverflowTestPage />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('add-many'));

      // Should limit number of visible toasts consistently
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(5);

      // Navigate to different page
      window.history.pushState({}, '', '/dashboard');
      fireEvent(window, new PopStateEvent('popstate'));

      // Toast limit should be maintained
      const remainingToasts = screen.getAllByRole('alert');
      expect(remainingToasts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Toast accessibility across routes', () => {
    it('maintains ARIA live regions across route changes', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Check initial ARIA live regions
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');

      // Navigate to different route
      fireEvent.click(screen.getByTestId('nav-dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // ARIA live regions should still be present
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');

      // Add toasts and verify announcements
      fireEvent.click(screen.getByTestId('dashboard-info'));
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Dashboard loaded successfully');
    });

    it('maintains keyboard navigation across routes', async () => {
      render(
        <TestWrapper>
          <TestApp />
        </TestWrapper>
      );

      // Add toast
      fireEvent.click(screen.getByTestId('welcome-toast'));

      // Navigate to different route
      fireEvent.click(screen.getByTestId('nav-dashboard'));
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      // Close button should still be keyboard accessible
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();

      // Simulate keyboard navigation
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);

      // Simulate Enter key press
      fireEvent.keyDown(closeButton, { key: 'Enter', code: 'Enter' });

      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Toast should be dismissed
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });
});
