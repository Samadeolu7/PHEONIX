import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BulkInvoiceWizard from '../BulkInvoiceWizard';
import { useToast } from '../../../hooks/useToast';
import { incomeFeeStructureService } from '../../../services/incomeFeeStructureService';
import { clientService } from '../../../services/clientService';
import { invoiceService } from '../../../services/invoiceService';

// Mock the services
vi.mock('../../../hooks/useToast');
vi.mock('../../../services/incomeFeeStructureService');
vi.mock('../../../services/clientService');
vi.mock('../../../services/invoiceService');

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

const mockFeeStructures = [
  {
    id: 1,
    name: 'Grade 10 Fees',
    code: 'G10',
    description: 'Grade 10 school fees',
    base_amount: '500000',
    is_recurring: true,
    frequency: 'termly',
    is_active: true,
    category: 1,
    category_name: 'School Fees',
    industry_config: '{}',
    effective_from: '2024-01-01',
    effective_to: '2024-12-31',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Grade 11 Fees',
    code: 'G11',
    description: 'Grade 11 school fees',
    base_amount: '600000',
    is_recurring: true,
    frequency: 'termly',
    is_active: true,
    category: 1,
    category_name: 'School Fees',
    industry_config: '{}',
    effective_from: '2024-01-01',
    effective_to: '2024-12-31',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const mockClients = [
  {
    id: 1,
    client_id: 'STU001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    gender: 'male' as const,
    age: 16,
    phone_primary: '0700000001',
    email: 'john.doe@example.com',
    status: 'active' as const,
    usage_context: 'student' as const,
    classification: 1,
    classification_name: 'Regular Student',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    client_id: 'STU002',
    first_name: 'Jane',
    last_name: 'Smith',
    full_name: 'Jane Smith',
    gender: 'female' as const,
    age: 17,
    phone_primary: '0700000002',
    email: 'jane.smith@example.com',
    status: 'active' as const,
    usage_context: 'student' as const,
    classification: 1,
    classification_name: 'Regular Student',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

const mockBulkResult = {
  success: true,
  created_count: 2,
  failed_count: 0,
  invoices: [
    {
      id: 1001,
      invoice_number: 'INV-2024-1001',
      client_name: 'John Doe',
      amount: '500000',
      status: 'created' as const,
    },
    {
      id: 1002,
      invoice_number: 'INV-2024-1002',
      client_name: 'Jane Smith',
      amount: '500000',
      status: 'created' as const,
    },
  ],
  errors: [],
};

describe('BulkInvoiceWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    (useToast as any).mockReturnValue(mockToast);

    (incomeFeeStructureService.getFeeStructures as any).mockResolvedValue({
      results: mockFeeStructures,
      count: mockFeeStructures.length,
      next: null,
      previous: null,
    });

    (clientService.getClients as any).mockResolvedValue({
      results: mockClients,
      count: mockClients.length,
      next: null,
      previous: null,
    });

    (invoiceService.createBulkInvoices as any).mockResolvedValue(mockBulkResult);
  });

  it('renders the wizard when open', () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Bulk Invoice Generation')).toBeInTheDocument();
    expect(screen.getByText('Select Fee Structure')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<BulkInvoiceWizard isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByText('Bulk Invoice Generation')).not.toBeInTheDocument();
  });

  it('loads fee structures on open', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(incomeFeeStructureService.getFeeStructures).toHaveBeenCalledWith({
        is_active: true,
        ordering: 'name',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
      expect(screen.getByText('Grade 11 Fees')).toBeInTheDocument();
    });
  });

  it('allows fee structure selection', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });

    // Click on the first fee structure
    fireEvent.click(screen.getByText('Grade 10 Fees'));

    // Check if it's selected (should have blue border/background)
    const selectedCard = screen.getByText('Grade 10 Fees').closest('div');
    expect(selectedCard).toHaveClass('border-blue-500', 'bg-blue-50');
  });

  it('navigates to client selection step', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Wait for fee structures to load and select one
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Grade 10 Fees'));

    // Click Next button
    fireEvent.click(screen.getByText('Next'));

    // Should be on step 2 now
    await waitFor(() => {
      expect(screen.getByText('Select Clients')).toBeInTheDocument();
      expect(
        screen.getByText('Choose the clients who will receive invoices for "Grade 10 Fees".')
      ).toBeInTheDocument();
    });
  });

  it('loads clients on step 2', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    // Wait for clients to load
    await waitFor(() => {
      expect(clientService.getClients).toHaveBeenCalled();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('allows client selection', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    // Wait for clients to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Select clients
    const johnCheckbox = screen.getByRole('checkbox', { name: /john doe/i });
    const janeCheckbox = screen.getByRole('checkbox', { name: /jane smith/i });

    fireEvent.click(johnCheckbox);
    fireEvent.click(janeCheckbox);

    expect(johnCheckbox).toBeChecked();
    expect(janeCheckbox).toBeChecked();

    // Check selection count
    expect(screen.getByText('2 of 2 clients selected')).toBeInTheDocument();
  });

  it('allows select all and deselect all', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click Select All
    fireEvent.click(screen.getByText('Select All'));
    expect(screen.getByText('2 of 2 clients selected')).toBeInTheDocument();

    // Click Deselect All
    fireEvent.click(screen.getByText('Deselect All'));
    expect(screen.getByText('0 of 2 clients selected')).toBeInTheDocument();
  });

  it('navigates to preview step', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate through steps
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Select clients
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Next'));

    // Should be on preview step
    await waitFor(() => {
      expect(screen.getByText('Preview & Confirm')).toBeInTheDocument();
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument(); // In summary
      expect(screen.getByText('2')).toBeInTheDocument(); // Client count
    });
  });

  it('shows invoice preview', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate to preview step
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Next'));

    // Check preview list
    await waitFor(() => {
      expect(screen.getByText('Invoice Preview (2)')).toBeInTheDocument();
      expect(screen.getAllByText('John Doe')).toHaveLength(2); // Once in summary, once in preview
      expect(screen.getAllByText('Jane Smith')).toHaveLength(1); // Once in preview
    });
  });

  it('creates bulk invoices successfully', async () => {
    const onComplete = vi.fn();

    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} onComplete={onComplete} />);

    // Navigate through all steps
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Create 2 Invoices')).toBeInTheDocument();
    });

    // Submit the form
    fireEvent.click(screen.getByText('Create 2 Invoices'));

    // Wait for completion
    await waitFor(() => {
      expect(invoiceService.createBulkInvoices).toHaveBeenCalledWith(
        expect.objectContaining({
          fee_structure: 1,
          clients: [1, 2],
          send_immediately: false,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Bulk Invoice Results')).toBeInTheDocument();
      expect(screen.getByText('Bulk Invoice Generation Completed')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // Created count
    });

    expect(mockToast.success).toHaveBeenCalledWith('Successfully created 2 invoices');
    expect(onComplete).toHaveBeenCalledWith(mockBulkResult);
  });

  it('handles API errors gracefully', async () => {
    // Mock API error
    (invoiceService.createBulkInvoices as any).mockRejectedValue(
      new Error('API Error: Failed to create invoices')
    );

    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate through steps and submit
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Create 2 Invoices')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create 2 Invoices'));

    // Should show error result
    await waitFor(() => {
      expect(screen.getByText('Bulk Invoice Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('API Error: Failed to create invoices')).toBeInTheDocument();
    });

    expect(mockToast.error).toHaveBeenCalledWith('API Error: Failed to create invoices');
  });

  it('validates required selections', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    // Try to proceed without selecting fee structure
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Please select a fee structure');
    });

    // Select fee structure and proceed
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    // Try to proceed without selecting clients
    await waitFor(() => {
      expect(screen.getByText('Select Clients')).toBeInTheDocument();
    });

    const nextButton2 = screen.getByText('Next');
    fireEvent.click(nextButton2);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Please select at least one client');
    });
  });

  it('closes wizard and resets state', () => {
    const onClose = vi.fn();

    render(<BulkInvoiceWizard isOpen={true} onClose={onClose} />);

    // Close the wizard using the X button
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters clients correctly', async () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByText('Grade 10 Fees')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Grade 10 Fees'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Filter Clients')).toBeInTheDocument();
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText('Name, ID, email...');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    await waitFor(() => {
      expect(clientService.getClients).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'John',
          status: 'active',
          usage_context: '',
          ordering: 'full_name',
        })
      );
    });

    // Test status filter
    const statusSelect = screen.getByDisplayValue('Active');
    fireEvent.change(statusSelect, { target: { value: 'inactive' } });

    await waitFor(() => {
      expect(clientService.getClients).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'inactive',
        })
      );
    });
  });
});
