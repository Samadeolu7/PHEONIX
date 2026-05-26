// src/hooks/__tests__/useInventory.integration.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useItemStockLevels,
  useItemMovements,
  useCreateStockAdjustment,
  useCreateStockTransfer,
} from '../useInventory';
import { inventoryService } from '../../services/inventoryService';
import React from 'react';

// Mock the inventory service
vi.mock('../../services/inventoryService', () => ({
  inventoryService: {
    getItemStockLevels: vi.fn(),
    getItemMovements: vi.fn(),
    createStockAdjustment: vi.fn(),
    createStockTransfer: vi.fn(),
  },
}));

const mockInventoryService = vi.mocked(inventoryService);

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useInventory Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useItemStockLevels', () => {
    it('should fetch item stock levels successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            item: 1,
            item_name: 'Test Item',
            item_sku: 'TEST-001',
            location: 1,
            location_name: 'Main Warehouse',
            location_code: 'MW',
            quantity_on_hand: '100.00',
            quantity_reserved: '10.00',
            quantity_available: '90.00',
            average_cost: '5.00',
            total_value: '500.00',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockInventoryService.getItemStockLevels.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useItemStockLevels(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInventoryService.getItemStockLevels).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle empty stock levels gracefully', async () => {
      const mockResponse = {
        count: 0,
        next: null,
        previous: null,
        results: [],
      };

      mockInventoryService.getItemStockLevels.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useItemStockLevels(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.data?.results).toHaveLength(0);
    });

    it('should not fetch when itemId is not provided', () => {
      renderHook(() => useItemStockLevels(0), {
        wrapper: createWrapper(),
      });

      expect(mockInventoryService.getItemStockLevels).not.toHaveBeenCalled();
    });
  });

  describe('useItemMovements', () => {
    it('should fetch item movements successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            item: 1,
            item_name: 'Test Item',
            item_sku: 'TEST-001',
            from_location: null,
            from_location_name: '',
            to_location: 1,
            to_location_name: 'Main Warehouse',
            movement_type: 'purchase' as const,
            movement_date: '2024-01-01',
            quantity: '50.00',
            unit_cost: '5.00',
            reference_number: 'PO-001',
            notes: 'Initial stock',
            batch_number: 'BATCH-001',
            serial_number: '',
            expiry_date: null,
            created_by_name: 'John Doe',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockInventoryService.getItemMovements.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useItemMovements(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInventoryService.getItemMovements).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle empty movements gracefully', async () => {
      const mockResponse = {
        count: 0,
        next: null,
        previous: null,
        results: [],
      };

      mockInventoryService.getItemMovements.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useItemMovements(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.data?.results).toHaveLength(0);
    });

    it('should not fetch when itemId is not provided', () => {
      renderHook(() => useItemMovements(0), {
        wrapper: createWrapper(),
      });

      expect(mockInventoryService.getItemMovements).not.toHaveBeenCalled();
    });
  });

  describe('useCreateStockAdjustment', () => {
    it('should create stock adjustment successfully', async () => {
      const mockRequest = {
        requested_by: 1,
        item: 1,
        location: 1,
        adjustment_type: 'increase' as const,
        quantity: '10.00',
        unit_cost: '5.00',
        reason: 'Stock count adjustment',
        notes: 'Cycle count revealed discrepancy',
      };

      const mockResponse = {
        id: 1,
        request_number: 'ADJ-001',
        requested_by: 1,
        requested_by_name: 'John Doe',
        item: 1,
        item_name: 'Test Item',
        item_sku: 'TEST-001',
        location: 1,
        location_name: 'Main Warehouse',
        adjustment_type: 'increase' as const,
        quantity: '10.00',
        unit_cost: '5.00',
        estimated_cost: '50.00',
        reason: 'Stock count adjustment',
        notes: 'Cycle count revealed discrepancy',
        status: 'pending' as const,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        approval_notes: '',
        stock_movement: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockInventoryService.createStockAdjustment.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCreateStockAdjustment(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate(mockRequest);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInventoryService.createStockAdjustment).toHaveBeenCalledWith(mockRequest);
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle stock adjustment creation errors', async () => {
      const mockRequest = {
        requested_by: 1,
        item: 1,
        location: 1,
        adjustment_type: 'increase' as const,
        quantity: '10.00',
        reason: 'Test adjustment',
      };

      const mockError = new Error('Validation failed');
      mockInventoryService.createStockAdjustment.mockRejectedValue(mockError);

      const { result } = renderHook(() => useCreateStockAdjustment(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate(mockRequest);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });
  });

  describe('useCreateStockTransfer', () => {
    it('should create stock transfer successfully', async () => {
      const mockRequest = {
        requested_by: 1,
        item: 1,
        from_location: 1,
        to_location: 2,
        quantity: '5.00',
        unit_cost: '10.00',
        reason: 'Restock branch location',
        notes: 'Transfer to branch warehouse',
        reference_number: 'TRF-001',
      };

      const mockResponse = {
        id: 1,
        request_number: 'TRF-001',
        requested_by: 1,
        requested_by_name: 'John Doe',
        item: 1,
        item_name: 'Test Item',
        item_sku: 'TEST-001',
        from_location: 1,
        from_location_name: 'Main Warehouse',
        to_location: 2,
        to_location_name: 'Branch Warehouse',
        quantity: '5.00',
        unit_cost: '10.00',
        estimated_cost: '50.00',
        reason: 'Restock branch location',
        notes: 'Transfer to branch warehouse',
        reference_number: 'TRF-001',
        status: 'pending' as const,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
        approval_notes: '',
        stock_movement: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockInventoryService.createStockTransfer.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCreateStockTransfer(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate(mockRequest);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInventoryService.createStockTransfer).toHaveBeenCalledWith(mockRequest);
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle stock transfer creation errors', async () => {
      const mockRequest = {
        requested_by: 1,
        item: 1,
        from_location: 1,
        to_location: 2,
        quantity: '5.00',
        reason: 'Test transfer',
      };

      const mockError = new Error('Invalid location');
      mockInventoryService.createStockTransfer.mockRejectedValue(mockError);

      const { result } = renderHook(() => useCreateStockTransfer(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate(mockRequest);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });

    it('should validate that from_location and to_location are different', async () => {
      const mockRequest = {
        requested_by: 1,
        item: 1,
        from_location: 1,
        to_location: 1, // Same as from_location
        quantity: '5.00',
        reason: 'Test transfer',
      };

      const mockError = new Error('From location and to location must be different');
      mockInventoryService.createStockTransfer.mockRejectedValue(mockError);

      const { result } = renderHook(() => useCreateStockTransfer(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate(mockRequest);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });
  });
});
