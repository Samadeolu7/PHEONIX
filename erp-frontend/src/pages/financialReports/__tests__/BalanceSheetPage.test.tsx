import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import BalanceSheetPage from '../BalanceSheetPage';
import { useBalanceSheet } from '../../../hooks/useBalanceSheet';
import { useExpandedAccounts } from '../../../hooks/useExpandedAccounts';

// Mock the hooks
jest.mock('../../../hooks/useBalanceSheet');
jest.mock('../../../hooks/useExpandedAccounts');

const mockUseBalanceSheet = useBalanceSheet as jest.MockedFunction<typeof useBalanceSheet>;
const mockUseExpandedAccounts = useExpandedAccounts as jest.MockedFunction<
  typeof useExpandedAccounts
>;

// Mock data
const mockBalanceSheetData = {
  as_of_date: '2024-01-26',
  assets: {
    current: {
      total: '25000.00',
      accounts: [
        {
          code: '1000',
          name: 'Cash',
          account_type: 'ASSET' as const,
          level: 'CHILD' as const,
          debit: '15000.00',
          credit: '0.00',
          balance: '15000.00',
        },
        {
          code: '1200',
          name: 'Accounts Receivable',
          account_type: 'ASSET' as const,
          level: 'CHILD' as const,
          debit: '10000.00',
          credit: '0.00',
          balance: '10000.00',
        },
      ],
    },
    non_current: {
      total: '50000.00',
      accounts: [
        {
          code: '1500',
          name: 'Equipment',
          account_type: 'ASSET' as const,
          level: 'CHILD' as const,
          debit: '50000.00',
          credit: '0.00',
          balance: '50000.00',
        },
      ],
    },
    total: '75000.00',
  },
  liabilities: {
    current: {
      total: '15000.00',
      accounts: [
        {
          code: '2000',
          name: 'Accounts Payable',
          account_type: 'LIABILITY' as const,
          level: 'CHILD' as const,
          debit: '0.00',
          credit: '15000.00',
          balance: '-15000.00',
        },
      ],
    },
    non_current: {
      total: '20000.00',
      accounts: [
        {
          code: '2500',
          name: 'Long-term Debt',
          account_type: 'LIABILITY' as const,
          level: 'CHILD' as const,
          debit: '0.00',
          credit: '20000.00',
          balance: '-20000.00',
        },
      ],
    },
    total: '35000.00',
  },
  equity: {
    total: '40000.00',
    accounts: [
      {
        code: '3000',
        name: "Owner's Equity",
        account_type: 'EQUITY' as const,
        level: 'CHILD' as const,
        debit: '0.00',
        credit: '40000.00',
        balance: '-40000.00',
      },
    ],
  },
  total_liabilities_equity: '75000.00',
  is_balanced: true,
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

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    mockUseBalanceSheet.mockReturnValue({
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
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: /balance sheet/i })).toBeInTheDocument();
    expect(screen.getByText(/analyze.*financial position/i)).toBeInTheDocument();
  });

  it('displays loading state when data is loading', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/loading balance sheet/i)).toBeInTheDocument();
  });

  it('displays error state when there is an error', () => {
    const mockError = 'Failed to load balance sheet';
    mockUseBalanceSheet.mockReturnValue({
      data: null,
      loading: false,
      error: mockError,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(mockError)).toBeInTheDocument();
  });

  it('displays balance sheet data when loaded', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    // Check if asset accounts are displayed
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument();
    expect(screen.getByText('Equipment')).toBeInTheDocument();

    // Check if liability accounts are displayed
    expect(screen.getByText('Accounts Payable')).toBeInTheDocument();
    expect(screen.getByText('Long-term Debt')).toBeInTheDocument();

    // Check if equity accounts are displayed
    expect(screen.getByText("Owner's Equity")).toBeInTheDocument();
  });

  it('shows balance verification status correctly', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/balance sheet is balanced/i)).toBeInTheDocument();
  });

  it('shows unbalanced status when balance sheet is out of balance', () => {
    const unbalancedData = {
      ...mockBalanceSheetData,
      total_liabilities_equity: '70000.00',
      is_balanced: false,
    };

    mockUseBalanceSheet.mockReturnValue({
      data: unbalancedData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/balance sheet is out of balance/i)).toBeInTheDocument();
  });

  it('displays current and non-current categorization', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/current assets/i)).toBeInTheDocument();
    expect(screen.getByText(/non-current assets/i)).toBeInTheDocument();
    expect(screen.getByText(/current liabilities/i)).toBeInTheDocument();
    expect(screen.getByText(/non-current liabilities/i)).toBeInTheDocument();
  });

  it('displays comparative analysis when enabled', () => {
    const comparativeData = {
      ...mockBalanceSheetData,
      comparative: {
        as_of_date: '2023-01-26',
        assets: { total: '70000.00' },
        liabilities: { total: '30000.00' },
        equity: { total: '40000.00' },
        variance: {
          assets: '5000.00',
          liabilities: '5000.00',
          equity: '0.00',
        },
      },
    };

    mockUseBalanceSheet.mockReturnValue({
      data: comparativeData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/comparative analysis/i)).toBeInTheDocument();
    expect(screen.getByText('70,000.00')).toBeInTheDocument(); // Prior period assets
  });

  it('calls refetch when retry button is clicked', async () => {
    const mockRefetch = jest.fn();
    mockUseBalanceSheet.mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('calls exportReport when export button is clicked', async () => {
    const mockExportReport = jest.fn();
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: mockExportReport,
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
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

  it('handles filter changes correctly', async () => {
    const mockRefetch = jest.fn();
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: mockRefetch,
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    // Find and interact with filter controls
    const asOfDateInput = screen.getByLabelText(/as of date/i);
    fireEvent.change(asOfDateInput, { target: { value: '2024-01-31' } });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('displays totals correctly', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    // Check asset totals
    expect(screen.getByText('75,000.00')).toBeInTheDocument(); // Total assets
    expect(screen.getByText('25,000.00')).toBeInTheDocument(); // Current assets
    expect(screen.getByText('50,000.00')).toBeInTheDocument(); // Non-current assets

    // Check liability totals
    expect(screen.getByText('35,000.00')).toBeInTheDocument(); // Total liabilities
    expect(screen.getByText('15,000.00')).toBeInTheDocument(); // Current liabilities
    expect(screen.getByText('20,000.00')).toBeInTheDocument(); // Non-current liabilities

    // Check equity total
    expect(screen.getByText('40,000.00')).toBeInTheDocument(); // Total equity
  });

  it('displays empty state when no data is available', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/no balance sheet data/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    // Check for proper headings
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    // Check for proper sections
    expect(screen.getByLabelText(/report filters/i)).toBeInTheDocument();
  });

  it('shows refetching indicator when data is being updated', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: true,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    expect(screen.getByText(/updating report/i)).toBeInTheDocument();
  });

  it('verifies balance equation (Assets = Liabilities + Equity)', () => {
    mockUseBalanceSheet.mockReturnValue({
      data: mockBalanceSheetData,
      loading: false,
      error: null,
      refetch: jest.fn(),
      exportReport: jest.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <BalanceSheetPage />
      </TestWrapper>
    );

    // The balance equation should be verified
    // Assets (75,000) = Liabilities (35,000) + Equity (40,000)
    expect(screen.getByText(/balance equation verified/i)).toBeInTheDocument();
  });
});
