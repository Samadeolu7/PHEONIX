import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VendorSelect } from '../VendorSelect';
import { clientService } from '../../../services/clientService';
import { supplierService } from '../../../services/supplierService';

// Mock the services
jest.mock('../../../services/clientService');
jest.mock('../../../services/supplierService');

const mockClients = {
  count: 2,
  results: [
    { id: 1, full_name: 'John Doe', client_id: 'CLI-001', status: 'active' },
    { id: 2, full_name: 'Jane Smith', client_id: 'CLI-002', status: 'active' },
  ],
};

const mockSuppliers = {
  count: 2,
  results: [
    { id: 10, name: 'Acme Corp', supplier_code: 'SUP-001', is_active: true },
    { id: 11, name: 'Tech Solutions', supplier_code: 'SUP-002', is_active: true },
  ],
};

describe('VendorSelect Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('Supplier Selection', () => {
    it('should load and display suppliers', async () => {
      (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

      const onChange = jest.fn();
      renderWithQuery(
        <VendorSelect vendorType="supplier" value={0} onChange={onChange} label="Select Supplier" />
      );

      // Should show loading state
      expect(screen.getByText(/Loading suppliers.../i)).toBeInTheDocument();

      // Wait for suppliers to load
      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Verify API was called correctly
      expect(supplierService.getSuppliers).toHaveBeenCalledWith({ is_active: true });
    });

    it('should filter suppliers by search term', async () => {
      (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

      const onChange = jest.fn();
      renderWithQuery(<VendorSelect vendorType="supplier" value={0} onChange={onChange} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Type in search box
      const searchInput = screen.getByPlaceholderText(/Search suppliers.../i);
      fireEvent.change(searchInput, { target: { value: 'Acme' } });

      // Open dropdown
      const selectTrigger = screen.getByRole('combobox');
      fireEvent.click(selectTrigger);

      // Should show filtered results (Acme Corp, not Tech Solutions)
      await waitFor(() => {
        expect(screen.getByText(/Acme Corp \(SUP-001\)/i)).toBeInTheDocument();
      });
    });

    it('should call onChange when supplier is selected', async () => {
      (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

      const onChange = jest.fn();
      renderWithQuery(<VendorSelect vendorType="supplier" value={0} onChange={onChange} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Open dropdown and select supplier
      const selectTrigger = screen.getByRole('combobox');
      fireEvent.click(selectTrigger);

      await waitFor(() => {
        const option = screen.getByText(/Acme Corp \(SUP-001\)/i);
        fireEvent.click(option);
      });

      expect(onChange).toHaveBeenCalledWith(10);
    });
  });

  describe('Client Selection', () => {
    it('should load and display clients', async () => {
      (clientService.getClients as jest.Mock).mockResolvedValue(mockClients);

      const onChange = jest.fn();
      renderWithQuery(
        <VendorSelect vendorType="client" value={0} onChange={onChange} label="Select Client" />
      );

      // Should show loading state
      expect(screen.getByText(/Loading clients.../i)).toBeInTheDocument();

      // Wait for clients to load
      await waitFor(() => {
        expect(screen.queryByText(/Loading clients.../i)).not.toBeInTheDocument();
      });

      // Verify API was called correctly
      expect(clientService.getClients).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should display selected client', async () => {
      (clientService.getClients as jest.Mock).mockResolvedValue(mockClients);

      const onChange = jest.fn();
      renderWithQuery(<VendorSelect vendorType="client" value={1} onChange={onChange} />);

      await waitFor(() => {
        expect(screen.getByText(/John Doe \(CLI-001\)/i)).toBeInTheDocument();
      });
    });

    it('should show "No clients found" when search has no results', async () => {
      (clientService.getClients as jest.Mock).mockResolvedValue(mockClients);

      const onChange = jest.fn();
      renderWithQuery(<VendorSelect vendorType="client" value={0} onChange={onChange} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading clients.../i)).not.toBeInTheDocument();
      });

      // Search for non-existent client
      const searchInput = screen.getByPlaceholderText(/Search clients.../i);
      fireEvent.change(searchInput, { target: { value: 'NonExistent' } });

      // Open dropdown
      const selectTrigger = screen.getByRole('combobox');
      fireEvent.click(selectTrigger);

      await waitFor(() => {
        expect(screen.getByText(/No clients found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (supplierService.getSuppliers as jest.Mock).mockRejectedValue(new Error('API Error'));

      const onChange = jest.fn();
      renderWithQuery(<VendorSelect vendorType="supplier" value={0} onChange={onChange} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      // Component should not crash
      expect(consoleError).toHaveBeenCalledWith('Failed to load vendors:', expect.any(Error));

      consoleError.mockRestore();
    });
  });

  describe('Disabled State', () => {
    it('should disable inputs when disabled prop is true', async () => {
      (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

      const onChange = jest.fn();
      renderWithQuery(
        <VendorSelect vendorType="supplier" value={0} onChange={onChange} disabled />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading suppliers.../i)).not.toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search suppliers.../i);
      expect(searchInput).toBeDisabled();
    });
  });

  describe('Required Field', () => {
    it('should show required indicator when required prop is true', async () => {
      (supplierService.getSuppliers as jest.Mock).mockResolvedValue(mockSuppliers);

      const onChange = jest.fn();
      renderWithQuery(
        <VendorSelect
          vendorType="supplier"
          value={0}
          onChange={onChange}
          label="Supplier"
          required
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Supplier')).toBeInTheDocument();
        expect(screen.getByText('*')).toBeInTheDocument();
      });
    });
  });
});
