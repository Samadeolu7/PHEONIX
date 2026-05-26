import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BulkInvoiceResults from '../BulkInvoiceResults';
import { BulkInvoiceResult } from '../../services/invoiceService';

// Mock hooks
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('../../services/invoiceService', () => ({
  invoiceService: {
    sendBulkInvoices: vi.fn(),
    getInvoicePdf: vi.fn(),
  },
}));

const mockBulkResult: BulkInvoiceResult = {
  success: true,
  created_count: 2,
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
      amount: '75000',
      status: 'failed',
      error: 'Invalid client data',
    },
  ],
  errors: ['Some invoices failed to create'],
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

describe('BulkInvoiceResults Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the bulk invoice results page with correct data', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Check that the page renders
    expect(screen.getByText('Bulk Invoice Results')).toBeInTheDocument();
    expect(
      screen.getByText('Review and manage your bulk invoice generation results')
    ).toBeInTheDocument();

    // Check summary cards
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Created count
    expect(screen.getByText('1')).toBeInTheDocument(); // Failed count

    // Check that invoices are displayed
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('INV-002')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('INV-003')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    // Check error section
    expect(screen.getByText('Errors Encountered')).toBeInTheDocument();
    expect(screen.getByText('Some invoices failed to create')).toBeInTheDocument();
  });

  it('displays correct total amount', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Total should be 100000 + 150000 + 75000 = 325000
    // Formatted as UGX currency
    expect(screen.getByText('UGX 325,000')).toBeInTheDocument();
  });

  it('shows send button for created invoices', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Should show send button (initially disabled because no invoices selected)
    expect(screen.getByText(/Send Selected \(0\)/)).toBeInTheDocument();
  });

  it('displays filters and search functionality', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Check filters are present
    expect(screen.getByPlaceholderText('Search invoices...')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
    expect(screen.getByText('Select All Created')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  it('shows action buttons for successful invoices', () => {
    renderWithProviders(<BulkInvoiceResults result={mockBulkResult} />);

    // Should have view and download buttons for successful invoices
    const viewButtons = screen.getAllByTitle('View Invoice');
    const downloadButtons = screen.getAllByTitle('Download PDF');

    // Should have 2 view buttons (for created and sent invoices, not failed)
    expect(viewButtons).toHaveLength(2);
    expect(downloadButtons).toHaveLength(2);
  });
});
