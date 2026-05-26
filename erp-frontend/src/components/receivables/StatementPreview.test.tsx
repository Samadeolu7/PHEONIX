// src/components/receivables/StatementPreview.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatementPreview from './StatementPreview';
import { StatementPreview as StatementPreviewType } from '../../types/statements';

// Mock the receivables service
vi.mock('../../services/receivablesService', () => ({
  receivablesService: {
    sendStatement: vi.fn().mockResolvedValue({ id: 1, sent_at: new Date().toISOString() }),
  },
}));

const mockStatementData: StatementPreviewType = {
  client: {
    id: 1,
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+234 801 234 5678',
    address: '123 Main Street, Lagos, Nigeria',
  },
  period_start: '2025-01-01',
  period_end: '2025-01-31',
  opening_balance: '50000.00',
  closing_balance: '85000.00',
  total_charges: '35000.00',
  total_payments: '15000.00',
  transaction_count: 3,
  statement_date: '2025-02-01',
  transactions: [
    {
      id: 1,
      date: '2025-01-01',
      reference: 'Opening Balance',
      description: 'Balance brought forward',
      charges: '0.00',
      payments: '0.00',
      balance: '50000.00',
      type: 'charge',
    },
    {
      id: 2,
      date: '2025-01-05',
      reference: 'INV-20250105-001',
      description: 'Consulting Services - January',
      charges: '35000.00',
      payments: '0.00',
      balance: '85000.00',
      type: 'charge',
    },
    {
      id: 3,
      date: '2025-01-10',
      reference: 'PMT-001',
      description: 'Payment received - Bank Transfer',
      charges: '0.00',
      payments: '15000.00',
      balance: '70000.00',
      type: 'payment',
    },
  ],
};

describe('StatementPreview Component', () => {
  it('should be importable', () => {
    expect(true).toBe(true);
  });

  it('should have correct types defined', () => {
    expect(mockStatementData.client.full_name).toBe('John Doe');
    expect(mockStatementData.transaction_count).toBe(3);
    expect(mockStatementData.transactions).toHaveLength(3);
  });

  it('should render statement preview with customer information', () => {
    const mockOnClose = vi.fn();

    render(<StatementPreview previewData={mockStatementData} onClose={mockOnClose} />);

    // Check if customer information is displayed
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('+234 801 234 5678')).toBeInTheDocument();

    // Check if statement header is displayed
    expect(screen.getByText('ACCOUNT STATEMENT')).toBeInTheDocument();
    expect(screen.getByText('Statement Preview')).toBeInTheDocument();
  });

  it('should render transaction details', () => {
    const mockOnClose = vi.fn();

    render(<StatementPreview previewData={mockStatementData} onClose={mockOnClose} />);

    // Check if transactions are displayed by looking for unique references
    expect(screen.getByText('INV-20250105-001')).toBeInTheDocument();
    expect(screen.getByText('PMT-001')).toBeInTheDocument();

    // Check transaction descriptions
    expect(screen.getByText('Consulting Services - January')).toBeInTheDocument();
    expect(screen.getByText('Payment received - Bank Transfer')).toBeInTheDocument();

    // Check that transaction table exists
    expect(screen.getByText('Transaction Details')).toBeInTheDocument();
  });

  it('should display action buttons', () => {
    const mockOnClose = vi.fn();

    render(<StatementPreview previewData={mockStatementData} onClose={mockOnClose} />);

    // Check if action buttons are present
    expect(screen.getByRole('button', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('should open email modal when email button is clicked', () => {
    const mockOnClose = vi.fn();

    render(<StatementPreview previewData={mockStatementData} onClose={mockOnClose} />);

    const emailButton = screen.getByRole('button', { name: /email/i });
    fireEvent.click(emailButton);

    // Check if email modal is opened
    expect(screen.getByText('Send Statement via Email')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john.doe@example.com')).toBeInTheDocument();
  });

  it('should format currency correctly', () => {
    const mockOnClose = vi.fn();

    render(<StatementPreview previewData={mockStatementData} onClose={mockOnClose} />);

    // Check if currency formatting is working (should find at least one formatted amount)
    const formattedAmounts = screen.getAllByText(/₦[\d,]+/);
    expect(formattedAmounts.length).toBeGreaterThan(0);
  });
});
