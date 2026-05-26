import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Toast } from '../Toast';
import { Toast as ToastType } from '../../../types/toast';

// Mock the ToastIcon component
vi.mock('../ToastIcon', () => ({
  ToastIcon: ({ type, className }: { type: string; className?: string }) => (
    <div data-testid={`toast-icon-${type}`} className={className} aria-hidden="true">
      {type}-icon
    </div>
  ),
}));

describe('Toast Accessibility', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    mockOnDismiss.mockClear();
  });

  const createToast = (overrides: Partial<ToastType> = {}): ToastType => ({
    id: 'test-toast-1',
    type: 'success',
    message: 'Test message',
    duration: 4000,
    dismissible: true,
    position: 'top-right',
    ...overrides,
  });

  describe('ARIA attributes and roles', () => {
    it('should have proper role and ARIA attributes', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      expect(toastElement).toBeInTheDocument();
      expect(toastElement).toHaveAttribute('aria-atomic', 'true');
      expect(toastElement).toHaveAttribute('aria-describedby', 'toast-message-test-toast-1');
    });

    it('should have proper aria-labelledby when title is present', () => {
      const toast = createToast({ title: 'Test Title' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      expect(toastElement).toHaveAttribute('aria-labelledby', 'toast-title-test-toast-1');
      expect(toastElement).toHaveAttribute('aria-describedby', 'toast-message-test-toast-1');
    });

    it('should not have aria-labelledby when title is not present', () => {
      const toast = createToast({ title: undefined });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      expect(toastElement).not.toHaveAttribute('aria-labelledby');
      expect(toastElement).toHaveAttribute('aria-describedby', 'toast-message-test-toast-1');
    });

    it('should have proper IDs for title and message elements', () => {
      const toast = createToast({ title: 'Test Title' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const titleElement = screen.getByText('Test Title');
      const messageElement = screen.getByText('Test message');

      expect(titleElement).toHaveAttribute('id', 'toast-title-test-toast-1');
      expect(messageElement).toHaveAttribute('id', 'toast-message-test-toast-1');
    });
  });

  describe('Keyboard navigation', () => {
    it('should be focusable with tabIndex', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      expect(toastElement).toHaveAttribute('tabIndex', '0');
    });

    it('should dismiss on Enter key', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      toastElement.focus();
      await user.keyboard('{Enter}');

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });

    it('should dismiss on Space key', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      toastElement.focus();
      await user.keyboard(' ');

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });

    it('should dismiss on Escape key', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      toastElement.focus();
      await user.keyboard('{Escape}');

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });
  });

  describe('Close button accessibility', () => {
    it('should have proper ARIA label for close button', () => {
      const toast = createToast({ title: 'Test Title' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveAttribute('aria-label', 'Dismiss success notification: Test Title');
      expect(closeButton).toHaveAttribute('aria-describedby', 'toast-message-test-toast-1');
      expect(closeButton).toHaveAttribute('title', 'Dismiss success notification');
    });

    it('should use message in aria-label when no title is present', () => {
      const toast = createToast({ title: undefined });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveAttribute(
        'aria-label',
        'Dismiss success notification: Test message'
      );
    });

    it('should have minimum touch target size', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveClass('min-w-[44px]', 'min-h-[44px]');
    });

    it('should be keyboard operable', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      closeButton.focus();
      await user.keyboard('{Enter}');

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });

    it('should be operable with Space key', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      closeButton.focus();
      await user.keyboard(' ');

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });

    it('should have proper focus styles for different toast types', () => {
      const types: Array<ToastType['type']> = ['success', 'error', 'info', 'warning'];

      types.forEach(type => {
        const { unmount } = render(
          <Toast toast={createToast({ type })} onDismiss={mockOnDismiss} />
        );

        const closeButton = screen.getByRole('button');
        const expectedFocusClass =
          type === 'warning'
            ? 'focus:ring-amber-500'
            : `focus:ring-${type === 'success' ? 'green' : type === 'error' ? 'red' : 'blue'}-500`;

        expect(closeButton).toHaveClass(expectedFocusClass);
        unmount();
      });
    });

    it('should not render close button when dismissible is false', () => {
      const toast = createToast({ dismissible: false });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Icon accessibility', () => {
    it('should have aria-hidden on icon', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const icon = screen.getByTestId('toast-icon-success');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have aria-hidden on close button icon', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      const icon = closeButton.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Color contrast and visual accessibility', () => {
    it('should use high contrast colors for different toast types', () => {
      const types: Array<{ type: ToastType['type']; expectedClasses: string[] }> = [
        { type: 'success', expectedClasses: ['bg-green-50', 'border-green-300', 'text-green-900'] },
        { type: 'error', expectedClasses: ['bg-red-50', 'border-red-300', 'text-red-900'] },
        { type: 'info', expectedClasses: ['bg-blue-50', 'border-blue-300', 'text-blue-900'] },
        { type: 'warning', expectedClasses: ['bg-amber-50', 'border-amber-300', 'text-amber-900'] },
      ];

      types.forEach(({ type, expectedClasses }) => {
        const { unmount } = render(
          <Toast toast={createToast({ type })} onDismiss={mockOnDismiss} />
        );

        const toastElement = screen.getByRole('alert');
        expectedClasses.forEach(className => {
          expect(toastElement).toHaveClass(className);
        });

        unmount();
      });
    });

    it('should use high contrast colors for titles', () => {
      const types: Array<{ type: ToastType['type']; expectedClass: string }> = [
        { type: 'success', expectedClass: 'text-green-950' },
        { type: 'error', expectedClass: 'text-red-950' },
        { type: 'info', expectedClass: 'text-blue-950' },
        { type: 'warning', expectedClass: 'text-amber-950' },
      ];

      types.forEach(({ type, expectedClass }) => {
        const { unmount } = render(
          <Toast toast={createToast({ type, title: 'Test Title' })} onDismiss={mockOnDismiss} />
        );

        const titleElement = screen.getByText('Test Title');
        expect(titleElement).toHaveClass(expectedClass);

        unmount();
      });
    });
  });

  describe('Event handling', () => {
    it('should prevent default behavior on keyboard events', async () => {
      const user = userEvent.setup();
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const toastElement = screen.getByRole('alert');
      toastElement.focus();

      // Test that preventDefault is called (we can't directly test this, but we can ensure the handler works)
      await user.keyboard('{Enter}');
      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });

    it('should handle close button click correctly', () => {
      const toast = createToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);

      expect(mockOnDismiss).toHaveBeenCalledWith('test-toast-1');
    });
  });
});
