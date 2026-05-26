// src/pages/receivables/__tests__/ReceivableDetail.test.tsx
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReceivableDetail from '../ReceivableDetail';
import { receivablesService } from '../../../services/receivablesService';
import { useToast } from '../../../hooks/useToast';

// Mock the services and hooks
vi.mock('../../../services/receivablesService');
vi.mock('../../../hooks/useToast');

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

const mockReceivable = {
  id: 1,
  client: {
    id: 1,
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+2348012345678',
  },
  receivable_type: 'invoice' as const,
  content_object: {
    id: 1,
    invoice_number: 'INV-20250201-001',
    description: 'Consulting services',
    invoice_date: '2025-02-01',
  },
  reference_number: 'INV-20250201-001',
  original_amount: '100000.00',
  amount_paid: '50000.00',
  balance: '50000.00',
  due_date: '2025-03-01',
  aging_bucket: 'current' as const,
  days_overdue: 0,
  status: 'partial' as const,
  overdue_interest_rate: '12.00',
  accrued_interest: '0.00',
  last_reminder_sent: null,
  reminder_count: 0,
  assigned_to: null,
  collection_notes: null,
  activity_logs: [
    {
      id: 1,
      activity_type: 'payment',
      amount: '50000.00',
      description: 'Payment received via bank transfer',
      performed_by: {
        id: 2,
        full_name: 'Jane Smith',
      },
      created_at: '2025-02-15T10:00:00Z',
    },
  ],
  created_at: '2025-02-01T00:00:00Z',
  updated_at: '2025-02-15T10:00:00Z',
};

const mockPaymentAllocations = [
  {
    id: 1,
    payment_date: '2025-02-15',
    total_payment_amount: '50000.00',
    payment_method: 'bank_transfer',
    reference_number: 'TRX-12345',
    allocated_amount: '50000.00',
    status: 'allocated',
    created_at: '2025-02-15T10:00:00Z',
  },
];

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

