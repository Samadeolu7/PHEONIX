import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import EntitlementForm from '../EntitlementForm';
import { entitlementService } from '../../services/entitlementService';
import { clientService } from '../../services/clientService';
import { useToast } from '../../hooks/useToast';

// Mock the services
vi.mock('../../services/entitlementService');
vi.mock('../../services/clientService');
vi.mock('../../hooks/useToast');
vi.mock('../../services/api');

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: undefined }),
  };
});

// Mock data
const mockClients = [
  { id: 1, name: 'John Doe', client_id: 'CLI-001', status: 'active' },
  { id: 2, name: 'Jane Smith', client_id: 'CLI-002', status: 'active' },
];

const mockInvoices = [
  {
    id: 1,
    invoice_number: 'INV-2025-001',
    amount: '250000.00',
    status: 'draft',
    invoice_date: '2025-01-01',
    due_date: '2025-02-01',
    description: 'Test invoice',
  },
];

const mockFeeStructures = [
  {
    id: 1,
    name: 'Grade 10 - Term 1 Fees',
    code: 'G10-T1',
    base_amount: '250000.00',
    category: { id: 1, name: 'Tuition' },
  },
];

// Mock toast functions
const mockSuccess = vi.fn();
const mockError = vi.fn();

describe('EntitlementForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup toast mock
    (useToast as any).mockReturnValue({
      success: mockSuccess,
      error: mockError,
    });

    // Setup clientService mock
    (clientService.getClientOptions as any).mockResolvedValue(mockClients);

    // Mock API calls
    global.fetch = vi.fn();
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <EntitlementForm />
      </BrowserRouter>
    );
  };

  describe('Component Rendering', () => {
    it('renders the form with all required fields', async () => {
      renderComponent();

      // Check if main elements are present
      expect(screen.getByText('Create New Entitlement')).toBeInTheDocument();
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByText('Financial Information')).toBeInTheDocument();
      expect(screen.getByText('Academic Period')).toBeInTheDocument();
      expect(screen.getByText('Access Rules')).toBeInTheDocument();

      // Check required fields
      expect(screen.getByLabelText(/Select Client/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Select Invoice/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Select Fee Structure/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Total Amount/)).toBeInTheDocument();
    });

    it('loads clients on component mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(clientService.getClientOptions).toHaveBeenCalledWith({ status: 'active' });
      });
    });

    it('displays loading state while fetching clients', async () => {
      // Mock a delayed response
      (clientService.getClientOptions as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockClients), 100))
      );

      renderComponent();

      // Should show loading text initially
      expect(screen.getByText('Loading clients...')).toBeInTheDocument();

      // Wait for clients to load
      await waitFor(() => {
        expect(screen.getByText('Select a client')).toBeInTheDocument();
      });
    });
  });

  describe('Form Interactions', () => {
    beforeEach(() => {
      // Mock successful API responses
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: mockInvoices }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: mockFeeStructures }),
        });
    });

    it('populates client dropdown with fetched clients', async () => {
      renderComponent();

      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        expect(clientSelect).toBeInTheDocument();
      });

      // Check if clients are in the dropdown
      await waitFor(() => {
        expect(screen.getByText('John Doe (ID: 1)')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith (ID: 2)')).toBeInTheDocument();
      });
    });

    it('loads invoices when client is selected', async () => {
      renderComponent();

      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      // Should trigger invoice loading
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/incomes/invoices/'),
          expect.objectContaining({
            method: 'GET',
          })
        );
      });
    });

    it('shows client information when client is selected', async () => {
      renderComponent();

      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        expect(screen.getByText('Selected: John Doe')).toBeInTheDocument();
      });
    });

    it('enables invoice dropdown after client selection', async () => {
      renderComponent();

      // Initially invoice dropdown should be disabled
      const invoiceSelect = screen.getByLabelText(/Select Invoice/);
      expect(invoiceSelect).toBeDisabled();

      // Select a client
      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      // Invoice dropdown should become enabled
      await waitFor(() => {
        expect(invoiceSelect).not.toBeDisabled();
      });
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting without required fields', async () => {
      renderComponent();

      const submitButton = screen.getByText('Create Entitlement');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith('Please select a client');
      });
    });

    it('validates minimum required amount for minimum deposit payment term', async () => {
      renderComponent();

      // Fill required fields
      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const invoiceSelect = screen.getByLabelText(/Select Invoice/);
        fireEvent.change(invoiceSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const feeStructureSelect = screen.getByLabelText(/Select Fee Structure/);
        fireEvent.change(feeStructureSelect, { target: { value: '1' } });
      });

      // Set payment term to minimum deposit
      const minimumDepositRadio = screen.getByLabelText(/Minimum Deposit/);
      fireEvent.click(minimumDepositRadio);

      // Set total amount but not minimum required
      const totalAmountInput = screen.getByLabelText(/Total Amount/);
      fireEvent.change(totalAmountInput, { target: { value: '250000' } });

      const submitButton = screen.getByText('Create Entitlement');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith(
          'Please enter a valid minimum required amount for minimum deposit payment term'
        );
      });
    });

    it('validates that minimum required is not greater than total amount', async () => {
      renderComponent();

      // Fill required fields
      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const invoiceSelect = screen.getByLabelText(/Select Invoice/);
        fireEvent.change(invoiceSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const feeStructureSelect = screen.getByLabelText(/Select Fee Structure/);
        fireEvent.change(feeStructureSelect, { target: { value: '1' } });
      });

      // Set payment term to minimum deposit
      const minimumDepositRadio = screen.getByLabelText(/Minimum Deposit/);
      fireEvent.click(minimumDepositRadio);

      // Set minimum required greater than total amount
      const totalAmountInput = screen.getByLabelText(/Total Amount/);
      fireEvent.change(totalAmountInput, { target: { value: '100000' } });

      const minimumRequiredInput = screen.getByLabelText(/Minimum Required/);
      fireEvent.change(minimumRequiredInput, { target: { value: '200000' } });

      const submitButton = screen.getByText('Create Entitlement');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith(
          'Minimum required amount cannot be greater than total amount'
        );
      });
    });
  });

  describe('Form Submission', () => {
    it('creates entitlement successfully with valid data', async () => {
      (entitlementService.createEntitlement as any).mockResolvedValue({
        id: 1,
        client: { id: 1, full_name: 'John Doe' },
        invoice: { id: 1, invoice_number: 'INV-2025-001' },
        fee_structure: { id: 1, name: 'Grade 10 - Term 1 Fees' },
      });

      renderComponent();

      // Fill all required fields
      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const invoiceSelect = screen.getByLabelText(/Select Invoice/);
        fireEvent.change(invoiceSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const feeStructureSelect = screen.getByLabelText(/Select Fee Structure/);
        fireEvent.change(feeStructureSelect, { target: { value: '1' } });
      });

      const totalAmountInput = screen.getByLabelText(/Total Amount/);
      fireEvent.change(totalAmountInput, { target: { value: '250000' } });

      const minimumRequiredInput = screen.getByLabelText(/Minimum Required/);
      fireEvent.change(minimumRequiredInput, { target: { value: '125000' } });

      const submitButton = screen.getByText('Create Entitlement');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(entitlementService.createEntitlement).toHaveBeenCalledWith(
          expect.objectContaining({
            client: 1,
            invoice: 1,
            fee_structure: 1,
            total_amount: '250000',
            minimum_required: '125000',
            payment_term_type: 'minimum_deposit',
          })
        );
      });

      await waitFor(() => {
        expect(mockSuccess).toHaveBeenCalledWith('Entitlement created successfully');
        expect(mockNavigate).toHaveBeenCalledWith('/incomes/entitlements');
      });
    });

    it('handles API errors gracefully', async () => {
      (entitlementService.createEntitlement as any).mockRejectedValue({
        response: {
          data: {
            message: 'Client already has an entitlement for this fee structure',
          },
        },
      });

      renderComponent();

      // Fill required fields and submit
      await waitFor(() => {
        const clientSelect = screen.getByLabelText(/Select Client/);
        fireEvent.change(clientSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const invoiceSelect = screen.getByLabelText(/Select Invoice/);
        fireEvent.change(invoiceSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        const feeStructureSelect = screen.getByLabelText(/Select Fee Structure/);
        fireEvent.change(feeStructureSelect, { target: { value: '1' } });
      });

      const totalAmountInput = screen.getByLabelText(/Total Amount/);
      fireEvent.change(totalAmountInput, { target: { value: '250000' } });

      const submitButton = screen.getByText('Create Entitlement');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockError).toHaveBeenCalledWith(
          'Client already has an entitlement for this fee structure'
        );
      });
    });
  });

  describe('Navigation', () => {
    it('navigates back to entitlements list when back button is clicked', () => {
      renderComponent();

      const backButton = screen.getByText('Back to Entitlements');
      fireEvent.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/incomes/entitlements');
    });

    it('navigates back to entitlements list when cancel button is clicked', () => {
      renderComponent();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/incomes/entitlements');
    });
  });
});
