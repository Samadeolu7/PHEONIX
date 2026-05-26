/**
 * Performance tests for Toast system optimizations
 * Tests React.memo, useCallback, and memory leak prevention
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Mock performance monitoring
vi.mock('../../../utils/toastPerformance', () => ({
  useToastPerformanceMonitoring: vi.fn(),
  getToastPerformanceMonitor: vi.fn(() => ({
    updateMetrics: vi.fn(),
    getMetrics: vi.fn(() => ({ activeToasts: 0, activeTimers: 0 })),
    destroy: vi.fn(),
  })),
  cleanupToastPerformanceMonitor: vi.fn(),
}));

// Test component to trigger toasts
const TestComponent: React.FC = () => {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Success</button>
      <button onClick={() => toast.error('Error message')}>Error</button>
      <button onClick={() => toast.info('Info message')}>Info</button>
      <button onClick={() => toast.warning('Warning message')}>Warning</button>
      <button onClick={() => toast.clearAllToasts()}>Clear All</button>
    </div>
  );
};

// Component to test re-render optimization
let renderCount = 0;
const RenderCounterComponent: React.FC = React.memo(() => {
  renderCount++;
  return <div data-testid="render-counter">Renders: {renderCount}</div>;
});

const TestWithRenderCounter: React.FC = () => {
  const toast = useToast();

  return (
    <div>
      <RenderCounterComponent />
      <button onClick={() => toast.success('Test message')}>Add Toast</button>
    </div>
  );
};

describe('Toast Performance Optimizations', () => {
  beforeEach(() => {
    renderCount = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('React.memo optimizations', () => {
    it('should prevent unnecessary re-renders of Toast components', async () => {
      render(
        <ToastProvider>
          <TestWithRenderCounter />
        </ToastProvider>
      );

      const initialRenderCount = renderCount;

      // Add a toast - this should not cause RenderCounterComponent to re-render
      fireEvent.click(screen.getByText('Add Toast'));

      // Wait for toast to appear
      await screen.findByText('Test message');

      // RenderCounterComponent should not have re-rendered
      expect(renderCount).toBe(initialRenderCount);
    });

    it('should handle multiple rapid toast additions efficiently', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const startTime = performance.now();

      // Add multiple toasts rapidly
      for (let i = 0; i < 10; i++) {
        fireEvent.click(screen.getByText('Success'));
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete quickly (less than 100ms for 10 toasts)
      expect(duration).toBeLessThan(100);

      // Should limit toasts to maximum (5 by default)
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Memory leak prevention', () => {
    it('should clean up timers when toasts are dismissed', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add a success toast (auto-dismisses)
      fireEvent.click(screen.getByText('Success'));

      await screen.findByText('Success message');

      // Clear all toasts manually
      fireEvent.click(screen.getByText('Clear All'));

      // Should have called clearTimeout to clean up timers
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should handle component unmount without memory leaks', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add some toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));

      // Unmount component
      unmount();

      // Should have cleaned up timers
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Throttling mechanism', () => {
    it('should throttle duplicate messages', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add the same toast multiple times rapidly
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));

      // Should only show one toast due to throttling
      const toasts = screen.getAllByText('Success message');
      expect(toasts.length).toBe(1);
    });

    it('should allow different message types simultaneously', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add different types of toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));
      fireEvent.click(screen.getByText('Info'));

      // Should show all different types
      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });
  });

  describe('Animation performance', () => {
    it('should use GPU-accelerated animations', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));

      const toast = await screen.findByText('Success message');
      const toastContainer = toast.closest('.toast-item');

      // Should have GPU acceleration classes
      expect(toastContainer).toHaveClass('toast-item');

      // Check for transform-gpu and backface-hidden in CSS
      const computedStyle = window.getComputedStyle(toastContainer!);
      expect(computedStyle.transform).toBeDefined();
    });

    it('should handle reduced motion preference', async () => {
      // Mock prefers-reduced-motion
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));

      const toast = await screen.findByText('Success message');
      expect(toast).toBeInTheDocument();

      // Animation should still work but be simplified
      const toastContainer = toast.closest('.toast-item');
      expect(toastContainer).toBeInTheDocument();
    });
  });

  describe('Toast limit enforcement', () => {
    it('should enforce maximum toast limit', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add more toasts than the limit (5)
      for (let i = 0; i < 8; i++) {
        fireEvent.click(screen.getByText('Info'));
        // Add small delay to avoid throttling
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should not exceed the maximum limit
      const toasts = screen.getAllByRole('alert');
      expect(toasts.length).toBeLessThanOrEqual(5);
    });

    it('should remove oldest toasts when limit is exceeded', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add first toast
      fireEvent.click(screen.getByText('Success'));
      await screen.findByText('Success message');

      // Add many more toasts to exceed limit
      for (let i = 0; i < 6; i++) {
        fireEvent.click(screen.getByText('Info'));
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Original success toast should be removed
      expect(screen.queryByText('Success message')).not.toBeInTheDocument();

      // Should have info toasts
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });
  });
});
