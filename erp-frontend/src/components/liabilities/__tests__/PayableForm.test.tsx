import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayableForm } from '../PayableForm';
import { useAuth } from '../../../contexts/AuthContext';
import { clientService } from '../../../services/clientService';
import { supplierService } from '../../../services/supplierService';
import * as usePayablesHook from '../../../hooks/usePayables';

// Mock dependencies
jest.mock('../../../contexts/AuthContext');
jest.mock('../../../services/clientService');
jest.mock('../../../services/supplierService');
jest.mock('../../../hooks/usePayables');

const mockUser = {
  id: 42,
  username: 'testuser',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
};

const mockSuppliers = {
  count: 1,
  results: [{ id: 10, name: 'Test Supplier', supplier_code: 'SUP-001', is_active: true }],
};

describe('PayableForm Component', () => {
  let queryClient: QueryClient;
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock auth context
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    // Mock supplier service
    (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

    // Mock create payable mutation
    (usePayablesHook.useCreatePayable as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    jest.clearAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('Auth Integration', () => {
    it('should use authenticated user ID for posted_by field', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      // Wait for suppliers to load
      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Invoice Number/i), {
        target: { value: 'INV-001' },
      });

      fireEvent.change(screen.getByLabelText(/Invoice Date/i), {
        target: { value: '2026-02-04' },
      });

      fireEvent.change(screen.getByLabelText(/Due Date/i), {
        target: { value: '2026-03-04' },
      });

      fireEvent.change(screen.getByLabelText(/Amount \(excluding tax\)/i), {
        target: { value: '1000.00' },
      });

      fireEvent.change(screen.getByLabelText(/Tax Amount/i), {
        target: { value: '100.00' },
      });

      // Mock successful submission
      mockMutateAsync.mockResolvedValue({
        id: 1,
        reference_number: 'AP-20260204-0001',
      });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create Payable/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Verify posted_by is set to authenticated user ID
      const callArgs = mockMutateAsync.mock.calls[0][0];
      expect(callArgs.posted_by).toBe(42);
    });

    it('should display username in accountability message', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(
          screen.getByText(/This payable will be recorded under your user account \(testuser\)/i)
        ).toBeInTheDocument();
      });
    });

    it('should fallback to ID 1 when user is not authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false,
      });

      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Fill and submit
      fireEvent.change(screen.getByLabelText(/Invoice Number/i), {
        target: { value: 'INV-001' },
      });

      fireEvent.change(screen.getByLabelText(/Invoice Date/i), {
        target: { value: '2026-02-04' },
      });

      fireEvent.change(screen.getByLabelText(/Due Date/i), {
        target: { value: '2026-03-04' },
      });

      fireEvent.change(screen.getByLabelText(/Amount \(excluding tax\)/i), {
        target: { value: '1000.00' },
      });

      fireEvent.change(screen.getByLabelText(/Tax Amount/i), {
        target: { value: '100.00' },
      });

      mockMutateAsync.mockResolvedValue({ id: 1 });

      const submitButton = screen.getByRole('button', { name: /Create Payable/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      const callArgs = mockMutateAsync.mock.calls[0][0];
      expect(callArgs.posted_by).toBe(1);
    });
  });

  describe('Vendor Selection', () => {
    it('should load VendorSelect component', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      // Should have vendor type selector
      expect(screen.getByText(/Vendor Type/i)).toBeInTheDocument();

      // Should have VendorSelect (search input)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search suppliers.../i)).toBeInTheDocument();
      });
    });

    it('should switch vendors when vendor type changes', async () => {
      const mockClients = {
        count: 1,
        results: [{ id: 1, full_name: 'Test Client', client_id: 'CLI-001', status: 'active' }],
      };

      (clientService.getClients as jest.Mock).mockResolvedValue(mockClients);

      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search suppliers.../i)).toBeInTheDocument();
      });

      // Change vendor type to client
      const vendorTypeSelect = screen.getByRole('combobox', { name: /Vendor Type/i });
      fireEvent.click(vendorTypeSelect);

      const clientOption = screen.getByText('Client');
      fireEvent.click(clientOption);

      // Should now show clients search
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search clients.../i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should calculate total amount correctly', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Enter amounts
      fireEvent.change(screen.getByLabelText(/Amount \(excluding tax\)/i), {
        target: { value: '1000.00' },
      });

      fireEvent.change(screen.getByLabelText(/Tax Amount/i), {
        target: { value: '150.00' },
      });

      // Total should be calculated
      await waitFor(() => {
        expect(screen.getByText('$1150.00')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call onSuccess after successful submission', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Invoice Number/i), {
        target: { value: 'INV-001' },
      });

      fireEvent.change(screen.getByLabelText(/Invoice Date/i), {
        target: { value: '2026-02-04' },
      });

      fireEvent.change(screen.getByLabelText(/Due Date/i), {
        target: { value: '2026-03-04' },
      });

      fireEvent.change(screen.getByLabelText(/Amount \(excluding tax\)/i), {
        target: { value: '1000.00' },
      });

      fireEvent.change(screen.getByLabelText(/Tax Amount/i), {
        target: { value: '100.00' },
      });

      mockMutateAsync.mockResolvedValue({ id: 1 });

      const submitButton = screen.getByRole('button', { name: /Create Payable/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should call onCancel when cancel button is clicked', async () => {
      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message on submission failure', async () => {
      (usePayablesHook.useCreatePayable as jest.Mock).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: true,
        error: new Error('Failed to create payable'),
      });

      renderWithProviders(<PayableForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to create payable/i)).toBeInTheDocument();
      });
    });
  });
});
