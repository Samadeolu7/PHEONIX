import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EntitlementDashboard from '../EntitlementDashboard';
import { entitlementService } from '../../services/entitlementService';
import { useToast } from '../../hooks/useToast';

// Mock the services and hooks
vi.mock('../../services/entitlementService');
vi.mock('../../hooks/useToast');

const mockEntitlementService = entitlementService as any;
const mockUseToast = useToast as any;

// Mock UnifiedPaymentModal
vi.mock('../../components/modals/UnifiedPaymentModal', () => {
  return {
    default: function MockUnifiedPaymentModal({ isOpen, onClose, onPaymentRecorded }: any) {
      if (!isOpen) return null;
      return (
        <div data-testid="payment-modal">
          <button onClick={onPaymentRecorded}>Record Payment</button>
          <button onClick={onClose}>Close</button>
        </div>
      );
    },
  };
});

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

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
      name: 'Grade 10 Fees',
    },
    total_amount: '100000.00',
    amount_paid: '50000.00',
    balance: '50000.00',
    payment_percentage: 50.0,
    minimum_required: '25000.00',
    payment_term_type: 'minimum_deposit' as const,
    status: 'active' as const,
    current_access_level: 'partial' as const,
    valid_from: '2025-01-01',
    valid_until: '2025-12-31',
    allocated_units: '100.00',
    consumed_units: '25.00',
  },
];

const mockServiceAccess = {
  can_access: true,
  reason: '',
  payment_percentage: 50.0,
  amount_paid: '50000.00',
  balance: '50000.00',
  current_access_level: 'partial' as const,
  allowed_services: ['classes', 'library'],
  restricted_services: ['exams', 'graduation'],
};

const createWrapper = (initialEntries = ['/incomes/entitlements/dashboard?client=1']) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('EntitlementDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);
    mockEntitlementService.getEntitlements.mockResolvedValue({
      results: mockEntitlements,
      count: 1,
      next: null,
      previous: null,
    });
    mockEntitlementService.checkServiceAccess.mockResolvedValue(mockServiceAccess);
  });

  it('renders dashboard with client entitlements', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    // Check loading state initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('My Entitlements Dashboard')).toBeInTheDocument();
    });

    // Check if entitlements are displayed
    expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('displays overview cards with correct totals', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('My Entitlements Dashboard')).toBeInTheDocument();
    });

    // Check overview cards
    expect(screen.getByText('Total Amount')).toBeInTheDocument();
    expect(screen.getByText('Amount Paid')).toBeInTheDocument();
    expect(screen.getByText('Outstanding Balance')).toBeInTheDocument();
    expect(screen.getByText('Overall Progress')).toBeInTheDocument();
  });

  it('shows active entitlements section', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Active Entitlements (1)')).toBeInTheDocument();
    });

    // Check entitlement details
    expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    expect(screen.getByText('Invoice: INV-001')).toBeInTheDocument();
    expect(screen.getByText('Partial Access')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('displays service access matrix', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Service Access Matrix')).toBeInTheDocument();
    });

    // Wait for service access checks to complete
    await waitFor(() => {
      expect(screen.getByText('Class Attendance')).toBeInTheDocument();
    });
  });

  it('opens payment modal when make payment is clicked', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Make Payment')).toBeInTheDocument();
    });

    // Click make payment button
    fireEvent.click(screen.getByText('Make Payment'));

    // Check if payment modal opens
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument();
  });

  it('handles payment recording successfully', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Make Payment')).toBeInTheDocument();
    });

    // Open payment modal
    fireEvent.click(screen.getByText('Make Payment'));

    // Record payment
    fireEvent.click(screen.getByText('Record Payment'));

    // Check if success message is shown
    expect(mockToast.success).toHaveBeenCalledWith('Payment recorded successfully');
  });

  it('handles refresh functionality', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    // Click refresh button
    fireEvent.click(screen.getByText('Refresh'));

    // Check if entitlements are fetched again
    expect(mockEntitlementService.getEntitlements).toHaveBeenCalledTimes(2);
  });

  it('shows error when client ID is missing', async () => {
    const Wrapper = createWrapper(['/incomes/entitlements/dashboard']);

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    // Check if error is shown
    expect(mockToast.error).toHaveBeenCalledWith('Client ID is required');
  });

  it('displays no entitlements message when list is empty', async () => {
    mockEntitlementService.getEntitlements.mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No entitlements found')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "You don't have any entitlements yet. Contact your administrator for assistance."
      )
    ).toBeInTheDocument();
  });

  it('displays no active entitlements message when all are inactive', async () => {
    const inactiveEntitlements = [
      {
        ...mockEntitlements[0],
        status: 'suspended' as const,
      },
    ];

    mockEntitlementService.getEntitlements.mockResolvedValue({
      results: inactiveEntitlements,
      count: 1,
      next: null,
      previous: null,
    });

    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No Active Entitlements')).toBeInTheDocument();
    });

    expect(
      screen.getByText("You don't have any active entitlements at the moment.")
    ).toBeInTheDocument();
  });

  it('handles service access check errors gracefully', async () => {
    mockEntitlementService.checkServiceAccess.mockRejectedValue(new Error('Access check failed'));

    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Service Access Matrix')).toBeInTheDocument();
    });

    // Service access should still be displayed even if some checks fail
    await waitFor(() => {
      expect(screen.getByText('Loading Service Access')).toBeInTheDocument();
    });
  });

  it('displays correct payment progress indicators', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });

    // Check payment progress bar
    const progressBar = screen.getByRole('progressbar', { hidden: true });
    expect(progressBar).toHaveStyle('width: 50%');
  });

  it('shows correct access level badges', async () => {
    const Wrapper = createWrapper();

    render(<EntitlementDashboard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Partial Access')).toBeInTheDocument();
    });

    // Check if the badge has correct styling
    const badge = screen.getByText('Partial Access');
    expect(badge).toHaveClass('text-yellow-600');
  });
});
