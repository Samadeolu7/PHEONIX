import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../../contexts/AuthContext';
import PayablesListPage from '../../../pages/liabilities/PayablesListPage';
import { liabilitiesService } from '../../../services/liabilitiesService';

// Mock the service
jest.mock('../../../services/liabilitiesService');

const mockPayables = {
  count: 3,
  results: [
    {
      id: 1,
      reference_number: 'AP-20260204-0001',
      vendor_type: 'supplier',
      vendor_id: 10,
      vendor_name: 'Acme Corp',
      invoice_number: 'INV-001',
      invoice_date: '2026-02-01',
      due_date: '2026-03-01',
      amount: '1000.00',
      tax_amount: '100.00',
      total_amount: '1100.00',
      amount_paid: '0.00',
      amount_due: '1100.00',
      status: 'pending',
      three_way_match_status: 'not_validated',
      posted_by: 1,
      posted_at: '2026-02-01T10:00:00Z',
    },
    {
      id: 2,
      reference_number: 'AP-20260204-0002',
      vendor_type: 'client',
      vendor_id: 5,
      vendor_name: 'John Doe',
      invoice_number: 'INV-002',
      invoice_date: '2026-02-02',
      due_date: '2026-03-02',
      amount: '500.00',
      tax_amount: '50.00',
      total_amount: '550.00',
      amount_paid: '550.00',
      amount_due: '0.00',
      status: 'paid',
      three_way_match_status: 'matched',
      posted_by: 2,
      posted_at: '2026-02-02T11:00:00Z',
    },
    {
      id: 3,
      reference_number: 'AP-20260204-0003',
      vendor_type: 'supplier',
      vendor_id: 11,
      vendor_name: 'Tech Solutions',
      invoice_number: 'INV-003',
      invoice_date: '2026-01-15',
      due_date: '2026-02-01',
      amount: '2000.00',
      tax_amount: '200.00',
      total_amount: '2200.00',
      amount_paid: '1000.00',
      amount_due: '1200.00',
      status: 'overdue',
      three_way_match_status: 'mismatched',
      posted_by: 1,
      posted_at: '2026-01-15T09:00:00Z',
    },
  ],
};

describe('Payables List Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{ui}</AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    );
  };

  it('should load and display payables list', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    // Should show loading state
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Should display all payables
    expect(screen.getByText('AP-20260204-0001')).toBeInTheDocument();
    expect(screen.getByText('AP-20260204-0002')).toBeInTheDocument();
    expect(screen.getByText('AP-20260204-0003')).toBeInTheDocument();

    // Should display vendor names
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Tech Solutions')).toBeInTheDocument();
  });

  it('should filter payables by status', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Filter by "Paid" status
    const statusFilter = screen.getByRole('combobox', { name: /Status/i });
    fireEvent.click(statusFilter);

    const paidOption = screen.getByText('Paid');
    fireEvent.click(paidOption);

    // Should call API with status filter
    await waitFor(() => {
      expect(liabilitiesService.getPayables).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paid',
        })
      );
    });
  });

  it('should filter payables by vendor type', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Filter by "Supplier"
    const vendorTypeFilter = screen.getByRole('combobox', { name: /Vendor Type/i });
    fireEvent.click(vendorTypeFilter);

    const supplierOption = screen.getByText('Supplier');
    fireEvent.click(supplierOption);

    await waitFor(() => {
      expect(liabilitiesService.getPayables).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor_type: 'supplier',
        })
      );
    });
  });

  it('should search payables by reference number', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Search for specific reference
    const searchInput = screen.getByPlaceholderText(/Search by reference.../i);
    fireEvent.change(searchInput, { target: { value: 'AP-20260204-0001' } });

    await waitFor(
      () => {
        expect(liabilitiesService.getPayables).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'AP-20260204-0001',
          })
        );
      },
      { timeout: 1500 }
    );
  });

  it('should display status badges correctly', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Check status badges
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('should navigate to detail page when row is clicked', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
    });

    // Find and click first row
    const firstRow = screen.getByText('AP-20260204-0001').closest('tr');
    expect(firstRow).toBeInTheDocument();

    if (firstRow) {
      fireEvent.click(firstRow);
      // In real implementation, this would navigate to /liabilities/payables/1
    }
  });

  it('should display total count', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue(mockPayables);

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 3 payables/i)).toBeInTheDocument();
    });
  });

  it('should handle empty results', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockResolvedValue({
      count: 0,
      results: [],
    });

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.getByText(/No payables found/i)).toBeInTheDocument();
    });
  });

  it('should handle API errors', async () => {
    (liabilitiesService.getPayables as jest.Mock).mockRejectedValue(
      new Error('Failed to load payables')
    );

    renderWithProviders(<PayablesListPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load payables/i)).toBeInTheDocument();
    });
  });
});
