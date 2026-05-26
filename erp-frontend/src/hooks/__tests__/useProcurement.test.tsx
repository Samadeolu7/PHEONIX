// src/hooks/__tests__/useProcurement.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useSubmitRequisition,
  useConvertRequisitionToPO,
} from '../useProcurement';
import { procurementService } from '../../services/procurementService';

// Mock the procurement service
vi.mock('../../services/procurementService', () => ({
  procurementService: {
    getPurchaseOrders: vi.fn(),
    createPurchaseOrder: vi.fn(),
    getPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    deletePurchaseOrder: vi.fn(),
    submitRequisition: vi.fn(),
    convertRequisitionToPO: vi.fn(),
  },
}));

const mockProcurementService = vi.mocked(procurementService);

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useProcurement hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usePurchaseOrders', () => {
    it('should fetch purchase orders successfully', async () => {
      const mockData = {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            po_number: 'PO-2024-001',
            supplier_name: 'Supplier 1',
            status: 'draft' as const,
            total_amount: '1000.00',
          },
          {
            id: 2,
            po_number: 'PO-2024-002',
            supplier_name: 'Supplier 2',
            status: 'approved' as const,
            total_amount: '2000.00',
          },
        ],
      };

      mockProcurementService.getPurchaseOrders.mockResolvedValue(mockData);

      const { result } = renderHook(() => usePurchaseOrders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(mockProcurementService.getPurchaseOrders).toHaveBeenCalledWith(undefined);
    });

    it('should fetch purchase orders with parameters', async () => {
      const params = { search: 'test', status: 'draft' };
      const mockData = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            po_number: 'PO-2024-001',
            supplier_name: 'Test Supplier',
            status: 'draft' as const,
            total_amount: '1000.00',
          },
        ],
      };

      mockProcurementService.getPurchaseOrders.mockResolvedValue(mockData);

      const { result } = renderHook(() => usePurchaseOrders(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(mockProcurementService.getPurchaseOrders).toHaveBeenCalledWith(params);
    });

    it('should handle error when fetching purchase orders', async () => {
      const errorMessage = 'Failed to fetch purchase orders';
      mockProcurementService.getPurchaseOrders.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => usePurchaseOrders(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(errorMessage);
    });
  });

  describe('useCreatePurchaseOrder', () => {
    it('should create purchase order successfully', async () => {
      const mockPO = {
        id: 1,
        po_number: 'PO-2024-001',
        supplier: 1,
        supplier_name: 'Test Supplier',
        status: 'draft' as const,
        total_amount: '1000.00',
        items: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const createData = {
        supplier: 1,
        delivery_location: 1,
        payment_terms: 'net_30' as const,
        items: [
          {
            item_id: 1,
            quantity: 10,
            unit_price: '100.00',
          },
        ],
      };

      mockProcurementService.createPurchaseOrder.mockResolvedValue(mockPO);

      const { result } = renderHook(() => useCreatePurchaseOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPO);
      expect(mockProcurementService.createPurchaseOrder).toHaveBeenCalledWith(createData);
    });

    it('should handle error when creating purchase order', async () => {
      const errorMessage = 'Failed to create purchase order';
      const createData = {
        supplier: 1,
        delivery_location: 1,
        payment_terms: 'net_30' as const,
        items: [],
      };

      mockProcurementService.createPurchaseOrder.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useCreatePurchaseOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createData);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(errorMessage);
    });
  });

  describe('useSubmitRequisition', () => {
    it('should submit requisition successfully', async () => {
      const requisitionId = 1;
      const mockUpdatedRequisition = {
        id: requisitionId,
        requisition_number: 'REQ-2024-001',
        status: 'submitted' as const,
        requester_name: 'John Doe',
        department_name: 'IT',
        total_amount: '1500.00',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockProcurementService.submitRequisition.mockResolvedValue(mockUpdatedRequisition);

      const { result } = renderHook(() => useSubmitRequisition(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUpdatedRequisition);
      expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(requisitionId);
    });

    it('should handle error when submitting requisition', async () => {
      const requisitionId = 1;
      const errorMessage = 'Failed to submit requisition';

      mockProcurementService.submitRequisition.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSubmitRequisition(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(errorMessage);
      expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(requisitionId);
    });

    it('should handle validation error when submitting requisition', async () => {
      const requisitionId = 1;
      const validationError = {
        message: 'HTTP 400',
        code: 'VALIDATION_ERROR',
        details: { field: 'items', message: 'At least one item is required' },
      };

      mockProcurementService.submitRequisition.mockRejectedValue(validationError);

      const { result } = renderHook(() => useSubmitRequisition(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(validationError);
      expect(mockProcurementService.submitRequisition).toHaveBeenCalledWith(requisitionId);
    });

    it('should handle authentication error when submitting requisition', async () => {
      const requisitionId = 1;
      const authError = {
        message: 'HTTP 401',
        code: 'AUTHENTICATION_ERROR',
      };

      mockProcurementService.submitRequisition.mockRejectedValue(authError);

      const { result } = renderHook(() => useSubmitRequisition(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(authError);
    });
  });

  describe('useConvertRequisitionToPO', () => {
    it('should convert requisition to PO successfully', async () => {
      const requisitionId = 1;
      const mockNewPO = {
        id: 10,
        po_number: 'PO-2024-010',
        requisition: requisitionId,
        supplier: 1,
        supplier_name: 'Test Supplier',
        status: 'draft' as const,
        total_amount: '1500.00',
        subtotal: '1500.00',
        delivery_location: 1,
        location_name: 'Main Warehouse',
        payment_terms: 'net_30' as const,
        received_percentage: '0.00',
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockProcurementService.convertRequisitionToPO.mockResolvedValue(mockNewPO);

      const { result } = renderHook(() => useConvertRequisitionToPO(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockNewPO);
      expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(requisitionId);
    });

    it('should handle error when converting requisition to PO', async () => {
      const requisitionId = 1;
      const errorMessage = 'Failed to convert requisition to PO';

      mockProcurementService.convertRequisitionToPO.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useConvertRequisitionToPO(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(errorMessage);
      expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(requisitionId);
    });

    it('should handle permission error when converting requisition to PO', async () => {
      const requisitionId = 1;
      const permissionError = {
        message: 'HTTP 403',
        code: 'PERMISSION_ERROR',
        details: { message: 'Only approved requisitions can be converted to PO' },
      };

      mockProcurementService.convertRequisitionToPO.mockRejectedValue(permissionError);

      const { result } = renderHook(() => useConvertRequisitionToPO(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(permissionError);
    });

    it('should handle not found error when converting non-existent requisition', async () => {
      const requisitionId = 999;
      const notFoundError = {
        message: 'HTTP 404',
        code: 'NOT_FOUND_ERROR',
        details: { message: 'Requisition not found' },
      };

      mockProcurementService.convertRequisitionToPO.mockRejectedValue(notFoundError);

      const { result } = renderHook(() => useConvertRequisitionToPO(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(notFoundError);
    });

    it('should handle server error with retry logic', async () => {
      const requisitionId = 1;
      const serverError = {
        message: 'HTTP 500',
        code: 'SERVER_ERROR',
        retryable: true,
      };

      mockProcurementService.convertRequisitionToPO.mockRejectedValue(serverError);

      const { result } = renderHook(() => useConvertRequisitionToPO(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(requisitionId);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(serverError);
      // Verify the service was called (retry logic is handled at service level)
      expect(mockProcurementService.convertRequisitionToPO).toHaveBeenCalledWith(requisitionId);
    });
  });
});
