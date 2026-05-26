import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

import RequisitionListPage from '../RequisitionListPage';
import { procurementService } from '../../../services/procurementService';
import { ErrorHandler } from '../../../utils/errorHandler';
import { ToastProvider } from '../../../contexts/ToastContext';
import { PurchaseRequisition, RequisitionStatus } from '../../../types/procurement';

// Mock the services and dependencies
vi.mock('../../../services/procurementService');
vi.mock('../../../utils/errorHandler');
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode; initialEntries?: string[] }> = ({
  children,
  initialEntries = ['/procurement/requisitions'],
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('RequisitionListPage Integration Tests', () => {
  let mockProcurementService: any;
  let mockErrorHandler: any;

  // Mock data
  const mockDepartments = {
    results: [
      { id: 1, name: 'IT Department', code: 'IT', is_active: true },
      { id: 2, name: 'HR Department', code: 'HR', is_active: true },
    ],
    count: 2,
    next: null,
    previous: null,
  };

  const mockDraftRequisition: PurchaseRequisition = {
    id: 1,
    pr_number: 'PR-2026-001',
    title: 'Office Supplies Request',
    status: RequisitionStatus.DRAFT,
    priority: 'medium',
    justification: 'Need office supplies for Q1 operations',
    total_estimated_cost: '1500.00',
    expected_delivery_date: '2026-02-15',
    requester: {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@company.com',
    },
    department: {
      id: 1,
      name: 'IT Department',
      code: 'IT',
    },
    items: [
      {
        id: 1,
        item: {
          id: 1,
          name: 'Laptop',
          sku: 'LAP-001',
          description: 'Business laptop',
        },
        quantity: '2',
        estimated_unit_cost: '750.00',
        estimated_total_cost: '1500.00',
        specifications: 'High performance laptop',
        justification: 'For new employees',
      },
    ],
    created_at: '2026-01-07T10:00:00Z',
    updated_at: '2026-01-07T10:00:00Z',
  };

  const mockSubmittedRequisition: PurchaseRequisition = {
    ...mockDraftRequisition,
    id: 2,
    pr_number: 'PR-2026-002',
    title: 'Equipment Purchase',
    status: RequisitionStatus.SUBMITTED,
    submitted_at: '2026-01-07T11:00:00Z',
  };

  const mockApprovedRequisition: PurchaseRequisition = {
    ...mockDraftRequisition,
    id: 3,
    pr_number: 'PR-2026-003',
    title: 'Critical Equipment',
    status: RequisitionStatus.APPROVED,
    priority: 'high',
    approved_at: '2026-01-07T12:00:00Z',
    approved_by: {
      id: 2,
      first_name: 'Jane',
      last_name: 'Manager',
      email: 'jane.manager@company.com',
    },
  };

  const mockRequisitions = {
    results: [mockDraftRequisition, mockSubmittedRequisition, mockApprovedRequisition],
    count: 3,
    next: null,
    previous: null,
  };

  beforeEach(() => {
    mockProcurementService = vi.mocked(procurementService);
    mockErrorHandler = vi.mocked(ErrorHandler);

    // Reset all mocks
    vi.clearAllMocks();
    mockNavigate.mockClear();

    // Setup default mock responses
    mockProcurementService.getPurchaseRequisitions.mockResolvedValue(mockRequisitions);
    mockProcurementService.getDepartments.mockResolvedValue(mockDepartments);

    // Setup default error handler behavior
    mockErrorHandler.withRetry.mockImplementation(async operation => {
      return await operation();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Page Loading and Display', () => {
    it('should load and display requisitions correctly', async () => {
      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Check page title
      expect(screen.getByText('Purchase Requisitions')).toBeInTheDocument();
      expect(
        screen.getByText('Manage purchase requisitions and approval workflows')
      ).toBeInTheDocument();

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
        expect(screen.getByText('PR-2026-002')).toBeInTheDocument();
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Check requisition details
      expect(screen.getByText('Office Supplies Request')).toBeInTheDocument();
      expect(screen.getByText('Equipment Purchase')).toBeInTheDocument();
      expect(screen.getByText('Critical Equipment')).toBeInTheDocument();

      // Check status badges
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });

    it('should show loading state initially', async () => {
      // Make the API call hang
      let resolveRequisitions: (value: any) => void;
      const requisitionsPromise = new Promise(resolve => {
        resolveRequisitions = resolve;
      });

      mockProcurementService.getPurchaseRequisitions.mockReturnValue(requisitionsPromise);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Should show loading state
      expect(screen.getByText('Loading purchase requisitions...')).toBeInTheDocument();

      // Resolve the promise
      resolveRequisitions!(mockRequisitions);

      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });
    });

    it('should handle and display errors', async () => {
      const mockError = new Error('Failed to fetch requisitions');
      mockProcurementService.getPurchaseRequisitions.mockRejectedValue(mockError);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for error to be displayed
      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Requisition Submission Workflow', () => {
    it('should submit a draft requisition successfully', async () => {
      const updatedRequisition = { ...mockDraftRequisition, status: RequisitionStatus.SUBMITTED };
      mockProcurementService.submitRequisition.mockResolvedValue(updatedRequisition);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find the draft requisition card
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      expect(draftCard).toBeInTheDocument();

      // Find and click the submit button
      const submitButton = within(draftCard!).getByText('Submit');
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();

      fireEvent.click(submitButton);

      // Verify loading state
      await waitFor(() => {
        const loadingButton = within(draftCard!).getByText('Submitting...');
        expect(loadingButton).toBeInTheDocument();
        expect(loadingButton).toBeDisabled();
      });

      // Wait for success
      await waitFor(() => {
        expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
      });
    });

    it('should handle submission errors with proper feedback', async () => {
      const mockError = new Error('Validation failed: Missing required approver');
      mockProcurementService.submitRequisition.mockRejectedValue(mockError);
      mockErrorHandler.withRetry.mockRejectedValue(mockError);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find and click submit button
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const submitButton = within(draftCard!).getByText('Submit');

      fireEvent.click(submitButton);

      // Wait for error handling
      await waitFor(() => {
        expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
      });

      // Button should be re-enabled after error
      await waitFor(() => {
        const enabledButton = within(draftCard!).getByText('Submit');
        expect(enabledButton).not.toBeDisabled();
      });
    });

    it('should disable submit button during operation', async () => {
      let resolveSubmit: (value: any) => void;
      const submitPromise = new Promise(resolve => {
        resolveSubmit = resolve;
      });

      mockProcurementService.submitRequisition.mockReturnValue(submitPromise);
      mockErrorHandler.withRetry.mockReturnValue(submitPromise);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find and click submit button
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const submitButton = within(draftCard!).getByText('Submit');

      fireEvent.click(submitButton);

      // Verify button is disabled and shows loading text
      await waitFor(() => {
        const loadingButton = within(draftCard!).getByText('Submitting...');
        expect(loadingButton).toBeDisabled();
      });

      // Resolve the operation
      resolveSubmit!({ ...mockDraftRequisition, status: RequisitionStatus.SUBMITTED });

      // Button should be re-enabled
      await waitFor(() => {
        expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Requisition to PO Conversion Workflow', () => {
    const mockCreatedPO = {
      id: 1,
      po_number: 'PO-2026-001',
      requisition: 3,
      supplier: 1,
      supplier_name: 'Tech Supplier Inc',
      status: 'draft',
      total_amount: '1500.00',
      created_at: '2026-01-07T13:00:00Z',
    };

    it('should convert approved requisition to PO successfully', async () => {
      mockProcurementService.convertRequisitionToPO.mockResolvedValue(mockCreatedPO);

      // Mock window.confirm to return true
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Find the approved requisition card
      const approvedCard = screen
        .getByText('PR-2026-003')
        .closest('div[style*="background: white"]');
      expect(approvedCard).toBeInTheDocument();

      // Find and click the convert button
      const convertButton = within(approvedCard!).getByText('Convert to PO');
      expect(convertButton).toBeInTheDocument();
      expect(convertButton).not.toBeDisabled();

      fireEvent.click(convertButton);

      // Verify loading state
      await waitFor(() => {
        const loadingButton = within(approvedCard!).getByText('Converting...');
        expect(loadingButton).toBeInTheDocument();
        expect(loadingButton).toBeDisabled();
      });

      // Wait for success and navigation
      await waitFor(() => {
        expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(3);
        expect(mockNavigate).toHaveBeenCalledWith('/procurement/orders/1/view');
      });

      // Restore original confirm
      window.confirm = originalConfirm;
    });

    it('should handle user cancellation of conversion', async () => {
      // Mock window.confirm to return false
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => false);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Find and click convert button
      const approvedCard = screen
        .getByText('PR-2026-003')
        .closest('div[style*="background: white"]');
      const convertButton = within(approvedCard!).getByText('Convert to PO');

      fireEvent.click(convertButton);

      // Should not call the service since user cancelled
      expect(mockProcurementService.convertRequisitionToPO).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();

      // Restore original confirm
      window.confirm = originalConfirm;
    });

    it('should handle conversion errors gracefully', async () => {
      const mockError = new Error('No supplier found for requisition items');
      mockProcurementService.convertRequisitionToPO.mockRejectedValue(mockError);
      mockErrorHandler.withRetry.mockRejectedValue(mockError);

      // Mock window.confirm to return true
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Find and click convert button
      const approvedCard = screen
        .getByText('PR-2026-003')
        .closest('div[style*="background: white"]');
      const convertButton = within(approvedCard!).getByText('Convert to PO');

      fireEvent.click(convertButton);

      // Wait for error handling
      await waitFor(() => {
        expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(3);
      });

      // Button should be re-enabled after error
      await waitFor(() => {
        const enabledButton = within(approvedCard!).getByText('Convert to PO');
        expect(enabledButton).not.toBeDisabled();
      });

      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalled();

      // Restore original confirm
      window.confirm = originalConfirm;
    });
  });

  describe('UI Feedback and Loading States', () => {
    it('should show proper loading indicators during operations', async () => {
      let resolveSubmit: (value: any) => void;
      const submitPromise = new Promise(resolve => {
        resolveSubmit = resolve;
      });

      mockProcurementService.submitRequisition.mockReturnValue(submitPromise);
      mockErrorHandler.withRetry.mockReturnValue(submitPromise);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find and click submit button
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const submitButton = within(draftCard!).getByText('Submit');

      fireEvent.click(submitButton);

      // Verify immediate loading state
      expect(within(draftCard!).getByText('Submitting...')).toBeInTheDocument();
      expect(within(draftCard!).getByText('Submitting...')).toBeDisabled();

      // Resolve operation
      resolveSubmit!({ ...mockDraftRequisition, status: RequisitionStatus.SUBMITTED });

      // Wait for completion
      await waitFor(() => {
        expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
      });
    });

    it('should handle multiple concurrent operations', async () => {
      let resolveSubmit: (value: any) => void;
      let resolveConvert: (value: any) => void;

      const submitPromise = new Promise(resolve => {
        resolveSubmit = resolve;
      });

      const convertPromise = new Promise(resolve => {
        resolveConvert = resolve;
      });

      mockProcurementService.submitRequisition.mockReturnValue(submitPromise);
      mockProcurementService.convertRequisitionToPO.mockReturnValue(convertPromise);
      mockErrorHandler.withRetry
        .mockReturnValueOnce(submitPromise)
        .mockReturnValueOnce(convertPromise);

      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Click both buttons
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const approvedCard = screen
        .getByText('PR-2026-003')
        .closest('div[style*="background: white"]');

      fireEvent.click(within(draftCard!).getByText('Submit'));
      fireEvent.click(within(approvedCard!).getByText('Convert to PO'));

      // Both should be in loading state
      expect(within(draftCard!).getByText('Submitting...')).toBeDisabled();
      expect(within(approvedCard!).getByText('Converting...')).toBeDisabled();

      // Resolve both operations
      resolveSubmit!({ ...mockDraftRequisition, status: RequisitionStatus.SUBMITTED });
      resolveConvert!({ id: 1, po_number: 'PO-2026-001' });

      // Wait for both to complete
      await waitFor(() => {
        expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
        expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(3);
      });

      // Restore original confirm
      window.confirm = originalConfirm;
    });

    it('should show appropriate action buttons based on status', async () => {
      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
        expect(screen.getByText('PR-2026-002')).toBeInTheDocument();
        expect(screen.getByText('PR-2026-003')).toBeInTheDocument();
      });

      // Draft requisition should have Submit and Edit buttons
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      expect(within(draftCard!).getByText('Submit')).toBeInTheDocument();
      expect(within(draftCard!).getByText('Edit')).toBeInTheDocument();
      expect(within(draftCard!).queryByText('Convert to PO')).not.toBeInTheDocument();

      // Submitted requisition should have Approve and Reject buttons
      const submittedCard = screen
        .getByText('PR-2026-002')
        .closest('div[style*="background: white"]');
      expect(within(submittedCard!).getByText('Approve')).toBeInTheDocument();
      expect(within(submittedCard!).getByText('Reject')).toBeInTheDocument();
      expect(within(submittedCard!).queryByText('Submit')).not.toBeInTheDocument();

      // Approved requisition should have Convert to PO button
      const approvedCard = screen
        .getByText('PR-2026-003')
        .closest('div[style*="background: white"]');
      expect(within(approvedCard!).getByText('Convert to PO')).toBeInTheDocument();
      expect(within(approvedCard!).queryByText('Submit')).not.toBeInTheDocument();
      expect(within(approvedCard!).queryByText('Approve')).not.toBeInTheDocument();
    });
  });

  describe('Search and Filtering', () => {
    it('should filter requisitions by search query', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find search input and type
      const searchInput = screen.getByPlaceholderText(
        'Search by PR number, title, or requester...'
      );
      await user.type(searchInput, 'Office Supplies');

      // Should trigger API call with search parameter
      await waitFor(() => {
        expect(mockProcurementService.getPurchaseRequisitions).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'Office Supplies',
          })
        );
      });
    });

    it('should filter requisitions by status', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find status filter and select
      const statusFilter = screen.getByDisplayValue('All Status');
      await user.selectOptions(statusFilter, RequisitionStatus.DRAFT);

      // Should trigger API call with status filter
      await waitFor(() => {
        expect(mockProcurementService.getPurchaseRequisitions).toHaveBeenCalledWith(
          expect.objectContaining({
            status: RequisitionStatus.DRAFT,
          })
        );
      });
    });

    it('should handle empty search results', async () => {
      mockProcurementService.getPurchaseRequisitions.mockResolvedValue({
        results: [],
        count: 0,
        next: null,
        previous: null,
      });

      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Should show empty state
      await waitFor(() => {
        expect(screen.getByText('No Purchase Requisitions Found')).toBeInTheDocument();
        expect(screen.getByText('No requisitions match your current filters.')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation and Routing', () => {
    it('should navigate to create page when clicking Create button', async () => {
      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Find and click create button
      const createButton = screen.getByText('Create Requisition');
      fireEvent.click(createButton);

      // Should navigate to create page
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/create');
    });

    it('should navigate to view page when clicking View button', async () => {
      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find and click view button
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const viewButton = within(draftCard!).getByText('View');
      fireEvent.click(viewButton);

      // Should navigate to view page
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/1/view');
    });

    it('should navigate to edit page when clicking Edit button', async () => {
      render(
        <TestWrapper>
          <RequisitionListPage />
        </TestWrapper>
      );

      // Wait for requisitions to load
      await waitFor(() => {
        expect(screen.getByText('PR-2026-001')).toBeInTheDocument();
      });

      // Find and click edit button
      const draftCard = screen.getByText('PR-2026-001').closest('div[style*="background: white"]');
      const editButton = within(draftCard!).getByText('Edit');
      fireEvent.click(editButton);

      // Should navigate to edit page
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/1/edit');
    });
  });
});
