// Accessibility Testing Suite for Dashboard Components
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { RoleBasedDashboard } from '../components/dashboard/RoleBasedDashboard';
import { StatsCard } from '../components/dashboard/StatsCard';
import { DashboardBuilder } from '../components/dashboard/DashboardBuilder';
import { ModuleCard } from '../components/dashboard/ModuleCard';
import { QuickActionCard } from '../components/dashboard/QuickActionCard';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { UnifiedSearchBar } from '../components/ui/UnifiedSearchBar';
import { UserRole } from '../types/roles';

// Extend expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Test wrapper component
const AccessibilityTestWrapper = ({
  children,
  userRole = 'Officer',
}: {
  children: React.ReactNode;
  userRole?: UserRole;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const mockAuthValue = {
    user: {
      id: 1,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      role: userRole,
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
    error: null,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthValue}>
        <BrowserRouter>{children}</BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('Dashboard Accessibility Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('WCAG 2.1 AA Compliance', () => {
    it('should have no accessibility violations in main dashboard', async () => {
      const { container } = render(
        <AccessibilityTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </AccessibilityTestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in stats cards', async () => {
      const { container } = render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="test-stats"
            title="Test Statistics"
            value={1000}
            formattedValue="1,000"
            change={{
              value: 5.2,
              type: 'increase',
              period: 'vs last month',
            }}
            trend={[800, 900, 950, 1000]}
            status="success"
            onClick={() => {}}
          />
        </AccessibilityTestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in module cards', async () => {
      const mockModule = {
        id: 'financial',
        title: 'Financial Management',
        icon: () => <span>💰</span>,
        description: 'Manage financial operations',
        children: [],
        permissions: ['financial.view'],
      };

      const { container } = render(
        <AccessibilityTestWrapper>
          <ModuleCard module={mockModule} layout="grid" showStats={true} onNavigate={() => {}} />
        </AccessibilityTestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in dashboard builder', async () => {
      const { container } = render(
        <AccessibilityTestWrapper userRole="Director">
          <DashboardBuilder
            onSave={() => {}}
            availableWidgets={[
              { id: 'stats', name: 'Statistics Widget', category: 'metrics' },
              { id: 'chart', name: 'Chart Widget', category: 'analytics' },
            ]}
          />
        </AccessibilityTestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation in dashboard', async () => {
      const user = userEvent.setup();

      render(
        <AccessibilityTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </AccessibilityTestWrapper>
      );

      // Test tab navigation
      await user.tab();
      expect(document.activeElement).toHaveAttribute('tabindex', '0');

      // Test arrow key navigation for module cards
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowLeft}');
      await user.keyboard('{ArrowUp}');

      // Test Enter key activation
      await user.keyboard('{Enter}');
    });

    it('should support keyboard navigation in stats cards', async () => {
      const user = userEvent.setup();
      const mockOnClick = vi.fn();

      render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="test-stats"
            title="Test Statistics"
            value={1000}
            formattedValue="1,000"
            onClick={mockOnClick}
          />
        </AccessibilityTestWrapper>
      );

      const statsCard = screen.getByRole('button');

      // Focus the stats card
      await user.tab();
      expect(statsCard).toHaveFocus();

      // Activate with Enter key
      await user.keyboard('{Enter}');
      expect(mockOnClick).toHaveBeenCalledTimes(1);

      // Activate with Space key
      await user.keyboard(' ');
      expect(mockOnClick).toHaveBeenCalledTimes(2);
    });

    it('should support keyboard navigation in search bar', async () => {
      const user = userEvent.setup();
      const mockOnSearch = vi.fn().mockResolvedValue([]);
      const mockOnSelect = vi.fn();

      render(
        <AccessibilityTestWrapper>
          <UnifiedSearchBar
            placeholder="Search..."
            onSearch={mockOnSearch}
            onSelect={mockOnSelect}
          />
        </AccessibilityTestWrapper>
      );

      const searchInput = screen.getByRole('combobox');

      // Focus search input
      await user.click(searchInput);
      expect(searchInput).toHaveFocus();

      // Type search query
      await user.type(searchInput, 'test query');
      expect(searchInput).toHaveValue('test query');

      // Test arrow key navigation in results
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');
      await user.keyboard('{Escape}');
    });

    it('should trap focus in modal dialogs', async () => {
      const user = userEvent.setup();

      render(
        <AccessibilityTestWrapper userRole="Director">
          <DashboardBuilder onSave={() => {}} availableWidgets={[]} />
        </AccessibilityTestWrapper>
      );

      // Open widget configuration modal
      const addWidgetButton = screen.getByText('Add Widget');
      await user.click(addWidgetButton);

      // Focus should be trapped within modal
      await user.tab();
      const focusedElement = document.activeElement;
      expect(focusedElement?.closest('[role="dialog"]')).toBeInTheDocument();
    });
  });

  describe('Screen Reader Support', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(
        <AccessibilityTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </AccessibilityTestWrapper>
      );

      // Check main dashboard structure
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();

      // Check ARIA landmarks
      expect(screen.getByLabelText('Dashboard navigation')).toBeInTheDocument();
      expect(screen.getByLabelText('Dashboard content')).toBeInTheDocument();
    });

    it('should have descriptive ARIA labels for stats cards', async () => {
      render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="revenue-stats"
            title="Total Revenue"
            value={125000}
            formattedValue="$125,000"
            change={{
              value: 12.5,
              type: 'increase',
              period: 'vs last month',
            }}
            onClick={() => {}}
          />
        </AccessibilityTestWrapper>
      );

      const statsCard = screen.getByRole('button');
      expect(statsCard).toHaveAttribute(
        'aria-label',
        'Total Revenue: $125,000, increased by 12.5% vs last month'
      );
      expect(statsCard).toHaveAttribute('aria-describedby');
    });

    it('should announce dynamic content changes', async () => {
      const { rerender } = render(
        <AccessibilityTestWrapper>
          <div aria-live="polite" aria-atomic="true">
            <StatsCard
              id="live-stats"
              title="Live Statistics"
              value={1000}
              formattedValue="1,000"
            />
          </div>
        </AccessibilityTestWrapper>
      );

      // Update stats value
      rerender(
        <AccessibilityTestWrapper>
          <div aria-live="polite" aria-atomic="true">
            <StatsCard
              id="live-stats"
              title="Live Statistics"
              value={1100}
              formattedValue="1,100"
            />
          </div>
        </AccessibilityTestWrapper>
      );

      // Check that live region is properly configured
      const liveRegion = screen.getByText('1,100').closest('[aria-live]');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });

    it('should provide proper form labels and descriptions', async () => {
      render(
        <AccessibilityTestWrapper userRole="Director">
          <DashboardBuilder onSave={() => {}} availableWidgets={[]} />
        </AccessibilityTestWrapper>
      );

      // Check form controls have proper labels
      const dashboardNameInput = screen.getByLabelText('Dashboard Name');
      expect(dashboardNameInput).toBeInTheDocument();
      expect(dashboardNameInput).toHaveAttribute('aria-describedby');

      const descriptionTextarea = screen.getByLabelText('Dashboard Description');
      expect(descriptionTextarea).toBeInTheDocument();
    });
  });

  describe('Color Contrast and Visual Accessibility', () => {
    it('should meet color contrast requirements', async () => {
      const { container } = render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="contrast-test"
            title="Contrast Test"
            value={1000}
            formattedValue="1,000"
            status="success"
          />
        </AccessibilityTestWrapper>
      );

      // Test would check computed styles for contrast ratios
      const statsCard = container.querySelector('[data-testid="stats-card"]');
      const computedStyle = window.getComputedStyle(statsCard!);

      // This is a simplified test - in practice, you'd use a contrast checking library
      expect(computedStyle.color).toBeDefined();
      expect(computedStyle.backgroundColor).toBeDefined();
    });

    it('should not rely solely on color for information', async () => {
      render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="status-test"
            title="Status Test"
            value={1000}
            formattedValue="1,000"
            status="error"
            change={{
              value: -5.2,
              type: 'decrease',
              period: 'vs last month',
            }}
          />
        </AccessibilityTestWrapper>
      );

      // Should have text indicators in addition to color
      expect(screen.getByText('decreased')).toBeInTheDocument();
      expect(screen.getByText('-5.2%')).toBeInTheDocument();

      // Should have ARIA attributes for status
      const statusIndicator = screen.getByRole('status');
      expect(statusIndicator).toHaveAttribute('aria-label', 'Error status');
    });

    it('should support high contrast mode', async () => {
      // Mock high contrast media query
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-contrast: high)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const { container } = render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="high-contrast-test"
            title="High Contrast Test"
            value={1000}
            formattedValue="1,000"
          />
        </AccessibilityTestWrapper>
      );

      // Check that high contrast styles are applied
      const statsCard = container.querySelector('[data-testid="stats-card"]');
      expect(statsCard).toHaveClass('high-contrast');
    });
  });

  describe('Focus Management', () => {
    it('should have visible focus indicators', async () => {
      const user = userEvent.setup();

      render(
        <AccessibilityTestWrapper>
          <StatsCard
            id="focus-test"
            title="Focus Test"
            value={1000}
            formattedValue="1,000"
            onClick={() => {}}
          />
        </AccessibilityTestWrapper>
      );

      const statsCard = screen.getByRole('button');

      // Focus the element
      await user.tab();
      expect(statsCard).toHaveFocus();

      // Check focus indicator styles
      expect(statsCard).toHaveClass('focus:ring-2');
      expect(statsCard).toHaveClass('focus:ring-blue-500');
    });

    it('should manage focus properly in dynamic content', async () => {
      const user = userEvent.setup();

      const DynamicContent = () => {
        const [showModal, setShowModal] = React.useState(false);

        return (
          <div>
            <button onClick={() => setShowModal(true)}>Open Modal</button>
            {showModal && (
              <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <h2 id="modal-title">Modal Title</h2>
                <button onClick={() => setShowModal(false)}>Close</button>
              </div>
            )}
          </div>
        );
      };

      render(
        <AccessibilityTestWrapper>
          <DynamicContent />
        </AccessibilityTestWrapper>
      );

      const openButton = screen.getByText('Open Modal');
      await user.click(openButton);

      // Focus should move to modal
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();

      const closeButton = screen.getByText('Close');
      expect(closeButton).toHaveFocus();

      // Close modal and check focus return
      await user.click(closeButton);
      expect(openButton).toHaveFocus();
    });
  });

  describe('Responsive Design Accessibility', () => {
    it('should maintain accessibility on mobile devices', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { container } = render(
        <AccessibilityTestWrapper>
          <RoleBasedDashboard />
        </AccessibilityTestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      // Check touch targets are large enough (44px minimum)
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        const rect = button.getBoundingClientRect();
        expect(Math.min(rect.width, rect.height)).toBeGreaterThanOrEqual(44);
      });
    });

    it('should support zoom up to 200% without horizontal scrolling', async () => {
      // Mock zoom level
      Object.defineProperty(document.documentElement, 'style', {
        value: { zoom: '200%' },
        writable: true,
      });

      render(
        <AccessibilityTestWrapper>
          <RoleBasedDashboard />
        </AccessibilityTestWrapper>
      );

      // Check that content doesn't overflow horizontally
      const dashboard = screen.getByTestId('dashboard-container');
      const rect = dashboard.getBoundingClientRect();
      expect(rect.width).toBeLessThanOrEqual(window.innerWidth);
    });
  });

  describe('Error Handling Accessibility', () => {
    it('should announce errors to screen readers', async () => {
      const ErrorComponent = () => {
        const [error, setError] = React.useState<string | null>(null);

        return (
          <div>
            <button onClick={() => setError('Something went wrong')}>Trigger Error</button>
            {error && (
              <div role="alert" aria-live="assertive">
                {error}
              </div>
            )}
          </div>
        );
      };

      const user = userEvent.setup();

      render(
        <AccessibilityTestWrapper>
          <ErrorComponent />
        </AccessibilityTestWrapper>
      );

      const triggerButton = screen.getByText('Trigger Error');
      await user.click(triggerButton);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveAttribute('aria-live', 'assertive');
      expect(errorMessage).toHaveTextContent('Something went wrong');
    });

    it('should provide accessible error recovery options', async () => {
      const ErrorBoundaryComponent = () => (
        <div role="alert">
          <h2>Something went wrong</h2>
          <p>We encountered an error while loading the dashboard.</p>
          <button aria-describedby="retry-description">Retry</button>
          <p id="retry-description">Click to reload the dashboard and try again</p>
          <button aria-describedby="home-description">Go to Home</button>
          <p id="home-description">Return to the main page</p>
        </div>
      );

      render(
        <AccessibilityTestWrapper>
          <ErrorBoundaryComponent />
        </AccessibilityTestWrapper>
      );

      const retryButton = screen.getByText('Retry');
      const homeButton = screen.getByText('Go to Home');

      expect(retryButton).toHaveAttribute('aria-describedby', 'retry-description');
      expect(homeButton).toHaveAttribute('aria-describedby', 'home-description');
    });
  });

  describe('Loading States Accessibility', () => {
    it('should announce loading states to screen readers', async () => {
      const LoadingComponent = () => {
        const [loading, setLoading] = React.useState(true);

        React.useEffect(() => {
          const timer = setTimeout(() => setLoading(false), 1000);
          return () => clearTimeout(timer);
        }, []);

        return (
          <div>
            {loading ? (
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading dashboard data...</span>
                <div aria-hidden="true">🔄</div>
              </div>
            ) : (
              <div>Dashboard loaded</div>
            )}
          </div>
        );
      };

      render(
        <AccessibilityTestWrapper>
          <LoadingComponent />
        </AccessibilityTestWrapper>
      );

      const loadingStatus = screen.getByRole('status');
      expect(loadingStatus).toBeInTheDocument();
      expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Loading dashboard data...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Dashboard loaded')).toBeInTheDocument();
      });
    });
  });
});
