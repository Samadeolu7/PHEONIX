import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  useSubmitRequisition,
  useConvertRequisitionToPO,
  usePurchaseRequisition,
} from '../useProcurement';
import { procurementService } from '../../services/procurementService';
import { ErrorHandler } from '../../utils/errorHandler';
import { ToastProvider } from '../../contexts/ToastContext';
import { PurchaseRequisition, RequisitionStatus } from '../../types/procurement';

// Mock the services
vi.mock('../../services/procurementService');
vi.mock('../../utils/errorHandler');

// Test component that uses the hooks
const TestComponent: React.FC<{ requisitionId: number }> = ({ requisitionId }) => {
  const { data: requisition, isLoading, error } = usePurchaseRequisition(requisitionId);
  const submitMutation = useSubmitRequisition();
  const convertMutation = useConvertRequisitionToPO();

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(requisitionId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleConvert = async () => {
    try {
      await convertMutation.mutateAsync(requisitionId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!requisition) return <div>No requisition found</div>;

  return (
    <div>
      <div data-testid="requisition-status">{requisition.status}</div>
      <div data-testid="requisition-number">{requisition.pr_number}</div>
      <div data-testid="requisition-title">{requisition.title}</div>

      <button
        onClick={handleSubmit}
        disabled={submitMutation.isPending}
        data-testid="submit-button"
      >
        {submitMutation.isPending ? 'Submitting...' : 'Submit Requisition'}
      </button>

      <button
        onClick={handleConvert}
        disabled={convertMutation.isPending}
        data-testid="convert-button"
      >
        {convertMutation.isPending ? 'Converting...' : 'Convert to PO'}
      </button>

      {submitMutation.isError && (
        <div data-testid="submit-error">Submit Error: {submitMutation.error?.message}</div>
      )}

      {convertMutation.isError && (
        <div data-testid="convert-error">Convert Error: {convertMutation.error?.message}</div>
      )}

      {submitMutation.isSuccess && (
        <div data-testid="submit-success">Requisition submitted successfully!</div>
      )}

      {convertMutation.isSuccess && (
        <div data-testid="convert-success">Requisition converted to PO successfully!</div>
      )}
    </div>
  );
};

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      <BrowserRouter>
        <ToastProvider>{children}</ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Procurement Workflow End-to-End Tests', () => {
  let mockProcurementService: any;
  let mockErrorHandler: any;

  beforeEach(() => {
    mockProcurementService = vi.mocked(procurementService);
    mockErrorHandler = vi.mocked(ErrorHandler);

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default error handler behavior
    mockErrorHandler.withRetry.mockImplementation(async operation => {
      return await operation();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Requisition Submission Workflow', () => {
    const mockDraftRequisition: PurchaseRequisition = {
      id: 1,
      pr_number: 'PR-2026-001',
      title: 'Office Supplies Request',
      status: RequisitionStatus.DRAFT,
      priority: 'medium',
      justification: 'Need office supplies for Q1',
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
      status: RequisitionStatus.SUBMITTED,
      submitted_at: '2026-01-07T11:00:00Z',
    };

    it('should successfully submit a draft requisition', async () => {
      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockDraftRequisition);
      mockProcurementService.submitRequisition.mockResolvedValue(mockSubmittedRequisition);

      render(
        <TestWrapper>
          <TestComponent requisitionId={1} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // Verify initial state
      expect(screen.getByTestId('requisition-number')).toHaveTextContent('PR-2026-001');
      expect(screen.getByTestId('requisition-title')).toHaveTextContent('Office Supplies Request');

      // Click submit button
      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).not.toBeDisabled();

      fireEvent.click(submitButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByTestId('submit-button')).toHaveTextContent('Submitting...');
        expect(screen.getByTestId('submit-button')).toBeDisabled();
      });

      // Wait for success
      await waitFor(() => {
        expect(screen.getByTestId('submit-success')).toBeInTheDocument();
      });

      // Verify service was called correctly
      expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(1);
      expect(mockProcurementService.submitRequisition).toHaveBeenCalledTimes(1);
    });

    it('should handle submission errors gracefully', async () => {
      const mockError = new Error('Validation failed: Missing required fields');

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockDraftRequisition);
      mockProcurementService.submitRequisition.mockRejectedValue(mockError);
      mockErrorHandler.withRetry.mockRejectedValue(mockError);

      render(
        <TestWrapper>
          <TestComponent requisitionId={1} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // Click submit button
      fireEvent.click(screen.getByTestId('submit-button'));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('submit-error')).toHaveTextContent(
          'Submit Error: Validation failed: Missing required fields'
        );
      });

      // Verify button is re-enabled after error
      expect(screen.getByTestId('submit-button')).not.toBeDisabled();
      expect(screen.getByTestId('submit-button')).toHaveTextContent('Submit Requisition');
    });

    it('should handle network errors with retry logic', async () => {
      const networkError = new Error('Network error');
      let callCount = 0;

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockDraftRequisition);

      // Mock retry behavior - fail twice, then succeed
      mockErrorHandler.withRetry.mockImplementation(async operation => {
        callCount++;
        if (callCount <= 2) {
          throw networkError;
        }
        return mockSubmittedRequisition;
      });

      render(
        <TestWrapper>
          <TestComponent requisitionId={1} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // Click submit button
      fireEvent.click(screen.getByTestId('submit-button'));

      // Wait for success after retries
      await waitFor(
        () => {
          expect(screen.getByTestId('submit-success')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Verify retry logic was used
      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requisition to PO Conversion Workflow', () => {
    const mockApprovedRequisition: PurchaseRequisition = {
      id: 2,
      pr_number: 'PR-2026-002',
      title: 'Equipment Purchase',
      status: RequisitionStatus.APPROVED,
      priority: 'high',
      justification: 'Critical equipment needed',
      total_estimated_cost: '5000.00',
      expected_delivery_date: '2026-02-20',
      approved_at: '2026-01-07T12:00:00Z',
      approved_by: {
        id: 2,
        first_name: 'Jane',
        last_name: 'Manager',
        email: 'jane.manager@company.com',
      },
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
            id: 2,
            name: 'Server',
            sku: 'SRV-001',
            description: 'Database server',
          },
          quantity: '1',
          estimated_unit_cost: '5000.00',
          estimated_total_cost: '5000.00',
          specifications: 'High-end server',
          justification: 'Database upgrade',
        },
      ],
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T12:00:00Z',
    };

    const mockCreatedPO = {
      id: 1,
      po_number: 'PO-2026-001',
      requisition: 2,
      supplier: 1,
      supplier_name: 'Tech Supplier Inc',
      status: 'draft',
      total_amount: '5000.00',
      created_at: '2026-01-07T13:00:00Z',
    };

    it('should successfully convert approved requisition to PO', async () => {
      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockApprovedRequisition);
      mockProcurementService.convertRequisitionToPO.mockResolvedValue(mockCreatedPO);

      render(
        <TestWrapper>
          <TestComponent requisitionId={2} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('approved');
      });

      // Verify initial state
      expect(screen.getByTestId('requisition-number')).toHaveTextContent('PR-2026-002');
      expect(screen.getByTestId('requisition-title')).toHaveTextContent('Equipment Purchase');

      // Click convert button
      const convertButton = screen.getByTestId('convert-button');
      expect(convertButton).not.toBeDisabled();

      fireEvent.click(convertButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByTestId('convert-button')).toHaveTextContent('Converting...');
        expect(screen.getByTestId('convert-button')).toBeDisabled();
      });

      // Wait for success
      await waitFor(() => {
        expect(screen.getByTestId('convert-success')).toBeInTheDocument();
      });

      // Verify service was called correctly
      expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(2);
      expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledTimes(1);
    });

    it('should handle conversion errors gracefully', async () => {
      const mockError = new Error('Supplier not found for requisition items');

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockApprovedRequisition);
      mockProcurementService.convertRequisitionToPO.mockRejectedValue(mockError);
      mockErrorHandler.withRetry.mockRejectedValue(mockError);

      render(
        <TestWrapper>
          <TestComponent requisitionId={2} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('approved');
      });

      // Click convert button
      fireEvent.click(screen.getByTestId('convert-button'));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('convert-error')).toHaveTextContent(
          'Convert Error: Supplier not found for requisition items'
        );
      });

      // Verify button is re-enabled after error
      expect(screen.getByTestId('convert-button')).not.toBeDisabled();
      expect(screen.getByTestId('convert-button')).toHaveTextContent('Convert to PO');
    });

    it('should handle server errors with proper error messages', async () => {
      const serverError = new Error('HTTP 500: Internal Server Error');

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockApprovedRequisition);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Server error during convert requisition to purchase order',
        code: 'SERVER_ERROR',
        retryable: true,
      });

      render(
        <TestWrapper>
          <TestComponent requisitionId={2} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('approved');
      });

      // Click convert button
      fireEvent.click(screen.getByTestId('convert-button'));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('convert-error')).toBeInTheDocument();
      });

      // Verify error handling was called
      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI Feedback and Loading States', () => {
    const mockRequisition: PurchaseRequisition = {
      id: 3,
      pr_number: 'PR-2026-003',
      title: 'Test Requisition',
      status: RequisitionStatus.DRAFT,
      priority: 'medium',
      justification: 'Test justification',
      total_estimated_cost: '1000.00',
      expected_delivery_date: '2026-02-10',
      requester: {
        id: 1,
        first_name: 'Test',
        last_name: 'User',
        email: 'test@company.com',
      },
      department: {
        id: 1,
        name: 'Test Department',
        code: 'TEST',
      },
      items: [],
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    it('should show proper loading states during operations', async () => {
      let resolveSubmit: (value: any) => void;
      const submitPromise = new Promise(resolve => {
        resolveSubmit = resolve;
      });

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockRequisition);
      mockProcurementService.submitRequisition.mockReturnValue(submitPromise);
      mockErrorHandler.withRetry.mockReturnValue(submitPromise);

      render(
        <TestWrapper>
          <TestComponent requisitionId={3} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // Click submit button
      fireEvent.click(screen.getByTestId('submit-button'));

      // Verify loading state immediately
      expect(screen.getByTestId('submit-button')).toHaveTextContent('Submitting...');
      expect(screen.getByTestId('submit-button')).toBeDisabled();

      // Resolve the promise
      resolveSubmit!({ ...mockRequisition, status: RequisitionStatus.SUBMITTED });

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByTestId('submit-success')).toBeInTheDocument();
      });

      // Verify button is back to normal state
      expect(screen.getByTestId('submit-button')).not.toBeDisabled();
    });

    it('should handle concurrent operations properly', async () => {
      // Setup mocks for concurrent operations
      mockProcurementService.getPurchaseRequisition.mockResolvedValue({
        ...mockRequisition,
        status: RequisitionStatus.APPROVED,
      });

      let resolveSubmit: (value: any) => void;
      let resolveConvert: (value: any) => void;

      const submitPromise = new Promise(resolve => {
        resolveSubmit = resolve;
      });

      const convertPromise = new Promise(resolve => {
        resolveConvert = resolve;
      });

      mockErrorHandler.withRetry
        .mockReturnValueOnce(submitPromise)
        .mockReturnValueOnce(convertPromise);

      render(
        <TestWrapper>
          <TestComponent requisitionId={3} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('approved');
      });

      // Click both buttons quickly
      fireEvent.click(screen.getByTestId('submit-button'));
      fireEvent.click(screen.getByTestId('convert-button'));

      // Verify both are in loading state
      expect(screen.getByTestId('submit-button')).toBeDisabled();
      expect(screen.getByTestId('convert-button')).toBeDisabled();

      // Resolve operations
      resolveSubmit!({ ...mockRequisition, status: RequisitionStatus.SUBMITTED });
      resolveConvert!({ id: 1, po_number: 'PO-2026-001' });

      // Wait for both to complete
      await waitFor(() => {
        expect(screen.getByTestId('submit-success')).toBeInTheDocument();
        expect(screen.getByTestId('convert-success')).toBeInTheDocument();
      });
    });
  });

  describe('Error Recovery and User Experience', () => {
    const mockRequisition: PurchaseRequisition = {
      id: 4,
      pr_number: 'PR-2026-004',
      title: 'Error Test Requisition',
      status: RequisitionStatus.DRAFT,
      priority: 'low',
      justification: 'Error testing',
      total_estimated_cost: '500.00',
      expected_delivery_date: '2026-02-05',
      requester: {
        id: 1,
        first_name: 'Error',
        last_name: 'Tester',
        email: 'error@company.com',
      },
      department: {
        id: 1,
        name: 'QA Department',
        code: 'QA',
      },
      items: [],
      created_at: '2026-01-07T10:00:00Z',
      updated_at: '2026-01-07T10:00:00Z',
    };

    it('should allow retry after failed operations', async () => {
      let attemptCount = 0;

      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockRequisition);

      mockErrorHandler.withRetry.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Network timeout');
        }
        return { ...mockRequisition, status: RequisitionStatus.SUBMITTED };
      });

      render(
        <TestWrapper>
          <TestComponent requisitionId={4} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // First attempt - should fail
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('submit-error')).toBeInTheDocument();
      });

      // Second attempt - should succeed
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('submit-success')).toBeInTheDocument();
      });

      expect(attemptCount).toBe(2);
    });

    it('should clear previous errors when starting new operations', async () => {
      // Setup mocks
      mockProcurementService.getPurchaseRequisition.mockResolvedValue(mockRequisition);

      mockErrorHandler.withRetry
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({ ...mockRequisition, status: RequisitionStatus.SUBMITTED });

      render(
        <TestWrapper>
          <TestComponent requisitionId={4} />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('requisition-status')).toHaveTextContent('draft');
      });

      // First attempt - should fail
      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('submit-error')).toHaveTextContent('Submit Error: First error');
      });

      // Second attempt - should succeed and clear error
      fireEvent.click(screen.getByTestId('submit-button'));

      // Error should be cleared during loading
      await waitFor(() => {
        expect(screen.getByTestId('submit-button')).toHaveTextContent('Submitting...');
      });

      // Should not show old error
      expect(screen.queryByTestId('submit-error')).not.toBeInTheDocument();

      // Should show success
      await waitFor(() => {
        expect(screen.getByTestId('submit-success')).toBeInTheDocument();
      });
    });
  });
});
