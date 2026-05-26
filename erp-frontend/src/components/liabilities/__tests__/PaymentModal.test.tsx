import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentModal } from '../PaymentModal';
import { useAuth } from '../../../contexts/AuthContext';
import * as usePayablesHook from '../../../hooks/usePayables';

// Mock dependencies
jest.mock('../../../contexts/AuthContext');
jest.mock('../../../hooks/usePayables');

const mockUser = {
  id: 99,
  username: 'paymentuser',
  email: 'payment@example.com',
  first_name: 'Payment',
  last_name: 'User',
};

describe('PaymentModal Component', () => {
  let queryClient: QueryClient;
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock auth context
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    // Mock payment mutation
    (usePayablesHook.useMakePayment as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    jest.clearAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    payableId: 1,
    payableReference: 'AP-20260204-0001',
    amountDue: '1500.00',
    onSuccess: mockOnSuccess,
  };

  describe('Auth Integration', () => {
    it('should use authenticated user ID for posted_by field', async () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      // Should display accountability message with username
      expect(
        screen.getByText(/This payment will be recorded under your user account \(paymentuser\)/i)
      ).toBeInTheDocument();

      // Fill payment amount
      const amountInput = screen.getByLabelText(/Payment Amount/i);
      fireEvent.change(amountInput, { target: { value: '1500.00' } });

      // Mock successful payment
      mockMutateAsync.mockResolvedValue({
        success: true,
        message: 'Payment recorded successfully',
        payable_id: 1,
        reference_number: 'AP-20260204-0001',
        amount_paid: '1500.00',
        amount_due: '0.00',
        new_status: 'paid',
      });

      // Submit payment
      const submitButton = screen.getByRole('button', { name: /Make Payment/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Verify posted_by is set to authenticated user ID
      const callArgs = mockMutateAsync.mock.calls[0][0];
      expect(callArgs.data.posted_by).toBe(99);
    });

    it('should show email when username is not available', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { ...mockUser, username: '' },
        isAuthenticated: true,
      });

      renderWithProviders(<PaymentModal {...defaultProps} />);

      expect(
        screen.getByText(
          /This payment will be recorded under your user account \(payment@example.com\)/i
        )
      ).toBeInTheDocument();
    });

    it('should fallback to User ID when not authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false,
      });

      renderWithProviders(<PaymentModal {...defaultProps} />);

      expect(
        screen.getByText(/This payment will be recorded under your user account \(User #1\)/i)
      ).toBeInTheDocument();
    });
  });

  describe('Payment Form', () => {
    it('should pre-fill amount with amount due', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/i) as HTMLInputElement;
      expect(amountInput.value).toBe('1500.00');
    });

    it('should display outstanding amount', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
      expect(screen.getByText(/Outstanding Amount/i)).toBeInTheDocument();
    });

    it('should set default payment date to today', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const dateInput = screen.getByLabelText(/Payment Date/i) as HTMLInputElement;
      const today = new Date().toISOString().split('T')[0];
      expect(dateInput.value).toBe(today);
    });

    it('should have payment method options', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const paymentMethodSelect = screen.getByRole('combobox', {
        name: /Payment Method/i,
      });
      fireEvent.click(paymentMethodSelect);

      expect(screen.getByText('Bank Transfer')).toBeInTheDocument();
      expect(screen.getByText('Check')).toBeInTheDocument();
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });
  });

  describe('Payment Submission', () => {
    it('should submit payment with correct data', async () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      // Change payment amount
      const amountInput = screen.getByLabelText(/Payment Amount/i);
      fireEvent.change(amountInput, { target: { value: '500.00' } });

      // Add reference number
      const refInput = screen.getByLabelText(/Reference Number/i);
      fireEvent.change(refInput, { target: { value: 'CHK-123' } });

      // Add notes
      const notesInput = screen.getByLabelText(/Notes/i);
      fireEvent.change(notesInput, { target: { value: 'Partial payment' } });

      mockMutateAsync.mockResolvedValue({
        success: true,
        message: 'Payment recorded',
      });

      // Submit
      const submitButton = screen.getByRole('button', { name: /Make Payment/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          id: 1,
          data: expect.objectContaining({
            amount: '500.00',
            payment_method: 'bank_transfer',
            reference_number: 'CHK-123',
            notes: 'Partial payment',
            posted_by: 99,
          }),
        });
      });
    });

    it('should call onSuccess after successful payment', async () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      mockMutateAsync.mockResolvedValue({
        success: true,
        message: 'Payment recorded',
      });

      const submitButton = screen.getByRole('button', { name: /Make Payment/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should not close modal while payment is pending', async () => {
      (usePayablesHook.useMakePayment as jest.Mock).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: true,
        isError: false,
        error: null,
      });

      renderWithProviders(<PaymentModal {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /Processing.../i });
      expect(submitButton).toBeDisabled();

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Validation', () => {
    it('should enforce maximum payment amount', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/i) as HTMLInputElement;
      expect(amountInput.max).toBe('1500.00');
      expect(screen.getByText(/Maximum: \$1,500.00/i)).toBeInTheDocument();
    });

    it('should require payment amount', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const amountInput = screen.getByLabelText(/Payment Amount/i) as HTMLInputElement;
      expect(amountInput.required).toBe(true);
      expect(amountInput.min).toBe('0.01');
    });
  });

  describe('Error Handling', () => {
    it('should display error message on payment failure', async () => {
      (usePayablesHook.useMakePayment as jest.Mock).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: true,
        error: new Error('Insufficient funds'),
      });

      renderWithProviders(<PaymentModal {...defaultProps} />);

      expect(screen.getByText(/Insufficient funds/i)).toBeInTheDocument();
    });
  });

  describe('Modal Controls', () => {
    it('should call onClose when cancel button is clicked', () => {
      renderWithProviders(<PaymentModal {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not render when isOpen is false', () => {
      renderWithProviders(<PaymentModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText(/Make Payment/i)).not.toBeInTheDocument();
    });
  });
});
