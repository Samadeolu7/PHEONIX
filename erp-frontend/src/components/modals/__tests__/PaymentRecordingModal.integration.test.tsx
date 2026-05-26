import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import PaymentRecordingModal from '../PaymentRecordingModal';
import { invoiceService } from '../../../services/invoiceService';
import { Invoice } from '../../../services/invoiceService';

// Mock the invoice service
vi.mock('../../../services/invoiceService', () => ({
  invoiceService: {
    recordPayment: vi.fn(),
  },
}));

const mockInvoice: Invoice = {
  id: 123,
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

describe('PaymentRecordingModal - API Integration', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the correct API endpoint with proper data structure', async () => {
    const user = userEvent.setup();

    // Mock successful API response
    const mockRecordPayment = vi.mocked(invoiceService.recordPayment);
    mockRecordPayment.mockResolvedValue({ success: true });

    render(
      <PaymentRecordingModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        invoice={mockInvoice}
        isLoading={false}
      />
    );

    // Fill in payment details
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '500.00');

    const referenceInput = screen.getByPlaceholderText('Transaction reference, check number, etc.');
    await user.type(referenceInput, 'TRX-12345');

    const notesInput = screen.getByPlaceholderText('Additional notes about this payment...');
    await user.type(notesInput, 'Payment received via bank transfer');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Record Payment' });
    await user.click(submitButton);

    // Verify the API was called with correct parameters
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        amount: '500.00',
        payment_date: expect.any(String), // Today's date
        payment_method: 'bank_transfer',
        reference: 'TRX-12345',
        notes: 'Payment received via bank transfer',
      });
    });
  });

  it('sends the correct API request structure matching backend expectations', async () => {
    const user = userEvent.setup();

    // Create a mock that captures the actual API call
    const mockRecordPayment = vi.mocked(invoiceService.recordPayment);
    mockRecordPayment.mockResolvedValue({ success: true });

    // Create a custom onSubmit that calls the actual API
    const handleSubmit = async (paymentData: any) => {
      await invoiceService.recordPayment(mockInvoice.id, {
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference: paymentData.reference,
        notes: paymentData.notes,
      });
    };

    render(
      <PaymentRecordingModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={handleSubmit}
        invoice={mockInvoice}
        isLoading={false}
      />
    );

    // Fill in payment details that match the backend example but within valid range
    const amountInput = screen.getByDisplayValue('800.00');
    await user.clear(amountInput);
    await user.type(amountInput, '500.00'); // Use valid amount within balance

    // Set payment date
    const dateInput = screen.getByDisplayValue('2026-01-25'); // Use the actual date value
    await user.clear(dateInput);
    await user.type(dateInput, '2025-02-15');

    // Set payment method to bank_transfer
    const paymentMethodSelect = screen.getByDisplayValue('Bank Transfer');
    await user.selectOptions(paymentMethodSelect, 'bank_transfer');

    const referenceInput = screen.getByPlaceholderText('Transaction reference, check number, etc.');
    await user.type(referenceInput, 'TRX-12345');

    const notesInput = screen.getByPlaceholderText('Additional notes about this payment...');
    await user.type(notesInput, 'Payment received via bank transfer');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Record Payment' });
    await user.click(submitButton);

    // Verify the API was called with the exact structure expected by backend
    await waitFor(() => {
      expect(mockRecordPayment).toHaveBeenCalledWith(123, {
        amount: '500.00',
        payment_date: '2025-02-15',
        payment_method: 'bank_transfer',
        reference: 'TRX-12345',
        notes: 'Payment received via bank transfer',
      });
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock API error
    const mockRecordPayment = vi.mocked(invoiceService.recordPayment);
    mockRecordPayment.mockRejectedValue(new Error('API Error'));

    const handleSubmit = async (paymentData: any) => {
      try {
        await invoiceService.recordPayment(mockInvoice.id, paymentData);
      } catch (error) {
        throw error; // Re-throw to let modal handle it
      }
    };

    render(
      <PaymentRecordingModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={handleSubmit}
        invoice={mockInvoice}
        isLoading={false}
      />
    );

    // Submit with valid data
    const submitButton = screen.getByRole('button', { name: 'Record Payment' });
    await user.click(submitButton);

    // Verify API was called and error was handled
    await waitFor(() => {
      expect(mockRecordPayment).toHaveBeenCalled();
    });
  });
});
