import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConvertToPOModal from '../ConvertToPOModal';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock the hooks
jest.mock('../../../hooks/useProcurement', () => ({
  useSuppliers: () => ({
    data: {
      results: [
        { id: 1, name: 'Supplier A', supplier_code: 'SUP001' },
        { id: 2, name: 'Supplier B', supplier_code: 'SUP002' },
      ],
    },
    isLoading: false,
  }),
  useInventoryLocations: () => ({
    data: {
      results: [
        { id: 1, name: 'Main Warehouse', code: 'WH001' },
        { id: 2, name: 'Store Location', code: 'ST001' },
      ],
    },
    isLoading: false,
  }),
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

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
};

describe('ConvertToPOModal', () => {
  const mockOnClose = jest.fn();
  const mockOnConfirm = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when isOpen is true', () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    expect(screen.getByText('Convert to Purchase Order')).toBeInTheDocument();
    expect(screen.getByText('Requisition Summary')).toBeInTheDocument();
    expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
  });

  it('does not render modal when isOpen is false', () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={false}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    expect(screen.queryByText('Convert to Purchase Order')).not.toBeInTheDocument();
  });

  it('displays requisition summary correctly', () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // Items count
    expect(screen.getByText('₦50,000')).toBeInTheDocument(); // Total value
  });

  it('shows validation errors when form is incomplete', async () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    // Try to submit without selecting supplier and location
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Please select a supplier')).toBeInTheDocument();
      expect(screen.getByText('Please select a delivery location')).toBeInTheDocument();
    });

    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with correct data when form is valid', async () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    // Select supplier
    const supplierSelect = screen.getByDisplayValue('Select a supplier');
    fireEvent.change(supplierSelect, { target: { value: '1' } });

    // Select location
    const locationSelect = screen.getByDisplayValue('Select a delivery location');
    fireEvent.change(locationSelect, { target: { value: '1' } });

    // Expected delivery date should be pre-filled with required_by_date
    const dateInput = screen.getByDisplayValue('2026-02-15');
    expect(dateInput).toBeInTheDocument();

    // Submit form
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith({
        supplier: 1,
        delivery_location: 1,
        expected_delivery_date: '2026-02-15',
      });
    });
  });

  it('calls onClose when cancel button is clicked', () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables form when isLoading is true', () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={true}
      />
    );

    const supplierSelect = screen.getByDisplayValue('Select a supplier');
    const locationSelect = screen.getByDisplayValue('Select a delivery location');
    const dateInput = screen.getByDisplayValue('2026-02-15');
    const convertButton = screen.getByRole('button', { name: /converting.../i });

    expect(supplierSelect).toBeDisabled();
    expect(locationSelect).toBeDisabled();
    expect(dateInput).toBeDisabled();
    expect(convertButton).toBeDisabled();
  });

  it('validates delivery date is not in the past', async () => {
    renderWithQueryClient(
      <ConvertToPOModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        requisition={mockRequisition}
        isLoading={false}
      />
    );

    // Select supplier and location
    const supplierSelect = screen.getByDisplayValue('Select a supplier');
    fireEvent.change(supplierSelect, { target: { value: '1' } });

    const locationSelect = screen.getByDisplayValue('Select a delivery location');
    fireEvent.change(locationSelect, { target: { value: '1' } });

    // Set delivery date to past
    const dateInput = screen.getByDisplayValue('2026-02-15');
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } });

    // Submit form
    const convertButton = screen.getByRole('button', { name: /convert to po/i });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(screen.getByText('Delivery date cannot be in the past')).toBeInTheDocument();
    });

    expect(mockOnConfirm).not.toHaveBeenCalled();
  });
});
