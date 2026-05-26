import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import IncomeCategoryModal from '../IncomeCategoryModal';
import { ToastProvider } from '../../../contexts/ToastContext';

// Mock the API calls
global.fetch = vi.fn();

const mockOnClose = vi.fn();
const mockOnSuccess = vi.fn();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

describe('IncomeCategoryModal', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    mockOnClose.mockClear();
    mockOnSuccess.mockClear();

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'mock-token'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
  });

  it('should render the create modal correctly', async () => {
    // Mock the income accounts API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 4000,
            code: '4000',
            name: 'Tuition Revenue',
            account_type: 'INCOME',
            balance: '0.00',
          },
        ],
      }),
    });

    // Mock the categories API call for parent categories
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <IncomeCategoryModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          editCategory={null}
        />
      </TestWrapper>
    );

    // Check if the modal is rendered
    expect(screen.getByText('Create Income Category')).toBeInTheDocument();

    // Check if form fields are rendered
    expect(screen.getByLabelText(/Category Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Category Code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Income Account/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
  });

  it('should handle form input changes', async () => {
    // Mock the API calls
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(
      <TestWrapper>
        <IncomeCategoryModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          editCategory={null}
        />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Category Name/)).toBeInTheDocument();
    });

    // Test input changes
    const nameInput = screen.getByLabelText(/Category Name/) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/Category Code/) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Test Category' } });
    fireEvent.change(codeInput, { target: { value: 'TEST' } });

    expect(nameInput.value).toBe('Test Category');
    expect(codeInput.value).toBe('TEST');
  });

  it('should not render when isOpen is false', () => {
    render(
      <TestWrapper>
        <IncomeCategoryModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          editCategory={null}
        />
      </TestWrapper>
    );

    expect(screen.queryByText('Create Income Category')).not.toBeInTheDocument();
  });

  it('should call onClose when cancel button is clicked', async () => {
    // Mock the API calls
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(
      <TestWrapper>
        <IncomeCategoryModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          editCategory={null}
        />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Click the cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
