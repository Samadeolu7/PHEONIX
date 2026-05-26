import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import EntitlementsList from '../EntitlementsList';
import { entitlementService } from '../../services/entitlementService';
import { useToast } from '../../hooks/useToast';

// Mock the services and hooks
jest.mock('../../services/entitlementService');
jest.mock('../../hooks/useToast');

const mockEntitlementService = entitlementService as jest.Mocked<typeof entitlementService>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

// Mock UnifiedPaymentModal
jest.mock('../../components/modals/UnifiedPaymentModal', () => {
  return function MockUnifiedPaymentModal({ isOpen, onClose, onPaymentRecorded }: any) {
    if (!isOpen) return null;
    return (
      <div data-testid="unified-payment-modal">
        <button onClick={onClose}>Close</button>
        <button onClick={onPaymentRecorded}>Record Payment</button>
      </div>
    );
  };
});

const mockEntitlements = [
  {
    id: 1,
    client: {
      id: 1,
      full_name: 'John Doe',
    },
    invoice: {
      id: 1,
      invoice_number: 'INV-001',
    },
    fee_structure: {
      id: 1,
      name: 'Grade 10 - Term 1 Fees',
    },
    total_amount: '250000.00',
    amount_paid: '125000.00',
    balance: '125000.00',
    payment_percentage: 50.0,
    minimum_required: '125000.00',
    payment_term_type: 'minimum_deposit' as const,
    status: 'active' as const,
    current_access_level: 'partial' as const,
    valid_from: '2025-01-01',
    valid_until: '2025-04-30',
  },
  {
    id: 2,
    client: {
      id: 2,
      full_name: 'Jane Smith',
    },
    invoice: {
      id: 2,
      invoice_number: 'INV-002',
    },
    fee_structure: {
      id: 1,
      name: 'Grade 10 - Term 1 Fees',
    },
    total_amount: '250000.00',
    amount_paid: '250000.00',
    balance: '0.00',
    payment_percentage: 100.0,
    minimum_required: '125000.00',
    payment_term_type: 'full_payment' as const,
    status: 'completed' as const,
    current_access_level: 'full' as const,
    valid_from: '2025-01-01',
    valid_until: '2025-04-30',
  },
];

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('EntitlementsList', () => {
  const mockToast = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);

    mockEntitlementService.getEntitlements.mockResolvedValue({
      results: mockEntitlements,
      count: 2,
      next: null,
      previous: null,
    });
  });

  it('renders entitlements list correctly', async () => {
    renderWithProviders(<EntitlementsList />);

    // Check if loading state is shown initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for entitlements to load
    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Check if entitlements are displayed
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Grade 10 - Term 1 Fees')).toBeInTheDocument();
  });

  it('displays payment progress correctly', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Check payment percentages
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('displays access level badges correctly', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Check access level badges
    expect(screen.getByText('Partial Access')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();
  });

  it('displays status badges correctly', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Check status badges
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('handles search functionality', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Find search input and enter search term
    const searchInput = screen.getByPlaceholderText('Search by client name, invoice number...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    // Click search button
    const searchButton = screen.getByText('Apply Filters');
    fireEvent.click(searchButton);

    // Verify service was called with search term
    await waitFor(() => {
      expect(mockEntitlementService.getEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'John',
          page: 1,
        })
      );
    });
  });

  it('handles status filter', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Find status filter dropdown
    const statusFilter = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusFilter, { target: { value: 'active' } });

    // Click apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    // Verify service was called with status filter
    await waitFor(() => {
      expect(mockEntitlementService.getEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          page: 1,
        })
      );
    });
  });

  it('handles access level filter', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Find access level filter dropdown
    const accessLevelFilter = screen.getByDisplayValue('All Access Levels');
    fireEvent.change(accessLevelFilter, { target: { value: 'partial' } });

    // Click apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    // Verify service was called with access level filter
    await waitFor(() => {
      expect(mockEntitlementService.getEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          current_access_level: 'partial',
          page: 1,
        })
      );
    });
  });

  it('opens payment modal when record payment button is clicked', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Find and click the record payment button for the first entitlement (with balance > 0)
    const paymentButtons = screen.getAllByTitle('Record Payment');
    fireEvent.click(paymentButtons[0]);

    // Check if payment modal is opened
    expect(screen.getByTestId('unified-payment-modal')).toBeInTheDocument();
  });

  it('handles payment recording success', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Open payment modal
    const paymentButtons = screen.getAllByTitle('Record Payment');
    fireEvent.click(paymentButtons[0]);

    // Simulate successful payment recording
    const recordPaymentButton = screen.getByText('Record Payment');
    fireEvent.click(recordPaymentButton);

    // Check if success message is shown and modal is closed
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Payment recorded successfully');
      expect(screen.queryByTestId('unified-payment-modal')).not.toBeInTheDocument();
    });

    // Verify entitlements are refetched
    expect(mockEntitlementService.getEntitlements).toHaveBeenCalledTimes(2);
  });

  it('displays empty state when no entitlements found', async () => {
    mockEntitlementService.getEntitlements.mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('No entitlements found')).toBeInTheDocument();
      expect(screen.getByText('No fee entitlements have been created yet')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockEntitlementService.getEntitlements.mockRejectedValue(new Error('API Error'));

    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load entitlements');
    });
  });

  it('displays correct currency formatting', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Check if amounts are formatted correctly (UGX currency)
    expect(screen.getByText(/UGX\s*125,000/)).toBeInTheDocument();
    expect(screen.getByText(/UGX\s*250,000/)).toBeInTheDocument();
  });

  it('shows only record payment button for entitlements with balance', async () => {
    renderWithProviders(<EntitlementsList />);

    await waitFor(() => {
      expect(screen.getByText('Fee Entitlements')).toBeInTheDocument();
    });

    // Should have 1 record payment button (only for John Doe with balance > 0)
    const paymentButtons = screen.getAllByTitle('Record Payment');
    expect(paymentButtons).toHaveLength(1);

    // Should have 2 view details buttons (for both entitlements)
    const viewButtons = screen.getAllByTitle('View Details');
    expect(viewButtons).toHaveLength(2);
  });
});
