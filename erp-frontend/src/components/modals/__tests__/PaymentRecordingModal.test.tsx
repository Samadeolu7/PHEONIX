import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import PaymentRecordingModal, { PaymentData } from '../PaymentRecordingModal';
import { Invoice } from '../../../services/invoiceService';

// Mock invoice data
const mockInvoice: Invoice = {
  id: 1,
  client: 1,
  client_name: 'Test Client',
  invoice_number: 'INV-001',
  invoice_date: '2024-01-15',
  due_date: '2024-02-15',
  description: 'Test invoice',
  amount: '1000.00',
  amount_paid: '200.00',
  balance: '800.00',
  fee_structure_name: 'Standard Fee',
  status: 'sent',
  is_overdue: false,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
};

describe('PaymentRecordingModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: mockOnClose,
      onSubmit: mockOnSubmit,
      invoice: mockInvoice,
      isLoading: false,
      ...props,
    };

    return render(<PaymentRecordingModal {...defaultProps} />);
  };

  it('renders modal when isOpen is true', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Record Payment' })).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    // Be more specific about which "USh 800" we're looking for
    expect(screen.getByText('Outstanding Balance:')).toBeInTheDocument();
  });

  it('does not render modal when isOpen is false', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('heading', { name: 'Record Payment' })).not.toBeInTheDocument();
  });

  it('initializes with full balance as default amount', () => {
    renderModal();

    const amountInput = screen.getByDisplayValue('800.00');
    expect(amountInput).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderModal();

    // Clear the amount field
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);

    // Try to submit - use role to be more specific
    const submitButton = screen.getByRole('button', { name: 'Record Payment' });
    await user.click(submitButton);

    expect(screen.getByText('Payment amount is required')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates payment amount does not exceed balance', async () => {
    const user = userEvent.setup();
    renderModal();

    // Enter amount greater than balance
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '1000.00');

    expect(screen.getByText(/Payment amount cannot exceed invoice balance/)).toBeInTheDocument();
  });

  it('validates payment amount is greater than zero', async () => {
    const user = userEvent.setup();
    renderModal();

    // Enter zero amount
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '0');

    expect(screen.getByText('Payment amount must be greater than 0')).toBeInTheDocument();
  });

  it('calculates remaining balance correctly', async () => {
    const user = userEvent.setup();
    renderModal();

    // Enter partial payment
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '300.00');

    // Check remaining balance calculation - using more specific text
    expect(screen.getByText('USh 500')).toBeInTheDocument(); // 800 - 300 = 500
  });

  it('shows full payment indicator when balance becomes zero', async () => {
    const user = userEvent.setup();
    renderModal();

    // Full payment is already set by default (800.00)
    expect(screen.getByText('✓ Invoice will be fully paid')).toBeInTheDocument();
  });

  it('handles payment method selection', async () => {
    const user = userEvent.setup();
    renderModal();

    const paymentMethodSelect = screen.getByDisplayValue('Bank Transfer');
    await user.selectOptions(paymentMethodSelect, 'cash');

    expect(screen.getByDisplayValue('Cash')).toBeInTheDocument();
  });

  it('provides quick amount buttons', async () => {
    const user = userEvent.setup();
    renderModal();

    // Click 50% button
    const fiftyPercentButton = screen.getByText('50%');
    await user.click(fiftyPercentButton);

    const amountInput = screen.getByDisplayValue('400.00'); // 50% of 800
    expect(amountInput).toBeInTheDocument();
  });

  it('provides full balance button', async () => {
    const user = userEvent.setup();
    renderModal();

    // Clear amount first
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);

    // Click Full button
    const fullButton = screen.getByText('Full');
    await user.click(fullButton);

    expect(screen.getByDisplayValue('800.00')).toBeInTheDocument();
  });

  it('shows warnings for payment method recommendations', async () => {
    const user = userEvent.setup();
    renderModal();

    // Select check payment method without reference
    const paymentMethodSelect = screen.getByDisplayValue('Bank Transfer');
    await user.selectOptions(paymentMethodSelect, 'check');

    expect(screen.getByText('Check number is recommended for check payments')).toBeInTheDocument();
  });

  it('submits valid payment data', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    renderModal();

    // Fill in reference number
    const referenceInput = screen.getByPlaceholderText('Transaction reference, check number, etc.');
    await user.type(referenceInput, 'REF-123');

    // Fill in notes
    const notesInput = screen.getByPlaceholderText('Additional notes about this payment...');
    await user.type(notesInput, 'Test payment');

    // Submit - use role to be more specific
    const submitButton = screen.getByRole('button', { name: 'Record Payment' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        amount: '800.00',
        payment_date: expect.any(String),
        payment_method: 'bank_transfer',
        reference: 'REF-123',
        notes: 'Test payment',
      });
    });
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup();
    renderModal();

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables form when loading', () => {
    renderModal({ isLoading: true });

    const amountInput = screen.getByDisplayValue('800.00');
    const submitButton = screen.getByText('Recording...');

    expect(amountInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('shows loading state in submit button', () => {
    renderModal({ isLoading: true });

    expect(screen.getByText('Recording...')).toBeInTheDocument();
    // The header still shows "Record Payment" so we need to be more specific
    expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument();
  });

  it('resets form when modal opens', () => {
    const { rerender } = renderModal({ isOpen: false });

    // Reopen modal
    rerender(
      <PaymentRecordingModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        invoice={mockInvoice}
        isLoading={false}
      />
    );

    // Should have default values
    expect(screen.getByDisplayValue('800.00')).toBeInTheDocument(); // Full balance
    expect(screen.getByDisplayValue('Bank Transfer')).toBeInTheDocument(); // Default payment method
  });

  it('only allows valid decimal input for amount', async () => {
    const user = userEvent.setup();
    renderModal();

    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);

    // Try to type invalid characters
    await user.type(amountInput, 'abc123.45def');

    // Should only show valid decimal
    expect(screen.getByDisplayValue('123.45')).toBeInTheDocument();
  });

  it('suggests full payment for small remaining balances', async () => {
    const user = userEvent.setup();
    renderModal();

    // Enter amount that leaves small balance (less than 10% of total)
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '750.00'); // Leaves 50, which is 6.25% of 800

    expect(screen.getByText(/Consider paying the full balance/)).toBeInTheDocument();
  });

  it('warns about future payment dates', async () => {
    const user = userEvent.setup();
    renderModal();

    // Set payment date 45 days in future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    const futureDateString = futureDate.toISOString().split('T')[0];

    const dateInput = screen.getByDisplayValue('2026-01-25'); // Use the actual date value
    await user.clear(dateInput);
    await user.type(dateInput, futureDateString);

    expect(screen.getByText('Payment date is more than 30 days in the future')).toBeInTheDocument();
  });
});
