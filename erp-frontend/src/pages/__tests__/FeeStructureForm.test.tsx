import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FeeStructureForm from '../FeeStructureForm';
import { ToastProvider } from '../../contexts/ToastContext';

// Mock the API calls
global.fetch = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: undefined }),
  };
});

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

describe('FeeStructureForm', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    mockNavigate.mockClear();

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

  it('should render the create form correctly', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: 'Tuition Fees',
            code: 'TUITION',
            description: 'School tuition fees',
            income_account: { id: 4000, code: '4000', name: 'Tuition Revenue' },
            is_active: true,
          },
        ],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Check if the main heading is rendered
    expect(screen.getByText('Create Fee Structure')).toBeInTheDocument();

    // Check if basic form fields are rendered
    expect(screen.getByLabelText(/Fee Structure Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fee Structure Code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Income Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Base Amount/)).toBeInTheDocument();

    // Check if sections are rendered
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Recurring Billing Settings')).toBeInTheDocument();
    expect(screen.getByText('Industry-Specific Configuration')).toBeInTheDocument();
    expect(screen.getByText('Access Control Rules')).toBeInTheDocument();
  });

  it('should handle form input changes', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: 'Tuition Fees',
            code: 'TUITION',
            description: 'School tuition fees',
            income_account: { id: 4000, code: '4000', name: 'Tuition Revenue' },
            is_active: true,
          },
        ],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Fee Structure Name/)).toBeInTheDocument();
    });

    // Test input changes
    const nameInput = screen.getByLabelText(/Fee Structure Name/) as HTMLInputElement;
    const codeInput = screen.getByLabelText(/Fee Structure Code/) as HTMLInputElement;
    const amountInput = screen.getByLabelText(/Base Amount/) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Test Fee Structure' } });
    fireEvent.change(codeInput, { target: { value: 'TEST' } });
    fireEvent.change(amountInput, { target: { value: '1000' } });

    expect(nameInput.value).toBe('Test Fee Structure');
    expect(codeInput.value).toBe('TEST');
    expect(amountInput.value).toBe('1000');
  });

  it('should show validation errors for required fields', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Create Fee Structure')).toBeInTheDocument();
    });

    // Try to submit the form without filling required fields
    const submitButton = screen.getByText('Create Fee Structure');
    fireEvent.click(submitButton);

    // Check if validation errors appear
    await waitFor(() => {
      expect(screen.getByText('Fee structure name is required')).toBeInTheDocument();
      expect(screen.getByText('Fee structure code is required')).toBeInTheDocument();
      expect(screen.getByText('Income category is required')).toBeInTheDocument();
      expect(screen.getByText('Base amount must be greater than 0')).toBeInTheDocument();
    });
  });

  it('should enable recurring billing options when checkbox is checked', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Recurring Billing Settings')).toBeInTheDocument();
    });

    // Check the recurring billing checkbox
    const recurringCheckbox = screen.getByLabelText(/Enable recurring billing/);
    fireEvent.click(recurringCheckbox);

    // Check if frequency dropdown appears
    await waitFor(() => {
      expect(screen.getByLabelText(/Billing Frequency/)).toBeInTheDocument();
    });
  });

  it('should enable access control options when checkbox is checked', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Access Control Rules')).toBeInTheDocument();
    });

    // Check the access control checkbox
    const accessControlCheckbox = screen.getByLabelText(/Require minimum payment/);
    fireEvent.click(accessControlCheckbox);

    // Check if access control options appear
    await waitFor(() => {
      expect(screen.getByLabelText(/Minimum Payment Percentage/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Full Access Percentage/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Grace Period/)).toBeInTheDocument();
    });
  });

  it('should handle navigation back to list page', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Create Fee Structure')).toBeInTheDocument();
    });

    // Click the back button
    const backButton = screen.getByRole('button', { name: '' }); // Arrow left button
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/incomes/fee-structures');
  });

  it('should handle cancel button click', async () => {
    // Mock the categories API call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
    });

    render(
      <TestWrapper>
        <FeeStructureForm />
      </TestWrapper>
    );

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Click the cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/incomes/fee-structures');
  });
});
