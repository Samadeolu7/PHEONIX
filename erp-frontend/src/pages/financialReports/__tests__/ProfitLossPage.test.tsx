import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ProfitLossPage from '../ProfitLossPage';
import { useProfitLoss } from '../../../hooks/useProfitLoss';
import { useExpandedAccounts } from '../../../hooks/useExpandedAccounts';

// Mock the hooks
jest.mock('../../../hooks/useProfitLoss');
jest.mock('../../../hooks/useExpandedAccounts');

const mockUseProfitLoss = useProfitLoss as jest.MockedFunction<typeof useProfitLoss>;
const mockUseExpandedAccounts = useExpandedAccounts as jest.MockedFunction<
  typeof useExpandedAccounts
>;

// Mock data
const mockProfitLossData = {
  period: {
    start: '2024-01-01',
    end: '2024-01-26',
  },
  revenue: {
    total: '50000.00',
    accounts: [
      {
        code: '4000',
        name: 'Sales Revenue',
        account_type: 'INCOME' as const,
        level: 'CHILD' as const,
        debit: '0.00',
        credit: '50000.00',
        balance: '50000.00',
      },
    ],
  },
  expenses: {
    total: '30000.00',
    accounts: [
      {
        code: '5000',
        name: 'Cost of Goods Sold',
        account_type: 'EXPENSE' as const,
        level: 'CHILD' as const,
        debit: '30000.00',
        credit: '0.00',
        balance: '30000.00',
      },
    ],
  },
  net_profit: '20000.00',
  net_margin_percent: '40.00',
};

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ProfitLossPage', () => {
  beforeEach(() => {
    mockUseProfitLoss.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    mockUseExpandedAccounts.mockReturnValue({
      expandedAccounts: new Set(),
      toggleAccount: jest.fn(),
      expandAll: jest.fn(),
      collapseAll: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the page header correctly', () => {
    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: /profit & loss statement/i })).toBeInTheDocument();
    expect(screen.getByText(/analyze your company's profitability/i)).toBeInTheDocument();
  });

  it('displays loading state when data is loading', () => {
    mockUseProfitLoss.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText(/loading profit & loss statement/i)).toBeInTheDocument();
  });

  it('displays error state when there is an error', () => {
    const mockError = 'Failed to load profit & loss statement';
    mockUseProfitLoss.mockReturnValue({
      data: null,
      loading: false,
      error: mockError,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText(mockError)).toBeInTheDocument();
  });

  it('displays profit & loss data when loaded', () => {
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    // Check if revenue and expense data is displayed
    expect(screen.getByText('Sales Revenue')).toBeInTheDocument();
    expect(screen.getByText('Cost of Goods Sold')).toBeInTheDocument();

    // Check if totals are displayed
    expect(screen.getByText('50,000.00')).toBeInTheDocument();
    expect(screen.getByText('30,000.00')).toBeInTheDocument();
    expect(screen.getByText('20,000.00')).toBeInTheDocument();
  });

  it('shows profit in green when revenue exceeds expenses', () => {
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    const netProfitElement = screen.getByText('20,000.00');
    expect(netProfitElement).toHaveClass('text-green-600');
  });

  it('shows loss in red when expenses exceed revenue', () => {
    const lossData = {
      ...mockProfitLossData,
      revenue: { ...mockProfitLossData.revenue, total: '20000.00' },
      expenses: { ...mockProfitLossData.expenses, total: '30000.00' },
      net_profit: '-10000.00',
      net_margin_percent: '-50.00',
    };

    mockUseProfitLoss.mockReturnValue({
      data: lossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    const netLossElement = screen.getByText('-10,000.00');
    expect(netLossElement).toHaveClass('text-red-600');
  });

  it('displays comparative analysis when enabled', () => {
    const comparativeData = {
      ...mockProfitLossData,
      comparative: {
        period: {
          start: '2023-01-01',
          end: '2023-01-26',
        },
        revenue: '40000.00',
        expenses: '25000.00',
        net_profit: '15000.00',
        variance: {
          revenue: '10000.00',
          expenses: '5000.00',
          net_profit: '5000.00',
        },
      },
    };

    mockUseProfitLoss.mockReturnValue({
      data: comparativeData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText(/comparative analysis/i)).toBeInTheDocument();
    expect(screen.getByText('40,000.00')).toBeInTheDocument(); // Prior period revenue
  });

  it('calls refetch when retry button is clicked', async () => {
    const mockRefetch = jest.fn();
    mockUseProfitLoss.mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('calls exportReport when export button is clicked', async () => {
    const mockExportReport = jest.fn();
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: mockExportReport,
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);

    // Assuming export controls have PDF option
    const pdfOption = screen.getByText(/pdf/i);
    fireEvent.click(pdfOption);

    await waitFor(() => {
      expect(mockExportReport).toHaveBeenCalledWith('pdf');
    });
  });

  it('requires start date for profit & loss report', () => {
    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    const startDateInput = screen.getByLabelText(/start date/i);
    expect(startDateInput).toBeRequired();
  });

  it('handles filter changes correctly', async () => {
    const mockRefetch = jest.fn();
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: mockRefetch,
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    // Find and interact with filter controls
    const comparativeCheckbox = screen.getByLabelText(/comparative analysis/i);
    fireEvent.click(comparativeCheckbox);

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('displays net margin percentage correctly', () => {
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText('40.00%')).toBeInTheDocument();
  });

  it('displays empty state when no data is available', () => {
    mockUseProfitLoss.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText(/no profit & loss data/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    // Check for proper headings
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    // Check for proper sections
    expect(screen.getByLabelText(/report filters/i)).toBeInTheDocument();
  });

  it('shows refetching indicator when data is being updated', () => {
    mockUseProfitLoss.mockReturnValue({
      data: mockProfitLossData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: true,
    });

    render(
      <TestWrapper>
        <ProfitLossPage />
      </TestWrapper>
    );

    expect(screen.getByText(/updating report/i)).toBeInTheDocument();
  });
});
