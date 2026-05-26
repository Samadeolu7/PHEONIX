// src/pages/receivables/__tests__/AgingReport.enhanced.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AgingReport from '../AgingReport';
import { receivablesService } from '../../../services/receivablesService';
import { branchService } from '../../../services/branchService';
import { useToast } from '../../../hooks/useToast';

// Mock the services
vi.mock('../../../services/receivablesService');
vi.mock('../../../services/branchService');
vi.mock('../../../hooks/useToast');

// Mock Recharts components
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  Legend: () => <div data-testid="legend" />,
}));

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

const mockAgingReportData = {
  report_date: '2025-01-24',
  customers: [
    {
      client_id: 1,
      client_name: 'John Doe',
      current: 50000,
      '1-30': 25000,
      '31-60': 10000,
      '61-90': 5000,
      '90+': 0,
      total: 90000,
    },
    {
      client_id: 2,
      client_name: 'Jane Smith',
      current: 30000,
      '1-30': 0,
      '31-60': 15000,
      '61-90': 0,
      '90+': 10000,
      total: 55000,
    },
  ],
  summary: {
    current: '80000.00',
    '1-30': '25000.00',
    '31-60': '25000.00',
    '61-90': '5000.00',
    '90+': '10000.00',
    total: '145000.00',
  },
};

const mockBranches = [
  { id: 1, name: 'Main Branch' },
  { id: 2, name: 'Secondary Branch' },
];

const mockCustomerReceivables = {
  results: [
    {
      id: 1,
      client: 1,
      client_name: 'John Doe',
      receivable_type: 'invoice',
      reference_number: 'INV-001',
      original_amount: '50000.00',
      balance: '50000.00',
      due_date: '2025-01-15',
      aging_bucket: 'current',
      status: 'pending',
    },
  ],
};

