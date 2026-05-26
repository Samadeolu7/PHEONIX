import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkInvoiceWizard from '../BulkInvoiceWizard';
import { useToast } from '../../../hooks/useToast';

// Mock the services and hooks
vi.mock('../../../hooks/useToast');
vi.mock('../../../services/incomeFeeStructureService');
vi.mock('../../../services/clientService');
vi.mock('../../../services/invoiceService');

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

describe('BulkInvoiceWizard Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as any).mockReturnValue(mockToast);
  });

  it('should render the wizard when open', () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Bulk Invoice Generation')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<BulkInvoiceWizard isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByText('Bulk Invoice Generation')).not.toBeInTheDocument();
  });

  it('should show the first step by default', () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Select Fee Structure')).toBeInTheDocument();
    expect(
      screen.getByText('Choose the fee structure to use for generating invoices')
    ).toBeInTheDocument();
  });

  it('should have all required step indicators', () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Fee Structure')).toBeInTheDocument();
    expect(screen.getByText('Select Clients')).toBeInTheDocument();
    expect(screen.getByText('Preview & Confirm')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('should have a close button', () => {
    const onClose = vi.fn();

    render(<BulkInvoiceWizard isOpen={true} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: '' });
    expect(closeButton).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    render(<BulkInvoiceWizard isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Loading fee structures...')).toBeInTheDocument();
  });
});
