// FinancialReportsFoundation Test
// Integration test to verify all shared foundation components work correctly for Trial Balance

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import TrialBalancePage from '../../../pages/financialReports/TrialBalancePage';

// Mock the financial reports service
vi.mock('../../../services/financialReportsService', () => ({
  financialReportsService: {
    getTrialBalance: vi.fn().mockResolvedValue({
      report_date: '2026-01-26',
      date_range: {
        start: '2026-01-01',
        end: '2026-01-26',
      },
      accounts: [
        {
          code: '1000',
          name: 'Assets',
          account_type: 'ASSET',
          level: 'PARENT',
          debit: '50000.00',
          credit: '0.00',
          balance: '50000.00',
          children: [
            {
              code: '1100',
              name: 'Current Assets',
              account_type: 'ASSET',
              level: 'CHILD',
              debit: '30000.00',
              credit: '0.00',
              balance: '30000.00',
            },
            {
              code: '1200',
              name: 'Fixed Assets',
              account_type: 'ASSET',
              level: 'CHILD',
              debit: '20000.00',
              credit: '0.00',
              balance: '20000.00',
            },
          ],
        },
        {
          code: '2000',
          name: 'Liabilities',
          account_type: 'LIABILITY',
          level: 'PARENT',
          debit: '0.00',
          credit: '30000.00',
          balance: '-30000.00',
          children: [
            {
              code: '2100',
              name: 'Current Liabilities',
              account_type: 'LIABILITY',
              level: 'CHILD',
              debit: '0.00',
              credit: '30000.00',
              balance: '-30000.00',
            },
          ],
        },
        {
          code: '3000',
          name: 'Equity',
          account_type: 'EQUITY',
          level: 'PARENT',
          debit: '0.00',
          credit: '20000.00',
          balance: '-20000.00',
        },
      ],
      totals: {
        total_debits: '50000.00',
        total_credits: '50000.00',
        difference: '0.00',
      },
      is_balanced: true,
    }),
    downloadReport: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock all Lucide React icons
vi.mock('lucide-react', () => ({
  Scale: () => <div data-testid="scale-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
  RotateCcw: () => <div data-testid="rotate-ccw-icon" />,
  Download: () => <div data-testid="download-icon" />,
  FileText: () => <div data-testid="file-text-icon" />,
  FileSpreadsheet: () => <div data-testid="file-spreadsheet-icon" />,
  Loader2: () => <div data-testid="loader2-icon" />,
  ChevronRight: () => <div data-testid="chevron-right-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Wifi: () => <div data-testid="wifi-icon" />,
  Lock: () => <div data-testid="lock-icon" />,
  Server: () => <div data-testid="server-icon" />,
  FileX: () => <div data-testid="file-x-icon" />,
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  RefreshCw: () => <div data-testid="refresh-cw-icon" />,
  BarChart3: () => <div data-testid="bar-chart3-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  PieChart: () => <div data-testid="pie-chart-icon" />,
}));

describe('Financial Reports Foundation - Trial Balance Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should render complete Trial Balance page with all components', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Check page header
    expect(screen.getByText('Trial Balance')).toBeInTheDocument();
    expect(
      screen.getByText('Verify the accuracy of accounting records and ensure debits equal credits')
    ).toBeInTheDocument();

    // Check report filters
    expect(screen.getByText('Report Filters')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Detail Level')).toBeInTheDocument();
    expect(screen.getByLabelText('Include Zero Balances')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Trial Balance Totals')).toBeInTheDocument();
    });

    // Check account hierarchy
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Liabilities')).toBeInTheDocument();
    expect(screen.getByText('Equity')).toBeInTheDocument();

    // Check totals
    expect(screen.getByText('50,000.00')).toBeInTheDocument(); // Total debits
    expect(screen.getByText('Trial Balance is Balanced ✓')).toBeInTheDocument();
  });

  it('should handle filter changes correctly', async () => {
    const { financialReportsService } = await import('../../../services/financialReportsService');

    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Trial Balance Totals')).toBeInTheDocument();
    });

    // Change detail level
    const detailLevelSelect = screen.getByLabelText('Detail Level');
    fireEvent.change(detailLevelSelect, { target: { value: 'detailed' } });

    // Should trigger a new API call with updated parameters
    await waitFor(() => {
      expect(financialReportsService.getTrialBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          detail_level: 'detailed',
        })
      );
    });
  });

  it('should handle account expansion and collapse', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Assets')).toBeInTheDocument();
    });

    // Initially, child accounts should not be visible
    expect(screen.queryByText('Current Assets')).not.toBeInTheDocument();
    expect(screen.queryByText('Fixed Assets')).not.toBeInTheDocument();

    // Find and click the expand button for Assets
    const expandButtons = screen.getAllByTestId('chevron-right-icon');
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0].closest('button')!);

      // Child accounts should now be visible
      await waitFor(() => {
        expect(screen.getByText('Current Assets')).toBeInTheDocument();
        expect(screen.getByText('Fixed Assets')).toBeInTheDocument();
      });
    }
  });

  it('should handle export functionality', async () => {
    const { financialReportsService } = await import('../../../services/financialReportsService');

    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for data to load and export controls to appear
    await waitFor(() => {
      expect(screen.getByText('Export:')).toBeInTheDocument();
    });

    // Click PDF export
    const pdfButton = screen.getByText('PDF');
    fireEvent.click(pdfButton);

    // Should call the export service
    await waitFor(() => {
      expect(financialReportsService.downloadReport).toHaveBeenCalledWith(
        'trial-balance',
        'pdf',
        expect.any(Object)
      );
    });
  });

  it('should display balance verification correctly', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Trial Balance is balanced')).toBeInTheDocument();
    });

    // Check balance verification indicator
    expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
    expect(screen.getByText('Trial Balance is Balanced ✓')).toBeInTheDocument();
  });

  it('should handle unbalanced trial balance', async () => {
    // Mock unbalanced data
    const unbalancedData = {
      report_date: '2026-01-26',
      date_range: {
        start: '2026-01-01',
        end: '2026-01-26',
      },
      accounts: [
        {
          code: '1000',
          name: 'Assets',
          account_type: 'ASSET',
          level: 'PARENT',
          debit: '50000.00',
          credit: '0.00',
          balance: '50000.00',
        },
      ],
      totals: {
        total_debits: '50000.00',
        total_credits: '49000.00',
        difference: '1000.00',
      },
      is_balanced: false,
    };

    const { financialReportsService } = await import('../../../services/financialReportsService');
    vi.mocked(financialReportsService.getTrialBalance).mockResolvedValueOnce(unbalancedData);

    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Out of balance by 1,000.00')).toBeInTheDocument();
    });

    // Check warning indicator
    expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    expect(screen.getByText('Trial Balance is Out of Balance ⚠️')).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    const { financialReportsService } = await import('../../../services/financialReportsService');
    vi.mocked(financialReportsService.getTrialBalance).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Should show error display
    await waitFor(() => {
      expect(screen.getByText('Network Error')).toBeInTheDocument();
    });

    // Should show retry button
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('should format currency values correctly', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Trial Balance Totals')).toBeInTheDocument();
    });

    // Check formatted currency values
    expect(screen.getByText('50,000.00')).toBeInTheDocument(); // Total debits/credits
    expect(screen.getByText('0.00')).toBeInTheDocument(); // Difference
  });

  it('should show responsive design elements', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TrialBalancePage />
      </QueryClientProvider>
    );

    // Check responsive classes are present
    const mainContainer = document.querySelector('.max-w-7xl');
    expect(mainContainer).toBeInTheDocument();

    const gridContainer = document.querySelector('.grid-cols-1.md\\:grid-cols-3');
    expect(gridContainer).toBeInTheDocument();
  });
});
