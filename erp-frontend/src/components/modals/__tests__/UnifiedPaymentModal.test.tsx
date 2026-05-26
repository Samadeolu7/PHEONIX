import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UnifiedPaymentModal from '../UnifiedPaymentModal';
import { CustomerReceivable } from '../../../services/receivablesService';

// Mock the dependencies
vi.mock('../PaymentRecordingModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="payment-recording-modal">Payment Recording Modal</div> : null,
}));

vi.mock('../../../services/invoiceService', () => ({
  invoiceService: {
    getInvoice: vi.fn(),
    recordPayment: vi.fn(),
  },
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockReceivable: CustomerReceivable = {
  id: 1,
  client: 1,
  client_name: 'John Doe',
  receivable_type: 'invoice',
  content_type: 1,
  content_type_name: 'Invoice',
  object_id: 123,
  reference_number: 'INV-001',
  original_amount: '1000.00',
  amount_paid: '500.00',
  balance: '500.00',
  due_date: '2025-02-01',
  status: 'partial',
  aging_bucket: 'current',
  days_overdue: 0,
  accrued_interest: '0.00',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('UnifiedPaymentModal', () => {
  it('renders PaymentRecordingModal for invoice receivables', () => {
    render(<UnifiedPaymentModal isOpen={true} onClose={vi.fn()} receivable={mockReceivable} />);

    expect(screen.getByTestId('payment-recording-modal')).toBeInTheDocument();
  });

  it('renders placeholder modal for entitlement receivables', () => {
    const entitlementReceivable = {
      ...mockReceivable,
      receivable_type: 'entitlement' as const,
    };

    render(
      <UnifiedPaymentModal isOpen={true} onClose={vi.fn()} receivable={entitlementReceivable} />
    );

    expect(screen.getByText('Payment Modal Not Available')).toBeInTheDocument();
    expect(screen.getByText(/School Fee/)).toBeInTheDocument();
  });

  it('renders placeholder modal for loan receivables', () => {
    const loanReceivable = {
      ...mockReceivable,
      receivable_type: 'loan' as const,
    };

    render(<UnifiedPaymentModal isOpen={true} onClose={vi.fn()} receivable={loanReceivable} />);

    expect(screen.getByText('Payment Modal Not Available')).toBeInTheDocument();
    expect(screen.getByText(/Loan/)).toBeInTheDocument();
  });

  it('renders placeholder modal for other receivables', () => {
    const otherReceivable = {
      ...mockReceivable,
      receivable_type: 'other' as const,
    };

    render(<UnifiedPaymentModal isOpen={true} onClose={vi.fn()} receivable={otherReceivable} />);

    expect(screen.getByText('Payment Modal Not Available')).toBeInTheDocument();
    expect(screen.getByText(/Other/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<UnifiedPaymentModal isOpen={false} onClose={vi.fn()} receivable={mockReceivable} />);

    expect(screen.queryByTestId('payment-recording-modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Modal Not Available')).not.toBeInTheDocument();
  });
});
