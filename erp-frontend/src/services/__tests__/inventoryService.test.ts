// src/services/__tests__/inventoryService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inventoryService } from '../inventoryService';
import { api } from '../api';

// Mock the API module
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockApi = vi.mocked(api);

describe('InventoryService - Item Detail API Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getItemStockLevels', () => {
    const mockStockLevel = {
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
    };

    it('should fetch item stock levels successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockStockLevel],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await inventoryService.getItemStockLevels(1);

      expect(mockApi.get).toHaveBeenCalledWith('/inventory/items/1/stock/', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch item stock levels with pagination params', async () => {
      const mockResponse = {
        count: 2,
        next: 'http://api.example.com/inventory/items/1/stock/?page=2',
        previous: null,
        results: [mockStockLevel],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const params = { page: 1, page_size: 10, ordering: '-created_at' };
      const result = await inventoryService.getItemStockLevels(1, params);

      expect(mockApi.get).toHaveBeenCalledWith('/inventory/items/1/stock/', { params });
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty response gracefully', async () => {
      mockApi.get.mockResolvedValue(null);

      const result = await inventoryService.getItemStockLevels(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should handle malformed response gracefully', async () => {
      mockApi.get.mockResolvedValue({ invalid: 'response' });

      const result = await inventoryService.getItemStockLevels(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should handle 404 errors by returning empty results', async () => {
      mockApi.get.mockRejectedValue(new Error('HTTP 404'));

      const result = await inventoryService.getItemStockLevels(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should re-throw non-404 errors', async () => {
      const error = new Error('HTTP 500');
      mockApi.get.mockRejectedValue(error);

      await expect(inventoryService.getItemStockLevels(1)).rejects.toThrow('HTTP 500');
    });
  });

  describe('getItemMovements', () => {
    const mockMovement = {
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
    };

    it('should fetch item movements successfully', async () => {
      const mockResponse = {
        count: 1,
        next: null,
        previous: null,
        results: [mockMovement],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await inventoryService.getItemMovements(1);

      expect(mockApi.get).toHaveBeenCalledWith('/inventory/items/1/movements/', {
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch item movements with pagination params', async () => {
      const mockResponse = {
        count: 5,
        next: 'http://api.example.com/inventory/items/1/movements/?page=2',
        previous: null,
        results: [mockMovement],
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const params = { page: 1, page_size: 10, ordering: '-movement_date' };
      const result = await inventoryService.getItemMovements(1, params);

      expect(mockApi.get).toHaveBeenCalledWith('/inventory/items/1/movements/', { params });
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty response gracefully', async () => {
      mockApi.get.mockResolvedValue(null);

      const result = await inventoryService.getItemMovements(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should handle malformed response gracefully', async () => {
      mockApi.get.mockResolvedValue({ invalid: 'response' });

      const result = await inventoryService.getItemMovements(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should handle 404 errors by returning empty results', async () => {
      mockApi.get.mockRejectedValue(new Error('HTTP 404'));

      const result = await inventoryService.getItemMovements(1);

      expect(result).toEqual({
        count: 0,
        next: null,
        previous: null,
        results: [],
      });
    });

    it('should re-throw non-404 errors', async () => {
      const error = new Error('HTTP 500');
      mockApi.get.mockRejectedValue(error);

      await expect(inventoryService.getItemMovements(1)).rejects.toThrow('HTTP 500');
    });
  });
});
