import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import TrialBalancePage from '../TrialBalancePage';
import { useTrialBalance } from '../../../hooks/useTrialBalance';
import { useExpandedAccounts } from '../../../hooks/useExpandedAccounts';

// Mock the hooks
vi.mock('../../../hooks/useTrialBalance');
vi.mock('../../../hooks/useExpandedAccounts');

const mockUseTrialBalance = useTrialBalance as vi.MockedFunction<typeof useTrialBalance>;
const mockUseExpandedAccounts = useExpandedAccounts as vi.MockedFunction<
  typeof useExpandedAccounts
>;

// Mock data
const mockTrialBalanceData = {
  report_date: '2024-01-26',
  date_range: {
    start: '2024-01-01',
    end: '2024-01-26',
  },
  accounts: [
    {
      code: '1000',
      name: 'Cash',
      account_type: 'ASSET' as const,
      level: 'CHILD' as const,
      debit: '10000.00',
      credit: '0.00',
      balance: '10000.00',
    },
    {
      code: '2000',
      name: 'Accounts Payable',
      account_type: 'LIABILITY' as const,
      level: 'CHILD' as const,
      debit: '0.00',
      credit: '5000.00',
      balance: '-5000.00',
    },
  ],
  totals: {
    total_debits: '10000.00',
    total_credits: '10000.00',
    difference: '0.00',
  },
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

describe('TrialBalancePage', () => {
  beforeEach(() => {
    mockUseTrialBalance.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    mockUseExpandedAccounts.mockReturnValue({
      expandedAccounts: new Set(),
      toggleAccount: vi.fn(),
      expandAll: vi.fn(),
      collapseAll: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page header correctly', () => {
    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: /trial balance/i })).toBeInTheDocument();
    expect(screen.getByText(/verify the accuracy of accounting records/i)).toBeInTheDocument();
  });

  it('displays loading state when data is loading', () => {
    mockUseTrialBalance.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(/loading trial balance/i)).toBeInTheDocument();
  });

  it('displays error state when there is an error', () => {
    const mockError = 'Failed to load trial balance';
    mockUseTrialBalance.mockReturnValue({
      data: null,
      loading: false,
      error: mockError,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(mockError)).toBeInTheDocument();
  });

  it('displays trial balance data when loaded', () => {
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    // Check if account data is displayed
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Accounts Payable')).toBeInTheDocument();

    // Check if totals are displayed
    expect(screen.getByText('10,000.00')).toBeInTheDocument();
    expect(screen.getByText('Trial Balance is Balanced ✓')).toBeInTheDocument();
  });

  it('shows balance verification status correctly', () => {
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(/trial balance is balanced/i)).toBeInTheDocument();
  });

  it('shows unbalanced status when trial balance is out of balance', () => {
    const unbalancedData = {
      ...mockTrialBalanceData,
      totals: {
        total_debits: '10000.00',
        total_credits: '9000.00',
        difference: '1000.00',
      },
      is_balanced: false,
    };

    mockUseTrialBalance.mockReturnValue({
      data: unbalancedData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(/out of balance by 1,000.00/i)).toBeInTheDocument();
  });

  it('calls refetch when retry button is clicked', async () => {
    const mockRefetch = vi.fn();
    mockUseTrialBalance.mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('calls exportReport when export button is clicked', async () => {
    const mockExportReport = vi.fn();
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: mockExportReport,
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
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
    const mockRefetch = vi.fn();
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: mockRefetch,
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    // Find and interact with filter controls
    const detailLevelSelect = screen.getByLabelText(/detail level/i);
    fireEvent.change(detailLevelSelect, { target: { value: 'detailed' } });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('displays empty state when no data is available', () => {
    mockUseTrialBalance.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(/no trial balance data/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: false,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    // Check for proper headings
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    // Check for proper sections
    expect(screen.getByLabelText(/report filters/i)).toBeInTheDocument();

    // Check for proper status indicators
    const balanceStatus = screen.getByRole('status');
    expect(balanceStatus).toBeInTheDocument();
  });

  it('shows refetching indicator when data is being updated', () => {
    mockUseTrialBalance.mockReturnValue({
      data: mockTrialBalanceData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      exportReport: vi.fn(),
      isRefetching: true,
    });

    render(
      <TestWrapper>
        <TrialBalancePage />
      </TestWrapper>
    );

    expect(screen.getByText(/updating report/i)).toBeInTheDocument();
  });
});