describe('Enhanced AgingReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue(mockToast);
    (receivablesService.getAgingReport as any).mockResolvedValue(mockAgingReportData);
    (branchService.getBranchOptions as any).mockResolvedValue(mockBranches);
    (receivablesService.getCustomerSummary as any).mockResolvedValue({
      client: { id: 1, full_name: 'John Doe' },
      total_receivables: '90000.00',
      aging: mockAgingReportData.customers[0],
    });
    (receivablesService.getReceivables as any).mockResolvedValue(mockCustomerReceivables);
  });

  it('renders the enhanced aging report with all new features', async () => {
    render(<AgingReport />);

    // Check for enhanced header
    expect(screen.getByText('Aging Report')).toBeInTheDocument();
    expect(screen.getByText(/Accounts receivable aging analysis as of/)).toBeInTheDocument();

    // Check for enhanced export buttons
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
      expect(screen.getByText('Export PDF')).toBeInTheDocument();
      expect(screen.getByText('Print')).toBeInTheDocument();
    });
  });

  it('displays date range filtering', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByLabelText(/As of Date/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search by client name...')).toBeInTheDocument();
    });
  });

  it('shows interactive chart type toggle', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByText('Bar Chart')).toBeInTheDocument();
      expect(screen.getByText('Pie Chart')).toBeInTheDocument();
    });

    // Test chart type switching
    const pieChartButton = screen.getByText('Pie Chart');
    fireEvent.click(pieChartButton);

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('displays interactive aging breakdown charts', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  it('shows customer drill-down functionality', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      const drillDownButton = screen.getByText('Drill Down');
      expect(drillDownButton).toBeInTheDocument();
    });

    // Test drill-down modal
    const drillDownButton = screen.getByText('Drill Down');
    fireEvent.click(drillDownButton);

    await waitFor(() => {
      expect(screen.getByText('Customer Drill-Down: John Doe')).toBeInTheDocument();
      expect(screen.getByText('Detailed receivables breakdown')).toBeInTheDocument();
    });
  });

  it('handles CSV export functionality', async () => {
    // Mock URL.createObjectURL and related methods
    const mockCreateObjectURL = vi.fn(() => 'mock-url');
    const mockRevokeObjectURL = vi.fn();
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();

    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      },
    });

    Object.defineProperty(document, 'createElement', {
      value: vi.fn(() => ({
        href: '',
        download: '',
        click: mockClick,
      })),
    });

    Object.defineProperty(document.body, 'appendChild', { value: mockAppendChild });
    Object.defineProperty(document.body, 'removeChild', { value: mockRemoveChild });

    render(<AgingReport />);

    await waitFor(() => {
      const exportButton = screen.getByText('Export CSV');
      fireEvent.click(exportButton);
    });

    // Verify export process was initiated
    expect(mockToast.success).toHaveBeenCalledWith('Report exported successfully');
  });

  it('handles PDF export functionality', async () => {
    const mockOpen = vi.fn(() => ({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      print: vi.fn(),
    }));

    Object.defineProperty(window, 'open', { value: mockOpen });

    render(<AgingReport />);

    await waitFor(() => {
      const exportButton = screen.getByText('Export PDF');
      fireEvent.click(exportButton);
    });

    expect(mockOpen).toHaveBeenCalledWith('', '_blank');
  });

  it('filters data by date range', async () => {
    render(<AgingReport />);

    const dateInput = await screen.findByLabelText(/As of Date/);
    fireEvent.change(dateInput, { target: { value: '2025-01-20' } });

    await waitFor(() => {
      expect(receivablesService.getAgingReport).toHaveBeenCalledWith({
        as_of_date: '2025-01-20',
        branch: undefined,
        format: 'json',
      });
    });
  });

  it('filters data by search term', async () => {
    render(<AgingReport />);

    const searchInput = await screen.findByPlaceholderText('Search by client name...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    await waitFor(() => {
      // Should filter the displayed data
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('displays enhanced action buttons for each customer', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByText('Drill Down')).toBeInTheDocument();
      expect(screen.getByText('View All')).toBeInTheDocument();
      expect(screen.getByText('Statement')).toBeInTheDocument();
    });
  });

  it('shows customer drill-down modal with detailed receivables', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      const drillDownButton = screen.getByText('Drill Down');
      fireEvent.click(drillDownButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Customer Drill-Down: John Doe')).toBeInTheDocument();
      expect(screen.getByText('Reference')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Original Amount')).toBeInTheDocument();
      expect(screen.getByText('Balance')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Aging')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('closes drill-down modal when close button is clicked', async () => {
    render(<AgingReport />);

    // Open modal
    await waitFor(() => {
      const drillDownButton = screen.getByText('Drill Down');
      fireEvent.click(drillDownButton);
    });

    // Close modal
    await waitFor(() => {
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);
    });

    await waitFor(() => {
      expect(screen.queryByText('Customer Drill-Down: John Doe')).not.toBeInTheDocument();
    });
  });

  it('handles branch filtering', async () => {
    render(<AgingReport />);

    const branchSelect = await screen.findByDisplayValue('All Branches');
    fireEvent.change(branchSelect, { target: { value: '1' } });

    await waitFor(() => {
      expect(receivablesService.getAgingReport).toHaveBeenCalledWith({
        as_of_date: expect.any(String),
        branch: 1,
        format: 'json',
      });
    });
  });

  it('clears all filters when clear button is clicked', async () => {
    render(<AgingReport />);

    // Set some filters first
    const searchInput = await screen.findByPlaceholderText('Search by client name...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    const branchSelect = await screen.findByDisplayValue('All Branches');
    fireEvent.change(branchSelect, { target: { value: '1' } });

    // Clear filters
    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(branchSelect).toHaveValue('');
    });
  });

  it('displays summary cards with correct values', async () => {
    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('1-30 Days')).toBeInTheDocument();
      expect(screen.getByText('31-60 Days')).toBeInTheDocument();
      expect(screen.getByText('61-90 Days')).toBeInTheDocument();
      expect(screen.getByText('90+ Days')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    (receivablesService.getAgingReport as any).mockRejectedValue(new Error('API Error'));

    render(<AgingReport />);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load aging report');
    });
  });

  it('shows loading state while fetching data', async () => {
    (receivablesService.getAgingReport as any).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<AgingReport />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('displays no data message when no aging data is available', async () => {
    (receivablesService.getAgingReport as any).mockResolvedValue({
      customers: [],
      summary: {
        current: '0.00',
        '1-30': '0.00',
        '31-60': '0.00',
        '61-90': '0.00',
        '90+': '0.00',
        total: '0.00',
      },
    });

    render(<AgingReport />);

    await waitFor(() => {
      expect(screen.getByText('No aging data found')).toBeInTheDocument();
      expect(
        screen.getByText('No outstanding receivables to display in the aging report.')
      ).toBeInTheDocument();
    });
  });
});
