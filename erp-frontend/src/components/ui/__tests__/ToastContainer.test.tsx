import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToastContainer } from '../ToastContainer';
import { Toast as ToastType } from '../../../types/toast';

// Mock the Toast component
vi.mock('../Toast', () => ({
  Toast: ({ toast, onDismiss }: { toast: ToastType; onDismiss: (id: string) => void }) => (
    <div data-testid={`toast-${toast.id}`} onClick={() => onDismiss(toast.id)} role="alert">
      <span data-testid={`message-${toast.id}`}>{toast.message}</span>
      <span data-testid={`type-${toast.id}`}>{toast.type}</span>
    </div>
  ),
}));

// Mock timers for animation testing
vi.useFakeTimers();

describe('ToastContainer', () => {
  const mockOnDismiss = vi.fn();

  const createMockToast = (
    id: string,
    type: ToastType['type'] = 'success',
    message = 'Test message'
  ): ToastType => ({
    id,
    type,
    message,
    duration: 4000,
    dismissible: true,
    position: 'top-right',
  });

  beforeEach(() => {
    mockOnDismiss.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Basic Rendering', () => {
    it('renders nothing when no toasts are provided', () => {
      const { container } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders toasts when provided', () => {
      const toasts = [
        createMockToast('1', 'success', 'Success message'),
        createMockToast('2', 'error', 'Error message'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.getByTestId('toast-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-2')).toBeInTheDocument();
      expect(screen.getByTestId('message-1')).toHaveTextContent('Success message');
      expect(screen.getByTestId('message-2')).toHaveTextContent('Error message');
    });

    it('renders multiple toasts of the same type', () => {
      const toasts = [
        createMockToast('1', 'success', 'First success'),
        createMockToast('2', 'success', 'Second success'),
        createMockToast('3', 'success', 'Third success'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.getByTestId('toast-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-2')).toBeInTheDocument();
      expect(screen.getByTestId('toast-3')).toBeInTheDocument();
    });
  });

  describe('Positioning and Layout', () => {
    it('applies correct positioning classes for top-right position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="top-right" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('fixed', 'top-4', 'right-4', 'sm:top-6', 'sm:right-6');
    });

    it('applies correct positioning classes for top-left position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="top-left" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('fixed', 'top-4', 'left-4', 'sm:top-6', 'sm:left-6');
    });

    it('applies correct positioning classes for bottom-right position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="bottom-right" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass(
        'fixed',
        'bottom-4',
        'right-4',
        'sm:bottom-6',
        'sm:right-6'
      );
    });

    it('applies correct positioning classes for bottom-left position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="bottom-left" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass(
        'fixed',
        'bottom-4',
        'left-4',
        'sm:bottom-6',
        'sm:left-6'
      );
    });

    it('applies correct positioning classes for top-center position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="top-center" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass(
        'fixed',
        'top-4',
        'left-1/2',
        'transform',
        '-translate-x-1/2',
        'sm:top-6'
      );
    });

    it('applies correct positioning classes for bottom-center position', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="bottom-center" />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass(
        'fixed',
        'bottom-4',
        'left-1/2',
        'transform',
        '-translate-x-1/2',
        'sm:bottom-6'
      );
    });

    it('defaults to top-right position when no position is specified', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('top-4', 'right-4');
    });

    it('has proper z-index for layering above other content', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('z-50');
    });

    it('has proper responsive width constraints', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('w-full', 'max-w-sm');
    });

    it('has proper mobile padding adjustments', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('px-4', 'sm:px-0');
    });
  });

  describe('Stacking Behavior', () => {
    it('uses correct stacking direction for top positions', () => {
      const toasts = [createMockToast('1'), createMockToast('2')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="top-right" />
      );

      const stackContainer = container.querySelector('.flex.flex-col');
      expect(stackContainer).toBeInTheDocument();
      expect(stackContainer).not.toHaveClass('flex-col-reverse');
    });

    it('uses correct stacking direction for bottom positions', () => {
      const toasts = [createMockToast('1'), createMockToast('2')];
      const { container } = render(
        <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="bottom-right" />
      );

      const stackContainer = container.querySelector('.flex.flex-col-reverse');
      expect(stackContainer).toBeInTheDocument();
    });

    it('handles multiple toasts with proper spacing', () => {
      const toasts = [
        createMockToast('1', 'success'),
        createMockToast('2', 'error'),
        createMockToast('3', 'info'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      expect(screen.getByTestId('toast-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-2')).toBeInTheDocument();
      expect(screen.getByTestId('toast-3')).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('has proper accessibility attributes for container', () => {
      const toasts = [createMockToast('1')];
      const { container } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveAttribute('role', 'region');
      expect(containerElement).toHaveAttribute('aria-label', 'Toast notifications');
    });

    it('renders ARIA live regions for screen reader announcements', () => {
      const toasts = [
        createMockToast('1', 'success', 'Success message'),
        createMockToast('2', 'error', 'Error message'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Check for polite live region
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveAttribute('aria-live', 'polite');
      expect(politeRegion).toHaveAttribute('aria-atomic', 'false');
      expect(politeRegion).toHaveAttribute('aria-label', 'Non-urgent notifications');

      // Check for assertive live region - use getAllByRole since mocked Toast components also have role="alert"
      const alertRegions = screen.getAllByRole('alert');
      const assertiveRegion = alertRegions.find(
        region => region.getAttribute('aria-live') === 'assertive'
      );
      expect(assertiveRegion).toBeTruthy();
      expect(assertiveRegion).toHaveAttribute('aria-atomic', 'false');
      expect(assertiveRegion).toHaveAttribute('aria-label', 'Urgent notifications');
    });

    it('announces success and info toasts in polite live region', () => {
      const toasts = [
        createMockToast('1', 'success', 'Operation completed'),
        createMockToast('2', 'info', 'Information message'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Operation completed');
      expect(politeRegion).toHaveTextContent('Information message');
    });

    it('announces error and warning toasts in assertive live region', () => {
      const toasts = [
        createMockToast('1', 'error', 'Something went wrong'),
        createMockToast('2', 'warning', 'Please be careful'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Find the assertive live region specifically
      const alertRegions = screen.getAllByRole('alert');
      const assertiveRegion = alertRegions.find(
        region => region.getAttribute('aria-live') === 'assertive'
      );
      expect(assertiveRegion).toBeTruthy();
      expect(assertiveRegion).toHaveTextContent('Something went wrong');
      expect(assertiveRegion).toHaveTextContent('Please be careful');
    });

    it('does not announce exiting toasts in live regions', async () => {
      const { rerender } = render(
        <ToastContainer
          toasts={[createMockToast('1', 'success', 'Success message')]}
          onDismiss={mockOnDismiss}
        />
      );

      // Remove the toast
      rerender(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toBeEmptyDOMElement();
    });
  });

  describe('Animation and Transitions', () => {
    it('applies enter animations to new toasts', async () => {
      const { rerender } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Add a toast
      const toasts = [createMockToast('1', 'success')];
      rerender(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByTestId('toast-1');
      const toastWrapper = toastElement.parentElement;

      expect(toastWrapper).toHaveClass('toast-enter');
    });

    it('applies exit animations when toasts are removed', async () => {
      const toasts = [createMockToast('1', 'success')];
      const { rerender } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Remove the toast
      rerender(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Check that toast is marked for exit animation
      const toastElement = screen.queryByTestId('toast-1');
      if (toastElement) {
        const toastWrapper = toastElement.parentElement;
        expect(toastWrapper).toHaveClass('toast-exit');
      }

      // Fast-forward animation time
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Toast should be removed after animation
      await waitFor(
        () => {
          expect(screen.queryByTestId('toast-1')).not.toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it('applies staggered animation delays for multiple toasts', () => {
      const toasts = [
        createMockToast('1', 'success'),
        createMockToast('2', 'error'),
        createMockToast('3', 'info'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const toast1Wrapper = screen.getByTestId('toast-1').parentElement;
      const toast2Wrapper = screen.getByTestId('toast-2').parentElement;
      const toast3Wrapper = screen.getByTestId('toast-3').parentElement;

      // Check animation delays (0ms, 50ms, 100ms)
      expect(toast1Wrapper).toHaveStyle('animation-delay: 0ms');
      expect(toast2Wrapper).toHaveStyle('animation-delay: 50ms');
      expect(toast3Wrapper).toHaveStyle('animation-delay: 100ms');
    });

    it('uses correct animations for different positions', () => {
      const positions: Array<{ position: ToastType['position']; expectedAnimation: string }> = [
        { position: 'top-right', expectedAnimation: 'toast-slide-in' },
        { position: 'top-left', expectedAnimation: 'toast-slide-in-left' },
        { position: 'bottom-right', expectedAnimation: 'toast-slide-in-bottom' },
        { position: 'bottom-left', expectedAnimation: 'toast-slide-in-bottom-left' },
        { position: 'top-center', expectedAnimation: 'toast-fade-in' },
        { position: 'bottom-center', expectedAnimation: 'toast-fade-in-bottom' },
      ];

      positions.forEach(({ position, expectedAnimation }) => {
        const toasts = [createMockToast('1', 'success')];
        const { unmount } = render(
          <ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position={position} />
        );

        const toastWrapper = screen.getByTestId('toast-1').parentElement;
        expect(toastWrapper?.style.animation).toContain(expectedAnimation);

        unmount();
      });
    });

    it('cleans up animation timeouts on unmount', () => {
      const toasts = [createMockToast('1'), createMockToast('2')];
      const { unmount } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Unmount should clean up timeouts
      unmount();

      // Fast-forward time to ensure no errors from cleanup
      vi.advanceTimersByTime(1000);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('Toast Management and Dismissal', () => {
    it('handles enhanced dismiss with exit animation', async () => {
      const toasts = [createMockToast('1', 'success')];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByTestId('toast-1');
      toastElement.click();

      // Fast-forward animation time
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Should call dismiss after animation delay
      expect(mockOnDismiss).toHaveBeenCalledWith('1');
    });

    it('handles rapid toast additions and removals', async () => {
      const { rerender } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Rapidly add toasts
      for (let i = 1; i <= 5; i++) {
        const toasts = Array.from({ length: i }, (_, index) =>
          createMockToast(`${index + 1}`, 'success')
        );
        rerender(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);
      }

      // Should handle all toasts
      expect(screen.getByTestId('toast-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-5')).toBeInTheDocument();

      // Rapidly remove toasts
      rerender(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Should handle cleanup properly
      vi.advanceTimersByTime(500);
    });

    it('maintains toast order during animations', () => {
      const toasts = [
        createMockToast('first', 'success', 'First toast'),
        createMockToast('second', 'error', 'Second toast'),
        createMockToast('third', 'info', 'Third toast'),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const messages = screen.getAllByTestId(/^message-/);
      expect(messages[0]).toHaveTextContent('First toast');
      expect(messages[1]).toHaveTextContent('Second toast');
      expect(messages[2]).toHaveTextContent('Third toast');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles empty toast arrays gracefully', () => {
      const { container } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      expect(container.firstChild).toBeNull();
    });

    it('handles toasts with missing properties', () => {
      const incompleteToast = {
        id: 'incomplete',
        type: 'success' as const,
        message: 'Incomplete toast',
        // Missing other optional properties
      };

      expect(() => {
        render(<ToastContainer toasts={[incompleteToast]} onDismiss={mockOnDismiss} />);
      }).not.toThrow();

      expect(screen.getByTestId('toast-incomplete')).toBeInTheDocument();
    });

    it('handles invalid position gracefully', () => {
      const toasts = [createMockToast('1')];

      expect(() => {
        render(
          <ToastContainer
            toasts={toasts}
            onDismiss={mockOnDismiss}
            position={'invalid-position' as any}
          />
        );
      }).not.toThrow();

      // Should fall back to default positioning
      const { container } = render(
        <ToastContainer
          toasts={toasts}
          onDismiss={mockOnDismiss}
          position={'invalid-position' as any}
        />
      );

      const containerElement = container.querySelector('[role="region"]') as HTMLElement;
      expect(containerElement).toHaveClass('top-4', 'right-4');
    });

    it('handles concurrent toast state changes', async () => {
      const { rerender } = render(
        <ToastContainer toasts={[createMockToast('1')]} onDismiss={mockOnDismiss} />
      );

      // Simulate rapid state changes
      rerender(
        <ToastContainer
          toasts={[createMockToast('1'), createMockToast('2')]}
          onDismiss={mockOnDismiss}
        />
      );
      rerender(<ToastContainer toasts={[createMockToast('2')]} onDismiss={mockOnDismiss} />);
      rerender(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Should handle without errors
      vi.advanceTimersByTime(1000);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('Performance Considerations', () => {
    it('handles large numbers of toasts efficiently', () => {
      const manyToasts = Array.from({ length: 20 }, (_, i) =>
        createMockToast(`toast-${i}`, 'success', `Message ${i}`)
      );

      const startTime = performance.now();
      render(<ToastContainer toasts={manyToasts} onDismiss={mockOnDismiss} />);
      const endTime = performance.now();

      // Should render quickly (less than 100ms for 20 toasts)
      expect(endTime - startTime).toBeLessThan(100);

      // All toasts should be rendered
      manyToasts.forEach(toast => {
        expect(screen.getByTestId(`toast-${toast.id}`)).toBeInTheDocument();
      });
    });

    it('properly manages memory with animation timeouts', () => {
      const toasts = [createMockToast('1'), createMockToast('2')];
      const { unmount } = render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Should have timers for animations
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount should clean up all timers
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