describe('ReceivableDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue(mockToast);
    (receivablesService.getReceivable as any).mockResolvedValue(mockReceivable);
    (receivablesService.getPaymentAllocations as any).mockResolvedValue({
      results: mockPaymentAllocations,
    });
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <ReceivableDetail />
      </BrowserRouter>
    );
  };

  it('should render loading state initially', () => {
    renderComponent();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should display receivable details after loading', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('INV-20250201-001')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Invoice • John Doe')).toBeInTheDocument();
    });
  });

  it('should show financial summary with correct amounts', async () => {
    renderComponent();

    await waitFor(() => {
      // Use more flexible text matching for currency amounts
      expect(screen.getByText(/100,000/)).toBeInTheDocument(); // Original amount
      expect(screen.getByText(/50,000/)).toBeInTheDocument(); // Amount paid and balance
    });
  });

  it('should display status badges correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Partial')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  it('should show payment progress bar with correct percentage', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });
  });

  it('should display client contact information', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
      expect(screen.getByText('+2348012345678')).toBeInTheDocument();
    });
  });

  it('should show linked invoice details when available', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Linked Invoice Details')).toBeInTheDocument();
      expect(screen.getByText('Consulting services')).toBeInTheDocument();
    });
  });

  it('should display activity timeline', async () => {
    renderComponent();

    // Switch to activity tab
    fireEvent.click(screen.getByText('Activity Timeline'));

    await waitFor(() => {
      expect(screen.getByText('Payment received via bank transfer')).toBeInTheDocument();
      expect(screen.getByText('by Jane Smith')).toBeInTheDocument();
    });
  });

  it('should display payment history', async () => {
    renderComponent();

    // Switch to payments tab
    fireEvent.click(screen.getByText('Payment History'));

    await waitFor(() => {
      expect(screen.getByText('Payment Allocation History')).toBeInTheDocument();
      expect(screen.getByText('TRX-12345')).toBeInTheDocument();
    });
  });

  it('should allow adding collection notes', async () => {
    (receivablesService.addNote as any).mockResolvedValue(mockReceivable);

    renderComponent();

    // Switch to collection tab
    fireEvent.click(screen.getByText('Collection Notes'));

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Enter collection note...');
      const addButton = screen.getByText('Add Note');

      fireEvent.change(textarea, {
        target: { value: 'Called client - promised payment by Friday' },
      });
      fireEvent.click(addButton);

      expect(receivablesService.addNote).toHaveBeenCalledWith(1, {
        note: 'Called client - promised payment by Friday',
      });
    });
  });

  it('should handle send reminder action', async () => {
    (receivablesService.sendReminder as any).mockResolvedValue(mockReceivable);

    renderComponent();

    await waitFor(() => {
      const sendReminderButton = screen.getByText('Send Reminder');
      fireEvent.click(sendReminderButton);

      expect(receivablesService.sendReminder).toHaveBeenCalledWith(1, {
        reminder_type: 'email',
        template: 'overdue_reminder',
        custom_message: 'Please settle your outstanding balance at your earliest convenience.',
      });
    });
  });

  it('should display overdue information when applicable', async () => {
    const overdueReceivable = {
      ...mockReceivable,
      days_overdue: 15,
      status: 'overdue' as const,
      aging_bucket: '1-30' as const,
    };

    (receivablesService.getReceivable as any).mockResolvedValue(overdueReceivable);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('15 days overdue')).toBeInTheDocument();
      expect(screen.getByText('Overdue')).toBeInTheDocument();
      expect(screen.getByText('1-30 days')).toBeInTheDocument();
    });
  });

  it('should show interest information when accrued interest exists', async () => {
    const receivableWithInterest = {
      ...mockReceivable,
      accrued_interest: '1500.00',
    };

    (receivablesService.getReceivable as any).mockResolvedValue(receivableWithInterest);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Interest Information')).toBeInTheDocument();
      expect(screen.getByText('12.00% per annum')).toBeInTheDocument();
      expect(screen.getByText(/1,500/)).toBeInTheDocument(); // More flexible currency matching
    });
  });

  it('should handle error when receivable not found', async () => {
    (receivablesService.getReceivable as any).mockRejectedValue(new Error('Not found'));

    renderComponent();

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to load receivable details');
    });
  });

  it('should show empty states for tabs with no data', async () => {
    const receivableWithoutData = {
      ...mockReceivable,
      activity_logs: [],
      collection_notes: null,
    };

    (receivablesService.getReceivable as any).mockResolvedValue(receivableWithoutData);
    (receivablesService.getPaymentAllocations as any).mockResolvedValue({ results: [] });

    renderComponent();

    // Check activity tab empty state
    fireEvent.click(screen.getByText('Activity Timeline'));
    await waitFor(() => {
      expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
    });

    // Check payments tab empty state
    fireEvent.click(screen.getByText('Payment History'));
    await waitFor(() => {
      expect(screen.getByText('No payments recorded yet')).toBeInTheDocument();
    });

    // Check collection notes empty state
    fireEvent.click(screen.getByText('Collection Notes'));
    await waitFor(() => {
      expect(screen.getByText('No collection notes yet')).toBeInTheDocument();
    });
  });

  it('should display quick action buttons', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Record Payment')).toHaveLength(2); // One in header, one in sidebar
      expect(screen.getByText('Send Reminder')).toBeInTheDocument();
      expect(screen.getByText('Generate Statement')).toBeInTheDocument();
      expect(screen.getByText('View All Client Receivables')).toBeInTheDocument();
    });
  });

  it('should show collection information when collector is assigned', async () => {
    const receivableWithCollector = {
      ...mockReceivable,
      assigned_to: {
        id: 5,
        full_name: 'Jane Smith',
      },
      reminder_count: 2,
      last_reminder_sent: '2025-02-20',
    };

    (receivablesService.getReceivable as any).mockResolvedValue(receivableWithCollector);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('2 reminders sent')).toBeInTheDocument();
    });
  });
});
