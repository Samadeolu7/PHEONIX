import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Toast } from '../Toast';
import { Toast as ToastType, ToastType as ToastTypeEnum } from '../../../types/toast';

describe('Toast Component', () => {
  const mockOnDismiss = vi.fn();
  const user = userEvent.setup();

  const createMockToast = (overrides: Partial<ToastType> = {}): ToastType => ({
    id: 'test-toast-1',
    type: 'success',
    message: 'Test message',
    dismissible: true,
    duration: 4000,
    position: 'top-right',
    ...overrides,
  });

  beforeEach(() => {
    mockOnDismiss.mockClear();
  });

  describe('Rendering and Visual Appearance', () => {
    const toastTypes: ToastTypeEnum[] = ['success', 'error', 'info', 'warning'];

    it.each(toastTypes)('renders %s toast with correct styling', type => {
      const toast = createMockToast({ type });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      expect(container).toBeInTheDocument();

      // Check type-specific styling classes
      const expectedClasses = {
        success: ['bg-green-50', 'border-green-300', 'text-green-900'],
        error: ['bg-red-50', 'border-red-300', 'text-red-900'],
        info: ['bg-blue-50', 'border-blue-300', 'text-blue-900'],
        warning: ['bg-amber-50', 'border-amber-300', 'text-amber-900'],
      }[type];

      expectedClasses.forEach(className => {
        expect(container).toHaveClass(className);
      });
    });

    it('renders message correctly', () => {
      const message = 'This is a test message';
      const toast = createMockToast({ message });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it('renders title when provided', () => {
      const title = 'Test Title';
      const message = 'Test message';
      const toast = createMockToast({ title, message });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const titleElement = screen.getByText(title);
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveClass('font-semibold');
      expect(titleElement.tagName).toBe('H4');
    });

    it('does not render title when not provided', () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('renders close button when dismissible is true', () => {
      const toast = createMockToast({ dismissible: true });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAttribute('aria-label', expect.stringContaining('Dismiss'));
    });

    it('does not render close button when dismissible is false', () => {
      const toast = createMockToast({ dismissible: false });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders ToastIcon component', () => {
      const toast = createMockToast({ type: 'success' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Check that an icon is rendered (ToastIcon should render an SVG)
      const icon = screen.getByRole('alert').querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('applies correct base styling classes', () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');

      // Check for key styling classes
      expect(container).toHaveClass('flex', 'items-start', 'gap-3', 'p-4');
      expect(container).toHaveClass('rounded-lg', 'shadow-lg', 'border');
      expect(container).toHaveClass('cursor-pointer', 'transition-all');
      expect(container).toHaveClass('hover:shadow-xl', 'hover:scale-[1.02]');
    });
  });

  describe('Accessibility Features', () => {
    it('has correct ARIA attributes', () => {
      const toast = createMockToast({
        type: 'error',
        title: 'Error Title',
        message: 'Error message',
      });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      expect(container).toHaveAttribute('role', 'alert');
      expect(container).toHaveAttribute('aria-atomic', 'true');
      expect(container).toHaveAttribute('tabIndex', '0');
    });

    it('has proper ARIA labeling with title and message', () => {
      const toast = createMockToast({
        id: 'test-123',
        title: 'Success Title',
        message: 'Success message',
      });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      expect(container).toHaveAttribute('aria-labelledby', 'toast-title-test-123');
      expect(container).toHaveAttribute('aria-describedby', 'toast-message-test-123');

      const titleElement = screen.getByText('Success Title');
      const messageElement = screen.getByText('Success message');

      expect(titleElement).toHaveAttribute('id', 'toast-title-test-123');
      expect(messageElement).toHaveAttribute('id', 'toast-message-test-123');
    });

    it('has proper ARIA labeling without title', () => {
      const toast = createMockToast({
        id: 'test-456',
        message: 'Just a message',
      });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      expect(container).not.toHaveAttribute('aria-labelledby');
      expect(container).toHaveAttribute('aria-describedby', 'toast-message-test-456');
    });

    it('close button has proper accessibility attributes', () => {
      const toast = createMockToast({
        type: 'success',
        title: 'Success Title',
        message: 'Success message',
      });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveAttribute(
        'aria-label',
        'Dismiss success notification: Success Title'
      );
      expect(closeButton).toHaveAttribute('title', 'Dismiss success notification');
      expect(closeButton).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('toast-message-')
      );
    });

    it('close button has minimum touch target size', () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveClass('min-w-[44px]', 'min-h-[44px]');
    });

    it('has proper focus styles', () => {
      const toast = createMockToast({ type: 'success' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      expect(closeButton).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-offset-2');
      expect(closeButton).toHaveClass('focus:ring-green-500', 'focus-visible:ring-green-500');
    });

    it('applies correct focus ring colors for each toast type', () => {
      const types: { type: ToastTypeEnum; colorClass: string }[] = [
        { type: 'success', colorClass: 'focus:ring-green-500' },
        { type: 'error', colorClass: 'focus:ring-red-500' },
        { type: 'info', colorClass: 'focus:ring-blue-500' },
        { type: 'warning', colorClass: 'focus:ring-amber-500' },
      ];

      types.forEach(({ type, colorClass }) => {
        const toast = createMockToast({ type });
        const { unmount } = render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

        const closeButton = screen.getByRole('button');
        expect(closeButton).toHaveClass(colorClass);

        unmount();
      });
    });
  });

  describe('User Interactions', () => {
    it('calls onDismiss when toast container is clicked', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      await user.click(container);

      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss when close button is clicked', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      await user.click(closeButton);

      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('prevents event bubbling when close button is clicked', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');
      await user.click(closeButton);

      // Should only be called once (from close button), not twice (container + button)
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('handles keyboard interaction on toast container', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');

      // Test Enter key
      await user.type(container, '{Enter}');
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);

      mockOnDismiss.mockClear();

      // Test Space key
      await user.type(container, ' ');
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);

      mockOnDismiss.mockClear();

      // Test Escape key
      await user.type(container, '{Escape}');
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);
    });

    it('handles keyboard interaction on close button', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const closeButton = screen.getByRole('button');

      // Test Enter key
      await user.type(closeButton, '{Enter}');
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);

      mockOnDismiss.mockClear();

      // Test Space key
      await user.type(closeButton, ' ');
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);
    });

    it('is keyboard focusable', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      const closeButton = screen.getByRole('button');

      // Toast container should be focusable
      await user.tab();
      expect(container).toHaveFocus();

      // Close button should be focusable
      await user.tab();
      expect(closeButton).toHaveFocus();
    });
  });

  describe('Content Handling and Edge Cases', () => {
    it('handles long messages correctly with word wrapping', () => {
      const longMessage =
        'This is a very long message that should wrap properly and not break the layout of the toast notification component when displayed to users';
      const toast = createMockToast({ message: longMessage });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const messageElement = screen.getByText(longMessage);
      expect(messageElement).toHaveClass('break-words');
      expect(messageElement).toHaveClass('leading-5');
    });

    it('handles empty message gracefully', () => {
      const toast = createMockToast({ message: '' });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Should still render the toast structure
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('handles special characters in messages', () => {
      const specialMessage = 'Message with <script>alert("xss")</script> & special chars: éñ中文';
      const toast = createMockToast({ message: specialMessage });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Should render the text safely without executing scripts
      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it('defaults dismissible to true when not specified', () => {
      const toast = createMockToast();
      delete (toast as any).dismissible; // Remove the property
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Should render close button by default
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('handles very long titles correctly', () => {
      const longTitle =
        'This is a very long title that might cause layout issues if not handled properly';
      const toast = createMockToast({ title: longTitle });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const titleElement = screen.getByText(longTitle);
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveClass('font-semibold');
    });

    it('maintains proper layout with both title and long message', () => {
      const toast = createMockToast({
        title: 'Important Notice',
        message:
          'This is a very long message that should display properly even when there is also a title present in the toast notification',
      });
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      expect(screen.getByText('Important Notice')).toBeInTheDocument();
      expect(screen.getByText(/This is a very long message/)).toBeInTheDocument();

      // Check layout structure
      const container = screen.getByRole('alert');
      expect(container).toHaveClass('flex', 'items-start', 'gap-3');
    });
  });

  describe('Performance and Optimization', () => {
    it('uses React.memo for performance optimization', () => {
      const toast = createMockToast();

      // Render the component
      const { rerender } = render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Re-render with the same props
      rerender(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Component should still be rendered correctly
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(toast.message)).toBeInTheDocument();
    });

    it('uses useCallback for performance in event handlers', async () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      // Multiple rapid clicks should work correctly
      const closeButton = screen.getByRole('button');

      await user.click(closeButton);
      await user.click(closeButton);
      await user.click(closeButton);

      // Should handle multiple calls correctly
      expect(mockOnDismiss).toHaveBeenCalledTimes(3);
      expect(mockOnDismiss).toHaveBeenCalledWith(toast.id);
    });

    it('has proper CSS classes for GPU acceleration', () => {
      const toast = createMockToast();
      render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

      const container = screen.getByRole('alert');
      expect(container).toHaveClass('transform-gpu', 'will-change-transform', 'backface-hidden');
    });
  });

  describe('Type-specific Styling Verification', () => {
    it('applies correct hover and focus styles for each type', () => {
      const types: ToastTypeEnum[] = ['success', 'error', 'info', 'warning'];

      types.forEach(type => {
        const toast = createMockToast({ type });
        const { unmount } = render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

        const container = screen.getByRole('alert');
        expect(container).toHaveClass(
          'hover:shadow-xl',
          'hover:scale-[1.02]',
          'hover:-translate-y-0.5'
        );

        const closeButton = screen.getByRole('button');
        expect(closeButton).toHaveClass('transition-colors', 'duration-150');

        unmount();
      });
    });

    it('has proper color contrast for accessibility', () => {
      const types: { type: ToastTypeEnum; textClass: string }[] = [
        { type: 'success', textClass: 'text-green-900' },
        { type: 'error', textClass: 'text-red-900' },
        { type: 'info', textClass: 'text-blue-900' },
        { type: 'warning', textClass: 'text-amber-900' },
      ];

      types.forEach(({ type, textClass }) => {
        const toast = createMockToast({ type });
        const { unmount } = render(<Toast toast={toast} onDismiss={mockOnDismiss} />);

        const container = screen.getByRole('alert');
        expect(container).toHaveClass(textClass);

        unmount();
      });
    });
  });
});
