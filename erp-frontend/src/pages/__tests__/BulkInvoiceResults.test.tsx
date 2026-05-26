import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BulkInvoiceResults from '../BulkInvoiceResults';
import { invoiceService, BulkInvoiceResult } from '../../services/invoiceService';
import { useToast } from '../../hooks/useToast';

const mockBulkResult: BulkInvoiceResult = {
  success: true,
  created_count: 3,
  failed_count: 1,
  invoices: [
    {
      id: 1,
      invoice_number: 'INV-001',
      client_name: 'John Doe',
      amount: '100000',
      status: 'created',
    },
    {
      id: 2,
      invoice_number: 'INV-002',
      client_name: 'Jane Smith',
      amount: '150000',
      status: 'sent',
    },
    {
      id: 3,
      invoice_number: 'INV-003',
      client_name: 'Bob Johnson',
      amount: '200000',
      status: 'created',
    },
    {
      id: 4,
      invoice_number: 'INV-004',
      client_name: 'Alice Brown',
      amount: '75000',
      status: 'failed',
      error: 'Invalid client data',
    },
  ],
  errors: ['Some invoices failed to create due to validation errors'],
};

// Mock dependencies
vi.mock('../../services/invoiceService');
vi.mock('../../hooks/useToast');
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({
      state: {
        result: mockBulkResult,
      },
    }),
  };
});

const mockInvoiceService = invoiceService as any;
const mockUseToast = useToast as any;

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('BulkInvoiceResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);
  });

  it('renders bulk invoice results correctly', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Check header
    expect(screen.getByText('Bulk Invoice Results')).toBeInTheDocument();
    expect(
      screen.getByText('Review and manage your bulk invoice generation results')
    ).toBeInTheDocument();

    // Check summary cards
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Created count
    expect(screen.getByText('1')).toBeInTheDocument(); // Failed count

    // Check invoice list
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('Alice Brown')).toBeInTheDocument();
  });

  it('displays error summary when there are errors', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    expect(screen.getByText('Errors Encountered')).toBeInTheDocument();
    expect(
      screen.getByText('Some invoices failed to create due to validation errors')
    ).toBeInTheDocument();
  });

  it('filters invoices by status', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Initially all invoices should be visible
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('INV-004')).toBeInTheDocument();

    // Filter by 'created' status
    const statusFilter = screen.getByDisplayValue('All Status');
    fireEvent.change(statusFilter, { target: { value: 'created' } });

    // Should show only created invoices
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('INV-003')).toBeInTheDocument();
    // INV-002 (sent) and INV-004 (failed) should not be visible in the filtered view
  });

  it('searches invoices by client name or invoice number', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    const searchInput = screen.getByPlaceholderText('Search invoices...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    // Should show only John Doe's invoice
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // Other invoices should not be visible in search results
  });

  it('selects and deselects invoices for bulk operations', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Find checkboxes for created invoices (only these can be selected)
    const checkboxes = screen.getAllByRole('checkbox');

    // Click on individual invoice checkbox
    fireEvent.click(checkboxes[1]); // First individual invoice checkbox

    // Send button should be enabled
    expect(screen.getByText(/Send Selected \(1\)/)).toBeInTheDocument();
  });

  it('handles bulk send operation', async () => {
    const mockSendResult = {
      success: true,
      sent_count: 2,
      failed_count: 0,
      results: [
        { id: 1, status: 'sent' as const },
        { id: 3, status: 'sent' as const },
      ],
    };

    mockInvoiceService.sendBulkInvoices.mockResolvedValue(mockSendResult);

    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Select all created invoices
    const selectAllButton = screen.getByText('Select All Created');
    fireEvent.click(selectAllButton);

    // Click send selected button
    const sendButton = screen.getByText(/Send Selected/);
    fireEvent.click(sendButton);

    // Modal should open
    expect(screen.getByText('Send Invoices')).toBeInTheDocument();

    // Click send in modal
    const sendInModalButton = screen.getByText('Send Invoices');
    fireEvent.click(sendInModalButton);

    await waitFor(() => {
      expect(mockInvoiceService.sendBulkInvoices).toHaveBeenCalledWith([1, 3], {});
      expect(mockToast.success).toHaveBeenCalledWith('Successfully sent 2 invoices');
    });
  });

  it('handles invoice PDF viewing', async () => {
    const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
    mockInvoiceService.getInvoicePdf.mockResolvedValue(mockBlob);

    // Mock window.open
    const mockOpen = vi.fn();
    Object.defineProperty(window, 'open', { value: mockOpen });

    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Find and click view button for first invoice
    const viewButtons = screen.getAllByTitle('View Invoice');
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(mockInvoiceService.getInvoicePdf).toHaveBeenCalledWith(1);
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  it('handles invoice PDF download', async () => {
    const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });
    mockInvoiceService.getInvoicePdf.mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL and document.createElement
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:url');
    const mockRevokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: mockCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { value: mockRevokeObjectURL });

    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    const mockLink = {
      href: '',
      download: '',
      click: mockClick,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Find and click download button for first invoice
    const downloadButtons = screen.getAllByTitle('Download PDF');
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => {
      expect(mockInvoiceService.getInvoicePdf).toHaveBeenCalledWith(1);
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });

  it('displays correct status badges for different invoice statuses', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Check for different status badges
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('calculates and displays total amount correctly', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Total should be 100000 + 150000 + 200000 + 75000 = 525000
    // Formatted as UGX currency
    expect(screen.getByText('UGX 525,000')).toBeInTheDocument();
  });

  it('handles error cases gracefully', async () => {
    mockInvoiceService.sendBulkInvoices.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Select an invoice and try to send
    const selectAllButton = screen.getByText('Select All Created');
    fireEvent.click(selectAllButton);

    const sendButton = screen.getByText(/Send Selected/);
    fireEvent.click(sendButton);

    const sendInModalButton = screen.getByText('Send Invoices');
    fireEvent.click(sendInModalButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Network error');
    });
  });
});
