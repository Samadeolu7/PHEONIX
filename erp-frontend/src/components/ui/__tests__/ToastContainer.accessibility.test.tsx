import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ToastContainer } from '../ToastContainer';
import { Toast as ToastType } from '../../../types/toast';

// Mock the Toast component
vi.mock('../Toast', () => ({
  Toast: ({ toast, onDismiss }: { toast: ToastType; onDismiss: (id: string) => void }) => (
    <div data-testid={`toast-${toast.id}`} onClick={() => onDismiss(toast.id)}>
      {toast.type}: {toast.message}
    </div>
  ),
}));

describe('ToastContainer Accessibility', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    mockOnDismiss.mockClear();
  });

  const createToast = (overrides: Partial<ToastType> = {}): ToastType => ({
    id: `toast-${Date.now()}`,
    type: 'success',
    message: 'Test message',
    duration: 4000,
    dismissible: true,
    position: 'top-right',
    ...overrides,
  });

  describe('ARIA live regions', () => {
    it('should have separate ARIA live regions for different urgency levels', () => {
      const toasts = [
        createToast({ id: 'success-1', type: 'success', message: 'Success message' }),
        createToast({ id: 'error-1', type: 'error', message: 'Error message' }),
        createToast({ id: 'info-1', type: 'info', message: 'Info message' }),
        createToast({ id: 'warning-1', type: 'warning', message: 'Warning message' }),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Check for polite live region
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveAttribute('aria-live', 'polite');
      expect(politeRegion).toHaveAttribute('aria-atomic', 'false');
      expect(politeRegion).toHaveAttribute('aria-label', 'Non-urgent notifications');
      expect(politeRegion).toHaveClass('sr-only');

      // Check for assertive live region
      const assertiveRegion = screen.getByRole('alert');
      expect(assertiveRegion).toHaveAttribute('aria-live', 'assertive');
      expect(assertiveRegion).toHaveAttribute('aria-atomic', 'false');
      expect(assertiveRegion).toHaveAttribute('aria-label', 'Urgent notifications');
      expect(assertiveRegion).toHaveClass('sr-only');
    });

    it('should announce success and info toasts in polite region', () => {
      const toasts = [
        createToast({ id: 'success-1', type: 'success', message: 'Operation successful' }),
        createToast({ id: 'info-1', type: 'info', message: 'Information available' }),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Operation successful');
      expect(politeRegion).toHaveTextContent('Information available');
    });

    it('should announce error and warning toasts in assertive region', () => {
      const toasts = [
        createToast({ id: 'error-1', type: 'error', message: 'Something went wrong' }),
        createToast({ id: 'warning-1', type: 'warning', message: 'Please be careful' }),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const assertiveRegion = screen.getByRole('alert');
      expect(assertiveRegion).toHaveTextContent('Something went wrong');
      expect(assertiveRegion).toHaveTextContent('Please be careful');
    });

    it('should include title in live region announcements when present', () => {
      const toasts = [
        createToast({
          id: 'success-1',
          type: 'success',
          title: 'Success!',
          message: 'Operation completed',
        }),
        createToast({
          id: 'error-1',
          type: 'error',
          title: 'Error!',
          message: 'Something failed',
        }),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Success!: Operation completed');

      const assertiveRegion = screen.getByRole('alert');
      expect(assertiveRegion).toHaveTextContent('Error!: Something failed');
    });

    it('should not announce exiting toasts in live regions', () => {
      const { rerender } = render(
        <ToastContainer
          toasts={[createToast({ id: 'toast-1', type: 'success', message: 'Initial message' })]}
          onDismiss={mockOnDismiss}
        />
      );

      // Initially should announce the toast
      const politeRegion = screen.getByRole('status');
      expect(politeRegion).toHaveTextContent('Initial message');

      // Remove the toast
      rerender(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Should not announce exiting toasts (this is handled by the animation state)
      // The live region should be empty or not contain the removed message
      expect(politeRegion).not.toHaveTextContent('Initial message');
    });
  });

  describe('Container accessibility', () => {
    it('should have proper region role and label', () => {
      const toasts = [createToast()];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Find the toast container region (not the live regions)
      const regions = screen.getAllByRole('region');
      const toastRegion = regions.find(
        region => region.getAttribute('aria-label') === 'Toast notifications'
      );

      expect(toastRegion).toBeInTheDocument();
      expect(toastRegion).toHaveAttribute('aria-label', 'Toast notifications');
    });

    it('should have high z-index for proper layering', () => {
      const toasts = [createToast()];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const regions = screen.getAllByRole('region');
      const toastRegion = regions.find(
        region => region.getAttribute('aria-label') === 'Toast notifications'
      );

      expect(toastRegion).toHaveClass('z-50');
    });

    it('should be positioned correctly for different positions', () => {
      const positions: Array<{ position: ToastType['position']; expectedClasses: string[] }> = [
        { position: 'top-right', expectedClasses: ['top-4', 'right-4'] },
        { position: 'top-left', expectedClasses: ['top-4', 'left-4'] },
        { position: 'bottom-right', expectedClasses: ['bottom-4', 'right-4'] },
        { position: 'bottom-left', expectedClasses: ['bottom-4', 'left-4'] },
        { position: 'top-center', expectedClasses: ['top-4', 'left-1/2'] },
        { position: 'bottom-center', expectedClasses: ['bottom-4', 'left-1/2'] },
      ];

      positions.forEach(({ position, expectedClasses }) => {
        const { unmount } = render(
          <ToastContainer toasts={[createToast()]} onDismiss={mockOnDismiss} position={position} />
        );

        const regions = screen.getAllByRole('region');
        const toastRegion = regions.find(
          region => region.getAttribute('aria-label') === 'Toast notifications'
        );

        expectedClasses.forEach(className => {
          expect(toastRegion).toHaveClass(className);
        });

        unmount();
      });
    });
  });

  describe('Screen reader only styles', () => {
    it('should apply sr-only class to live regions', () => {
      const toasts = [createToast({ type: 'success' })];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const politeRegion = screen.getByRole('status');
      const assertiveRegion = screen.getByRole('alert');

      expect(politeRegion).toHaveClass('sr-only');
      expect(assertiveRegion).toHaveClass('sr-only');
    });
  });

  describe('Empty state', () => {
    it('should return null when no toasts are present', () => {
      const { container } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      // Should not render any toast-related elements when no toasts
      expect(container.firstChild).toBeNull();
    });

    it('should not render live regions when no toasts are present', () => {
      render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Responsive design', () => {
    it('should have responsive padding classes', () => {
      const toasts = [createToast()];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      const regions = screen.getAllByRole('region');
      const toastRegion = regions.find(
        region => region.getAttribute('aria-label') === 'Toast notifications'
      );

      expect(toastRegion).toHaveClass('px-4', 'sm:px-0');
    });

    it('should have responsive positioning classes', () => {
      const toasts = [createToast()];
      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} position="top-right" />);

      const regions = screen.getAllByRole('region');
      const toastRegion = regions.find(
        region => region.getAttribute('aria-label') === 'Toast notifications'
      );

      expect(toastRegion).toHaveClass('sm:top-6', 'sm:right-6');
    });
  });

  describe('Multiple toast management', () => {
    it('should handle multiple toasts of different types correctly', () => {
      const toasts = [
        createToast({ id: 'success-1', type: 'success', message: 'Success 1' }),
        createToast({ id: 'error-1', type: 'error', message: 'Error 1' }),
        createToast({ id: 'info-1', type: 'info', message: 'Info 1' }),
        createToast({ id: 'warning-1', type: 'warning', message: 'Warning 1' }),
      ];

      render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />);

      // Check that all toasts are rendered
      expect(screen.getByTestId('toast-success-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-error-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-info-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-warning-1')).toBeInTheDocument();

      // Check live region announcements
      const politeRegion = screen.getByRole('status');
      const assertiveRegion = screen.getByRole('alert');

      expect(politeRegion).toHaveTextContent('Success 1');
      expect(politeRegion).toHaveTextContent('Info 1');
      expect(assertiveRegion).toHaveTextContent('Error 1');
      expect(assertiveRegion).toHaveTextContent('Warning 1');
    });
  });
});
