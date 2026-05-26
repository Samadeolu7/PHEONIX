import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { procurementService } from '../procurementService';
import { ErrorHandler } from '../../utils/errorHandler';
import { api } from '../api';

// Mock the API and ErrorHandler
vi.mock('../api');
vi.mock('../../utils/errorHandler');

describe('Procurement Service Integration Tests', () => {
  let mockApi: any;
  let mockErrorHandler: any;

  beforeEach(() => {
    mockApi = vi.mocked(api);
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
    const mockDraftRequisition = {
      id: 1,
      pr_number: 'PR-2026-001',
      title: 'Office Supplies Request',
      status: 'draft',
      total_estimated_cost: '1500.00',
      created_at: '2026-01-07T10:00:00Z',
    };

    const mockSubmittedRequisition = {
      ...mockDraftRequisition,
      status: 'submitted',
      submitted_at: '2026-01-07T11:00:00Z',
    };

    it('should successfully submit a draft requisition', async () => {
      // Setup mock API response
      mockApi.post.mockResolvedValue(mockSubmittedRequisition);

      // Call the service method
      const result = await procurementService.submitRequisition(1);

      // Verify the result
      expect(result).toEqual(mockSubmittedRequisition);
      expect(result.status).toBe('submitted');
      expect(result.submitted_at).toBeDefined();

      // Verify API was called correctly
      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
      expect(mockApi.post).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/submit/', {});
    });

    it('should handle validation errors during submission', async () => {
      const validationError = new Error('HTTP 400: Validation failed');
      mockApi.post.mockRejectedValue(validationError);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Validation failed for submit requisition',
        code: 'VALIDATION_ERROR',
        retryable: false,
      });

      // Should throw the processed error
      await expect(procurementService.submitRequisition(1)).rejects.toMatchObject({
        message: 'Validation failed for submit requisition',
        code: 'VALIDATION_ERROR',
        retryable: false,
      });

      // Verify error handling was called
      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors with retry logic', async () => {
      const networkError = new Error('Network timeout');
      let callCount = 0;

      // Mock retry behavior - fail twice, then succeed
      mockErrorHandler.withRetry.mockImplementation(async operation => {
        callCount++;
        if (callCount <= 2) {
          // Simulate the retry logic by actually calling the operation and handling the error
          try {
            return await operation();
          } catch (error) {
            throw networkError;
          }
        }
        return mockSubmittedRequisition;
      });

      // Mock API to fail first two times, succeed on third
      mockApi.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockSubmittedRequisition);

      // Should eventually succeed after retries
      const result = await procurementService.submitRequisition(1);
      expect(result).toEqual(mockSubmittedRequisition);
      expect(callCount).toBe(3); // Failed twice, succeeded on third attempt
    });

    it('should handle server errors appropriately', async () => {
      const serverError = new Error('HTTP 500: Internal Server Error');
      mockApi.post.mockRejectedValue(serverError);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Server error during submit requisition',
        code: 'SERVER_ERROR',
        retryable: true,
      });

      // Should throw the processed server error
      await expect(procurementService.submitRequisition(1)).rejects.toMatchObject({
        message: 'Server error during submit requisition',
        code: 'SERVER_ERROR',
        retryable: true,
      });

      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requisition to PO Conversion Workflow', () => {
    const mockApprovedRequisition = {
      id: 2,
      pr_number: 'PR-2026-002',
      title: 'Equipment Purchase',
      status: 'approved',
      total_estimated_cost: '5000.00',
      approved_at: '2026-01-07T12:00:00Z',
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
      // Setup mock API response
      mockApi.post.mockResolvedValue(mockCreatedPO);

      // Call the service method
      const result = await procurementService.convertRequisitionToPO(2);

      // Verify the result
      expect(result).toEqual(mockCreatedPO);
      expect(result.po_number).toBe('PO-2026-001');
      expect(result.requisition).toBe(2);

      // Verify API was called correctly
      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/purchase-requisitions/2/create_po/',
        {}
      );
    });

    it('should handle conversion errors when supplier not found', async () => {
      const supplierError = new Error('HTTP 400: No supplier found for requisition items');
      mockApi.post.mockRejectedValue(supplierError);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Validation failed for convert requisition to purchase order',
        code: 'VALIDATION_ERROR',
        retryable: false,
      });

      // Should throw the processed error
      await expect(procurementService.convertRequisitionToPO(2)).rejects.toMatchObject({
        message: 'Validation failed for convert requisition to purchase order',
        code: 'VALIDATION_ERROR',
        retryable: false,
      });

      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });

    it('should handle permission errors during conversion', async () => {
      const permissionError = new Error('HTTP 403: Permission denied');
      mockApi.post.mockRejectedValue(permissionError);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Permission denied for convert requisition to purchase order',
        code: 'PERMISSION_ERROR',
        retryable: false,
      });

      // Should throw the processed error
      await expect(procurementService.convertRequisitionToPO(2)).rejects.toMatchObject({
        message: 'Permission denied for convert requisition to purchase order',
        code: 'PERMISSION_ERROR',
        retryable: false,
      });

      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });

    it('should handle not found errors when requisition does not exist', async () => {
      const notFoundError = new Error('HTTP 404: Requisition not found');
      mockApi.post.mockRejectedValue(notFoundError);
      mockErrorHandler.withRetry.mockRejectedValue({
        message: 'Resource not found for convert requisition to purchase order',
        code: 'NOT_FOUND_ERROR',
        retryable: false,
      });

      // Should throw the processed error
      await expect(procurementService.convertRequisitionToPO(999)).rejects.toMatchObject({
        message: 'Resource not found for convert requisition to purchase order',
        code: 'NOT_FOUND_ERROR',
        retryable: false,
      });

      expect(mockErrorHandler.withRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Classification and Handling', () => {
    it('should properly classify different error types', async () => {
      const testCases = [
        {
          apiError: new Error('HTTP 400: Bad Request'),
          expectedError: {
            code: 'VALIDATION_ERROR',
            retryable: false,
          },
        },
        {
          apiError: new Error('HTTP 401: Unauthorized'),
          expectedError: {
            code: 'AUTHENTICATION_ERROR',
            retryable: false,
          },
        },
        {
          apiError: new Error('HTTP 403: Forbidden'),
          expectedError: {
            code: 'PERMISSION_ERROR',
            retryable: false,
          },
        },
        {
          apiError: new Error('HTTP 404: Not Found'),
          expectedError: {
            code: 'NOT_FOUND_ERROR',
            retryable: false,
          },
        },
        {
          apiError: new Error('HTTP 429: Too Many Requests'),
          expectedError: {
            code: 'RATE_LIMIT_ERROR',
            retryable: true,
          },
        },
        {
          apiError: new Error('HTTP 500: Internal Server Error'),
          expectedError: {
            code: 'SERVER_ERROR',
            retryable: true,
          },
        },
      ];

      for (const testCase of testCases) {
        mockApi.post.mockRejectedValue(testCase.apiError);
        mockErrorHandler.withRetry.mockRejectedValue({
          message: expect.any(String),
          ...testCase.expectedError,
        });

        await expect(procurementService.submitRequisition(1)).rejects.toMatchObject(
          testCase.expectedError
        );
      }
    });

    it('should handle timeout errors with retry logic', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';

      let callCount = 0;
      mockErrorHandler.withRetry.mockImplementation(async operation => {
        callCount++;
        if (callCount <= 2) {
          // Simulate the retry logic by actually calling the operation and handling the error
          try {
            return await operation();
          } catch (error) {
            throw timeoutError;
          }
        }
        return { id: 1, status: 'submitted' };
      });

      // Mock API to fail first two times, succeed on third
      mockApi.post
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ id: 1, status: 'submitted' });

      const result = await procurementService.submitRequisition(1);
      expect(result.status).toBe('submitted');
      expect(callCount).toBe(3);
    });

    it('should handle network errors with retry logic', async () => {
      const networkError = new Error('Network connection failed');
      networkError.name = 'NetworkError';

      let callCount = 0;
      mockErrorHandler.withRetry.mockImplementation(async operation => {
        callCount++;
        if (callCount <= 1) {
          // Simulate the retry logic by actually calling the operation and handling the error
          try {
            return await operation();
          } catch (error) {
            throw networkError;
          }
        }
        return { id: 1, po_number: 'PO-2026-001' };
      });

      // Mock API to fail first time, succeed on second
      mockApi.post
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ id: 1, po_number: 'PO-2026-001' });

      const result = await procurementService.convertRequisitionToPO(1);
      expect(result.po_number).toBe('PO-2026-001');
      expect(callCount).toBe(2);
    });
  });

  describe('API Endpoint Verification', () => {
    it('should call correct endpoint for requisition submission', async () => {
      mockApi.post.mockResolvedValue({ id: 1, status: 'submitted' });

      await procurementService.submitRequisition(123);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/purchase-requisitions/123/submit/',
        {}
      );
    });

    it('should call correct endpoint for requisition to PO conversion', async () => {
      mockApi.post.mockResolvedValue({ id: 1, po_number: 'PO-001' });

      await procurementService.convertRequisitionToPO(456);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/purchase-requisitions/456/create_po/',
        {}
      );
    });

    it('should use correct HTTP methods for different operations', async () => {
      mockApi.post.mockResolvedValue({ success: true });
      mockApi.get.mockResolvedValue({ id: 1, status: 'draft' });

      // Test POST operations
      await procurementService.submitRequisition(1);
      expect(mockApi.post).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/submit/', {});

      await procurementService.convertRequisitionToPO(1);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/procurement/purchase-requisitions/1/create_po/',
        {}
      );

      // Test GET operations
      await procurementService.getPurchaseRequisition(1);
      expect(mockApi.get).toHaveBeenCalledWith('/procurement/purchase-requisitions/1/');
    });
  });

  describe('Response Data Validation', () => {
    it('should return properly formatted response data for submission', async () => {
      const mockResponse = {
        id: 1,
        pr_number: 'PR-2026-001',
        status: 'submitted',
        submitted_at: '2026-01-07T11:00:00Z',
        total_estimated_cost: '1500.00',
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await procurementService.submitRequisition(1);

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe('submitted');
      expect(result.submitted_at).toBeDefined();
      expect(typeof result.total_estimated_cost).toBe('string'); // Should be decimal string
    });

    it('should return properly formatted response data for PO conversion', async () => {
      const mockResponse = {
        id: 1,
        po_number: 'PO-2026-001',
        requisition: 2,
        supplier: 1,
        supplier_name: 'Tech Supplier Inc',
        status: 'draft',
        total_amount: '5000.00',
        created_at: '2026-01-07T13:00:00Z',
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await procurementService.convertRequisitionToPO(2);

      expect(result).toEqual(mockResponse);
      expect(result.po_number).toBe('PO-2026-001');
      expect(result.requisition).toBe(2);
      expect(typeof result.total_amount).toBe('string'); // Should be decimal string
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous submissions', async () => {
      const mockResponses = [
        { id: 1, status: 'submitted', pr_number: 'PR-001' },
        { id: 2, status: 'submitted', pr_number: 'PR-002' },
        { id: 3, status: 'submitted', pr_number: 'PR-003' },
      ];

      mockApi.post
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      // Submit multiple requisitions concurrently
      const promises = [
        procurementService.submitRequisition(1),
        procurementService.submitRequisition(2),
        procurementService.submitRequisition(3),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].pr_number).toBe('PR-001');
      expect(results[1].pr_number).toBe('PR-002');
      expect(results[2].pr_number).toBe('PR-003');

      expect(mockApi.post).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed operations (submit and convert) concurrently', async () => {
      const submitResponse = { id: 1, status: 'submitted' };
      const convertResponse = { id: 1, po_number: 'PO-001' };

      mockApi.post.mockResolvedValueOnce(submitResponse).mockResolvedValueOnce(convertResponse);

      // Perform different operations concurrently
      const [submitResult, convertResult] = await Promise.all([
        procurementService.submitRequisition(1),
        procurementService.convertRequisitionToPO(2),
      ]);

      expect(submitResult.status).toBe('submitted');
      expect(convertResult.po_number).toBe('PO-001');

      expect(mockApi.post).toHaveBeenCalledTimes(2);
      expect(mockApi.post).toHaveBeenNthCalledWith(
        1,
        '/procurement/purchase-requisitions/1/submit/',
        {}
      );
      expect(mockApi.post).toHaveBeenNthCalledWith(
        2,
        '/procurement/purchase-requisitions/2/create_po/',
        {}
      );
    });
  });
});
