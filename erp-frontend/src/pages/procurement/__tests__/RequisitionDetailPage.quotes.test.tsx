import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RequisitionDetailPage from '../RequisitionDetailPage';
import { PurchaseRequisition } from '../../../types/procurement';

// Mock the hooks
vi.mock('../../../hooks/useProcurement', () => ({
  usePurchaseRequisition: () => ({
    data: {
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
      ],
      created_at: '2024-01-01T09:00:00Z',
      updated_at: '2024-01-02T10:00:00Z',
    },
    isLoading: false,
    error: null,
  }),
  useSubmitRequisition: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useApproveRequisition: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRejectRequisition: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useConvertRequisitionToPOWithDetails: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeletePurchaseRequisition: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCompareQuotes: () => ({
    data: null,
    isLoading: false,
  }),
  useConvertQuoteToPO: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useVerifyRequisitionInvoice: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useCreateQuotesFromRequisition: () => ({
    mutateAsync: vi.fn().mockResolvedValue([]),
    isPending: false,
  }),
  procurementKeys: {
    requisitions: () => [],
    requisitionsDetail: (id) => ['procurement', 'requisitions', 'detail', id],
    purchaseOrders: () => [],
  },
  quotesKeys: {
    quotes: () => [],
    quotesComparison: (id) => ['procurement', 'quotes', 'comparison', id],
  },
}));

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
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock the components that might not be available
vi.mock('../../../components/procurement/WorkflowStatusTracker', () => ({
  default: () => <div>WorkflowStatusTracker</div>,
}));

vi.mock('../../../components/procurement/NotificationManager', () => ({
  default: () => <div>NotificationManager</div>,
}));

vi.mock('../../../components/procurement/WorkflowStatusDisplay', () => ({
  default: () => <div>WorkflowStatusDisplay</div>,
}));

vi.mock('../../../components/procurement/ConvertToPOModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>ConvertToPOModal</div> : null),
}));

// Mock react-router-dom params
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
  };
});

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RequisitionDetailPage - Quote Request Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Request Quotes button for approved requisitions', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Request Quotes')).toBeInTheDocument();
    });
  });

  it('opens quote request form when Request Quotes button is clicked', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    await waitFor(() => {
      const requestQuotesButton = screen.getByText('Request Quotes');
      fireEvent.click(requestQuotesButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Request quotes from suppliers for PR-2024-001')).toBeInTheDocument();
    });
  });

  it('displays requisition information correctly', async () => {
    renderWithProviders(<RequisitionDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('PR-2024-001')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('IT')).toBeInTheDocument();
      expect(screen.getByText('Test requisition')).toBeInTheDocument();
    });
  });
});
