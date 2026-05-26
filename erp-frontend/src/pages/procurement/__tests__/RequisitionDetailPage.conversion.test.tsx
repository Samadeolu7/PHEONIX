import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import RequisitionDetailPage from '../RequisitionDetailPage';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock the hooks
jest.mock('../../../hooks/useProcurement', () => ({
  usePurchaseRequisition: () => ({
    data: mockRequisition,
    isLoading: false,
    error: null,
  }),
  useApproveRequisition: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useRejectRequisition: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useConvertRequisitionToPOWithDetails: () => ({
    mutateAsync: jest.fn().mockResolvedValue({
      id: 123,
      po_number: 'PO-2026-001',
      supplier: 1,
      supplier_name: 'Test Supplier',
      delivery_location: 1,
      location_name: 'Main Warehouse',
      expected_delivery_date: '2026-02-15',
      status: 'draft',
      total_amount: '50000.00',
      created_at: '2026-01-11T10:00:00Z',
    }),
    isPending: false,
  }),
  useSuppliers: () => ({
    data: {
      results: [{ id: 1, name: 'Test Supplier', supplier_code: 'SUP001' }],
    },
    isLoading: false,
  }),
  useInventoryLocations: () => ({
    data: {
      results: [{ id: 1, name: 'Main Warehouse', code: 'WH001' }],
    },
    isLoading: false,
  }),
}));

// Mock the toast hook
jest.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock the workflow service
jest.mock('../../../services/procurementWorkflowService', () => ({
  default: {
    triggerStatusChange: jest.fn(),
  },
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: '1' }),
}));

const mockRequisition: PurchaseRequisition = {
  id: 1,
  pr_number: 'PR-2026-001',
  requested_by: 1,
  requested_by_name: 'John Doe',
  department: 'IT Department',
  request_date: '2026-01-01',
  required_by_date: '2026-02-15',
  purpose: 'Office equipment for new employees',
  status: 'approved',
  approved_by: 2,
  approved_by_name: 'Jane Manager',
  approved_at: '2026-01-10T10:00:00Z',
  estimated_total: '50000.00',
  notes: 'Urgent requirement',
  items: [
    {
      id: 1,
      item: 1,
      description: 'Laptop computer',
      quantity: '10',
      estimated_unit_price: '5000.00',
      notes: 'Dell or HP preferred',
    },
  ],
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RequisitionDetailPage - Enhanced Conversion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows Convert to PO button for approved requisitions', () => {
    renderWithProviders(<RequisitionDetailPage />);

    expect(screen.getByRole('button', { name: /convert to po/i })).toBeInTheDocument();
  });

  it('opens conversion modal when Convert to PO button is clicked', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
      expect(screen.getByText('Supplier *')).toBeInTheDocument();
      expect(screen.getByText('Delivery Location *')).toBeInTheDocument();
      expect(screen.getByText('Expected Delivery Date *')).toBeInTheDocument();
    });
  });

  it('displays requisition information in conversion modal', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Items count
      expect(screen.getByText('₦50,000')).toBeInTheDocument(); // Total value
    });
  });

  it('pre-fills expected delivery date with required_by_date', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      const dateInput = screen.getByDisplayValue('2026-02-15');
      expect(dateInput).toBeInTheDocument();
    });
  });

  it('successfully converts requisition to PO with enhanced details', async () => {
    const mockConvertMutation = jest.fn().mockResolvedValue({
      id: 123,
      po_number: 'PO-2026-001',
      supplier: 1,
      supplier_name: 'Test Supplier',
      delivery_location: 1,
      location_name: 'Main Warehouse',
      expected_delivery_date: '2026-02-15',
      status: 'draft',
      total_amount: '50000.00',
      created_at: '2026-01-11T10:00:00Z',
    });

    // Re-mock the hook with our test function
    jest.doMock('../../../hooks/useProcurement', () => ({
      ...jest.requireActual('../../../hooks/useProcurement'),
      useConvertRequisitionToPOWithDetails: () => ({
        mutateAsync: mockConvertMutation,
        isPending: false,
      }),
    }));

    renderWithProviders(<RequisitionDetailPage />);

    // Open conversion modal
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
    });

    // Fill out the form
    const supplierSelect = screen.getByDisplayValue('Select a supplier');
    fireEvent.change(supplierSelect, { target: { value: '1' } });

    const locationSelect = screen.getByDisplayValue('Select a delivery location');
    fireEvent.change(locationSelect, { target: { value: '1' } });

    // Submit the form
    const modalConvertButton = screen.getAllByRole('button', { name: /convert to po/i })[1]; // Second one is in modal
    fireEvent.click(modalConvertButton);

    await waitFor(() => {
      expect(mockConvertMutation).toHaveBeenCalledWith({
        id: 1,
        conversionData: {
          supplier: 1,
          delivery_location: 1,
          expected_delivery_date: '2026-02-15',
        },
      });
    });

    // Should navigate to the new PO
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/orders/123/view');
  });

  it('handles conversion errors gracefully', async () => {
    const mockConvertMutation = jest.fn().mockRejectedValue(new Error('Conversion failed'));

    // Re-mock the hook with error
    jest.doMock('../../../hooks/useProcurement', () => ({
      ...jest.requireActual('../../../hooks/useProcurement'),
      useConvertRequisitionToPOWithDetails: () => ({
        mutateAsync: mockConvertMutation,
        isPending: false,
      }),
    }));

    renderWithProviders(<RequisitionDetailPage />);

    // Open conversion modal
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
    });

    // Fill out the form
    const supplierSelect = screen.getByDisplayValue('Select a supplier');
    fireEvent.change(supplierSelect, { target: { value: '1' } });

    const locationSelect = screen.getByDisplayValue('Select a delivery location');
    fireEvent.change(locationSelect, { target: { value: '1' } });

    // Submit the form
    const modalConvertButton = screen.getAllByRole('button', { name: /convert to po/i })[1];
    fireEvent.click(modalConvertButton);

    await waitFor(() => {
      expect(mockConvertMutation).toHaveBeenCalled();
    });

    // Modal should remain open on error
    expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
  });

  it('closes modal when cancel button is clicked', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    // Open conversion modal
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Convert to Purchase Order')).not.toBeInTheDocument();
    });
  });
});
