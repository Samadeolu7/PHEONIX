import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import QuoteComparisonPage from '../QuoteComparisonPage';
import * as procurementHooks from '../../../hooks/useProcurement';

// Mock the hooks
vi.mock('../../../hooks/useProcurement');
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockQuoteComparison = {
  requisition: 1,
  quotes: [
    {
      id: 1,
      quote_number: 'Q-2024-001',
      supplier: 1,
      supplier_name: 'Supplier A',
      quote_date: '2024-01-15',
      valid_until: '2024-02-15',
      status: 'received',
      payment_terms: 'Net 30',
      delivery_terms: 'FOB Origin',
      total_amount: '1000.00',
      notes: 'Test quote',
      items: [
        {
          id: 1,
          item: 1,
          item_name: 'Test Item',
          description: 'Test item description',
          quantity: '10',
          unit_price: '100.00',
          total_price: '1000.00',
          lead_time_days: 7,
        },
      ],
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 2,
      quote_number: 'Q-2024-002',
      supplier: 2,
      supplier_name: 'Supplier B',
      quote_date: '2024-01-16',
      valid_until: '2024-02-16',
      status: 'received',
      payment_terms: 'Net 15',
      delivery_terms: 'FOB Destination',
      total_amount: '950.00',
      notes: 'Better price',
      items: [
        {
          id: 2,
          item: 1,
          item_name: 'Test Item',
          description: 'Test item description',
          quantity: '10',
          unit_price: '95.00',
          total_price: '950.00',
          lead_time_days: 10,
        },
      ],
      created_at: '2024-01-16T10:00:00Z',
      updated_at: '2024-01-16T10:00:00Z',
    },
  ],
  comparison_matrix: [
    {
      item_id: 1,
      item_name: 'Test Item',
      quantity: '10',
      quotes: [
        {
          quote_id: 1,
          supplier_name: 'Supplier A',
          unit_price: '100.00',
          total_price: '1000.00',
          lead_time_days: 7,
        },
        {
          quote_id: 2,
          supplier_name: 'Supplier B',
          unit_price: '95.00',
          total_price: '950.00',
          lead_time_days: 10,
        },
      ],
      lowest_price_quote_id: 2,
    },
  ],
};

const mockRequisition = {
  id: 1,
  pr_number: 'PR-2024-001',
  requested_by: 1,
  requested_by_name: 'Test User',
  department: 'IT',
  request_date: '2024-01-10',
  required_by_date: '2024-01-20',
  purpose: 'Test requisition',
  status: 'approved',
  approved_by: 2,
  approved_by_name: 'Manager',
  approved_at: '2024-01-12T10:00:00Z',
  estimated_total: '1000.00',
  items: [],
  created_at: '2024-01-10T10:00:00Z',
  updated_at: '2024-01-12T10:00:00Z',
};

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('QuoteComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the hooks with default implementations
    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: mockQuoteComparison,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(procurementHooks.usePurchaseRequisition).mockReturnValue({
      data: mockRequisition,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(procurementHooks.useSelectQuote).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  it('renders quote comparison page with quotes', async () => {
    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('Quote Comparison')).toBeInTheDocument();
      expect(screen.getByText('Supplier A')).toBeInTheDocument();
      expect(screen.getByText('Supplier B')).toBeInTheDocument();
    });
  });

  it('displays quote totals and savings calculation', async () => {
    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('$950.00')).toBeInTheDocument(); // Lowest quote
      expect(screen.getByText('$1,000.00')).toBeInTheDocument(); // Highest quote
      expect(screen.getByText('$50.00')).toBeInTheDocument(); // Savings
    });
  });

  it('highlights the best price quote', async () => {
    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('Best Price')).toBeInTheDocument();
      expect(screen.getByText('Lowest Price')).toBeInTheDocument();
    });
  });

  it('shows item-by-item comparison', async () => {
    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('Item-by-Item Comparison')).toBeInTheDocument();
      expect(screen.getByText('Test Item')).toBeInTheDocument();
      expect(screen.getByText('$95.00')).toBeInTheDocument(); // Best unit price
      expect(screen.getByText('$100.00')).toBeInTheDocument(); // Higher unit price
    });
  });

  it('displays loading state', () => {
    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    renderWithProviders(<QuoteComparisonPage />);

    expect(screen.getByText('Loading quote comparison...')).toBeInTheDocument();
  });

  it('displays error state', () => {
    const error = new Error('Failed to load quotes');
    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    } as any);

    renderWithProviders(<QuoteComparisonPage />);

    expect(screen.getByText('Failed to load quote comparison')).toBeInTheDocument();
  });

  it('displays no quotes message when no quotes available', () => {
    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: { requisition: 1, quotes: [], comparison_matrix: [] },
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders(<QuoteComparisonPage />);

    expect(screen.getByText('No Quotes Available')).toBeInTheDocument();
  });

  it('shows expired quote warning when quotes are expired', async () => {
    const expiredQuoteComparison = {
      ...mockQuoteComparison,
      quotes: [
        {
          ...mockQuoteComparison.quotes[0],
          valid_until: '2023-01-01', // Expired date
        },
        mockQuoteComparison.quotes[1],
      ],
    };

    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: expiredQuoteComparison,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('Some quotes have expired')).toBeInTheDocument();
    });
  });

  it('shows selected quote information when a quote is selected', async () => {
    const selectedQuoteComparison = {
      ...mockQuoteComparison,
      quotes: [
        {
          ...mockQuoteComparison.quotes[0],
          status: 'selected',
        },
        mockQuoteComparison.quotes[1],
      ],
    };

    vi.mocked(procurementHooks.useCompareQuotes).mockReturnValue({
      data: selectedQuoteComparison,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders(<QuoteComparisonPage />);

    await waitFor(() => {
      expect(screen.getByText('Quote Selected: Supplier A')).toBeInTheDocument();
      expect(screen.getByText('Convert to PO')).toBeInTheDocument();
    });
  });
});
