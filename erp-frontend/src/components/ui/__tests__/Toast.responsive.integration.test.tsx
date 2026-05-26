import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Mock viewport dimensions
const mockViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });

  // Trigger resize event
  fireEvent(window, new Event('resize'));
};

// Mock user agent for mobile detection
const mockUserAgent = (userAgent: string) => {
  Object.defineProperty(navigator, 'userAgent', {
    writable: true,
    configurable: true,
    value: userAgent,
  });
};

// Mock touch support
const mockTouchSupport = (hasTouch: boolean) => {
  Object.defineProperty(window, 'ontouchstart', {
    writable: true,
    configurable: true,
    value: hasTouch ? {} : undefined,
  });
};

// Test component for responsive testing
const ResponsiveTestComponent = () => {
  const toast = useToast();

  return (
    <div data-testid="responsive-test">
      <button
        onClick={() => toast.success('Success message for responsive test')}
        data-testid="success-btn"
      >
        Success Toast
      </button>
      <button
        onClick={() =>
          toast.error('Error message that might be longer for testing responsive behavior')
        }
        data-testid="error-btn"
      >
        Error Toast
      </button>
      <button onClick={() => toast.info('Info message')} data-testid="info-btn">
        Info Toast
      </button>
      <button
        onClick={() => toast.warning('Warning message for mobile testing')}
        data-testid="warning-btn"
      >
        Warning Toast
      </button>
      <button
        onClick={() => {
          for (let i = 0; i < 5; i++) {
            toast.success(`Multiple toast ${i + 1}`);
          }
        }}
        data-testid="multiple-btn"
      >
        Multiple Toasts
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

describe('Toast Responsive Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    // Reset to default desktop viewport
    mockViewport(1920, 1080);
    mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    mockTouchSupport(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Mobile viewport adaptations', () => {
    it('adapts positioning for mobile portrait (iPhone SE)', () => {
      mockViewport(375, 667);
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));

      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Should have mobile-specific positioning classes
      expect(toastContainer).toHaveClass('px-4'); // Mobile horizontal padding
      expect(toastContainer).toHaveClass('w-full'); // Full width on mobile
      expect(toastContainer).toHaveClass('max-w-sm'); // Constrained max width
      expect(toastContainer).toHaveClass('top-4'); // Top positioning
      expect(toastContainer).toHaveClass('right-4'); // Right positioning
    });

    it('adapts positioning for mobile landscape (iPhone)', () => {
      mockViewport(667, 375);
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));

      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Should maintain responsive classes in landscape
      expect(toastContainer).toHaveClass('px-4');
      expect(toastContainer).toHaveClass('w-full');
      expect(toastContainer).toHaveClass('max-w-sm');
    });

    it('adapts positioning for tablet (iPad)', () => {
      mockViewport(768, 1024);
      mockUserAgent('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));

      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Should use tablet-appropriate positioning
      expect(toastContainer).toHaveClass('sm:top-6'); // Larger top margin on tablet
      expect(toastContainer).toHaveClass('sm:right-6'); // Larger right margin on tablet
      expect(toastContainer).toHaveClass('sm:px-0'); // No horizontal padding on tablet
    });

    it('maintains desktop positioning for large screens', () => {
      mockViewport(1920, 1080);
      mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      mockTouchSupport(false);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));

      const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Should use desktop positioning
      expect(toastContainer).toHaveClass('sm:top-6');
      expect(toastContainer).toHaveClass('sm:right-6');
      expect(toastContainer).toHaveClass('sm:px-0');
    });
  });

  describe('Touch interaction support', () => {
    it('handles touch tap to dismiss on mobile', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const toast = screen.getByRole('alert');

      // Simulate touch interaction
      fireEvent.touchStart(toast, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(toast, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      // Should dismiss on touch
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles touch swipe to dismiss on mobile', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const toast = screen.getByRole('alert');

      // Simulate swipe right gesture
      fireEvent.touchStart(toast, {
        touches: [{ clientX: 50, clientY: 100 }],
      });
      fireEvent.touchMove(toast, {
        touches: [{ clientX: 150, clientY: 100 }],
      });
      fireEvent.touchEnd(toast, {
        changedTouches: [{ clientX: 150, clientY: 100 }],
      });

      // Should dismiss on swipe
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('provides adequate touch targets for close buttons', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const closeButton = screen.getByRole('button', { name: /close/i });

      // Check minimum touch target size (44px recommended)
      const buttonStyles = window.getComputedStyle(closeButton);
      const width = parseInt(buttonStyles.width) || parseInt(buttonStyles.minWidth);
      const height = parseInt(buttonStyles.height) || parseInt(buttonStyles.minHeight);

      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    });

    it('handles multi-touch scenarios gracefully', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('multiple-btn'));
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeGreaterThan(1);

      // Simulate multi-touch on different toasts
      fireEvent.touchStart(toasts[0], {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 200 },
        ],
      });

      // Should handle multi-touch without errors
      expect(() => {
        fireEvent.touchEnd(toasts[0], {
          changedTouches: [{ clientX: 100, clientY: 100 }],
        });
      }).not.toThrow();
    });
  });

  describe('Responsive text and layout', () => {
    it('handles long text content on mobile', () => {
      mockViewport(320, 568); // iPhone SE (smallest common mobile)

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('error-btn'));
      const toast = screen.getByRole('alert');

      // Should have proper text wrapping classes
      expect(toast).toHaveClass('break-words'); // Allow word breaking
      expect(toast.querySelector('.text-sm')).toBeInTheDocument(); // Smaller text on mobile
    });

    it('adjusts toast width for different screen sizes', () => {
      const screenSizes = [
        { width: 320, height: 568, name: 'iPhone SE' },
        { width: 375, height: 667, name: 'iPhone 8' },
        { width: 414, height: 896, name: 'iPhone 11' },
        { width: 768, height: 1024, name: 'iPad' },
        { width: 1024, height: 768, name: 'iPad Landscape' },
        { width: 1920, height: 1080, name: 'Desktop' },
      ];

      screenSizes.forEach(({ width, height, name }) => {
        mockViewport(width, height);

        const { unmount } = render(
          <TestWrapper>
            <ResponsiveTestComponent />
          </TestWrapper>
        );

        fireEvent.click(screen.getByTestId('success-btn'));
        const toastContainer = screen.getByRole('region', { name: /toast notifications/i });

        // Should have appropriate width constraints
        expect(toastContainer).toHaveClass('w-full');
        expect(toastContainer).toHaveClass('max-w-sm');

        // Mobile should have padding, larger screens should not
        if (width < 640) {
          expect(toastContainer).toHaveClass('px-4');
        } else {
          expect(toastContainer).toHaveClass('sm:px-0');
        }

        unmount();
      });
    });

    it('maintains readability across different screen densities', () => {
      // Mock high DPI display
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        configurable: true,
        value: 3, // Retina display
      });

      mockViewport(375, 667); // iPhone with Retina

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const toast = screen.getByRole('alert');

      // Should maintain proper text sizing for high DPI
      expect(toast.querySelector('.text-sm')).toBeInTheDocument();

      // Should have proper contrast classes
      expect(toast).toHaveClass('text-green-800'); // High contrast text
    });
  });

  describe('Performance optimizations for mobile', () => {
    it('uses optimized animations on mobile devices', () => {
      mockViewport(375, 667);
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const toast = screen.getByRole('alert');
      const toastWrapper = toast.parentElement;

      // Should use reduced animation duration on mobile
      expect(toastWrapper?.style.animationDuration).toBe('200ms');
    });

    it('limits concurrent animations on mobile', () => {
      mockViewport(375, 667);
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts rapidly
      fireEvent.click(screen.getByTestId('multiple-btn'));

      // Should limit number of simultaneous animations on mobile
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(3); // Reduced from desktop limit
    });

    it('handles memory efficiently on mobile', () => {
      mockViewport(375, 667);
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');

      const { unmount } = render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('multiple-btn'));

      // Should have timers for animations
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount should clean up efficiently
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('Orientation change handling', () => {
    it('handles portrait to landscape orientation change', async () => {
      // Start in portrait
      mockViewport(375, 667);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      let toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Verify portrait positioning
      expect(toastContainer).toHaveClass('top-4', 'right-4');

      // Change to landscape
      mockViewport(667, 375);

      // Toast should maintain positioning after orientation change
      toastContainer = screen.getByRole('region', { name: /toast notifications/i });
      expect(toastContainer).toHaveClass('top-4', 'right-4');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('handles landscape to portrait orientation change', async () => {
      // Start in landscape
      mockViewport(667, 375);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      let toastContainer = screen.getByRole('region', { name: /toast notifications/i });

      // Verify landscape positioning
      expect(toastContainer).toHaveClass('top-4', 'right-4');

      // Change to portrait
      mockViewport(375, 667);

      // Toast should maintain positioning after orientation change
      toastContainer = screen.getByRole('region', { name: /toast notifications/i });
      expect(toastContainer).toHaveClass('top-4', 'right-4');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('maintains toast stack during orientation changes', () => {
      mockViewport(375, 667);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByTestId('success-btn'));
      fireEvent.click(screen.getByTestId('error-btn'));
      fireEvent.click(screen.getByTestId('info-btn'));

      expect(screen.getAllByRole('alert')).toHaveLength(3);

      // Change orientation
      mockViewport(667, 375);

      // All toasts should still be present
      expect(screen.getAllByRole('alert')).toHaveLength(3);
      expect(screen.getByText('Success message for responsive test')).toBeInTheDocument();
      expect(
        screen.getByText('Error message that might be longer for testing responsive behavior')
      ).toBeInTheDocument();
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });
  });

  describe('Accessibility on mobile devices', () => {
    it('maintains proper focus management on mobile', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      const closeButton = screen.getByRole('button', { name: /close/i });

      // Should be focusable on mobile
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);

      // Should have visible focus indicator
      expect(closeButton).toHaveClass('focus:outline-none', 'focus:ring-2');
    });

    it('provides proper screen reader support on mobile', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));

      // ARIA live regions should work on mobile
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveAttribute('aria-live', 'polite');
      expect(politeRegion).toHaveTextContent('Success message for responsive test');

      // Toast should have proper ARIA attributes
      const toast = screen.getByRole('alert');
      expect(toast).toHaveAttribute('role', 'alert');
    });

    it('maintains color contrast on mobile devices', () => {
      mockViewport(375, 667);
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      const toastTypes = [
        { button: 'success-btn', expectedClass: 'text-green-800' },
        { button: 'error-btn', expectedClass: 'text-red-800' },
        { button: 'info-btn', expectedClass: 'text-blue-800' },
        { button: 'warning-btn', expectedClass: 'text-yellow-800' },
      ];

      toastTypes.forEach(({ button, expectedClass }) => {
        fireEvent.click(screen.getByTestId(button));
        const toast = screen.getByRole('alert');
        expect(toast).toHaveClass(expectedClass);
      });
    });
  });

  describe('Cross-browser mobile compatibility', () => {
    it('works on iOS Safari', () => {
      mockViewport(375, 667);
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      );
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Success message for responsive test')).toBeInTheDocument();
    });

    it('works on Android Chrome', () => {
      mockViewport(360, 640);
      mockUserAgent(
        'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
      );
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Success message for responsive test')).toBeInTheDocument();
    });

    it('works on mobile Firefox', () => {
      mockViewport(360, 640);
      mockUserAgent('Mozilla/5.0 (Mobile; rv:89.0) Gecko/89.0 Firefox/89.0');
      mockTouchSupport(true);

      render(
        <TestWrapper>
          <ResponsiveTestComponent />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('success-btn'));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Success message for responsive test')).toBeInTheDocument();
    });
  });
});
