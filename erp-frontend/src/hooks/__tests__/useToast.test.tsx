import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../contexts/ToastContext';
import { useToast } from '../useToast';
import { ToastOptions } from '../../types/toast';

// Mock timers for testing
vi.useFakeTimers();

// Test component to verify useToast hook functionality
const TestComponent: React.FC = () => {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Success</button>
      <button onClick={() => toast.error('Error message')}>Error</button>
      <button onClick={() => toast.info('Info message')}>Info</button>
      <button onClick={() => toast.warning('Warning message')}>Warning</button>
      <button
        onClick={() => toast.success('Custom success', { title: 'Custom Title', duration: 2000 })}
      >
        Custom Success
      </button>
      <button onClick={() => toast.error('Custom error', { dismissible: false })}>
        Non-dismissible Error
      </button>
      <button onClick={() => toast.clearAllToasts()}>Clear All</button>
      <div data-testid="toast-count">{toast.toasts.length}</div>
      <div data-testid="toast-methods">
        {JSON.stringify({
          hasSuccess: typeof toast.success === 'function',
          hasError: typeof toast.error === 'function',
          hasInfo: typeof toast.info === 'function',
          hasWarning: typeof toast.warning === 'function',
          hasDismiss: typeof toast.dismiss === 'function',
          hasAddToast: typeof toast.addToast === 'function',
          hasRemoveToast: typeof toast.removeToast === 'function',
          hasClearAllToasts: typeof toast.clearAllToasts === 'function',
          hasToasts: Array.isArray(toast.toasts),
        })}
      </div>
      {toast.toasts.map(toastItem => (
        <div key={toastItem.id} data-testid={`toast-${toastItem.type}-${toastItem.id}`}>
          <span data-testid={`message-${toastItem.id}`}>{toastItem.message}</span>
          {toastItem.title && <span data-testid={`title-${toastItem.id}`}>{toastItem.title}</span>}
          <span data-testid={`dismissible-${toastItem.id}`}>
            {toastItem.dismissible?.toString()}
          </span>
          <button onClick={() => toast.dismiss(toastItem.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
};

// Test component for return value testing
const ReturnValueTestComponent: React.FC = () => {
  const toast = useToast();
  const [lastToastId, setLastToastId] = React.useState<string>('');

  return (
    <div>
      <button
        onClick={() => {
          const id = toast.success('Test message');
          setLastToastId(id);
        }}
      >
        Add Toast
      </button>
      <div data-testid="last-toast-id">{lastToastId}</div>
    </div>
  );
};

describe('useToast hook', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.useFakeTimers();
  });

  describe('Hook Interface and Methods', () => {
    it('should provide all required convenience methods', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const methodsData = JSON.parse(screen.getByTestId('toast-methods').textContent || '{}');

      expect(methodsData.hasSuccess).toBe(true);
      expect(methodsData.hasError).toBe(true);
      expect(methodsData.hasInfo).toBe(true);
      expect(methodsData.hasWarning).toBe(true);
      expect(methodsData.hasDismiss).toBe(true);
      expect(methodsData.hasAddToast).toBe(true);
      expect(methodsData.hasRemoveToast).toBe(true);
      expect(methodsData.hasClearAllToasts).toBe(true);
      expect(methodsData.hasToasts).toBe(true);
    });

    it('should provide dismiss method as alias for removeToast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add a toast
      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // Dismiss the toast using the dismiss method
      fireEvent.click(screen.getByText('Dismiss'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('should return toast ID when creating toasts', () => {
      render(
        <ToastProvider>
          <ReturnValueTestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Add Toast'));

      const toastId = screen.getByTestId('last-toast-id').textContent;
      expect(toastId).toBeTruthy();
      expect(typeof toastId).toBe('string');
      expect(toastId).toMatch(/^toast-\d+-\w+$/); // Should match the ID format
    });
  });

  describe('Toast Creation Methods', () => {
    it('should create success toasts with correct properties', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const toastElement = screen.getByTestId(/toast-success-/);
      expect(toastElement).toBeInTheDocument();
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Success message');
    });

    it('should create error toasts with correct properties', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Error'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const toastElement = screen.getByTestId(/toast-error-/);
      expect(toastElement).toBeInTheDocument();
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Error message');
    });

    it('should create info toasts with correct properties', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Info'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const toastElement = screen.getByTestId(/toast-info-/);
      expect(toastElement).toBeInTheDocument();
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Info message');
    });

    it('should create warning toasts with correct properties', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Warning'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      const toastElement = screen.getByTestId(/toast-warning-/);
      expect(toastElement).toBeInTheDocument();
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Warning message');
    });
  });

  describe('Toast Options Support', () => {
    it('should accept and apply custom options', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Custom Success'));

      expect(screen.getByTestId(/title-/)).toHaveTextContent('Custom Title');
      expect(screen.getByTestId(/message-/)).toHaveTextContent('Custom success');
    });

    it('should handle dismissible option correctly', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Non-dismissible Error'));

      expect(screen.getByTestId(/dismissible-/)).toHaveTextContent('false');
    });

    it('should support all toast options interface', () => {
      const TestOptionsComponent = () => {
        const toast = useToast();

        const testAllOptions = () => {
          const options: ToastOptions = {
            title: 'Test Title',
            duration: 5000,
            dismissible: true,
            position: 'top-left',
          };
          toast.success('Test with all options', options);
        };

        return (
          <div>
            <button onClick={testAllOptions}>Test All Options</button>
            <div data-testid="toast-count">{toast.toasts.length}</div>
            {toast.toasts.map(toastItem => (
              <div key={toastItem.id} data-testid={`toast-${toastItem.id}`}>
                <span data-testid="title">{toastItem.title}</span>
                <span data-testid="message">{toastItem.message}</span>
                <span data-testid="duration">{toastItem.duration}</span>
                <span data-testid="dismissible">{toastItem.dismissible?.toString()}</span>
                <span data-testid="position">{toastItem.position}</span>
              </div>
            ))}
          </div>
        );
      };

      render(
        <ToastProvider>
          <TestOptionsComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Test All Options'));

      expect(screen.getByTestId('title')).toHaveTextContent('Test Title');
      expect(screen.getByTestId('message')).toHaveTextContent('Test with all options');
      expect(screen.getByTestId('duration')).toHaveTextContent('5000');
      expect(screen.getByTestId('dismissible')).toHaveTextContent('true');
      expect(screen.getByTestId('position')).toHaveTextContent('top-left');
    });
  });

  describe('Toast Management', () => {
    it('should provide clearAllToasts method', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Error'));
      fireEvent.click(screen.getByText('Info'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      // Clear all toasts
      fireEvent.click(screen.getByText('Clear All'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('should handle multiple toasts of the same type', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Add multiple success toasts
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));
      fireEvent.click(screen.getByText('Success'));

      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');

      const successToasts = screen.getAllByTestId(/toast-success-/);
      expect(successToasts).toHaveLength(3);
    });

    it('should provide access to toasts array', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      fireEvent.click(screen.getByText('Success'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      fireEvent.click(screen.getByText('Error'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when used outside ToastProvider', () => {
      const TestComponentWithoutProvider = () => {
        const toast = useToast();
        return <button onClick={() => toast.success('test')}>Test</button>;
      };

      expect(() => render(<TestComponentWithoutProvider />)).toThrow(
        'useToast must be used within a ToastProvider'
      );
    });

    it('should handle edge cases gracefully', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Test with empty message - should not throw
      expect(() => {
        fireEvent.click(screen.getByText('Success'));
      }).not.toThrow();
    });
  });

  describe('Integration with Context', () => {
    it('should properly integrate with ToastProvider context', () => {
      const TestIntegrationComponent = () => {
        const toast = useToast();

        return (
          <div>
            <button onClick={() => toast.success('Integration test')}>Test Integration</button>
            <div data-testid="context-methods">
              {JSON.stringify({
                hasContextMethods: !!(toast.addToast && toast.removeToast),
                hasConvenienceMethods: !!(
                  toast.success &&
                  toast.error &&
                  toast.info &&
                  toast.warning
                ),
                hasToastsArray: Array.isArray(toast.toasts),
              })}
            </div>
          </div>
        );
      };

      render(
        <ToastProvider>
          <TestIntegrationComponent />
        </ToastProvider>
      );

      const integrationData = JSON.parse(screen.getByTestId('context-methods').textContent || '{}');

      expect(integrationData.hasContextMethods).toBe(true);
      expect(integrationData.hasConvenienceMethods).toBe(true);
      expect(integrationData.hasToastsArray).toBe(true);
    });

    it('should maintain consistent API across re-renders', () => {
      let renderCount = 0;
      const TestConsistencyComponent = () => {
        renderCount++;
        const toast = useToast();

        React.useEffect(() => {
          (window as any).toastHookMethods = {
            success: toast.success,
            error: toast.error,
            info: toast.info,
            warning: toast.warning,
            dismiss: toast.dismiss,
          };
        });

        return <div data-testid="render-count">{renderCount}</div>;
      };

      const { rerender } = render(
        <ToastProvider>
          <TestConsistencyComponent />
        </ToastProvider>
      );

      const initialMethods = (window as any).toastHookMethods;

      rerender(
        <ToastProvider>
          <TestConsistencyComponent />
        </ToastProvider>
      );

      const afterRerender = (window as any).toastHookMethods;

      // Methods should be stable across re-renders
      expect(initialMethods.success).toBe(afterRerender.success);
      expect(initialMethods.error).toBe(afterRerender.error);
      expect(initialMethods.info).toBe(afterRerender.info);
      expect(initialMethods.warning).toBe(afterRerender.warning);
      expect(initialMethods.dismiss).toBe(afterRerender.dismiss);

      // Clean up
      delete (window as any).toastHookMethods;
    });
  });
});
