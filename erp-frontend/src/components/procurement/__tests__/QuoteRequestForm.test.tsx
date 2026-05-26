import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import QuoteRequestForm from '../QuoteRequestForm';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock the hooks
vi.mock('../../../hooks/useSuppliers', () => ({
  useSuppliers: () => ({
    data: {
      results: [
        {
          id: 1,
          name: 'Test Supplier 1',
          contact_person: 'John Doe',
          email: 'john@supplier1.com',
          is_active: true,
        },
        {
          id: 2,
          name: 'Test Supplier 2',
          contact_person: 'Jane Smith',
          email: 'jane@supplier2.com',
          is_active: true,
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../../../hooks/useProcurement', () => ({
  useCreateQuotesFromRequisition: () => ({
    mutateAsync: vi.fn().mockResolvedValue([]),
    isPending: false,
  }),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockRequisition: PurchaseRequisition = {
  id: 1,
  pr_number: 'PR-2024-001',
  requested_by: 1,
  requested_by_name: 'Test User',
  department: 'IT',
  request_date: '2024-01-01',
  required_by_date: '2024-01-15',
  purpose: 'Test requisition',
  status: 'approved',
  approved_by: 2,
  approved_by_name: 'Manager',
  approved_at: '2024-01-02T10:00:00Z',
  rejection_reason: null,
  estimated_total: '1000.00',
  notes: 'Test notes',
  items: [
    {
      id: 1,
      item: 1,
      description: 'Test Item 1',
      quantity: '10',
      estimated_unit_price: '50.00',
      notes: 'Test item notes',
    },
    {
      id: 2,
      item: 2,
      description: 'Test Item 2',
      quantity: '5',
      estimated_unit_price: '100.00',
      notes: 'Another test item',
    },
  ],
  created_at: '2024-01-01T09:00:00Z',
  updated_at: '2024-01-02T10:00:00Z',
};

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
};

describe('QuoteRequestForm', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Request Quotes')).toBeInTheDocument();
    expect(screen.getByText('Request quotes from suppliers for PR-2024-001')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.queryByText('Request Quotes')).not.toBeInTheDocument();
  });

  it('displays requisition summary correctly', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('PR-2024-001')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Number of items
    expect(screen.getByText('₦1,000')).toBeInTheDocument(); // Total value
  });

  it('displays requisition items correctly', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Items to Quote (2)')).toBeInTheDocument();
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
    expect(screen.getByText('Test Item 2')).toBeInTheDocument();
    expect(screen.getByText('Qty: 10 • Est. Unit Price: ₦50')).toBeInTheDocument();
    expect(screen.getByText('Qty: 5 • Est. Unit Price: ₦100')).toBeInTheDocument();
  });

  it('displays suppliers for selection', async () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Supplier 1')).toBeInTheDocument();
      expect(screen.getByText('Test Supplier 2')).toBeInTheDocument();
      expect(screen.getByText('John Doe • john@supplier1.com')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith • jane@supplier2.com')).toBeInTheDocument();
    });
  });

  it('allows supplier selection', async () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    await waitFor(() => {
      const supplier1 = screen.getByText('Test Supplier 1');
      fireEvent.click(supplier1);
    });

    await waitFor(() => {
      expect(screen.getByText('Selected suppliers (1):')).toBeInTheDocument();
      expect(screen.getByText('Send Quote Requests (1)')).toBeInTheDocument();
    });
  });

  it('validates form before submission', async () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const submitButton = screen.getByText('Send Quote Requests (0)');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('At least one supplier must be selected')).toBeInTheDocument();
    });
  });

  it('calls onClose when cancel button is clicked', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('has correct default values', () => {
    renderWithQueryClient(
      <QuoteRequestForm
        requisition={mockRequisition}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const quoteDate = screen.getByDisplayValue(new Date().toISOString().split('T')[0]);
    expect(quoteDate).toBeInTheDocument();

    const paymentTerms = screen.getByDisplayValue('Net 30 Days');
    expect(paymentTerms).toBeInTheDocument();
  });
});
