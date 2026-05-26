import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast } from '../Toast';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

// Test component that uses the toast system
const TestComponent = () => {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Add Success Toast</button>
      <button onClick={() => toast.error('Error message')}>Add Error Toast</button>
      <button onClick={() => toast.info('Info message')}>Add Info Toast</button>
      <button onClick={() => toast.warning('Warning message')}>Add Warning Toast</button>
    </div>
  );
};

describe('Toast Integration', () => {
  it('can be imported and used with ToastProvider', () => {
    const mockOnDismiss = vi.fn();
    const mockToast = {
      id: 'test-toast',
      type: 'success' as const,
      message: 'Test message',
      dismissible: true,
    };

    render(<Toast toast={mockToast} onDismiss={mockOnDismiss} />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('integrates with ToastProvider and useToast hook', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Should render the test component buttons
    expect(screen.getByText('Add Success Toast')).toBeInTheDocument();
    expect(screen.getByText('Add Error Toast')).toBeInTheDocument();
    expect(screen.getByText('Add Info Toast')).toBeInTheDocument();
    expect(screen.getByText('Add Warning Toast')).toBeInTheDocument();
  });

  it('can be exported from UI components index', async () => {
    // Test that the component can be imported from the index
    const { Toast: ImportedToast } = await import('../index');
    expect(ImportedToast).toBeDefined();
    // React.memo components are objects, not functions
    expect(typeof ImportedToast).toBe('object');
    // But they should have the component properties
    expect(ImportedToast.displayName).toBe('Toast');
  });
});
